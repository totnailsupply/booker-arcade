#!/usr/bin/env node
// =============================================================================
// ability-check.mjs — browser check of Soba's abilities and the unit tools.
//
// Runs the real game in headless Chromium on the deterministic test clock
// (window.advanceTime) and drives it with real key presses and canvas taps:
//   1. Soba moves rows by a porch tap and by F (to the keyboard cursor's row)
//   2. Bark knocks a lid off and stuns + pushes back critters near the porch
//   3. Zoomies (meter filled by the test) damages every critter in her row
//   4. Upgrade (U + Space, and the top-bar button + a tap) and Recall (X +
//      Space) change coins by exactly the cost / refund
//
//   node scripts/ability-check.mjs [--url http://localhost:3003] [--headed]
// Exit 0 = all pass. Uses launchBrowser() (scripts/lib/browser.mjs).
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';

const args = { url: 'http://localhost:3003', headed: false };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--url') args.url = process.argv[++i];
  else if (process.argv[i] === '--headed') args.headed = true;
}

const GRID = { X: 112, Y: 84, TILE: 40 };
const PORCH_X = 92;
const FRAME_MS = 1000 / 60;
let failures = 0;

function check(ok, msg, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures += 1;
}

async function state(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function step(page, seconds) {
  await page.evaluate((ms) => window.advanceTime(ms), seconds * 1000);
}

/** Steps until pred(state) is true (checks every 0.1 s). */
async function stepUntil(page, pred, maxSeconds) {
  for (let t = 0; t < maxSeconds; t += 0.1) {
    const s = await state(page);
    if (pred(s)) return s;
    await step(page, 0.1);
  }
  return null;
}

async function press(page, key) {
  await page.keyboard.press(key);
  await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 2);
}

/** Taps a game coordinate (640x360 space) on the canvas. */
async function tap(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x / 640) * box.width, box.y + (y / 360) * box.height);
  await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 2);
}

async function moveCursorTo(page, row, col) {
  const s = await state(page);
  let { row: r, col: c } = s.cursor;
  // the first arrow press turns the keyboard cursor on without moving it far
  while (r < row) { await press(page, 'ArrowDown'); r += 1; }
  while (r > row) { await press(page, 'ArrowUp'); r -= 1; }
  while (c < col) { await press(page, 'ArrowRight'); c += 1; }
  while (c > col) { await press(page, 'ArrowLeft'); c -= 1; }
  const after = await state(page);
  if (after.cursor.row !== row || after.cursor.col !== col) {
    // the first press only switches to the keyboard cursor: one more pass
    return moveCursorTo(page, row, col);
  }
  return after;
}

