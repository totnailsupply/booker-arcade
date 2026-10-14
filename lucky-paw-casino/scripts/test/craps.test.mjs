// Craps rules (src/games/craps/logic.js): line bets on every total in every
// state, odds payouts + whole-chip rules, one-roll props, placement legality,
// determinism per seed and dice fairness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/Rng.js';
import {
  POINTS, WAYS, resolveLine, resolveRoll, linePayout, oddsPayout, oddsUnit, oddsValid, normalizeOdds, maxOdds,
  fieldPayout, any7Payout, anyCrapsPayout, yoPayout, whyNotPlace, canRemove, rollDice, freshState, emptyBets,
  callFor, stickCall, phaseLine,
} from '../../src/games/craps/logic.js';

const TOTALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const COMEOUT = freshState();
const pointState = (p) => ({ phase: 'point', point: p });
/** Some dice pair with this total. */
const diceFor = (t) => (t <= 7 ? [1, t - 1] : [6, t - 6]);

test('come-out roll: every total for Pass and Don\'t Pass (bar 12)', () => {
  const expect = {
    2: ['lose', 'win', 'craps'], 3: ['lose', 'win', 'craps'], 12: ['lose', 'push', 'bar12'],
    7: ['win', 'lose', 'natural'], 11: ['win', 'lose', 'natural'],
  };
  for (const t of TOTALS) {
    const r = resolveLine(COMEOUT, t);
    if (expect[t]) {
      assert.equal(r.pass, expect[t][0], `pass on come-out ${t}`);
      assert.equal(r.dontPass, expect[t][1], `don't pass on come-out ${t}`);
      assert.equal(r.event, expect[t][2]);
      assert.deepEqual(r.next, COMEOUT);
    } else {
      assert.ok(POINTS.includes(t));
      assert.equal(r.pass, null);
      assert.equal(r.dontPass, null);
      assert.equal(r.event, 'point-set');
      assert.deepEqual(r.next, { phase: 'point', point: t });
    }
  }
});

test('point phase: every total on every point', () => {
  for (const p of POINTS) {
    for (const t of TOTALS) {
      const r = resolveLine(pointState(p), t);
      if (t === p) {
        assert.deepEqual([r.pass, r.dontPass, r.event], ['win', 'lose', 'point-made'], `point ${p} roll ${t}`);
        assert.deepEqual(r.next, COMEOUT);
      } else if (t === 7) {
        assert.deepEqual([r.pass, r.dontPass, r.event], ['lose', 'win', 'seven-out']);
        assert.deepEqual(r.next, COMEOUT);
      } else {
        assert.deepEqual([r.pass, r.dontPass, r.event], [null, null, 'no-action'], `point ${p} roll ${t}`);
        assert.deepEqual(r.next, pointState(p));
      }
    }
  }
});

test('line payouts: 1:1 win, push returns the stake, loss pays nothing', () => {
  assert.equal(linePayout(10, 'win'), 20);
  assert.equal(linePayout(10, 'push'), 10);
  assert.equal(linePayout(10, 'lose'), 0);
  // through resolveRoll: bar 12 on the come-out
  const r = resolveRoll(COMEOUT, { pass: 10, dontPass: 25 }, [6, 6]);
  assert.deepEqual(r.resolved.map(x => [x.bet, x.outcome, x.paid]), [['pass', 'lose', 0], ['dontPass', 'push', 25]]);
  assert.equal(r.wagered, 35);
  assert.equal(r.paid, 25);
});

test('odds pay true odds per point', () => {
  assert.equal(oddsPayout(4, 10), 30);
  assert.equal(oddsPayout(10, 7), 21);
  assert.equal(oddsPayout(5, 10), 25);
  assert.equal(oddsPayout(9, 2), 5);
  assert.equal(oddsPayout(6, 10), 22);
  assert.equal(oddsPayout(8, 25), 55);
  assert.throws(() => oddsPayout(6, 3), /would pay/);
  assert.throws(() => oddsPayout(5, 3), /would pay/);
  assert.throws(() => oddsPayout(7, 10));
  assert.deepEqual(POINTS.map(oddsUnit), [1, 2, 5, 5, 2, 1]);
});

