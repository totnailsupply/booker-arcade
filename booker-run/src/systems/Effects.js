import Phaser from 'phaser';
import { GAME, WORLD, PLAYER, DEPTH, SCORE, COLORS, FX, ANIM, BREAKABLE } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { text as pxText, relayout } from '../ui/PixelFont.js';
import { ensureFxTextures, FXT } from '../fx/textures.js';
import { AbilityFx } from '../fx/AbilityFx.js';
import { WorldFx } from '../fx/WorldFx.js';
import { Ambience } from '../fx/Ambience.js';

// -----------------------------------------------------------------------------
// Effects — every visual-only effect in RunScene (Step 2 "juice").
//
// Listens to EventBus events and never changes physics, hitboxes or scoring.
//
// Squash & stretch: Arcade bodies resize with their sprite's scale, so Booker's
// physics sprite stays at scale 1 and is hidden. A separate display sprite
// (this.view) copies its frame/position/angle every frame (scene POST_UPDATE,
// after physics and the camera sync) and is the one that gets scaled.
//
// Levels 2-6 (src/fx/): AbilityFx (ability juice), WorldFx (enemy idle life,
// steam/updraft culling, golden steak), Ambience (per-level atmosphere).
// Notes and tunables: docs/fx-notes.md and the FX block in Constants.js.
// -----------------------------------------------------------------------------

const TEX = {
  DOT: 'fx-dot',
  SPARK: 'fx-spark',
  STREAK: 'fx-streak',
  CONFETTI: 'fx-confetti',
  HALO: 'fx-halo',
  BEAM: 'fx-beam',
};

/** Small generated textures used by the particle effects (made once per game). */
function ensureTextures(scene) {
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    draw(ctx, w, h);
    tex.refresh();
  };
  make(TEX.DOT, 3, 3, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 3, 3); });
  make(TEX.SPARK, 5, 5, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(2, 0, 1, 5);
    c.fillRect(0, 2, 5, 1);
    c.fillRect(1, 1, 3, 3);
  });
  make(TEX.STREAK, 24, 1, (c) => {
    const g = c.createLinearGradient(0, 0, 24, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 24, 1);
  });
  make(TEX.CONFETTI, 3, 2, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 3, 2); });
  make(TEX.HALO, 64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  make(TEX.BEAM, 16, 64, (c, w, h) => {
    const v = c.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    // Soften the sides
    c.globalCompositeOperation = 'destination-in';
    const hz = c.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(0.5, 'rgba(0,0,0,1)');
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = hz;
    c.fillRect(0, 0, w, h);
  });
}

