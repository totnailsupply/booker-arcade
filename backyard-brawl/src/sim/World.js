// =============================================================================
// World — the whole game simulation. Pure JS (no Phaser, no DOM): the Arena
// scene renders it in the browser and scripts/sim-run.mjs runs it in node.
//
//   const world = new World({ seed: 42 });
//   world.step(1 / 60, { mx, my, dash });   // fixed step
//   world.drainEvents();                   // [{ type, ... }] since last drain
//
// Phases: playing -> (levelup) -> wave_break -> playing ... -> victory
//         any -> dying (death beat) -> game_over
// While phase is 'levelup' step() does nothing; the UI (or a bot) calls
// choose(i) / reroll() and the previous phase resumes.
// =============================================================================

import { SIM, ARENA, XP, PLAYER, WAVES, META, WEAPON_KEYS } from '../core/Constants.js';
import { Rng } from './Rng.js';
import { SpatialHash } from './SpatialHash.js';
import { createPlayer, updatePlayer } from './Player.js';
import { updateEnemies, sweepDead } from './Enemies.js';
import { addWeapon, updateWeapons } from './Weapons.js';
import { updateProjectiles, updateHostiles } from './Projectiles.js';
import { updatePickups, xpForLevel } from './Pickups.js';
import { startWave, updateSpawns, updateTelegraphs, updateWaveClock } from './Waves.js';
import { rollCards, applyCard, emptyStats } from './Upgrades.js';

export const PHASE = {
  PLAYING: 'playing',
  LEVELUP: 'levelup',
  BREAK: 'wave_break',
  DYING: 'dying',
  GAME_OVER: 'game_over',
  VICTORY: 'victory',
};

export class World {
  /**
   * @param {object} o
   * @param {number} [o.seed]
   * @param {number} [o.startWave]   1..10 (any n >= 1 in endless)
   * @param {boolean} [o.god]        Booker takes no damage
   * @param {number|null} [o.hp]     starting max HP override (ignores the Hearty rank)
   * @param {string} [o.startWeapon] 'bark' | 'ball' | 'bone' | 'frisbee' | 'squeak' | 'zoomies'
   * @param {string[]} [o.weapons]   starting weapons (overrides startWeapon; first = main)
   * @param {string[]} [o.allowedWeapons] weapons that can appear as new-weapon cards
   * @param {object} [o.meta]        Kennel ranks 0-5 { hearty, jaws, paws, sniffer, lucky, learner }
   * @param {boolean} [o.endless]    clearing wave 10 doesn't end the run
   */
  constructor({
    seed = 1, startWave: wave = 1, god = false, hp = null, startWeapon = 'bark', weapons = null,
    allowedWeapons = WEAPON_KEYS, meta = null, endless = false,
  } = {}) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.god = !!god;
    this.endless = !!endless;
    this.time = 0;
    this.frame = 0;
    this.nextId = 1;
    this.events = [];

    const rank = (k) => Math.max(0, Math.min(META.MAX_RANK, Math.floor(Number(meta?.[k]) || 0)));
    this.meta = { hearty: rank('hearty'), jaws: rank('jaws'), paws: rank('paws'), sniffer: rank('sniffer'), lucky: rank('lucky'), learner: rank('learner') };
    this.player = createPlayer(hp ?? PLAYER.HP + META.hearty * this.meta.hearty);
    this.stats = emptyStats();
    this.stats.damage += META.jaws * this.meta.jaws;
    this.stats.speed += META.paws * this.meta.paws;
    this.stats.pickup += META.sniffer * this.meta.sniffer;
    this.xpMult = 1 + META.learner * this.meta.learner;
    this.statLevels = {};
    this.enemies = [];
    this.bosses = [];
    this.telegraphs = [];
    this.projectiles = [];
    this.hostiles = [];
    this.trail = [];       // zoomies paw prints { x, y, angle, age, life, r }
    this.trailPool = [];
    this.pickups = [];
    this.weapons = [];
    const start = weapons && weapons.length ? weapons : [startWeapon];
    this.startWeapon = start[0];
    this.allowedWeapons = [...new Set([...allowedWeapons, ...start])];
    for (const k of start) addWeapon(this, k);
    if (!this.weapons.length) {
      addWeapon(this, 'bark');
      this.startWeapon = 'bark';
    }
    this.pullX = 0;
    this.pullY = 0;

    this.hash = new SpatialHash(ARENA.W, ARENA.H, SIM.HASH_CELL);
    this.scratch = [];

    this.score = 0;
    this.kills = 0;
    this.goldenBones = 0;
    this.bossesBeaten = [];
    this.combo = { count: 0, mult: 1, timer: 0, best: 0 };
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.pendingLevels = 0;
    this.choices = null;
    this.rerolls = XP.REROLLS + META.lucky * this.meta.lucky;
    this.resumePhase = null;

