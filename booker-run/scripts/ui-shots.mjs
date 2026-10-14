#!/usr/bin/env node
// Screenshots of every UI screen at 1x (480x270 viewport, raw pixels) and 2x
// (960x540, what a player sees scaled). Saves seed localStorage first.
//   node scripts/ui-shots.mjs [--url http://localhost:3000] [--out output/ui] [--only name,name]
// Screens: title-fresh, title-progress, select-fresh, select-mid, select-all,
// select-reveal, select-locked, intro, tip, hud, gameover, gameover-close,
// complete-unlock, complete-replay, ending, pause.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { readState } from './lib/det.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const outDir = opt('--out', 'output/ui');
const only = (opt('--only', '') || '').split(',').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

const lv = (o = {}) => ({
  completed: false, bestScore: 0, bestStars: 0, bestTimeS: null, bestProgress: 0, bestBones: 0, attempts: 0, clears: 0, ...o,
});
const SAVES = {
  fresh: null,
  mid: {
    level1: lv({ completed: true, bestScore: 2945, bestStars: 3, bestTimeS: 81.2, bestProgress: 1, bestBones: 62, attempts: 4, clears: 2 }),
    level2: lv({ completed: true, bestScore: 3180, bestStars: 2, bestTimeS: 92.4, bestProgress: 1, bestBones: 31, attempts: 9, clears: 1 }),
    level3: lv({ bestProgress: 0.62, attempts: 7 }),
  },
  l1only: {
    level1: lv({ completed: true, bestScore: 2945, bestStars: 3, bestTimeS: 81.2, bestProgress: 1, bestBones: 62, attempts: 4, clears: 2 }),
  },
  all: Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`level${n}`, lv({
    completed: true, bestScore: 2900 + n * 211, bestStars: n === 4 ? 2 : 3, bestTimeS: 80 + n * 3, bestProgress: 1,
    bestBones: 40, attempts: 3 + n * 2, clears: 2,
  })])),
  before6: Object.fromEntries([1, 2, 3, 4, 5].map(n => [`level${n}`, lv({
    completed: true, bestScore: 2900 + n * 211, bestStars: 3, bestTimeS: 80 + n * 3, bestProgress: 1, bestBones: 40, attempts: 5, clears: 1,
  })])),
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const state = async () => {
  for (let i = 0; i < 40; i++) {
    const s = await readState(page).catch(() => null);
    if (s) return s;
    await page.waitForTimeout(100);
  }
  return {};
};
const until = async (pred, maxMs = 8000, step = 50) => {
  const t0 = Date.now();
  let s = await state();
  while (!pred(s) && Date.now() - t0 < maxMs) {
    await page.waitForTimeout(step);
    s = await state();
  }
  return s;
};
const seed = async (save, extra = {}) => {
  await page.goto(`${base}/?menus=1&autoplay=0`);
  await page.evaluate(({ save, extra }) => {
    Object.keys(localStorage).filter(k => k.startsWith('booker-run:')).forEach(k => localStorage.removeItem(k));
    if (save) localStorage.setItem('booker-run:save:v1', JSON.stringify({ version: 1, levels: save, updatedAt: 1 }));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, { save, extra });
};
const shot = async (name) => {
  await page.setViewportSize({ width: 480, height: 270 });
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(outDir, `${name}-1x.png`) });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(outDir, `${name}-2x.png`) });
  await page.setViewportSize({ width: 480, height: 270 });
  console.log(`shot ${name}`);
};
const toSelect = async () => {
  await until(s => s.mode === 'title' && (s.scenes || []).includes('TitleScene'));
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await until(s => s.mode === 'levelselect');
  await page.waitForTimeout(500);
};