test('odds whole-chip enforcement: every legal amount pays whole chips; normalizeOdds rounds', () => {
  for (const p of POINTS) {
    for (let a = 0; a <= 300; a++) {
      if (oddsValid(p, a)) assert.ok(Number.isInteger(oddsPayout(p, a)), `odds ${a} on ${p}`);
      else assert.throws(() => oddsPayout(p, a));
    }
  }
  // round up when it fits under the 3x cap
  assert.deepEqual(normalizeOdds(6, 1, 10), { amount: 5, rounded: 'up', capped: false });
  assert.deepEqual(normalizeOdds(5, 3, 10), { amount: 4, rounded: 'up', capped: false });
  assert.deepEqual(normalizeOdds(4, 3, 10), { amount: 3, rounded: null, capped: false });
  // round down when rounding up would pass the cap (pass 5 -> max 15)
  assert.deepEqual(normalizeOdds(9, 15, 5), { amount: 14, rounded: 'down', capped: false });
  assert.deepEqual(normalizeOdds(6, 16, 5), { amount: 15, rounded: 'down', capped: false });
  // cap at 3x
  assert.deepEqual(normalizeOdds(4, 100, 10), { amount: 30, rounded: null, capped: true });
  assert.deepEqual(normalizeOdds(8, 100, 7), { amount: 20, rounded: null, capped: true });
  assert.equal(maxOdds(25), 75);
  // the cap itself is always legal
  for (const p of POINTS) for (let pass = 1; pass <= 60; pass++) {
    const n = normalizeOdds(p, 1e9, pass).amount;
    assert.ok(oddsValid(p, n) && n <= maxOdds(pass));
  }
});

test('odds resolve with the point: win on point made, lose on seven out, ride otherwise', () => {
  for (const p of POINTS) {
    const bets = { pass: 10, odds: 30 };
    const win = resolveRoll(pointState(p), bets, diceFor(p));
    assert.deepEqual(win.resolved.map(r => r.bet), ['pass', 'odds']);
    assert.equal(win.paid, 20 + oddsPayout(p, 30));
    assert.deepEqual(win.bets, emptyBets());
    const lose = resolveRoll(pointState(p), bets, [3, 4]);
    assert.equal(lose.paid, 0);
    assert.equal(lose.wagered, 40);
    for (const t of TOTALS) {
      if (t === p || t === 7) continue;
      const r = resolveRoll(pointState(p), bets, diceFor(t));
      assert.equal(r.resolved.length, 0, `point ${p} roll ${t}`);
      assert.equal(r.bets.pass, 10);
      assert.equal(r.bets.odds, 30);
    }
  }
});

test('one-roll props for all 11 totals', () => {
  const field = { 2: 3, 3: 2, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 2, 10: 2, 11: 2, 12: 3 };
  for (const t of TOTALS) {
    assert.equal(fieldPayout(10, t), 10 * field[t], `field ${t}`);
    assert.equal(any7Payout(10, t), t === 7 ? 50 : 0, `any 7 on ${t}`);
    assert.equal(anyCrapsPayout(10, t), [2, 3, 12].includes(t) ? 80 : 0, `any craps on ${t}`);
    assert.equal(yoPayout(10, t), t === 11 ? 160 : 0, `yo on ${t}`);
    // props resolve every roll in both phases
    for (const st of [COMEOUT, pointState(6)]) {
      const r = resolveRoll(st, { field: 10, any7: 10, anyCraps: 10, yo: 10 }, diceFor(t));
      assert.deepEqual(r.resolved.map(x => x.bet), ['field', 'any7', 'anyCraps', 'yo']);
      assert.equal(r.bets.field + r.bets.any7 + r.bets.anyCraps + r.bets.yo, 0);
      assert.equal(r.wagered, 40);
    }
  }
});

