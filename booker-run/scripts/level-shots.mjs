#!/usr/bin/env node
// Screenshots of a level while the bot plays it (deterministic mode), plus a
// contact sheet. Good for checking art, hitboxes (--debug) and layout.
//
// Usage:
//   node scripts/level-shots.mjs --level 3 [--every 2500] [--count N] [--debug]
//        [--query "abilities=none"] [--out output/shots] [--url http://localhost:3000] [--no-manifest]
// Writes <out>/level<N>/shot-<ms>.png and contact.png (every shot, 4 per row).
// Each run first deletes the folder's old shots, so the sheet never mixes runs.
// --count defaults to enough shots to reach the finish (par time + 10 s); the
// run stops at the finish either way. --debug draws Arcade bodies (?debug=1).
// --no-manifest shows the generated placeholder art instead of the real files.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { openDetPage, readState, stepGame } from './lib/det.mjs';
import { getLevel } from '../src/levels/index.js';

/** Par time of a level (s): its parSeconds, else each section's length / speed. */
function parSeconds(lv) {
  if (Number.isFinite(lv.parSeconds)) return lv.parSeconds;
  const s = lv.sections || [];
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    const from = Math.max(s[i].startX, lv.startX);
    const to = i + 1 < s.length ? s[i + 1].startX : lv.finishX;
    t += Math.max(0, to - from) / s[i].speed;
  }
  return t;
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const level = opt('--level', '1');
const every = parseInt(opt('--every', '2500'), 10);
const entry = getLevel(/^\d+$/.test(level) ? Number(level) : level);
const fullRun = entry && entry.number ? Math.ceil(((parSeconds(entry.data) + 10) * 1000) / every) : 12;
const count = parseInt(opt('--count', String(fullRun)), 10);
const extra = opt('--query', '');
const debug = args.includes('--debug');
const noManifest = args.includes('--no-manifest');
const outDir = path.join(opt('--out', 'output/shots'), `level${level}${debug ? '-debug' : ''}`);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if (/^shot-\d+\.png$/.test(f) || f === 'contact.png') fs.rmSync(path.join(outDir, f));
}

const q = [`level=${level}`, 'autoplay=1', 'det=1', debug ? 'debug=1' : '', extra].filter(Boolean).join('&');
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
await openDetPage(page, `${base}/?${q}`);
const files = [];
for (let i = 1; i <= count; i++) {
  await stepGame(page, every);
  const s = await readState(page);
  const file = path.join(outDir, `shot-${String(i * every).padStart(6, '0')}.png`);
  await page.screenshot({ path: file });
  files.push(file);
  console.log(`${file}  mode=${s?.mode} x=${s?.player?.x} deaths=${s?.deathLog?.length}`);
  if (s?.mode === 'complete') break;
}
// Contact sheet: every shot at half size, 4 per row, labelled with its game time
const cells = files.map(f => {
  const ms = parseInt(path.basename(f).match(/\d+/)[0], 10);
  const src = `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  return `<figure><img src="${src}"><figcaption>${(ms / 1000).toFixed(1)} s</figcaption></figure>`;
}).join('');
const cols = 4;
const W = 480;
const H = 270 + 18;
await page.setViewportSize({ width: cols * (W + 4), height: Math.max(1, Math.ceil(files.length / cols)) * (H + 4) });
await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${W}px);gap:4px}
  figure{margin:0}img{width:${W}px;height:270px;image-rendering:pixelated;display:block}
  figcaption{font:12px monospace;color:#ddd;height:18px;line-height:18px;padding-left:4px}</style>${cells}`);
await page.screenshot({ path: path.join(outDir, 'contact.png'), fullPage: true });
console.log(`${path.join(outDir, 'contact.png')}  (${files.length} shots)`);
await browser.close();
if (errors.length) console.log('errors:', errors);
