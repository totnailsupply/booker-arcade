// =============================================================================
// Roulette rules — pure JS (no Phaser), node-importable.
//
// European single-zero wheel. Bets: straight up on 0..36 (35:1), red/black,
// odd/even, 1-18/19-36 (1:1), dozens and columns (2:1). Zero loses every
// outside bet (no la partage, no en prison).
//
//   import { spinResult, settleBets, BETS, betById, colorOf } from './logic.js';
//   const n = spinResult(rng);                 // rng.int(37): the ONLY random draw of a spin
//   const r = settleBets({ '17': 10, red: 25 }, n);
//   r.paid                                     // TOTAL return incl. stakes (wallet.pay amount)
//
// Bet ids: '0'..'36', 'red', 'black', 'odd', 'even', 'low' (1-18), 'high' (19-36),
//          'dozen1'..'dozen3', 'col1'..'col3' (col1 = 1,4,7..34; col3 = 3,6..36).
// =============================================================================

/** Pocket order clockwise on a real European wheel, starting at 0. */
export const WHEEL_ORDER = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]);

export const POCKETS = 37;

export const RED_NUMBERS = Object.freeze([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RED = new Set(RED_NUMBERS);

/** 'green' for 0, else 'red' | 'black'. */
export function colorOf(n) {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

/** Index of number n in WHEEL_ORDER. */
const POCKET_INDEX = (() => {
  const a = new Array(POCKETS);
  WHEEL_ORDER.forEach((n, i) => { a[n] = i; });
  return a;
})();
export const pocketIndex = (n) => POCKET_INDEX[n];

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ALL = range(1, 36);

// payout = winnings per 1 staked ("35:1" -> 35). A winning bet returns stake * (payout + 1).
function def(id, kind, label, payout, covers, name = label) {
  return Object.freeze({ id, kind, label, name, payout, covers: Object.freeze(covers), coverSet: new Set(covers) });
}

/** Every bet on the layout. kind groups bets for RTP and stats. */
export const BETS = Object.freeze([
  ...range(0, 36).map(n => def(String(n), 'straight', String(n), 35, [n], `${n} straight up`)),
  def('red', 'red', 'RED', 1, ALL.filter(n => RED.has(n)), 'Red'),
  def('black', 'black', 'BLACK', 1, ALL.filter(n => !RED.has(n)), 'Black'),
  def('odd', 'odd', 'ODD', 1, ALL.filter(n => n % 2 === 1), 'Odd'),
  def('even', 'even', 'EVEN', 1, ALL.filter(n => n % 2 === 0), 'Even'),
  def('low', 'low', '1-18', 1, range(1, 18), '1 to 18'),
  def('high', 'high', '19-36', 1, range(19, 36), '19 to 36'),
  def('dozen1', 'dozen', '1st 12', 2, range(1, 12), '1st dozen'),
  def('dozen2', 'dozen', '2nd 12', 2, range(13, 24), '2nd dozen'),
  def('dozen3', 'dozen', '3rd 12', 2, range(25, 36), '3rd dozen'),
  def('col1', 'column', '2:1', 2, ALL.filter(n => n % 3 === 1), '1st column'),
  def('col2', 'column', '2:1', 2, ALL.filter(n => n % 3 === 2), '2nd column'),
  def('col3', 'column', '2:1', 2, ALL.filter(n => n % 3 === 0), '3rd column'),
]);

const BY_ID = new Map(BETS.map(b => [b.id, b]));
export const BET_IDS = Object.freeze(BETS.map(b => b.id));
export const betById = (id) => BY_ID.get(String(id)) || null;

/** Payout ratio text, e.g. '35:1'. */
export const payoutText = (id) => `${betById(id).payout}:1`;

/** True if bet `id` wins when the ball lands on n. */
export function covers(id, n) {
  const b = betById(id);
  return !!b && b.coverSet.has(n);
}

/** Total return (stake included) for `amount` on bet `id` when n hits. 0 if it loses. */
export function returnFor(id, amount, n) {
  const b = betById(id);
  if (!b) throw new Error(`unknown roulette bet ${id}`);
  return b.coverSet.has(n) ? amount * (b.payout + 1) : 0;
}

/** The result of a spin: one uniform draw over the 37 pockets. */
export function spinResult(rng) {
  return rng.int(POCKETS);
}

/**
 * Settle a whole layout.
 * @param {Record<string, number>} bets  { betId: amount }
 * @param {number} n                     winning number 0..36
 * @returns {{ n, wagered, paid, net, wins: {id, amount, paid}[], losses: {id, amount}[] }}
 */
export function settleBets(bets, n) {
  let wagered = 0;
  let paid = 0;
  const wins = [];
  const losses = [];
  for (const [id, amount] of Object.entries(bets || {})) {
    if (!(amount > 0)) continue;
    wagered += amount;
    const r = returnFor(id, amount, n);
    if (r > 0) {
      paid += r;
      wins.push({ id, amount, paid: r });
    } else {
      losses.push({ id, amount });
    }
  }
  return { n, wagered, paid, net: paid - wagered, wins, losses };
}

/** Every bet id that wins on n (for highlights). */
export function winningBets(n) {
  return BETS.filter(b => b.coverSet.has(n)).map(b => b.id);
}

/** Human description of a number: { n, color, label: '17 RED', tags: ['ODD', '19-36', ...] }. */
export function describe(n) {
  const color = colorOf(n);
  if (n === 0) return { n, color, label: '0 GREEN', tags: ['ZERO'] };
  const tags = [n % 2 ? 'ODD' : 'EVEN', n <= 18 ? '1-18' : '19-36', `${['1ST', '2ND', '3RD'][Math.floor((n - 1) / 12)]} 12`];
  return { n, color, label: `${n} ${color.toUpperCase()}`, tags };
}

/** Expected return per chip staked on bet id (exact, by enumeration). */
export function exactRtp(id) {
  let total = 0;
  for (let n = 0; n < POCKETS; n++) total += returnFor(id, 1, n);
  return total / POCKETS;
}

/** Sum of a bets object. */
export function totalOf(bets) {
  return Object.values(bets || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
}