async function openBattle(page, query) {
  await page.goto(`${args.url}/?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.scene?.isActive('BattleScene'), null, { timeout: 20000 });
  await step(page, 0.2);
  await page.evaluate(() => {
    window.__coinLog = [];
    window.__EVENT_BUS__.on('sim:coin_collect', (e) => window.__coinLog.push(e.value));
  });
}

async function collectedSince(page) {
  return page.evaluate(() => {
    const sum = window.__coinLog.reduce((a, v) => a + v, 0);
    window.__coinLog = [];
    return sum;
  });
}

async function main() {
  const browser = await launchBrowser({ headless: !args.headed });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    // ---- 1 + 2: Soba moves, bark strips a lid and stuns -------------------------
    // Wave 4 (2 rats + 1 lid rat), nothing placed, so the lid rat walks up to the porch.
    await openBattle(page, 'skip=1&wave=4&coins=1000');
    let s = await state(page);
    check(s.soba && s.soba.row === 2 && s.soba.state === 'idle', 'Soba starts idle on the porch, row 2', JSON.stringify(s.soba));

    // F moves her to the keyboard cursor's row
    await moveCursorTo(page, 0, 3);
    await press(page, 'KeyF');
    s = await state(page);
    check(s.soba.targetRow === 0 && s.soba.state === 'run', 'F sends Soba to the cursor row (running)', `target ${s.soba.targetRow}, state ${s.soba.state}`);
    await step(page, 1.0);
    s = await state(page);
    check(s.soba.row === 0 && !s.soba.moving, 'Soba arrives in row 0 (160 px/s)', `row ${s.soba.row}`);

    // wait for the lid rat to step into bark range (front within 4 tiles of the porch)
    s = await stepUntil(page, (st) => st.enemies.some(e => e.key === 'lidrat' && e.lid > 0 && e.x - 10 <= st.soba.barkRangeX - 4), 90);
    check(!!s, 'a lid rat walks into bark range');
    const lr = s.enemies.find(e => e.key === 'lidrat' && e.lid > 0);
    // a tap on the porch cell of its row moves Soba there
    await tap(page, PORCH_X, GRID.Y + lr.row * GRID.TILE + GRID.TILE / 2);
    s = await state(page);
    check(s.soba.targetRow === lr.row, 'a porch tap sends Soba to the lid rat row', `target ${s.soba.targetRow}, lid rat row ${lr.row}`);
    await step(page, 1.1);
    s = await state(page);
    check(s.soba.row === lr.row, 'Soba arrives in the tapped row', `row ${s.soba.row}`);
    const before = s.enemies.find(e => e.key === 'lidrat' && e.row === lr.row);
    await press(page, 'KeyB');
    s = await state(page);
    const after = s.enemies.find(e => e.key === 'lidrat' && e.row === lr.row);
    check(after && after.lid === 0, 'Bark knocks the lid off', `lid ${before?.lid} -> ${after?.lid}`);
    check(after && after.stunned && after.state === 'stunned', 'Bark stuns the lid rat', JSON.stringify(after));
    check(after && after.x - before.x >= 20, 'Bark pushes it back about 24 px', `x ${before?.x} -> ${after?.x}`);
    check(s.soba.barkCooldown > 17 && s.soba.state === 'bark', 'Bark starts its 18 s cooldown (bark frames)', `cooldown ${s.soba.barkCooldown}, state ${s.soba.state}`);
    await step(page, 1.0);
    const still = (await state(page)).enemies.find(e => e.key === 'lidrat' && e.row === lr.row);
    check(still && still.x >= after.x - 1, 'a stunned critter does not move', `x ${after?.x} -> ${still?.x}`);
    await press(page, 'KeyB');
    s = await state(page);
    check(s.soba.barks === 1, 'a second bark during the cooldown does nothing', `barks ${s.soba.barks}`);
    await step(page, 2.0);
    const freed = (await state(page)).enemies.find(e => e.key === 'lidrat' && e.row === lr.row);
    check(freed && !freed.stunned && freed.x < after.x, 'the stun wears off after 2.5 s', `x ${after?.x} -> ${freed?.x}`);

    // ---- 3: Zoomies ---------------------------------------------------------------
    const target = (await state(page)).enemies.filter(e => e.x < 470);
    const zRow = target.length ? target[0].row : lr.row;
    await tap(page, PORCH_X, GRID.Y + zRow * GRID.TILE + GRID.TILE / 2);
    await step(page, 1.1);
    await press(page, 'KeyZ');
    s = await state(page);
    check(s.soba.zoomiesUsed === 0, 'Zoomies need a full meter', `meter ${s.soba.zoomiesMeter}`);
    // fill the meter (12 kills is a long wait; the test sets it)
    await page.evaluate(() => { window.__GAME__.scene.getScene('BattleScene').battle.soba.zoomiesMeter = 12; });
    const rowBefore = (await state(page)).enemies.filter(e => e.row === zRow && e.x - 10 <= 472);
    const killsBefore = (await state(page)).kills;
    await press(page, 'KeyZ');
    s = await state(page);
    check(s.soba.state === 'zoomies' && s.soba.zoomiesMeter === 0, 'Z starts the zoomies and empties the meter', `state ${s.soba.state}`);
    await step(page, 1.3);
    s = await state(page);
    const rowAfter = s.enemies.filter(e => e.row === zRow);
    // each critter in the row either took >= 150 or died
    const dealt = rowBefore.map(b => {
      const a = rowAfter.find(e => e.key === b.key && Math.abs(e.x - b.x) < 40);
      return a ? (b.hp + b.lid) - (a.hp + a.lid) : 'killed';
    });
    check(rowBefore.length > 0 && dealt.every(d => d === 'killed' || d >= 150),
      'Zoomies damage every critter in the row (150 each)', `row ${zRow}: hp+lid before ${JSON.stringify(rowBefore.map(e => e.hp + e.lid))}, dealt ${JSON.stringify(dealt)}`);
    check(s.soba.x === 92 && s.soba.state !== 'zoomies', 'Soba is back on the porch after 1.2 s', `x ${s.soba.x}`);

    // ---- 4: Upgrade and Recall ------------------------------------------------------
    await openBattle(page, 'skip=1&wave=1&coins=1000');
    await moveCursorTo(page, 1, 4);
    let c0 = (await state(page)).coins;
    await collectedSince(page);
    await press(page, 'Digit1');
    await press(page, 'Space');
    s = await state(page);
    let got = await collectedSince(page);
    check(s.units.length === 1 && s.coins === c0 - 50 + got, 'placing a Lucky Cat costs 50', `coins ${c0} -> ${s.coins}`);
    c0 = s.coins;
    await press(page, 'KeyU');
    s = await state(page);
    check(s.tool === 'upgrade', 'U selects the Upgrade tool', `tool ${s.tool}`);
    await press(page, 'Space');
    s = await state(page);
    got = await collectedSince(page);
    check(s.units[0].tier === 2 && s.coins === c0 - 75 + got, 'Upgrade: tier 2 for 75 coins', `tier ${s.units[0].tier}, coins ${c0} -> ${s.coins}`);
    check(s.tool === null, 'the tool turns off after use');
    c0 = s.coins;
    await press(page, 'KeyU');
    await press(page, 'Space');
    s = await state(page);
    got = await collectedSince(page);
    check(s.units[0].tier === 2 && s.coins === c0 + got, 'a second upgrade is refused (max tier)', `coins ${c0} -> ${s.coins}`);
    await press(page, 'Escape');
    c0 = s.coins;
    await press(page, 'KeyX');
    await press(page, 'Space');
    s = await state(page);
    got = await collectedSince(page);
    check(s.units.length === 0 && s.coins === c0 + 62 + got, 'Recall refunds 50% of 125 paid (62)', `coins ${c0} -> ${s.coins}`);
    check(s.unitsLost === 0, 'a recalled unit does not count as lost');

    // mouse: card, tile tap; Upgrade button, tile tap
    await tap(page, 76 + 48 + 22, 28);  // card 2: steamer
    s = await state(page);
    check(s.selectedCard === 'steamer', 'tapping card 2 selects the steamer', `selected ${s.selectedCard}`);
    c0 = s.coins;
    await collectedSince(page);
    await tap(page, GRID.X + 2 * GRID.TILE + 20, GRID.Y + 3 * GRID.TILE + 20);
    s = await state(page);
    got = await collectedSince(page);
    check(s.units.some(u => u.key === 'steamer' && u.row === 3 && u.col === 2) && s.coins === c0 - 100 + got, 'tapping a tile places it (100)', `coins ${c0} -> ${s.coins}`);
    c0 = s.coins;
    await tap(page, 452 + 22, 28);       // Upgrade tool button
    s = await state(page);
    check(s.tool === 'upgrade', 'the top-bar Upgrade button selects the tool');
    await tap(page, GRID.X + 2 * GRID.TILE + 20, GRID.Y + 3 * GRID.TILE + 20);
    s = await state(page);
    got = await collectedSince(page);
    const st = s.units.find(u => u.key === 'steamer');
    check(st && st.tier === 2 && st.paid === 225 && s.coins === c0 - 125 + got, 'tap-upgrading the steamer costs 125 (burst)', `coins ${c0} -> ${s.coins}`);
    await tap(page, 500 + 22, 28);       // Recall tool button
    c0 = (await state(page)).coins;
    await tap(page, GRID.X + 2 * GRID.TILE + 20, GRID.Y + 3 * GRID.TILE + 20);
    s = await state(page);
    got = await collectedSince(page);
    check(!s.units.some(u => u.key === 'steamer') && s.coins === c0 + 112 + got, 'tap-recalling it refunds 112 (50% of 225)', `coins ${c0} -> ${s.coins}`);
  } catch (e) {
    check(false, `script error: ${e.message}`);
  }

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nability-check: ${failures} FAILED` : '\nability-check: ALL PASS');
  process.exit(failures ? 1 : 0);
}

main();
