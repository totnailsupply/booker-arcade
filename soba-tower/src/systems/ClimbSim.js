// =============================================================================
// ClimbSim — one climb, as pure simulation. ClimbScene runs it with a scene
// (views attached), node scripts run the very same code headless (scene = null):
// scripts/sim-climb.mjs (expert + sloppy bots) and the autoplay checks agree
// with the game because there is only one copy of the rules.
//
// One frame (step):
//   1. world clock      time += dt (moving platforms and crows are pure functions of it)
//   2. platforms        record prevY, move, cull/activate (pooled views)
//   3. hazards          crows patrol, tiles trigger/warn/fall, chimes sway
//   4. Soba             steering (instant reversal) + bounce gravity, wrap in x
//   5. landing          swept one-way test (Kinematics.findLanding) -> bounce /
//                       spring / crumble crack / finish
//   6. hazard contact   crow stomp (bounce, +50) beats a hit; a hit costs a life
//                       (ignored while invulnerable)
//   7. treats           pickup box overlap -> +25
//   8. lives/respawn    timers, invulnerability blink
//   9. camera ratchet   only moves up; Soba ~42% from the top
//  10. fail test        Soba's art fully below the view's bottom edge -> lose a life
// =============================================================================

import { SOBA, WORLD, CAMERA, CROW } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { findLanding, yToHeight } from '../core/Kinematics.js';
import { Soba, SOBA_STATE } from '../entities/Soba.js';
import { TreatField } from '../entities/Treat.js';
import { PlatformSpawner } from './PlatformSpawner.js';
import { HazardSystem } from './HazardSystem.js';
import { CameraRatchet } from './CameraRatchet.js';
import { LivesCheckpoint } from './LivesCheckpoint.js';
import { ScoreSystem } from './ScoreSystem.js';

export class ClimbSim {
  /**
   * @param {{scene?: Phaser.Scene|null, level: object, bot?: object|null,
   *          hooks?: {onComplete?: Function, onGameOver?: Function}}} opts
   */
  constructor({ scene = null, level, bot = null, hooks = {} }) {
    this.scene = scene;
    this.level = level;
    this.bot = bot;
    this.hooks = hooks;
    this.time = 0;
    this.lastDir = 0;

    gameState.treatsTotal = (level.treats || []).length;
    this.spawner = new PlatformSpawner(scene, level);
    this.hazards = new HazardSystem(scene, level);
    this.treats = new TreatField(scene, level);
    this.camera = new CameraRatchet(scene, level);
    this.soba = new Soba(scene, level.spawn.x, WORLD.STREET_Y - level.spawn.y);
    this.lives = new LivesCheckpoint({
      soba: this.soba,
      spawner: this.spawner,
      camera: this.camera,
      level,
      onGameOver: cause => this.gameOver(cause),
      onRespawnLanding: cushion => this.land(cushion),
      onRespawnReset: h => this.resetForRespawn(h),
    });
    this.score = new ScoreSystem(level);
  }

  /** Street start, or a debug start (startHeight / startZone) on a cushion. */
  placeStart(debug = {}) {
    if (debug.startHeight !== null && debug.startHeight !== undefined) {
      const h = debug.startHeight;
      const idx = this.lives.zoneIndexAt(h);
      this.lives.setCheckpoint(idx);
      const x = debug.startZone ? this.level.zones[idx].respawn.x : SOBA.START_X;
      this.hazards.resetForRespawn(h);
      const cushion = this.lives.makeCushion(x, h);
      this.camera.snapTo(this.camera.topFor(cushion.y, CAMERA.RESPAWN_FRAC));
      this.soba.placeAt(x, cushion.y);
      this.spawner.update(0, this.camera.top, this.time);
      this.land(cushion);
      return;
    }
    this.camera.snapTo(this.camera.maxTop);
    this.soba.placeAt(this.level.spawn.x, WORLD.STREET_Y - this.level.spawn.y);
    this.spawner.update(0, this.camera.top, this.time);
    this.land(this.spawner.street);
  }

  // --- one frame ------------------------------------------------------------------

  /**
   * @param {number} dt seconds (already clamped)
   * @param {-1|0|1} inputDir player steering (ignored when a bot drives)
   */
  step(dt, inputDir = 0) {
    const s = this.soba;
    const mode = gameState.mode;
    if (mode === MODES.PLAYING || mode === MODES.RESPAWNING) gameState.runTimeMs += dt * 1000;
    this.time += dt;
    const camTop = this.camera.top;

    this.spawner.update(dt, camTop, this.time);
    this.hazards.update(dt, this.time, { sobaHeight: yToHeight(s.y), camTop, playing: mode === MODES.PLAYING });
    this.emitWorldEvents();

    if (gameState.mode === MODES.PLAYING) {
      let dir = inputDir;
      if (this.bot) {
        dir = this.bot.decide({
          soba: s, platforms: this.spawner.active, deathY: this.camera.bottom + SOBA.ART_H,
          hazards: this.hazards.near(camTop), camTop, dt,
        });
      }
      this.lastDir = dir;
      const prevFeet = s.y;
      s.step(dt, dir);
      const p = findLanding(s.prevY, s.y, s.vy, s.x, this.spawner.active);
      if (p) this.land(p);
      if (gameState.mode === MODES.PLAYING) {
        const c = this.hazards.contact(s, prevFeet, this.lives.invulnerable);
        if (c?.stomp) this.stomp(c.stomp);
        else if (c?.hit) this.lives.loseLife('hit', c.hit);
      }
      if (gameState.mode === MODES.PLAYING) this.collectTreats();
    } else if (s.state === SOBA_STATE.HURT) {
      s.stepTumble(dt);
    }

    this.lives.update(dt);
    this.camera.update(dt, gameState.mode === MODES.PLAYING ? s.centerY : null);

    if (gameState.mode === MODES.PLAYING && s.top > this.camera.bottom) {
      this.lives.loseLife('fall');
    }
    gameState.heightM = Math.max(0, yToHeight(s.y)) / WORLD.PX_PER_M;
  }

