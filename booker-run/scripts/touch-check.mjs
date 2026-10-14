#!/usr/bin/env node
// Touch input on every screen, with real touch events: a Playwright context with
// hasTouch and page.touchscreen.tap() (touchstart + touchend, no mouse events).
//
//   A. Title tap -> level select. On a card, the first tap focuses and the second
//      plays. A tap dismisses the ability card (not a jump). A tap during play
//      jumps; tapping the HUD mute button mutes and doesn't jump; the HUD pause
//      button pauses (no jump). Pause menu by tap: RESTART, pause, RESTART, a tap
//      outside the panel resumes, SOUND toggles, LEVEL SELECT. Back on the level
//      select, one tap on the card just played only focuses it (no carried-over arm).
//   B. Game over: an early tap is ignored, a later tap retries; the LEVELS button goes to the level select.
//   C. Results: LEVELS by tap; the just-unlocked card plays with two taps while its
//      unlock reveal is still running; NEXT LEVEL by tap.
//   D. Level 6 ending: a tap on "PRESS TO CONTINUE" closes the ending and doesn't
//      press the REPLAY / LEVELS buttons under it; then LEVELS by tap.
//
// Usage: node scripts/touch-check.mjs [--url http://localhost:3000] [--out output/touch]

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
const outDir = opt('--out', 'output/touch');
fs.mkdirSync(outDir, { recursive: true });

const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};
const errors = [];
const browser = await launchBrowser({ contextOptions: { hasTouch: true } });
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
const until = async (pred, maxMs, stepMs = 100) => {
  let s = await state();
  for (let t = 0; t < maxMs && !pred(s); t += stepMs) {
    await wait(stepMs);
    s = await state();
  }
  return s;
};
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
/** Tap at game coordinates (480x270). */
const tap = async (x, y) => {
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 480;
  await page.touchscreen.tap(box.x + x * k, box.y + y * k);
};
/** Game-space centre of a PixelButton (works inside containers). */
const buttonAt = (sceneKey, id) => page.evaluate(({ sceneKey, id }) => {
  const sc = window.__GAME__.scene.getScene(sceneKey);
  const list = sc.buttons || [];
  const b = list.find(x => x.id === id) || (sc.levelsBtn?.id === id ? sc.levelsBtn : null);
  const m = b.container.getWorldTransformMatrix();
  return [m.tx, m.ty];
}, { sceneKey, id });
const tapButton = async (sceneKey, id) => tap(...(await buttonAt(sceneKey, id)));
const cardCenter = (i) => [10 + (i % 3) * 156 + 74, 38 + Math.floor(i / 3) * 106 + 50];
const record = async (name) => {
  await page.evaluate((name) => {
    window.__REC__ = window.__REC__ || {};
    window.__REC__[name] = [];
    window.__EVENT_BUS__.on(window.__EVENTS__[name], (d) => window.__REC__[name].push(d ?? {}));
  }, name);
  return () => page.evaluate((name) => window.__REC__[name], name);
};
const clearSave = () => page.evaluate(() => {
  Object.keys(localStorage).filter(k => k.startsWith('booker-run:')).forEach(k => localStorage.removeItem(k));
});
const PAUSE_BTN = [449, 11];
const MUTE_BTN = [467, 11];

// =============================================================================
// A. Title, level select, ability card, play, HUD, pause menu
// =============================================================================
await page.goto(`${base}/?unlock=all&det=1`);
await clearSave();
await page.reload();
let s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 6000);
const touchOk = await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0);
check(touchOk, 'touch context (ontouchstart, maxTouchPoints)');
await tap(240, 150);
const wasTouch = await page.evaluate(() => window.__GAME__.input.pointers.some(p => p.wasTouch));
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect' && wasTouch, `title: a tap opens the level select (${s.mode}; Phaser saw a touch pointer: ${wasTouch})`);
await page.waitForTimeout(400);
await tap(...cardCenter(2));
await page.waitForTimeout(300);
s = await state();
check(s.mode === 'levelselect' && s.menu?.selected === 'level3', `level select: the first tap focuses Level 3, doesn't play (${s.mode}, ${s.menu?.selected})`);
await tap(...cardCenter(2));
s = await until(x => x.mode === 'intro' || x.mode === 'playing', 4000);
check(s.mode === 'intro' && s.levelId === 'level3', `the second tap plays Level 3, ability card up (${s.mode}, ${s.levelId})`);
await shot('a1-intro');
await wait(500);
await tap(240, 135);
await wait(50);
s = await state();
check(s.mode === 'playing' && s.player?.onGround && s.player?.vy >= 0, `a tap dismisses the card, not a jump (${s.mode}, onGround ${s.player?.onGround})`);

