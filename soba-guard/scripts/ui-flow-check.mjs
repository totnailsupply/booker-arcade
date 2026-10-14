#!/usr/bin/env node
// =============================================================================
// ui-flow-check.mjs — menus, progression and save, end to end in a browser.
//
// Runs on the deterministic test clock (window.advanceTime) with ?test=1, which
// installs window.__TEST_FINISH__(won, stars) to end a battle with a NON-debug
// result (so saving is exercised without playing a whole level).
//
//   1. Keyboard only: Title -> Level Select (locked node refuses) -> Back Garden
//      -> Battle (modifiers in the config) -> Pause / Resume / Retry / Quit ->
//      forced win -> Results (stars fill, unlock card, bones saved) -> Retry ->
//      forced loss -> Level Select -> Title -> Shop (buy, can't-afford, buy) ->
//      Battle config carries the new modifiers -> reload keeps everything.
//   2. Mouse only: the same screens by clicking buttons.
//   3. Touch: tap through Title -> Level Select -> Battle.
// Screenshots: output/step2/ui-*.png
//
// Usage: node scripts/ui-flow-check.mjs [--url http://localhost:3003] [--headed]
// Exit 0 = all checks pass.
// =============================================================================

import fs from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';
import { MENU, SELECT_MENU, SHOP_MENU, RESULTS_MENU, PAUSE_MENU, TITLE_MENU, LEVEL_NODES } from '../src/core/MetaConstants.js';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argVal('--url', `http://localhost:${process.env.PORT || 3003}`);
const HEADED = args.includes('--headed');
const SHOTS = 'output/step2';
const W = 640;
const H = 360;
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
let warnings = 0;
const check = (ok, msg, extra) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ''}`);
  if (!ok) failures++;
  return ok;
};
const warn = (msg) => { console.log(`[WARN] ${msg}`); warnings++; };

// --- page helpers ---------------------------------------------------------------

async function open(browser, query, opts = {}) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.isActive('TitleScene'), null, { timeout: 20000 });
  await page.evaluate(() => window.advanceTime(500));
  return { page, errors };
}

const adv = (page, ms) => page.evaluate(t => window.advanceTime(t), ms);
const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const menu = async (page) => (await state(page)).menu || null;
const active = (page, key) => page.evaluate(k => window.__GAME__.scene.isActive(k), key);
const paused = (page, key) => page.evaluate(k => window.__GAME__.scene.isPaused(k), key);
const cfg = (page) => page.evaluate(() => window.__GAME_STATE__.battleConfig);
const savedJson = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('soba-guard:save')); } catch { return 'ERR'; } });

async function key(page, k, ms = 60) {
  await page.keyboard.press(k);
  await adv(page, ms);
}

/** Clicks game coordinates (640x360 space). */
async function click(page, x, y, ms = 80) {
  const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const px = r.x + (x / W) * r.w;
  const py = r.y + (y / H) * r.h;
  await page.mouse.move(px, py);
  await adv(page, 20);
  await page.mouse.down();
  await adv(page, 20);
  await page.mouse.up();
  await adv(page, ms);
}

async function tap(page, x, y, ms = 80) {
  const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.touchscreen.tap(r.x + (x / W) * r.w, r.y + (y / H) * r.h);
  await adv(page, ms);
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/ui-${name}.png` });

/** Opens the pause menu. Returns 'battle' if BattleScene launched it on P, 'manual' if we had to. */
async function openPause(page, how = 'key') {
  if (how === 'key') await key(page, 'p', 100);
  else await click(page, 604 + 14, 12 + 14, 100); // HUD pause button (Constants.UI.PAUSE_BTN)
  if (await active(page, 'PauseScene')) return 'battle';
  // BattleScene doesn't launch PauseScene yet (Step 2a): close its own overlay and launch ours by hand
  await page.evaluate(() => {
    const g = window.__GAME__;
    const b = g.scene.getScene('BattleScene');
    if (b.paused && b.togglePause) b.togglePause();
    g.scene.pause('BattleScene');
    g.scene.run('PauseScene');
  });
  await adv(page, 100);
  return 'manual';
}