  /** One-shot world events (crumble drops, tile warnings) for effects and audio. */
  emitWorldEvents() {
    for (const p of this.spawner.active) {
      if (p.justFell) {
        p.justFell = false;
        eventBus.emit(Events.CRUMBLE_FALL, { x: p.x, y: p.y, w: p.w });
      }
    }
    for (const h of this.hazards.list) {
      if (h.justWarned) {
        h.justWarned = false;
        eventBus.emit(Events.TILE_WARN, { x: h.x });
      }
    }
  }

  // --- outcomes of a frame ----------------------------------------------------------

  /** Soba landed on platform p (or is dropped onto a respawn cushion). */
  land(p) {
    const res = p.bounce(this.soba);
    const h = p.heightPx;
    const m = h / WORLD.PX_PER_M;
    if (m > gameState.maxHeightM) {
      gameState.maxHeightM = m;
      gameState.progress = Math.min(1, h / this.level.finish.y);
      eventBus.emit(Events.HEIGHT_CHANGED, {
        heightM: m, maxHeightM: gameState.maxHeightM, progress: gameState.progress,
      });
    }
    this.lives.onLanded(h);
    gameState.zone = this.lives.zoneIndexAt(h) + 1;
    if (res.finish) {
      this.soba.standOn(p);
      this.complete();
      return;
    }
    this.soba.bounceOff(p, res.velocityMult || 1);
    if (this.bot) this.bot.onBounce(p);
    if (res.crumble) eventBus.emit(Events.CRUMBLE, { x: p.x, y: p.y, w: p.w });
    if (res.spring) eventBus.emit(Events.SPRING, { x: p.x, y: p.y });
    eventBus.emit(Events.SOBA_BOUNCE, {
      type: p.type, x: Math.round(this.soba.x), y: Math.round(p.y), heightPx: Math.round(h), spring: !!res.spring,
    });
  }

  /** Landed on a crow's head: it tumbles away, Soba bounces, +50. */
  stomp(crow) {
    crow.stomp();
    gameState.stomps += 1;
    this.soba.bounceAt(Math.min(this.soba.y, crow.y - CROW.STOMP_TOP));
    if (this.bot) this.bot.onBounce(null);
    eventBus.emit(Events.STOMP, { stomps: gameState.stomps, x: Math.round(crow.x), y: Math.round(crow.y) });
    eventBus.emit(Events.SOBA_BOUNCE, {
      type: 'crow', x: Math.round(this.soba.x), y: Math.round(this.soba.y), heightPx: Math.round(yToHeight(this.soba.y)),
    });
  }

  collectTreats() {
    const got = this.treats.collect(this.soba);
    if (!got) return;
    for (const t of got) {
      gameState.treats += 1;
      eventBus.emit(Events.TREAT_COLLECTED, {
        treats: gameState.treats, total: gameState.treatsTotal, x: t.x, y: Math.round(t.y),
      });
    }
  }

  /** Respawn: crumbles come back, roof tiles above the respawn point re-arm. */
  resetForRespawn(respawnHeight) {
    this.spawner.resetForRespawn();
    this.hazards.resetForRespawn(respawnHeight);
  }

  gameOver(cause) {
    gameState.mode = MODES.GAME_OVER;
    const result = this.score.finalize(false);
    gameState.result = result;
    eventBus.emit(Events.GAME_OVER, { result, cause });
    if (this.hooks.onGameOver) this.hooks.onGameOver(result, cause);
  }

  complete() {
    if (gameState.mode !== MODES.PLAYING) return;
    gameState.mode = MODES.COMPLETE;
    const result = this.score.finalize(true);
    gameState.result = result;
    eventBus.emit(Events.LEVEL_COMPLETE, { result });
    if (this.hooks.onComplete) this.hooks.onComplete(result);
  }

  // --- views + state ------------------------------------------------------------------

  /** Views that aren't platforms (platforms sync inside spawner.update). */
  syncViews(camTop) {
    this.hazards.syncViews(camTop);
    this.treats.syncViews(camTop, this.time);
    this.soba.render();
  }

  zoneName() {
    const z = this.level.zones[Math.max(0, (gameState.zone || 1) - 1)];
    return z ? z.name : '';
  }

  /** State for render_game_to_text(). */
  snapshot(camTop) {
    return {
      worldTime: Math.round(this.time * 100) / 100,
      zoneName: this.zoneName(),
      platforms: this.spawner.onScreen(camTop).map(p => p.snapshot()),
      platformsActive: this.spawner.active.length,
      platformViews: this.spawner.viewsCreated,
      hazards: this.hazards.snapshot(camTop),
      treatsOnScreen: this.treats.onScreen(camTop),
      treatsCollected: gameState.treats,
      finish: { y: Math.round(this.spawner.roof.y), heightM: Math.round(this.level.finish.y / WORLD.PX_PER_M * 10) / 10 },
    };
  }

  destroy() {
    this.score.destroy();
    this.spawner.release();
  }
}
