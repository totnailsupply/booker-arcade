#!/usr/bin/env node
// =============================================================================
// sim-run.mjs — runs the game simulation headless in node (src/sim/, no
// Phaser, no browser) with a bot, at fixed 1/60 s steps, for N seeds.
//
//   node scripts/sim-run.mjs --bot kite --seeds 20
//   node scripts/sim-run.mjs --bot smart --seeds 20 --weapon zoomies
//   node scripts/sim-run.mjs --bot kite --seeds 20 --meta 5
//   node scripts/sim-run.mjs --perf
//
// Flags:
//   --bot idle|kite|smart   (default kite)
//   --seeds N               seeds 1..N (default 5); --seed-base B starts at B
//   --waves N               stop after wave N is cleared (default 10 = full run)
//   --start-wave N          start at wave N (like ?wave=N)
//   --hp N                  starting max HP override
//   --weapon KEY            start weapon (default bark)
//   --meta N                every Kennel rank = N (0-5, default 0)
//   --allowed all|a,b,...   weapons that can appear as new-weapon cards (default all)
//   --endless               Endless run (clearing wave 10 doesn't end it)
//   --god                   Booker takes no damage
//   --json                  print one JSON object instead of the table
//   --perf                  step-time benchmark: wave 10 (Robo-Vac), enemy cap
//                           kept full, 4 weapons at level 5, god mode
// =============================================================================

import { World, PHASE } from '../src/sim/World.js';
import { makeBot, BOT_KINDS } from '../src/sim/bots.js';
import { SIM, WAVES, WEAPON_KEYS, ENEMY } from '../src/core/Constants.js';

function parseArgs(argv) {
  const a = {
    bot: 'kite', seeds: 5, seedBase: 1, waves: WAVES.COUNT, startWave: 1, hp: null, json: false,
    weapon: 'bark', meta: 0, allowed: WEAPON_KEYS, endless: false, god: false, perf: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--bot') { a.bot = v; i++; }
    else if (k === '--seeds') { a.seeds = parseInt(v, 10); i++; }
    else if (k === '--seed-base') { a.seedBase = parseInt(v, 10); i++; }
    else if (k === '--waves') { a.waves = parseInt(v, 10); i++; }
    else if (k === '--start-wave') { a.startWave = parseInt(v, 10); i++; }
    else if (k === '--hp') { a.hp = parseInt(v, 10); i++; }
    else if (k === '--weapon') { a.weapon = v; i++; }
    else if (k === '--meta') { a.meta = parseInt(v, 10); i++; }
    else if (k === '--allowed') { a.allowed = v === 'all' ? WEAPON_KEYS : v.split(','); i++; }
    else if (k === '--endless') a.endless = true;
    else if (k === '--god') a.god = true;
    else if (k === '--json') a.json = true;
    else if (k === '--perf') a.perf = true;
  }
  if (!BOT_KINDS.includes(a.bot)) {
    console.error(`unknown bot "${a.bot}" (${BOT_KINDS.join(', ')})`);
    process.exit(1);
  }
  if (!WEAPON_KEYS.includes(a.weapon)) {
    console.error(`unknown weapon "${a.weapon}" (${WEAPON_KEYS.join(', ')})`);
    process.exit(1);
  }
  return a;
}

const MAX_SIM_S = 60 * 30; // safety stop

function metaRanks(n) {
  return { hearty: n, jaws: n, paws: n, sniffer: n, lucky: n, learner: n };
}

