#!/usr/bin/env node
// =============================================================================
// fps-probe.mjs — real-time frame pacing of a battle in headless Chromium.
//
// Loads the game with a query (default ?autoplay=1: the smart bot plays Level 1
// in real time, no test clock) and records every requestAnimationFrame delta
// until the battle ends (or --max-s). Reports average fps, long frames
// (> 25 ms and > 50 ms) overall and for the final wave, and the outcome.
//
// Usage: node scripts/fps-probe.mjs [--query "?autoplay=1"] [--max-s 300]
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argVal('--url', `http://localhost:${process.env.PORT || 3003}`);
const QUERY = argVal('--query', '?autoplay=1');
const MAX_S = Number(argVal('--max-s', 300));

const browser = await launchBrowser({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/${QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.isActive('BattleScene'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const rec = { frames: [], last: performance.now() };
    window.__FPS__ = rec;
    const tick = (now) => {
      const b = window.__GAME__.scene.getScene('BattleScene');
      const wave = b?.battle?.waves?.current ?? 0;
      const alive = b?.battle ? b.battle.enemies.filter(e => e.alive).length : 0;
      const shots = b?.battle ? b.battle.projectiles.filter(p => p.alive).length : 0;
      rec.frames.push([now - rec.last, wave, alive, shots]);
      rec.last = now;
      if (!rec.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  let st = null;
  while ((Date.now() - t0) / 1000 < MAX_S) {
    await new Promise(r => setTimeout(r, 2000));
    st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (st.mode === 'won' || st.mode === 'game_over') break;
  }
  const frames = await page.evaluate(() => { window.__FPS__.stop = true; return window.__FPS__.frames; });
  const stats = (list, label) => {
    if (!list.length) return console.log(`${label}: no frames`);
    const ms = list.map(f => f[0]).slice(1);
    const total = ms.reduce((a, b) => a + b, 0);
    const sorted = [...ms].sort((a, b) => a - b);
    const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
    console.log(`${label}: ${ms.length} frames, avg ${(1000 * ms.length / total).toFixed(1)} fps, p50 ${p(0.5)} ms, p99 ${p(0.99)} ms, max ${sorted[sorted.length - 1].toFixed(1)} ms, >25ms ${ms.filter(x => x > 25).length}, >50ms ${ms.filter(x => x > 50).length}, peak enemies ${Math.max(...list.map(f => f[2]))}, peak dumplings ${Math.max(...list.map(f => f[3]))}`);
  };
  stats(frames, 'whole battle');
  let acc = 0;
  const longAt = [];
  frames.forEach((f, i) => { acc += i ? f[0] : 0; if (i && f[0] > 50) longAt.push(`${(acc / 1000).toFixed(1)}s:${f[0].toFixed(0)}ms`); });
  if (longAt.length) console.log(`frames > 50 ms at: ${longAt.slice(0, 30).join(' ')}`);
  const lastWave = Math.max(...frames.map(f => f[1]));
  stats(frames.filter(f => f[1] === lastWave), `final wave (${lastWave})`);
  console.log(`outcome: mode=${st?.mode} score=${st?.score} time=${st?.time} wave=${st?.wave}`);
  if (errors.length) console.log('errors:', errors.slice(0, 5));
} finally {
  await browser.close();
}
