// Slots ("Golden Paw") logic tests: node --test scripts/test/slots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/Rng.js';
import {
  evaluateLine, evaluateGrid, countScatters, freeSpinsFor, gridFromStops, randomStops,
  spinOutcome, playRound, exactLineEV, scatterDistribution, totalBetFor, allowedLineBets,
} from '../../src/games/slots/logic.js';
import {
  STRIPS, PAYTABLE, SCATTER_PAYS, LINES, REELS, ROWS, SYMBOLS, WILD, SCATTER,
  FREE_SPINS_AWARD, FREE_SPINS_CAP, LINE_BETS,
} from '../../src/games/slots/config.js';

/** Build a grid from 3 row strings of 5 symbol ids (rows top..bottom). */
function g(top, mid, bot) {
  return [0, 1, 2, 3, 4].map(r => [top[r], mid[r], bot[r]]);
}
const FILL = ['bowl', 'hydrant', 'ball', 'bone', 'soba'];
/** A grid with nothing on any line except what the middle row says. */
function midGrid(mid) {
  // top and bottom rows alternate symbols that never form 3-in-a-row with anything
  return g(['bowl', 'hydrant', 'bowl', 'hydrant', 'bowl'], mid, ['hydrant', 'bowl', 'hydrant', 'bowl', 'hydrant']);
}

test('config: 10 lines over 5 reels x 3 rows, strips 30-40 stops, every symbol on every reel', () => {
  assert.equal(LINES.length, 10);
  for (const l of LINES) {
    assert.equal(l.length, REELS);
    for (const row of l) assert.ok(row >= 0 && row < ROWS);
  }
  assert.equal(new Set(LINES.map(l => l.join())).size, 10, 'lines are distinct');
  assert.equal(STRIPS.length, REELS);
  for (const s of STRIPS) {
    assert.ok(s.length >= 30 && s.length <= 40, `strip length ${s.length}`);
    for (const sym of SYMBOLS) assert.ok(s.includes(sym), `${sym} on every reel`);
    for (const sym of s) assert.ok(SYMBOLS.includes(sym), `unknown symbol ${sym}`);
    // scatters >= ROWS apart (cyclic) so a window never shows two
    const idx = s.map((x, i) => (x === SCATTER ? i : -1)).filter(i => i >= 0);
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const d = Math.abs(idx[a] - idx[b]);
      assert.ok(Math.min(d, s.length - d) >= ROWS);
    }
  }
});

test('line: 3/4/5 of a kind left to right pay the table', () => {
  assert.deepEqual(evaluateLine(['bone', 'bone', 'bone', 'ball', 'bowl']), { symbol: 'bone', count: 3, mult: PAYTABLE.bone[3] });
  assert.deepEqual(evaluateLine(['soba', 'soba', 'soba', 'soba', 'bowl']), { symbol: 'soba', count: 4, mult: PAYTABLE.soba[4] });
  assert.deepEqual(evaluateLine(['booker', 'booker', 'booker', 'booker', 'booker']), { symbol: 'booker', count: 5, mult: PAYTABLE.booker[5] });
  assert.equal(evaluateLine(['bone', 'bone', 'ball', 'bone', 'bone']), null, '2 of a kind pays nothing');
});

test('line: left to right only (no right-to-left, no gaps)', () => {
  assert.equal(evaluateLine(['ball', 'bowl', 'bone', 'bone', 'bone']), null);
  assert.equal(evaluateLine(['bone', 'ball', 'bone', 'bone', 'bone']), null);
});

test('line: wild substitutes for any symbol except the scatter', () => {
  assert.deepEqual(evaluateLine(['bone', 'wild', 'bone', 'ball', 'ball']), { symbol: 'bone', count: 3, mult: PAYTABLE.bone[3] });
  assert.deepEqual(evaluateLine(['wild', 'bone', 'bone', 'bone', 'ball']), { symbol: 'bone', count: 4, mult: PAYTABLE.bone[4] });
  assert.deepEqual(evaluateLine(['bowl', 'wild', 'wild', 'wild', 'wild']), { symbol: 'bowl', count: 5, mult: PAYTABLE.bowl[5] });
  // scatter breaks a line; wilds do not substitute for it
  assert.equal(evaluateLine(['scatter', 'wild', 'wild', 'bone', 'bone']), null);
  assert.equal(evaluateLine(['bone', 'wild', 'scatter', 'bone', 'bone']), null);
});