function runSeed(seed, args) {
  const world = new World({
    seed, startWave: args.startWave, hp: args.hp, startWeapon: args.weapon, meta: metaRanks(args.meta),
    allowedWeapons: args.allowed, endless: args.endless, god: args.god,
  });
  const bot = makeBot(args.bot, seed);
  let peakEnemies = 0;
  let cards = 0;
  let stoppedAtWaveCap = false;
  let levelAtW10 = null;
  let killer = null;
  const hurtBy = {};
  const t0 = performance.now();
  while (!world.over && world.time < MAX_SIM_S) {
    if (world.phase === PHASE.LEVELUP) {
      world.choose(bot.pickCard(world));
      cards += 1;
      continue;
    }
    world.step(SIM.DT, bot.input(world));
    for (const ev of world.events) {
      if (ev.type === 'playerHurt') {
        killer = ev.from;
        hurtBy[ev.from] = Math.round(((hurtBy[ev.from] || 0) + ev.dmg) * 10) / 10;
      }
    }
    world.events.length = 0;
    if (levelAtW10 === null && world.wave >= 10) levelAtW10 = world.level;
    if (world.enemies.length > peakEnemies) peakEnemies = world.enemies.length;
    if (world.wavesCleared >= args.waves && !world.over && !(args.endless && args.waves === WAVES.COUNT)) {
      stoppedAtWaveCap = true;
      break;
    }
  }
  const r = world.result();
  const won = world.phase === PHASE.VICTORY || (args.endless && r.victory);
  return {
    seed,
    outcome: won ? 'win' : (stoppedAtWaveCap ? 'cap' : (world.over ? 'dead' : 'timeout')),
    wave: r.wave,
    cleared: r.wavesCleared,
    level: r.level,
    levelAtW10,
    score: r.score,
    kills: r.kills,
    bestCombo: r.bestCombo,
    time: r.timeSec,
    hpLeft: Math.round(world.player.hp * 10) / 10,
    bones: r.goldenBones,
    killer: world.over && !won ? killer : null,
    hurtBy,
    bosses: r.bossesBeaten.length,
    peakEnemies,
    cards,
    weapons: world.weapons.map(w => `${w.key}${w.level}`).join(','),
    ms: Math.round(performance.now() - t0),
  };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// --- Perf benchmark -------------------------------------------------------------

function perfRun(label, weapons, seed) {
  const world = new World({ seed, startWave: 10, god: true, weapons, allowedWeapons: [] });
  for (const w of world.weapons) w.level = 5;
  world.stats.proj = 1;
  const bot = makeBot('kite', seed);
  const times = [];
  let enemiesAtSample = 0;
  let maxProj = 0;
  let maxHostile = 0;
  for (let i = 0; i < 4200 && !world.over; i++) {
    if (world.phase === PHASE.LEVELUP) world.choose(0);
    world.budget = 1000; // keep the cap full
    const input = bot.input(world);
    const t0 = performance.now();
    world.step(SIM.DT, input);
    const dt = performance.now() - t0;
    world.events.length = 0;
    if (i >= 600 && world.enemies.length >= ENEMY.CAP - 20) {
      times.push(dt);
      enemiesAtSample += world.enemies.length;
      maxProj = Math.max(maxProj, world.projectiles.length);
      maxHostile = Math.max(maxHostile, world.hostiles.length);
    }
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / Math.max(1, times.length);
  const pct = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))] || 0;
  return {
    label,
    samples: times.length,
    meanEnemies: Math.round(enemiesAtSample / Math.max(1, times.length)),
    maxProjectiles: maxProj,
    maxHostiles: maxHostile,
    meanMs: +mean.toFixed(3),
    p50Ms: +pct(0.5).toFixed(3),
    p99Ms: +pct(0.99).toFixed(3),
    maxMs: +times[times.length - 1]?.toFixed(3),
  };
}

const args = parseArgs(process.argv);

if (args.perf) {
  // Warm-up run so the JIT has compiled the hot paths
  perfRun('warmup', ['bark', 'ball', 'bone', 'frisbee'], 99);
  const out = [
    perfRun('bark+ball+bone+frisbee', ['bark', 'ball', 'bone', 'frisbee'], 1),
    perfRun('squeak+zoomies+frisbee+bone', ['squeak', 'zoomies', 'frisbee', 'bone'], 2),
  ];
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const rows = [];
for (let i = 0; i < args.seeds; i++) rows.push(runSeed(args.seedBase + i, args));

const deaths = rows.filter(r => r.outcome === 'dead');
const w10 = rows.filter(r => r.levelAtW10 !== null).map(r => r.levelAtW10);
const summary = {
  bot: args.bot,
  weapon: args.weapon,
  meta: args.meta,
  seeds: rows.length,
  wins: rows.filter(r => r.outcome === 'win').length,
  winRate: Math.round((rows.filter(r => r.outcome === 'win').length / rows.length) * 100) / 100,
  medianDeathWave: deaths.length ? median(deaths.map(r => r.wave)) : null,
  medianEndWave: median(rows.map(r => r.wave)),
  medianLevel: median(rows.map(r => r.level)),
  medianLevelAtW10: median(w10),
  medianScore: median(rows.map(r => r.score)),
  meanKills: Math.round(rows.reduce((s, r) => s + r.kills, 0) / rows.length),
  killers: rows.reduce((m, r) => { if (r.killer) m[r.killer] = (m[r.killer] || 0) + 1; return m; }, {}),
  meanBones: Math.round((rows.reduce((s, r) => s + r.bones, 0) / rows.length) * 10) / 10,
  peakEnemies: Math.max(...rows.map(r => r.peakEnemies)),
  msPerRun: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
};

if (args.json) {
  console.log(JSON.stringify({ summary, runs: rows }, null, 2));
} else {
  console.log(`sim-run: bot=${args.bot} weapon=${args.weapon} meta=${args.meta} seeds=${rows.length} startWave=${args.startWave}`);
  console.log('seed  outcome  wave  level  lvW10  score   kills  bones  time(s)  peak  weapons');
  for (const r of rows) {
    console.log(
      `${String(r.seed).padEnd(5)} ${r.outcome.padEnd(8)} ${String(r.wave).padEnd(5)} ${String(r.level).padEnd(6)} `
      + `${String(r.levelAtW10 ?? '-').padEnd(6)} ${String(r.score).padEnd(7)} ${String(r.kills).padEnd(6)} ${String(r.bones).padEnd(6)} `
      + `${String(r.time).padEnd(8)} ${String(r.peakEnemies).padEnd(5)} ${r.weapons}`,
    );
  }
  console.log(`\nsummary: ${JSON.stringify(summary)}`);
}
