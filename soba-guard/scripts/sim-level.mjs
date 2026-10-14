#!/usr/bin/env node
// Headless Node run of the battle sim (src/sim) at fixed 1/60 s steps.
//
//   node scripts/sim-level.mjs --level 1 --bot idle|steamers|cats-steamers|novice|novice-skip|smart|all --seeds 20
//   [--seed N] first seed (default 1)   [--wave N] start wave   [--coins N]
//   [--mods '{"startCoins":25}']        Treat Shop modifiers (BattleConfig contract)
//   [--verbose] print each seed's line and event counts  [--quiet] summary only
//
// One bot: one line per seed (won/lost, wave reached, score, stars, time) and a
// summary. --bot all: a summary table with the PLAN §9 balance gates.

import { Battle } from '../src/sim/Battle.js';
import { createBot, BOT_NAMES } from '../src/sim/Bots.js';
import { getLevel } from '../src/data/levels/index.js';
import { SIM } from '../src/core/Constants.js';

const args = { level: 1, bot: 'idle', seeds: 5, seed: 1, wave: 1, coins: null, verbose: false, quiet: false, maxTime: 900, mods: null };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  const v = process.argv[i + 1];
  if (a === '--level') { args.level = +v; i++; }
  else if (a === '--bot') { args.bot = v; i++; }
  else if (a === '--seeds') { args.seeds = +v; i++; }
  else if (a === '--seed') { args.seed = +v; i++; }
  else if (a === '--wave') { args.wave = +v; i++; }
  else if (a === '--coins') { args.coins = +v; i++; }
  else if (a === '--max-time') { args.maxTime = +v; i++; }
  else if (a === '--mods') { args.mods = JSON.parse(v); i++; }
  else if (a === '--verbose') args.verbose = true;
  else if (a === '--quiet') args.quiet = true;
}

const level = getLevel(args.level);

export function runOne(botName, seed) {
  const battle = new Battle({ level, seed, startWave: args.wave, startCoins: args.coins, modifiers: args.mods });
  const bot = createBot(botName, { seed });
  const counts = {};
  const maxSteps = Math.round(args.maxTime / SIM.DT);
  for (let i = 0; i < maxSteps && !battle.outcome; i++) {
    battle.step(SIM.DT, { commands: bot.decide(battle) });
    for (const e of battle.drainEvents()) counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return { r: battle.result(), counts, battle };
}

function runBot(botName, print) {
  const rows = [];
  for (let s = 0; s < args.seeds; s++) {
    const seed = args.seed + s;
    const { r, counts, battle } = runOne(botName, seed);
    rows.push(r);
    if (print) {
      const units = battle.units.filter(u => u.alive).length;
      const stars = r.stars.map(x => (x ? '*' : '.')).join('');
      console.log(`seed ${String(seed).padStart(4)}  ${(r.outcome || 'timeout').padEnd(7)} wave ${String(r.wave).padStart(2)}/${r.wavesTotal}  stars ${stars}  score ${String(r.score).padStart(4)}  kills ${String(r.kills).padStart(3)}  t ${String(r.timeS).padStart(5)}s  scooters ${r.scootersUsed}  lost ${r.unitsLost}  units ${units}  barks ${counts.bark || 0}  zoomies ${counts.zoomies || 0}  upgrades ${counts.upgrade || 0}`
        + (args.verbose ? `\n    ${JSON.stringify(counts)}` : ''));
    }
  }
  const n = rows.length;
  const wins = rows.filter(r => r.won).length;
  const three = rows.filter(r => r.stars.every(Boolean)).length;
  const lossWaves = rows.filter(r => !r.won).map(r => r.wave);
  return {
    bot: botName,
    n,
    wins,
    winPct: Math.round((100 * wins) / n),
    threePct: Math.round((100 * three) / n),
    noScooterPct: Math.round((100 * rows.filter(r => r.stars[1]).length) / n),
    noLossPct: Math.round((100 * rows.filter(r => r.stars[2]).length) / n),
    maxLossWave: lossWaves.length ? Math.max(...lossWaves) : null,
    lossWaves,
    avgScore: Math.round(rows.reduce((a, r) => a + r.score, 0) / n),
  };
}

// PLAN §9 gates (Level 1)
const GATES = {
  idle: (s) => [s.wins === 0 && s.maxLossWave !== null && s.maxLossWave < 5, 'loses before wave 5'],
  steamers: (s) => [s.winPct <= 50, 'wins <= 50%'],
  novice: (s) => [s.winPct >= 70, 'wins >= 70%'],
  'novice-skip': (s) => [s.winPct < 50, 'skipping a row loses (< 50%, check only)'],
  smart: (s) => [s.winPct === 100 && s.threePct >= 60, 'wins 100%, 3 stars >= 60%'],
};

if (args.bot === 'all') {
  const order = BOT_NAMES;
  const results = order.map(b => runBot(b, args.verbose));
  console.log(`\n${level.name} — ${args.seeds} seeds from ${args.seed}${args.mods ? `  mods ${JSON.stringify(args.mods)}` : ''}\n`);
  console.log('bot            win%  3star%  noScoot%  noLoss%  avgScore  lossWaves                    gate');
  let allOk = true;
  for (const s of results) {
    const g = GATES[s.bot];
    let gate = '-';
    if (g) {
      const [ok, text] = g(s);
      gate = `${ok ? 'PASS' : 'FAIL'} (${text})`;
      if (!ok && s.bot !== 'novice-skip') allOk = false;
    }
    const lw = s.lossWaves.length ? `[${s.lossWaves.join(',')}]` : '-';
    console.log(`${s.bot.padEnd(14)} ${String(s.winPct).padStart(4)}  ${String(s.threePct).padStart(6)}  ${String(s.noScooterPct).padStart(8)}  ${String(s.noLossPct).padStart(7)}  ${String(s.avgScore).padStart(8)}  ${lw.slice(0, 28).padEnd(28)} ${gate}`);
  }
  console.log(`\nbalance gates: ${allOk ? 'ALL PASS' : 'SOME FAIL'}`);
  process.exitCode = allOk ? 0 : 1;
} else {
  const s = runBot(args.bot, !args.quiet);
  console.log(`\n${level.name} bot=${args.bot}: won ${s.wins}/${s.n} (${s.winPct}%)  3 stars ${s.threePct}%  avg score ${s.avgScore}`
    + (s.lossWaves.length ? `  losses at waves [${s.lossWaves.join(', ')}]` : ''));
}
