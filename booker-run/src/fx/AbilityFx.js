import Phaser from 'phaser';
import { DEPTH, FX, DOUBLE, BREAKABLE } from '../core/Constants.js';
import { gameState, MODES } from '../core/GameState.js';
import { FXT, breakableChunks } from './textures.js';

// =============================================================================
// AbilityFx — juice for the Levels 2-6 abilities. Visual only: it reacts to
// EventBus events (wired in Effects.js) and reads Booker's state; it never
// touches bodies, velocities or timing.
//
//   double jump  ring + side puffs under the feet, a whoosh arc around the
//                spin frames (10-11), stretch
//   glide        trails from both ear tips, soft air puffs below, a gentle bob
//   wall cling   impact puff + squash on contact, sparks and dust scraping
//                down the wall while sliding
//   wall kick    vertical ring and a puff burst off the wall face, stretch
//   pounce       shockwave ring, stars, flash, squash held through the
//                gameplay freeze then a bounce stretch (enemy squash-and-pop
//                is in LevelWorld.stompEnemy)
//   dash         cream afterimages, speed lines, a sonic ring and a camera
//                nudge; smashing: the breakable splits into tumbling chunks,
//                with splinters, dust and a flash (plus Effects' shake)
// =============================================================================

// Ear-tip offsets from the sprite centre for the glide frames (12, 13)
const EAR_TIPS = {
  12: [[-13, -6], [22, -6]],
  13: [[-15, 2], [23, 2]],
};

export class AbilityFx {
  /** @param {import('../systems/Effects.js').Effects} fx */
  constructor(fx) {
    this.fx = fx;
    this.scene = fx.scene;
    this.player = fx.player;
    this.gliding = false;
    this.dashing = false;
    this.spinMs = 0;
    this.glideT = 0;
    this.trailMs = 0;
    this.airPuffMs = 0;
    this.scrapeMs = 0;
    this.ghostMs = 0;
    this.lineMs = 0;
    this.chunks = [];
    this.camNudge = { x: 0 };
    this.createObjects();
  }

  createObjects() {
    const add = this.scene.add;
    const P = DEPTH.PLAYER;

    // General puffs (double jump, kick, dash) — direction set per burst
    this.puffs = add.particles(0, 0, FXT.PUFF, {
      emitting: false,
      lifespan: 320,
      speed: { min: 40, max: 110 },
      scale: { start: 1.1, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, FX.DUST_COLOR],
      maxAliveParticles: 30,
    }).setDepth(P + 1);

    // Glide: thin trails from the ear tips
    this.wind = add.particles(0, 0, FXT.LINE, {
      emitting: false,
      lifespan: FX.GLIDE_TRAIL_MS,
      scaleX: { start: 1, end: 0.3 },
      alpha: { start: FX.GLIDE_TRAIL_ALPHA, end: 0 },
      tint: 0xffffff,
      maxAliveParticles: 30,
    }).setDepth(P - 1);
    this.airPuffs = add.particles(0, 0, FXT.SOFT, {
      emitting: false,
      lifespan: 420,
      speedX: { min: -30, max: -10 },
      speedY: { min: 20, max: 45 },
      scale: { start: 0.35, end: 0.8 },
      alpha: { start: 0.35, end: 0 },
      tint: 0xffffff,
      maxAliveParticles: 8,
    }).setDepth(P - 1);

    // Wall scrape: hot sparks + grey dust
    this.sparks = add.particles(0, 0, FXT.EMBER, {
      emitting: false,
      lifespan: { min: 220, max: 420 },
      speedX: { min: -80, max: -20 },
      speedY: { min: -110, max: -30 },
      gravityY: 380,
      scale: { start: 1.2, end: 0.5 },
      alpha: { start: 1, end: 0.3 },
      tint: FX.SCRAPE_SPARK_COLORS,
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 20,
    }).setDepth(P + 1);
    this.dust = add.particles(0, 0, FXT.PUFF, {
      emitting: false,
      lifespan: 380,
      speedX: { min: -28, max: -6 },
      speedY: { min: -26, max: 6 },
      scale: { start: 0.6, end: 1.3 },
      alpha: { start: 0.6, end: 0 },
      tint: FX.SCRAPE_DUST_COLOR,
      maxAliveParticles: 14,
    }).setDepth(P - 1);

    // Pounce stars
    this.stars = add.particles(0, 0, FXT.STAR, {
      emitting: false,
      lifespan: 520,
      speed: { min: 70, max: 140 },
      angle: { min: -165, max: -15 },
      gravityY: 280,
      scale: { start: 1, end: 0.4 },
      rotate: { start: 0, end: 200 },
      tint: [0xffe27a, 0xffffff, 0xffb347],
      maxAliveParticles: 16,
    }).setDepth(P + 2);

    // Dash speed lines (bright end toward Booker)
    this.lines = add.particles(0, 0, FXT.SPEED, {
      emitting: false,
      lifespan: FX.DASH_LINE_MS,
      scaleX: { min: 0.5, max: 1.2 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xffffff, FX.DASH_TRAIL_COLOR],
      maxAliveParticles: 24,
    }).setDepth(P - 1);

    // Smash: splinters/flakes and a dust cloud
    this.splinters = add.particles(0, 0, FXT.LEAF, {
      emitting: false,
      lifespan: 650,
      speedX: { min: -30, max: 210 },
      speedY: { min: -210, max: -40 },
      gravityY: 620,
      rotate: { start: 0, end: 540 },
      scale: { min: 1, max: 2 },
      tint: FX.SMASH_SPLINTER_COLORS,
      maxAliveParticles: 30,
    }).setDepth(P + 1);
    this.smoke = add.particles(0, 0, FXT.SOFT, {
      emitting: false,
      lifespan: 480,
      speed: { min: 20, max: 70 },
      scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.55, end: 0 },
      tint: FX.SMASH_DUST_COLOR,
      maxAliveParticles: 14,
    }).setDepth(DEPTH.OBSTACLE + 1);

