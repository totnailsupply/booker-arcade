// =============================================================================
// Ambient — subtle drifting particles per zone, behind the platforms:
//   1 Street & Garden   leaves and petals drifting down
//   2 Balconies         steam wisps rising from the windows
//   3 Lantern Roofs     warm glowing motes floating up
//   4 The Spire         wind streaks and dust blowing across
// One pooled emitter per kind (world space, capped); particles are spawned
// manually around the view at AMBIENT.RATE per second. Near a gate the two
// zones mix by distance, so the change is gradual. Purely visual.
// =============================================================================

import Phaser from 'phaser';
import { AMBIENT, GAME, DEPTH, WORLD } from '../core/Constants.js';
import { FXK } from '../core/VisualBake.js';
import { facadeRangeAt } from './Backdrop.js';

const rand = (a, b) => a + Math.random() * (b - a);
const MIX_PX = 120;

export class Ambient {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.acc = 0;
    const base = { emitting: false, maxAliveParticles: AMBIENT.MAX_ALIVE };
    const depth = DEPTH.RIG - 1;
    this.kinds = [
      // leaves / petals
      scene.add.particles(0, 0, FXK.LEAF, {
        ...base, frame: [0, 1], speedX: { min: -14, max: 14 }, speedY: { min: 12, max: 26 },
        accelerationX: { min: -6, max: 6 }, rotate: { start: 0, end: 300 }, scale: AMBIENT.LEAF_SCALE,
        lifespan: { min: 4200, max: 6000 }, alpha: { values: [0, AMBIENT.LEAF_ALPHA, AMBIENT.LEAF_ALPHA, 0] },
      }).setDepth(depth),
      // steam wisps
      scene.add.particles(0, 0, FXK.WISP, {
        ...base, speedX: { min: -4, max: 4 }, speedY: { min: -18, max: -9 },
        scale: { start: 0.8, end: 2.4 }, lifespan: { min: 2200, max: 3000 },
        alpha: { values: [0, 0.3, 0.22, 0] }, tint: AMBIENT.STEAM_TINT,
      }).setDepth(depth),
      // lantern glow motes
      scene.add.particles(0, 0, FXK.MOTE, {
        ...base, speedX: { min: -5, max: 5 }, speedY: { min: -14, max: -5 },
        lifespan: { min: 2600, max: 3600 }, alpha: { values: [0, 0.9, 0.45, 0.85, 0] },
        tint: AMBIENT.MOTE_TINT, blendMode: Phaser.BlendModes.ADD,
      }).setDepth(depth),
      // wind streaks + dust
      scene.add.particles(0, 0, FXK.STREAK, {
        ...base, speedX: { min: 70, max: 125 }, speedY: { min: 8, max: 22 },
        scaleX: { min: 0.6, max: 1.4 }, lifespan: { min: 2600, max: 3400 },
        alpha: { values: [0, 0.4, 0.4, 0] }, tint: AMBIENT.WIND_TINT,
      }).setDepth(depth),
    ];
  }

  /** Zone index (0-based) and the chance of using the next zone near a gate. */
  zoneMix(heightPx) {
    const z = this.level.zones;
    let k = 0;
    for (let i = z.length - 1; i >= 0; i--) if (heightPx >= z[i].startY) { k = i; break; }
    const next = z[k + 1];
    const toNext = next ? (heightPx - (next.startY - MIX_PX)) / MIX_PX : -1;
    if (next && toNext > 0) return { k, alt: k + 1, p: Math.min(1, toNext) * 0.5 };
    const prevGate = z[k].startY;
    const fromPrev = k > 0 ? 1 - (heightPx - prevGate) / MIX_PX : -1;
    if (fromPrev > 0) return { k, alt: k - 1, p: Math.min(1, fromPrev) * 0.5 };
    return { k, alt: k, p: 0 };
  }

  update(dt, camTop) {
    const midH = WORLD.STREET_Y - (camTop + GAME.HEIGHT / 2);
    const { k, alt, p } = this.zoneMix(Math.max(0, midH));
    this.acc += dt * AMBIENT.RATE[k];
    while (this.acc >= 1) {
      this.acc -= 1;
      this.spawn(Math.random() < p ? alt : k, camTop);
    }
  }

  spawn(kind, camTop) {
    const em = this.kinds[kind];
    if (!em) return;
    const H = GAME.HEIGHT;
    if (kind === 0) {
      em.emitParticleAt(rand(0, GAME.WIDTH), camTop + rand(-10, H * 0.55), 1);
    } else if (kind === 1) {
      const h = WORLD.STREET_Y - (camTop + H / 2);
      const [x0, x1] = facadeRangeAt(this.level, h);
      em.emitParticleAt(rand(x0 + 6, x1 - 6), camTop + rand(H * 0.25, H), 1);
    } else if (kind === 2) {
      em.emitParticleAt(rand(10, GAME.WIDTH - 10), camTop + rand(H * 0.2, H), 1);
    } else {
      em.emitParticleAt(rand(-20, GAME.WIDTH * 0.6), camTop + rand(0, H * 0.9), 1);
    }
  }
}
