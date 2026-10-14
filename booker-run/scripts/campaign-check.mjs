#!/usr/bin/env node
// The whole campaign through the real UI, on a fresh save:
//   title -> level select -> Level 1 (the bot plays: ?menus=1&autoplay=1) ->
//   results -> NEXT LEVEL -> ... -> Level 6 -> Golden Steak ending -> results ->
//   LEVELS -> the level select shows 6/6 cleared, and every total matches the
//   per-level bests (and the scores this campaign earned).
// On every results screen (each is a reused scene): the tally starts fresh, the
// first press only skips it (no NEXT yet), and only real new bests are announced.
// Levels 2-6 open with their ability card, as for a player.
//
// Usage: node scripts/campaign-check.mjs [--url http://localhost:3000] [--out output/campaign]

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { readState, stepGame } from './lib/det.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const outDir = opt('--out', 'output/campaign');
fs.mkdirSync(outDir, { recursive: true });
const BASELINE = [2945, 3145, 3325, 2975, 3225, 3855];   // autoplay-check --level N (direct start)

const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};
const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const det = () => page.evaluate(() => !!(window.__DET__ && window.__DET__.enabled));
const wait = async (ms) => {
  if (await det()) await stepGame(page, ms);
  else await page.waitForTimeout(ms);
};
const state = async () => {
  for (let i = 0; i < 40; i++) {
    const s = await readState(page).catch(() => null);
    if (s) return s;
    await page.waitForTimeout(100);
  }
  throw new Error('render_game_to_text unavailable');
};
const until = async (pred, maxMs, stepMs = 250) => {
  let s = await state();
  for (let t = 0; t < maxMs && !pred(s); t += stepMs) {
    await wait(stepMs);
    s = await state();
  }
  return s;
};
const key = async (k, ms = 150) => {
  await page.keyboard.press(k);
  await wait(ms);
};
const record = async (name) => {
  await page.evaluate((name) => {
    window.__REC__ = window.__REC__ || {};
    window.__REC__[name] = [];
    window.__EVENT_BUS__.on(window.__EVENTS__[name], (d) => window.__REC__[name].push(d ?? {}));
  }, name);
  return {
    read: () => page.evaluate((name) => window.__REC__[name], name),
    clear: () => page.evaluate((name) => { window.__REC__[name].length = 0; }, name),
  };
};

const t0 = Date.now();
await page.goto(`${base}/?menus=1&autoplay=1&det=1`);
await page.evaluate(() => {
  Object.keys(localStorage).filter(k => k.startsWith('booker-run:')).forEach(k => localStorage.removeItem(k));
});
await page.reload();
let s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 6000, 100);
check(s.save?.levelsCleared === 0, `fresh save on the title (cleared ${s.save?.levelsCleared})`);
await key('Space', 700);
s = await until(x => x.mode === 'levelselect', 3000, 100);
check(s.menu?.selected === 'level1' && s.menu.cards.slice(1).every(c => c.locked), `level select: Level 1 selected, 2-6 locked (${s.menu?.selected})`);
await key('Space', 100);
s = await until(x => x.mode === 'playing' || x.mode === 'intro', 5000, 100);
check(s.levelId === 'level1', `Space plays Level 1 (${s.levelId})`);

