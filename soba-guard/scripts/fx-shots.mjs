#!/usr/bin/env node
// =============================================================================
// fx-shots.mjs — screenshots of the key visual moments, on the deterministic
// test clock (window.advanceTime), for before/after reviews of the polish pass.
//
//   title        Title screen after 1.2 s
//   midwave      ?autoplay=1 (smart bot) at 100 s
//   bark         a few frames after the smart bot's first bark
//   zoomies      mid-dash of the smart bot's first zoomies
//   scooter      0.25 s after the first scooter launch (?wave=10, unguarded)
//   hugewave     0.5 s after the "big wave" warning (?wave=5)
//   win          0.6 s after a win (?autoplay=1&wave=10&coins=3000)
//   results-win  Results 2.6 s later
//   loss         0.4 s after a loss
//   cards        card bar + ghost preview (steamer selected over a free tile)
//
// Usage: node scripts/fx-shots.mjs [--prefix after] [--out output/step3] [--only bark,win]
// =============================================================================

import fs from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argVal('--url', `http://localhost:${process.env.PORT || 3003}`);
const PREFIX = argVal('--prefix', 'after');
const OUT = argVal('--out', 'output/step3');
const ONLY = argVal('--only', '') ? argVal('--only', '').split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const want = (name) => !ONLY || ONLY.includes(name);
const adv = (page, ms) => page.evaluate(t => window.advanceTime(t), ms);
const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

async function open(browser, query, sceneKey) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(k => window.__GAME__ && window.__GAME__.scene.isActive(k), sceneKey, { timeout: 30000 });
  await page.evaluate(() => {
    window.__SEEN__ = {};
    const bus = window.__EVENT_BUS__;
    for (const ev of ['sim:bark', 'sim:zoomies', 'sim:scooter', 'sim:huge_wave', 'sim:win', 'sim:lose']) {
      bus.on(ev, () => { window.__SEEN__[ev] = (window.__SEEN__[ev] || 0) + 1; });
    }
  });
  page.errors = errors;
  return page;
}

async function until(page, ev, maxMs, chunk = 100) {
  for (let t = 0; t < maxMs; t += chunk) {
    if (await page.evaluate(e => !!window.__SEEN__[e], ev)) return true;
    await adv(page, chunk);
  }
  return false;
}

async function shot(page, name) {
  const file = `${OUT}/${PREFIX}-${name}.png`;
  await page.locator('canvas').screenshot({ path: file });
  console.log(`shot ${file}`);
}

const browser = await launchBrowser({ headless: true });
try {
  if (want('title')) {
    const page = await open(browser, '', 'TitleScene');
    await adv(page, 1200);
    await shot(page, 'title');
    await page.close();
  }
  if (want('midwave') || want('bark') || want('zoomies')) {
    const page = await open(browser, '?autoplay=1', 'BattleScene');
    if (want('bark')) {
      if (await until(page, 'sim:bark', 200000, 50)) {
        await adv(page, 120);
        await shot(page, 'bark');
      } else console.log('no bark seen');
    }
    if (want('midwave')) {
      const t = (await state(page)).time || 0;
      if (t < 100) await adv(page, (100 - t) * 1000);
      await shot(page, 'midwave');
    }
    if (want('zoomies')) {
      if (await until(page, 'sim:zoomies', 200000, 50)) {
        await adv(page, 300);
        await shot(page, 'zoomies');
      } else console.log('no zoomies seen');
    }
    if (page.errors.length) console.log('errors:', page.errors);
    await page.close();
  }
  if (want('scooter') || want('loss')) {
    const page = await open(browser, '?skip=1&wave=10&coins=300', 'BattleScene');
    if (await until(page, 'sim:scooter', 120000, 50)) {
      await adv(page, 250);
      await shot(page, 'scooter');
    }
    if (want('loss') && await until(page, 'sim:lose', 120000, 100)) {
      await adv(page, 400);
      await shot(page, 'loss');
    }
    await page.close();
  }
  if (want('hugewave')) {
    const page = await open(browser, '?skip=1&wave=5', 'BattleScene');
    if (await until(page, 'sim:huge_wave', 60000, 50)) {
      await adv(page, 500);
      await shot(page, 'hugewave');
    }
    await page.close();
  }
  if (want('cards')) {
    const page = await open(browser, '?skip=1&coins=120', 'BattleScene');
    await adv(page, 300);
    await page.keyboard.press('2');
    await adv(page, 50);
    await page.mouse.move(2 * (112 + 40 * 3 + 20), 2 * (84 + 40 * 2 + 20));
    await adv(page, 200);
    await shot(page, 'cards');
    await page.mouse.move(2 * (112 + 40 * 3 + 20), 2 * (84 + 40 * 2 + 20));
    await page.keyboard.press('u');
    await adv(page, 200);
    await shot(page, 'tool');
    await page.close();
  }
  if (want('win') || want('results-win')) {
    const page = await open(browser, '?autoplay=1&wave=10&coins=3000', 'BattleScene');
    if (await until(page, 'sim:win', 400000, 200)) {
      await adv(page, 600);
      await shot(page, 'win');
      await adv(page, 3600);
      await shot(page, 'results-win');
    } else console.log('no win seen', (await state(page)).mode);
    await page.close();
  }
} finally {
  await browser.close();
}
