import Phaser from 'phaser';
import {
  GAME, WORLD, PLAYER, TIMING, SPEED, STEAK, DEATH, TRANSITION, POUNCE, BREAKABLE,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { getDebugOptions, resolveStartX } from '../core/Debug.js';
import { getLevel, LEVELS } from '../levels/index.js';
import { abilityFlags, parseAbilityList } from '../core/Abilities.js';
import { SaveData } from '../core/SaveData.js';
import { enableDeterministic, FRAME_MS } from '../core/Deterministic.js';
import { Player } from '../entities/Player.js';
import { JumpInput } from '../systems/JumpInput.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { AutoPilot } from '../systems/AutoPilot.js';
import { BotPilot } from '../systems/BotPilot.js';
import { Hud } from '../ui/Hud.js';
import { AbilityIntro } from '../ui/AbilityIntro.js';
import { Effects } from '../systems/Effects.js';
import {
  buildLevelModel, wallFaceAt, updraftAt, landingInMs, safeSpawnX,
} from '../world/LevelModel.js';
import { LevelWorld } from '../world/LevelWorld.js';

// -----------------------------------------------------------------------------
// How scrolling works
//   The world is static and Booker really runs: his Arcade body gets
//   velocity.x = current speed every frame. The camera is not "following" with
//   lerp; after physics has moved him (scene POST_UPDATE) we set
//   camera.scrollX = player.x - PLAYER.SCREEN_X, so he stays pinned at screen
//   x = 100 while obstacles, pits and bones are plain world objects. When a
//   wall blocks him, the camera simply stops with him. Parallax layers are
//   screen-fixed TileSprites whose tilePositionX = scrollX * factor.
//
// Levels: scene data { levelId } (default: gameState.levelId / ?level / level1).
// Everything a level contains is built by LevelWorld from a LevelModel; the
// bot's simulator uses the same model, so its predictions match the game.
//
// Timing: gameplay is tuned on fixed 1/60 s frames, each one physics step then
// one gameplay update (controller, speed, movers, steam clocks, timers,
// hit-stop). Deterministic mode (?det=1) runs exactly that, one frame per
// step. In real time the display may run at 30-144 Hz with hitches, so Arcade's
// own per-frame update is switched off and update() runs whole ticks (physics
// step + gameplay update) from an accumulator: 0-3 per frame, never more, so a
// long frame slows game time instead of jumping it. Same inputs, same run, at
// any frame rate (scripts/realtime-check.mjs).
// -----------------------------------------------------------------------------

export class RunScene extends Phaser.Scene {
  constructor() {
    super('RunScene');
  }

  init(data) {
    const debug = getDebugOptions();
    this.levelId = data?.levelId || gameState.levelId || debug.level || 'level1';
  }

  create() {
    const debug = getDebugOptions();
    this.debug = debug;
    if (debug.det) enableDeterministic(this.game);
    // Real time: RunScene.update steps physics itself, in fixed ticks
    this.fixedTicks = !debug.det;
    this.ticks = 0;
    this.tickAcc = 0;
    if (this.fixedTicks) {
      this.physics.disableUpdate();
      this.useGameClockForTweens();
    } else {
      delete this.tweens.getDelta;   // Phaser's own (Date.now) clock
    }

    this.entry = getLevel(this.levelId, debug.room) || LEVELS[0];
    this.levelId = this.entry.id;
    this.level = this.entry.data;
    const parsed = parseAbilityList(debug.abilities);
    this.abilities = parsed ?? this.entry.abilities;
    this.flags = abilityFlags(this.abilities);

    if (gameState.levelId !== this.levelId) gameState.reset(this.levelId);
    gameState.beginAttempt();
    SaveData.recordAttempt(this.levelId);
    this.bestProgress = SaveData.getLevel(this.levelId).bestProgress;

    this.model = buildLevelModel(this.level);
    // Debug starts (?x=, ?start=) snap back out of walls, pits and hazards
    const debugX = resolveStartX(this.level, debug);
    this.startX = debugX === null ? this.level.startX : safeSpawnX(this.model, debugX, this.level.startX);
    this.speed = this.sectionAt(this.startX).speed;
    this.sectionIndex = this.sectionIndexAt(this.startX);
    gameState.speed = this.speed;
    gameState.section = this.sectionIndex + 1;
    this.freezeMs = 0;

    this.physics.world.setBounds(0, 0, this.level.length, GAME.HEIGHT * 2);
    if (debug.physicsDebug) this.physics.world.createDebugGraphic();

    this.world = new LevelWorld(this, this.model, this.entry.theme, this.startX);
    this.world.build();
    // Level 1 names kept for the bot, Effects and snapshot
    this.bgLayers = this.world.bgLayers;
    this.groundBodies = this.world.groundBodies;
    this.obstacles = this.world.obstacles;
    this.obstacleList = this.world.obstacleList;
    this.bones = this.world.bones;
    this.steak = this.world.steak;
    this.gaps = this.model.gaps;
    this.segments = this.model.segments;
    gameState.bonesTotal = (this.level.bones || []).length;

    const model = this.model;
    this.player = new Player(this, this.startX, this.flags, {
      wallFaceAt: (x, y, w, h) => wallFaceAt(model, x, y, w, h),
      updraftAt: (x, y, w, h) => updraftAt(model, x, y, w, h),
      landingInMs: (x, y, w, h, vy, vx, maxMs, glide) => landingInMs(model, x, y, w, h, vy, vx, maxMs, glide),
    });
    this.player.onStuck = () => this.die('wall');

    const ps = this.player.sprite;
    const w = this.world;
    this.physics.add.collider(ps, this.groundBodies);
    this.physics.add.overlap(ps, this.obstacles, () => this.die('obstacle'));
    this.physics.add.overlap(ps, this.bones, (_p, bone) => this.collectBone(bone));
    this.physics.add.overlap(ps, this.steak, () => this.complete());
    // Levels 2-6 (only when the level has them, so Level 1 runs exactly as before)
    if (model.platforms.length) this.physics.add.collider(ps, w.platformBodies);
    if (model.walls.length) this.physics.add.collider(ps, w.wallBodies);
    if (w.hazardList.length) this.physics.add.overlap(ps, w.hazards, (_p, o) => this.die(o.getData('type')));
    if (model.movers.some(m => m.kind === 'enemy')) {
      this.physics.add.overlap(ps, w.enemies, (_p, o) => this.touchEnemy(o));
    }
    if (model.breakables.length) this.physics.add.overlap(ps, w.breakables, (_p, o) => this.touchBreakable(o));
    if (model.steams.length) {
      this.physics.add.overlap(ps, w.steamBodies, () => this.die('steam'),
        (_p, z) => w.isSteamOn(z.getData('steam')));
    }

    this.input_ = new JumpInput(this);
    this.autopilot = null;
    this.abilityIntro = null;   // this object is reused across restarts and visits
    if (debug.autoplay) {
      // A new jitter sequence per attempt (attempt 1 uses ?seed itself)
      const opts = { jitterMs: debug.botJitterMs, seed: debug.seed + (gameState.attempts - 1) * 7919 };
      this.autopilot = this.entry.bot === 'legacy' && !parsed
        ? new AutoPilot(this, this.input_, opts)
        : new BotPilot(this, this.input_, { ...opts, botPlan: this.level.botPlan || [] });
    }
    this.scoreSystem = new ScoreSystem();
    this.hud = new Hud(this);
    this.hud.setTips(this.level.tips, gameState.attempts, this.startX);   // UI: level tips toast
    this.effects = new Effects(this);

    this.syncCamera();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncCamera, this);

    // Pause: P / Escape (not their auto-repeat), the HUD pause button, and when the tab is hidden.
    // resumedAt is game time; reset here because Phaser reuses this object across scene.restart.
    this.resumedAt = -Infinity;
    this.input.keyboard.on('keydown-P', (e) => { if (!e?.repeat) this.pauseGame(); });
    this.input.keyboard.on('keydown-ESC', (e) => { if (!e?.repeat) this.pauseGame(); });
    // While the ability card is up the run waits; it pauses as soon as the card closes.
    this.pauseAfterIntro = false;
    const pauseOrDefer = () => {
      if (gameState.mode === MODES.INTRO) this.pauseAfterIntro = true;
      else this.pauseGame();
    };
    this.onVisibility = () => {
      if (document.hidden) pauseOrDefer();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    // ...and when the window loses focus (another app or window in front). Bot runs
    // (?autoplay) keep going: they are QA tools, often run side by side.
    this.onBlur = pauseOrDefer;
    if (!debug.autoplay) this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    eventBus.emit(Events.BONE_COLLECTED, { bones: 0, total: gameState.bonesTotal });
    this.emitDistance();
    // UI: a level that brings a new ability holds the run for its intro card first
    const startRun = () => {
      if (gameState.attempts === 1) this.hud.showLevelName(this.entry);
      eventBus.emit(Events.LEVEL_START, { attempt: gameState.attempts, startX: this.startX, levelId: this.levelId });
    };
    if (AbilityIntro.shouldShow(this)) {
      gameState.mode = MODES.INTRO;
      this.physics.world.pause();
      this.abilityIntro = new AbilityIntro(this, () => {
        this.physics.world.resume();
        gameState.mode = MODES.PLAYING;
        this.input_.clear();
        startRun();
        // The tab was hidden or the window lost focus while the card was up
        if (this.pauseAfterIntro) {
          this.pauseAfterIntro = false;
          this.pauseGame();
        }
      });
    } else {
      startRun();
    }
    eventBus.emit(Events.MUSIC_GAMEPLAY, { levelId: this.levelId, variant: this.entry.music });

    if (gameState.attempts === 1) this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.exposeTestHooks();
  }

  // --- helpers --------------------------------------------------------------

  sectionIndexAt(x) {
    const s = this.level.sections;
    for (let i = s.length - 1; i >= 0; i--) if (x >= s[i].startX) return i;
    return 0;
  }

  sectionAt(x) {
    return this.level.sections[this.sectionIndexAt(x)];
  }

  get parSeconds() {
    if (Number.isFinite(this.level.parSeconds)) return this.level.parSeconds;
    const s = this.level.sections;
    let t = 0;
    for (let i = 0; i < s.length; i++) {
      const from = Math.max(s[i].startX, this.level.startX);
      const to = i + 1 < s.length ? s[i + 1].startX : this.level.finishX;
      t += Math.max(0, to - from) / s[i].speed;
    }
    return t;
  }

  emitDistance() {
    const total = this.level.finishX - this.level.startX;
    gameState.distance = Math.max(0, Math.round(this.player.sprite.x - this.startX));
    gameState.progress = Phaser.Math.Clamp((this.player.sprite.x - this.level.startX) / total, 0, 1);
    eventBus.emit(Events.DISTANCE_CHANGED, { distance: gameState.distance, progress: gameState.progress });
  }

  syncCamera() {
    if (!this.player) return;
    if (gameState.mode === MODES.PLAYING) {
      this.cameras.main.scrollX = Math.round(this.player.sprite.x - PLAYER.SCREEN_X);
    }
    const sx = this.cameras.main.scrollX;
    for (const layer of this.bgLayers) layer.tilePositionX = Math.round(sx * layer.parallax);
  }

  /** Gameplay hit-stop: physics and gameplay updates pause for ms (visuals keep running). */
  freeze(ms) {
    if (ms <= 0) return;
    this.freezeMs = Math.max(this.freezeMs, ms);
    this.physics.world.pause();
  }

  // --- loop -----------------------------------------------------------------

  update(time, delta) {
    if (!this.fixedTicks) {
      // Deterministic mode: Arcade has just stepped once (fixed 1/60 s frames)
      this.stepGame(Math.min(delta, TIMING.MAX_DT_MS));
      return;
    }
    const world = this.physics.world;
    if (this.ticks === 0) {
      // The scene's first frame: as in a deterministic run, gameplay starts
      // without a physics step (bodies only sync to their sprites)
      this.ticks = 1;
      world.update(time, 0);
      this.stepGame(FRAME_MS);
      world.postUpdate();
      return;
    }
    // Whole ticks only: physics step, then the gameplay update that reads it.
    // Raw frame time, so a hitch is never smeared into a fast-forward.
    this.tickAcc += Math.min(this.game.loop.rawDelta, TIMING.MAX_TICKS_PER_FRAME * FRAME_MS);
    for (let n = 0; n < TIMING.MAX_TICKS_PER_FRAME && this.tickAcc >= FRAME_MS - TIMING.TICK_SNAP_MS; n++) {
      this.tickAcc -= FRAME_MS;
      this.ticks += 1;
      world.update(time, FRAME_MS);
      this.stepGame(FRAME_MS);
      world.postUpdate();
      if (!this.player) break;   // the scene shut down mid-frame
    }
  }

  /**
   * Real time: this scene's tweens run on game time instead of Date.now(). The
   * bones bob on a tween and their bodies follow it, so a pickup at the edge of
   * a bob must not depend on a hitch that game time skipped. Visual tweens slow
   * with the game during a capped hitch too. Called during the UPDATE event,
   * before update() adds this frame's time, hence the pending frame time.
   */
  useGameClockForTweens() {
    let last = null;
    this.tweens.getDelta = () => {
      const now = this.ticks * FRAME_MS + this.tickAcc
        + Math.min(this.game.loop.rawDelta, TIMING.MAX_TICKS_PER_FRAME * FRAME_MS);
      const d = last === null ? 0 : now - last;
      last = now;
      return d;
    };
  }

  /** One gameplay update of dt ms (a fixed 1/60 s tick, after its physics step). */
  stepGame(dt) {
    if (gameState.mode !== MODES.PLAYING) {
      this.world.update(dt, this.player.sprite.x, false);
      return;
    }
    gameState.runTimeMs += dt;
    gameState.totalTimeMs += dt;

    if (this.freezeMs > 0) {
      this.freezeMs -= dt;
      if (this.freezeMs > 0) return;
      this.freezeMs = 0;
      this.physics.world.resume();
    }

    // Speed: lerp toward the current section's target
    const idx = this.sectionIndexAt(this.player.sprite.x);
    if (idx !== this.sectionIndex) {
      this.sectionIndex = idx;
      gameState.section = idx + 1;
      const sec = this.level.sections[idx];
      eventBus.emit(Events.SECTION_CHANGED, { index: idx, name: sec.name, speed: sec.speed });
    }
    const target = this.level.sections[idx].speed;
    this.speed += (target - this.speed) * (1 - Math.exp(-SPEED.LERP_RATE * dt / 1000));
    gameState.speed = this.speed;

    if (this.autopilot) {
      this.autopilot.update(dt, this.player, this.obstacleList, this.gaps, this.speed);
    }
    this.player.update(dt, this.speed, this.input_.poll());
    if (gameState.mode !== MODES.PLAYING) return;   // stuck against a wall
    this.world.update(dt, this.player.sprite.x, true);
    this.emitDistance();

    // Past the finish without touching it (a jump or glide over the steak). A run
    // along the ground touches the steak ~40 px earlier, so this never fires there.
    if (this.player.sprite.x >= this.level.finishX) {
      this.complete();
      return;
    }

    // Fell into a pit
    if (this.player.body.y > WORLD.GROUND_Y + WORLD.PIT_DEATH_DEPTH) this.die('pit');
  }

  // --- events ---------------------------------------------------------------

  collectBone(bone) {
    if (!bone.active || gameState.mode !== MODES.PLAYING) return;
    bone.disableBody(true, true);
    gameState.bones += 1;
    eventBus.emit(Events.BONE_COLLECTED, {
      bones: gameState.bones, total: gameState.bonesTotal, x: bone.x, y: bone.y,
    });
  }

  /** Stomp from above with pounce; anything else is a hit. */
  touchEnemy(o) {
    if (gameState.mode !== MODES.PLAYING || !o.body.enable) return;
    const pb = this.player.body;
    const eb = o.body;
    const falling = pb.velocity.y > 0 || pb.prev.y < pb.y;
    const prevFeet = pb.prev.y + pb.height;
    const fromAbove = prevFeet <= eb.y + eb.height / 2 + POUNCE.STOMP_TOLERANCE;
    if (this.flags.pounce && falling && fromAbove) {
      const type = o.getData('type');
      this.world.stompEnemy(o);
      this.player.pounce(type);
      eventBus.emit(Events.ENEMY_STOMPED, { type, x: o.x, y: o.y });
      this.freeze(POUNCE.FREEZE_MS);
      return;
    }
    this.die(o.getData('type'));
  }

  /** A dash smashes a breakable; any other touch is a hit. */
  touchBreakable(o) {
    if (gameState.mode !== MODES.PLAYING || !o.body.enable) return;
    if (this.player.ctrl.dashing) {
      const type = o.getData('type');
      const x = o.x;
      const y = o.y - o.height / 2;
      this.world.smashBreakable(o);
      eventBus.emit(Events.BREAKABLE_SMASHED, { type, x, y });
      this.freeze(BREAKABLE.FREEZE_MS);
      return;
    }
    this.die(o.getData('type'));
  }

  die(cause) {
    if (gameState.mode !== MODES.PLAYING) return;
    gameState.mode = MODES.DYING;
    if (this.freezeMs > 0) {
      this.freezeMs = 0;
      this.physics.world.resume();
    }
    this.player.die();
    this.cameras.main.shake(DEATH.SHAKE_MS, DEATH.SHAKE_INTENSITY);
    const progress = gameState.progress;
    const save = SaveData.recordDeath(this.levelId, progress);
    const death = {
      attempt: gameState.attempts,
      x: Math.round(this.player.sprite.x),
      cause,
      progress: Math.round(progress * 1000) / 1000,
    };
    gameState.deathLog.push(death);
    gameState.lastDeath = { ...death, bestProgress: save.bestProgress, isNewBestProgress: save.isNewBestProgress };
    eventBus.emit(Events.PLAYER_DIED, { cause, x: this.player.sprite.x, attempt: gameState.attempts, progress });
    eventBus.emit(Events.SPECTACLE_HIT, { cause });
    if (save.isNewBestProgress) eventBus.emit(Events.NEW_BEST_PROGRESS, { levelId: this.levelId, progress });
    this.time.delayedCall(DEATH.DURATION_MS, () => this.showGameOver());
  }

  showGameOver() {
    gameState.mode = MODES.GAMEOVER;
    const d = gameState.lastDeath;
    const data = {
      levelId: this.levelId,
      levelName: this.entry.name,
      progress: d.progress,
      bestProgress: d.bestProgress,
      isNewBestProgress: d.isNewBestProgress,
      attempt: d.attempt,
      cause: d.cause,
    };
    eventBus.emit(Events.GAME_OVER_SHOWN, data);
    this.scene.launch('GameOverScene', data);
    this.scene.pause();
  }

  /** Called by GameOverScene. */
  retry() {
    eventBus.emit(Events.GAME_RESTART);
    this.scene.stop('GameOverScene');
    this.scene.restart({ levelId: this.levelId });
  }

  complete() {
    if (gameState.mode !== MODES.PLAYING) return;
    gameState.mode = MODES.COMPLETE;
    if (this.freezeMs > 0) {
      this.freezeMs = 0;
      this.physics.world.resume();
    }
    this.player.win();
    const result = this.scoreSystem.finalize(this.parSeconds);
    result.levelId = this.levelId;
    const prev = SaveData.getLevel(this.levelId);   // UI: bests before this run (new-best callouts)
    const save = SaveData.recordCompletion(this.levelId, result);
    result.isNewBest = save.isNewBest;
    result.best = save.best.score;
    result.firstClear = save.firstClear;
    gameState.bestScore = save.best.score;
    gameState.result = result;
    gameState.botStats = this.autopilot?.debugState ? this.autopilot.debugState() : null;
    eventBus.emit(Events.LEVEL_COMPLETE, result);
    if (save.unlocked) eventBus.emit(Events.LEVEL_UNLOCKED, save.unlocked);
    this.time.delayedCall(STEAK.COMPLETE_DELAY_MS, () => {
      this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('LevelCompleteScene', { result, levelId: this.levelId, unlocked: save.unlocked, prev });
      });
    });
  }

  pauseGame() {
    if (gameState.mode !== MODES.PLAYING) return;
    // The press that resumed the game must not pause it again. Game-loop time, not
    // the wall clock: in deterministic mode game time runs far ahead of real time.
    if (this.game.loop.time - this.resumedAt < TIMING.PAUSE_DEBOUNCE_MS) return;
    gameState.mode = MODES.PAUSED;
    eventBus.emit(Events.GAME_PAUSE);
    this.scene.launch('PauseScene', { levelId: this.levelId });
    this.scene.pause();
  }

  onResume() {
    if (gameState.mode !== MODES.PAUSED) return;
    gameState.mode = MODES.PLAYING;
    this.resumedAt = this.game.loop.time;
    this.input_.clear();
    eventBus.emit(Events.GAME_RESUME);
  }

  /** Dev hooks for scripts (ability-check): direct button control. */
  exposeTestHooks() {
    window.__RUN__ = {
      press: () => this.input_?.botPress(),
      release: () => this.input_?.botRelease(),
      levelId: this.levelId,
    };
  }

  /** State for render_game_to_text(). */
  snapshot() {
    const p = this.player;
    const pb = p.body;
    const pLeft = pb.x;
    const ahead = this.obstacleList
      .filter(o => o.active && o.body.x + o.body.width >= pLeft)
      .sort((a, b) => a.body.x - b.body.x)
      .slice(0, 3)
      .map(o => ({
        type: o.getData('type'),
        x: Math.round(o.body.x),
        y: Math.round(o.body.y),
        w: o.body.width,
        h: o.body.height,
      }));
    const gap = this.gaps.find(g => g.x + g.width >= pLeft) || null;
    return {
      levelId: this.levelId,
      levelName: this.entry.name,
      abilities: this.abilities,
      player: {
        x: Math.round(p.sprite.x),
        y: Math.round(p.sprite.y),
        bodyX: Math.round(pb.x * 10) / 10,
        bodyY: Math.round(pb.y * 10) / 10,
        vy: Math.round(pb.velocity.y),
        onGround: !!p.onGround,
        ...p.ctrl.debugState(),
      },
      speed: Math.round(this.speed),
      section: this.sectionIndex + 1,
      sectionName: this.level.sections[this.sectionIndex].name,
      obstaclesAhead: ahead,
      nextGap: gap ? { x: gap.x, width: gap.width } : null,
      ...this.world.ahead(pLeft),
      steakX: this.level.finishX,
      bestProgress: Math.round(this.bestProgress * 1000) / 1000,
      ui: this.hud?.snapshot() || null,
      intro: this.abilityIntro && !this.abilityIntro.done ? this.abilityIntro.snapshot() : null,
      deaths: gameState.deathLog.length,
      bot: this.autopilot?.debugState ? this.autopilot.debugState() : null,
    };
  }

  cleanup() {
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncCamera, this);
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur);
    this.scoreSystem?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
    this.autopilot?.destroy?.();
    this.player = null;
  }
}