test('line: wild-only lines pay the wild table', () => {
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'bowl', 'ball']), { symbol: 'wild', count: 3, mult: PAYTABLE.wild[3] });
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'wild', 'wild']), { symbol: 'wild', count: 5, mult: PAYTABLE.wild[5] });
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'wild', 'scatter']), { symbol: 'wild', count: 4, mult: PAYTABLE.wild[4] });
});

test('line: highest win per line only', () => {
  // 3 wilds (50) vs 5 bowls with the wilds (60): the bowls win
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'bowl', 'bowl']), { symbol: 'bowl', count: 5, mult: PAYTABLE.bowl[5] });
  // 4 wilds (250) vs 5 bones (150): the wilds win
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'wild', 'bone']), { symbol: 'wild', count: 4, mult: PAYTABLE.wild[4] });
  // 3 wilds (50) vs 4 bowls (15): wilds
  assert.deepEqual(evaluateLine(['wild', 'wild', 'wild', 'bowl', 'ball']), { symbol: 'wild', count: 3, mult: 50 });
  // the grid only books one win per line
  const grid = midGrid(['wild', 'wild', 'wild', 'bowl', 'bowl']);
  const ev = evaluateGrid(grid, { lineBet: 1 });
  assert.equal(ev.lines.filter(l => l.line === 1).length, 1);
});

test('grid: line pays scale with line bet; cells list the winning positions', () => {
  const grid = midGrid(['bone', 'bone', 'bone', 'soba', 'ball']);
  const ev = evaluateGrid(grid, { lineBet: 5 });
  const l1 = ev.lines.find(l => l.line === 1);
  assert.ok(l1);
  assert.equal(l1.pay, PAYTABLE.bone[3] * 5);
  assert.deepEqual(l1.cells, [[0, 1], [1, 1], [2, 1]]);
  assert.equal(ev.win, ev.lineWin + ev.scatterPay);
  assert.equal(ev.lineWin, ev.lines.reduce((a, l) => a + l.pay, 0));
});

test('scatters count anywhere and pay on the total bet', () => {
  const grid = g(
    ['scatter', 'bowl', 'hydrant', 'bowl', 'hydrant'],
    ['bone', 'ball', 'scatter', 'ball', 'bone'],
    ['hydrant', 'bowl', 'bowl', 'hydrant', 'scatter'],
  );
  const sc = countScatters(grid);
  assert.equal(sc.count, 3);
  assert.deepEqual(sc.cells, [[0, 0], [2, 1], [4, 2]]);
  const ev = evaluateGrid(grid, { lineBet: 2 });
  assert.equal(ev.scatters, 3);
  assert.equal(ev.scatterPay, SCATTER_PAYS[3] * totalBetFor(2));
  assert.equal(ev.freeSpins, FREE_SPINS_AWARD);
  const two = evaluateGrid(g(
    ['scatter', 'bowl', 'hydrant', 'bowl', 'hydrant'],
    ['bone', 'ball', 'scatter', 'ball', 'bone'],
    ['hydrant', 'bowl', 'bowl', 'hydrant', 'ball'],
  ));
  assert.equal(two.scatterPay, 0);
  assert.equal(two.freeSpins, 0);
});

test('free spins: award 8 on 3+, retrigger allowed, total capped at 50', () => {
  assert.equal(freeSpinsFor(2, 0), 0);
  assert.equal(freeSpinsFor(3, 0), 8);
  assert.equal(freeSpinsFor(5, 0), 8);
  assert.equal(freeSpinsFor(3, 8), 8, 'retrigger');
  assert.equal(freeSpinsFor(3, 48), 2, 'cap trims the award');
  assert.equal(freeSpinsFor(4, FREE_SPINS_CAP), 0, 'cap reached');
  // a bonus where every free spin retriggers stops at the cap
  const allScatter = g(
    ['scatter', 'scatter', 'scatter', 'bowl', 'hydrant'],
    ['bone', 'ball', 'bone', 'ball', 'bone'],
    ['hydrant', 'bowl', 'bowl', 'hydrant', 'ball'],
  );
  let left = 8, awarded = 8, played = 0;
  while (left > 0 && played < 1000) {
    const ev = evaluateGrid(allScatter, { free: true, awardedSoFar: awarded });
    left += ev.freeSpins - 1;
    awarded += ev.freeSpins;
    played++;
  }
  assert.equal(awarded, FREE_SPINS_CAP);
  assert.equal(played, FREE_SPINS_CAP);
});

