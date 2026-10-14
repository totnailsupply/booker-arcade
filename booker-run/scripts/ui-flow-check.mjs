#!/usr/bin/env node
// Menu, overlay and progression flow:
//   1. title (empty save) -> level select; keyboard navigation (arrows + WASD, wrap);
//      locked refusal by key and by mouse click; mouse hover + click starts a level
//   2. Level 1 with the bot (deterministic) -> results: tally skip, stars, FIRST CLEAR,
//      unlock reveal; Levels -> level select reveals Level 2 (NEW); Level 3 refuses
//   3. Next level flow: results -> NEXT -> Level 2 ability intro card (the run waits;
//      the dismissing press is not a jump); auto-dismiss on a second session
//   4. tips toast on attempts 1-2 only
//   5. game over overlay: tip + %, stays up (early presses ignored), press retries, Esc -> select,
//      3 retries leave identical object/listener counts
//   6. pause menu: resume, restart, sound toggle, keys R/Q, level select; pause ->
//      restart -> pause -> restart -> pause -> level select by keys and by mouse (HUD
//      pause button), with no death in between; held P, window blur, a click released
//      while paused
//   7. saves persist across a reload (+ remembered selection), totals correct,
//      legacy Level 1 best migrates, mute key read
//   8. Level 6 golden steak ending
// Usage: node scripts/ui-flow-check.mjs [--url http://localhost:3000] [--out output/ui-flow]

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
const outDir = opt('--out', 'output/ui-flow');
fs.mkdirSync(outDir, { recursive: true });

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
/** Wait for game time: fixed steps once deterministic mode is on, else real time. */
const wait = async (ms) => {
  if (await det()) await stepGame(page, ms);
  else await page.waitForTimeout(ms);
};
const key = async (k, ms = 150) => {
  await page.keyboard.press(k);
  await wait(ms);
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
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const clearSave = () => page.evaluate(() => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('booker-run:')).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
});
const seedSave = (levels) => page.evaluate((lv) => {
  Object.keys(localStorage).filter(k => k.startsWith('booker-run:')).forEach(k => localStorage.removeItem(k));
  localStorage.setItem('booker-run:save:v1', JSON.stringify({ version: 1, levels: lv, updatedAt: 1 }));
}, levels);
const lv = (o = {}) => ({
  completed: false, bestScore: 0, bestStars: 0, bestTimeS: null, bestProgress: 0, bestBones: 0, attempts: 0, clears: 0, ...o,
});
/**
 * Listens for the next payload of an EventBus event. Registration is awaited (so
 * it can't race the key press that follows); call the returned function to read
 * the payload (polls up to `ms` of real time, null if it never came).
 */
const nextEvent = async (name, ms = 1500) => {
  const id = `${name}:${Math.random()}`;
  await page.evaluate(({ name, id }) => {
    window.__NEXT__ = window.__NEXT__ || {};
    window.__NEXT__[id] = null;
    const bus = window.__EVENT_BUS__;
    const ev = window.__EVENTS__[name];
    const fn = (d) => { bus.off(ev, fn); window.__NEXT__[id] = d ?? {}; };
    bus.on(ev, fn);
  }, { name, id });
  return async () => {
    for (let t = 0; t <= ms; t += 50) {
      const v = await page.evaluate((id) => window.__NEXT__?.[id] ?? null, id).catch(() => null);
      if (v) return v;
      await page.waitForTimeout(50);
    }
    return null;
  };
};
/** Records every payload of an event from now on: collect(name) -> () => list. */
const record = async (name) => {
  await page.evaluate((name) => {
    window.__REC__ = window.__REC__ || {};
    window.__REC__[name] = [];
    window.__EVENT_BUS__.on(window.__EVENTS__[name], (d) => window.__REC__[name].push(d ?? {}));
  }, name);
  return () => page.evaluate((name) => window.__REC__[name], name);
};
// Mouse in game coordinates (480x270)
const gamePoint = async (x, y) => {
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 480;
  return [box.x + x * k, box.y + y * k];
};
const mouseMove = async (x, y) => page.mouse.move(...(await gamePoint(x, y)));
const mouseClick = async (x, y) => page.mouse.click(...(await gamePoint(x, y)));
// Level select card centres (SELECT_UI: 3x2, 148x100, gap 8x6, left 10, top 38)
const cardCenter = (i) => [10 + (i % 3) * 156 + 74, 38 + Math.floor(i / 3) * 106 + 50];