test('placement legality', () => {
  const pt = pointState(6);
  assert.equal(whyNotPlace(COMEOUT, emptyBets(), 'pass', 5), null);
  assert.equal(whyNotPlace(COMEOUT, emptyBets(), 'dontPass', 5), null);
  assert.match(whyNotPlace(pt, { pass: 10 }, 'pass', 5), /come-out/);
  assert.match(whyNotPlace(pt, { pass: 10 }, 'dontPass', 5), /come-out/);
  assert.match(whyNotPlace(COMEOUT, { pass: 10 }, 'odds', 5), /point/);
  assert.match(whyNotPlace(pt, { dontPass: 10 }, 'odds', 5), /Pass Line/);
  assert.equal(whyNotPlace(pt, { pass: 10 }, 'odds', 5), null);
  assert.match(whyNotPlace(pt, { pass: 10 }, 'odds', 3), /in 5s/);
  assert.match(whyNotPlace(pt, { pass: 10, odds: 30 }, 'odds', 5), /Max odds/);
  for (const p of ['field', 'any7', 'anyCraps', 'yo']) {
    assert.equal(whyNotPlace(COMEOUT, emptyBets(), p, 1), null);
    assert.equal(whyNotPlace(pt, { pass: 5 }, p, 1), null);
  }
  assert.ok(whyNotPlace(COMEOUT, emptyBets(), 'field', 0));
  assert.equal(canRemove(COMEOUT, 'pass'), true);
  assert.equal(canRemove(pt, 'pass'), false);
  assert.equal(canRemove(pt, 'dontPass'), false);
  assert.equal(canRemove(pt, 'odds'), true);
  assert.equal(canRemove(pt, 'yo'), true);
});

test('a full hand: come-out 6, roll 4, roll 6 -> pass + odds win', () => {
  let st = COMEOUT;
  let bets = { ...emptyBets(), pass: 10, field: 5 };
  let r = resolveRoll(st, bets, [2, 4]);
  assert.equal(r.event, 'point-set');
  assert.deepEqual(r.resolved.map(x => [x.bet, x.paid]), [['field', 0]]);
  st = r.next; bets = { ...r.bets, odds: 20 };
  r = resolveRoll(st, bets, [1, 3]);
  assert.equal(r.event, 'no-action');
  assert.equal(r.resolved.length, 0);
  st = r.next;
  r = resolveRoll(st, r.bets, [3, 3]);
  assert.equal(r.event, 'point-made');
  assert.equal(r.paid, 20 + 44);
  assert.deepEqual(r.next, COMEOUT);
});

test('words: calls and banner', () => {
  assert.equal(callFor(pointState(8), 7, 'seven-out'), '7 — SEVEN OUT!');
  assert.equal(callFor(COMEOUT, 11, 'natural'), 'YO 11!');
  assert.equal(callFor(COMEOUT, 8, 'point-set'), 'POINT 8');
  assert.match(stickCall(COMEOUT, 7, 'natural'), /pay the line/);
  assert.match(stickCall(pointState(9), 7, 'seven-out'), /line away/);
  assert.equal(phaseLine(COMEOUT), 'Come-out roll — bet the Pass Line');
  assert.equal(phaseLine(pointState(6)), 'Point is 6 — roll a 6 before a 7');
});

test('determinism per seed', () => {
  const seq = (seed) => { const r = new Rng(seed); return Array.from({ length: 200 }, () => rollDice(r)); };
  assert.deepEqual(seq(7), seq(7));
  assert.notDeepEqual(seq(7), seq(8));
  for (const d of seq(3)) for (const v of d) assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
});

test('dice fairness over 360k rolls (faces and totals)', () => {
  const r = new Rng('craps-fair');
  const N = 360000;
  const faces = [0, 0, 0, 0, 0, 0, 0];
  const totals = {};
  for (let i = 0; i < N; i++) {
    const d = rollDice(r);
    faces[d[0]]++; faces[d[1]]++;
    totals[d[0] + d[1]] = (totals[d[0] + d[1]] || 0) + 1;
  }
  // chi-square on the 6 faces (2N throws): df 5, p=0.001 critical 20.5
  const e = (2 * N) / 6;
  const chiF = faces.slice(1).reduce((s, c) => s + (c - e) ** 2 / e, 0);
  assert.ok(chiF < 20.5, `face chi2 ${chiF.toFixed(2)}`);
  // chi-square on the 11 totals: df 10, p=0.001 critical 29.6
  const chiT = TOTALS.reduce((s, t) => { const ex = N * WAYS[t] / 36; return s + (totals[t] - ex) ** 2 / ex; }, 0);
  assert.ok(chiT < 29.6, `total chi2 ${chiT.toFixed(2)}`);
  assert.ok(Math.abs(totals[7] / N - 1 / 6) < 0.004, `sevens ${totals[7] / N}`);
});