test('free spins: every win x2 (lines and scatters)', () => {
  const grid = g(
    ['scatter', 'bowl', 'hydrant', 'bowl', 'hydrant'],
    ['bone', 'bone', 'bone', 'scatter', 'ball'],
    ['hydrant', 'bowl', 'bowl', 'hydrant', 'scatter'],
  );
  const base = evaluateGrid(grid, { lineBet: 2 });
  const free = evaluateGrid(grid, { lineBet: 2, free: true });
  assert.ok(base.win > 0);
  assert.equal(free.win, base.win * 2);
  assert.equal(free.scatterPay, base.scatterPay * 2);
  assert.equal(free.multiplier, 2);
});

test('grid from stops wraps around the strips', () => {
  const stops = STRIPS.map(s => s.length - 1);
  const grid = gridFromStops(stops);
  for (let r = 0; r < REELS; r++) {
    const s = STRIPS[r];
    assert.deepEqual(grid[r], [s[s.length - 1], s[0], s[1]]);
  }
  const g0 = gridFromStops([0, 0, 0, 0, 0]);
  for (let r = 0; r < REELS; r++) assert.deepEqual(g0[r], STRIPS[r].slice(0, 3));
});

test('determinism: same seed -> same stops, grids and wins', () => {
  const a = new Rng(99), b = new Rng(99);
  for (let i = 0; i < 200; i++) {
    const x = spinOutcome(a, { lineBet: 2 });
    const y = spinOutcome(b, { lineBet: 2 });
    assert.deepEqual(x.stops, y.stops);
    assert.equal(x.win, y.win);
  }
  const r1 = new Rng('x'), r2 = new Rng('x');
  for (let i = 0; i < 300; i++) assert.deepEqual(playRound(r1, 1), playRound(r2, 1));
  const st = randomStops(new Rng(5));
  st.forEach((v, r) => assert.ok(v >= 0 && v < STRIPS[r].length));
});

test('every paytable entry is reachable on the strips (exact line math)', () => {
  const { contrib } = exactLineEV();
  for (const [sym, pays] of Object.entries(PAYTABLE)) {
    for (const n of [3, 4, 5]) {
      assert.ok(pays[n] > 0, `${sym} x${n} has a pay`);
      assert.ok((contrib[`${sym}x${n}`] || 0) > 0, `${sym} x${n} reachable`);
    }
  }
  const sd = scatterDistribution();
  for (const n of [3, 4, 5]) assert.ok(sd[n] > 0, `${n} scatters reachable`);
  assert.ok(Math.abs(sd.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('exact line EV matches a brute-force sample of stops', () => {
  const { ev } = exactLineEV();
  // per-line value x 10 lines x line bet 1 = expected line win per 10-chip spin
  const rng = new Rng(3);
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) sum += spinOutcome(rng, { lineBet: 1 }).lineWin;
  const sim = sum / N / 10;
  assert.ok(Math.abs(sim - ev) < 0.03, `sim ${sim.toFixed(4)} vs exact ${ev.toFixed(4)}`);
});

test('bet helpers: total = 10 lines x line bet, capped line bets', () => {
  assert.equal(totalBetFor(1), 10);
  assert.equal(totalBetFor(250), 2500);
  assert.deepEqual(allowedLineBets(100), [1, 2, 5, 10]);
  assert.deepEqual(allowedLineBets(2500), LINE_BETS);
  assert.deepEqual(allowedLineBets(5), [1], 'always at least the smallest');
});

test('wild never counts as a scatter; scatter never pays on a line', () => {
  const grid = midGrid(['scatter', 'scatter', 'scatter', 'scatter', 'scatter']);
  const ev = evaluateGrid(grid, { lineBet: 1 });
  assert.equal(ev.lines.find(l => l.line === 1), undefined);
  assert.equal(ev.scatters, 5);
  assert.equal(ev.scatterPay, SCATTER_PAYS[5] * 10);
  assert.equal(countScatters(midGrid([WILD, WILD, WILD, WILD, WILD])).count, 0);
});
