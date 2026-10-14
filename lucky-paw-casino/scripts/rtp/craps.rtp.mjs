// Craps RTP — EXACT, by Markov-chain enumeration over the 36 dice outcomes,
// using the payout rules in src/games/craps/logic.js (resolveRoll), so the
// numbers prove the code, not a formula typed twice.
//
// Convention: RTP = expected TOTAL return per chip staked, per bet made, until
// that bet resolves. A push (Don't Pass bar 12) counts as a return of 1, so
// Don't Pass = 1953/1980 = 98.636 %. (Per decision, excluding pushes, it
// would be 1898/1925 = 98.597 %; shown in the note.)
//
// Odds: for each point the bet is placed after the point is set; the per-point
// RTP is exactly 1, and the line reports the point-frequency-weighted average.
// A Monte Carlo pass over full hands (resolveRoll + the game's Rng) checks the
// state machine end to end.

import { Rng } from '../../src/core/Rng.js';
import { resolveRoll, freshState, POINTS, rollDice } from '../../src/games/craps/logic.js';

const ALL_DICE = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALL_DICE.push([a, b]);

const key = (s) => `${s.phase}:${s.point ?? ''}`;

/**
 * Expected total return of `target` (stake `stake`) from `state` with `bets`
 * on the table, until it resolves. Self-loops (no-action rolls) are solved
 * algebraically: E = A / (1 - q).
 */
function expectedReturn(target, state, bets, depth = 0) {
  if (depth > 4) throw new Error('unexpected chain');
  let a = 0;      // probability-weighted payouts resolved on this roll
  let q = 0;      // probability the bet stays and the state is unchanged
  let other = 0;  // value carried to a different state
  for (const d of ALL_DICE) {
    const r = resolveRoll(state, bets, d);
    const hit = r.resolved.find(x => x.bet === target);
    if (hit) { a += hit.paid / 36; continue; }
    if (key(r.next) === key(state)) q += 1 / 36;
    else other += expectedReturn(target, r.next, r.bets, depth + 1) / 36;
  }
  return (a + other) / (1 - q);
}

function pushShare() {
  // Don't Pass: probability the bet ends in a push (bar 12 on the come-out)
  let p = 0;
  for (const d of ALL_DICE) {
    const r = resolveRoll(freshState(), { dontPass: 1 }, d);
    if (r.resolved.find(x => x.bet === 'dontPass' && x.outcome === 'push')) p += 1 / 36;
  }
  return p;
}

function oddsRtp() {
  // P(point p is set on a come-out) and the odds bet's return on each point
  const stake = 30; // a legal odds amount on every point (multiple of 1, 2 and 5)
  let w = 0;
  let sum = 0;
  const per = {};
  for (const p of POINTS) {
    const ways = ALL_DICE.filter(d => d[0] + d[1] === p).length / 36;
    const e = expectedReturn('odds', { phase: 'point', point: p }, { pass: 10, odds: stake }) / stake;
    per[p] = e;
    w += ways;
    sum += ways * e;
  }
  return { avg: sum / w, per };
}

function simulate(rolls = 2_000_000, seed = 'craps-rtp') {
  // Full hands with every bet up, re-placed after it resolves.
  const r = new Rng(seed);
  let state = freshState();
  let bets = { pass: 0, dontPass: 0, odds: 0, field: 0, any7: 0, anyCraps: 0, yo: 0 };
  const acc = { pass: [0, 0], dontPass: [0, 0], field: [0, 0], odds: [0, 0] };
  for (let i = 0; i < rolls; i++) {
    if (state.phase === 'comeout') { bets.pass = bets.pass || 10; bets.dontPass = bets.dontPass || 10; }
    else if (bets.pass && !bets.odds) bets.odds = 30;
    bets.field = 10;
    const res = resolveRoll(state, bets, rollDice(r));
    for (const x of res.resolved) if (acc[x.bet]) { acc[x.bet][0] += x.stake; acc[x.bet][1] += x.paid; }
    bets = res.bets;
    state = res.next;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, [s, p]]) => [k, p / s]));
}

export default async function crapsRtp() {
  const come = freshState();
  const out = [];
  const exact = (label, rtp, target, note) => out.push({
    game: 'craps', label, rtp, band: [target - 0.00001, target + 0.00001], method: 'exact', note,
  });

  const pass = expectedReturn('pass', come, { pass: 1 });
  exact('Pass Line', pass, 0.98586, '= 976/990');
  const dp = expectedReturn('dontPass', come, { dontPass: 1 });
  const ps = pushShare();
  exact("Don't Pass (bar 12)", dp, 0.98636, `= 1953/1980 incl. push as 1x; per decision excl. pushes ${(((dp - ps) / (1 - ps)) * 100).toFixed(3)}%`);
  const odds = oddsRtp();
  exact('Pass Odds', odds.avg, 1.0, `per point ${POINTS.map(p => `${p}:${odds.per[p].toFixed(6)}`).join(' ')}`);
  exact('Field', expectedReturn('field', come, { field: 1 }), 0.94444, '= 34/36');
  exact('Any 7', expectedReturn('any7', come, { any7: 1 }), 0.83333, '= 30/36');
  exact('Any Craps', expectedReturn('anyCraps', come, { anyCraps: 1 }), 0.88889, '= 32/36');
  exact('Yo 11', expectedReturn('yo', come, { yo: 1 }), 0.88889, '= 32/36');

  const sim = simulate();
  out.push({ game: 'craps', label: 'Pass (sim 2M rolls)', rtp: sim.pass, band: [0.975, 0.997], method: 'sim 2M rolls', note: `field ${(sim.field * 100).toFixed(2)}% odds ${(sim.odds * 100).toFixed(2)}% dp ${(sim.dontPass * 100).toFixed(2)}%` });
  return out;
}
