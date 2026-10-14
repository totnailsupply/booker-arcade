import Phaser from 'phaser';
import { DEPTH, FX, WORLD, GAME } from '../core/Constants.js';
import { FXT } from './textures.js';

// =============================================================================
// Ambience — subtle, cheap per-level atmosphere (Levels 2-6). Visual only.
//   2 docks       far gulls; sea spray and glints over the water pits
//   3 rooftops    twinkling stars; slow drifting clouds
//   4 factory     embers, spark spurts and a heat glow over the molten pits
//   5 market      floating lantern bokeh
//   6 steakhouse  smoke and embers from the grills and coal pits; drifting embers
// World emitters only run while their source is on screen; every emitter has a
// maxAliveParticles cap (see FX.AMB_* in Constants.js).
// =============================================================================

const G = WORLD.GROUND_Y;
const MARGIN = 48;

/** A random point over whichever of `spans` ({ x0, x1, y }) are on screen. */
class SpanSource {
  constructor(spans, yJitter = 0) {
    this.spans = spans;
    this.visible = [];
    this.yJitter = yJitter;
  }

  refresh(left, right) {
    this.visible.length = 0;
    for (const s of this.spans) if (s.x1 > left && s.x0 < right) this.visible.push(s);
    return this.visible.length > 0;
  }

  getRandomPoint(point) {
    const s = this.visible.length ? this.visible[(Math.random() * this.visible.length) | 0] : this.spans[0];
    point.x = s.x0 + Math.random() * (s.x1 - s.x0);
    point.y = s.y - Math.random() * this.yJitter;
    return point;
  }
}

export class Ambience {
  /** @param {import('../systems/Effects.js').Effects} fx */
  constructor(fx) {
    this.fx = fx;
    this.scene = fx.scene;
    this.level = fx.scene.entry?.number || 0;
    this.sources = [];       // { src, emitters[] } toggled by visibility
    this.emitters = [];
    this.screen = [];        // screen-space drifters { img, x, y, vx, vy, k (parallax), ... }
    this.t = 0;
    const model = fx.scene.model;
    this.gaps = model ? model.gaps : [];
    this.hazards = (fx.scene.level?.hazards || []);
    const build = {
      2: () => this.buildDocks(),
      3: () => this.buildRooftops(),
      4: () => this.buildFactory(),
      5: () => this.buildMarket(),
      6: () => this.buildSteakhouse(),
    }[this.level];
    if (build) build();
  }

  // --- helpers ------------------------------------------------------------------

  pitSpans(inset = 2) {
    return this.gaps.map(g => ({ x0: g.x + inset, x1: g.x + g.width - inset, y: G + 2 }));
  }

  hazardSpans(type, halfW, yOff) {
    return this.hazards.filter(h => h.type === type)
      .map(h => ({ x0: h.x - halfW, x1: h.x + halfW, y: G - (h.y || 0) - yOff }));
  }

  /** World emitter fed by a SpanSource; runs only while a span is on screen. */
  spanEmitter(spans, texture, config, depth, yJitter = 0) {
    if (!spans.length) return null;
    const src = new SpanSource(spans, yJitter);
    const e = this.scene.add.particles(0, 0, texture, {
      ...config,
      emitting: false,
      emitZone: { type: 'random', source: src },
    }).setDepth(depth);
    this.sources.push({ src, emitters: [e], on: false });
    this.emitters.push(e);
    return e;
  }

  /** Screen-space drifting image with its own parallax factor. */
  drifter(texture, frame, x, y, opts) {
    const img = this.scene.add.image(x, y, texture, frame).setScrollFactor(0).setDepth(opts.depth);
    if (opts.tint !== undefined) img.setTint(opts.tint);
    if (opts.blend) img.setBlendMode(opts.blend);
    img.setAlpha(opts.alpha ?? 1).setScale(opts.scale ?? 1);
    const d = { img, x, y, a0: img.alpha, vx: opts.vx || 0, vy: opts.vy || 0, k: opts.k || 0, wrapY: opts.wrapY, ...opts.extra };
    this.screen.push(d);
    return d;
  }

  // --- levels ---------------------------------------------------------------------

