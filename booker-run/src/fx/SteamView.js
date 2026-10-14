import Phaser from 'phaser';
import { DEPTH, FX } from '../core/Constants.js';
import { FXT, lerpColor } from './textures.js';

// =============================================================================
// SteamView — what a steam vent looks like. Visual only: LevelWorld owns the
// clock, the hitbox and the STEAM_* events, and tells this view the phase.
//
//   off     dark vent, nothing rising
//   windup  the vent glows hotter (orange -> red, flickering) and sputters
//           puffs that get faster as the blast nears
//   on      a dense white column exactly as tall as the deadly hitbox, with
//           billowing edges and a mushrooming cap. Shown only while deadly;
//           when it stops, the column vanishes at once and only faint wisps
//           drift off, so "white column = deadly" is never ambiguous.
// =============================================================================

export class SteamView {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} st LevelModel steam ({ x, base, h, rect, period, on, offset })
   */
  constructor(scene, st) {
    this.scene = scene;
    this.st = st;
    this.phase = 'off';
    this.visible = true;
    this.onMs = 0;

    const x = st.x;
    const top = st.base - st.h;             // column top (hitbox top)
    const bottom = st.base - 4;             // vent mouth
    this.top = top;
    this.bottom = bottom;

    this.vent = scene.add.image(x, st.base, 'l4-steam-vent').setOrigin(0.5, 1).setDepth(DEPTH.STEAM + 1);

    this.glow = scene.add.image(x, bottom, FXT.SOFT)
      .setTint(FX.STEAM_GLOW_COLOR).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(FX.STEAM_GLOW_SCALE, FX.STEAM_GLOW_SCALE * 0.6).setAlpha(0).setDepth(DEPTH.STEAM + 2);

    this.column = scene.add.tileSprite(x, bottom, FX.STEAM_COL_W, bottom - top, FXT.STEAM)
      .setOrigin(0.5, 1).setDepth(DEPTH.STEAM).setAlpha(FX.STEAM_COL_ALPHA).setVisible(false);

    // Billows along the column while firing
    this.billow = scene.add.particles(0, 0, FXT.SOFT, {
      emitting: false,
      frequency: FX.STEAM_BILLOW_EVERY_MS,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(x - 4, top + 6, 8, bottom - top - 6) },
      speedY: { min: -140, max: -70 },
      speedX: { min: -22, max: 22 },
      lifespan: 280,
      scale: { start: 0.55, end: 1.05 },
      alpha: { start: 0.75, end: 0 },
      tint: [0xffffff, 0xeef3f6],
      maxAliveParticles: 14,
    }).setDepth(DEPTH.STEAM);

    // Mushroom cap at the top of the column
    this.cap = scene.add.particles(x, top + 4, FXT.SOFT, {
      emitting: false,
      frequency: 45,
      x: { min: -4, max: 4 },
      speedX: { min: -38, max: 38 },
      speedY: { min: -30, max: -6 },
      lifespan: 360,
      scale: { start: 0.7, end: 1.4 },
      alpha: { start: 0.7, end: 0 },
      tint: 0xf4f6f8,
      maxAliveParticles: 10,
    }).setDepth(DEPTH.STEAM);

    // Warning sputter from the vent mouth (and the faint wisps after a blast)
    this.sputter = scene.add.particles(x, bottom, FXT.PUFF, {
      emitting: false,
      frequency: FX.STEAM_SPUTTER_EVERY_MS[0],
      x: { min: -3, max: 3 },
      speedY: { min: -90, max: -40 },
      speedX: { min: -12, max: 12 },
      lifespan: 420,
      scale: { start: 1, end: 2.4 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xe4e8ec,
      maxAliveParticles: 10,
    }).setDepth(DEPTH.STEAM);

    this.emitters = [this.billow, this.cap, this.sputter];
  }

  /** Called by LevelWorld when the phase changes. */
  setPhase(phase) {
    const prev = this.phase;
    this.phase = phase;
    const sc = this.scene;
    if (phase === 'on') {
      this.onMs = 0;
      this.column.setVisible(true).setScale(FX.STEAM_POP_SCALE, 1);
      sc.tweens.add({ targets: this.column, scaleX: 1, duration: 140, ease: 'Quad.easeOut' });
      this.sputter.stop();
      if (this.visible) {
        this.billow.start();
        this.cap.start();
        this.sputter.explode(4);
      }
      this.vent.setTint(FX.STEAM_VENT_ON);
    } else {
      this.column.setVisible(false);
      this.billow.stop();
      this.cap.stop();
      if (phase === 'windup') {
        if (this.visible) this.sputter.start();
      } else {
        this.sputter.stop();
        this.glow.setAlpha(0);
        this.vent.clearTint();
        // Faint wisps drift off after a blast (clearly not a column)
        if (prev === 'on' && this.visible) {
          this.cap.emitParticleAt(this.st.x, this.top + 10, 3);
          this.sputter.emitParticleAt(this.st.x, this.bottom - 6, 2);
        }
      }
    }
  }

  /**
   * Per gameplay frame. progress = 0..1 through the wind-up (only for windup).
   */
  update(dt, progress) {
    if (!this.visible) return;
    if (this.phase === 'windup') {
      const p = Phaser.Math.Clamp(progress, 0, 1);
      // Hotter and faster as the blast nears; flickers in the last third
      const flick = p > 0.66 ? (Math.floor(this.scene.time.now / 60) % 2 ? 1 : 0.55) : 1;
      this.glow.setAlpha((0.25 + 0.65 * p) * flick);
      this.vent.setTint(lerpColor(FX.STEAM_VENT_WARM, FX.STEAM_VENT_HOT, p));
      const [slow, fast] = FX.STEAM_SPUTTER_EVERY_MS;
      this.sputter.frequency = Phaser.Math.Linear(slow, fast, p);
    } else if (this.phase === 'on') {
      this.onMs += dt;
      this.column.tilePositionY += dt * FX.STEAM_SCROLL_PX_PER_MS;
      this.column.setAlpha(FX.STEAM_COL_ALPHA * (0.92 + 0.08 * Math.sin(this.onMs / 30)));
      this.glow.setAlpha(0.75);
    }
  }

  /** Culling: no emitting while off screen (visual only). */
  setOnScreen(on) {
    if (on === this.visible) return;
    this.visible = on;
    if (!on) {
      for (const e of this.emitters) e.stop();
    } else {
      this.setPhase(this.phase);
    }
  }
}
