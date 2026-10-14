import Phaser from 'phaser';
import { FX, FX_COLORS, FX_PARTICLES, SCENERY } from '../core/Constants.js';
import { TITLE_MENU } from '../core/MetaConstants.js';
import { FXK, ensureFxTextures } from './FxTextures.js';

// Ambient night life shared by the battle and the menus: drifting fireflies,
// flickering lantern glows (ADD blend) and twinkling stars. Everything here is
// decoration; it is driven by the scene clock and never by the sim.

/**
 * Fireflies drifting inside the given rects ([{ x, y, w, h }]).
 * One small flow emitter, capped at FX.FIREFLIES alive.
 */
export function addFireflies(scene, rects, depth = 0, count = FX.FIREFLIES) {
  ensureFxTextures(scene);
  const zones = rects.map(r => ({ type: 'random', source: new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h) }));
  const life = FX.FIREFLY_LIFE_MS;
  const em = scene.add.particles(0, 0, FXK.FIREFLY, {
    frequency: FX.FIREFLY_EVERY_MS,
    quantity: 1,
    maxAliveParticles: count,
    lifespan: { min: life * 0.7, max: life },
    ...FX_PARTICLES.FIREFLY,
    alpha: { values: [0, 1, 0.3, 1, 0], interpolation: 'linear' },
    tint: FX_COLORS.FIREFLY,
    blendMode: Phaser.BlendModes.ADD,
    emitZone: zones,
  }).setDepth(depth);
  // start with a few already in the air (first frame is never empty)
  em.fastForward(life * 0.6);
  return em;
}

/**
 * Soft additive glows at art-local spots ([{ x, y, s, window }]) of an image
 * placed at (ox, oy). Each flickers a little. Returns the Images.
 */
export function addGlows(scene, ox, oy, spots, depth = 0) {
  ensureFxTextures(scene);
  const glows = spots.map((p, i) => {
    const img = scene.add.image(ox + p.x, oy + p.y, FXK.GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(p.window ? FX_COLORS.GLOW_WINDOW : FX_COLORS.GLOW)
      .setScale(p.s)
      .setAlpha(FX.GLOW_ALPHA_MIN)
      .setDepth(depth);
    img.flickerPhase = i * FX.GLOW_PHASE_STEP;
    return img;
  });
  return glows;
}

/** Call each frame with the scene time (s) to flicker glows made by addGlows. */
export function flickerGlows(glows, timeS) {
  const a0 = FX.GLOW_ALPHA_MIN;
  const a1 = FX.GLOW_ALPHA_MAX;
  for (const g of glows) {
    const w = timeS * FX.GLOW_FLICKER_HZ * Math.PI * 2 + g.flickerPhase;
    // two sines read as a candle flicker rather than a pulse
    const k = 0.5 + 0.35 * Math.sin(w) + 0.15 * Math.sin(w * FX.GLOW_FLICKER_RATIO);
    g.setAlpha(a0 + (a1 - a0) * k);
  }
}

/**
 * Twinkling stars over a night sky (menus). Deterministic positions from a
 * small LCG so screenshots stay comparable. Returns { update(timeS) }.
 */
export function addTwinkles(scene, { x = 0, y = 0, w, h, count = FX.TWINKLES, seed = 11, depth = 0 } = {}) {
  ensureFxTextures(scene);
  let s = seed;
  const rnd = () => {
    s = (s * TITLE_MENU.STAR_RNG.A + TITLE_MENU.STAR_RNG.C) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const stars = [];
  for (let i = 0; i < count; i++) {
    const img = scene.add.image(Math.floor(x + rnd() * w), Math.floor(y + rnd() * h), FXK.SPARK)
      .setTint(FX_COLORS.STEAM).setDepth(depth).setAlpha(0);
    img.phase = rnd() * Math.PI * 2;
    img.rate = FX.TWINKLE_HZ * (0.6 + rnd() * 0.8);
    stars.push(img);
  }
  return {
    update(timeS) {
      for (const st of stars) {
        const k = Math.sin(timeS * st.rate * Math.PI * 2 + st.phase);
        st.setAlpha(k > 0.55 ? (k - 0.55) / 0.45 : 0);
      }
    },
  };
}

/** A soft glow behind the menu moon. */
export function addMoonGlow(scene, x, y, depth = 0) {
  ensureFxTextures(scene);
  return scene.add.image(x, y, FXK.GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(FX_COLORS.GLOW_WINDOW)
    .setScale(SCENERY.MOON_GLOW_SCALE).setAlpha(FX.GLOW_ALPHA_MAX).setDepth(depth);
}

/**
 * One call per menu scene: twinkling stars over the sky, fireflies, an
 * optional moon glow and lantern glows. Ticks itself from the scene's update
 * event and cleans up on shutdown.
 * opts: { fireflyRects, moon: { x, y } | null, glows: [{ ox, oy, spots }], depth }
 */
export function addMenuAmbience(scene, { fireflyRects = null, moon = null, glows = [], depth = 0, twinkleH = null } = {}) {
  const w = scene.scale.gameSize.width;
  const h = scene.scale.gameSize.height;
  const tw = addTwinkles(scene, { w, h: twinkleH ?? h * 0.55, depth });
  if (moon) addMoonGlow(scene, moon.x, moon.y, depth);
  const lights = [];
  for (const gl of glows) lights.push(...addGlows(scene, gl.ox, gl.oy, gl.spots, depth));
  addFireflies(scene, fireflyRects || [{ x: 0, y: h * 0.3, w, h: h * 0.65 }], depth);
  let t = 0;
  const tick = (_time, delta) => {
    t += delta / 1000;
    tw.update(t);
    flickerGlows(lights, t);
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', () => scene.events.off('update', tick));
  return { lights };
}

/** Confetti that rains from the top edge; call .explode(n, 0, 0). */
export function addConfetti(scene, depth = 0) {
  ensureFxTextures(scene);
  const P = FX_PARTICLES;
  return scene.add.particles(0, 0, FXK.CONFETTI, {
    ...P.CONFETTI,
    emitting: false,
    maxAliveParticles: FX.CAP_CONFETTI,
    scaleX: { onEmit: () => 1, onUpdate: (p, _k, t) => Math.cos(t * P.CONFETTI_FLUTTER + p.x) * P.CONFETTI_W },
    tint: FX_COLORS.CONFETTI,
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, -P.CONFETTI_ZONE_H, scene.scale.gameSize.width, P.CONFETTI_ZONE_H / 2) },
  }).setDepth(depth);
}
