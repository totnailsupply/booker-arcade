#!/usr/bin/env node
// =============================================================================
// sim-climb.mjs — headless climbs of Level 1 (no browser). Runs the game's own
// ClimbSim (same platforms, hazards, landing, lives, camera and fail rules as
// ClimbScene) with the AutoClimber bot.
//
//   1. Expert bot at several frame rates: must reach the roof with no falls
//      and no hits (exit 1 otherwise).
//   2. Sloppy bot (Constants.SLOPPY: ~150 ms reaction, aim noise, late
//      releases, imperfect target choice, hazard blind spots), N seeded runs:
//        a. with 99 lives  -> falls / hits per zone (every run sees every zone)
//        b. with 3 lives + checkpoints (the real rules) -> finish rate, lives lost
//      and a check against the target difficulty curve (PLAN 4 / progress.md):
//        zone 1 almost never, zone 2 occasionally, zones 3-4 regularly, and most
//        runs still finish with <= 3 lives lost.
//
// Usage: node scripts/sim-climb.mjs [--fps 60,30,144,45] [--runs 50] [--seed 1]
//                                   [--no-sloppy] [--only-sloppy] [--timeout 300] [--verbose]
// =============================================================================

import { gameState, MODES } from '../src/core/GameState.js';
import { eventBus, Events } from '../src/core/EventBus.js';
import { WORLD } from '../src/core/Constants.js';
import { ClimbSim } from '../src/systems/ClimbSim.js';
import { AutoClimber } from '../src/systems/AutoClimber.js';
import { LEVEL1 } from '../src/levels/level1.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const fpsList = opt('--fps', '60,30,144,45').split(',').map(Number);
const runs = Number(opt('--runs', '50'));
const seed0 = Number(opt('--seed', '1'));
const timeoutS = Number(opt('--timeout', '300'));
const verbose = args.includes('--verbose');
const doExpert = !args.includes('--only-sloppy');
const doSloppy = !args.includes('--no-sloppy');
const ZN = LEVEL1.zones.length;

function run({ fps = 60, sloppy = false, seed = 1, lives = 3, jitter = false }) {
  gameState.beginRun();
  gameState.lives = lives;
  gameState.livesStart = lives;
  const out = { falls: Array(ZN + 1).fill(0), hits: Array(ZN + 1).fill(0), hitBy: {}, stomps: 0, springs: 0, crumbles: 0 };
  const onFell = (e) => {
    const z = e.zone || 1;
    if (e.cause === 'hit') {
      out.hits[z] += 1;
      out.hitBy[e.hazard] = (out.hitBy[e.hazard] || 0) + 1;
    } else out.falls[z] += 1;
    if (verbose) console.log(`    ${sloppy ? `seed ${seed}` : `fps ${fps}`}: ${e.cause}${e.hazard ? `(${e.hazard})` : ''} zone ${z} at ${-e.y}px x=${e.x}`);
  };
  const onSpring = () => { out.springs += 1; };
  const onCrumble = () => { out.crumbles += 1; };
  eventBus.on(Events.SOBA_FELL, onFell);
  eventBus.on(Events.SPRING, onSpring);
  eventBus.on(Events.CRUMBLE, onCrumble);

  const bot = new AutoClimber({ sloppy, seed });
  const sim = new ClimbSim({ level: LEVEL1, bot });
  sim.placeStart({ startHeight: null });
  // jitter: real-time-like frames as measured in headless Chromium (mostly
  // 16.7 ms, ~8% spikes of 20-50 ms when the machine is busy), seeded
  let js = seed * 7919 + 13;
  const jrand = () => ((js = (js * 16807) % 2147483647) / 2147483647);
  const nextDt = () => {
    if (!jitter) return 1 / fps;
    const r = jrand();
    if (r < 0.08) return 0.02 + jrand() * 0.03;
    return 1 / 60 + (jrand() - 0.5) * 0.001;
  };
  let t = 0;
  let bounces = 0;
  const onBounce = () => { bounces += 1; };
  eventBus.on(Events.SOBA_BOUNCE, onBounce);
  while (t < timeoutS) {
    const dt = nextDt();
    sim.step(dt, 0);
    t += dt;
    if (gameState.mode === MODES.COMPLETE || gameState.mode === MODES.GAME_OVER) break;
  }
  eventBus.off(Events.SOBA_FELL, onFell);
  eventBus.off(Events.SPRING, onSpring);
  eventBus.off(Events.CRUMBLE, onCrumble);
  eventBus.off(Events.SOBA_BOUNCE, onBounce);
  const res = {
    ...out,
    complete: gameState.mode === MODES.COMPLETE,
    gameOver: gameState.mode === MODES.GAME_OVER,
    t: gameState.runTimeMs / 1000,
    bounces,
    maxM: gameState.maxHeightM,
    zone: gameState.zone,
    treats: gameState.treats,
    stomps: gameState.stomps,
    livesLost: gameState.livesLost,
    score: gameState.result?.score ?? gameState.score,
    stars: gameState.result?.stars ?? 0,
    unsafePlans: bot.stats.unsafePlans,
  };
  sim.destroy();
  return res;
}

const sum = a => a.reduce((x, y) => x + y, 0);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
let ok = true;