const scenarios = {
  'title-fresh': async () => {
    await seed(SAVES.fresh);
    await page.goto(`${base}/`);
    await until(s => s.mode === 'title' && (s.scenes || []).includes('TitleScene'));
    await page.waitForTimeout(700);
    await shot('title-fresh');
  },
  'title-progress': async () => {
    await seed(SAVES.mid);
    await page.goto(`${base}/`);
    await until(s => s.mode === 'title' && (s.scenes || []).includes('TitleScene'));
    await page.waitForTimeout(700);
    await shot('title-progress');
  },
  'select-fresh': async () => {
    await seed(SAVES.fresh);
    await page.goto(`${base}/`);
    await toSelect();
    await shot('select-fresh');
  },
  'select-mid': async () => {
    await seed(SAVES.mid, { 'booker-run:ui:lastLevel': 'level3' });
    await page.goto(`${base}/`);
    await toSelect();
    await shot('select-mid');
  },
  'select-locked': async () => {
    await seed(SAVES.mid, { 'booker-run:ui:lastLevel': 'level3' });
    await page.goto(`${base}/`);
    await toSelect();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await page.waitForTimeout(90);
    await shot('select-locked');
  },
  'select-all': async () => {
    await seed(SAVES.all, { 'booker-run:ui:lastLevel': 'level6' });
    await page.goto(`${base}/`);
    await toSelect();
    await shot('select-all');
  },
  'select-reveal': async () => {
    // Clear Level 1 for the first time, then press Levels on the results
    await seed(SAVES.fresh);
    await page.goto(`${base}/?level=1&x=15400&autoplay=1`);
    await until(s => s.mode === 'complete' && (s.scenes || []).includes('LevelCompleteScene'), 20000);
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await until(s => s.mode === 'levelselect');
    await page.waitForTimeout(520);
    await shot('select-reveal-mid');
    await page.waitForTimeout(900);
    await shot('select-reveal');
  },
  intro: async () => {
    await seed(SAVES.l1only);
    await page.goto(`${base}/?level=2&intro=1`);
    await until(s => s.mode === 'intro', 8000);
    await page.waitForTimeout(450);
    await shot('intro');
  },
  tip: async () => {
    await seed(SAVES.l1only);
    await page.goto(`${base}/?level=2&x=1180&intro=0&autoplay=1`);
    await until(s => s.ui?.tip, 8000, 30);
    await page.waitForTimeout(250);
    await shot('tip');
  },
  hud: async () => {
    await seed(SAVES.mid);
    await page.goto(`${base}/?level=3&autoplay=1&intro=0`);
    await until(s => s.mode === 'playing', 8000);
    await page.waitForTimeout(5200);
    await shot('hud');
  },
  gameover: async () => {
    await seed(SAVES.mid);
    await page.goto(`${base}/?level=2&intro=0`);
    await until(s => s.mode === 'gameover', 20000, 30);
    await page.waitForTimeout(260);
    await shot('gameover');
  },
  'gameover-close': async () => {
    await seed(SAVES.mid);
    await page.goto(`${base}/?level=1&x=14700&intro=0`);
    await until(s => s.mode === 'gameover', 20000, 30);
    await page.waitForTimeout(260);
    await shot('gameover-close');
  },
  'complete-unlock': async () => {
    await seed(SAVES.fresh);
    await page.goto(`${base}/?level=1&x=13600&autoplay=1`);
    await until(s => s.mode === 'complete' && (s.scenes || []).includes('LevelCompleteScene'), 30000);
    await page.waitForTimeout(1300);
    await shot('complete-tally');
    await page.waitForTimeout(2600);
    await shot('complete-unlock');
  },
  'complete-replay': async () => {
    await seed(SAVES.all);
    await page.goto(`${base}/?level=2&x=99999&autoplay=1`);
    await until(s => s.mode === 'complete' && (s.scenes || []).includes('LevelCompleteScene'), 30000);
    await page.waitForTimeout(3600);
    await shot('complete-replay');
  },
  ending: async () => {
    await seed(SAVES.before6);
    await page.goto(`${base}/?level=6&x=99999&autoplay=1`);
    await until(s => s.mode === 'complete' && (s.scenes || []).includes('LevelCompleteScene'), 30000);
    await page.waitForTimeout(1500);
    await shot('ending-flourish');
    await page.keyboard.press('Space');
    await page.waitForTimeout(3600);
    await shot('ending-results');
  },
  pause: async () => {
    await seed(SAVES.mid);
    await page.goto(`${base}/?level=4&intro=0&autoplay=1`);
    await until(s => s.mode === 'playing', 8000);
    await page.waitForTimeout(1500);
    await page.keyboard.press('p');
    await until(s => s.mode === 'paused', 3000);
    await page.waitForTimeout(300);
    await shot('pause');
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await fn();
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    errors.push(`${name}: ${e.message}`);
  }
}
await browser.close();
if (errors.length) console.log('errors:', errors.slice(0, 10));
console.log(`ui-shots: ${errors.length ? 'DONE WITH ERRORS' : 'DONE'} -> ${outDir}`);
process.exit(errors.length ? 1 : 0);
