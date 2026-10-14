#!/usr/bin/env node
// =============================================================================
// verify-runtime.mjs — Headless runtime verification for browser games
//
// Launches headless Chromium, loads the game, checks for runtime errors
// (WebGL failures, uncaught exceptions, console errors), failed requests
// (HTTP >= 400 or network errors) and that every art key in the manifest
// loaded from a file (no code-drawn placeholder was needed). The game must
// reach the Title scene.
// Exit 0 = pass, Exit 1 = fail (prints errors to stderr).
//
// Usage:
//   node scripts/verify-runtime.mjs
//   PORT=3002 node scripts/verify-runtime.mjs
//   node scripts/verify-runtime.mjs --url http://localhost:3012/      (vite preview of dist/)
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const PORT = process.env.PORT || 3002;
const URL = urlIdx >= 0 ? args[urlIdx + 1] : `http://localhost:${PORT}`;
const WAIT_MS = 3000;

async function verify() {
  const errors = [];
  const requests = [];
  const browser = await launchBrowser({ headless: true });
  const page = await browser.newPage();

  page.on('pageerror', (err) => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });
  page.on('requestfailed', (req) => errors.push(`REQUEST FAILED: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    requests.push(res.url());
    if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });

  try {
    const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    if (!response || response.status() >= 400) {
      errors.push(`HTTP ${response?.status() || 'NO_RESPONSE'} loading ${URL}`);
    }
  } catch (e) {
    errors.push(`NAVIGATION ERROR: ${e.message}`);
  }

  // Wait for game to initialize and render
  await page.waitForTimeout(WAIT_MS);

  const info = await page.evaluate(() => ({
    title: !!(window.__GAME__ && window.__GAME__.scene.isActive('TitleScene')),
    sources: window.__ASSET_SOURCES__ || null,
  })).catch((e) => ({ error: e.message }));
  if (info.error) errors.push(`EVALUATE ERROR: ${info.error}`);
  else {
    if (!info.title) errors.push('Title scene not active after 3 s');
    const s = info.sources;
    if (!s) errors.push('window.__ASSET_SOURCES__ missing (Preload did not finish)');
    else {
      const art = s.placeholders.filter(k => !k.startsWith('gen-'));
      if (art.length) errors.push(`art keys fell back to placeholders: ${art.join(', ')}`);
      if (s.files.length < 10) errors.push(`only ${s.files.length} art files loaded`);
    }
  }
  const pngs = requests.filter(u => u.endsWith('.png')).length;

  await browser.close();

  if (errors.length > 0) {
    console.error(`Runtime verification FAILED with ${errors.length} error(s) at ${URL}:\n`);
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }

  console.log(`Runtime verification PASSED at ${URL}: no errors, ${info.sources.files.length} art files loaded (${pngs} PNG requests), no placeholders.`);
  process.exit(0);
}

verify();