const newBest = await record('UI_NEW_BEST');
const results = [];
for (let n = 1; n <= 6; n++) {
  const id = `level${n}`;
  if (n > 1) {
    check(s.levelId === id && s.mode === 'intro' && s.intro?.ability, `NEXT LEVEL starts Level ${n} with its ability card (${s.mode}, ${s.intro?.ability})`);
  }
  s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene') && x.result?.levelId === id, 300000, 1000);
  const r = s.result || {};
  results.push({ id, score: r.score, stars: r.stars, bones: r.bones, deaths: s.deathLog?.length ?? -1, attempts: r.attempts });
  check(s.mode === 'complete' && r.levelId === id && s.deathLog?.length === 0,
    `Level ${n} cleared: score ${r.score}, stars ${r.stars}, deaths ${s.deathLog?.length} (direct-start baseline ${BASELINE[n - 1]})`);
  await page.screenshot({ path: path.join(outDir, `results-l${n}.png`) });
  if (n === 6) {
    await wait(300);
    s = await state();
    check(s.menu?.ending && !s.menu.ending.done && !s.menu.tallyDone, 'Golden Steak ending plays first, tally waiting');
    await page.screenshot({ path: path.join(outDir, 'ending.png') });
    await wait(500);
    await key('Space', 400);
    s = await state();
    check(s.menu?.ending?.done && s.mode === 'complete', 'a press closes the ending');
  }
  s = await state();
  check(!s.menu?.tallyDone && s.menu?.starsShown === 0,
    `L${n} results start fresh: tally running, no stars yet (tallyDone ${s.menu?.tallyDone}, stars ${s.menu?.starsShown})`);
  const expectFocus = n < 6 ? 'next' : 'levels';
  check(s.menu?.focus === expectFocus, `L${n} results focus ${expectFocus} (${s.menu?.focus})`);
  await key('Space', 200);   // first press: skip the tally only
  s = await state();
  check(s.mode === 'complete' && s.menu?.tallyDone && s.menu.starsShown === 3,
    `L${n}: the first press skips the tally and stays on the results (${s.mode}, tallyDone ${s.menu?.tallyDone})`);
  const kinds = (await newBest.read()).map(e => e.kind);
  check(kinds.length === 1 && kinds[0] === 'firstClear', `L${n}: only FIRST CLEAR is announced (${kinds.join(',')})`);
  await newBest.clear();
  await key('Space', 100);   // second press: the focused button
  if (n < 6) {
    s = await until(x => x.levelId === `level${n + 1}` && (x.mode === 'intro' || x.mode === 'playing'), 3000, 50);
  } else {
    s = await until(x => x.mode === 'levelselect', 3000, 100);
  }
}

// Level select after the campaign
await wait(500);
s = await state();
const sum = s.save;
const per = sum.levels.map(l => l.bestScore);
const campaignTotal = results.reduce((a, r) => a + r.score, 0);
check(s.mode === 'levelselect' && sum.levelsCleared === 6 && sum.levels.every(l => l.completed),
  `level select after the ending: 6/6 cleared (${sum.levelsCleared})`);
check(JSON.stringify(per) === JSON.stringify(results.map(r => r.score)),
  `per-level bests = the campaign's scores (${per.join(', ')})`);
check(sum.totalScore === per.reduce((a, b) => a + b, 0) && sum.totalScore === campaignTotal,
  `total score = sum of bests = ${campaignTotal} (${sum.totalScore})`);
check(sum.totalStars === sum.levels.reduce((a, l) => a + l.bestStars, 0)
  && sum.totalStars === results.reduce((a, r) => a + r.stars, 0),
  `total stars = sum of best stars (${sum.totalStars}/${sum.maxStars})`);
const T = s.menu?.totals || {};
check(T.totalScore === sum.totalScore && T.stars === sum.totalStars && T.cleared === 6 && T.levels === 6,
  `level select header: total ${T.totalScore}, stars ${T.stars}/${T.maxStars}, cleared ${T.cleared}/${T.levels}`);
check(s.menu?.cards?.every(c => !c.locked && c.completed), 'every card open and cleared');
await page.screenshot({ path: path.join(outDir, 'level-select-6of6.png') });

console.log(`campaign: ${results.map(r => `${r.id} ${r.score}${r.score === BASELINE[Number(r.id.slice(5)) - 1] ? '' : ` (baseline ${BASELINE[Number(r.id.slice(5)) - 1]})`}`).join(', ')}; total ${campaignTotal}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  fails.push('page errors');
}
console.log(fails.length ? `campaign-check: FAILED (${fails.length})` : 'campaign-check: PASSED');
process.exit(fails.length ? 1 : 0);