await wait(300);
const yBefore = (await state()).player.y;
await tap(240, 150);
await wait(100);
s = await state();
check(!s.player?.onGround && s.player?.y < yBefore, `a tap during play jumps (y ${yBefore} -> ${s.player?.y})`);
s = await until(x => x.player?.onGround, 1500, 50);
await wait(100);
const muted0 = (await state()).isMuted;
await tap(...MUTE_BTN);
await wait(80);
s = await state();
check(s.isMuted === !muted0 && s.player?.onGround && s.player?.vy >= 0, `HUD mute tap mutes, no jump (muted ${s.isMuted}, onGround ${s.player?.onGround})`);
await tap(...MUTE_BTN);
await wait(80);
s = await state();
check(s.isMuted === muted0, `HUD mute tap unmutes (${s.isMuted})`);

const att = s.attempts;
const deaths0 = s.deathLog.length;
await tap(...PAUSE_BTN);
await wait(100);
s = await state();
check(s.mode === 'paused' && s.menu?.screen === 'pause' && s.player?.onGround, `HUD pause tap pauses, no jump (${s.mode})`);
await shot('a2-pause');
await tapButton('PauseScene', 'restart');
s = await until(x => x.mode === 'playing' && x.attempts === att + 1, 400, 50);
check(s.attempts === att + 1 && s.deathLog.length === deaths0, `tap RESTART LEVEL restarts at once (attempt ${s.attempts})`);
await wait(300);
await tap(...PAUSE_BTN);
await wait(100);
s = await state();
check(s.mode === 'paused', `HUD pause tap after a restart (${s.mode})`);
await tapButton('PauseScene', 'restart');
s = await until(x => x.mode === 'playing' && x.attempts === att + 2, 400, 50);
check(s.attempts === att + 2 && s.deathLog.length === deaths0, `second tap restart (attempt ${s.attempts})`);
await wait(300);
await tap(...PAUSE_BTN);
await wait(100);
await tap(20, 250);
await wait(200);
s = await state();
check(s.mode === 'playing' && s.player?.onGround, `a tap outside the pause panel resumes, no jump (${s.mode})`);
await wait(300);
await tap(...PAUSE_BTN);
await wait(100);
const m1 = (await state()).isMuted;
await tapButton('PauseScene', 'sound');
await wait(100);
s = await state();
check(s.mode === 'paused' && s.isMuted === !m1, `tap SOUND toggles mute and stays paused (${m1} -> ${s.isMuted})`);
await tapButton('PauseScene', 'sound');
await wait(100);
await tapButton('PauseScene', 'levels');
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect' && s.menu?.selected === 'level3', `tap LEVEL SELECT leaves the run (${s.mode}, ${s.menu?.selected})`);
await wait(400);
await tap(...cardCenter(2));
await wait(300);
s = await state();
check(s.mode === 'levelselect', `back on the level select, one tap on the same card only focuses it (${s.mode})`);
await tap(...cardCenter(2));
s = await until(x => x.mode === 'intro' || x.mode === 'playing', 3000);
check(s.levelId === 'level3' && (s.mode === 'intro' || s.mode === 'playing'), `the second tap plays (${s.mode})`);

