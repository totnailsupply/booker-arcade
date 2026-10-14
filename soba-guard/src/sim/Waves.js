import { WAVE } from '../core/Constants.js';
import { enemyTotalHp } from '../data/enemies.js';
import { createEnemy } from './Enemies.js';

// Data-driven waves (src/data/levels/*). Setup phase first, then wave 1..N.
// The next wave starts WAVE.NEXT_WAVE_TIME s after the current one started, or
// sooner once NEXT_WAVE_HP_GONE of its HP is gone (all of it spawned, and at
// least MIN_WAVE_TIME in). The level is won when the last wave has fully
// spawned and no enemy is left.

export class Waves {
  constructor(battle, level, startWave = 1) {
    this.battle = battle;
    this.defs = level.waves;
    this.total = this.defs.length;
    this.firstWave = Math.max(1, Math.min(this.total, startWave));
    this.current = 0;                 // number of the latest started wave (0 = setup)
    this.setupLeft = this.firstWave > 1 ? 0 : (level.setupTime ?? WAVE.SETUP_TIME);
    this.setupTotal = this.setupLeft;
    this.queue = [];                  // pending spawns of the current wave { at, key }
    this.waveTime = 0;
    this.waveHp = 0;                  // total HP of the current wave
    this.scooterHp = 0;               // HP of current-wave enemies the scooters flattened
    this.lastRow = -1;
    this.streak = 0;
  }

  get inSetup() {
    return this.current === 0;
  }

  get allSpawned() {
    return this.queue.length === 0;
  }

  skipSetup() {
    if (this.inSetup) this.setupLeft = 0;
  }

  update(dt) {
    if (this.inSetup) {
      this.setupLeft -= dt;
      if (this.setupLeft <= 0) this.startWave(this.firstWave);
      return;
    }
    this.waveTime += dt;
    while (this.queue.length && this.queue[0].at <= this.waveTime) {
      const next = this.queue.shift();
      if (next.push) this.battle.emit('push', { wave: this.current, push: next.push });
      this.spawn(next.key, next.row);
    }
    if (this.current < this.total && this.canAdvance()) this.startWave(this.current + 1);
  }

  canAdvance() {
    if (this.waveTime >= WAVE.NEXT_WAVE_TIME) return true;
    if (!this.allSpawned || this.waveTime < WAVE.MIN_WAVE_TIME) return false;
    return this.hpGoneFraction() >= WAVE.NEXT_WAVE_HP_GONE;
  }

  /** A scooter kill doesn't speed the next wave up (it's a failure, not progress). */
  onScooterKill(e) {
    if (e.wave === this.current) this.scooterHp += e.maxHp + e.lidMax;
  }

  /**
   * Fraction of the current wave's HP that is gone (unspawned counts as full,
   * and so does anything a scooter flattened).
   */
  hpGoneFraction() {
    if (this.waveHp <= 0) return 1;
    let left = this.scooterHp;
    for (const s of this.queue) left += enemyTotalHp(s.key);
    for (const e of this.battle.enemies) if (e.alive && e.wave === this.current) left += Math.max(0, e.hp) + e.lid;
    return 1 - left / this.waveHp;
  }

  startWave(n) {
    const def = this.defs[n - 1];
    const b = this.battle;
    this.current = n;
    this.waveTime = 0;
    this.scooterHp = 0;
    const groups = def.groups || [{ at: 0, enemies: def.enemies, spread: def.spread }];
    const keys = [];
    this.queue = [];
    groups.forEach((g, gi) => {
      const gk = [];
      for (const [key, count] of Object.entries(g.enemies)) for (let i = 0; i < count; i++) gk.push(key);
      // Mixed groups arrive in a seeded random order (not all rats first)
      for (let i = gk.length - 1; i > 0; i--) {
        const j = b.rng.int(i + 1);
        [gk[i], gk[j]] = [gk[j], gk[i]];
      }
      const spread = g.spread ?? (def.flag ? WAVE.FLAG_SPREAD : WAVE.SPREAD);
      const lead = (g.at || 0) + (def.flag && gi === 0 ? WAVE.FLAG_WARNING : 0);
      const gap = gk.length > 1 ? spread / (gk.length - 1) : 0;
      gk.forEach((key, i) => {
        const jitter = i === 0 ? 0 : b.rng.range(-WAVE.SPAWN_JITTER, WAVE.SPAWN_JITTER);
        this.queue.push({ key, at: Math.max(0, lead + i * gap + jitter), push: gi > 0 && i === 0 ? gi : 0 });
      });
      keys.push(...gk);
    });
    this.queue.sort((a, c) => a.at - c.at);
    (def.rows || []).forEach((row, i) => {
      if (this.queue[i] && row !== null && row < b.rows) this.queue[i].row = row;
    });
    this.waveHp = keys.reduce((sum, k) => sum + enemyTotalHp(k), 0);
    b.emit('waveStart', { wave: n, total: this.total, flag: !!def.flag, final: n === this.total, count: keys.length });
    if (def.flag) b.emit('hugeWave', { wave: n, final: n === this.total });
    if (n === this.firstWave + 1) b.hint('soba');
    if (n === this.firstWave + 4) b.hint('upgrade');
    for (const u of b.level.unlocks || []) {
      if (u.afterWave === n - 1) b.unlockCard(u.card);
    }
  }

  /** Row for the next spawn: random, never more than MAX_SAME_LANE in a row. */
  pickRow() {
    const rows = this.battle.rows;
    let row = this.battle.rng.int(rows);
    if (row === this.lastRow && this.streak >= WAVE.MAX_SAME_LANE && rows > 1) {
      row = (row + 1 + this.battle.rng.int(rows - 1)) % rows;
    }
    this.streak = row === this.lastRow ? this.streak + 1 : 1;
    this.lastRow = row;
    return row;
  }

  spawn(key, fixedRow = undefined) {
    const b = this.battle;
    const e = createEnemy(b, key, fixedRow ?? this.pickRow());
    b.enemies.push(e);
    b.emit('spawn', { enemy: e.id, key, row: e.row, x: e.x, wave: this.current });
    if (key === 'rat' && this.current === this.firstWave) b.hint('steamer');
  }

  /** True once the last wave has spawned everything and nothing is alive. */
  finished() {
    if (this.current < this.total || !this.allSpawned) return false;
    return !this.battle.enemies.some(e => e.alive);
  }

  /** 0..1 for the wave bar: finished waves plus the current wave's share. */
  progress() {
    if (this.inSetup) return 0;
    const done = this.current - 1;
    const part = Math.min(1, this.waveTime / WAVE.NEXT_WAVE_TIME);
    return Math.min(1, (done + part) / this.total);
  }
}