// =============================================================================
// 1. Title -> level select, navigation, locked refusal, mouse
// =============================================================================
await page.goto(`${base}/?menus=1&autoplay=1&det=1`);
await clearSave();
await page.reload();
let s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 5000);
check(s.mode === 'title' && s.save?.levelsCleared === 0 && s.menu?.stats === false,
  `title with an empty save, no stats line (cleared ${s.save?.levelsCleared}, stats ${s.menu?.stats})`);
await key('Space', 700);
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect' && s.menu?.selected === 'level1', `level select, Level 1 selected (${s.menu?.selected})`);
check(s.save.levels[0].unlocked && !s.save.levels[1].unlocked, 'Level 1 open, Level 2 locked');
check(s.menu?.cards?.length === 6 && s.menu.cards.slice(1).every(c => c.locked), 'six cards, 2-6 drawn locked');
await shot('01-level-select');

// Keyboard navigation: Right, D, Down (row), Up, Left, A; Left from 1 wraps to 6
const moves = await record('MENU_MOVE');
const navSeq = [['ArrowRight', 'level2'], ['d', 'level3'], ['ArrowDown', 'level6'], ['w', 'level3'],
  ['ArrowLeft', 'level2'], ['a', 'level1'], ['ArrowLeft', 'level6'], ['s', 'level3'], ['ArrowRight', 'level4']];
const navGot = [];
for (const [k] of navSeq) {
  await key(k, 60);
  navGot.push((await state()).menu?.selected);
}
check(JSON.stringify(navGot) === JSON.stringify(navSeq.map(n => n[1])), `keyboard navigation (arrows + WASD, wrap): ${navGot.join(' ')}`);
check((await moves()).length === navSeq.length, `MENU_MOVE per move (${(await moves()).length})`);

// Locked refusal by key (Level 4 selected)
let lockedEvent = await nextEvent('MENU_LOCKED');
await key('Space', 400);
let ev = await lockedEvent();
s = await state();
check(ev?.levelId === 'level4' && s.mode === 'levelselect', `locked Level 4 refuses by key (event ${JSON.stringify(ev)}, mode ${s.mode})`);

// Locked refusal by mouse: hover focuses Level 2, click refuses
await mouseMove(...cardCenter(1));
await wait(120);
s = await state();
check(s.menu?.selected === 'level2', `mouse hover focuses a card (${s.menu?.selected})`);
lockedEvent = await nextEvent('MENU_LOCKED');
await mouseClick(...cardCenter(1));
ev = await lockedEvent();
await wait(300);
s = await state();
check(ev?.levelId === 'level2' && s.mode === 'levelselect', `locked Level 2 refuses a click (${ev?.levelId}, mode ${s.mode})`);

// Mouse hover + click on Level 1 starts it
await mouseMove(...cardCenter(0));
await wait(100);
const selectEv = await nextEvent('MENU_SELECT');
await mouseClick(...cardCenter(0));
ev = await selectEv();
s = await until(x => x.mode === 'playing', 5000, 100);
check(ev?.levelId === 'level1' && s.mode === 'playing' && s.levelId === 'level1', `click starts Level 1 (${ev?.action} ${s.levelId})`);
check(!s.intro && s.ui && s.ui.tipsPending === 0, 'Level 1: no ability card, no tips');

