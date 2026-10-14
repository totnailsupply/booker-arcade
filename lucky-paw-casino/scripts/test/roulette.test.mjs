// Roulette rules (src/games/roulette/logic.js): wheel, colours, every bet against
// every result, settlement sums, determinism and pocket uniformity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WHEEL_ORDER, POCKETS, RED_NUMBERS, colorOf, pocketIndex, BETS, BET_IDS, betById, covers,
  returnFor, settleBets, spinResult, winningBets, describe, exactRtp, totalOf,
} from '../../src/games/roulette/logic.js';
import { Rng } from '../../src/core/Rng.js';

const REAL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// Independent oracle: what each bet covers, written from the table rules.
function oracle(id, n) {
  if (/^\d+$/.test(id)) return { wins: Number(id) === n, payout: 35 };
  if (n === 0) return { wins: false, payout: ['dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3'].includes(id) ? 2 : 1 };
  switch (id) {
    case 'red': return { wins: REDS.has(n), payout: 1 };
    case 'black': return { wins: !REDS.has(n), payout: 1 };
    case 'odd': return { wins: n % 2 === 1, payout: 1 };
    case 'even': return { wins: n % 2 === 0, payout: 1 };
    case 'low': return { wins: n >= 1 && n <= 18, payout: 1 };
    case 'high': return { wins: n >= 19 && n <= 36, payout: 1 };
    case 'dozen1': return { wins: n >= 1 && n <= 12, payout: 2 };
    case 'dozen2': return { wins: n >= 13 && n <= 24, payout: 2 };
    case 'dozen3': return { wins: n >= 25 && n <= 36, payout: 2 };
    case 'col1': return { wins: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(n), payout: 2 };
    case 'col2': return { wins: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(n), payout: 2 };
    case 'col3': return { wins: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(n), payout: 2 };
    default: throw new Error(`oracle: unknown bet ${id}`);
  }
}

test('wheel has the 37 European pockets in the real order', () => {
  assert.equal(POCKETS, 37);
  assert.deepEqual([...WHEEL_ORDER], REAL_ORDER);
  assert.equal(new Set(WHEEL_ORDER).size, 37);
  for (let n = 0; n <= 36; n++) {
    assert.ok(WHEEL_ORDER.includes(n), `pocket ${n} present`);
    assert.equal(WHEEL_ORDER[pocketIndex(n)], n);
  }
});

test('colour map: 0 green, 18 red, 18 black, standard reds', () => {
  assert.equal(colorOf(0), 'green');
  assert.deepEqual([...RED_NUMBERS].sort((a, b) => a - b), [...REDS].sort((a, b) => a - b));
  let red = 0, black = 0;
  for (let n = 1; n <= 36; n++) {
    const c = colorOf(n);
    assert.equal(c, REDS.has(n) ? 'red' : 'black', `colour of ${n}`);
    if (c === 'red') red++; else black++;
  }
  assert.equal(red, 18);
  assert.equal(black, 18);
  // On the real wheel the colours alternate after the zero
  for (let i = 1; i < 37; i++) assert.equal(colorOf(WHEEL_ORDER[i]), i % 2 ? 'red' : 'black', `wheel slot ${i}`);
});

test('the layout has 49 bets: 37 straight + 6 even-money + 3 dozens + 3 columns', () => {
  assert.equal(BETS.length, 49);
  assert.equal(new Set(BET_IDS).size, 49);
  const kinds = {};
  for (const b of BETS) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  assert.deepEqual(kinds, { straight: 37, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, dozen: 3, column: 3 });
  for (const b of BETS) {
    const want = b.kind === 'straight' ? 1 : (b.payout === 1 ? 18 : 12);
    assert.equal(b.covers.length, want, `${b.id} covers ${want}`);
    assert.ok(!b.covers.includes(0) || b.id === '0', `${b.id} must not cover 0`);
  }
});

test('exhaustive: every bet x every result matches the table rules (coverage and payout)', () => {
  let checks = 0;
  for (const id of BET_IDS) {
    for (let n = 0; n <= 36; n++) {
      const o = oracle(id, n);
      assert.equal(covers(id, n), o.wins, `${id} on ${n}`);
      assert.equal(betById(id).payout, o.payout, `${id} payout`);
      for (const stake of [1, 7, 25]) {
        assert.equal(returnFor(id, stake, n), o.wins ? stake * (o.payout + 1) : 0, `${id} x${stake} on ${n}`);
      }
      checks++;
    }
  }
  assert.equal(checks, 49 * 37);
});

