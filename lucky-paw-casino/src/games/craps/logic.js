// =============================================================================
// craps/logic.js — pure Craps rules (no Phaser). Node-tested and used by the
// RTP module, so the scene, the tests and the RTP math share one rule book.
//
// Bets (keys used everywhere): pass, dontPass, odds, field, any7, anyCraps, yo
//
// Money convention: every payout function returns the TOTAL return for a
// stake, stake included (lose -> 0, push -> stake, 1:1 win -> 2 x stake),
// which is what wallet.pay() expects.
//
// State: { phase: 'comeout' | 'point', point: null | 4 | 5 | 6 | 8 | 9 | 10 }
//
// resolveRoll(state, bets, dice) is the one call the scene makes per roll:
// it returns every bet that resolved on this roll (with its total return),
// the bets that stay on the table, and the next state.
// =============================================================================

export const BET_KEYS = ['pass', 'dontPass', 'odds', 'field', 'any7', 'anyCraps', 'yo'];
export const LINE_BETS = ['pass', 'dontPass'];
export const PROP_BETS = ['field', 'any7', 'anyCraps', 'yo'];
export const POINTS = [4, 5, 6, 8, 9, 10];

/** Number of ways (out of 36) to roll each total 2..12. */
export const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

/** Odds payout ratio per point, as [numerator, denominator] (true odds). */
export const ODDS_RATIO = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };

/** Odds must be a multiple of this so the payout is whole chips. */
export const ODDS_UNIT = { 4: 1, 10: 1, 5: 2, 9: 2, 6: 5, 8: 5 };

export const MAX_ODDS_X = 3;

export const FIELD_NUMBERS = [2, 3, 4, 9, 10, 11, 12];
export const FIELD_DOUBLE = [2, 12];
export const CRAPS_NUMBERS = [2, 3, 12];

/** Payout odds shown on the layout. */
export const PAYOUT_LABEL = {
  pass: '1:1', dontPass: '1:1', odds: 'True odds', field: '1:1  (2 & 12 pay 2:1)',
  any7: '4:1', anyCraps: '7:1', yo: '15:1',
};

export const freshState = () => ({ phase: 'comeout', point: null });
export const emptyBets = () => ({ pass: 0, dontPass: 0, odds: 0, field: 0, any7: 0, anyCraps: 0, yo: 0 });

export const isPoint = (t) => POINTS.includes(t);
export const total = (dice) => dice[0] + dice[1];

/** Two fair dice from an Rng (rng.range(1, 6) twice: die A then die B). */
export function rollDice(rng) {
  return [rng.range(1, 6), rng.range(1, 6)];
}

// --- line bets ------------------------------------------------------------------------

/**
 * What a total does to the line bets in a given state.
 * @returns {{ pass: 'win'|'lose'|null, dontPass: 'win'|'lose'|'push'|null,
 *             event: 'natural'|'craps'|'bar12'|'point-set'|'point-made'|'seven-out'|'no-action',
 *             next: {phase, point} }}
 */
export function resolveLine(state, t) {
  if (state.phase === 'comeout') {
    if (t === 7 || t === 11) return { pass: 'win', dontPass: 'lose', event: 'natural', next: freshState() };
    if (t === 2 || t === 3) return { pass: 'lose', dontPass: 'win', event: 'craps', next: freshState() };
    if (t === 12) return { pass: 'lose', dontPass: 'push', event: 'bar12', next: freshState() };
    return { pass: null, dontPass: null, event: 'point-set', next: { phase: 'point', point: t } };
  }
  if (t === state.point) return { pass: 'win', dontPass: 'lose', event: 'point-made', next: freshState() };
  if (t === 7) return { pass: 'lose', dontPass: 'win', event: 'seven-out', next: freshState() };
  return { pass: null, dontPass: null, event: 'no-action', next: { ...state } };
}

/** Total return of a resolved line bet (1:1; push returns the stake). */
export function linePayout(stake, result) {
  if (result === 'win') return stake * 2;
  if (result === 'push') return stake;
  return 0;
}

// --- odds -------------------------------------------------------------------------------

/** Total return of a winning Pass Odds bet on `point` (stake + true-odds winnings). */
export function oddsPayout(point, amount) {
  const r = ODDS_RATIO[point];
  if (!r) throw new Error(`no odds on ${point}`);
  const win = (amount * r[0]) / r[1];
  if (!Number.isInteger(win)) throw new Error(`odds ${amount} on ${point} would pay ${win}`);
  return amount + win;
}

export const oddsUnit = (point) => ODDS_UNIT[point] ?? 1;
export const maxOdds = (passBet) => passBet * MAX_ODDS_X;
export const oddsValid = (point, amount) => amount >= 0 && amount % oddsUnit(point) === 0;

/**
 * Turn a requested odds total into a legal one.
 * Rounds UP to the next whole-chip multiple when that still fits under the cap
 * (3x pass), otherwise DOWN to the largest legal amount under the cap.
 * @returns {{ amount, rounded: 'up'|'down'|null, capped: boolean }}
 */
export function normalizeOdds(point, requested, passBet) {
  const unit = oddsUnit(point);
  const cap = Math.floor(maxOdds(passBet) / unit) * unit;
  let amount = Math.max(0, Math.floor(requested));
  let rounded = null;
  let capped = false;
  if (amount % unit) {
    const up = Math.ceil(amount / unit) * unit;
    if (up <= cap) { amount = up; rounded = 'up'; } else { amount = Math.floor(amount / unit) * unit; rounded = 'down'; }
  }
  if (amount > cap) { amount = cap; capped = true; }
  return { amount, rounded, capped };
}