// =============================================================================
// 2. Level 1 with the bot -> results -> unlock -> level select reveal
// =============================================================================
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 5000 });
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 200000, 1000);
check(s.mode === 'complete' && s.result?.levelId === 'level1', `Level 1 complete (score ${s.result?.score}, deaths ${s.deathLog?.length})`);
await wait(500);
s = await state();
check(s.menu?.unlocked?.levelId === 'level2' && s.menu?.focus === 'next' && !s.menu.tallyDone,
  `results: unlock for Level 2, Next focused, tally running (${JSON.stringify({ u: s.menu?.unlocked?.levelId, f: s.menu?.focus, t: s.menu?.tallyDone })})`);
check(s.save.levels[0].completed && s.save.levels[1].unlocked && !s.save.levels[2].unlocked, 'save: Level 1 cleared, Level 2 open, Level 3 locked');
// Let the tally run naturally to the end (stars + callouts + reveal)
const stars = await record('UI_STAR_POP');
const reveals = await record('UI_UNLOCK_REVEAL');
s = await until(x => x.menu?.tallyDone && x.menu?.revealDone, 8000, 250);
const starPops = await stars();
check(s.menu?.tallyDone && s.menu.starsShown === 3 && starPops.filter(p => p.earned).length === s.result.stars,
  `tally done, 3 stars shown, ${s.result.stars} earned (${JSON.stringify(starPops)})`);
check(s.menu.newBest?.firstClear && s.menu.callouts.includes('score'), `FIRST CLEAR callout (${JSON.stringify(s.menu.callouts)})`);
check((await reveals()).some(r => r.levelId === 'level2' && r.where === 'complete'), 'unlock reveal played on the results');
await shot('02-complete');

// Focus: Right x2 -> Levels, Left x2 -> Next
await key('ArrowRight');
await key('ArrowRight');
s = await state();
check(s.menu?.focus === 'levels', `focus moved to Levels (${s.menu?.focus})`);
await key('ArrowLeft');
await key('ArrowLeft');
s = await state();
check(s.menu?.focus === 'next', `focus back on Next (${s.menu?.focus})`);

// =============================================================================
// 3. Next level flow + ability intro card
// =============================================================================
const introShown = await nextEvent('ABILITY_INTRO_SHOWN', 6000);
await key('Space', 100);   // tally is done: this press is NEXT
s = await until(x => x.mode === 'intro' || x.mode === 'playing', 5000, 100);
ev = await introShown();
check(s.mode === 'intro' && s.levelId === 'level2' && s.intro?.ability === 'double' && ev?.ability === 'double',
  `NEXT starts Level 2 with the ability card up (mode ${s.mode}, ${JSON.stringify(s.intro)})`);
const x0 = s.player?.x;
await wait(600);
s = await state();
check(s.mode === 'intro' && s.player?.x === x0, `the run waits while the card is up (x ${x0} -> ${s.player?.x})`);
await shot('04-ability-intro');
const introDone = await nextEvent('ABILITY_INTRO_DONE', 4000);
await page.keyboard.press('Space');
await wait(34);
ev = await introDone();
s = await state();
check(ev?.by === 'press' && s.mode === 'playing', `a press dismisses the card and the run starts (${ev?.by}, ${s.mode})`);
check(s.player?.onGround && s.player?.vy >= 0, `the dismissing press was not a jump (onGround ${s.player?.onGround}, vy ${s.player?.vy})`);

// Second session of Level 2 from the menus: the card dismisses itself
await page.keyboard.press('p');
await wait(200);
s = await state();
check(s.mode === 'paused' && s.menu?.screen === 'pause', `P opens the pause menu (${s.mode}, ${s.menu?.screen})`);
await key('q', 600);
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect' && s.menu?.selected === 'level2', `Q quits to the level select (${s.menu?.selected})`);
await key('ArrowRight');
lockedEvent = await nextEvent('MENU_LOCKED');
await page.keyboard.press('Space');
ev = await lockedEvent();
await wait(300);
s = await state();
check(ev?.levelId === 'level3' && s.mode === 'levelselect', `locked Level 3 refuses to start (${ev?.levelId}, mode ${s.mode})`);
await shot('03-level-select-after-clear');
await key('ArrowLeft');
const introAuto = await nextEvent('ABILITY_INTRO_DONE', 15000);
await key('Space', 100);
s = await until(x => x.mode === 'intro', 3000, 100);
check(s.mode === 'intro', 'card shows again on the first attempt of a new session');
s = await until(x => x.mode === 'playing', 4000, 200);
ev = await introAuto();
check(ev?.by === 'auto' && s.mode === 'playing', `card dismisses itself after ~2.4 s (${ev?.by})`);

