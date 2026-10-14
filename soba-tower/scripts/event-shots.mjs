#!/usr/bin/env node
// Deterministic screenshots of game events. Steps the game with the test
// clock (window.advanceTime, exactly 1/60 s per frame) and saves a canvas
// screenshot a few frames after each matching EventBus event — e.g. the
// moment a crumble cracks, a spring fires, a tile warning shows, a crow is
// stomped, Soba gets hit, "NEW BEST!" pops.
//
// Usage:
//   node scripts/event-shots.mjs --query "y=2340&autoplay=1&debug=1" \
//        --events "climb:crumble+2,climb:crumbleFall+6" --seconds 20 --out output/events/crumble
//        [--max 2]          shots per event name
//        [--best 30]        pretend the stored best height is 30 m (BestFlag / NEW BEST)
//        [--hit-at 3]       force a hazard hit after N seconds (tumble + flash check)
//        [--no-manifest]    placeholder art
// Event names are the values in src/core/EventBus.js (e.g. climb:spring, climb:stomp,
// climb:tileWarn, soba:fell, climb:newBest, climb:treat, level:complete).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const query = opt('--query', 'autoplay=1');
const seconds = Number(opt('--seconds', '20'));
const outDir = opt('--out', 'output/events');
const maxPer = Number(opt('--max', '2'));
const best = opt('--best', null);
const hitAt = opt('--hit-at', null);
const noManifest = args.includes('--no-manifest');
const wants = opt('--events', 'climb:crumble+2').split(',').map((s) => {
  const [name, plus] = s.split('+');
  return { name, after: Number(plus || 0) };
});

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('crash', () => console.log('PAGE CRASHED (renderer process died)'));
browser.on('disconnected', () => console.log('BROWSER DISCONNECTED'));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (noManifest && (m.location()?.url || '').includes('manifest.json')) return;
  errors.push(m.text());
});
if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
if (best) {
  await page.addInitScript((h) => {
    try {
      localStorage.setItem('soba-tower:best:level1', JSON.stringify({ height: h, score: h * 10, time: null, stars: 0 }));
    } catch { /* ignore */ }
  }, Number(best));
}
await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.getScenes(true).some(s => s.scene.key === 'ClimbScene'), null, { timeout: 15000 });
await page.evaluate((names) => {
  window.__evq = [];
  for (const n of names) window.__EVENT_BUS__.on(n, (e) => window.__evq.push({ n, e }));
}, [...new Set(wants.map(w => w.name))]);

const counts = {};
const pending = [];
let shot = 0;
const frames = Math.round(seconds * 60);
for (let f = 0; f < frames; f++) {
  await page.evaluate(() => window.advanceTime(1000 / 60));
  if (hitAt && f === Math.round(Number(hitAt) * 60)) {
    await page.evaluate(() => window.__GAME__.scene.getScene('ClimbScene').sim.lives.loseLife('hit', { type: 'debug' }));
  }
  const evs = await page.evaluate(() => window.__evq.splice(0));
  for (const { n, e } of evs) {
    counts[n] = (counts[n] || 0) + 1;
    // several offsets per event allowed: "climb:spring+2,climb:spring+12"
    if (counts[n] <= maxPer) for (const w of wants.filter(x => x.name === n)) pending.push({ at: f + w.after, n, e });
  }
  for (const p of pending.filter(q => q.at === f)) {
    const file = path.join(outDir, `${String(shot++).padStart(2, '0')}-${p.n.replace(':', '-')}-f${f}.png`);
    pending.splice(pending.indexOf(p), 1);
    await page.locator('canvas').screenshot({ path: file });
    const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    console.log(`${file}  ${JSON.stringify(p.e)}  mode=${s.mode} h=${s.heightM}m lives=${s.lives}`);
  }
  const mode = await page.evaluate(() => window.__GAME_STATE__.mode);
  if ((mode === 'complete' || mode === 'game_over') && !pending.some(p => p.at > f)) break;
}
console.log(`events seen: ${JSON.stringify(counts)}`);
if (errors.length) console.log('ERRORS:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