test('zero loses every outside bet and pays only the straight 0', () => {
  const outside = BET_IDS.filter(id => !/^\d+$/.test(id));
  assert.equal(outside.length, 12);
  for (const id of outside) assert.equal(returnFor(id, 10, 0), 0, `${id} loses on 0`);
  assert.equal(returnFor('0', 10, 0), 360);
  assert.deepEqual(winningBets(0), ['0']);
  const r = settleBets(Object.fromEntries(outside.map(id => [id, 5])), 0);
  assert.equal(r.paid, 0);
  assert.equal(r.wagered, 60);
  assert.equal(r.losses.length, 12);
});

test('payout examples from the rules', () => {
  assert.equal(returnFor('17', 10, 17), 360);   // straight 35:1
  assert.equal(returnFor('red', 10, 17), 0);    // 17 is black
  assert.equal(returnFor('black', 10, 17), 20); // even money
  assert.equal(returnFor('dozen2', 10, 17), 30);
  assert.equal(returnFor('col2', 10, 17), 30);
  assert.equal(returnFor('col3', 10, 36), 30);
  assert.equal(returnFor('low', 10, 18), 20);
  assert.equal(returnFor('high', 10, 18), 0);
  assert.deepEqual(winningBets(17).sort(), ['17', 'black', 'col2', 'dozen2', 'low', 'odd'].sort());
  assert.equal(describe(17).label, '17 BLACK');
  assert.equal(describe(0).label, '0 GREEN');
  assert.deepEqual(describe(32).tags, ['EVEN', '19-36', '3RD 12']);
});

test('multi-bet settlement sums every winning and losing bet', () => {
  const bets = { 17: 10, red: 25, dozen2: 5, col2: 5, 0: 1, odd: 3, high: 2 };
  for (let n = 0; n <= 36; n++) {
    const r = settleBets(bets, n);
    let paid = 0;
    for (const [id, a] of Object.entries(bets)) paid += returnFor(id, a, n);
    assert.equal(r.paid, paid, `paid on ${n}`);
    assert.equal(r.wagered, totalOf(bets));
    assert.equal(r.net, r.paid - r.wagered);
    assert.equal(r.wins.length + r.losses.length, Object.keys(bets).length);
    assert.equal(r.wins.reduce((a, w) => a + w.paid, 0), r.paid);
    for (const w of r.wins) assert.ok(covers(w.id, n));
    for (const l of r.losses) assert.ok(!covers(l.id, n));
  }
  // 17 hits: straight 360 + dozen2 15 + col2 15 + odd 6 = 396 (red, 0 and 19-36 lose)
  assert.equal(settleBets(bets, 17).paid, 396);
  // empty / zero amounts
  assert.deepEqual(settleBets({}, 5), { n: 5, wagered: 0, paid: 0, net: 0, wins: [], losses: [] });
  assert.equal(settleBets({ red: 0 }, 1).wagered, 0);
  assert.throws(() => returnFor('split-1-2', 1, 1));
});

test('every bet returns exactly 36/37 (house edge 2.70 %)', () => {
  for (const id of BET_IDS) assert.ok(Math.abs(exactRtp(id) - 36 / 37) < 1e-12, `${id} RTP ${exactRtp(id)}`);
});

test('spins are deterministic per seed and draw exactly one number', () => {
  const a = new Rng(1234), b = new Rng(1234), c = new Rng(99);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 200; i++) { sa.push(spinResult(a)); sb.push(spinResult(b)); sc.push(spinResult(c)); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const n of sa) assert.ok(Number.isInteger(n) && n >= 0 && n <= 36);
  // spinResult is exactly rng.int(37): a clone predicts it
  const r = new Rng(7);
  const clone = new Rng(7);
  for (let i = 0; i < 50; i++) assert.equal(spinResult(r), clone.int(37));
});

test('pockets are uniform over 370,000 spins (chi-square, 36 dof)', () => {
  const r = new Rng('roulette-uniformity');
  const N = 370000;
  const counts = new Array(37).fill(0);
  for (let i = 0; i < N; i++) counts[spinResult(r)]++;
  const exp = N / 37;
  const chi2 = counts.reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
  // 36 dof: mean 36, p = 0.001 at 67.0
  assert.ok(chi2 < 67, `chi2 ${chi2.toFixed(1)} too high`);
  for (const c of counts) assert.ok(Math.abs(c - exp) / exp < 0.04, `pocket count ${c} vs ${exp}`);
  // simulated RTP of a straight-up bet lands near 97.3 %
  const hits = counts[17];
  assert.ok(Math.abs((hits * 36) / N - 36 / 37) < 0.03);
});