// A window blur while the card is up: the run pauses as soon as the card closes
await page.goto(`${base}/?level=2&intro=1&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'intro', 2000, 100);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await wait(100);
const modeDuringCard = (await state()).mode;
s = await until(x => x.mode !== 'intro', 4000, 200);
check(modeDuringCard === 'intro' && s.mode === 'paused' && s.menu?.screen === 'pause',
  `blur during the ability card: the card stays, then the run starts paused (${modeDuringCard} -> ${s.mode})`);

// The card's scene 'update' hook goes away if the run ends while the card is up
// (scene events outlive a restart)
await page.goto(`${base}/?level=2&intro=1&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'intro', 2000, 100);
const updateHooks = () => page.evaluate(() => window.__GAME__.scene.getScene('RunScene').sys.events.listenerCount('update'));
const hooksWithCard = await updateHooks();
await page.evaluate(() => window.__GAME__.scene.getScene('RunScene').scene.restart({ levelId: 'level2' }));
await wait(100);
const hooksAfter = await updateHooks();
s = await state();
check(s.mode === 'playing' && hooksAfter === hooksWithCard - 1,
  `restart with the card up drops its update hook (${hooksWithCard} -> ${hooksAfter}, ${s.mode})`);

// Unlock reveal on the level select: a quick first clear (start near the steak), Esc = Levels
await clearSave();
await page.goto(`${base}/?level=1&x=99999&autoplay=1&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 20000, 250);
check(s.menu?.unlocked?.levelId === 'level2', `quick first clear unlocks Level 2 (${JSON.stringify(s.menu?.unlocked)})`);
const selectReveal = await nextEvent('UI_UNLOCK_REVEAL', 6000);
await key('Escape', 400);
s = await until(x => x.mode === 'levelselect', 3000);
check(s.mode === 'levelselect' && s.menu?.selected === 'level2', `Esc on the results -> level select, Level 2 selected (${s.menu?.selected})`);
await wait(1400);
ev = await selectReveal();
s = await state();
const c2 = s.menu?.cards?.[1];
check(ev?.where === 'select' && !s.menu.revealing && c2 && !c2.locked && c2.isNew,
  `level select unlocks Level 2 on screen, NEW tag (${JSON.stringify(c2)})`);
check(s.menu.totals.totalScore === s.save.totalScore && s.menu.totals.cleared === 1 && s.menu.totals.stars === s.save.totalStars,
  `header totals match the save (${JSON.stringify(s.menu.totals)})`);

// =============================================================================
// 4. Tips toast: attempts 1 and 2 only
// =============================================================================
await page.goto(`${base}/?level=2&x=1180&intro=0&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
const tipsSeen = await record('TIP_SHOWN');
const tipTexts = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  s = await until(x => x.mode === 'playing' && x.attempts === attempt, 6000, 100);
  if (attempt === 1) {
    s = await until(x => x.ui?.tip, 3000, 50);
    check(!!s.ui?.tip && /double jump/i.test(s.ui.tip), `tip toast at its x on attempt 1 ("${s.ui?.tip}")`);
    await shot('05-tip');
  }
  if (attempt === 3) {
    check(s.ui?.tipsPending === 0, `no tips on attempt 3 (pending ${s.ui?.tipsPending})`);
  }
  tipTexts.push((await tipsSeen()).length);
  s = await until(x => x.mode === 'gameover', 20000, 250);
  await wait(700); // presses in the first GAMEOVER.INPUT_LOCK_MS are ignored
  await key('Space', 200);
}
check(tipTexts[1] >= 1 && (await tipsSeen()).length >= 2, `tips on attempts 1-2 (${(await tipsSeen()).length} shown)`);