export class Effects {
  /** @param {Phaser.Scene} scene RunScene, after player, steak and HUD exist */
  constructor(scene) {
    this.scene = scene;
    this.player = scene.player;
    this.hitStopMs = 0;
    this.slowMo = null;          // { elapsed } while easing back from slow-mo
    this.dustMs = 0;
    this.squashTween = null;
    this.viewScale = { x: 1, y: 1, dy: 0 };
    this.viewBob = 0;            // display-only offset (glide float)

    // Undo anything a previous attempt left on the scene-level managers
    scene.tweens.timeScale = 1;
    scene.time.timeScale = 1;
    scene.physics.world.timeScale = 1;

    ensureTextures(scene);
    ensureFxTextures(scene);
    this.createView();
    this.createEmitters();
    this.worldFx = new WorldFx(this);
    this.decorateSteak();
    // Ability juice only where an ability exists (Level 1 keeps exactly its Step 2 objects)
    const hasAbility = Object.values(scene.flags || {}).some(Boolean);
    this.ability = hasAbility ? new AbilityFx(this) : null;
    this.ambience = new Ambience(this);
    this.emitters.push(...(this.ability?.emitters || []), ...this.worldFx.emitters, ...this.ambience.emitters);

    this.handlers = {
      [Events.PLAYER_JUMP]: () => this.onJump(),
      [Events.PLAYER_LAND]: () => this.onLand(),
      [Events.BONE_COLLECTED]: (d) => this.onBone(d),
      [Events.PLAYER_DIED]: (d) => this.onDied(d),
      [Events.SECTION_CHANGED]: (d) => this.onSection(d),
      [Events.LEVEL_START]: (d) => this.onLevelStart(d),
      [Events.LEVEL_COMPLETE]: () => this.onComplete(),
      [Events.PLAYER_DOUBLE_JUMP]: () => this.ability?.onDoubleJump(),
      [Events.PLAYER_GLIDE_START]: () => this.ability?.onGlide(true),
      [Events.PLAYER_GLIDE_END]: () => this.ability?.onGlide(false),
      [Events.PLAYER_WALL_CLING]: () => this.ability?.onCling(),
      [Events.PLAYER_WALL_KICK]: () => this.ability?.onWallKick(),
      [Events.PLAYER_POUNCE]: () => this.ability?.onPounce(),
      [Events.ENEMY_STOMPED]: () => this.ability?.onStomp(),
      [Events.PLAYER_DASH]: () => this.ability?.onDash(true),
      [Events.PLAYER_DASH_END]: () => this.ability?.onDash(false),
      [Events.BREAKABLE_SMASHED]: (d) => this.onSmash(d),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) eventBus.on(ev, fn);

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncView, this);
    // After RunScene's own POST_UPDATE camera sync (registered after this constructor)
    scene.events.once(Phaser.Scenes.Events.CREATE, () => {
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.lateSync, this);
    });
  }

  // --- setup ----------------------------------------------------------------

  createView() {
    const s = this.player.sprite;
    this.view = this.scene.add.sprite(s.x, s.y, s.texture.key, s.frame.name)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.PLAYER);
    s.setVisible(false);
    this.syncView();
  }

  createEmitters() {
    const add = this.scene.add;
    this.dust = add.particles(0, 0, TEX.DOT, {
      emitting: false,
      lifespan: FX.DUST_LIFESPAN,
      speedX: { min: -50, max: 10 },
      speedY: { min: -28, max: -6 },
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 0.75, end: 0 },
      tint: FX.DUST_COLOR,
    }).setDepth(DEPTH.PLAYER - 1);

    this.landDust = add.particles(0, 0, TEX.DOT, {
      emitting: false,
      lifespan: FX.DUST_LIFESPAN + 120,
      speedX: { min: -90, max: 90 },
      speedY: { min: -40, max: -8 },
      scale: { start: 1.6, end: 0.3 },
      alpha: { start: 0.85, end: 0 },
      tint: FX.DUST_COLOR,
    }).setDepth(DEPTH.PLAYER + 1);

    this.sparks = add.particles(0, 0, TEX.SPARK, {
      emitting: false,
      lifespan: 420,
      speed: { min: 40, max: 110 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0.2 },
      tint: [FX.BONE_SPARK_COLOR, 0xffffff],
    }).setDepth(DEPTH.PLAYER + 2);

    this.impact = add.particles(0, 0, TEX.SPARK, {
      emitting: false,
      lifespan: 360,
      speed: { min: 80, max: 180 },
      scale: { start: 1.5, end: 0 },
      tint: [0xffffff, 0xff6b5a, 0xffd34d],
    }).setDepth(DEPTH.PLAYER + 2);

    // Screen-space streaks for the fast sections
    this.speedLines = add.particles(0, 0, TEX.STREAK, {
      emitting: false,
      x: GAME.WIDTH + 16,
      y: { min: FX.SPEEDLINE_Y[0], max: FX.SPEEDLINE_Y[1] },
      speedX: { min: -FX.SPEEDLINE_SPEED[1], max: -FX.SPEEDLINE_SPEED[0] },
      lifespan: 900,
      scaleX: { min: 1, max: 3 },
      alpha: FX.SPEEDLINE_ALPHA,
    }).setScrollFactor(0).setDepth(DEPTH.PLAYER - 2);

    this.confetti = add.particles(0, 0, TEX.CONFETTI, {
      emitting: false,
      x: { min: 0, max: GAME.WIDTH },
      y: -6,
      speedY: { min: 40, max: 140 },
      speedX: { min: -50, max: 50 },
      gravityY: 120,
      rotate: { min: 0, max: 360 },
      scale: { min: 1, max: 2 },
      lifespan: 2400,
      tint: FX.CONFETTI_COLORS,
    }).setScrollFactor(0).setDepth(DEPTH.HUD - 2);

    // Smashed boxes and gates
    this.debris = add.particles(0, 0, TEX.DOT, {
      emitting: false,
      lifespan: 700,
      speedX: { min: -40, max: 160 },
      speedY: { min: -180, max: -40 },
      gravityY: 520,
      scale: { min: 0.8, max: 1.8 },
      rotate: { min: 0, max: 360 },
      tint: FX.DEBRIS_COLORS,
    }).setDepth(DEPTH.PLAYER + 1);

    this.emitters = [this.dust, this.landDust, this.sparks, this.impact, this.speedLines, this.confetti, this.debris];
  }

  /** Bob + halo + light beam + sparkles so the steak reads as the goal from afar. */
  decorateSteak() {
    const steak = this.scene.steak;
    if (!steak) return;
    const cx = steak.x;
    const cy = steak.y - steak.height / 2;

    this.beam = this.scene.add.image(cx, steak.y - 4, TEX.BEAM)
      .setOrigin(0.5, 1)
      .setDisplaySize(FX.STEAK_BEAM_W, FX.STEAK_BEAM_H)
      .setTint(FX.STEAK_HALO_COLOR)
      .setAlpha(FX.STEAK_BEAM_ALPHA)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.PICKUP - 2);
    this.halo = this.scene.add.image(cx, cy, TEX.HALO)
      .setTint(FX.STEAK_HALO_COLOR)
      .setAlpha(FX.STEAK_HALO_ALPHA)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.PICKUP - 1);

    const tw = this.scene.tweens;
    tw.add({
      targets: [steak, this.halo],
      y: `-=${FX.STEAK_BOB_PX}`,
      duration: FX.STEAK_BOB_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    tw.add({
      targets: this.halo,
      scale: { from: 0.85, to: 1.2 },
      alpha: { from: FX.STEAK_HALO_ALPHA * 0.6, to: FX.STEAK_HALO_ALPHA },
      duration: FX.STEAK_HALO_PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    tw.add({
      targets: this.beam,
      alpha: { from: FX.STEAK_BEAM_ALPHA * 0.5, to: FX.STEAK_BEAM_ALPHA },
      duration: FX.STEAK_HALO_PULSE_MS * 1.5,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.steakSparkles = this.scene.add.particles(cx, cy, TEX.SPARK, {
      frequency: FX.STEAK_SPARKLE_EVERY_MS,
      x: { min: -22, max: 22 },
      y: { min: -14, max: 10 },
      speedY: { min: -30, max: -10 },
      lifespan: 700,
      scale: { start: 1, end: 0 },
      tint: [0xffffff, FX.STEAK_HALO_COLOR],
    }).setDepth(DEPTH.PICKUP + 1);
    this.emitters.push(this.steakSparkles);

    // Level 6: the golden steak gets rays, a second halo and glints on top
    this.golden = this.scene.model?.finish?.key === 'golden-steak';
    if (this.golden) this.decorateGolden(steak, cx, cy);

    // Phaser 4 filter glow (WebGL only; harmless to skip on Canvas)
    try {
      if (this.scene.game.renderer.type === Phaser.WEBGL && steak.enableFilters) {
        steak.enableFilters();
        steak.filters.internal.addGlow(FX.STEAK_HALO_COLOR, this.golden ? 5 : 3, 0, 1);
      }
    } catch (e) {
      // Glow is decoration only
    }
  }

  /** Grander finish for Level 6 (visual only). */
  decorateGolden(steak, cx, cy) {
    this.worldFx.decorateGolden(steak, cx, cy);
    this.beam.setDisplaySize(FX.GOLDEN_BEAM_W, FX.STEAK_BEAM_H).setAlpha(FX.GOLDEN_BEAM_ALPHA);
    this.halo2 = this.scene.add.image(cx, cy, TEX.HALO)
      .setTint(0xfff1b0).setScale(FX.GOLDEN_HALO_SCALE).setAlpha(FX.STEAK_HALO_ALPHA * 0.7)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.PICKUP - 2);
    this.scene.tweens.add({
      targets: this.halo2,
      scale: { from: FX.GOLDEN_HALO_SCALE * 0.85, to: FX.GOLDEN_HALO_SCALE * 1.15 },
      duration: FX.STEAK_HALO_PULSE_MS * 1.3,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.steakSparkles.frequency = FX.STEAK_SPARKLE_EVERY_MS / 2;
  }

  // --- per-frame ------------------------------------------------------------

  update(_time, delta) {
    const scene = this.scene;

    // Hit-stop counts real frame time and then releases the frozen managers
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta;
      if (this.hitStopMs <= 0) {
        this.setTimeScale(1);
        scene.time.timeScale = 1;
      }
    }

    // Ease back from the level-complete slow-mo
    if (this.slowMo) {
      this.slowMo.elapsed += delta;
      const t = Math.min(1, this.slowMo.elapsed / FX.SLOWMO_RECOVER_MS);
      this.setTimeScale(Phaser.Math.Linear(FX.SLOWMO_SCALE, 1, t * t));
      if (t >= 1) this.slowMo = null;
    }

    this.ability?.update(delta);
    this.worldFx.update(delta);
    this.ambience.update(delta);

    // Running dust
    const p = scene.player;
    if (p && !p.dead && gameState.mode === MODES.PLAYING && p.onGround) {
      this.dustMs += delta;
      if (this.dustMs >= FX.DUST_RUN_EVERY_MS) {
        this.dustMs = 0;
        this.dust.emitParticleAt(p.sprite.x - FX.FOOT_BACK_X, this.feetY() - 1, 1);
      }
    }
  }

  /** Copy the physics sprite onto the display sprite (after physics + camera). */
  syncView() {
    const s = this.player?.sprite;
    const v = this.view;
    if (!s || !v || !s.active) return;
    if (v.frame.name !== s.frame.name) v.setFrame(s.frame.name);
    v.angle = s.angle;
    v.alpha = s.alpha;
    if (this.player.dead && gameState.mode === MODES.DYING) {
      // Tumble spins around the centre
      v.setOrigin(0.5, 0.5).setPosition(s.x, s.y).setScale(1);
    } else {
      // Feet anchor so squash/stretch keeps him on the ground. While clinging,
      // shift so frame 14's paws (x = 47) meet the wall face (body ends at x = 37).
      // A horizontal squash scales around the centre, so keep the paws (23 px right of it) on the face.
      const cling = this.player.clinging ? ANIM.CLING_OFFSET_X + (1 - this.viewScale.x) * FX.CLING_PAW_DX : 0;
      v.setOrigin(0.5, 1)
        .setPosition(s.x + cling, s.y + PLAYER.FRAME_H / 2 + this.viewScale.dy + this.viewBob)
        .setScale(this.viewScale.x, this.viewScale.y);
    }
    this.worldFx?.postUpdate(this.scene.game.loop.delta);
  }

  /** After RunScene pins the camera: the dash nudge (display only, never accumulates). */
  lateSync() {
    const n = this.ability?.camNudge.x || 0;
    if (n && gameState.mode === MODES.PLAYING) {
      const cam = this.scene.cameras.main;
      cam.scrollX = Math.round(cam.scrollX + n);
    }
  }

  setTimeScale(k) {
    const scene = this.scene;
    scene.tweens.timeScale = k;
    for (const e of this.emitters) e.timeScale = k;
    // Arcade's timeScale is inverted (2 = half speed)
    scene.physics.world.timeScale = k > 0 ? 1 / k : 1;
  }

  squash(sx, sy, ms) {
    this.squashTween?.stop();
    this.viewScale.x = sx;
    this.viewScale.y = sy;
    this.squashTween = this.scene.tweens.add({
      targets: this.viewScale,
      x: 1,
      y: 1,
      duration: ms,
      ease: 'Back.easeOut',
    });
  }

  // --- event handlers -------------------------------------------------------

  /** y of Booker's feet (bottom of his body). On the ground this is GROUND_Y. */
  feetY() {
    const b = this.player?.body;
    return b ? b.y + b.height : WORLD.GROUND_Y;
  }

  onJump() {
    const s = this.player.sprite;
    this.squash(FX.STRETCH_X, FX.STRETCH_Y, FX.STRETCH_MS);
    this.landDust.emitParticleAt(s.x - 4, this.feetY() - 1, FX.DUST_JUMP_COUNT);
  }

  onLand() {
    const s = this.player.sprite;
    this.squash(FX.SQUASH_X, FX.SQUASH_Y, FX.SQUASH_MS);
    this.landDust.emitParticleAt(s.x, this.feetY() - 1, FX.DUST_LAND_COUNT);
  }

  onSmash(d) {
    if (!d) return;
    this.debris.emitParticleAt(d.x, d.y, BREAKABLE.DEBRIS);
    this.ability?.onSmash(d);
    this.scene.cameras.main.shake(FX.SMASH_SHAKE_MS, FX.SMASH_SHAKE_INTENSITY);
  }

  onBone(d) {
    if (d?.x === undefined) return; // the initial HUD sync carries no position
    this.sparks.emitParticleAt(d.x, d.y, FX.BONE_SPARK_COUNT);
    const cam = this.scene.cameras.main;
    // Pixel font (src/ui/PixelFont.js), snapped to whole pixels while it rises
    const x0 = d.x - cam.scrollX;
    const y0 = d.y - cam.scrollY - 14;
    const t = pxText(this.scene, x0, y0, `+${SCORE.BONE}`, {
      color: COLORS.SCORE_GOLD, align: 'center', valign: 'middle', scroll: 0, depth: DEPTH.HUD - 1,
    });
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FX.FLOAT_TEXT_MS,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const v = tw.getValue();
        relayout(t, x0, Math.round(y0 - FX.FLOAT_TEXT_RISE * v));
        t.setAlpha(1 - v);
      },
      onComplete: () => t.destroy(),
    });
  }

  onDied() {
    const scene = this.scene;
    const s = this.player.sprite;
    const cam = scene.cameras.main;

    // Hit-stop: freeze tweens, timers and physics for a beat (camera FX keep running)
    this.hitStopMs = FX.HIT_STOP_MS;
    this.slowMo = null;
    this.setTimeScale(0);
    scene.time.timeScale = 0;

    const [r, g, b] = FX.DEATH_FLASH_RGB;
    cam.flash(FX.DEATH_FLASH_MS, r, g, b, true);
    this.impact.emitParticleAt(s.x + 8, s.y, FX.DEATH_BURST_COUNT);
    this.impact.timeScale = 1; // the burst itself plays through the hit-stop
    this.speedLines.stop();
    // No fade to black: the GameOver overlay dims the frozen level instead.
  }

  onSection({ index, name }) {
    this.updateSpeedLines(index);
    this.banner('SPEED UP!', `${index + 1}. ${name.toUpperCase()}`);
  }

  onLevelStart({ attempt }) {
    this.updateSpeedLines(this.scene.sectionIndex);
    if (attempt > 1) this.scene.cameras.main.fadeIn(FX.RESPAWN_FADE_MS, 0, 0, 0);
    // The new ability is taught by the AbilityIntro card (src/ui/AbilityIntro.js), not here
    this.banner('GO!', null, 0.6);
  }

  onComplete() {
    const scene = this.scene;
    const s = this.player.sprite;
    this.speedLines.stop();
    this.setTimeScale(FX.SLOWMO_SCALE);
    this.slowMo = { elapsed: 0 };
    this.steakSparkles?.explode(this.golden ? FX.GOLDEN_WIN_SPARKLES : 24);
    if (this.golden && scene.steak && this.ability) {
      const cy = scene.steak.y - scene.steak.height / 2;
      this.ability.ring(scene.steak.x, cy, { tex: FXT.RING, sx: [0.6, 3.2], ms: 520, tint: FX.GOLDEN_RAY_COLOR });
      this.ability.ring(scene.steak.x, cy, { tex: FXT.RING, sx: [0.5, 2.2], ms: 420 });
    }
    this.sparks.emitParticleAt(s.x + 20, s.y, FX.BONE_SPARK_COUNT * 2);
    this.confetti.explode(FX.CONFETTI_COUNT);
    scene.cameras.main.flash(180, 255, 240, 200, true);
    // Happy hop on the display sprite
    scene.tweens.add({
      targets: this.viewScale,
      dy: -FX.WIN_HOP_PX,
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut',
    });
  }

  // --- helpers --------------------------------------------------------------

  updateSpeedLines(index) {
    const every = FX.SPEEDLINE_EVERY_MS[index] || 0;
    if (index >= FX.SPEEDLINE_FROM_SECTION && every > 0 && gameState.mode === MODES.PLAYING) {
      this.speedLines.frequency = every;
      this.speedLines.start();
    } else {
      this.speedLines.stop();
    }
  }

  /** Brief banner high in the sky band, clear of Booker and the obstacles. */
  banner(title, subtitle, holdMult = 1) {
    this.bannerObj?.destroy();
    const scene = this.scene;
    const c = scene.add.container(GAME.WIDTH / 2, FX.BANNER_Y).setScrollFactor(0).setDepth(DEPTH.HUD - 1);
    // Pixel font (src/ui/PixelFont.js) to match the HUD and menus
    c.add(pxText(scene, 0, 0, title, {
      scale: FX.BANNER_FONT_SCALE, color: COLORS.SCORE_GOLD, align: 'center', valign: 'middle',
    }));
    if (subtitle) {
      c.add(pxText(scene, 0, FX.BANNER_SUB_Y, subtitle, {
        color: COLORS.UI_TEXT, align: 'center', valign: 'middle',
      }));
    }
    c.setScale(0.5).setAlpha(0);
    this.bannerObj = c;
    scene.tweens.chain({
      targets: c,
      tweens: [
        { scale: 1, alpha: 1, duration: FX.BANNER_IN_MS, ease: 'Back.easeOut' },
        { y: FX.BANNER_Y - 10, alpha: 0, delay: FX.BANNER_HOLD_MS * holdMult, duration: FX.BANNER_OUT_MS, ease: 'Quad.easeIn' },
      ],
      onComplete: () => {
        if (this.bannerObj === c) this.bannerObj = null;
        c.destroy();
      },
    });
  }

  destroy() {
    for (const [ev, fn] of Object.entries(this.handlers)) eventBus.off(ev, fn);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncView, this);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.lateSync, this);
    this.ability?.destroy();
    this.worldFx?.destroy();
    this.ambience?.destroy();
    this.scene.tweens.timeScale = 1;
    this.scene.time.timeScale = 1;
  }
}
