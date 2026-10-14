#!/usr/bin/env node
// Timed screenshots of one moment, for checking visuals and hitboxes.
//
// Usage:
//   node scripts/fx-shots.mjs --query "zone=3&lives=99&debug=1" --shots 500,1500,3000 --out output/fx/z3
//        [--keys "left:200:400,right:900:120"]   press a key at ms and hold it (comma list;
//                                                 key = left | right | a | d | space | esc)
//        [--title]          wait for the Title scene instead of the climb
//        [--no-manifest]    answer assets/manifest.json with 404 (placeholder art)
//        [--scale 2]        viewport = 270x480 * scale
// Times are ms of real time after the scene is active. Each shot also prints a
// short state line from render_game_to_text().

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const query = opt('--query', '');
const shots = opt('--shots', '500').split(',').map(Number).sort((a, b) => a - b);
const outDir = opt('--out', 'output/fx');
const scale = Number(opt('--scale', '2'));
const KEY_NAMES = { left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyA', d: 'KeyD', space: 'Space', esc: 'Escape' };
const keys = opt('--keys', '').split(',').filter(Boolean).map((s) => {
  const [name, at, hold] = s.split(':');
  return { key: KEY_NAMES[name] || name, at: Number(at), hold: Number(hold || 80) };
});
const title = args.includes('--title');
const noManifest = args.includes('--no-manifest');

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 270 * scale, height: 480 * scale } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (noManifest && (m.location()?.url || '').includes('manifest.json')) return;
  errors.push(m.text());
});
if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
await page.goto(`${base}/${query ? `?${query}` : ''}`, { waitUntil: 'domcontentloaded' });

const want = title ? 'TitleScene' : 'ClimbScene';
await page.waitForFunction((k) => {
  const g = window.__GAME__;
  return g && g.scene.getScenes(true).some(s => s.scene.key === k);
}, want, { timeout: 15000 });

const t0 = Date.now();
const events = [
  ...shots.map(t => ({ t, kind: 'shot' })),
  ...keys.flatMap(k => [{ t: k.at, kind: 'down', key: k.key }, { t: k.at + k.hold, kind: 'up', key: k.key }]),
].sort((a, b) => a.t - b.t);

let n = 0;
for (const ev of events) {
  const wait = ev.t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  if (ev.kind === 'down') await page.keyboard.down(ev.key);
  else if (ev.kind === 'up') await page.keyboard.up(ev.key);
  else {
    const file = path.join(outDir, `shot-${String(n++).padStart(2, '0')}-${ev.t}ms.png`);
    await page.locator('canvas').screenshot({ path: file });
    const raw = await page.evaluate(() => window.render_game_to_text && window.render_game_to_text());
    const s = raw ? JSON.parse(raw) : {};
    const hz = (s.hazards || []).map(h => `${h.type}:${h.state}@${h.x},${h.y}`).join(' ');
    console.log(`${file} mode=${s.mode} zone=${s.zone} h=${s.heightM}m lives=${s.lives} treats=${s.treats}/${s.treatsTotal} ${hz}`);
  }
}
if (errors.length) console.log('ERRORS:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