// =============================================================================
// 5. Game over overlay and retries
// =============================================================================
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem('booker-run:save:v1'));
  if (save?.levels?.level2) save.levels.level2.bestProgress = 0;
  localStorage.setItem('booker-run:save:v1', JSON.stringify(save));
});
await page.goto(`${base}/?level=2&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
const counts = () => page.evaluate(() => {
  const run = window.__GAME__.scene.getScene('RunScene');
  const bus = window.__EVENT_BUS__;
  const listeners = Object.values(bus.listeners).reduce((n, l) => n + l.length, 0);
  const tw = run.tweens.getTweens ? run.tweens.getTweens().length : -1;
  return {
    children: run.children.length,
    tweens: tw,
    listeners,
    sceneListeners: run.events.eventNames().reduce((n, e) => n + run.events.listenerCount(e), 0),
    keys: Object.keys(run.input.keyboard.keys || {}).length,
    sequencers: window.__AUDIO__.debugState().liveSequencers,
  };
});
const snapshots = [];
for (let attempt = 1; attempt <= 4; attempt++) {
  s = await until(x => x.mode === 'playing' && x.attempts === attempt, 6000, 100);
  await wait(1000);
  snapshots.push(await counts());
  // idle into the first obstacle
  s = await until(x => x.mode === 'gameover', 20000, 250);
  if (attempt === 1) {
    check(s.mode === 'gameover' && s.scenes.includes('GameOverScene') && s.lastDeath?.cause,
      `game over overlay (cause ${s.lastDeath?.cause}, ${Math.round((s.lastDeath?.progress || 0) * 100)}%)`);
    check(s.menu?.screen === 'gameover' && s.menu.tip && s.menu.header && s.menu.isNewBest === true,
      `card: header "${s.menu?.header}", tip "${s.menu?.tip}", NEW BEST ${s.menu?.isNewBest}`);
    await shot('06-game-over');
    // The card stays up: no auto-retry for players, and early presses are ignored
    await page.keyboard.press('Space');
    s = await state();
    check(s.mode === 'gameover' && s.menu?.armed === false, `an early press is ignored (${s.mode}, armed ${s.menu?.armed})`);
    await wait(3000);
    s = await state();
    check(s.mode === 'gameover' && s.menu?.autoRetryInMs === null, `the card stays up with no auto-retry (${s.mode})`);
    await page.keyboard.press('Space');
    s = await until(x => x.mode === 'playing' && x.attempts === 2, 400, 50);
    check(s.mode === 'playing' && s.attempts === 2, 'a press after the lock retries');
  } else if (attempt === 2) {
    check(s.menu?.isNewBest === false && s.menu?.header && s.menu.attempt === 2, `second death: no NEW BEST, attempt 2 (${s.menu?.header})`);
    await wait(700);
    await page.keyboard.press('Space');
    s = await until(x => x.mode === 'playing' && x.attempts === 3, 400, 50);
    check(s.mode === 'playing' && s.attempts === 3, 'a press retries at once');
  } else if (attempt === 3) {
    await wait(700);
    await page.keyboard.press('Enter');
    s = await until(x => x.mode === 'playing' && x.attempts === 4, 400, 50);
  } else {
    await wait(700);
    await page.keyboard.press('Escape');
    s = await until(x => x.mode === 'levelselect', 3000, 100);
    check(s.mode === 'levelselect' && s.menu?.selected === 'level2', `Esc on the overlay -> level select (${s.menu?.selected})`);
  }
}
// Live music sequencers depend on whether a key press has unlocked audio yet, so
// they are checked separately (never more than one)
const strip = ({ sequencers, ...rest }) => rest;
const same = snapshots.slice(1).every(c => JSON.stringify(strip(c)) === JSON.stringify(strip(snapshots[1])));
check(same, `retries 2-4 identical: ${JSON.stringify(snapshots.slice(1).map(strip))}`);
check(snapshots.every(c => c.sequencers <= 1), `never more than one music sequencer (${snapshots.map(c => c.sequencers)})`);
const bestProgress = (await state()).save?.levels[1].bestProgress;
check(bestProgress > 0, `best progress recorded on death (${bestProgress})`);

// =============================================================================
// 6. Pause menu
// =============================================================================
await page.goto(`${base}/?level=2&x=300&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'playing', 4000, 100);
await wait(300);
await key('p', 200);
s = await state();
check(s.mode === 'paused' && s.menu?.focus === 'resume' && s.menu.buttons.join() === 'resume,restart,levels,sound',
  `pause menu (${JSON.stringify(s.menu)})`);
