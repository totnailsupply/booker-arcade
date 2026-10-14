// =============================================================================
// Finale — the roof landing (PLAN 7): the bell rings (Bell.ring), the camera
// zooms in on the bell, 0.6 s of slow motion, the HUD fades, fireworks burst in
// the night sky over the roof while Soba celebrates, then Results (ClimbScene
// owns that timer: FINALE.RESULTS_AFTER_MS of real time, skippable).
//
// The zoom (2x, an integer so pixels stay square) moves the camera's zoom
// origin (no scroll change): horizontally to the bell's screen x, vertically to
// the point that leaves the bell at FINALE.BELL_SCREEN_Y. ClimbScene resets
// zoom/origin on create, so a retry always starts at zoom 1.
// =============================================================================

import Phaser from 'phaser';
import { FINALE, DEPTH, GAME } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { FXK } from '../core/VisualBake.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class Finale {
  constructor(scene, effects, hud, bell) {
    this.scene = scene;
    this.effects = effects;
    this.hud = hud;
    this.bell = bell;
    this.running = false;
    this.t = 0;
    this.fired = 0;
    this.rockets = [];
    this.sparks = scene.add.particles(0, 0, FXK.SPARK, {
      emitting: false, maxAliveParticles: FINALE.FIREWORKS * FINALE.FIREWORK_SPARKS,
      speed: { min: 30, max: 135 }, angle: { min: 0, max: 360 }, gravityY: 55,
      lifespan: { min: 700, max: 1150 }, scale: { start: 1.2, end: 0.4 }, alpha: { values: [1, 1, 0.6, 0] },
    }).setDepth(DEPTH.BELL - 2);
    this.trail = scene.add.particles(0, 0, FXK.SPECK, {
      emitting: false, maxAliveParticles: 80, speedY: { min: 4, max: 16 },
      lifespan: 280, alpha: { start: 0.9, end: 0 }, tint: 0xffe8b0,
    }).setDepth(DEPTH.BELL - 2);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t = 0;
    const cam = this.scene.cameras.main;
    const bx = this.bell.x - cam.scrollX;
    const by = this.bell.cy - cam.scrollY;
    // Zoom about a fixed screen point o: the bell ends at o + (by - o) * z.
    // Pick o so it ends at BELL_SCREEN_Y (sky above for the fireworks).
    const z = FINALE.ZOOM;
    const oy = z > 1 ? (by * z - FINALE.BELL_SCREEN_Y) / (z - 1) : by;
    cam.setOrigin(Phaser.Math.Clamp(bx / GAME.WIDTH, 0, 1), Phaser.Math.Clamp(oy / GAME.HEIGHT, 0, 1));
    cam.zoomTo(FINALE.ZOOM, FINALE.ZOOM_MS, 'Cubic.easeOut');
    this.effects.slowmo(FINALE.SLOWMO_SCALE, FINALE.SLOWMO_MS);
    this.hud?.fadeOut(FINALE.HUD_FADE_MS);
    eventBus.emit(Events.FX_FINISH_ZOOM, { x: this.bell.x, y: Math.round(this.bell.cy), zoom: FINALE.ZOOM });
  }

  /** Real-time dt (s). */
  update(dt) {
    if (!this.running) return;
    this.t += dt * 1000;
    while (this.fired < FINALE.FIREWORKS && this.t >= FINALE.FIREWORK_FIRST_MS + this.fired * FINALE.FIREWORK_EVERY_MS) {
      this.launch(this.fired);
      this.fired += 1;
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.ms += dt * 1000;
      const k = Math.min(1, r.ms / FINALE.FIREWORK_RISE_MS);
      const e = 1 - (1 - k) * (1 - k);
      const y = r.y0 + (r.y1 - r.y0) * e;
      this.trail.emitParticleAt(r.x + rand(-0.5, 0.5), y, 1);
      if (k >= 1) {
        this.burst(r);
        this.rockets.splice(i, 1);
      }
    }
  }

  launch(index) {
    const b = this.bell;
    const side = index % 2 ? 1 : -1;
    const x = Math.round(b.x + side * rand(FINALE.FIREWORK_DX[0], FINALE.FIREWORK_DX[1]));
    const y1 = Math.round(b.cy - rand(FINALE.FIREWORK_DY[0], FINALE.FIREWORK_DY[1]));
    this.rockets.push({ index, x, y0: y1 + rand(60, 90), y1, ms: 0 });
  }

  burst(r) {
    const colors = FINALE.FIREWORK_COLORS;
    const color = colors[r.index % colors.length];
    this.sparks.setParticleTint(color);       // a single colour (an array here renders black)
    this.sparks.explode(FINALE.FIREWORK_SPARKS, r.x, r.y1);
    for (let i = 0; i < 10; i++) this.trail.emitParticleAt(r.x + rand(-3, 3), r.y1 + rand(-3, 3), 1);
    const glow = this.scene.add.image(r.x, r.y1, FXK.GLOW).setTint(color).setDepth(DEPTH.BELL - 3)
      .setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0.8);
    this.scene.tweens.add({
      targets: glow, scale: 3, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => glow.destroy(),
    });
    eventBus.emit(Events.FX_FIREWORK, { index: r.index, x: r.x, y: r.y1, color });
  }
}
