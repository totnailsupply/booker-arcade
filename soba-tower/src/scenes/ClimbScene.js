import Phaser from 'phaser';
import {
  GAME, SOBA, DEPTH, TIMING, TRANSITION, FINISH, COLORS, LIVES, CROW, TILE, CHIMES, TREAT, FINALE,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { getDebugOptions } from '../core/Debug.js';
import { yToHeight, FOOT_HALF } from '../core/Kinematics.js';
import { LEVEL1 } from '../levels/level1.js';
import { Bell } from '../entities/Bell.js';
import { ClimbSim } from '../systems/ClimbSim.js';
import { SteerInput } from '../systems/SteerInput.js';
import { AutoClimber } from '../systems/AutoClimber.js';
import { Effects } from '../systems/Effects.js';
import { Backdrop } from '../systems/Backdrop.js';
import { Ambient } from '../systems/Ambient.js';
import { Finale } from '../systems/Finale.js';
import { Hud } from '../ui/Hud.js';
import { BestFlag } from '../ui/BestFlag.js';

// -----------------------------------------------------------------------------
// The climb. All rules live in ClimbSim (systems/ClimbSim.js), which node
// scripts run headless; this scene adds input, views and the screens around it.
// One frame (update):
//   1. input            steering (keys / touch), or the bot with ?autoplay=1
//   2. sim.step         world clock, platforms, hazards, Soba, landing, contacts,
//                       treats, lives/respawn, camera ratchet, fail test
//   3. outcomes         complete -> bell rings, Results after a beat;
//                       game over -> Results (a fatal hit tumbles first)
//   4. render           Soba + ghost, juice (squash/lean/rim), effects, sky,
//                       lanterns, ambient particles, finale, HUD, hitboxes (?debug=1)
// Hit-stop / slow motion (Effects.simScale) scale the sim's dt for a frame (0 =
// frozen); every rule still runs inside ClimbSim, so outcomes don't change.
// -----------------------------------------------------------------------------

export class ClimbScene extends Phaser.Scene {
  constructor() {
    super('ClimbScene');
  }

  create() {
    const debug = getDebugOptions();
    this.debug = debug;
    this.level = LEVEL1;
    gameState.beginRun();
    // The finale zooms around the bell; a retry always starts at zoom 1
    this.cameras.main.setZoom(1).setOrigin(0.5, 0.5);

    this.backdrop = new Backdrop(this, this.level);
    this.ambient = new Ambient(this, this.level);
    this.bestFlag = new BestFlag(this, gameState.bestHeightM);
    this.sim = new ClimbSim({
      scene: this,
      level: this.level,
      bot: debug.autoplay ? new AutoClimber() : null,
      hooks: {
        onComplete: () => this.onComplete(),
        onGameOver: (result, cause) => this.onGameOver(result, cause),
      },
    });
    this.bell = new Bell(this, this.level.finish);
    this.steer = new SteerInput(this);
    this.hud = new Hud(this, this.level, () => this.pauseGame());
    this.effects = new Effects(this, this.sim, this.level);
    this.finale = new Finale(this, this.effects, this.hud, this.bell);
    this.debugGfx = debug.hitboxes ? this.add.graphics().setDepth(DEPTH.DEBUG) : null;
    this.completeMs = 0;
    this.gameOverMs = 0;
    this.leaving = false;
    this.resumedAt = -Infinity;

    this.sim.placeStart(debug);
    this.effects.armMilestones();

    // Pause: P / Esc, the HUD button, and when the tab is hidden
    this.input.keyboard.on('keydown-P', this.pauseGame, this);
    this.input.keyboard.on('keydown-ESC', this.pauseGame, this);
    this.onVisibility = () => {
      if (document.hidden) this.pauseGame();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    // Finish: a fresh key / tap after a beat skips the fireworks
    this.onSkip = (event) => {
      if (event?.repeat) return;
      if (gameState.mode !== MODES.COMPLETE || this.leaving) return;
      if (FINALE.RESULTS_AFTER_MS - this.completeMs < FINALE.SKIP_AFTER_MS) return;
      this.toResults();
    };
    this.input.keyboard.on('keydown', this.onSkip);
    this.input.on('pointerdown', this.onSkip);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    eventBus.emit(Events.LEVEL_START, { attempt: gameState.attempts, startHeight: yToHeight(this.sim.soba.y) });
    eventBus.emit(Events.MUSIC_GAMEPLAY);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
  }

  get soba() {
    return this.sim?.soba;
  }

  // --- loop -----------------------------------------------------------------------

  update(_time, delta) {
    const dt = Math.min(delta, TIMING.MAX_DT_MS) / 1000;
    const k = this.effects.simScale(dt);
    const dir = this.steer.poll();
    if (k > 0) this.sim.step(dt * k, dir);
    if (this.sim.bot) this.steer.setBotDir(this.sim.lastDir);

    if (gameState.mode === MODES.COMPLETE && !this.leaving) {
      this.completeMs -= dt * 1000;
      if (this.completeMs <= 0) this.toResults();
    }
    if (gameState.mode === MODES.GAME_OVER && !this.leaving && this.gameOverMs > 0) {
      this.gameOverMs -= dt * 1000;
      if (this.gameOverMs <= 0) this.toResultsNow();
    }

    const camTop = this.cameras.main.scrollY;
    this.sim.syncViews(camTop);
    this.effects.update(dt, camTop);
    this.backdrop.update(camTop, this.sim.time);
    this.ambient.update(dt, camTop);
    this.finale.update(dt);
    this.hud.update(dt, Math.max(0, yToHeight(this.sim.soba.y)));
    if (this.debugGfx) this.drawHitboxes();
  }

  drawHitboxes() {
    const g = this.debugGfx;
    const s = this.sim.soba;
    g.clear();
    for (const p of this.sim.spawner.active) {
      if (p.type === 'street') continue;
      if (p.type === 'roof') {
        g.lineStyle(1, COLORS.DEBUG_PLATFORM, 1);
        g.lineBetween(p.x - p.w / 2, p.y, p.x + p.w / 2, p.y);
        continue;
      }
      g.lineStyle(1, p.type === 'springpad' ? COLORS.DEBUG_PAD : COLORS.DEBUG_PLATFORM, p.solid ? 1 : 0.3);
      g.strokeRect(p.x - p.w / 2, p.y, p.w, p.type === 'springpad' ? 2 : p.h);
    }
    for (const h of this.sim.hazards.list) {
      if (h.type === 'crow' && h.live) {
        g.lineStyle(1, COLORS.DEBUG_STOMP, 1);
        g.strokeRect(h.x - CROW.STOMP_HALF_W, h.y - CROW.STOMP_TOP, CROW.STOMP_HALF_W * 2, CROW.STOMP_TOP + CROW.STOMP_SLOP);
        g.lineStyle(1, COLORS.DEBUG_HURT, 1);
        g.strokeRect(h.x - CROW.HURT_W / 2, h.y - CROW.HURT_H / 2, CROW.HURT_W, CROW.HURT_H);
      } else if (h.type === 'tile' && h.state === 'falling') {
        g.lineStyle(1, COLORS.DEBUG_HURT, 1);
        g.strokeRect(h.x - TILE.HURT_W / 2, h.y - TILE.HURT_H / 2, TILE.HURT_W, TILE.HURT_H);
      } else if (h.type === 'chimes') {
        g.lineStyle(1, COLORS.DEBUG_HURT, 1);
        g.strokeRect(h.x - CHIMES.HURT_W / 2, h.y - CHIMES.HURT_H / 2, CHIMES.HURT_W, CHIMES.HURT_H);
      }
    }
    g.lineStyle(1, COLORS.DEBUG_TREAT, 0.8);
    for (const t of this.sim.treats.list) {
      if (!t.collected) g.strokeRect(t.x - TREAT.HALF, t.y - TREAT.HALF, TREAT.HALF * 2, TREAT.HALF * 2);
    }
    g.lineStyle(1, COLORS.DEBUG_BODY, 1);
    g.strokeRect(s.x - SOBA.BODY_W / 2, s.y - SOBA.BODY_H, SOBA.BODY_W, SOBA.BODY_H);
    g.fillStyle(COLORS.DEBUG_FOOT, 1);
    g.fillRect(s.x - FOOT_HALF, s.y - 1, FOOT_HALF * 2, 2);
  }

  // --- outcomes -----------------------------------------------------------------

  onGameOver(result, cause) {
    if (cause === 'hit') {
      // Let the tumble read before the Results screen
      this.gameOverMs = LIVES.GAMEOVER_HIT_MS;
      return;
    }
    // A fall is its own beat: straight to Results (any key retries there)
    this.toResultsNow();
  }

  onComplete() {
    this.bell.ring();
    this.completeMs = FINALE.RESULTS_AFTER_MS;
    this.finale.start();
    // Hop aside so Soba stands next to the bell (facing it) instead of in front of it
    const s = this.sim.soba;
    const dx = s.x - this.bell.x;
    const side = dx >= 0 ? 1 : -1;
    s.facing = -side;
    if (Math.abs(dx) < FINISH.BESIDE_DX) {
      const y0 = s.y;
      this.tweens.add({ targets: s, x: this.bell.x + side * FINISH.BESIDE_DX, duration: FINISH.HOP_MS, ease: 'Sine.easeOut' });
      this.tweens.add({
        targets: s, y: y0 - FINISH.HOP_PX, duration: FINISH.HOP_MS / 2, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => { s.y = y0; },
      });
    }
  }

  toResultsNow() {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('ResultsScene', { result: gameState.result });
  }

  toResults() {
    this.leaving = true;
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('ResultsScene', { result: gameState.result });
    });
  }

  // --- pause ----------------------------------------------------------------------

  pauseGame() {
    const mode = gameState.mode;
    if (mode !== MODES.PLAYING && mode !== MODES.RESPAWNING) return;
    // The key that resumed the game must not pause it again in the same press
    if (this.time.now - this.resumedAt < TIMING.PAUSE_DEBOUNCE_MS) return;
    this.modeBeforePause = mode;
    gameState.mode = MODES.PAUSED;
    eventBus.emit(Events.GAME_PAUSE);
    this.scene.launch('PauseScene');
    this.scene.pause();
  }

  onResume() {
    gameState.mode = this.modeBeforePause || MODES.PLAYING;
    this.resumedAt = this.time.now;
    this.steer.clear();
    eventBus.emit(Events.GAME_RESUME);
  }

  // --- test hook ------------------------------------------------------------------

  /** State for render_game_to_text(). */
  snapshot() {
    const camTop = this.cameras.main.scrollY;
    const s = this.sim.soba;
    return {
      soba: { ...s.snapshot(), heightPx: Math.round(yToHeight(s.y)), invulnerable: this.sim.lives.invulnerable },
      cameraY: Math.round(camTop),
      cameraBottomY: Math.round(camTop + GAME.HEIGHT),
      ...this.sim.snapshot(camTop),
      bestFlagM: this.bestFlag.bestM || null,
      input: this.steer.debugState(),
    };
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.input.keyboard.off('keydown-P', this.pauseGame, this);
    this.input.keyboard.off('keydown-ESC', this.pauseGame, this);
    this.input.keyboard.off('keydown', this.onSkip);
    this.input.off('pointerdown', this.onSkip);
    this.steer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
    this.bestFlag?.destroy();
    this.sim?.destroy();
  }
}
