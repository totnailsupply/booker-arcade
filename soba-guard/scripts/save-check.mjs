#!/usr/bin/env node
// =============================================================================
// save-check.mjs — SaveData robustness (localStorage `soba-guard:save`, v1).
//
//   1. A save survives a reload (bones, stars, shop ranks, unlocks).
//   2. Blocked localStorage (getter throws) and a full disk (setItem throws)
//      don't crash: the game runs and the save lives in memory.
//   3. Corrupt JSON, a foreign version and out-of-range fields reset or clamp
//      cleanly, and the next write is valid v1 JSON.
//   4. Debug runs never write: a real ?wave=10 debug battle played to its end,
//      a Results screen with result.debug, and one whose config is a debug run.
//
// Usage: node scripts/save-check.mjs [--url http://localhost:3003]
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--url');
const BASE = i >= 0 ? args[i + 1] : `http://localhost:${process.env.PORT || 3003}`;
const KEY = 'soba-guard:save';

let failures = 0;
const check = (ok, msg, extra) => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ''}`);
  if (!ok) failures++;
};

async function boot(page, query) {
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.isBooted && window.__GAME__.scene.getScenes(true).some(s => !['BootScene', 'PreloadScene'].includes(s.scene.key)),
    null, { timeout: 20000 });
  await page.evaluate(() => window.advanceTime(300));
}
const menu = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text())).menu || null;
const raw = (page) => page.evaluate((k) => { try { return localStorage.getItem(k); } catch { return 'BLOCKED'; } }, KEY);

function track(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

async function finish(page, won, stars) {
  await page.evaluate(([w, s]) => window.__TEST_FINISH__(w, s), [won, stars]);
  await page.evaluate(() => window.advanceTime(2000));
}

const browser = await launchBrowser();
try {
  // --- 1. survives reload -------------------------------------------------------
  console.log('\n--- persistence ---');
  {
    const page = await browser.newPage();
    const errors = track(page);
    await boot(page, '?reset=1&test=1');
    check((await raw(page)) === null, '?reset=1 clears the save');
    await finish(page, true, [true, true, false]);
    await page.evaluate(() => window.__SAVE__.buy('steam'));
    await boot(page, '?test=1');
    const m = await menu(page);
    check(m?.bones === 5 && m.shop.steam === 1 && JSON.stringify(m.levels[0].stars) === '[true,true,false]' && m.levels[0].cleared && m.unlocked.includes('chili'),
      'after reload: 10 bones - 5 spent, Hot Steam 1, stars, clear, Chili unlocked', m && { bones: m.bones, shop: m.shop, l1: m.levels[0], unlocked: m.unlocked });
    const json = JSON.parse(await raw(page));
    check(json.version === 1 && Array.isArray(json.unlockedUnits) && json.muted === false, 'stored JSON is version 1 with every field', json);
    check(errors.length === 0, 'no errors', errors);
    await page.close();
  }

  // --- 2. blocked storage ----------------------------------------------------------
  console.log('\n--- blocked storage ---');
  {
    const page = await browser.context.newPage(); // the init script below only affects this page
    const errors = track(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
    await boot(page, '?test=1');
    let m = await menu(page);
    check(m?.scene === 'TitleScene' && m.storage === 'blocked', 'localStorage getter throws: title loads, storage reported blocked', m && { scene: m.scene, storage: m.storage });
    await finish(page, true, [true, false, false]);
    m = await menu(page);
    check(m?.scene === 'ResultsScene' && m.bones === 5 && m.saved, 'a win still pays bones (in-memory save)', m && { bones: m.bones, saved: m.saved });
    const buy = await page.evaluate(() => window.__SAVE__.buy('piggy'));
    check(buy.ok && buy.bones === 0, 'shop purchase works in memory', buy);
    check(errors.length === 0, 'no errors with blocked storage', errors);
    await page.close();
  }
  {
    const page = await browser.context.newPage();
    const errors = track(page);
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    });
    await boot(page, '?reset=1&test=1');
    await finish(page, true, [true, true, true]);
    const m = await menu(page);
    check(m?.bones === 15 && m.storage === 'blocked', 'setItem throws (quota): win recorded in memory, storage flagged', m && { bones: m.bones, storage: m.storage });
    check(errors.length === 0, 'no errors when setItem throws', errors);
    await page.close();
  }

  // --- 3. corrupt data ----------------------------------------------------------------
  console.log('\n--- corrupt data ---');
  {
    const page = await browser.newPage();
    const errors = track(page);
    const cases = [
      ['{not json', 'corrupt JSON'],
      [JSON.stringify({ version: 99, goldenBones: 500 }), 'unknown version'],
      ['null', 'JSON null'],
      [JSON.stringify([1, 2, 3]), 'an array'],
    ];
    for (const [bad, label] of cases) {
      await boot(page, '?test=1');
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, bad]);
      await boot(page, '?test=1');
      const m = await menu(page);
      const now = await raw(page);
      let parsed = null;
      try { parsed = JSON.parse(now); } catch { /* checked below */ }
      check(m?.bones === 0 && m.shop.piggy === 0 && m.levels[0].cleared === false, `${label}: resets to a clean save`, m && { bones: m.bones });
      check(parsed && parsed.version === 1, `${label}: storage rewritten as valid v1 JSON`, now);
    }
    // well-formed but out of range: clamp, keep the rest
    await page.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({
      version: 1, goldenBones: -5, shop: { piggy: 99, bark: 'x', steam: 2 }, levels: { 1: { cleared: true, stars: [true, 'yes', 0, true], bestScore: 'big' }, foo: {} },
      unlockedUnits: ['chili', 42], muted: 1,
    })), [KEY]);
    await boot(page, '?test=1');
    const m = await menu(page);
    check(m?.bones === 0 && m.shop.piggy === 3 && m.shop.bark === 0 && m.shop.steam === 2, 'out-of-range fields clamp (bones >= 0, rank <= 3)', m && { bones: m.bones, shop: m.shop });
    check(JSON.stringify(m?.levels[0].stars) === '[true,true,false]' && m.levels[0].bestScore === 0 && m.unlocked.includes('chili') && m.unlocked.includes('luckycat'),
      'levels and unlocks sanitised (starter units always kept)', m && { l1: m.levels[0], unlocked: m.unlocked });
    check(errors.length === 0, 'no errors with corrupt saves', errors);
    await page.close();
  }

  // --- 4. debug runs never write --------------------------------------------------------
  console.log('\n--- debug runs ---');
  {
    const page = await browser.newPage();
    const errors = track(page);
    await boot(page, '?reset=1&test=1');
    await finish(page, true, [true, false, false]);
    const before = await raw(page);
    check(before && JSON.parse(before).goldenBones === 5, 'baseline save written (5 bones)', before);

    // a real debug battle (?wave=10, nobody defends) played to the end
    await boot(page, '?wave=10');
    const cfg = await page.evaluate(() => window.__GAME_STATE__.battleConfig);
    check(cfg?.debugRun === true, '?wave=10 is a debug run', cfg);
    let reached = false;
    for (let k = 0; k < 60 && !reached; k++) {
      await page.evaluate(() => window.advanceTime(5000));
      reached = await page.evaluate(() => window.__GAME__.scene.isActive('ResultsScene'));
    }
    check(reached, 'debug battle reached Results');
    let m = await menu(page);
    check(m?.debug === true && m.saved === false, 'Results marks it as a debug run, not saved', m && { debug: m.debug, saved: m.saved });
    check((await raw(page)) === before, 'storage unchanged after a debug battle');

    // a Results screen fed a debug result (as BattleScene reports it)
    await page.evaluate(() => {
      const g = window.__GAME__;
      g.scene.getScenes(true).forEach(s => g.scene.stop(s.scene.key));
      g.scene.start('ResultsScene', { result: { levelNumber: 1, levelName: 'Back Garden', won: true, score: 9999, stars: [true, true, true], unlocks: ['chili'], debug: true } });
    });
    await page.evaluate(() => window.advanceTime(1500));
    m = await menu(page);
    check(m?.scene === 'ResultsScene' && m.debug && !m.saved, 'result.debug = true: not saved', m && { debug: m.debug, saved: m.saved });
    check((await raw(page)) === before, 'storage unchanged after a debug result');
    check(errors.length === 0, 'no errors in debug runs', errors);
    await page.close();
  }
} catch (e) {
  check(false, `exception: ${e.stack || e.message}`);
} finally {
  await browser.close();
}

console.log(`\nsave-check: ${failures === 0 ? 'PASSED' : 'FAILED'} (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