await shot('07-pause');
await key('ArrowDown', 80);
await key('ArrowDown', 80);
await key('ArrowDown', 80);
s = await state();
const muted0 = s.isMuted;
check(s.menu?.focus === 'sound', `focus moves to SOUND (${s.menu?.focus})`);
await key('Space', 120);
s = await state();
check(s.isMuted === !muted0 && s.mode === 'paused', `SOUND toggles mute and stays paused (${muted0} -> ${s.isMuted})`);
await key('Enter', 120);
s = await state();
check(s.isMuted === muted0, `SOUND toggles back (${s.isMuted})`);
await key('Escape', 300);
s = await state();
check(s.mode === 'playing', `Esc resumes (${s.mode})`);
// Pause -> RESTART -> pause -> R -> pause -> LEVEL SELECT. A death's auto-retry
// also bumps the attempt (it once hid a broken pause), so every restart here must
// be quick (an auto-retry takes ~1.9 s) and leave the death log unchanged.
const att = s.attempts;
const deaths0 = s.deathLog.length;
await wait(300);
await key('p', 200);
s = await state();
check(s.mode === 'paused', `P pauses again shortly after a resume (${s.mode})`);
await key('ArrowDown', 80);
await key('Space', 100);
s = await until(x => x.mode === 'playing' && x.attempts === att + 1, 400, 50);
check(s.mode === 'playing' && s.attempts === att + 1 && s.deathLog.length === deaths0,
  `RESTART LEVEL restarts at once, no death (attempt ${att} -> ${s.attempts}, deaths +${s.deathLog.length - deaths0})`);
await wait(300);
await key('p', 200);
s = await state();
check(s.mode === 'paused', `P pauses after a pause-menu restart (${s.mode})`);
await key('r', 100);
s = await until(x => x.mode === 'playing' && x.attempts === att + 2, 400, 50);
check(s.attempts === att + 2 && s.deathLog.length === deaths0, `R restarts from the pause menu (attempt ${s.attempts}, deaths +${s.deathLog.length - deaths0})`);
await wait(300);
await key('p', 200);
await key('ArrowUp', 80);
await key('ArrowUp', 80);
s = await state();
check(s.menu?.focus === 'levels', `Up wraps to LEVEL SELECT (${s.menu?.focus})`);
await key('Space', 600);
s = await until(x => x.mode === 'levelselect', 3000, 100);
check(s.mode === 'levelselect' && s.menu?.selected === 'level2', `LEVEL SELECT leaves the run (${s.menu?.selected})`);

