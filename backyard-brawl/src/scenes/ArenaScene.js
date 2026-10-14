// =============================================================================
// ArenaScene — renders the sim (src/sim/World) with pooled sprites.
//
// Fixed-step accumulator: the sim always steps 1/60 s; a frame runs at most
// SIM.MAX_STEPS_PER_FRAME steps (excess time is dropped). Sim events are
// drained every frame and forwarded to the EventBus as `sim:<type>`.
// The LevelUp overlay launches while world.phase === 'levelup' (the sim
// itself is frozen then); Pause pauses this scene.
//
// The run comes from gameState.runConfig (Step 2B: WeaponSelect / Kennel /
// Results replay): { startWeapon, meta, endless }. Debug flags override.
//
// Rendering: all art faces right (flipX when moving left). Ground units are
// anchored at their feet (RENDER.FEET px below the sim position, which is the
// hit-circle centre); crows are centred and cast their shadow on the lawn.
// Code-drawn: shadows, paw markers, zoomies trail, squeak rings, Big Tom's
// charge line, Robo-Vac suction.
// =============================================================================

import Phaser from 'phaser';
import {
  SIM, ARENA, CAMERA, DEPTH, ITEM_FRAMES, COLORS, PLAYER, ENEMIES, RENDER, WEAPON_KEYS, FX,
} from '../core/Constants.js';
import { ANIMS, GEN } from '../core/Assets.js';
import { eventBus, Events, simEventName } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { getDebugOptions } from '../core/Debug.js';
import { SaveData } from '../core/SaveData.js';
import { randomSeed } from '../core/Rng.js';
import { World, PHASE } from '../sim/World.js';
import { makeBot } from '../sim/bots.js';
import { Hud } from '../ui/Hud.js';
import { TouchControls } from '../ui/TouchControls.js';
import { PlayerInput } from '../systems/PlayerInput.js';
import { ArenaFx } from '../fx/ArenaFx.js';
import { fadeIn } from '../fx/Transitions.js';

