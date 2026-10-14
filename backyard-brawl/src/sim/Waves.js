// Waves: timer (20 + 4n s), spawn budget with 0.8 s paw-print telegraphs,
// elites from wave 7, boss waves (every 5th: Big Tom; every 10th: Robo-Vac),
// wave-end cleanup (enemies pop to kibble, vacuum, heal 20 %), 2.5 s break.
//
// Boss waves have no timer: the boss lands after a 1.4 s telegraph, normal
// spawns continue at BOSS.SPAWN_MULT, and the wave clears BOSS.DEATH_BEAT_S
// after the boss dies (its Golden Bone and XP fly to Booker meanwhile).
// Endless (world.endless): clearing wave 10 doesn't end the run.

import { WAVES, ENEMIES, ENEMY, ARENA, BOSS } from '../core/Constants.js';
import { spawnEnemy, killEnemy } from './Enemies.js';
import { vacuumKibble, collectPickup } from './Pickups.js';

export function waveLength(n) {
  return WAVES.BASE_S + WAVES.PER_WAVE_S * n;
}

export function spawnRate(n) {
  const k = n - 1;
  return Math.min(WAVES.BUDGET_ENDLESS_CAP, WAVES.BUDGET_BASE + WAVES.BUDGET_PER_WAVE * k + WAVES.BUDGET_QUAD * k * k);
}

export function isBossWave(n) {
  return n % WAVES.BOSS_EVERY === 0;
}

/** 'boss-vac' on every 10th wave, 'boss-cat' on the other 5th waves, else null. */
export function bossType(n) {
  if (!isBossWave(n)) return null;
  return n % (WAVES.BOSS_EVERY * 2) === 0 ? 'boss-vac' : 'boss-cat';
}

const POOLS = new Map();
/** Enemy types the budget can spawn in wave n. Cached per wave. */
export function spawnPool(n) {
  const key = Math.min(n, 99);
  let pool = POOLS.get(key);
  if (!pool) {
    pool = Object.entries(ENEMIES)
      .filter(([, d]) => d.fromWave <= n && d.weight > 0)
      .map(([type, d]) => ({ type, weight: d.weight, cost: d.cost }));
    POOLS.set(key, pool);
  }
  return pool;
}

export function startWave(world, n) {
  world.wave = n;
  world.waveTime = 0;
  world.bossWave = isBossWave(n);
  world.bossDeadT = 0;
  world.waveLength = world.bossWave ? 0 : waveLength(n);
  world.waveLeft = world.waveLength;
  world.budget = WAVES.OPENING_BUDGET;
  world.nextSpawn = null;
  world.phase = 'playing';
  const boss = bossType(n);
  world.emit('waveStart', { wave: n, length: world.waveLength, boss: !!boss, bossType: boss, bossName: boss ? ENEMIES[boss].name : null });
  if (boss) {
    // Lands on the far side of the yard from Booker
    const p = world.player;
    const x = p.x < ARENA.W / 2 ? ARENA.W * 0.76 : ARENA.W * 0.24;
    const y = ARENA.H * 0.42;
    world.telegraphs.push({ id: world.nextId++, type: boss, x, y, t: BOSS.TELEGRAPH_S, elite: false, boss: true });
    world.emit('telegraph', { enemy: boss, x, y, boss: true });
  }
}

/** Budget rate now: wave base x in-wave ramp (busier toward the end) x boss-wave cut. */
export function currentRate(world) {
  const n = world.wave;
  let rate = spawnRate(n);
  const len = world.bossWave ? waveLength(n) : world.waveLength;
  const prog = Math.min(1, world.waveTime / len);
  rate *= WAVES.RAMP_START + (WAVES.RAMP_END - WAVES.RAMP_START) * prog;
  if (world.bossWave) rate *= BOSS.SPAWN_MULT;
  return rate;
}