// Holding P: key auto-repeat never flips between paused and playing.
// (Playwright sends repeat: true for a second keyboard.down() without an up.)
await page.goto(`${base}/?level=2&x=300&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'playing', 4000, 100);
await wait(300);
await page.keyboard.down('p');
await wait(100);
const heldModes = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.down('p');
  await wait(100);
  heldModes.push((await state()).mode);
}
await page.keyboard.up('p');
check(heldModes.every(m => m === 'paused'), `holding P stays paused (${heldModes.join(' ')})`);
await key('p', 300);
s = await state();
check(s.mode === 'playing', `P resumes (${s.mode})`);
// Window blur (another window in front) pauses
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await wait(100);
s = await state();
check(s.mode === 'paused', `window blur pauses (${s.mode})`);
await key('Escape', 300);

// A mouse button released while paused must not stay "held" (on Levels 3+ it
// would glide on its own after the resume). Fresh start: the first bollard is near.
await page.goto(`${base}/?level=2&x=300&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'playing', 4000, 100);
await wait(300);
await page.mouse.move(...(await gamePoint(240, 150)));
await page.mouse.down();
await wait(50);
await key('p', 200);
await page.mouse.up();
await wait(50);
await key('p', 300);
const heldAfter = await page.evaluate(() => {
  const inp = window.__GAME__.scene.getScene('RunScene').input_;
  return { pointers: inp.pointerIds.size, held: inp.poll().held };
});
s = await state();
check(s.mode === 'playing' && heldAfter.pointers === 0 && !heldAfter.held,
  `a click released during the pause is not held after resume (${s.mode}, ${JSON.stringify(heldAfter)})`);