const KIBBLE_FRAME = { S: ITEM_FRAMES.KIBBLE_S, M: ITEM_FRAMES.KIBBLE_M, L: ITEM_FRAMES.KIBBLE_L };
const PICKUP_FRAME = { heart: ITEM_FRAMES.HEART, magnet: ITEM_FRAMES.MAGNET, goldenBone: ITEM_FRAMES.GOLDEN_BONE };
const SHOT_FRAME = { bark: ITEM_FRAMES.BARK, ball: ITEM_FRAMES.BALL, bone: ITEM_FRAMES.BONE };
const VICTORY_DELAY_MS = 1600;
const SQUEAK_RING_S = 0.28;
const SHADOW_TEX_W = 16;
// New-enemy introductions on the wave banner
const WAVE_INTRO = { 2: 'Squirrels!', 3: 'Crows swoop in!', 4: 'Raccoons!', 6: 'Skunks! Dodge the stink', 7: 'Golden elites!' };
const DEFAULT_RUN = {
  startWeapon: 'bark',
  meta: { hearty: 0, jaws: 0, paws: 0, sniffer: 0, lucky: 0, learner: 0 },
  endless: false,
};

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('ArenaScene');
  }

  create() {
    const dbg = getDebugOptions();
    this.dbg = dbg;
    this.seed = dbg.seed ?? randomSeed();
    const run = { ...DEFAULT_RUN, ...(gameState.runConfig || {}) };
    let unlocked = ['bark'];
    try {
      unlocked = SaveData.get().unlocks.weapons;
    } catch { /* default */ }
    this.runConfig = run;
    this.world = new World({
      seed: this.seed,
      startWave: dbg.wave || 1,
      god: dbg.god,
      hp: dbg.hp,
      startWeapon: run.startWeapon || 'bark',
      weapons: dbg.weapons || null,
      // ?autoplay demos every weapon; a real run offers unlocked ones only
      allowedWeapons: dbg.autoplay ? WEAPON_KEYS : unlocked,
      meta: run.meta || DEFAULT_RUN.meta,
      endless: !!run.endless,
    });
    gameState.reset();
    gameState.mode = MODES.PLAYING;
    gameState.runs += 1;
    this.ended = false;
    this.acc = 0;
    this.lastSteps = 0;
    this.rings = [];

    this.add.image(0, 0, 'arena').setOrigin(0, 0).setDepth(DEPTH.ARENA);
    // HUD band above the top fence (the camera can scroll into it: CAMERA.HUD_TOP_PAD)
    this.add.rectangle(0, -CAMERA.HUD_TOP_PAD, ARENA.W, CAMERA.HUD_TOP_PAD, COLORS.HUD_PANEL).setOrigin(0, 0).setDepth(DEPTH.ARENA);

    this.pools = {
      enemies: [], shadows: [], projectiles: [], hostiles: [], pickups: [], markers: [], trail: [], discs: [],
    };
    this.groundFx = this.add.graphics().setDepth(DEPTH.TRAIL + 1);
    this.ringFx = this.add.graphics().setDepth(DEPTH.PROJECTILE - 2);
    this.shadow = this.add.image(0, 0, GEN.SHADOW).setDepth(DEPTH.ACTORS - 1);
    this.shadow.setScale(RENDER.SHADOW_W.booker / SHADOW_TEX_W, 1);
    // Booker draws above every enemy (readability in crowded waves); FX adds a ring + rim
    this.booker = this.add.sprite(this.world.player.x, this.world.player.y, 'booker', 0).setOrigin(0.5, 1)
      .setDepth(FX.DEPTH.PLAYER);
    this.booker.play(ANIMS.BOOKER_IDLE);
    this.bookerAnim = ANIMS.BOOKER_IDLE;
    // Camera target = Booker's body (not his feet), so framing matches the sim
    this.camTarget = new Phaser.Math.Vector2(this.world.player.x, this.world.player.y);

    this.debugGfx = dbg.hitboxes ? this.add.graphics().setDepth(DEPTH.DEBUG) : null;

    const cam = this.cameras.main;
    cam.setBounds(0, -CAMERA.HUD_TOP_PAD, ARENA.W, ARENA.H + CAMERA.HUD_TOP_PAD);
    cam.startFollow(this.camTarget, true, CAMERA.LERP, CAMERA.LERP);
    cam.setDeadzone(CAMERA.DEADZONE_W, CAMERA.DEADZONE_H);
    cam.centerOn(this.world.player.x, this.world.player.y);

    this.hud = new Hud(this);
    this.fx = new ArenaFx(this);
    this.frameDt = 0;
    this.touch = new TouchControls(this);
    this.playerInput = new PlayerInput(this, this.touch);
    this.bot = dbg.autoplay ? makeBot(dbg.bot, this.seed) : null;

    const pause = (e) => {
      if (e?.repeat) return;
      this.pauseGame();
    };
    this.input.keyboard.on('keydown-ESC', pause);
    this.input.keyboard.on('keydown-P', pause);
    this.onHidden = () => this.pauseGame();
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden);
      this.scene.stop('LevelUpScene');
      this.scene.stop('PauseScene');
    });

    eventBus.emit(Events.GAME_START, { seed: this.seed, wave: this.world.wave });
    eventBus.emit(Events.MUSIC_GAMEPLAY, { wave: this.world.wave });
    this.flushEvents();
    this.render();
    fadeIn(this);
  }

  pauseGame() {
    if (this.ended || this.world.phase === PHASE.LEVELUP || this.world.over) return;
    if (this.scene.isActive('PauseScene') || this.scene.isPaused()) return;
    gameState.mode = MODES.PAUSED;
    eventBus.emit(Events.GAME_PAUSE);
    this.scene.pause();
    this.scene.launch('PauseScene');
  }

  update(_time, delta) {
    const w = this.world;
    this.frameDt = Math.min(delta, SIM.MAX_FRAME_S * 1000);
    if (this.ended) {
      this.render();
      return;
    }
    let steps = 0;
    // Hit-stop (FX): the sim holds for a few frames; counted with frame delta, so the
    // test clock sees the same freeze. The bot steps with the sim, so outcomes don't change.
    if (!this.fx.consumeHitStop(this.frameDt)) {
      let dt = Math.min(delta / 1000, SIM.MAX_FRAME_S);
      // Snap 60 Hz frames (and Phaser's smoothed test-clock delta, 16.63 ms) to one exact step
      if (Math.abs(dt - SIM.DT) < SIM.SNAP_S) dt = SIM.DT;
      // ?speed=N (QA): N x the steps per frame; each step is still SIM.DT with the same input
      const speed = this.dbg.speed || 1;
      const maxSteps = SIM.MAX_STEPS_PER_FRAME * speed;
      this.acc += dt * speed;
      // The bot decides every step (same as scripts/sim-run.mjs); a player's input is read once per frame
      const input = this.bot ? null : this.playerInput.read();
      while (this.acc >= SIM.DT - 1e-9 && steps < maxSteps) {
        w.step(SIM.DT, input || this.bot.input(w));
        this.acc -= SIM.DT;
        steps += 1;
        if (w.phase === PHASE.LEVELUP || w.over) break;
        if (input && steps === 1 && input.dash) input.dash = false; // a tap dashes once per frame
      }
      if (steps >= maxSteps) this.acc = Math.min(this.acc, SIM.DT);
      if (w.phase === PHASE.LEVELUP || w.over) this.acc = 0;
    }
    this.lastSteps = steps;

    this.flushEvents();

    // Level-up: a short golden burst (FX.LEVELUP_INTRO_MS) before the card overlay opens
    if (w.phase === PHASE.LEVELUP && !this.scene.isActive('LevelUpScene') && this.fx.levelUpGate(this.frameDt)) {
      this.scene.launch('LevelUpScene', { world: w, bot: this.bot });
    }
    if (w.over) this.finish();
    this.render();
    this.updateMode();
  }

  updateMode() {
    if (this.ended) return;
    const ph = this.world.phase;
    if (ph === PHASE.LEVELUP) gameState.mode = MODES.LEVELUP;
    else if (ph === PHASE.BREAK) gameState.mode = MODES.WAVE_BREAK;
    else gameState.mode = MODES.PLAYING;
  }

  flushEvents() {
    // Shake, hit-stop, particles etc. live in src/fx/ArenaFx (EventBus listeners);
    // banners and squeak rings stay here.
    const evs = this.world.drainEvents();
    for (const ev of evs) {
      eventBus.emit(simEventName(ev.type), ev);
      switch (ev.type) {
        case 'waveStart':
          if (ev.boss) this.hud.banner(`WAVE ${ev.wave}`, `BOSS: ${ev.bossName}`, 'boss');
          else this.hud.banner(`WAVE ${ev.wave}`, WAVE_INTRO[ev.wave] || '', 'wave');
          break;
        case 'waveEnd':
          this.hud.banner('WAVE CLEAR!', `+${ev.bonus} pts  +heal`, 'clear');
          break;
        case 'endlessStart':
          this.hud.banner('YARD DEFENDED!', 'ENDLESS: keep going!', 'clear');
          break;
        case 'victory':
          this.hud.banner('YARD DEFENDED!', `score ${ev.score}`, 'clear');
          break;
        case 'bossDeath':
          this.hud.banner(`${ev.name} DOWN!`, '+1 Golden Bone', 'clear');
          break;
        case 'bossPhase2':
          this.hud.banner('PHASE 2!', 'It\'s sucking you in!', 'danger');
          break;
        case 'squeak':
          this.rings.push({ x: ev.x, y: ev.y, r: ev.r, t0: this.world.time });
          break;
        case 'playerDeath':
          this.hud.banner('KNOCKED OUT!', '', 'danger');
          break;
        default:
          break;
      }
    }
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    const result = this.world.result();
    result.seed = this.seed;
    result.debug = !!this.dbg.isDebugRun;
    gameState.result = result;
    gameState.mode = result.victory && this.world.phase === PHASE.VICTORY ? MODES.VICTORY : MODES.GAME_OVER;
    const go = () => this.scene.start('ResultsScene', { result });
    if (this.world.phase === PHASE.VICTORY) this.time.delayedCall(VICTORY_DELAY_MS, go);
    else go();
  }

  // --- rendering ------------------------------------------------------------------

  poolGet(pool, i, make) {
    let s = pool[i];
    if (!s) {
      s = make();
      pool[i] = s;
    }
    if (!s.visible) s.setVisible(true);
    return s;
  }

  hidePool(pool, from) {
    for (let i = from; i < pool.length; i++) if (pool[i].visible) pool[i].setVisible(false);
  }

  render() {
    const w = this.world;
    const t = w.time;
    const p = w.player;
    const dead = w.phase === PHASE.DYING || (w.over && p.hp <= 0);

    // Booker (feet anchored)
    const b = this.booker;
    const feet = RENDER.FEET.booker;
    b.setPosition(Math.round(p.x), Math.round(p.y + feet));
    b.setFlipX(p.facing < 0);
    let anim = ANIMS.BOOKER_IDLE;
    if (p.dashT > 0) anim = ANIMS.BOOKER_DASH;
    else if (p.hurtT < 0.2 || dead) anim = ANIMS.BOOKER_HURT;
    else if (p.moving) anim = ANIMS.BOOKER_RUN;
    if (anim !== this.bookerAnim) {
      this.bookerAnim = anim;
      b.play(anim);
    }
    const blink = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    b.setAlpha(blink ? 0.4 : 1);
    b.setAngle(dead ? 90 * (p.facing < 0 ? -1 : 1) : 0);
    this.shadow.setPosition(Math.round(p.x), Math.round(p.y + feet));
    this.camTarget.set(p.x, p.y);

    this.renderTrail(w);
    this.renderGroundFx(w, t);
    this.renderEnemies(w, t);
    this.renderMarkers(w);
    this.renderShots(w, t);
    this.renderPickups(w);
    this.renderRings(w, t);
    this.fx.update(w, this.frameDt, b);

    this.touch.draw(Math.min(1, 1 - p.dashCd / PLAYER.DASH_COOLDOWN_S));
    this.hud.update(w, this.frameDt);
    if (this.debugGfx) this.drawDebug();
    this.renderTime = t;
  }

  renderEnemies(w, t) {
    const ep = this.pools.enemies;
    const sp = this.pools.shadows;
    const list = w.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const def = ENEMIES[e.type];
      const tex = def.tex || e.type;
      const s = this.poolGet(ep, i, () => this.add.sprite(0, 0, tex, 0));
      const sh = this.poolGet(sp, i, () => this.add.image(0, 0, GEN.SHADOW).setDepth(DEPTH.ACTORS - 1));
      if (s.texture.key !== tex) s.setTexture(tex, 0);
      const scale = (def.scale || 1) * (e.elite ? 1.2 : 1);
      // Hit squash (FX): wider + shorter while the sim's hit flash runs
      const sq = this.fx.enemyScale(e);
      const sx = scale * (1 + FX.SQUASH_X * sq);
      const sy = scale * (1 - FX.SQUASH_Y * sq);
      if (s.scaleX !== sx || s.scaleY !== sy) s.setScale(sx, sy);
      let frame = Math.floor(e.age * 6 + e.id * 0.37) % 2;
      let ox = 0;
      if (e.state === 'windup') {
        frame = Math.floor(t * 20) % 2;
        ox = Math.floor(t * 30) % 2 ? 1 : -1; // shiver
      } else if (e.state === 'charge' || e.state === 'swoop') {
        frame = Math.floor(e.age * 14) % 2;
      }
      s.setFrame(frame);
      const sw = (RENDER.SHADOW_W[e.type] || 16) * scale;
      if (e.flying) {
        s.setOrigin(0.5, 0.5);
        s.setPosition(Math.round(e.x) + ox, Math.round(e.y));
        s.setDepth(DEPTH.ACTORS + e.y + RENDER.CROW_SHADOW_DY + 40); // flyers draw over ground units
        sh.setPosition(Math.round(e.x), Math.round(e.y + RENDER.CROW_SHADOW_DY));
        sh.setScale(sw / SHADOW_TEX_W * 0.8, 0.8).setAlpha(0.7);
      } else {
        const f = (RENDER.FEET[e.type] ?? e.r) * scale;
        s.setOrigin(0.5, 1);
        s.setPosition(Math.round(e.x) + ox, Math.round(e.y + f));
        s.setDepth(DEPTH.ACTORS + e.y + f);
        sh.setPosition(Math.round(e.x), Math.round(e.y + f));
        sh.setScale(sw / SHADOW_TEX_W, e.boss ? 2 : 1).setAlpha(1);
      }
      // Elites stand on a golden aura (and wear a gold tint)
      if (e.elite !== !!sh.elite) {
        sh.elite = e.elite;
        if (e.elite) sh.setTexture(GEN.AURA).setTint(RENDER.ELITE_TINT);
        else sh.setTexture(GEN.SHADOW).clearTint();
      }
      if (e.elite) sh.setScale(sw / 14, 1.4).setAlpha(0.75 + 0.25 * Math.sin(t * 6 + e.id));
      // Boss intro: the boss stands above the darkened yard
      if (this.fx.spotlit(e)) {
        s.setDepth(FX.DEPTH.SPOTLIGHT_BOSS);
        sh.setDepth(FX.DEPTH.SPOTLIGHT_BOSS - 1);
      } else if (sh.depth !== DEPTH.ACTORS - 1) {
        sh.setDepth(DEPTH.ACTORS - 1);
      }
      s.setFlipX(e.facing < 0);
      // Tint: hit flash > Robo-Vac phase 2 pulse > elite gold
      let tint = 'none';
      if (e.flash > 0) tint = 'flash';
      else if (e.phase2) tint = Math.floor(t * 4) % 2 ? 'p2' : 'none';
      else if (e.elite) tint = 'elite';
      if (s.tintState !== tint) {
        s.tintState = tint;
        if (tint === 'flash') s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else if (tint === 'elite') s.setTint(RENDER.ELITE_TINT).setTintMode(Phaser.TintModes.MULTIPLY);
        else if (tint === 'p2') s.setTint(0xff8080).setTintMode(Phaser.TintModes.MULTIPLY);
        else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    }
    this.hidePool(ep, list.length);
    this.hidePool(sp, list.length);
  }

  renderMarkers(w) {
    // Spawn markers (paw prints, blinking faster as the spawn nears). Bosses: big red paw.
    const mp = this.pools.markers;
    w.telegraphs.forEach((m, i) => {
      const s = this.poolGet(mp, i, () => this.add.image(0, 0, GEN.MARKER).setDepth(DEPTH.MARKER));
      s.setPosition(Math.round(m.x), Math.round(m.y));
      // pulse: swells as the spawn nears
      const total = m.boss ? 1.4 : 0.8;
      const near = 1 - Math.max(0, Math.min(1, m.t / total));
      s.setScale((m.boss ? 3.2 : 1) * (1 + FX.MARKER_PULSE * near * (0.5 + 0.5 * Math.sin(m.t * 30))));
      s.setTint(m.boss ? 0xff2a1a : (m.elite ? 0xffd040 : 0xff5a3a));
      s.setAlpha(Math.floor(m.t * (m.boss ? 6 : 10)) % 2 ? 0.9 : 0.35);
    });
    this.hidePool(mp, w.telegraphs.length);
  }

  renderTrail(w) {
    // Zoomies paw prints (code-drawn marker, tinted), fading out
    const tp = this.pools.trail;
    const tr = w.trail;
    for (let i = 0; i < tr.length; i++) {
      const pr = tr[i];
      const s = this.poolGet(tp, i, () => this.add.image(0, 0, GEN.MARKER).setDepth(DEPTH.TRAIL).setTint(RENDER.TRAIL_TINT));
      s.setPosition(Math.round(pr.x), Math.round(pr.y));
      s.setRotation(pr.angle + Math.PI / 2);
      s.setScale(pr.r / 10);
      s.setAlpha(Math.min(1, 1.6 * Math.sqrt(Math.max(0, 1 - pr.age / pr.life))));
    }
    this.hidePool(tp, tr.length);
  }

  renderGroundFx(w, t) {
    const g = this.groundFx;
    g.clear();
    for (const e of w.bosses) {
      if (e.type === 'boss-cat' && e.state === 'windup') {
        // Charge telegraph: a red lane in the charge direction
        const len = e.def.chargeSpeed * e.def.chargeS;
        const x2 = e.x + e.dirX * len;
        const y2 = e.y + e.dirY * len;
        const a = Math.floor(t * 12) % 2 ? 0.55 : 0.25;
        g.lineStyle(e.r * 2, RENDER.CHARGE_LINE, a * 0.35).lineBetween(e.x, e.y, x2, y2);
        g.lineStyle(2, RENDER.CHARGE_LINE, a + 0.3).lineBetween(e.x, e.y, x2, y2);
        g.fillStyle(RENDER.CHARGE_LINE, a + 0.3).fillCircle(x2, y2, 4);
        // Chevrons racing down the lane (direction of the charge)
        const px = -e.dirY;
        const py = e.dirX;
        const step = 22;
        const off = (t * 90) % step;
        g.lineStyle(2, 0xffe0d0, 0.75);
        for (let d = e.r + off; d < len - 6; d += step) {
          const cx = e.x + e.dirX * d;
          const cy = e.y + e.dirY * d;
          const bx = cx - e.dirX * 6;
          const by = cy - e.dirY * 6;
          g.lineBetween(bx + px * 6, by + py * 6, cx, cy);
          g.lineBetween(bx - px * 6, by - py * 6, cx, cy);
        }
      }
      if (e.type === 'boss-vac' && e.phase2) {
        // Suction: rings shrinking into the vac
        const R = e.def.pullRange;
        for (let k = 0; k < 4; k++) {
          const f = 1 - ((t * 0.9 + k / 4) % 1);
          g.lineStyle(2, RENDER.PULL_TINT, 0.35 * f).strokeCircle(e.x, e.y, e.r + (R - e.r) * f);
        }
      }
    }
    // Stink clouds: a target mark where a flying cloud will land, a pulsing danger ring once it lingers
    for (let i = 0; i < w.hostiles.length; i++) {
      const h = w.hostiles[i];
      if (h.kind !== 'stink') continue;
      if (h.flight > 0 && h.age < h.flight) {
        const left = h.flight - h.age;
        const lx = h.x + h.vx * left;
        const ly = h.y + h.vy * left;
        const a = 0.5 + 0.4 * (1 - left / h.flight);
        g.lineStyle(3, FX.STINK_EDGE, a * 0.6).strokeEllipse(lx, ly + 3, h.r * 2.6, h.r * 1.3);
        g.lineStyle(1, FX.STINK_RING, a).strokeEllipse(lx, ly + 3, h.r * 2.6, h.r * 1.3);
      } else {
        const fade = Math.min(1, (h.life - h.age) * 3);
        const pulse = 0.5 + 0.5 * Math.sin(t * 10 + h.id);
        g.fillStyle(FX.STINK_RING, 0.22 * fade).fillEllipse(h.x, h.y + 3, h.r * 2.8, h.r * 1.5);
        g.lineStyle(3, FX.STINK_EDGE, 0.5 * fade).strokeEllipse(h.x, h.y + 3, h.r * 2.8, h.r * 1.5);
        g.lineStyle(1, FX.STINK_RING, (0.6 + 0.4 * pulse) * fade).strokeEllipse(h.x, h.y + 3, h.r * 2.8, h.r * 1.5);
      }
    }
  }

  renderShots(w, t) {
    // Player projectiles
    const pp = this.pools.projectiles;
    w.projectiles.forEach((pr, i) => {
      const s = this.poolGet(pp, i, () => this.add.image(0, 0, 'items', ITEM_FRAMES.BARK).setDepth(DEPTH.PROJECTILE));
      const frame = SHOT_FRAME[pr.kind] ?? ITEM_FRAMES.BARK;
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setPosition(Math.round(pr.x), Math.round(pr.y));
      if (pr.kind === 'bark') {
        s.setRotation(Math.atan2(pr.vy, pr.vx));
        s.setScale(Math.max(0.6, pr.r / 5));
        s.setAlpha(pr.age > pr.life - 0.15 ? 0.5 : 1);
      } else {
        s.setRotation(pr.age * (pr.kind === 'bone' ? 16 : 10));
        s.setScale(Math.max(0.7, pr.r / (pr.kind === 'bone' ? 7 : 5.5)));
        s.setAlpha(1);
      }
    });
    this.hidePool(pp, w.projectiles.length);

    // Frisbee discs (orbit state lives on the weapon)
    const dp = this.pools.discs;
    let n = 0;
    for (const wp of w.weapons) {
      if (wp.key !== 'frisbee' || !wp.discs) continue;
      for (const d of wp.discs) {
        const s = this.poolGet(dp, n++, () => this.add.image(0, 0, 'items', ITEM_FRAMES.FRISBEE));
        s.setPosition(Math.round(d.x), Math.round(d.y));
        s.setDepth(DEPTH.ACTORS + d.y + 4);
        s.setScale(d.r / 7);
        s.setRotation(Math.sin(d.angle * 2) * 0.3);
      }
    }
    this.hidePool(dp, n);

    // Enemy projectiles: stink clouds (pulse while lingering), dust balls
    const hp = this.pools.hostiles;
    w.hostiles.forEach((h, i) => {
      const s = this.poolGet(hp, i, () => this.add.image(0, 0, 'items', ITEM_FRAMES.STINK).setDepth(DEPTH.PROJECTILE - 1));
      const frame = h.kind === 'stink' ? ITEM_FRAMES.STINK : ITEM_FRAMES.DUST;
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setPosition(Math.round(h.x), Math.round(h.y));
      if (h.kind === 'stink') {
        const lingering = h.flight > 0 && h.age >= h.flight;
        s.setScale(lingering ? 1.1 + Math.sin(t * 8 + h.id) * 0.12 : 0.9);
        s.setAlpha(lingering ? Math.min(1, (h.life - h.age) * 3) * 0.9 : 1);
        s.setRotation(0);
      } else {
        s.setScale(h.r / 5);
        s.setRotation(h.age * 6);
        s.setAlpha(1);
      }
    });
    this.hidePool(hp, w.hostiles.length);
  }

  renderPickups(w) {
    const kp = this.pools.pickups;
    w.pickups.forEach((k, i) => {
      const s = this.poolGet(kp, i, () => this.add.image(0, 0, 'items', ITEM_FRAMES.KIBBLE_S).setDepth(DEPTH.PICKUP));
      const frame = k.kind === 'kibble' ? KIBBLE_FRAME[k.size] : PICKUP_FRAME[k.kind];
      if (s.frame.name !== frame) s.setFrame(frame);
      let bob = k.pulled ? 0 : Math.round(Math.sin((k.age + k.id) * 4));
      // Fresh drops hop out of the enemy (render only)
      if (!k.pulled && k.age < FX.KIBBLE_POP_S) bob = -Math.round(Math.sin((k.age / FX.KIBBLE_POP_S) * Math.PI) * FX.KIBBLE_POP_H);
      s.setPosition(Math.round(k.x), Math.round(k.y) + bob);
      s.setScale(k.kind === 'kibble' ? 0.75 : 1);
      s.setAlpha(k.kind === 'goldenBone' ? 0.75 + 0.25 * Math.sin(k.age * 10) : 1);
    });
    this.hidePool(kp, w.pickups.length);
  }

  renderRings(w, t) {
    const g = this.ringFx;
    g.clear();
    let k = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const f = (t - r.t0) / SQUEAK_RING_S;
      if (f >= 1 || f < 0) continue;
      this.rings[k++] = r;
      const rad = r.r * (0.35 + 0.65 * f);
      g.lineStyle(3, RENDER.SQUEAK_RING, 0.9 * (1 - f)).strokeCircle(r.x, r.y, rad);
      g.lineStyle(1, 0xffffff, 0.6 * (1 - f)).strokeCircle(r.x, r.y, rad * 0.8);
    }
    this.rings.length = k;
  }

  drawDebug() {
    const g = this.debugGfx;
    const w = this.world;
    const p = w.player;
    g.clear();
    g.lineStyle(1, 0x00ff66, 1).strokeCircle(p.x, p.y, p.r);
    g.lineStyle(1, 0x4fb3ff, 0.5).strokeCircle(p.x, p.y, PLAYER.PICKUP_RADIUS * (1 + w.stats.pickup));
    g.lineStyle(1, 0xff3a3a, 1);
    for (const e of w.enemies) g.strokeCircle(e.x, e.y, e.r);
    g.lineStyle(1, 0xffff00, 1);
    for (const pr of w.projectiles) g.strokeCircle(pr.x, pr.y, pr.r);
    g.lineStyle(1, 0xff00ff, 1);
    for (const h of w.hostiles) g.strokeCircle(h.x, h.y, h.r);
    for (const tr of w.trail) g.strokeCircle(tr.x, tr.y, tr.r);
    g.lineStyle(1, COLORS.XP, 0.6).strokeRect(ARENA.BORDER_X, ARENA.BORDER_Y, ARENA.W - ARENA.BORDER_X * 2, ARENA.H - ARENA.BORDER_Y * 2);
  }

  /** For render_game_to_text() and PauseScene's build panel. */
  snapshot() {
    const w = this.world;
    const p = w.player;
    const r1 = (v) => Math.round(v * 10) / 10;
    const near = w.enemies
      .map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(({ e, d }) => ({
        type: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: r1(e.hp), dist: Math.round(d),
        ...(e.elite ? { elite: true } : {}), ...(e.state && (e.def.flying || e.boss) ? { state: e.state } : {}),
      }));
    const enemyTypes = {};
    let elites = 0;
    for (const e of w.enemies) {
      enemyTypes[e.type] = (enemyTypes[e.type] || 0) + 1;
      if (e.elite) elites += 1;
    }
    const boss = w.boss;
    return {
      seed: this.seed,
      phase: w.phase,
      wave: w.wave,
      bossWave: w.bossWave,
      timeLeft: w.bossWave ? null : r1(w.phase === PHASE.BREAK ? w.breakLeft : w.waveLeft),
      waveLength: w.waveLength,
      endless: w.endless,
      hp: r1(p.hp),
      maxHp: r1(p.maxHp),
      level: w.level,
      xp: Math.floor(w.xp),
      xpNext: w.xpNext,
      score: w.score,
      combo: { count: w.combo.count, mult: r1(w.combo.mult) },
      kills: w.kills,
      goldenBones: w.goldenBones,
      bossesBeaten: [...w.bossesBeaten],
      boss: boss ? {
        type: boss.type, name: boss.def.name, hp: Math.ceil(boss.hp), maxHp: Math.round(boss.maxHp),
        state: boss.type === 'boss-vac' ? (boss.phase2 ? 'phase2' : 'phase1') : boss.state,
        x: Math.round(boss.x), y: Math.round(boss.y),
      } : null,
      player: {
        x: Math.round(p.x), y: Math.round(p.y), facing: p.facing,
        dashing: p.dashT > 0, dashCd: r1(p.dashCd), invulnerable: p.iframes > 0 || p.dashT > 0 || w.god,
      },
      enemyCount: w.enemies.length,
      enemyTypes,
      elites,
      telegraphs: w.telegraphs.length,
      projectiles: w.projectiles.length,
      enemyShots: w.hostiles.length,
      pawPrints: w.trail.length,
      pickups: w.pickups.length,
      enemies: near,
      weapons: w.weapons.map(x => ({ key: x.key, level: x.level })),
      startWeapon: w.startWeapon,
      stats: { ...w.stats },
      statLevels: { ...w.statLevels },
      meta: { ...w.meta },
      choices: w.choices ? w.choices.map(c => ({ kind: c.kind, key: c.key, level: c.level, rare: c.rare, name: c.name })) : null,
      rerolls: w.rerolls,
      simTime: r1(w.time),
      stepsLastFrame: this.lastSteps,
      autoplay: !!this.bot,
      fx: this.fx ? this.fx.debugState() : null,
    };
  }
}
