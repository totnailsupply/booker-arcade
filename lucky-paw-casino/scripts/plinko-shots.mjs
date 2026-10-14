#!/usr/bin/env node
// Plinko screenshots -> output/plinko/*.png (1280x720 + one 844x390 phone shot).
//
//   node scripts/plinko-shots.mjs [--url http://localhost:3004]
//
// Runs on the fixed-step test clock (advanceTime) with ?seed=7&debug=1 so the
// shots are repeatable; the big-win shot uses __CASINO__.force.plinko.
// Launches Chromium ONLY through scripts/lib/browser.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--url', `http://localhost:${process.env.PORT || 3004}`);
const OUT = path.resolve('output/plinko');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await launchBrowser();
const step = (page, ms) => page.evaluate((t) => window.advanceTime(t), ms);
const scene = (page, fn, a) => page.evaluate(([src, x]) => {
  const s = window.__GAME__.scene.getScene('Plinko');
  return new Function('s', 'x', src)(s, x);
}, [fn, a]);

// Other agents edit files in parallel; Vite's HMR socket would reload the page
// mid-run. Give the HMR client a socket that never connects (no reload, no error).
const NO_HMR = () => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, proto) {
    if (String(proto).includes('vite')) {
      return { readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} };
    }
    return new Real(url, proto);
  };
  Object.assign(window.WebSocket, Real);
};

async function open(page) {
  await page.addInitScript(NO_HMR);
  page.on('pageerror', (e) => errors.push(`PAGE ERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?fresh=1&seed=7&debug=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'lobby', null, { timeout: 20000 });
  await step(page, 500);
  await page.evaluate(() => window.__CASINO__.goto('Plinko'));
  await step(page, 1200);
}

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(process.cwd(), file)}`);
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await open(page);
  await step(page, 2000);
  await shot(page, 'idle');

  // several balls in flight
  await scene(page, 's.changeBet(1); s.changeBet(1);');
  for (let i = 0; i < 7; i++) {
    await scene(page, 's.drop();');
    await step(page, 230);
  }
  await step(page, 300);
  await shot(page, 'mid-drop');
  await step(page, 3500);
  await shot(page, 'after-drops');

  // big win: High risk, forced into the corner
  await scene(page, "s.setRisk('high');");
  await step(page, 400);
  await page.evaluate(() => window.__CASINO__.force.plinko([0, 6, 7]));
  await scene(page, 's.drop();');
  await step(page, 200);
  await scene(page, 's.drop();');
  await step(page, 200);
  await scene(page, 's.drop();');
  await step(page, 1700);
  await shot(page, 'high-risk-flight');
  await step(page, 650);
  await shot(page, 'big-win');
  await step(page, 4000);
  await shot(page, 'after-big-win');

  // rules panel
  await page.keyboard.press('Escape'); // nothing in flight: would leave -> use the ? button instead
  await step(page, 400);
  await page.evaluate(() => window.__CASINO__.goto('Plinko'));
  await step(page, 1200);
  await scene(page, 's.topBar.rules.open();');
  await step(page, 400);
  await shot(page, 'rules');

  // phone landscape
  const phone = await browser.newPage();
  await phone.setViewportSize({ width: 844, height: 390 });
  await open(phone);
  for (let i = 0; i < 5; i++) {
    await scene(phone, 's.drop();');
    await step(phone, 250);
  }
  await shot(phone, 'phone-mid-drop');
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(`\n${errors.length} console error(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('plinko shots done');