// Mouse: HUD pause button -> RESTART -> pause -> RESTART -> pause -> click outside
// the panel resumes -> pause -> LEVEL SELECT
await page.goto(`${base}/?level=2&x=300&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
s = await until(x => x.mode === 'playing', 4000, 100);
await wait(300);
const PAUSE_BTN = [480 - 6 - 14 - 4 - 14 + 7, 6 - 2 + 7];   // HUD pause button centre (449, 11), left of mute
const pauseButton = (id) => page.evaluate((id) => {
  const b = window.__GAME__.scene.getScene('PauseScene').buttons.find(x => x.id === id);
  return [b.container.x, b.container.y];
}, id);
const mAtt = s.attempts;
const mDeaths = s.deathLog.length;
const mouseSeq = [];
const clickPause = async () => {
  await mouseClick(...PAUSE_BTN);
  await wait(100);
  const t = await state();
  mouseSeq.push(`${t.mode}${t.player?.onGround && t.player?.vy >= 0 ? '' : ' (jumped)'}`);
  return t;
};
s = await clickPause();
check(s.mode === 'paused' && s.menu?.screen === 'pause' && s.player?.onGround, `HUD pause button pauses, no jump (${mouseSeq.at(-1)})`);
await mouseClick(...(await pauseButton('restart')));
s = await until(x => x.mode === 'playing' && x.attempts === mAtt + 1, 400, 50);
check(s.attempts === mAtt + 1 && s.deathLog.length === mDeaths, `click RESTART LEVEL restarts (attempt ${s.attempts})`);
await wait(300);
s = await clickPause();
check(s.mode === 'paused', `HUD pause after a restart (${s.mode})`);
await mouseClick(...(await pauseButton('restart')));
s = await until(x => x.mode === 'playing' && x.attempts === mAtt + 2, 400, 50);
check(s.attempts === mAtt + 2 && s.deathLog.length === mDeaths, `second click restart (attempt ${s.attempts})`);
await wait(300);
s = await clickPause();
await mouseClick(20, 250);
await wait(300);
s = await state();
check(s.mode === 'playing' && s.player?.onGround, `a click outside the panel resumes, no jump (${s.mode})`);
s = await clickPause();
await mouseClick(...(await pauseButton('levels')));
s = await until(x => x.mode === 'levelselect', 3000, 100);
check(s.mode === 'levelselect' && s.menu?.selected === 'level2',
  `click LEVEL SELECT leaves the run (${s.mode} ${s.menu?.selected}; pauses: ${mouseSeq.join(', ')})`);

// =============================================================================
// 7. Saves across reloads, totals, migration, mute key
// =============================================================================
await page.goto(`${base}/`);
s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 5000);
check(s.save?.levelsCleared === 1 && s.save.levels[0].bestScore > 0 && s.save.levels[1].unlocked && s.save.levels[1].attempts > 0,
  `save survives a reload (cleared ${s.save?.levelsCleared}, L1 best ${s.save?.levels[0].bestScore}, L2 tries ${s.save?.levels[1].attempts})`);

await seedSave({
  level1: lv({ completed: true, bestScore: 2945, bestStars: 3, bestTimeS: 81.2, bestProgress: 1, bestBones: 62, attempts: 4, clears: 2 }),
  level2: lv({ completed: true, bestScore: 3180, bestStars: 2, bestTimeS: 92.4, bestProgress: 1, bestBones: 31, attempts: 9, clears: 1 }),
  level3: lv({ bestProgress: 0.62, attempts: 7 }),
});
await page.evaluate(() => localStorage.setItem('booker-run:ui:lastLevel', 'level3'));
await page.reload();
s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 5000);
check(s.menu?.stats === true, 'title shows the progress line once there is progress');
await key('Space', 700);
s = await until(x => x.mode === 'levelselect', 3000);
const T = s.menu?.totals || {};
check(T.totalScore === 6125 && T.stars === 5 && T.maxStars === 18 && T.cleared === 2 && T.levels === 6 && T.bones === 93 && T.tries === 20,
  `totals: score 6125, stars 5/18, cleared 2/6, bones 93, tries 20 (${JSON.stringify(T)})`);
check(s.menu?.selected === 'level3', `remembered last level (${s.menu?.selected})`);
const cards = s.menu?.cards || [];
check(cards[0].completed && cards[1].completed && !cards[2].locked && !cards[2].completed && cards[2].bestProgress === 0.62 && cards[3].locked,
  `cards reflect the save (L3 62%, L4 locked)`);

await clearSave();
await page.evaluate(() => {
  localStorage.setItem('booker-run:best:level1', JSON.stringify({ score: 1234, stars: 2 }));
  localStorage.setItem('booker-run:muted', 'true');
});
await page.reload();
s = await until(x => x.mode === 'title' && x.scenes.includes('TitleScene'), 5000);
const l1 = s.save?.levels[0];
check(l1?.completed && l1.bestScore === 1234 && l1.bestStars === 2 && s.save.levels[1].unlocked,
  `legacy Level 1 best migrates (${JSON.stringify(l1)})`);
const v1 = await page.evaluate(() => localStorage.getItem('booker-run:save:v1'));
check(!!v1 && JSON.parse(v1).levels.level1.bestScore === 1234, 'migrated save written under booker-run:save:v1');
check(s.isMuted === true, 'mute key booker-run:muted still read');
await page.evaluate(() => localStorage.setItem('booker-run:muted', 'false'));

// =============================================================================
// 8. Level 6: golden steak ending
// =============================================================================
await seedSave(Object.fromEntries([1, 2, 3, 4, 5].map(n => [`level${n}`, lv({
  completed: true, bestScore: 3000, bestStars: 3, bestTimeS: 90, bestProgress: 1, bestBones: 40, attempts: 5, clears: 1,
})])));
await page.goto(`${base}/?level=6&x=99999&autoplay=1&det=1`);
await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout: 8000 });
const ending = await nextEvent('UI_ENDING', 20000);
s = await until(x => x.mode === 'complete' && x.scenes.includes('LevelCompleteScene'), 20000, 250);
await wait(1000);
ev = await ending();
s = await state();
check(ev && s.menu?.ending && !s.menu.ending.done, `golden steak ending shows (${JSON.stringify(ev)})`);
await shot('08-ending');
await key('Space', 400);
s = await state();
check(s.menu?.ending?.done && !s.menu.buttons.some(b => b.id === 'next') && s.menu.focus === 'levels',
  `ending closes; results without NEXT, Levels focused (${JSON.stringify(s.menu?.buttons)}, ${s.menu?.focus})`);
check(s.save.levelsCleared === 6, `all six cleared (${s.save.levelsCleared})`);

await browser.close();
if (errors.length) console.log('errors:', errors.slice(0, 10));
console.log(`ui-flow-check: ${fails.length ? 'FAILED' : 'PASSED'} (${fails.length} failures${errors.length ? `, ${errors.length} page errors` : ''})`);
process.exit(fails.length || errors.length ? 1 : 0);
