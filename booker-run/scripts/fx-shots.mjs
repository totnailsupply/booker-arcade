#!/usr/bin/env node
// Timed screenshots of one moment, for checking visual effects.
//
// Usage:
//   node scripts/fx-shots.mjs --query "x=480" --shots 300,500,700 --out output/fx/death
//        [--keys "200:400"]   press Space at 200 ms and hold it 400 ms (comma list)
//        [--title]            load without query and press Space on the title
// Times are ms of real time after RunScene (or TitleScene with --title) is active.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const query = opt('--query', '');
const shots = opt('--shots', '500').split(',').map(Number).sort((a, b) => a - b);
const outDir = opt('--out', 'output/fx');
const keys = opt('--keys', '').split(',').filter(Boolean).map(s => s.split(':').map(Number));
const title = args.includes('--title');

fs.mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/${query ? `?${query}` : ''}`, { waitUntil: 'domcontentloaded' });

const want = title ? 'TitleScene' : 'RunScene';
await page.waitForFunction((k) => {
  const g = window.__GAME__;
  return g && g.scene.getScenes(true).some(s => s.scene.key === k);
}, want, { timeout: 15000 });

const t0 = Date.now();
const events = [
  ...shots.map(t => ({ t, kind: 'shot' })),
  ...keys.flatMap(([at, hold]) => [{ t: at, kind: 'down' }, { t: at + (hold || 60), kind: 'up' }]),
].sort((a, b) => a.t - b.t);

let n = 0;
for (const ev of events) {
  const wait = ev.t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  if (ev.kind === 'down') await page.keyboard.down('Space');
  else if (ev.kind === 'up') await page.keyboard.up('Space');
  else {
    const file = path.join(outDir, `shot-${String(n++).padStart(2, '0')}-${ev.t}ms.png`);
    await page.locator('canvas').screenshot({ path: file });
    const state = await page.evaluate(() => window.render_game_to_text && window.render_game_to_text());
    console.log(file, state ? JSON.parse(state).mode : '');
  }
}
if (errors.length) console.log('ERRORS:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