export function updateSpawns(world, dt) {
  if (world.bossWave && world.bossDeadT > 0) return; // boss down: let the yard calm
  const rate = currentRate(world);
  world.budget = Math.min(world.budget + rate * dt, WAVES.OPENING_BUDGET + rate);
  const pool = spawnPool(world.wave);
  for (;;) {
    if (world.enemies.length + world.telegraphs.length >= ENEMY.CAP) break;
    if (!world.nextSpawn) world.nextSpawn = world.rng.weighted(pool);
    const pick = world.nextSpawn;
    if (!pick || world.budget < pick.cost) break;
    const pos = findSpawnPoint(world);
    if (!pos) break;
    world.budget -= pick.cost;
    world.nextSpawn = null;
    const elite = world.wave >= ENEMY.ELITE_FROM_WAVE && world.rng.chance(ENEMY.ELITE_CHANCE);
    world.telegraphs.push({ id: world.nextId++, type: pick.type, x: pos.x, y: pos.y, t: WAVES.TELEGRAPH_S, elite, boss: false });
    world.emit('telegraph', { enemy: pick.type, x: pos.x, y: pos.y, elite });
  }
}

const SPAWN_POS = { x: 0, y: 0 };
function findSpawnPoint(world) {
  const p = world.player;
  const m = WAVES.MIN_SPAWN_DIST;
  for (let i = 0; i < WAVES.SPAWN_TRIES; i++) {
    const x = world.rng.range(ARENA.SPAWN_MARGIN, ARENA.W - ARENA.SPAWN_MARGIN);
    const y = world.rng.range(ARENA.SPAWN_MARGIN, ARENA.H - ARENA.SPAWN_MARGIN);
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy >= m * m) {
      SPAWN_POS.x = x;
      SPAWN_POS.y = y;
      return SPAWN_POS;
    }
  }
  return null;
}

export function updateTelegraphs(world, dt) {
  const list = world.telegraphs;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    t.t -= dt;
    if (t.t <= 0) {
      spawnEnemy(world, t.type, t.x, t.y, t.elite);
      continue;
    }
    list[w++] = t;
  }
  list.length = w;
}

/** Per-step wave clock. Called by World.step while phase is 'playing'. */
export function updateWaveClock(world, dt) {
  world.waveTime += dt;
  if (world.bossWave) {
    if (world.bossDeadT > 0) {
      world.bossDeadT -= dt;
      if (world.bossDeadT <= 0) endWave(world);
    }
    return;
  }
  world.waveLeft -= dt;
  if (world.waveLeft <= 0) {
    world.waveLeft = 0;
    endWave(world);
  }
}

/** Wave over: clean the yard and start the break (or win after the last wave). */
export function endWave(world) {
  const n = world.wave;
  for (const e of world.enemies) killEnemy(world, e, false);
  world.enemies.length = 0;
  world.bosses.length = 0;
  world.telegraphs.length = 0;
  world.projectiles.length = 0;
  world.hostiles.length = 0;
  vacuumKibble(world);
  // Golden Bones still on the lawn count now (a boss bone may not have arrived yet)
  const ps = world.pickups;
  let k = 0;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].kind === 'goldenBone') collectPickup(world, ps[i]);
    else ps[k++] = ps[i];
  }
  ps.length = k;
  const p = world.player;
  const heal = p.maxHp * WAVES.HEAL_FRAC;
  p.hp = Math.min(p.maxHp, p.hp + heal);
  const bonus = WAVES.WAVE_BONUS * n;
  world.score += bonus;
  world.wavesCleared = Math.max(world.wavesCleared, n);
  world.emit('waveEnd', { wave: n, bonus, heal });
  if (n >= WAVES.COUNT && !world.endless) {
    world.phase = 'victory';
    world.emit('victory', { wave: n, score: world.score });
    return;
  }
  if (n === WAVES.COUNT) world.emit('endlessStart', { wave: n, score: world.score });
  world.phase = 'wave_break';
  world.breakLeft = WAVES.BREAK_S;
}