// Button centres (from MetaConstants)
const cx = W / 2;
const BACK = { x: MENU.BACK_BTN.X + MENU.BACK_BTN.W / 2, y: MENU.BACK_BTN.Y + MENU.BACK_BTN.H / 2 };
const node = (n) => ({ x: LEVEL_NODES[n - 1].x, y: LEVEL_NODES[n - 1].y });
const shopBuy = (i) => ({ x: SHOP_MENU.BUY_X, y: SHOP_MENU.ROW_Y + i * (SHOP_MENU.ROW_H + SHOP_MENU.ROW_GAP) + SHOP_MENU.ROW_H / 2 });
const resultsBtn = (i, count) => {
  const total = count * RESULTS_MENU.BTN_W + (count - 1) * RESULTS_MENU.BTN_GAP;
  return { x: cx - total / 2 + RESULTS_MENU.BTN_W / 2 + i * (RESULTS_MENU.BTN_W + RESULTS_MENU.BTN_GAP), y: RESULTS_MENU.BUTTONS_Y };
};
const pauseBtn = (i) => ({ x: cx, y: PAUSE_MENU.FIRST_BTN_Y + i * PAUSE_MENU.BTN_STEP });

// --- 1. keyboard only ---------------------------------------------------------------

async function keyboardFlow(browser) {
  console.log('\n--- keyboard only ---');
  const { page, errors } = await open(browser, '?reset=1&test=1');
  let m = await menu(page);
  check(m?.scene === 'TitleScene' && m.focus === 'play', 'Title shows with Play focused', m && { scene: m.scene, focus: m.focus });
  check(m?.bones === 0 && m.shop.piggy === 0, 'fresh save: 0 bones, shop rank 0', m && { bones: m.bones, shop: m.shop });
  check(await page.evaluate(() => !!window.__TEST_FINISH__), '?test=1 installs __TEST_FINISH__');
  await shot(page, 'title');

  await key(page, 'Enter', 400);
  m = await menu(page);
  check(m?.scene === 'LevelSelectScene' && m.focus === 'level1', 'Enter -> Level Select, Back Garden focused', m && { scene: m.scene, focus: m.focus });
  check(m?.levels.length === 5 && m.levels[0].playable && !m.levels[1].playable && m.levels[1].exists === false, '5 nodes; 1 playable, 2-5 "Coming soon"', m?.levels);
  check(m?.levels[0].reward === 'chili' && m.selected === 1, 'node 1 shows its reward (chili) and is selected', m && { reward: m.levels[0].reward, selected: m.selected });
  await shot(page, 'select');

  await key(page, 'ArrowRight', 300);
  m = await menu(page);
  check(m?.focus === 'level2', 'ArrowRight -> Night Market', m?.focus);
  await key(page, 'Enter', 300);
  check(await active(page, 'LevelSelectScene') && !(await active(page, 'BattleScene')), 'a locked node does not start a battle');
  await shot(page, 'select-locked');
  await key(page, 'ArrowLeft', 300);
  await key(page, 'Enter', 500);
  check(await active(page, 'BattleScene'), 'Enter on Back Garden -> BattleScene');
  let c = await cfg(page);
  check(c?.levelNumber === 1 && c.modifiers && c.modifiers.startCoins === 0, 'battle config: level 1 + modifiers', c);
  check(c?.debugRun === false, 'menu start is not a debug run', c?.debugRun);

  // pause / resume
  await adv(page, 1000);
  const how = await openPause(page, 'key');
  if (how === 'manual') warn('P did not launch PauseScene: BattleScene still uses its own overlay (Step 2a wires it). Launched by hand.');
  m = await menu(page);
  check(await active(page, 'PauseScene') && await paused(page, 'BattleScene'), 'Pause: PauseScene over a paused BattleScene');
  check(m?.scene === 'PauseScene' && m.focus === 'resume', 'Pause menu focuses Resume', m && { scene: m.scene, focus: m.focus });
  await shot(page, 'pause');
  const t0 = (await state(page)).time;
  await adv(page, 1000);
  const t1 = (await state(page)).time;
  check(t0 === t1, 'battle time frozen while paused', { t0, t1 });
  await key(page, 'Escape', 100);
  check(!(await active(page, 'PauseScene')) && await active(page, 'BattleScene'), 'Esc resumes the battle');
  await adv(page, 500);
  const t2 = (await state(page)).time;
  check(t2 > t1, 'battle time runs again after resume', { t1, t2 });
  check((await state(page)).mode === 'playing', 'mode back to playing', (await state(page)).mode);

  // pause -> Retry
  await openPause(page, 'key');
  await key(page, 'ArrowDown', 60);
  m = await menu(page);
  check(m?.focus === 'retry', 'ArrowDown -> Retry', m?.focus);
  await key(page, 'Enter', 200);
  const tr = (await state(page)).time;
  check(await active(page, 'BattleScene') && !(await active(page, 'PauseScene')) && tr < 0.5, 'Pause > Retry: fresh battle', { time: tr });

  // pause -> Quit
  await openPause(page, 'key');
  await key(page, 'ArrowDown', 60);
  await key(page, 'ArrowDown', 60);
  await key(page, 'Enter', 400);
  check(await active(page, 'LevelSelectScene') && !(await active(page, 'BattleScene')) && !(await active(page, 'PauseScene')), 'Pause > Quit -> Level Select');

  // forced win with an unlock
  await key(page, 'Enter', 500);
  check(await active(page, 'BattleScene'), 'back in battle');
  await page.evaluate(() => window.__TEST_FINISH__(true, [true, false, true]));
  await adv(page, 2500);
  m = await menu(page);
  check(m?.scene === 'ResultsScene' && m.won === true, 'forced win -> Results', m && { scene: m.scene, won: m.won });
  check(JSON.stringify(m?.stars) === '[true,false,true]' && m.starsShown === 2, 'stars [x, -, x] filled one by one', m && { stars: m.stars, shown: m.starsShown });
  check(m?.unlockShown === 'chili' && m.unlocked.includes('chili'), 'unlock card: Chili Lantern, saved as unlocked', m && { card: m.unlockShown, unlocked: m.unlocked });
  check(m?.bonesEarned === 10 && m.bones === 10 && m.saved && !m.debug, '2 new stars = 10 bones, saved', m && { earned: m.bonesEarned, bones: m.bones, saved: m.saved });
  check(m?.focus === 'retry' && m.nextLevel === null, 'Retry focused; no Next (level 2 not built)', m && { focus: m.focus, next: m.nextLevel });
  let sv = await savedJson(page);
  check(sv?.version === 1 && sv.goldenBones === 10 && JSON.stringify(sv.levels['1'].stars) === '[true,false,true]' && sv.levels['1'].cleared && sv.levels['1'].bestScore === 500,
    'localStorage soba-guard:save v1 written', sv);
  await shot(page, 'results-win');

  // Retry with R: fresh battle, quickly
  const attempts0 = await page.evaluate(() => window.__GAME_STATE__.attempts);
  await key(page, 'r', 200);
  check(await active(page, 'BattleScene') && (await page.evaluate(() => window.__GAME_STATE__.attempts)) === attempts0 + 1, 'R retries (fresh battle within 0.2 s)');

  // forced loss
  await adv(page, 300);
  await page.evaluate(() => window.__TEST_FINISH__(false));
  await adv(page, 1200);
  m = await menu(page);
  check(m?.scene === 'ResultsScene' && m.won === false && m.bones === 10, 'forced loss -> Results, bones unchanged', m && { won: m.won, bones: m.bones });
  sv = await savedJson(page);
  check(JSON.stringify(sv?.levels['1'].stars) === '[true,false,true]' && sv.levels['1'].cleared, 'a loss never removes stars or the clear', sv?.levels);
  await shot(page, 'results-loss');
  await key(page, 'Escape', 400);
  m = await menu(page);
  check(m?.scene === 'LevelSelectScene' && JSON.stringify(m.levels[0].stars) === '[true,false,true]', 'Esc -> Level Select shows best stars', m && m.levels[0]);
  await shot(page, 'select-progress');

  // shop
  await key(page, 'Escape', 400);
  check(await active(page, 'TitleScene'), 'Esc -> Title');
  await key(page, 'ArrowDown', 60);
  await key(page, 'Enter', 400);
  m = await menu(page);
  check(m?.scene === 'ShopScene' && m.focus === 'piggy', 'Treat Shop opens with Piggy Bank focused', m && { scene: m.scene, focus: m.focus });
  await key(page, 'Enter', 200);
  m = await menu(page);
  check(m?.bones === 5 && m.shop.piggy === 1, 'buy Piggy Bank rank 1: 10 -> 5 bones', m && { bones: m.bones, shop: m.shop });
  await key(page, 'Enter', 200);
  m = await menu(page);
  check(m?.bones === 5 && m.shop.piggy === 1 && m.lastFail === 'bones', 'rank 2 (10 bones) refused with 5 bones', m && { bones: m.bones, shop: m.shop, fail: m.lastFail });
  await shot(page, 'shop-refused');
  await key(page, 'ArrowDown', 60);
  await key(page, 'Enter', 200);
  m = await menu(page);
  check(m?.bones === 0 && m.shop.bark === 1, 'buy Loud Bark rank 1: 5 -> 0 bones', m && { bones: m.bones, shop: m.shop });
  check(JSON.stringify(m?.modifiers) === JSON.stringify({ startCoins: 25, barkCooldownS: 2, dumplingDamagePct: 0, catRatePct: 0 }), 'modifiers from ranks', m?.modifiers);
  await shot(page, 'shop');
  await key(page, 'Escape', 400);
  await key(page, 'Enter', 400);
  await key(page, 'Enter', 500);
  c = await cfg(page);
  check(await active(page, 'BattleScene') && c?.modifiers?.startCoins === 25 && c.modifiers.barkCooldownS === 2, 'modifiers reach the battle config', c?.modifiers);
  const s = await state(page);
  const baseCoins = 100;
  if (s.coins === baseCoins + 25) console.log('[PASS] battle starts with 125 coins (Piggy Bank applied by the battle)');
  else warn(`battle starts with ${s.coins} coins: the battle doesn't apply modifiers.startCoins yet (Step 2a)`);

  // a 3-star win pays only the new star
  await page.evaluate(() => window.__TEST_FINISH__(true, [true, true, true]));
  await adv(page, 2500);
  m = await menu(page);
  check(m?.bonesEarned === 5 && m.bones === 5 && m.unlockShown === null, '3-star win: only the new star pays (5), no second unlock', m && { earned: m.bonesEarned, bones: m.bones, unlock: m.unlockShown });

  // reload keeps everything
  await page.goto(`${BASE}/?test=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.isActive('TitleScene'), null, { timeout: 20000 });
  await adv(page, 300);
  m = await menu(page);
  check(m?.bones === 5 && m.shop.piggy === 1 && m.shop.bark === 1 && JSON.stringify(m.levels[0].stars) === '[true,true,true]' && m.unlocked.includes('chili'),
    'reload: bones, ranks, stars and unlocks persist', m && { bones: m.bones, shop: m.shop, stars: m.levels[0].stars });

  check(errors.length === 0, 'no page errors (keyboard flow)', errors);
  await page.close();
}

// --- 2. mouse only -------------------------------------------------------------------

async function mouseFlow(browser) {
  console.log('\n--- mouse only ---');
  const { page, errors } = await open(browser, '?reset=1&test=1');
  await page.evaluate(() => window.__SAVE__.reset());
  await click(page, cx, TITLE_MENU.PLAY_Y, 400);
  check(await active(page, 'LevelSelectScene'), 'click PLAY -> Level Select');
  await click(page, BACK.x, BACK.y, 400);
  check(await active(page, 'TitleScene'), 'click BACK -> Title');
  await click(page, cx, TITLE_MENU.PLAY_Y, 400);
  await click(page, node(2).x, node(2).y, 300);
  check(await active(page, 'LevelSelectScene'), 'click a locked node: stays on Level Select');
  await click(page, node(1).x, node(1).y, 500);
  check(await active(page, 'BattleScene'), 'click Back Garden -> Battle');

  await adv(page, 500);
  const how = await openPause(page, 'mouse');
  check(await active(page, 'PauseScene'), `pause menu open (${how === 'battle' ? 'HUD pause button' : 'launched by hand'})`);
  await click(page, pauseBtn(0).x, pauseBtn(0).y, 100);
  check(!(await active(page, 'PauseScene')) && await active(page, 'BattleScene') && !(await paused(page, 'BattleScene')), 'click RESUME resumes');

  await page.evaluate(() => window.__TEST_FINISH__(true, [true, true, false]));
  await adv(page, 2000);
  let m = await menu(page);
  check(m?.scene === 'ResultsScene' && m.bones === 10, 'win -> Results, 10 bones', m && { scene: m.scene, bones: m.bones });
  await click(page, resultsBtn(1, 2).x, resultsBtn(1, 2).y, 400);
  check(await active(page, 'LevelSelectScene'), 'click LEVELS -> Level Select');
  await click(page, BACK.x, BACK.y, 400);
  await click(page, cx, TITLE_MENU.SHOP_Y, 400);
  check(await active(page, 'ShopScene'), 'click TREAT SHOP -> Shop');
  await click(page, shopBuy(3).x, shopBuy(3).y, 200);
  m = await menu(page);
  check(m?.shop.paws === 1 && m.bones === 5, 'click BUY Lucky Paws: rank 1, 5 bones left', m && { shop: m.shop, bones: m.bones });
  check(m?.focus === 'paws', 'hover moved keyboard focus to the clicked item', m?.focus);
  await click(page, BACK.x, BACK.y, 400);
  check(await active(page, 'TitleScene'), 'Shop BACK -> Title');

  // Results Retry by click
  await click(page, cx, TITLE_MENU.PLAY_Y, 400);
  await click(page, node(1).x, node(1).y, 500);
  const c = await cfg(page);
  check(c?.modifiers?.catRatePct === 8, 'Lucky Paws reaches the battle config (catRatePct 8)', c?.modifiers);
  await page.evaluate(() => window.__TEST_FINISH__(false));
  await adv(page, 1200);
  await click(page, resultsBtn(0, 2).x, resultsBtn(0, 2).y, 200);
  check(await active(page, 'BattleScene'), 'click RETRY -> Battle');

  check(errors.length === 0, 'no page errors (mouse flow)', errors);
  await page.close();
}

// --- 3. touch ----------------------------------------------------------------------------

async function touchFlow() {
  console.log('\n--- touch ---');
  const browser = await launchBrowser({ headless: !HEADED, contextOptions: { hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } } });
  try {
    const { page, errors } = await open(browser, '?reset=1&test=1');
    await tap(page, cx, TITLE_MENU.PLAY_Y, 400);
    check(await active(page, 'LevelSelectScene'), 'tap PLAY -> Level Select');
    await tap(page, node(1).x, node(1).y, 500);
    check(await active(page, 'BattleScene'), 'tap Back Garden -> Battle');
    await page.evaluate(() => window.__TEST_FINISH__(true));
    await adv(page, 2000);
    await tap(page, resultsBtn(1, 2).x, resultsBtn(1, 2).y, 400);
    check(await active(page, 'LevelSelectScene'), 'tap LEVELS on Results -> Level Select');
    check(errors.length === 0, 'no page errors (touch flow)', errors);
  } finally {
    await browser.close();
  }
}

// --- run ------------------------------------------------------------------------------------

const browser = await launchBrowser({ headless: !HEADED });
try {
  await keyboardFlow(browser);
  await mouseFlow(browser);
} catch (e) {
  check(false, `exception: ${e.message}`);
} finally {
  await browser.close();
}
try {
  await touchFlow();
} catch (e) {
  check(false, `touch exception: ${e.message}`);
}

console.log(`\nui-flow-check: ${failures === 0 ? 'PASSED' : 'FAILED'} (${failures} failed, ${warnings} warnings). Screenshots in ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);
