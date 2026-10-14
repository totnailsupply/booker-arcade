#!/usr/bin/env node
// Runs the game with ?autoplay=1 (plus optional extra query) and waits until
// render_game_to_text() reports mode "complete" (Soba landed on the roof and
// rang the bell). Proves Level 1 is climbable. Runs in real time (the bot
// steers; no advanceTime calls, so the normal game loop is used).
//
// Usage:
//   node scripts/autoplay-check.mjs [--url http://localhost:3001] [--query zone=2]
//                                   [--no-manifest] [--timeout 120000] [--out output/autoplay]
//                                   [--allow-falls]
//   --query        extra URL flags, e.g. "zone=2", "y=800", "lives=99", "debug=1"
//   --no-manifest  answers assets/manifest.json with 404 to test the placeholder art path
//   --allow-falls  pass even if the bot lost lives on the way (default: any fall fails)
// Exit 0 when the level is complete with no errors (and no falls), 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const extra = opt('--query', '');
const timeoutMs = parseInt(opt('--timeout', '120000'), 10);
const outDir = opt('--out', 'output/autoplay');
const noManifest = args.includes('--no-manifest');
const allowFalls = args.includes('--allow-falls');

fs.mkdirSync(outDir, { recursive: true });
const MAX_RESUMES = 4;

const errors = [];
const falls = [];
let last = null;
let resumes = 0;
let resumeY = null;
let assets = null;
let maxHeightM = 0;
const start = Date.now();

// If the browser is closed underneath us (another process killing headless
// Chromium), relaunch and resume from the last checkpoint height via ?y=.
while (Date.now() - start < timeoutMs) {
  const q = [extra, resumeY !== null ? `y=${resumeY}` : ''].filter(Boolean).join('&');
  const url = `${base}/?autoplay=1${q ? `&${q}` : ''}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // --no-manifest blocks the manifest on purpose; the browser logs that 404
      if (noManifest && (m.location()?.url || '').includes('manifest.json')) return;
      errors.push(m.text());
    });
    if (noManifest) {
      await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
    }
    console.log(`autoplay-check: ${url}${noManifest ? ' (no manifest)' : ''}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    let lastLogAt = 0;
    let prevLives = null;
    while (Date.now() - start < timeoutMs) {
      await page.waitForTimeout(200);
      const raw = await page.evaluate(() => (window.render_game_to_text ? window.render_game_to_text() : null));
      if (!raw) continue;
      last = JSON.parse(raw);
      maxHeightM = Math.max(maxHeightM, last.maxHeightM || 0);
      if (last.mode === 'playing' && last.soba) resumeY = Math.max(0, Math.round(last.maxHeightM * last.pxPerM) - 40);
      if (prevLives !== null && last.lives < prevLives) {
        falls.push({ heightM: last.maxHeightM, zone: last.zone, lives: last.lives });
        console.log(`  life lost (fall or hit): lives ${prevLives} -> ${last.lives} (max ${last.maxHeightM} m, zone ${last.zone})`);
        await page.screenshot({ path: path.join(outDir, `fall-${falls.length}.png`) });
      }
      prevLives = last.lives;
      if (Date.now() - lastLogAt > 3000) {
        lastLogAt = Date.now();
        console.log(`  t=${((Date.now() - start) / 1000).toFixed(1)}s mode=${last.mode} height=${last.heightM}m max=${last.maxHeightM}m zone=${last.zone} lives=${last.lives} score=${last.score}`);
      }
      if (last.mode === 'game_over') {
        await page.screenshot({ path: path.join(outDir, 'game-over.png') });
        break;
      }
      if (last.mode === 'complete' && last.scenes?.includes('ResultsScene')) {
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(outDir, 'complete.png') });
        break;
      }
    }
    assets = await page.evaluate(() => window.__ASSET_SOURCES__ || null);
    await browser.close();
    break;
  } catch (err) {
    await browser.close().catch(() => {});
    if (!/closed/i.test(String(err)) || resumes >= MAX_RESUMES) throw err;
    resumes += 1;
    console.log(`  browser closed externally; resuming from y=${resumeY} (resume ${resumes})`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`  assets: ${JSON.stringify(assets)}`);
console.log(`  final: mode=${last?.mode} maxHeight=${maxHeightM}m lives=${last?.lives} falls=${falls.length} resumes=${resumes} score=${last?.score} elapsed=${elapsed}s`);
if (last?.result) console.log(`  result: ${JSON.stringify(last.result)}`);
if (errors.length) console.log(`  errors: ${JSON.stringify(errors.slice(0, 10))}`);
const ok = last?.mode === 'complete' && errors.length === 0 && (allowFalls || falls.length === 0);
console.log(ok ? 'autoplay-check: RANG THE BELL' : 'autoplay-check: FAILED');
process.exit(ok ? 0 : 1);
