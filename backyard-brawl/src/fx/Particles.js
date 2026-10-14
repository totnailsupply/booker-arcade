// Particle bursts on a few shared emitters (one draw batch each, capped).
// Every emitter is in explode mode (emitting: false); the colour of a burst is
// set with setParticleTint() right before explode(). Phaser emitters advance
// with the scene's frame delta, so they follow the test clock.

import { FX } from '../core/Constants.js';
import { GEN } from '../core/Assets.js';
import { FXT } from './textures.js';

const PX = GEN.PIXEL;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    const depth = FX.DEPTH.PARTICLES;
    const base = { emitting: false, maxParticles: FX.PARTICLES_MAX };
    // Death puffs: chunky pixels flying out, slowing down
    this.puff = scene.add.particles(0, 0, PX, {
      ...base,
      speed: { min: FX.PUFF_SPEED[0], max: FX.PUFF_SPEED[1] },
      lifespan: { min: FX.PUFF_LIFE[0], max: FX.PUFF_LIFE[1] },
      scale: { start: 1.5, end: 0.5 },
      alpha: { start: 1, end: 0.2 },
      gravityY: 60,
    }).setDepth(depth);
    // Soft dust (spawns, dashes, landings)
    this.dust = scene.add.particles(0, 0, FXT.DUST, {
      ...base,
      speed: { min: 8, max: 30 },
      lifespan: { min: 250, max: 420 },
      scale: { start: 1, end: 0.4 },
      alpha: { start: 0.5, end: 0 },
      gravityY: -12,
    }).setDepth(depth - 1);
    // Twinkles (pickups, level-up, golden bones)
    this.sparkle = scene.add.particles(0, 0, FXT.SPARKLE, {
      ...base,
      speed: { min: 10, max: 60 },
      lifespan: { min: 280, max: 520 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0.3 },
    }).setDepth(depth + 1);
    // Confetti (boss death, victory)
    this.confetti = scene.add.particles(0, 0, FXT.CONFETTI, {
      ...base,
      speed: { min: 60, max: 190 },
      angle: { min: 200, max: 340 },
      lifespan: { min: 1100, max: 1800 },
      gravityY: 140,
      rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0.4 },
      tint: FX.CONFETTI,
    }).setDepth(depth + 2);
    this.all = [this.puff, this.dust, this.sparkle, this.confetti];
  }

  setTimeScale(s) {
    for (const e of this.all) e.timeScale = s;
  }

  count() {
    let n = 0;
    for (const e of this.all) n += e.getAliveParticleCount();
    return n;
  }

  /** Two-colour death puff (main colour + highlight). */
  burst(x, y, colors, n) {
    const main = Math.ceil(n * 0.75);
    this.puff.setParticleTint(colors[0]).explode(main, x, y);
    if (n - main > 0) this.puff.setParticleTint(colors[1] ?? 0xffffff).explode(n - main, x, y);
  }

  dustAt(x, y, n = 4, tint = 0xc8b890) {
    this.dust.setParticleTint(tint).explode(n, x, y);
  }

  sparkleAt(x, y, n = 4, tint = FX.GOLD) {
    this.sparkle.setParticleTint(tint).explode(n, x, y);
  }

  confettiAt(x, y, n = FX.CONFETTI_COUNT) {
    this.confetti.explode(n, x, y);
  }
}

