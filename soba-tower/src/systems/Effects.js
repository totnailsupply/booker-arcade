import Phaser from 'phaser';
import {
  FX, COLORS, CRUMBLE, DEPTH, UI, BURST, DANGER, SOBA, CROW, TILE, CHIMES, GAME, WORLD,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { FX_TEXTURES } from '../core/Assets.js';
import { FXK } from '../core/VisualBake.js';
import { wrapDelta } from '../core/Kinematics.js';
import { SobaJuice } from './SobaJuice.js';

// =============================================================================
// Effects — game feel (PLAN 7). Purely visual, driven by EventBus; it never
// changes the simulation. Hit-stop and slow motion are applied by ClimbScene
// asking simScale() how much sim time to run this frame (0 = frozen), so the
// whole world (clock, platforms, hazards, Soba) pauses together and the rules
// play out exactly as without them.
//
//   bounce        dust puff at the paws; spring: speed lines (+ SobaJuice stretch)
//   crumble       crack dust + chips; the drop: debris + a dust cloud; idle
//                 crumbles shed a grain now and then (readable at phone size)
//   slider/lift   a small dust puff when an on-screen mover turns around
//   stomp         50 ms hit-stop, white flash on the crow, feathers, small shake, "+50"
//   treat         sparkles, "+25", the biscuit flies to the HUD counter
//   hit           60 ms hit-stop, white flash on Soba, red camera flash, shake,
//                 stars; the tumble spin is SobaJuice's
//   respawn       a dust ring around the cushion
//   near-miss     a hazard passed within a few px: whoosh lines (fx:nearMiss)
//   hazards       pulsing red glow behind falling roof tiles and chimes
//   milestones    fx:milestone every 50 m of max height (the HUD shows it)
//
// TweenManager / Clock time scales survive scene restarts in Phaser, so they
// are reset here on create and on destroy (booker-run gotcha).
// =============================================================================

const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  /**
   * @param {Phaser.Scene} scene ClimbScene
   * @param {import('./ClimbSim.js').ClimbSim} sim
   * @param {object} level
   */
  constructor(scene, sim, level) {
    this.scene = scene;
    this.sim = sim;
    this.soba = sim.soba;
    this.level = level;
    Effects.resetTimeScales(scene);
    this.juice = new SobaJuice(scene, sim.soba, level);

    this.freezeMs = 0;
    this.slow = null;           // { scale, ms, total }
    this.speedLineMs = 0;
    this.speedLineAcc = 0;
    this.flashes = [];          // { target, ms }
    this.turnDir = new Map();   // platform -> last direction sign
    this.crumbT = new Map();    // idle crumble -> seconds to the next grain
    this.near = new Map();      // hazard -> { minGap, cool }
    this.milestone = Infinity;  // armed after the start position is placed
    this.time = 0;

    const cap = BURST.MAX_ALIVE;
    const P = (tex, cfg, depth = DEPTH.FX) => scene.add.particles(0, 0, tex, {
      emitting: false, maxAliveParticles: cap, ...cfg,
    }).setDepth(depth);

    this.dust = P(FXK.DUST, {
      speedX: { min: -46, max: 46 }, speedY: { min: -28, max: -6 }, gravityY: -12,
      lifespan: { min: BURST.DUST_LIFE_MS * 0.65, max: BURST.DUST_LIFE_MS },
      scale: { start: 1, end: 0.4 }, alpha: { start: 0.85, end: 0 }, tint: BURST.DUST_TINT,
    }, DEPTH.SOBA - 1);
    this.ring = P(FXK.DUST, {
      speed: { min: 40, max: 70 }, angle: { min: 0, max: 360 },
      lifespan: 420, scale: { start: 1, end: 0.3 }, alpha: { start: 0.8, end: 0 }, tint: BURST.DUST_TINT,
    }, DEPTH.SOBA - 1);
    this.debris = P(FX_TEXTURES.PIXEL, {
      speed: { min: 20, max: 90 }, angle: { min: 200, max: 340 }, gravityY: 500,
      lifespan: FX.DEBRIS_LIFE_MS, alpha: { start: 1, end: 0 }, tint: COLORS.DEBRIS,
    });
    this.grains = P(FXK.SPECK, {
      speedX: { min: -6, max: 6 }, speedY: { min: 8, max: 26 }, gravityY: 240,
      lifespan: 650, alpha: { start: 0.9, end: 0 }, tint: COLORS.DEBRIS,
    }, DEPTH.PLATFORM - 0.5);
    this.feathers = P(FXK.FEATHER, {
      speed: { min: 30, max: 125 }, angle: { min: 0, max: 360 }, gravityY: 140,
      rotate: { start: 0, end: 540 }, lifespan: { min: 600, max: 950 },
      alpha: { start: 1, end: 0 }, tint: COLORS.FEATHER,
    });
    this.sparkles = P(FXK.SPARK, {
      speed: { min: 20, max: 72 }, angle: { min: 0, max: 360 },
      lifespan: 420, scale: { start: 1, end: 0.3 }, alpha: { start: 1, end: 0 }, tint: [0xffe08a, 0xffffff],
    });
    this.stars = P(FXK.SPARK, {
      speed: { min: 50, max: 120 }, angle: { min: 0, max: 360 },
      lifespan: 480, scale: { start: 1.2, end: 0.4 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xffe08a, 0xff9a9a],
    });
    this.lines = P(FXK.LINE, {
      speed: 0, lifespan: BURST.SPEEDLINE_LIFE_MS, scaleY: { start: 1.2, end: 2 },
      alpha: { start: 0.75, end: 0 }, tint: 0xffffff,
    }, DEPTH.SOBA - 1);
    this.whoosh = P(FXK.LINE, {
      speedX: { min: -110, max: 110 }, speedY: { min: -12, max: 12 }, rotate: 90,
      lifespan: 220, alpha: { start: 0.9, end: 0 }, tint: 0xffffff,
    });
    // Red hurt flash: a capped overlay (never hides the action)
    this.flashRect = scene.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, Phaser.Display.Color.GetColor(...COLORS.HIT_FLASH), 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD - 1).setAlpha(0);
    this.emitters = [this.dust, this.ring, this.debris, this.grains, this.feathers, this.sparkles, this.stars, this.lines, this.whoosh];

    // Pulsing red glow behind roof tiles (while falling) and chimes
    this.glows = [];
    for (const h of sim.hazards.list) {
      if (h.type !== 'tile' && h.type !== 'chimes') continue;
      const img = scene.add.image(0, 0, FXK.GLOW).setDepth(DEPTH.HAZARD - 0.5).setTint(DANGER.GLOW_TINT)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(DANGER.GLOW_SCALE).setVisible(false);
      this.glows.push({ h, img, phase: Math.random() * Math.PI * 2 });
    }

    this.on = [
      [Events.SOBA_BOUNCE, e => this.bounce(e)],
      [Events.CRUMBLE, e => this.crack(e)],
      [Events.CRUMBLE_FALL, e => this.crumble(e)],
      [Events.STOMP, e => this.stomp(e)],
      [Events.TREAT_COLLECTED, e => this.treat(e)],
      [Events.SOBA_FELL, (e) => { if (e.cause === 'hit') this.hit(e); }],
      [Events.SOBA_RESPAWN, e => this.respawn(e)],
      [Events.HEIGHT_CHANGED, e => this.height(e)],
    ];
    for (const [ev, fn] of this.on) eventBus.on(ev, fn);
  }

  static resetTimeScales(scene) {
    scene.tweens.timeScale = 1;
    scene.time.timeScale = 1;
  }

  /** Milestones count from the start position (debug starts don't pop old ones). */
  armMilestones() {
    this.milestone = Math.floor(gameState.maxHeightM / BURST.MILESTONE_M) * BURST.MILESTONE_M;
  }

  // --- time: hit-stop + slow motion ------------------------------------------------

  hitStop(ms, cause) {
    this.freezeMs = Math.max(this.freezeMs, ms);
    eventBus.emit(Events.FX_HIT_STOP, { ms, cause });
  }

  slowmo(scale, ms) {
    this.slow = { scale, ms, total: ms };
    this.scene.tweens.timeScale = scale;
    eventBus.emit(Events.FX_SLOWMO, { scale, ms });
  }

  /**
   * How much sim time to run this frame, as a fraction of the real frame time:
   * 0 while frozen (hit-stop), the slow-motion scale (easing back to 1 over its
   * last third), else 1. Call once per frame with the real dt (s).
   */
  simScale(realDt) {
    const ms = realDt * 1000;
    if (this.freezeMs > 0) {
      this.freezeMs -= ms;
      return 0;
    }
    if (this.slow) {
      const s = this.slow;
      s.ms -= ms;
      if (s.ms <= 0) {
        this.slow = null;
        this.setTimeScale(1);
        eventBus.emit(Events.FX_SLOWMO, { scale: 1, ms: 0 });
        return 1;
      }
      const left = s.ms / s.total;
      const k = left > 1 / 3 ? s.scale : s.scale + (1 - s.scale) * (1 - left * 3);
      this.setTimeScale(k);
      return k;
    }
    return 1;
  }

  setTimeScale(k) {
    this.scene.tweens.timeScale = k;
    for (const e of this.emitters) e.timeScale = k;
  }

  // --- per frame ------------------------------------------------------------------------

  /**
   * @param {number} realDt seconds of real time
   * @param {number} camTop
   */
  update(realDt, camTop) {
    this.time += realDt;
    this.juice.update(realDt);
    const s = this.soba;

    // Spring speed lines trail Soba
    if (this.speedLineMs > 0) {
      this.speedLineMs -= realDt * 1000;
      this.speedLineAcc += realDt * 1000;
      while (this.speedLineAcc >= BURST.SPEEDLINE_EVERY_MS) {
        this.speedLineAcc -= BURST.SPEEDLINE_EVERY_MS;
        for (const side of [-1, 1]) this.lines.emitParticleAt(s.x + side * rand(5, 12), s.y - rand(-2, 18), 1);
      }
    }

    // White flash tints (hit-stop frames)
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.ms -= realDt * 1000;
      if (f.ms <= 0 || !f.target.active) {
        if (f.target.active) f.target.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        this.flashes.splice(i, 1);
      }
    }

    const lo = camTop - 8;
    const hi = camTop + GAME.HEIGHT + 8;
    for (const p of this.sim.spawner.active) {
      if (p.y < lo || p.y > hi) continue;
      if (p.type === 'crumble' && p.state === 'idle') this.idleCrumb(p, realDt);
      else if (p.type === 'slider' || p.type === 'lift') this.turnaround(p);
    }
    this.syncGlows(camTop);
    this.nearMisses(realDt);
  }

  idleCrumb(p, dt) {
    let t = this.crumbT.get(p);
    if (t === undefined) t = rand(0, BURST.IDLE_CRUMB_MAX_S);
    t -= dt;
    if (t <= 0) {
      this.grains.emitParticleAt(p.x + rand(-p.w / 2 + 3, p.w / 2 - 3), p.y + p.h - 2, 1);
      t = rand(BURST.IDLE_CRUMB_MIN_S, BURST.IDLE_CRUMB_MAX_S);
    }
    this.crumbT.set(p, t);
  }

  turnaround(p) {
    const T = p.time;
    const d = p.type === 'slider' ? Math.sign(p.xAt(T) - p.xAt(T - 1 / 60)) : Math.sign(p.yAt(T) - p.yAt(T - 1 / 60));
    if (!d) return;
    const prev = this.turnDir.get(p);
    this.turnDir.set(p, d);
    if (prev === undefined || prev === d) return;
    let x = p.x;
    const y = p.y + p.h - 1;
    if (p.type === 'slider') x += prev * (p.w / 2);
    for (let i = 0; i < BURST.TURN_DUST; i++) this.dust.emitParticleAt(x + rand(-3, 3), y, 1);
    eventBus.emit(Events.FX_PLATFORM_TURN, { type: p.type, x: Math.round(x), y: Math.round(y) });
  }

  syncGlows(camTop) {
    const pulse = (ph) => {
      const [a0, a1] = DANGER.GLOW_ALPHA;
      return a0 + (a1 - a0) * (0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * DANGER.GLOW_HZ + ph));
    };
    for (const g of this.glows) {
      const h = g.h;
      const view = h.view;
      let show = !!view && view.visible;
      if (h.type === 'tile') show = show && h.state === 'falling';
      if (show && (h.y < camTop - 30 || h.y > camTop + GAME.HEIGHT + 30)) show = false;
      g.img.setVisible(show);
      if (!show) continue;
      const y = h.type === 'chimes' ? h.topY + CHIMES.H / 2 : h.y;
      g.img.setPosition(Math.round(h.x), Math.round(y)).setAlpha(pulse(g.phase));
    }
  }

  /** Fires fx:nearMiss when a live hazard's closest approach to Soba was within NEAR_MISS_PX. */
  nearMisses(dt) {
    const s = this.soba;
    const playing = gameState.mode === MODES.PLAYING && !this.sim.lives.invulnerable;
    for (const h of this.sim.hazards.list) {
      let st = this.near.get(h);
      if (st && st.cool > 0) st.cool -= dt;
      if (!playing || !h.live || (h.type === 'tile' && h.state !== 'falling')) {
        if (st) st.minGap = Infinity;
        continue;
      }
      const [hw, hh, cy] = h.type === 'crow' ? [CROW.HURT_W, CROW.HURT_H, h.y]
        : h.type === 'tile' ? [TILE.HURT_W, TILE.HURT_H, h.y] : [CHIMES.HURT_W, CHIMES.HURT_H, h.y];
      const gx = Math.abs(wrapDelta(s.x, h.x)) - (SOBA.BODY_W / 2 + hw / 2);
      const gy = Math.max((cy - hh / 2) - s.y, (s.y - SOBA.BODY_H) - (cy + hh / 2));
      const gap = Math.max(gx, gy);
      if (gap > BURST.NEAR_MISS_PX * 3) {
        if (st) st.minGap = Infinity;
        continue;
      }
      if (!st) {
        st = { minGap: Infinity, cool: 0 };
        this.near.set(h, st);
      }
      if (gap <= 0) { st.minGap = Infinity; st.cool = BURST.NEAR_MISS_COOLDOWN_S; continue; }
      if (gap < st.minGap) { st.minGap = gap; continue; }
      if (st.minGap <= BURST.NEAR_MISS_PX && gap > st.minGap + 2 && st.cool <= 0) {
        st.cool = BURST.NEAR_MISS_COOLDOWN_S;
        const mx = s.x + wrapDelta(s.x, h.x) / 2;
        const my = (s.y - SOBA.CENTER_DY + cy) / 2;
        for (let i = 0; i < 4; i++) this.whoosh.emitParticleAt(mx, my + rand(-4, 4), 1);
        eventBus.emit(Events.FX_NEAR_MISS, { hazard: h.type, x: Math.round(h.x), y: Math.round(cy), gap: Math.round(st.minGap) });
        st.minGap = Infinity;
      }
    }
  }

  // --- events -----------------------------------------------------------------------------

  bounce(e) {
    const s = this.soba;
    if (e.spring) {
      for (let i = 0; i < BURST.DUST_SPRING; i++) this.dust.emitParticleAt(s.x + rand(-8, 8), s.y, 1);
      this.speedLineMs = BURST.SPEEDLINE_MS;
      this.speedLineAcc = BURST.SPEEDLINE_EVERY_MS;
      return;
    }
    if (e.type === 'crow') return;   // the stomp has its own burst
    for (let i = 0; i < BURST.DUST; i++) this.dust.emitParticleAt(s.x + rand(-6, 6), e.y, 1);
  }

  crack({ x, y, w }) {
    for (let i = 0; i < BURST.CRACK_DUST; i++) this.dust.emitParticleAt(x + rand(-w / 2, w / 2), y + 2, 1);
    for (let i = 0; i < 3; i++) this.debris.emitParticleAt(x + rand(-w / 2, w / 2), y + 6, 1);
  }

  crumble({ x, y, w }) {
    for (let i = 0; i < CRUMBLE.DEBRIS; i++) {
      this.debris.emitParticleAt(x - w / 2 + Math.random() * w, y + 2 + Math.random() * 6, 1);
    }
    for (let i = 0; i < BURST.FALL_DUST; i++) this.dust.emitParticleAt(x + rand(-w / 2, w / 2), y + rand(2, 10), 1);
  }

  stomp({ x, y }) {
    this.hitStop(BURST.STOMP_STOP_MS, 'stomp');
    this.feathers.explode(BURST.STOMP_FEATHERS, x, y);
    for (let i = 0; i < 4; i++) this.dust.emitParticleAt(x + rand(-6, 6), y - 4, 1);
    this.scene.cameras.main.shake(BURST.STOMP_SHAKE_MS, BURST.STOMP_SHAKE);
    const crow = this.sim.hazards.list.find(h => h.type === 'crow' && h.state === 'stomped' && Math.abs(h.x - x) < 3);
    if (crow?.view) this.flash(crow.view, BURST.STOMP_STOP_MS + 40);
    this.pop(x + this.popSide(x), y + 4, '+50', COLORS.STOMP_TEXT);
  }

  treat({ x, y }) {
    this.sparkles.explode(BURST.TREAT_SPARKLES, x, y);
    this.pop(x + this.popSide(x), y - 6, '+25', COLORS.TREAT_TEXT);
    // The biscuit flies up to the HUD counter (screen space)
    const cam = this.scene.cameras.main;
    const icon = this.scene.add.image(x - cam.scrollX, y - cam.scrollY, 'treat')
      .setScrollFactor(0).setDepth(DEPTH.HUD + 4);
    this.scene.tweens.add({
      targets: icon,
      x: UI.TREAT_ICON_X,
      y: UI.HUD_MARGIN + 7,
      scale: { from: 1.4, to: 1 },
      duration: BURST.TREAT_FLY_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        icon.destroy();
        eventBus.emit(Events.FX_TREAT_ARRIVE, { treats: gameState.treats, total: gameState.treatsTotal });
      },
    });
  }

  hit() {
    this.hitStop(BURST.HURT_STOP_MS, 'hit');
    const cam = this.scene.cameras.main;
    this.scene.tweens.killTweensOf(this.flashRect);
    this.flashRect.setAlpha(BURST.HIT_FLASH_ALPHA);
    this.scene.tweens.add({ targets: this.flashRect, alpha: 0, duration: BURST.HIT_FLASH_MS, ease: 'Quad.easeIn' });
    cam.shake(FX.HIT_SHAKE_MS, FX.HIT_SHAKE);
    const s = this.soba;
    this.stars.explode(BURST.HURT_STARS, s.x, s.y - SOBA.CENTER_DY - 6);
    if (s.sprite) this.flash(s.sprite, BURST.HURT_STOP_MS + 50);
  }

  respawn({ x, y }) {
    this.ring.explode(BURST.RESPAWN_DUST, x, y + 2);
    this.sparkles.explode(4, x, y - SOBA.CENTER_DY);
  }

  height({ maxHeightM }) {
    const step = BURST.MILESTONE_M;
    const m = Math.floor(maxHeightM / step) * step;
    const top = this.level.finish.y / WORLD.PX_PER_M;
    if (m <= this.milestone || m <= 0 || m >= top) return;
    this.milestone = m;
    eventBus.emit(Events.FX_MILESTONE, { meters: m, heightPx: m * WORLD.PX_PER_M });
  }

  /** Pure-white fill tint for a few frames (hit-stop flash). */
  flash(target, ms) {
    target.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.flashes.push({ target, ms });
  }

  /** Pops sit beside the action (toward the screen centre), never on top of Soba. */
  popSide(x) {
    return (x < GAME.WIDTH / 2 ? 1 : -1) * BURST.POP_DX;
  }

  /** A score number that pops big, settles, drifts up and fades (world space). */
  pop(x, y, text, color) {
    const t = this.scene.add.text(Math.round(x), Math.round(y), text, {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, fontStyle: 'bold',
      color, stroke: COLORS.UI_SHADOW, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.FX + 1).setScale(BURST.POP_SCALE);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - UI.POP_RISE,
      alpha: { from: 1, to: 0 },
      delay: 140,
      duration: UI.POP_MS,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  destroy() {
    for (const [ev, fn] of this.on) eventBus.off(ev, fn);
    this.juice.destroy();
    this.flashes.length = 0;
    Effects.resetTimeScales(this.scene);
  }
}
