// =============================================================================
// craps/dice.js — code-drawn pixel dice and the throw animation.
//
//   makeDiceTextures(scene)     'craps-die-1'..'craps-die-6' (16x16, NEAREST) + 'craps-die-shadow'
//   const rig = new DiceRig(scene, { depth })
//   await rig.fetch()           dice slide from the stickman to Soba's paw
//   await rig.throw([a, b], { onWall })   arc, tumble, bounce off the back wall, land on a/b
//   rig.home()                  the stick pulls the dice back to Booker
//
// The OUTCOME comes from the caller (logic + this.rng) before the throw; the
// animation only lands on it. Face flicker and paths use Math.random (visual only).
// =============================================================================

import Phaser from 'phaser';
import { canvasTexture } from '../../core/Textures.js';
import { playSfx, panOfX } from '../../audio/sfx.js';
import { DICE, WALL_Y } from './config.js';

const PIPS = {
  1: [[7, 7]],
  2: [[3, 3], [11, 11]],
  3: [[3, 3], [7, 7], [11, 11]],
  4: [[3, 3], [11, 3], [3, 11], [11, 11]],
  5: [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]],
  6: [[3, 3], [11, 3], [3, 7], [11, 7], [3, 11], [11, 11]],
};

/** Red translucent pixel die faces in the style of icon-craps. */
export function makeDiceTextures(scene) {
  const S = DICE.TEX;
  for (let f = 1; f <= 6; f++) {
    const key = `craps-die-${f}`;
    if (scene.textures.exists(key)) continue;
    canvasTexture(scene, key, S, S, (ctx) => {
      const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      // outline with clipped corners
      px(1, 0, '#3a0907', S - 2, 1); px(1, S - 1, '#3a0907', S - 2, 1);
      px(0, 1, '#3a0907', 1, S - 2); px(S - 1, 1, '#3a0907', 1, S - 2);
      // body
      px(1, 1, '#c8281f', S - 2, S - 2);
      // translucent glow: lighter core
      px(3, 3, '#dc3b2c', S - 6, S - 6);
      px(5, 5, '#e44b38', S - 10, S - 10);
      // light edge top/left, dark edge bottom/right
      px(1, 1, '#ff8a72', S - 3, 1); px(1, 2, '#ff8a72', 1, S - 4);
      px(2, 2, '#f2604a', S - 5, 1);
      px(2, S - 2, '#8a1410', S - 3, 1); px(S - 2, 2, '#8a1410', 1, S - 3);
      px(1, S - 2, '#a01a14', 1, 1);
      // pips (2x2 white with a pink drop shadow pixel)
      for (const [x, y] of PIPS[f]) {
        px(x + 1, y + 2, '#f3a194', 1, 1);
        px(x + 2, y + 1, '#f3a194', 1, 1);
        px(x + 2, y + 2, '#f3a194', 1, 1);
        px(x, y, '#ffffff', 2, 2);
      }
      // specular pixel
      px(2, 2, '#ffd6cc', 1, 1);
    });
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if (!scene.textures.exists('craps-die-shadow')) {
    canvasTexture(scene, 'craps-die-shadow', 64, 32, (ctx) => {
      const g = ctx.createRadialGradient(32, 16, 2, 32, 16, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(32, 16, 30, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const outQuad = (t) => 1 - (1 - t) * (1 - t);
const outCubic = (t) => 1 - (1 - t) ** 3;


export class DiceRig {
  constructor(scene, { depth = 300, faces = [6, 1] } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.size = DICE.TEX * DICE.SCALE;
    this.dice = [0, 1].map((i) => {
      const h = DICE.HOME[i];
      const shadow = scene.add.image(h.x + 4, h.y + 8, 'craps-die-shadow').setDepth(depth).setAlpha(0.8).setScale(0.8);
      const img = scene.add.image(h.x, h.y, `craps-die-${faces[i]}`).setDepth(depth + 1).setScale(DICE.SCALE);
      img.angle = i ? 8 : -6;
      return { img, shadow, gx: h.x, gy: h.y, z: 0, face: faces[i] };
    });
    this.where = 'home';
  }

  place(d, gx, gy, z) {
    d.gx = gx; d.gy = gy; d.z = z;
    d.img.setPosition(gx, gy - z);
    const k = Math.max(0.45, 1 - z / 260);
    d.shadow.setPosition(gx + 4 + z * 0.12, gy + 10).setScale(0.8 * k).setAlpha(0.8 * k);
  }

  setFace(d, f) {
    d.face = f;
    d.img.setTexture(`craps-die-${f}`);
  }

  stop() {
    for (const d of this.dice) {
      this.scene.tweens.killTweensOf(d.img);
      this.scene.tweens.killTweensOf(d.shadow);
    }
    this.counter?.stop();
    this.counter = null;
  }

  counterTween(duration, onUpdate) {
    return new Promise((resolve) => {
      this.counter = this.scene.tweens.addCounter({
        from: 0, to: 1, duration, ease: 'Linear',
        onUpdate: (tw) => onUpdate(tw.getValue()),
        onComplete: () => { this.counter = null; resolve(); },
      });
    });
  }

  /** Slide the dice from wherever they are to Soba's paw. */
  async fetch() {
    this.stop();
    const from = this.dice.map(d => ({ x: d.gx, y: d.gy }));
    const to = [{ x: DICE.START.x, y: DICE.START.y }, { x: DICE.START.x + 22, y: DICE.START.y + 14 }];
    const a0 = this.dice.map(d => d.img.angle);
    await this.counterTween(DICE.FETCH_MS, (u) => {
      const e = outCubic(u);
      this.dice.forEach((d, i) => {
        this.place(d, lerp(from[i].x, to[i].x, e), lerp(from[i].y, to[i].y, e), 18 * Math.sin(Math.PI * u));
        d.img.angle = lerp(a0[i], 0, e);
        d.img.setScale(DICE.SCALE * lerp(1, 0.85, e));
      });
    });
    this.where = 'soba';
  }

  /**
   * Throw and land on `faces` ([a, b]). onWall(x, y) fires when the dice hit the back wall.
   * Resolves when both dice are at rest showing the result.
   */
  async throw(faces, { onWall } = {}) {
    const S = DICE.SCALE;
    const start = this.dice.map(d => ({ x: d.gx, y: d.gy }));
    const wx = rnd(DICE.WALL_X[0], DICE.WALL_X[1]);
    const wall = [{ x: wx, y: WALL_Y + 4 }, { x: wx + rnd(36, 60), y: WALL_Y + 14 }];
    const rx = rnd(DICE.REST.x[0], DICE.REST.x[1]);
    const ry = rnd(DICE.REST.y[0], DICE.REST.y[1]);
    const rest = [{ x: rx, y: ry }, { x: rx + rnd(58, 76), y: ry + rnd(-16, 16) }];
    const spinA = this.dice.map(() => (Math.random() < 0.5 ? -1 : 1) * rnd(560, 820));
    const spinB = this.dice.map(() => (Math.random() < 0.5 ? -1 : 1) * rnd(160, 300));
    const tumble = this.dice.map(() => rnd(3, 5));
    const restAngle = this.dice.map(() => rnd(-14, 14));
    const steps = this.dice.map(() => -1);
    playSfx('dice', { count: 2, pan: -0.4 });

    // A: the throw — arc from the paw to the back wall, tumbling
    await this.counterTween(DICE.THROW_MS, (u) => {
      const e = outQuad(u);
      this.dice.forEach((d, i) => {
        const z = 4 * DICE.ARC * u * (1 - u) + 10 * (1 - u);
        this.place(d, lerp(start[i].x, wall[i].x, e), lerp(start[i].y, wall[i].y, e), z);
        d.img.angle = spinA[i] * u;
        const sq = 0.72 + 0.28 * Math.abs(Math.cos(u * Math.PI * tumble[i]));
        d.img.setScale(S * (0.85 + 0.35 * Math.sin(Math.PI * u)) * sq, S * (0.85 + 0.35 * Math.sin(Math.PI * u)));
        const st = Math.floor(u * 10);
        if (st !== steps[i]) { steps[i] = st; this.setFace(d, 1 + Math.floor(Math.random() * 6)); }
      });
    });
    playSfx('diceLand', { pan: panOfX(wall[0].x) });
    onWall?.(wall[0].x + 20, WALL_Y - 6);

    // B: bounce back off the wall, slowing down; the result face shows near the end
    steps.fill(-1);
    await this.counterTween(DICE.BOUNCE_MS, (u) => {
      const e = outCubic(u);
      this.dice.forEach((d, i) => {
        const z = 4 * 34 * u * (1 - u) * (1 - u);
        this.place(d, lerp(wall[i].x, rest[i].x, e), lerp(wall[i].y, rest[i].y, e), z);
        d.img.angle = spinA[i] + spinB[i] * e;
        const sq = 0.82 + 0.18 * Math.abs(Math.cos(u * Math.PI * 2));
        d.img.setScale(S * sq, S);
        if (u > 0.72) {
          if (d.face !== faces[i]) this.setFace(d, faces[i]);
        } else {
          const st = Math.floor(u * 5);
          if (st !== steps[i]) { steps[i] = st; this.setFace(d, 1 + Math.floor(Math.random() * 6)); }
        }
      });
    });

    // C: settle — snap to a slight tilt and squash
    this.dice.forEach((d, i) => { this.setFace(d, faces[i]); });
    const fromAngle = this.dice.map(d => d.img.angle);
    // shortest turn to the rest tilt
    const target = this.dice.map((d, i) => {
      let t = restAngle[i];
      while (t - fromAngle[i] > 180) t -= 360;
      while (t - fromAngle[i] < -180) t += 360;
      return t;
    });
    playSfx('diceLand', { gain: 0.45, pan: panOfX(rest[0].x) });
    await this.counterTween(DICE.SETTLE_MS, (u) => {
      const e = outCubic(u);
      this.dice.forEach((d, i) => {
        d.img.angle = lerp(fromAngle[i], target[i], e);
        const pop = 1 + 0.16 * Math.sin(Math.PI * u);
        d.img.setScale(S * pop, S * (2 - pop));
        this.place(d, d.gx, d.gy, 0);
      });
    });
    this.dice.forEach(d => d.img.setScale(S));
    this.where = 'table';
  }

  /** Booker's stick pulls the dice back to his spot on the rail. */
  home() {
    if (this.where === 'home') return Promise.resolve();
    this.stop();
    const from = this.dice.map(d => ({ x: d.gx, y: d.gy }));
    const a0 = this.dice.map(d => d.img.angle);
    this.where = 'home';
    return this.counterTween(DICE.HOME_MS, (u) => {
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      this.dice.forEach((d, i) => {
        const h = DICE.HOME[i];
        this.place(d, lerp(from[i].x, h.x, e), lerp(from[i].y, h.y, e), 0);
        d.img.angle = lerp(a0[i], i ? 8 : -6, e);
      });
    });
  }

  /** The two dice images (for depth/visibility tweaks). */
  get images() { return this.dice.map(d => d.img); }
}
