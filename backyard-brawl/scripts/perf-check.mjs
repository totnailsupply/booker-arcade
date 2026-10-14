#!/usr/bin/env node
// =============================================================================
// perf-check.mjs — real-time frame cost in a crowded arena (Step 3A FX budget).
//
//   node scripts/perf-check.mjs                       # ?wave=10&god=1&autoplay=1, 20 s
//   node scripts/perf-check.mjs --url '?wave=9&god=1&autoplay=1&seed=9' --secs 20 --runs 2
//
// Real time (no test clock). Reports, per run:
//   frame  = rAF interval (ms): what the player sees (headless software GL is slow)
//   cost   = Phaser prestep -> postrender (ms): CPU time of update + render submit
// mean and p95 of each, plus mean enemy count. Compare before / after FX work.
// Launches through scripts/lib/browser.mjs (never chromium.launch directly).
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const PORT = process.env.PORT || 3002;
const URL_Q = opt('url', '?wave=10&god=1&autoplay=1&seed=10');
const SECS = Number(opt('secs', 20));
const RUNS = Number(opt('runs', 1));
const WARMUP_S = 3;

const stats = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const mean = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const p95 = a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] || 0;
  return { mean: Math.round(mean * 100) / 100, p95: Math.round(p95 * 100) / 100, n: a.length };
};

async function once(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/${URL_Q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    try { return JSON.parse(window.render_game_to_text()).scenes.includes('ArenaScene'); } catch { return false; }
  }, null, { timeout: 20000 });
  await page.waitForTimeout(WARMUP_S * 1000);
  await page.evaluate(() => {
    const g = window.__GAME__;
    const rec = { frames: [], costs: [], enemies: [], t0: 0, last: 0 };
    window.__PERF__ = rec;
    g.events.on('prestep', () => { rec.t0 = performance.now(); });
    g.events.on('postrender', () => {
      if (rec.t0) rec.costs.push(performance.now() - rec.t0);
      const a = g.scene.getScene('ArenaScene');
      if (a?.world) rec.enemies.push(a.world.enemies.length);
    });
    const loop = (t) => {
      if (rec.last) rec.frames.push(t - rec.last);
      rec.last = t;
      if (!rec.stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.waitForTimeout(SECS * 1000);
  const rec = await page.evaluate(() => {
    const r = window.__PERF__;
    r.stop = true;
    return { frames: r.frames, costs: r.costs, enemies: r.enemies };
  });
  const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.close();
  const enemyMean = rec.enemies.reduce((s, v) => s + v, 0) / Math.max(1, rec.enemies.length);
  return {
    frame: stats(rec.frames), cost: stats(rec.costs),
    enemiesMean: Math.round(enemyMean), enemiesMax: Math.max(0, ...rec.enemies),
    mode: st.mode, wave: st.wave, errors,
  };
}

async function run() {
  const browser = await launchBrowser({ headless: true, viewport: { width: 960, height: 540 } });
  const out = [];
  try {
    for (let i = 0; i < RUNS; i++) out.push(await once(browser));
  } finally {
    await browser.close();
  }
  for (const r of out) {
    console.log(`frame mean ${r.frame.mean} ms p95 ${r.frame.p95} (n=${r.frame.n}) | cost mean ${r.cost.mean} ms p95 ${r.cost.p95} | enemies mean ${r.enemiesMean} max ${r.enemiesMax} | ${r.mode} w${r.wave}${r.errors.length ? ` | ERRORS ${r.errors.join('; ')}` : ''}`);
  }
  if (out.some(r => r.errors.length)) process.exit(1);
}

run();