// =============================================================================
// B. Game over by touch
// =============================================================================
if (s.mode === 'intro') {
  await wait(400);
  await tap(240, 135);
}
s = await until(x => x.mode === 'gameover', 30000, 250);
check(s.mode === 'gameover', `idle Booker dies, game over card (${s.lastDeath?.cause})`);
await tap(240, 135);
s = await state();
check(s.mode === 'gameover', `game over: an early tap is ignored (${s.mode})`);
await wait(700);
const gAtt = s.attempts;
await tap(240, 135);
s = await until(x => x.mode === 'playing' && x.attempts === gAtt + 1, 300, 50);
check(s.mode === 'playing' && s.attempts === gAtt + 1, `game over: a tap retries at once (attempt ${s.attempts})`);
s = await until(x => x.mode === 'gameover', 30000, 250);
await wait(700);
await shot('b1-gameover');
await tapButton('GameOverScene', 'levels');
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect', `game over: the LEVELS button goes to the level select (${s.mode})`);

// =============================================================================
// C. Results by touch: LEVELS, the new card during its reveal, NEXT LEVEL
// =============================================================================
await page.goto(`${base}/?menus=1&autoplay=1&det=1`);
await clearSave();
await page.reload();
s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 6000);
await tap(240, 150);
s = await until(x => x.mode === 'levelselect', 3000);
await page.waitForTimeout(400);
await tap(...cardCenter(0));
await page.waitForTimeout(200);
await tap(...cardCenter(0));
s = await until(x => x.mode === 'playing', 4000);
check(s.levelId === 'level1', `fresh save: two taps play Level 1 (${s.levelId})`);
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 200000, 1000);
check(s.mode === 'complete' && s.menu?.unlocked?.levelId === 'level2', `Level 1 complete, Level 2 unlocked (${s.result?.score})`);
s = await until(x => x.menu?.tallyDone && x.menu?.revealDone, 8000, 250);
await tapButton('LevelCompleteScene', 'levels');
s = await until(x => x.mode === 'levelselect', 3000, 50);
check(s.mode === 'levelselect' && s.menu?.selected === 'level2' && s.menu.cards[1].locked,
  `tap LEVELS: level select, Level 2 selected, drawn locked until its reveal (${s.menu?.selected}, locked ${s.menu?.cards?.[1]?.locked})`);
await tap(...cardCenter(1));
await wait(50);
await tap(...cardCenter(1));
s = await until(x => x.mode === 'intro' || x.mode === 'playing', 3000, 50);
check(s.levelId === 'level2' && (s.mode === 'intro' || s.mode === 'playing'),
  `the just-unlocked card plays during its reveal (${s.mode}, ${s.levelId})`);
await wait(500);
await tap(240, 135);   // dismiss the ability card
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 250000, 1000);
check(s.mode === 'complete' && s.result?.levelId === 'level2', `bot clears Level 2 (${s.result?.score})`);
s = await until(x => x.menu?.tallyDone, 8000, 250);
await shot('c1-results');
await tapButton('LevelCompleteScene', 'next');
s = await until(x => (x.mode === 'intro' || x.mode === 'playing') && x.levelId === 'level3', 3000, 50);
check(s.levelId === 'level3', `tap NEXT LEVEL starts Level 3 (${s.mode}, ${s.levelId})`);

// =============================================================================
// D. Level 6 ending by touch
// =============================================================================
await page.goto(`${base}/?level=6&x=21800&autoplay=1&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 20000, 250);
await wait(800);
s = await state();
check(s.menu?.ending && !s.menu.ending.done, 'Level 6 ending is up');
const sel = await record('MENU_SELECT');
const back = await record('MENU_BACK');
await shot('d1-ending');
await tap(240, 247);   // "PRESS TO CONTINUE", right over the REPLAY / LEVELS buttons
await wait(400);
s = await state();
const pressed = [...(await sel()), ...(await back())];
check(s.mode === 'complete' && s.menu?.ending?.done && pressed.length === 0,
  `a tap closes the ending and presses no button under it (ending done ${s.menu?.ending?.done}, events ${JSON.stringify(pressed)})`);
await tapButton('LevelCompleteScene', 'levels');
s = await until(x => x.mode === 'levelselect', 3000, 50);
check(s.mode === 'levelselect', `then LEVELS by tap (${s.mode})`);

await browser.close();
if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  fails.push('page errors');
}
console.log(fails.length ? `touch-check: FAILED (${fails.length})` : 'touch-check: PASSED');
process.exit(fails.length ? 1 : 0);