    this.wavesCleared = 0;
    this.breakLeft = 0;
    this.deathLeft = 0;
    this.budget = 0;
    this.nextSpawn = null;
    this.bossWave = false;
    this.bossDeadT = 0;
    this.waveTime = 0;
    this.startWaveN = Math.max(1, Math.min(this.endless ? 999 : WAVES.COUNT, wave | 0));
    startWave(this, this.startWaveN);
  }

  /**
   * Queue a sim event. The event `type` always wins over the payload (enemy
   * payloads name the enemy type `enemy`: hit, kill, pop, spawn, telegraph,
   * bossSpawn, bossDeath).
   */
  emit(type, data = {}) {
    if (this.events.length >= SIM.MAX_EVENTS) this.events.shift();
    this.events.push({ ...data, type, t: Math.round(this.time * 1000) / 1000 });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  get over() {
    return this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY;
  }

  rebuildHash() {
    this.hash.clear();
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead && !e.boss) this.hash.insert(e);
    }
  }

  /** Nearest live enemy (bosses included) within range. Linear scan: called a few times per step. */
  nearestEnemy(x, y, range = Infinity) {
    let best = null;
    let bd = range * range;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  step(dt, input) {
    const ph = this.phase;
    if (ph === PHASE.GAME_OVER || ph === PHASE.VICTORY || ph === PHASE.LEVELUP) return;
    this.time += dt;
    this.frame += 1;

    if (ph === PHASE.DYING) {
      this.deathLeft -= dt;
      if (this.deathLeft <= 0) {
        this.phase = PHASE.GAME_OVER;
        this.emit('gameOver', { wave: this.wave, level: this.level, score: this.score, kills: this.kills });
      }
      return;
    }

    updatePlayer(this, dt, input);

    if (ph === PHASE.PLAYING) {
      updateSpawns(this, dt);
      updateTelegraphs(this, dt);
    }
    updateEnemies(this, dt);
    updateWeapons(this, dt, ph === PHASE.PLAYING);
    updateProjectiles(this, dt);
    updateHostiles(this, dt);
    sweepDead(this);
    updatePickups(this, dt);

    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) {
        this.combo.timer = 0;
        this.combo.count = 0;
        this.combo.mult = 1;
      }
    }

    if (this.player.hp <= 0) {
      this.phase = PHASE.DYING;
      this.deathLeft = PLAYER.DEATH_BEAT_S;
      this.emit('playerDeath', { x: this.player.x, y: this.player.y, wave: this.wave });
      return;
    }

    if (this.phase === PHASE.PLAYING) {
      updateWaveClock(this, dt);
    } else if (this.phase === PHASE.BREAK) {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) startWave(this, this.wave + 1);
    }

    if (this.pendingLevels > 0 && (this.phase === PHASE.PLAYING || this.phase === PHASE.BREAK)) {
      this.resumePhase = this.phase;
      this.phase = PHASE.LEVELUP;
      this.choices = rollCards(this);
      this.emit('levelUpOpen', { level: this.level, choices: this.choices.map(c => c.key) });
    }
  }

  /** Pick card i during a level-up. Returns the applied card or null. */
  choose(i) {
    if (this.phase !== PHASE.LEVELUP || !this.choices) return null;
    const card = this.choices[i];
    if (!card) return null;
    applyCard(this, card);
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) {
      this.choices = rollCards(this);
      this.emit('levelUpOpen', { level: this.level, choices: this.choices.map(c => c.key) });
    } else {
      this.choices = null;
      this.phase = this.resumePhase || PHASE.PLAYING;
      this.resumePhase = null;
    }
    return card;
  }

  reroll() {
    if (this.phase !== PHASE.LEVELUP || this.rerolls <= 0) return false;
    this.rerolls -= 1;
    this.choices = rollCards(this);
    this.emit('reroll', { left: this.rerolls });
    return true;
  }

  /** Live boss (first one) or null. */
  get boss() {
    return this.bosses.length ? this.bosses[0] : null;
  }

  /**
   * Summary for the Results screen / sim-run (shared contract with Step 2B).
   * victory = wave 10 cleared (also true for an Endless run that died later).
   * outcome / time / weapon are kept for older callers.
   */
  result() {
    const victory = this.wavesCleared >= WAVES.COUNT;
    const timeSec = Math.round(this.time * 10) / 10;
    return {
      score: this.score,
      wave: this.wave,
      wavesCleared: this.wavesCleared,
      level: this.level,
      kills: this.kills,
      timeSec,
      bestCombo: this.combo.best,
      victory,
      endless: this.endless,
      goldenBones: this.goldenBones,
      bossesBeaten: [...this.bossesBeaten],
      weapons: this.weapons.map(w => ({ key: w.key, level: w.level })),
      startWeapon: this.startWeapon,
      debug: false,
      outcome: victory ? 'victory' : 'death',
      time: timeSec,
      weapon: this.startWeapon,
    };
  }
}