  buildDocks() {
    // Sea spray: droplets hop out of the water and fall back
    this.spanEmitter(this.pitSpans(), FXT.EMBER, {
      frequency: FX.AMB_SPRAY_EVERY_MS,
      quantity: { min: 1, max: 2 },
      speedY: { min: -110, max: -45 },
      speedX: { min: -28, max: 28 },
      gravityY: 300,
      lifespan: 560,
      scale: { start: 1.4, end: 0.6 },
      alpha: { start: 0.9, end: 0.2 },
      tint: [0xffffff, 0xcfe8ff, 0x9fd0f0],
      maxAliveParticles: FX.AMB_SPRAY_MAX,
    }, DEPTH.PIT + 0.5);
    // Glints on the water
    this.spanEmitter(this.pitSpans(4), FXT.STAR, {
      frequency: 260,
      lifespan: 420,
      scale: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.7 },
      tint: 0xfff4d0,
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 4,
    }, DEPTH.PIT + 0.5, -10);
    // Far gulls in the sunset sky
    for (let i = 0; i < FX.AMB_GULLS; i++) {
      const d = this.drifter(FXT.GULL, 'up', 60 + i * 150 + Math.random() * 60, 40 + Math.random() * 46, {
        depth: DEPTH.BG_FAR + 5, tint: 0x3b2433, alpha: 0.75, vx: -(5 + Math.random() * 6), k: 0.04,
        extra: { flapMs: Math.random() * 400, bobT: Math.random() * 6 },
      });
      d.gull = true;
    }
  }

  buildRooftops() {
    // Twinkling stars in the sky band
    for (let i = 0; i < FX.AMB_STARS; i++) {
      const x = Math.random() * GAME.WIDTH;
      const y = 26 + Math.random() * 90;
      const big = Math.random() < 0.25;
      const img = this.scene.add.image(x, y, big ? FXT.STAR : FXT.EMBER).setScrollFactor(0)
        .setDepth(DEPTH.BG_FAR + 4).setScale(big ? 0.6 : 0.5).setTint(0xfff6d8).setAlpha(0.2);
      this.scene.tweens.add({
        targets: img,
        alpha: { from: 0.15, to: big ? 0.95 : 0.8 },
        duration: 700 + Math.random() * 1600,
        delay: Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.screen.push({ img, x, y, vx: 0, vy: 0, k: 0.01 });
    }
    // Slow clouds drifting across the moon-lit sky
    for (let i = 0; i < FX.AMB_CLOUDS; i++) {
      this.drifter(FXT.CLOUD, undefined, 80 + i * 210, 50 + i * 26, {
        depth: DEPTH.BG_FAR + 6, tint: 0x8a92c8, alpha: 0.22, scale: 1 + i * 0.3, vx: -(3 + i * 2), k: 0.05,
      });
    }
  }

  buildFactory() {
    const pits = this.pitSpans();
    // Embers rising from the molten pits
    this.spanEmitter(pits, FXT.EMBER, {
      frequency: FX.AMB_EMBER_EVERY_MS,
      speedY: { min: -90, max: -40 },
      speedX: { min: -12, max: 12 },
      accelerationX: { min: -24, max: 24 },
      lifespan: { min: 900, max: 1600 },
      scale: { start: 1.5, end: 0.5 },
      alpha: { start: 1, end: 0 },
      tint: [0xffe08a, 0xff9f43, 0xff6b3a],
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: FX.AMB_EMBER_MAX,
    }, DEPTH.PIT + 0.5);
    // Occasional spurts of sparks out of the lava
    this.spanEmitter(pits, FXT.EMBER, {
      frequency: FX.AMB_SPURT_EVERY_MS,
      quantity: 4,
      speedY: { min: -150, max: -80 },
      speedX: { min: -40, max: 40 },
      gravityY: 360,
      lifespan: 600,
      scale: { start: 1, end: 0.4 },
      tint: [0xffffff, 0xffe08a, 0xff9f43],
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 12,
    }, DEPTH.PIT + 0.5);
    // Heat glow over each pit
    this.heat = this.gaps.map(g => this.scene.add.image(g.x + g.width / 2, G - 2, FXT.SOFT)
      .setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4)
      .setDisplaySize(g.width + 36, 60).setDepth(DEPTH.PIT + 0.4));
    if (this.heat.length) {
      this.scene.tweens.add({
        targets: this.heat, alpha: { from: 0.3, to: 0.55 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  buildMarket() {
    // Out-of-focus lantern glows (bokeh) drifting in front of the stalls
    const colors = FX.AMB_BOKEH_COLORS;
    for (let i = 0; i < FX.AMB_BOKEH; i++) {
      const x = Math.random() * (GAME.WIDTH + 80) - 40;
      const y = 90 + Math.random() * 120;
      const size = 10 + Math.random() * 16;
      const d = this.drifter(FXT.SOFT, undefined, x, y, {
        depth: DEPTH.BG_NEAR + 1, tint: colors[i % colors.length], blend: Phaser.BlendModes.ADD,
        alpha: 0.3 + Math.random() * 0.2, scale: size / 16,
        vx: (Math.random() - 0.5) * 6, vy: -(2 + Math.random() * 5), k: 0.15 + Math.random() * 0.25, wrapY: [70, 230],
      });
      this.scene.tweens.add({
        targets: d.img, alpha: d.img.alpha * 0.45, duration: 1200 + Math.random() * 1800, yoyo: true, repeat: -1,
        delay: Math.random() * 1000, ease: 'Sine.easeInOut',
      });
    }
    // A few paper sky lanterns rising far away, behind the skyline
    for (let i = 0; i < FX.AMB_SKY_LANTERNS; i++) {
      const x = 40 + i * (GAME.WIDTH / FX.AMB_SKY_LANTERNS) + Math.random() * 60;
      const y = 120 + Math.random() * 100;
      const opts = { vx: -(1 + Math.random() * 2), vy: -(3 + Math.random() * 3), k: 0.03, wrapY: [20, 200] };
      const glow = this.drifter(FXT.SOFT, undefined, x, y, {
        ...opts, depth: DEPTH.BG_FAR + 5, tint: 0xff9a3c, blend: Phaser.BlendModes.ADD, alpha: 0.4, scale: 0.7,
      });
      const body = this.drifter(FXT.EMBER, undefined, x, y, {
        ...opts, depth: DEPTH.BG_FAR + 5, tint: 0xffc46b, scale: 1.5,
      });
      body.vx = glow.vx;
      body.vy = glow.vy;
      body.flick = Math.random() * 6;
      glow.flick = body.flick;
    }
  }

  buildSteakhouse() {
    // Grill smoke: soft grey puffs that rise, widen and fade
    const grills = this.hazardSpans('grill', 10, 22);
    this.spanEmitter(grills, FXT.SOFT, {
      frequency: FX.AMB_SMOKE_EVERY_MS,
      speedY: { min: -40, max: -22 },
      speedX: { min: -10, max: 6 },
      accelerationX: -6,
      lifespan: { min: 1100, max: 1600 },
      scale: { start: 0.5, end: 1.9 },
      alpha: { start: 0.32, end: 0 },
      tint: [0x8c7f7a, 0x6e6462, 0xa69b94],
      maxAliveParticles: FX.AMB_SMOKE_MAX,
    }, DEPTH.OBSTACLE + 0.5);
    // Embers from grills and coal pits
    this.spanEmitter([...grills.map(s => ({ ...s, y: s.y + 8 })), ...this.pitSpans()], FXT.EMBER, {
      frequency: FX.AMB_EMBER_EVERY_MS,
      speedY: { min: -60, max: -25 },
      speedX: { min: -14, max: 10 },
      accelerationX: { min: -16, max: 16 },
      lifespan: { min: 800, max: 1400 },
      scale: { start: 1.4, end: 0.5 },
      alpha: { start: 1, end: 0 },
      tint: [0xffe08a, 0xff9f43, 0xff5a2a],
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: FX.AMB_EMBER_MAX,
    }, DEPTH.OBSTACLE + 0.5);
    // A few embers drifting across the whole screen (screen space)
    for (let i = 0; i < FX.AMB_DRIFT_EMBERS; i++) {
      this.drifter(FXT.EMBER, undefined, Math.random() * GAME.WIDTH, 60 + Math.random() * 170, {
        depth: DEPTH.BG_NEAR + 1, tint: i % 2 ? 0xffb347 : 0xff7a3a, blend: Phaser.BlendModes.ADD,
        alpha: 0.75, scale: 0.5 + Math.random() * 0.5, vx: -(4 + Math.random() * 8), vy: -(6 + Math.random() * 10),
        k: 0.35 + Math.random() * 0.3, wrapY: [50, 236], extra: { flick: Math.random() * 6 },
      });
    }
  }

  // --- per frame (scene UPDATE) --------------------------------------------------

  update(delta) {
    if (!this.level) return;
    this.t += delta;
    const cam = this.scene.cameras.main;
    const sx = cam.scrollX;
    const left = sx - MARGIN;
    const right = sx + GAME.WIDTH + MARGIN;
    for (const s of this.sources) {
      const on = s.src.refresh(left, right);
      if (on !== s.on) {
        s.on = on;
        for (const e of s.emitters) {
          if (on) e.start();
          else e.stop();
        }
      }
    }
    const dts = delta / 1000;
    const W = GAME.WIDTH + 80;
    for (const d of this.screen) {
      d.x += d.vx * dts;
      d.y += d.vy * dts;
      if (d.wrapY && d.y < d.wrapY[0]) d.y = d.wrapY[1];
      // parallax + wrap across the screen width (40 px margins)
      let x = (d.x - sx * d.k) % W;
      if (x < 0) x += W;
      d.img.x = Math.round(x - 40);
      d.img.y = Math.round(d.y + (d.gull ? Math.sin(this.t / 900 + d.bobT) * 3 : 0));
      if (d.gull) {
        d.flapMs += delta;
        d.img.setFrame(Math.floor(d.flapMs / 260) % 2 ? 'flat' : 'up');
      }
      if (d.flick !== undefined) d.img.alpha = d.a0 * (0.55 + 0.45 * Math.abs(Math.sin(this.t / 300 + d.flick)));
    }
  }

  destroy() {}
}