    this.emitters = [this.puffs, this.wind, this.airPuffs, this.sparks, this.dust, this.stars, this.lines, this.splinters, this.smoke];

    // Pooled one-shot images: rings, flashes, ghosts, chunks
    this.rings = Array.from({ length: 6 }, () => add.image(0, 0, FXT.RING).setVisible(false).setDepth(P + 1));
    this.flashes = Array.from({ length: 3 }, () => add.image(0, 0, FXT.SOFT)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(P + 2));
    this.spinArc = add.image(0, 0, FXT.ARC).setVisible(false).setDepth(P + 1);
    this.ghosts = Array.from({ length: FX.DASH_GHOSTS }, () => add.image(0, 0, 'booker', 0)
      .setOrigin(0.5, 1).setTint(FX.DASH_GHOST_COLOR).setTintMode(Phaser.TintModes.FILL)
      .setVisible(false).setDepth(P - 1));
    this.ghosts.forEach(g => { g.life = 0; });
    this.chunkPool = [];
  }

  // --- helpers ------------------------------------------------------------------

  get sprite() {
    return this.player.sprite;
  }

  get body() {
    return this.player.body;
  }

  /** Puff burst in a direction (degrees, 0 = right, -90 = up). */
  burst(emitter, x, y, n, angMin, angMax) {
    emitter.setEmitterAngle({ min: angMin, max: angMax });
    emitter.emitParticleAt(x, y, n);
  }

  /** Expanding ring. tex: FXT.RING (round), RING_H (flat, on the ground), RING_V (tall, on a wall). */
  ring(x, y, { tex = FXT.RING_H, sx = [0.5, 1.6], sy = null, ms = 240, tint = 0xffffff, alpha = 1, depth = null } = {}) {
    const r = this.rings.find(o => !o.visible) || this.rings[0];
    sy = sy || sx;
    this.scene.tweens.killTweensOf(r);
    r.setTexture(tex).setPosition(x, y).setScale(sx[0], sy[0]).setAlpha(alpha).setTint(tint).setVisible(true)
      .setDepth(depth ?? DEPTH.PLAYER + 1);
    this.scene.tweens.add({
      targets: r,
      scaleX: sx[1],
      scaleY: sy[1],
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => r.setVisible(false),
    });
  }

  flash(x, y, scale, tint, ms = 120, alpha = 0.85) {
    const f = this.flashes.find(o => !o.visible) || this.flashes[0];
    this.scene.tweens.killTweensOf(f);
    f.setPosition(x, y).setScale(scale).setTint(tint).setAlpha(alpha).setVisible(true);
    this.scene.tweens.add({
      targets: f, alpha: 0, scale: scale * 1.4, duration: ms, ease: 'Quad.easeOut',
      onComplete: () => f.setVisible(false),
    });
  }

  // --- events -------------------------------------------------------------------

  onDoubleJump() {
    const s = this.sprite;
    const feet = this.fx.feetY();
    this.fx.squash(FX.STRETCH_X, FX.STRETCH_Y, FX.STRETCH_MS);
    this.ring(s.x, feet + 1, { sx: [0.55, 1.3], ms: 280 });
    this.burst(this.puffs, s.x - 4, feet, 4, 160, 200);
    this.burst(this.puffs, s.x + 4, feet, 4, -20, 20);
    this.spinMs = DOUBLE.SPIN_MS;
    this.spinArc.setVisible(true).setAlpha(0.9).setAngle(0);
  }

  onGlide(on) {
    this.gliding = on;
    if (on) {
      this.glideT = 0;
      this.trailMs = 0;
      const s = this.sprite;
      this.burst(this.puffs, s.x, this.fx.feetY(), 3, 60, 120);
    } else {
      this.fx.viewBob = 0;
    }
  }

  onCling() {
    const b = this.body;
    const x = b.x + b.width;
    this.fx.squash(FX.CLING_SQUASH_X, FX.CLING_SQUASH_Y, FX.SQUASH_MS);
    this.burst(this.dust, x, b.y + b.height / 2, 4, 150, 210);
    this.sparks.emitParticleAt(x, b.y + b.height / 2, 3);
  }

  onWallKick() {
    const b = this.body;
    const x = b.x + b.width;
    const y = b.y + b.height / 2;
    this.fx.squash(FX.STRETCH_X, FX.STRETCH_Y, FX.STRETCH_MS);
    this.ring(x, y, { tex: FXT.RING_V, sx: [0.5, 1.2], ms: 240 });
    this.burst(this.puffs, x - 2, y, 7, 110, 250);
    this.sparks.emitParticleAt(x, y, 4);
  }

  /** ENEMY_STOMPED: the shockwave, stars and flash at the stomp point. */
  onStomp() {
    const s = this.sprite;
    const feet = this.fx.feetY();
    this.ring(s.x, feet, { sx: [0.6, 2], ms: 300 });
    this.ring(s.x, feet, { sx: [0.5, 1.2], ms: 220, tint: 0xffe27a });
    this.stars.emitParticleAt(s.x, feet, FX.POUNCE_STARS);
    this.flash(s.x, feet, 1.6, 0xfff4c8, 140);
    this.scene.cameras.main.shake(FX.POUNCE_SHAKE_MS, FX.POUNCE_SHAKE_INTENSITY);
  }

  /** PLAYER_POUNCE: squash through the freeze, then the bounce stretch. */
  onPounce() {
    const vs = this.fx.viewScale;
    this.fx.squashTween?.stop();
    vs.x = FX.SQUASH_X;
    vs.y = FX.SQUASH_Y;
    this.fx.squashTween = this.scene.tweens.chain({
      targets: vs,
      tweens: [
        { x: FX.SQUASH_X, y: FX.SQUASH_Y, duration: FX.POUNCE_HOLD_MS },
        { x: FX.POUNCE_STRETCH_X, y: FX.POUNCE_STRETCH_Y, duration: 60, ease: 'Quad.easeOut' },
        { x: 1, y: 1, duration: 220, ease: 'Back.easeOut' },
      ],
    });
  }

  onDash(on) {
    const s = this.sprite;
    const b = this.body;
    if (on) {
      this.dashing = true;
      this.ghostMs = 0;
      this.lineMs = 0;
      this.fx.squash(FX.DASH_STRETCH_X, FX.DASH_STRETCH_Y, FX.STRETCH_MS);
      const cy = b.y + b.height / 2;
      this.ring(s.x - 14, cy, { tex: FXT.RING_V, sx: [0.5, 1], sy: [0.5, 1.15], ms: 230, tint: FX.DASH_GHOST_COLOR });
      this.burst(this.puffs, s.x - 12, cy, 6, 150, 210);
      const tw = this.scene.tweens;
      tw.killTweensOf(this.camNudge);
      tw.chain({
        targets: this.camNudge,
        tweens: [
          { x: -FX.DASH_NUDGE_PX, duration: 70, ease: 'Quad.easeOut' },
          { x: 0, duration: FX.DASH_NUDGE_BACK_MS, ease: 'Sine.easeInOut' },
        ],
      });
    } else {
      this.dashing = false;
      this.burst(this.puffs, s.x + 10, b.y + b.height / 2, 3, -40, 40);
    }
  }

  /** BREAKABLE_SMASHED { type, x, y } (y = centre). */
  onSmash(d) {
    const spec = BREAKABLE[d.type];
    if (!spec) return;
    const frames = breakableChunks(this.scene, spec.key, d.type);
    const n = frames.length;
    const h = spec.H / n;
    frames.forEach((frame, i) => {
      const cy = d.y - spec.H / 2 + h * (i + 0.5);
      this.spawnChunk(spec.key, frame, d.x, cy, i, n);
    });
    this.splinters.emitParticleAt(d.x, d.y, FX.SMASH_SPLINTERS);
    for (let i = 0; i < 3; i++) this.smoke.emitParticleAt(d.x, d.y - spec.H / 2 + spec.H * (i + 0.5) / 3, 3);
    this.flash(d.x, d.y, 2.2, 0xfff1d6, 120, 0.9);
    this.ring(d.x - 6, d.y, { tex: FXT.RING_V, sx: [0.6, 1.4], sy: [0.8, 1.9], ms: 220 });
  }

  spawnChunk(key, frame, x, y, i, n) {
    let c = this.chunkPool.find(o => !o.visible);
    if (!c) {
      if (this.chunkPool.length >= FX.SMASH_CHUNK_POOL) return;
      c = this.scene.add.image(0, 0, key, frame).setDepth(DEPTH.OBSTACLE + 1);
      this.chunkPool.push(c);
    }
    const up = (n - i) / n;            // top pieces fly higher
    c.setTexture(key, frame).setPosition(x, y).setAngle(0).setAlpha(1).setVisible(true);
    c.vx = Phaser.Math.Between(70, 170) + 40 * up;
    c.vy = -Phaser.Math.Between(90, 160) - 90 * up;
    c.va = Phaser.Math.Between(300, 720) * (i % 2 ? -1 : 1);
    c.life = FX.SMASH_CHUNK_MS;
    this.chunks.push(c);
  }

  // --- per frame (scene UPDATE) ---------------------------------------------

  update(delta) {
    const p = this.player;
    const playing = gameState.mode === MODES.PLAYING && p && !p.dead;
    const s = p?.sprite;

    // Spin whoosh around the double-jump ball (ends early when another pose takes over)
    if (this.spinMs > 0) {
      const c = p?.ctrl;
      if (c && (c.dashing || c.clinging || c.poseMs > 0)) this.spinMs = 0;
      this.spinMs -= delta;
      const k = Math.max(0, this.spinMs / DOUBLE.SPIN_MS);
      const b = this.body;
      this.spinArc.setPosition(b.x + b.width / 2, b.y + b.height / 2 - 3)
        .setAngle(this.spinArc.angle + delta * FX.SPIN_ARC_DEG_PER_MS)
        .setScale(1.05 + 0.25 * (1 - k)).setAlpha(0.95 * k);
      if (this.spinMs <= 0 || !playing) {
        this.spinMs = 0;
        this.spinArc.setVisible(false);
      }
    }

    if (playing) {
      if (this.gliding) this.updateGlide(delta, s);
      if (p.clinging && p.body.velocity.y > 0) this.updateScrape(delta);
      if (this.dashing) this.updateDash(delta);
    } else if (this.gliding) {
      this.gliding = false;
      this.fx.viewBob = 0;
    }

    // Ghost fade
    for (const g of this.ghosts) {
      if (!g.visible) continue;
      g.life -= delta;
      if (g.life <= 0) g.setVisible(false);
      else g.setAlpha(FX.DASH_GHOST_ALPHA * (g.life / FX.DASH_GHOST_MS));
    }

    // Flying chunks (simple ballistic motion, visual only)
    if (this.chunks.length) {
      const dts = delta / 1000;
      for (let i = this.chunks.length - 1; i >= 0; i--) {
        const c = this.chunks[i];
        c.life -= delta;
        c.vy += FX.SMASH_CHUNK_GRAVITY * dts;
        c.x += c.vx * dts;
        c.y += c.vy * dts;
        c.angle += c.va * dts;
        if (c.life < 250) c.setAlpha(Math.max(0, c.life / 250));
        if (c.life <= 0) {
          c.setVisible(false);
          this.chunks.splice(i, 1);
        }
      }
    }
  }

  updateGlide(delta, s) {
    this.glideT += delta;
    this.fx.viewBob = Math.round(Math.sin(this.glideT / FX.GLIDE_BOB_MS * Math.PI * 2) * FX.GLIDE_BOB_PX);
    this.trailMs -= delta;
    if (this.trailMs <= 0) {
      this.trailMs = FX.GLIDE_TRAIL_EVERY_MS;
      const tips = EAR_TIPS[s.frame.name] || EAR_TIPS[12];
      const by = this.fx.viewBob;
      for (const [dx, dy] of tips) this.wind.emitParticleAt(s.x + dx - 3, s.y + dy + by, 1);
    }
    this.airPuffMs -= delta;
    if (this.airPuffMs <= 0) {
      this.airPuffMs = FX.GLIDE_PUFF_EVERY_MS;
      this.airPuffs.emitParticleAt(s.x - 6 + Math.random() * 10, this.fx.feetY() + 2, 1);
    }
  }

  updateScrape(delta) {
    this.scrapeMs -= delta;
    if (this.scrapeMs > 0) return;
    this.scrapeMs = FX.SCRAPE_EVERY_MS;
    const b = this.body;
    const x = b.x + b.width;
    // front paws (upper) and hind paws (lower) both scrape
    this.sparks.emitParticleAt(x, b.y + 3 + Math.random() * 4, 1);
    this.sparks.emitParticleAt(x, b.y + b.height - 3 - Math.random() * 3, 2);
    this.dust.emitParticleAt(x - 1, b.y + 2 + Math.random() * (b.height - 4), 1);
  }

  updateDash(delta) {
    const v = this.fx.view;
    const b = this.body;
    this.ghostMs -= delta;
    if (this.ghostMs <= 0) {
      this.ghostMs = FX.DASH_GHOST_EVERY_MS;
      const g = this.ghosts.find(o => !o.visible) || this.ghosts.reduce((a, o) => (o.life < a.life ? o : a));
      g.setFrame(v.frame.name).setPosition(v.x, v.y).setScale(v.scaleX, v.scaleY).setAngle(v.angle)
        .setAlpha(FX.DASH_GHOST_ALPHA).setVisible(true);
      g.life = FX.DASH_GHOST_MS;
    }
    this.lineMs -= delta;
    if (this.lineMs <= 0) {
      this.lineMs = FX.DASH_LINE_EVERY_MS;
      for (let i = 0; i < 2; i++) {
        const y = b.y + 1 + Math.random() * (b.height - 2);
        this.lines.emitParticleAt(b.x - 6 - Math.random() * 10, y, 1);
      }
    }
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.camNudge);
  }
}