// --- one-roll props ---------------------------------------------------------------------

export function fieldPayout(stake, t) {
  if (FIELD_DOUBLE.includes(t)) return stake * 3;
  if (FIELD_NUMBERS.includes(t)) return stake * 2;
  return 0;
}
export const any7Payout = (stake, t) => (t === 7 ? stake * 5 : 0);
export const anyCrapsPayout = (stake, t) => (CRAPS_NUMBERS.includes(t) ? stake * 8 : 0);
export const yoPayout = (stake, t) => (t === 11 ? stake * 16 : 0);

export const PROP_PAYOUT = { field: fieldPayout, any7: any7Payout, anyCraps: anyCrapsPayout, yo: yoPayout };

// --- placement rules --------------------------------------------------------------------

/**
 * Can `amount` more chips go on `bet` right now? Returns null if OK, else a
 * player-facing reason. (Balance and table limit are the UI's job.)
 */
export function whyNotPlace(state, bets, bet, amount = 1) {
  if (!BET_KEYS.includes(bet)) return 'Unknown bet';
  if (amount <= 0) return 'Pick a chip first';
  if (bet === 'pass' || bet === 'dontPass') {
    if (state.phase !== 'comeout') return 'Line bets go down on the come-out roll';
    return null;
  }
  if (bet === 'odds') {
    if (state.phase !== 'point') return 'Odds open once a point is set';
    if (!bets.pass) return 'Odds back a Pass Line bet';
    const next = (bets.odds || 0) + amount;
    if (next > maxOdds(bets.pass)) return `Max odds is 3x your pass bet (${maxOdds(bets.pass)})`;
    if (!oddsValid(state.point, next)) return `Odds on ${state.point} go in ${oddsUnit(state.point)}s`;
    return null;
  }
  return null; // props: any time between rolls
}

/** Can the bet be taken down between rolls? */
export function canRemove(state, bet) {
  if (bet === 'pass' || bet === 'dontPass') return state.phase === 'comeout';
  return true; // odds and props come down any time between rolls
}

// --- one roll -----------------------------------------------------------------------------

/**
 * Resolve one roll.
 * @param {{phase, point}} state
 * @param {object} bets   amounts per BET_KEYS (missing = 0)
 * @param {[number, number]} dice
 * @returns {{ dice, total, line, event, resolved: Array<{bet, stake, outcome:'win'|'lose'|'push', paid}>,
 *             wagered, paid, bets (left on the table), next }}
 */
export function resolveRoll(state, bets, dice) {
  const t = total(dice);
  const b = { ...emptyBets(), ...bets };
  const line = resolveLine(state, t);
  const resolved = [];
  const keep = { ...b };
  const done = (bet, outcome, paid) => {
    resolved.push({ bet, stake: b[bet], outcome, paid });
    keep[bet] = 0;
  };

  if (b.pass && line.pass) done('pass', line.pass, linePayout(b.pass, line.pass));
  if (b.dontPass && line.dontPass) done('dontPass', line.dontPass, linePayout(b.dontPass, line.dontPass));
  // Odds ride with the pass line: they win when the point is made and lose on a seven out.
  if (b.odds) {
    if (line.event === 'point-made') done('odds', 'win', oddsPayout(state.point, b.odds));
    else if (line.event === 'seven-out') done('odds', 'lose', 0);
  }
  for (const p of PROP_BETS) {
    if (!b[p]) continue;
    const paid = PROP_PAYOUT[p](b[p], t);
    done(p, paid > 0 ? 'win' : 'lose', paid);
  }
  const wagered = resolved.reduce((n, r) => n + r.stake, 0);
  const paid = resolved.reduce((n, r) => n + r.paid, 0);
  return { dice: [...dice], total: t, line, event: line.event, resolved, wagered, paid, bets: keep, next: line.next };
}

// --- words ------------------------------------------------------------------------------------

/** The big call shown on the felt for a roll. */
export function callFor(state, t, event) {
  if (event === 'seven-out') return '7 — SEVEN OUT!';
  if (event === 'point-made') return `${t} — WINNER!`;
  if (event === 'point-set') return `POINT ${t}`;
  if (event === 'natural') return t === 11 ? 'YO 11!' : '7 — WINNER!';
  if (event === 'craps') return t === 2 ? 'ACES — CRAPS!' : '3 — CRAPS!';
  if (event === 'bar12') return '12 — CRAPS!';
  if (t === 11) return 'YO 11!';
  return String(t);
}

/** Booker the stickman's line for a roll. */
export function stickCall(state, t, event) {
  switch (event) {
    case 'seven-out': return 'Seven out, line away!';
    case 'point-made': return `Winner ${t}! Pay the line!`;
    case 'point-set': return `The point is ${t}. Mark it!`;
    case 'natural': return t === 11 ? 'Yo eleven! Front line winner!' : 'Winner 7, pay the line!';
    case 'craps': return t === 2 ? 'Aces! Craps, line away.' : 'Ace-deuce, craps 3!';
    case 'bar12': return 'Boxcars! Craps 12, Don\'t is barred.';
    default: return t === 11 ? `Yo 11! Point is still ${state.point}.` : `${t}, no action. Point is ${state.point}.`;
  }
}

/** One-line phase banner. */
export function phaseLine(state) {
  if (state.phase === 'point') return `Point is ${state.point} — roll ${state.point === 8 ? 'an' : 'a'} ${state.point} before a 7`;
  return 'Come-out roll — bet the Pass Line';
}
