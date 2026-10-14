#!/usr/bin/env node
// Restart hygiene after the Step 4 effects: finish the level (bot from just
// below the roof), let the finale run (zoom + slow motion + fireworks), reach
// Results, retry, and check the new ClimbScene starts clean: camera zoom 1 and
// origin 0.5, tween / clock time scales 1, no stale EventBus listeners, and the
// same again after a hit-stop (forced hit) + game over + retry.
// Deterministic test clock (window.advanceTime). Exit 0 when clean.
//
// Usage: node scripts/restart-check.mjs [--url http://localhost:3001]

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const step = n => page.evaluate(f => window.advanceTime(f * 1000 / 60), n);
const state = () => page.evaluate(() => {
  const g = window.__GAME__;
  const s = g.scene.getScene('ClimbScene');
  const cam = s?.cameras?.main;
  return {
    mode: window.__GAME_STATE__.mode,
    scenes: g.scene.getScenes(true).map(x => x.scene.key),
    zoom: cam?.zoom, originX: cam?.originX, originY: cam?.originY,
    tweensScale: s?.tweens?.timeScale, timeScale: s?.time?.timeScale,
    listeners: window.__EVENT_BUS__.counts(),
  };
});
const waitFor = async (pred, maxFrames, label) => {
  for (let f = 0; f < maxFrames; f += 10) {
    const st = await state();
    if (pred(st)) return st;
    await step(10);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const problems = [];
const checkClean = (st, label) => {
  if (st.zoom !== 1) problems.push(`${label}: zoom ${st.zoom}`);
  if (st.originX !== 0.5 || st.originY !== 0.5) problems.push(`${label}: origin ${st.originX},${st.originY}`);
  if (st.tweensScale !== 1 || st.timeScale !== 1) problems.push(`${label}: time scales ${st.tweensScale}/${st.timeScale}`);
  const dup = Object.entries(st.listeners).filter(([, n]) => n > 4);
  if (dup.length) problems.push(`${label}: listener build-up ${JSON.stringify(dup)}`);
  console.log(`${label}: zoom ${st.zoom} origin ${st.originX},${st.originY} tweens ${st.tweensScale} clock ${st.timeScale} listeners ${Object.keys(st.listeners).length}`);
};

await page.goto(`${base}/?y=6150&autoplay=1&lives=2`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.getScenes(true).some(s => s.scene.key === 'ClimbScene'), null, { timeout: 15000 });
let st = await waitFor(s => s.mode === 'complete', 1200, 'the bell');
await step(20);
st = await state();
console.log(`finale: zoom ${st.zoom?.toFixed(2)} tweens ${st.tweensScale?.toFixed(2)}`);
const listeners0 = st.listeners;
await waitFor(s => s.scenes.includes('ResultsScene'), 400, 'Results');
await step(30);
await page.keyboard.press('ArrowRight');
st = await waitFor(s => s.scenes.includes('ClimbScene') && s.mode === 'playing', 120, 'retry');
await step(5);
checkClean(await state(), 'after finale + retry');

// Forced hit (hit-stop + tumble) -> then a second one -> game over -> retry
await page.evaluate(() => window.__GAME__.scene.getScene('ClimbScene').sim.lives.loseLife('hit', { type: 'debug' }));
await step(2);
const frozen = await page.evaluate(() => window.__GAME__.scene.getScene('ClimbScene').effects.freezeMs);
console.log(`hit-stop active right after a hit: ${frozen > 0}`);
if (!(frozen > 0)) problems.push('no hit-stop after a hit');
await waitFor(s => s.mode === 'playing', 200, 'respawn');
await step(80);
await page.evaluate(() => window.__GAME__.scene.getScene('ClimbScene').sim.lives.loseLife('hit', { type: 'debug' }));
await waitFor(s => s.scenes.includes('ResultsScene'), 300, 'game over Results');
await step(30);
await page.keyboard.press('ArrowRight');
await waitFor(s => s.scenes.includes('ClimbScene') && s.mode === 'playing', 120, 'second retry');
await step(5);
st = await state();
checkClean(st, 'after hit + game over + retry');
for (const [k, n] of Object.entries(st.listeners)) {
  if ((listeners0[k] || 0) !== n) problems.push(`listener count for ${k}: ${listeners0[k] || 0} during the first run, ${n} now`);
}

await browser.close();
if (errors.length) problems.push(...errors.map(e => `console: ${e}`));
if (problems.length) {
  console.log(`restart-check: FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('restart-check: clean');