if (doExpert) {
  console.log('expert bot (3 lives):');
  for (const fps of fpsList) {
    const r = run({ fps });
    const clean = r.complete && sum(r.falls) === 0 && sum(r.hits) === 0;
    ok = ok && clean;
    const status = r.complete ? 'ROOF' : r.gameOver ? 'GAME OVER' : 'TIMEOUT';
    console.log(`  fps ${String(fps).padStart(3)}: ${status} t=${r.t.toFixed(1)}s bounces=${r.bounces} max=${r.maxM.toFixed(1)}m`
      + ` falls=${sum(r.falls)} hits=${sum(r.hits)} stomps=${r.stomps} springs=${r.springs} treats=${r.treats}/${LEVEL1.treats.length}`
      + ` score=${r.score} stars=${r.stars}${clean ? '' : '  <-- FAIL'}`);
  }
  // Real-time-like frame jitter (a busy browser): several seeds
  let jitterClean = 0;
  const jitterRuns = Number(opt('--jitter-runs', '12'));
  for (let i = 0; i < jitterRuns; i++) {
    const r = run({ jitter: true, seed: 100 + i });
    const clean = r.complete && sum(r.falls) === 0 && sum(r.hits) === 0;
    if (clean) jitterClean += 1;
    else console.log(`  jitter seed ${100 + i}: ${r.complete ? 'ROOF' : 'NOT FINISHED'} falls=${sum(r.falls)} hits=${sum(r.hits)} ${JSON.stringify(r.hitBy)}  <-- FAIL`);
  }
  console.log(`  real-time-like frames (16.7 ms + 8% spikes of 20-50 ms): ${jitterClean}/${jitterRuns} clean climbs`);
  ok = ok && jitterClean === jitterRuns;
}

if (doSloppy) {
  // a. the curve: 99 lives, every run sees every zone
  const curve = [];
  for (let i = 0; i < runs; i++) curve.push(run({ sloppy: true, seed: seed0 + i, lives: 99 }));
  console.log(`sloppy bot, ${runs} seeded runs with 99 lives (falls / hits per zone):`);
  const perZone = [];
  for (let z = 1; z <= ZN; z++) {
    const f = sum(curve.map(r => r.falls[z]));
    const h = sum(curve.map(r => r.hits[z]));
    const runsWith = curve.filter(r => r.falls[z] + r.hits[z] > 0).length;
    perZone.push({ z, f, h, perRun: (f + h) / runs, runsWith });
    console.log(`  zone ${z} ${LEVEL1.zones[z - 1].name.padEnd(16)} falls ${String(f).padStart(3)}  hits ${String(h).padStart(3)}`
      + `  lives/run ${((f + h) / runs).toFixed(2)}  runs with a loss ${runsWith}/${runs}`);
  }
  const hitBy = {};
  for (const r of curve) for (const [k, v] of Object.entries(r.hitBy)) hitBy[k] = (hitBy[k] || 0) + v;
  console.log(`  hits by hazard ${JSON.stringify(hitBy)}; completed ${curve.filter(r => r.complete).length}/${runs};`
    + ` median time ${median(curve.map(r => r.t)).toFixed(1)}s; median treats ${median(curve.map(r => r.treats))}/40;`
    + ` stomps ${sum(curve.map(r => r.stomps))}`);

  // b. the real rules: 3 lives, checkpoints restore to >= 1
  const real = [];
  for (let i = 0; i < runs; i++) real.push(run({ sloppy: true, seed: seed0 + 1000 + i, lives: 3 }));
  const fin = real.filter(r => r.complete);
  const fin3 = fin.filter(r => r.livesLost <= 3);
  const overZone = {};
  for (const r of real.filter(x => x.gameOver)) overZone[r.zone] = (overZone[r.zone] || 0) + 1;
  console.log(`sloppy bot, ${runs} seeded runs with 3 lives + checkpoints:`);
  console.log(`  finished ${fin.length}/${runs}, finished with <= 3 lives lost ${fin3.length}/${runs};`
    + ` lives lost median ${median(real.map(r => r.livesLost))} (finishers ${median(fin.map(r => r.livesLost))});`
    + ` game overs by zone ${JSON.stringify(overZone)}; median clear time ${median(fin.map(r => r.t)).toFixed(1)}s;`
    + ` median treats ${median(real.map(r => r.treats))}; 3-star runs ${real.filter(r => r.stars === 3).length}`);

  // c. target curve, as the share of runs that lose a life in each zone
  const share = z => perZone[z - 1].runsWith / runs;
  const pct = x => `${Math.round(x * 100)}%`;
  const checks = [
    [`zone 1 almost never (${pct(share(1))} of runs lose a life, want <= 4%)`, share(1) <= 0.04],
    [`zone 2 occasionally (${pct(share(2))}, want 3-30%, above zone 1)`, share(2) >= 0.03 && share(2) <= 0.3 && share(2) >= share(1)],
    [`zone 3 regularly (${pct(share(3))}, want >= 25%)`, share(3) >= 0.25],
    [`zone 4 regularly (${pct(share(4))}, want >= 25%)`, share(4) >= 0.25],
    ['zones 3-4 harder than zone 2', share(3) > share(2) && share(4) > share(2)],
    [`most runs finish with <= 3 lives lost (${pct(fin3.length / runs)}, want > 50%)`, fin3.length > runs / 2],
  ];
  for (const [label, pass] of checks) console.log(`  curve ${pass ? 'OK  ' : 'WARN'} ${label}`);
}

console.log(ok ? 'sim-climb: OK' : 'sim-climb: FAILED (expert bot fell or got hit)');
process.exit(ok ? 0 : 1);
