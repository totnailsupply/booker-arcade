// =============================================================================
// Plinko rules — pure JS (no Phaser), node-importable (tests + RTP check).
//
// 12 rows of pegs, 13 bins. A ball takes 12 fair left/right steps; the bin is
// the number of rights (0..12), so P(bin k) = C(12, k) / 4096.
// Multipliers are stored in TENTHS (integers) so payouts are exact:
//   payout = bet * mult10 / 10, and every allowed bet is a multiple of 10.
// The outcome is decided here first; the scene only animates the path.
// =============================================================================

export const ROWS = 12;
export const BINS = ROWS + 1;

export const RISKS = ['low', 'medium', 'high'];
export const RISK_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

/** Multipliers x10, bin 0..12 (PLAN.md section 3). Mirrored around bin 6. */
export const MULT10 = Object.freeze({
  low: Object.freeze([100, 30, 16, 14, 11, 10, 5, 10, 11, 14, 16, 30, 100]),
  medium: Object.freeze([330, 110, 40, 20, 11, 6, 3, 6, 11, 20, 40, 110, 330]),
  high: Object.freeze([1700, 240, 81, 20, 7, 2, 2, 2, 7, 20, 81, 240, 1700]),
});

/** Multipliers as numbers (display / snapshot). */
export const MULTIPLIERS = Object.freeze(Object.fromEntries(
  RISKS.map(r => [r, Object.freeze(MULT10[r].map(m => m / 10))]),
));

/** Bet per ball. Minimum 10 so every multiplier (tenths) pays whole chips. */
export const BETS = Object.freeze([10, 20, 50, 100, 250, 500, 1000, 2500]);
export const MAX_IN_FLIGHT = 10;
export const AUTO_COUNT = 10;
export const AUTO_GAP_MS = 180;

/** Binomial coefficient C(n, k) (exact for n <= 50). */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}

/** Ways to land in each bin (sum = 2^rows). */
export function binWays(rows = ROWS) {
  return Array.from({ length: rows + 1 }, (_, k) => choose(rows, k));
}

/** P(bin k) for each bin. */
export function binProbabilities(rows = ROWS) {
  const total = 2 ** rows;
  return binWays(rows).map(w => w / total);
}

/**
 * Exact RTP for a risk level as { num, den, rtp }: num / den is the exact
 * rational (integers), rtp the float.
 */
export function exactRtp(risk) {
  const m = MULT10[risk];
  if (!m) throw new Error(`unknown risk ${risk}`);
  const ways = binWays(ROWS);
  const num = ways.reduce((s, w, k) => s + w * m[k], 0);
  const den = 2 ** ROWS * 10;
  return { num, den, rtp: num / den };
}

/** Multiplier (number) for a bin. */
export function multiplier(risk, bin) {
  return MULT10[risk][bin] / 10;
}

/** Total return for one ball (stake included). Always an integer for allowed bets. */
export function payoutFor(bet, risk, bin) {
  const m10 = MULT10[risk]?.[bin];
  if (m10 === undefined) throw new Error(`bad risk/bin ${risk}/${bin}`);
  const raw = bet * m10;
  if (raw % 10 !== 0) throw new Error(`bet ${bet} x ${m10 / 10} is not a whole number of chips`);
  return raw / 10;
}

/**
 * The outcome: 12 fair steps from `rng` (anything with int(n) -> [0, n)).
 * Returns { steps: [0|1 x12] (1 = right), bin = number of rights }.
 */
export function generatePath(rng, rows = ROWS) {
  const steps = new Array(rows);
  let bin = 0;
  for (let r = 0; r < rows; r++) {
    const s = rng.int(2);
    steps[r] = s;
    bin += s;
  }
  return { steps, bin };
}

/**
 * A path that ends in `bin` (debug force hook): `bin` rights in a shuffled
 * order. Uses `rng` only for the order (cosmetic).
 */
export function pathToBin(bin, rng, rows = ROWS) {
  bin = Math.max(0, Math.min(rows, Math.floor(bin)));
  const steps = Array.from({ length: rows }, (_, i) => (i < bin ? 1 : 0));
  for (let i = steps.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  return { steps, bin };
}

/**
 * Peg the ball touches in row r after `rights` right-steps so far, as a
 * column offset from the centre in peg spacings: rights - r / 2.
 * (Row r has r + 3 pegs; the ball never touches the two edge pegs.)
 */
export function pegOffset(r, rights) {
  return rights - r / 2;
}

/** Bin centre offset from the board centre in peg spacings. */
export function binOffset(bin, rows = ROWS) {
  return bin - rows / 2;
}

/** Bets the player may pick under a table limit (always at least the minimum). */
export function allowedBets(maxBet = Infinity) {
  const list = BETS.filter(b => b <= maxBet);
  return list.length ? list : [BETS[0]];
}

/** Next bet up (dir +1) or down (dir -1) within the table limit. */
export function stepBet(bet, dir, maxBet = Infinity) {
  const list = allowedBets(maxBet);
  let i = list.indexOf(bet);
  if (i < 0) {
    // not in the list (limit dropped / old value): snap to the largest allowed <= bet
    i = Math.max(0, list.filter(b => b <= bet).length - 1);
    return list[i];
  }
  return list[Math.max(0, Math.min(list.length - 1, i + dir))];
}

/** Display label for a multiplier: 170, 8.1, 0.2. */
export function fmtMult(m) {
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}
