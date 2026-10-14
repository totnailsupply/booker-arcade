import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS, BINS, RISKS, MULT10, MULTIPLIERS, BETS, choose, binWays, binProbabilities, exactRtp,
  payoutFor, generatePath, pathToBin, pegOffset, binOffset, allowedBets, stepBet, fmtMult,
} from '../../src/games/plinko/logic.js';
import { Rng } from '../../src/core/Rng.js';

// PLAN.md section 3 (half tables, bin 0..6; the rest is the mirror)
const PLAN = {
  low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5],
  medium: [33, 11, 4, 2, 1.1, 0.6, 0.3],
  high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2],
};
const PLAN_RTP = { low: 0.9898, medium: 0.9899, high: 0.9912 };

test('12 rows, 13 bins, three risks', () => {
  assert.equal(ROWS, 12);
  assert.equal(BINS, 13);
  assert.deepEqual(RISKS, ['low', 'medium', 'high']);
});

test('multiplier tables are mirrored and match PLAN.md', () => {
  for (const r of RISKS) {
    const m = MULTIPLIERS[r];
    assert.equal(m.length, 13);
    for (let k = 0; k < 13; k++) assert.equal(m[k], m[12 - k], `${r} bin ${k} mirrors bin ${12 - k}`);
    assert.deepEqual(m.slice(0, 7), PLAN[r], `${r} matches PLAN`);
    for (let k = 0; k < 13; k++) assert.ok(Number.isInteger(MULT10[r][k]), 'tenths are integers');
  }
});

test('binomial ways and probabilities', () => {
  assert.deepEqual(binWays(), [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1]);
  assert.equal(binWays().reduce((a, b) => a + b, 0), 4096);
  assert.equal(choose(12, 6), 924);
  const p = binProbabilities();
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('exact RTP per risk matches PLAN (98.98 / 98.99 / 99.12 %)', () => {
  for (const r of RISKS) {
    const { num, den, rtp } = exactRtp(r);
    assert.ok(Number.isInteger(num) && Number.isInteger(den));
    assert.equal(Math.round(rtp * 10000) / 10000, PLAN_RTP[r], `${r} RTP ${rtp}`);
    assert.ok(rtp >= 0.985 && rtp <= 0.995);
  }
  // exact rationals
  assert.equal(exactRtp('low').num, 40542);
  assert.equal(exactRtp('medium').num, 40546);
  assert.equal(exactRtp('high').num, 40598);
});

test('payouts are whole chips for every allowed bet, bin and risk', () => {
  for (const r of RISKS) {
    for (const bet of BETS) {
      for (let k = 0; k < 13; k++) {
        const p = payoutFor(bet, r, k);
        assert.ok(Number.isInteger(p), `${bet} x ${MULTIPLIERS[r][k]} = ${p}`);
        assert.equal(p, Math.round(bet * MULTIPLIERS[r][k]));
      }
    }
  }
  assert.equal(payoutFor(10, 'low', 4), 11);    // 10 x 1.1 (no float drift)
  assert.equal(payoutFor(10, 'high', 6), 2);
  assert.equal(payoutFor(2500, 'high', 0), 425000);
  assert.throws(() => payoutFor(5, 'low', 4), /whole number/);
  assert.equal(Math.min(...BETS), 10);
});

test('path generation: deterministic per seed, bin = number of rights', () => {
  const a = new Rng(1234);
  const b = new Rng(1234);
  for (let i = 0; i < 500; i++) {
    const pa = generatePath(a);
    const pb = generatePath(b);
    assert.deepEqual(pa, pb);
    assert.equal(pa.steps.length, 12);
    assert.equal(pa.bin, pa.steps.reduce((s, x) => s + x, 0));
    assert.ok(pa.steps.every(s => s === 0 || s === 1));
  }
  const c = new Rng(99);
  const differs = Array.from({ length: 20 }, () => generatePath(c).bin).join() !== Array.from({ length: 20 }, () => generatePath(new Rng(1234)).bin).join();
  assert.ok(differs, 'different seeds give different runs');
});

test('the animated path ends exactly in the bin (peg geometry)', () => {
  const rng = new Rng(7);
  for (let i = 0; i < 300; i++) {
    const { steps, bin } = generatePath(rng);
    let rights = 0;
    for (let r = 0; r < ROWS; r++) {
      const off = pegOffset(r, rights);
      const col = off + (r + 2) / 2;            // peg index in row r (r + 3 pegs)
      assert.ok(Number.isInteger(col) && col >= 1 && col <= r + 1, 'touches an inner peg of the row');
      rights += steps[r];
    }
    assert.equal(pegOffset(ROWS, rights), binOffset(bin), 'last hop lands on the bin centre');
  }
});

test('pathToBin (debug force) always ends in the requested bin', () => {
  const rng = new Rng(3);
  for (let k = 0; k <= 12; k++) {
    const p = pathToBin(k, rng);
    assert.equal(p.bin, k);
    assert.equal(p.steps.reduce((s, x) => s + x, 0), k);
  }
});

test('bin frequencies over 200k seeded drops match the binomial', () => {
  const N = 200000;
  const rng = new Rng('plinko-freq');
  const counts = new Array(13).fill(0);
  for (let i = 0; i < N; i++) counts[generatePath(rng).bin] += 1;
  const p = binProbabilities();
  let chi2 = 0;
  for (let k = 0; k < 13; k++) {
    const exp = N * p[k];
    const sd = Math.sqrt(N * p[k] * (1 - p[k]));
    assert.ok(Math.abs(counts[k] - exp) <= 5 * sd + 2, `bin ${k}: ${counts[k]} vs ${exp.toFixed(1)}`);
    chi2 += (counts[k] - exp) ** 2 / exp;
  }
  // 12 degrees of freedom: p = 0.001 critical value is 32.9
  assert.ok(chi2 < 32.9, `chi-square ${chi2.toFixed(2)}`);
});

test('bet selector: list, table limit and stepping', () => {
  assert.deepEqual(BETS, [10, 20, 50, 100, 250, 500, 1000, 2500]);
  assert.deepEqual(allowedBets(100), [10, 20, 50, 100]);
  assert.deepEqual(allowedBets(2500), BETS);
  assert.deepEqual(allowedBets(5), [10]);
  assert.equal(stepBet(10, -1, 100), 10);
  assert.equal(stepBet(10, 1, 100), 20);
  assert.equal(stepBet(100, 1, 100), 100);
  assert.equal(stepBet(250, 1, 1000), 500);
  assert.equal(stepBet(500, 0, 100), 100, 'snaps down when the limit is lower');
});

test('multiplier labels', () => {
  assert.equal(fmtMult(170), '170');
  assert.equal(fmtMult(8.1), '8.1');
  assert.equal(fmtMult(0.2), '0.2');
  assert.equal(fmtMult(1), '1');
});
