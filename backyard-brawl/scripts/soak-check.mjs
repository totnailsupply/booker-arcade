#!/usr/bin/env node
// =============================================================================
// soak-check.mjs — nothing leaks run over run.
//
// A. Three consecutive runs in one page: `?autoplay=1&hp=3&seed=5` (the smart
//    bot plays until knocked out), Results, Space (instant replay), x3.
//    Same seed, so every run is the same run: at sim time SAMPLE_S of each run
//    the Arena's display objects, pooled sprites, tweens, timers and bus
//    listeners must match run 1, and on each Results screen the totals over all
//    scenes plus the JS heap (after a forced GC) must not grow.
// B. Endless: save seeded with Endless unlocked and picked, then
//    `?wave=10&god=1&autoplay=1&seed=7&weapons=bark,ball,bone,frisbee`. Robo-Vac, then wave 11, into wave 12.
//    Samples at each wave start; tweens / timers / listeners stay bounded and
//    pooled objects stay under the enemy cap scale.
//
// Uses the deterministic test clock (window.advanceTime). Exit 1 on failure or
// any page / console error. Launches through scripts/lib/browser.mjs.
//
//   node scripts/soak-check.mjs [--url http://localhost:3002]
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';
import { checker } from './lib/menu-qa.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = opt('url', `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, '');
const SAMPLE_S = 20;
const HEAP_GROWTH_MB = 3; // allowed heap growth from Results 1 to Results 3 (after GC)
const c = checker('soak-check');
const allErrors = [];

async function open(url, save) {
  const browser = await launchBrowser({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });
  if (save) {
    await page.addInitScript((v) => {
      try { localStorage.setItem('backyard-brawl:save', v); } catch { /* ignore */ }
    }, JSON.stringify(save));
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.isBooted, null, { timeout: 15000 });
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, errors, cdp };
}

const frames = (page, n) => page.evaluate((k) => window.advanceTime(k * 1000 / 60), n);
const st = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

/** Counts over every scene (recursing into containers) + Arena pools. */
function metrics(page) {
  return page.evaluate(() => {
    const g = window.__GAME__;
    const countTree = (list) => {
      let n = 0;
      for (const o of list) {
        n += 1;
        if (o.list && Array.isArray(o.list)) n += countTree(o.list);
      }
      return n;
    };
    let display = 0;
    let tweens = 0;
    let timers = 0;
    const perScene = {};
    for (const s of g.scene.scenes) {
      const sys = s.sys;
      if (!sys || !sys.displayList) continue;
      const d = countTree(sys.displayList.list);
      const tw = s.tweens ? s.tweens.getTweens().length : 0;
      const tm = s.time ? s.time._active.length + s.time._pendingInsertion.length : 0;
      display += d;
      tweens += tw;
      timers += tm;
      if (d || tw || tm) perScene[s.scene.key] = { display: d, tweens: tw, timers: tm, active: sys.isActive() };
    }
    const arena = g.scene.getScene('ArenaScene');
    let pools = null;
    if (arena && arena.pools && arena.sys.isActive()) {
      pools = {};
      for (const [k, v] of Object.entries(arena.pools)) pools[k] = v.length;
    }
    const listeners = Object.values(window.__EVENT_BUS__.counts()).reduce((a, b) => a + b, 0);
    const phaserListeners = g.events.eventNames().reduce((a, e) => a + g.events.listenerCount(e), 0);
    return {
      display, tweens, timers, perScene, pools, listeners, phaserListeners,
      textures: Object.keys(g.textures.list).length,
      voices: window.__AUDIO__?.debugState?.().peakVoices ?? null,
    };
  });
}

async function heapMB(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return Math.round((usedSize / 1048576) * 100) / 100;
}

async function untilState(page, pred, maxFrames, chunk = 30) {
  for (let f = 0; f < maxFrames; f += chunk) {
    const s = await st(page);
    if (pred(s)) return s;
    await frames(page, chunk);
  }
  return null;
}

