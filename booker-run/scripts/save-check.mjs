#!/usr/bin/env node
// Save robustness (src/core/SaveData.js):
//   1. Two tabs: tab B clears Level 3 while tab A is open. A sees it at once
//      (storage event), and A's own writes never drop it.
//   2. A stale tab: tab A's copy is older than storage (no storage event, e.g.
//      a write from another browser window that A missed). A starts a real run
//      (recordAttempt writes) and storage must keep the newer clear.
//   3. Versions: an older version is backed up (save:backup:v<n>) and still
//      read; a newer version is backed up and read; a missing version means the
//      current one (no backup); unreadable JSON is backed up as :corrupt.
//
// Usage: node scripts/save-check.mjs [--url http://localhost:3000]

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const KEY = 'booker-run:save:v1';
const BACKUP = 'booker-run:save:backup';

const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};
const errors = [];
const lv = (o = {}) => ({
  completed: false, bestScore: 0, bestStars: 0, bestTimeS: null, bestProgress: 0, bestBones: 0, attempts: 0, clears: 0, ...o,
});
const cleared = (score, o = {}) => lv({ completed: true, bestScore: score, bestStars: 2, bestTimeS: 90, bestProgress: 1, bestBones: 20, attempts: 3, clears: 1, ...o });

const browser = await launchBrowser();
const pageA = await browser.newPage({ viewport: { width: 960, height: 540 } });
const pageB = await browser.context.newPage();
for (const [name, p] of [['A', pageA], ['B', pageB]]) {
  p.on('pageerror', e => errors.push(`${name}: ${String(e)}`));
}
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const summary = (p) => p.evaluate(() => window.__SAVE__.summary());
const seed = (p, save) => p.evaluate(({ k, save }) => {
  Object.keys(localStorage).filter(x => x.startsWith('booker-run:')).forEach(x => localStorage.removeItem(x));
  if (save !== null) localStorage.setItem(k, typeof save === 'string' ? save : JSON.stringify(save));
}, { k: KEY, save });
const titleReady = (p) => p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).scenes.includes('TitleScene'), null, { timeout: 8000 });

// --- 1. Two tabs, storage event --------------------------------------------------
await pageA.goto(`${base}/`);
await seed(pageA, { version: 1, levels: { level1: cleared(2900), level2: cleared(3100) }, updatedAt: 1 });
await pageA.reload();
await titleReady(pageA);
let sa = await summary(pageA);
check(sa.levelsCleared === 2 && !sa.levels[3].unlocked, `tab A: 2 cleared, Level 4 locked (${sa.levelsCleared})`);

await pageB.goto(`${base}/`);
await titleReady(pageB);
await pageB.evaluate(() => window.__SAVE__.recordCompletion('level3', { score: 3300, stars: 3, bones: 40, totalSeconds: 95.5 }));
await pageA.waitForTimeout(200);   // the storage event is async
sa = await summary(pageA);
check(sa.levels[2].completed && sa.levels[2].bestScore === 3300 && sa.levels[3].unlocked,
  `tab A sees tab B's Level 3 clear at once (L3 ${sa.levels[2].bestScore}, L4 unlocked ${sa.levels[3].unlocked})`);
await pageA.evaluate(() => window.__SAVE__.recordAttempt('level1'));
let st = await stored(pageA);
check(st.levels.level3?.completed && st.levels.level3.bestScore === 3300, 'a write from tab A keeps the Level 3 clear');

// --- 2. Stale tab: a real run start in A must not overwrite newer progress -------
// Storage changes from the same page fire no storage event, so A's copy is stale.
await pageA.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k));
  s.levels.level4 = { completed: true, bestScore: 2950, bestStars: 1, bestTimeS: 99.9, bestProgress: 1, bestBones: 5, attempts: 6, clears: 1 };
  s.levels.level1.bestScore = 2999;
  s.levels.level1.bestTimeS = 70;
  localStorage.setItem(k, JSON.stringify(s));
}, KEY);
sa = await summary(pageA);
check(!sa.levels[3].completed, 'tab A copy is stale (Level 4 not cleared in memory)');
// Title -> level select -> play Level 1 (recordAttempt writes)
await pageA.keyboard.press('Space');
await pageA.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'levelselect', null, { timeout: 5000 });
await pageA.waitForTimeout(400);
await pageA.evaluate(() => {
  const sel = window.__GAME__.scene.getScene('LevelSelectScene');
  sel.select(0, false, true);
  sel.activate(0);
});
await pageA.waitForFunction(() => {
  const s = JSON.parse(window.render_game_to_text());
  return s.mode === 'playing' || s.mode === 'intro';
}, null, { timeout: 5000 });
st = await stored(pageA);
check(st.levels.level4?.completed && st.levels.level4.bestScore === 2950,
  `starting a run in the stale tab keeps Level 4's clear (${JSON.stringify(st.levels.level4)})`);
check(st.levels.level1.bestScore === 2999 && st.levels.level1.bestTimeS === 70 && st.levels.level1.attempts >= 4,
  `per-level merge: best score max, best time min, attempts counted (${JSON.stringify(st.levels.level1)})`);
sa = await summary(pageA);
check(sa.levels[3].completed && sa.levels[4].unlocked, 'tab A now has Level 4 cleared and Level 5 open');

// --- 3. Versions and backups -------------------------------------------------------
async function loadWith(save) {
  await seed(pageA, save);
  await pageA.goto(`${base}/`);
  await titleReady(pageA);
  return pageA.evaluate((b) => ({
    summary: window.__SAVE__.summary(),
    backups: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith(b)).map(k => [k, localStorage.getItem(k)])),
  }), BACKUP);
}
let r = await loadWith({ version: 0, levels: { level1: cleared(1500) }, updatedAt: 1 });
check(r.summary.levels[0].bestScore === 1500 && r.backups[`${BACKUP}:v0`]?.includes('1500'),
  `older version: read, raw copy kept in ${BACKUP}:v0`);
r = await loadWith({ version: 7, levels: { level1: cleared(1700) }, futureField: true, updatedAt: 1 });
check(r.summary.levels[0].bestScore === 1700 && r.backups[`${BACKUP}:v7`]?.includes('futureField'),
  `newer version: read, raw copy kept in ${BACKUP}:v7`);
r = await loadWith({ levels: { level1: cleared(1800) }, updatedAt: 1 });
check(r.summary.levels[0].bestScore === 1800 && Object.keys(r.backups).length === 0, 'missing version = current version, no backup');
r = await loadWith('{"version":1,"levels":{"level1":{"completed":tru');
check(r.summary.levelsCleared === 0 && r.backups[`${BACKUP}:corrupt`]?.startsWith('{"version":1'),
  'unreadable save: blank progress, raw text kept in :corrupt');

await browser.close();
if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  fails.push('page errors');
}
console.log(fails.length ? `save-check: FAILED (${fails.length})` : 'save-check: PASSED');
process.exit(fails.length ? 1 : 0);