// --- A. three runs in one page ----------------------------------------------------
async function partA() {
  console.log('\nA. 3 consecutive runs (?autoplay=1&hp=3&seed=5, Space replay)');
  const { browser, page, errors, cdp } = await open(`${BASE}/?autoplay=1&hp=3&seed=5`);
  const runs = [];
  try {
    for (let run = 1; run <= 3; run++) {
      const mid = await untilState(page, s => s.simTime >= SAMPLE_S || s.mode === 'game_over', 60 * 120, 10);
      if (!mid) throw new Error(`run ${run}: never reached sim time ${SAMPLE_S}`);
      const atMid = await metrics(page);
      const end = await untilState(page, s => s.mode === 'game_over' || s.mode === 'victory', 60 * 600, 30);
      if (!end) throw new Error(`run ${run}: no game over`);
      await frames(page, 150); // Results count-ups, unlock cards, music change
      const atResults = await metrics(page);
      const heap = await heapMB(page, cdp);
      runs.push({ run, simTime: mid.simTime, score: end.score, wave: end.wave, atMid, atResults, heap });
      console.log(`     run ${run}: score ${end.score} wave ${end.wave} | t=${mid.simTime}s arena display ${atMid.display}, pools ${JSON.stringify(atMid.pools)}, tweens ${atMid.tweens}, timers ${atMid.timers}, bus ${atMid.listeners}`);
      console.log(`            Results: display ${atResults.display}, tweens ${atResults.tweens}, timers ${atResults.timers}, bus ${atResults.listeners}, game events ${atResults.phaserListeners}, textures ${atResults.textures}, heap ${heap} MB`);
      if (run < 3) {
        await page.keyboard.press('Space');
        await frames(page, 4);
        const s = await st(page);
        if (!s.scenes.includes('ArenaScene')) throw new Error(`run ${run}: Space did not replay (${s.scenes})`);
      }
    }
    const [r1, r2, r3] = runs;
    c.ok(r1.score === r2.score && r2.score === r3.score, `same seed, same run (scores ${r1.score}, ${r2.score}, ${r3.score})`);
    for (const k of ['display', 'tweens', 'timers', 'listeners']) {
      c.ok(r2.atMid[k] <= r1.atMid[k] && r3.atMid[k] <= r1.atMid[k],
        `mid-run ${k} does not grow (${r1.atMid[k]}, ${r2.atMid[k]}, ${r3.atMid[k]})`);
    }
    c.ok(JSON.stringify(r1.atMid.pools) === JSON.stringify(r3.atMid.pools), `Arena pools identical run 1 vs 3 (${JSON.stringify(r3.atMid.pools)})`);
    for (const k of ['display', 'tweens', 'timers', 'listeners', 'phaserListeners', 'textures']) {
      c.ok(r3.atResults[k] <= r1.atResults[k], `Results ${k} does not grow (${r1.atResults[k]}, ${r2.atResults[k]}, ${r3.atResults[k]})`);
    }
    c.ok(r3.heap - r1.heap <= HEAP_GROWTH_MB, `heap after GC: ${r1.heap} -> ${r2.heap} -> ${r3.heap} MB (growth <= ${HEAP_GROWTH_MB} MB)`);
  } finally {
    allErrors.push(...errors.map(e => `[A] ${e}`));
    await browser.close();
  }
  return runs;
}

// --- B. Endless into wave 12 -----------------------------------------------------------
async function partB() {
  console.log('\nB. Endless: ?wave=10&god=1&autoplay=1&seed=7&weapons=bark,ball,bone,frisbee into wave 12');
  const save = {
    version: 1, bones: 0, scores: [],
    unlocks: { weapons: ['bark', 'ball', 'bone', 'frisbee', 'squeak', 'zoomies'], endless: true },
    stats: { runs: 5, kills: 900, bestWave: 10, wins: 1, bones: 0, bossesBeaten: ['boss-cat', 'boss-vac'] },
    lastWeapon: 'bark', lastEndless: true,
  };
  const { browser, page, errors, cdp } = await open(`${BASE}/?wave=10&god=1&autoplay=1&seed=7&weapons=bark,ball,bone,frisbee`, save);
  const samples = [];
  try {
    const s0 = await st(page);
    c.ok(s0.runConfig?.endless === true, `runConfig.endless from the save (${s0.runConfig?.endless})`);
    for (const wave of [11, 12]) {
      const s = await untilState(page, x => x.wave >= wave && x.phase === 'playing', 60 * 400, 30);
      if (!s) throw new Error(`never reached wave ${wave}`);
      await frames(page, 60 * 20); // 20 s into the wave
      const m = await metrics(page);
      const now = await st(page);
      const heap = await heapMB(page, cdp);
      samples.push({ wave, m, heap, enemies: now.enemyCount, pickups: now.pickups });
      console.log(`     wave ${wave} +20s: enemies ${now.enemyCount}, pickups ${now.pickups}, display ${m.display}, pools ${JSON.stringify(m.pools)}, tweens ${m.tweens}, timers ${m.timers}, bus ${m.listeners}, heap ${heap} MB`);
    }
    const last = await st(page);
    c.ok(last.wave >= 12 && last.endless && !['game_over', 'victory'].includes(last.mode), `Endless keeps going (wave ${last.wave}, mode ${last.mode}, HUD ${last.endless ? 'ENDLESS' : '-'})`);
    const [a, b] = samples;
    c.ok(b.m.tweens <= a.m.tweens + 20 && b.m.timers <= a.m.timers + 10, `tweens/timers bounded (${a.m.tweens}/${a.m.timers} -> ${b.m.tweens}/${b.m.timers})`);
    c.ok(b.m.listeners === a.m.listeners, `bus listeners constant (${a.m.listeners} -> ${b.m.listeners})`);
    const poolMax = Math.max(...Object.values(b.m.pools || {}));
    c.ok(poolMax <= 420, `largest pool ${poolMax} stays under the pickup/enemy caps`);
    c.ok(b.heap - a.heap <= 8, `heap after GC ${a.heap} -> ${b.heap} MB`);
  } finally {
    allErrors.push(...errors.map(e => `[B] ${e}`));
    await browser.close();
  }
  return samples;
}

try {
  await partA();
  await partB();
} catch (e) {
  allErrors.push(`EXCEPTION: ${e.stack || e.message}`);
}
c.ok(!allErrors.length, `no page / console errors (${allErrors.length})`);
process.exit(c.finish(allErrors));
