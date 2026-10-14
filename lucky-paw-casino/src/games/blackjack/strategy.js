// =============================================================================
// Soba's book: basic strategy for 6 decks, dealer stands on soft 17, double
// after split allowed, no surrender (the standard published chart).
// Pure JS (no Phaser).
//
//   basicStrategy(cards, upcard, { canDouble, canSplit }) -> 'hit' | 'stand' | 'double' | 'split'
//   chartCode(cards, upcard)  -> raw chart cell: 'H' | 'S' | 'D' (double else hit)
//                                | 'Ds' (double else stand) | 'P' (split)
//   hintReason(cards, upcard) -> 'Hard 16 vs 10' (for Soba's speech bubble)
// =============================================================================

import { cardValue, handValue, isPair } from './logic.js';

/** Dealer upcard as 2..11 (ace = 11). */
export function upValue(card) {
  const v = cardValue(card);
  return v === 1 ? 11 : v;
}

const between = (d, lo, hi) => d >= lo && d <= hi;

/** Hard totals. */
function hardCode(total, d) {
  if (total <= 8) return 'H';
  if (total === 9) return between(d, 3, 6) ? 'D' : 'H';
  if (total === 10) return between(d, 2, 9) ? 'D' : 'H';
  if (total === 11) return d === 11 ? 'H' : 'D';           // S17: hit 11 vs ace
  if (total === 12) return between(d, 4, 6) ? 'S' : 'H';
  if (total <= 16) return between(d, 2, 6) ? 'S' : 'H';
  return 'S';
}

/** Soft totals (an ace counted as 11). */
function softCode(total, d) {
  if (total <= 14) return between(d, 5, 6) ? 'D' : 'H';    // A2, A3
  if (total <= 16) return between(d, 4, 6) ? 'D' : 'H';    // A4, A5
  if (total === 17) return between(d, 3, 6) ? 'D' : 'H';   // A6
  if (total === 18) {                                      // A7
    if (between(d, 3, 6)) return 'Ds';
    if (d === 2 || d === 7 || d === 8) return 'S';
    return 'H';
  }
  return 'S';                                              // A8+, S17: stand A8 vs 6
}

/** Pairs (double after split allowed). null = play it as a total. */
function pairCode(cardVal, d) {
  switch (cardVal) {
    case 1: return 'P';                                    // A-A
    case 10: return null;                                  // 20: stand
    case 9: return (between(d, 2, 6) || d === 8 || d === 9) ? 'P' : null;
    case 8: return 'P';
    case 7: return between(d, 2, 7) ? 'P' : null;
    case 6: return between(d, 2, 6) ? 'P' : null;
    case 5: return null;                                   // play as hard 10
    case 4: return between(d, 5, 6) ? 'P' : null;
    case 3:
    case 2: return between(d, 2, 7) ? 'P' : null;
    default: return null;
  }
}

/** Raw chart cell for this hand (ignores whether double/split is still allowed). */
export function chartCode(cards, upcard) {
  const d = upValue(upcard);
  if (isPair(cards)) {
    const p = pairCode(cardValue(cards[0]), d);
    if (p) return p;
  }
  const v = handValue(cards);
  return v.soft ? softCode(v.total, d) : hardCode(v.total, d);
}

/**
 * The recommended legal move.
 * @param {string[]} cards   the player's hand
 * @param {string} upcard    the dealer's face-up card
 * @param {{canDouble?: boolean, canSplit?: boolean}} [legal]
 */
export function basicStrategy(cards, upcard, { canDouble = cards.length === 2, canSplit = isPair(cards) } = {}) {
  const d = upValue(upcard);
  if (canSplit && isPair(cards)) {
    const p = pairCode(cardValue(cards[0]), d);
    if (p === 'P') return 'split';
  }
  const v = handValue(cards);
  if (v.total >= 21) return 'stand';
  const code = v.soft ? softCode(v.total, d) : hardCode(v.total, d);
  if (code === 'D') return canDouble ? 'double' : 'hit';
  if (code === 'Ds') return canDouble ? 'double' : 'stand';
  return code === 'S' ? 'stand' : 'hit';
}

const UP_NAME = { 11: 'A', 10: '10' };

/** 'Hard 16 vs 10', 'Soft 18 vs 9', 'Pair of 8s vs A'. */
export function hintReason(cards, upcard) {
  const d = upValue(upcard);
  const up = UP_NAME[d] ?? String(d);
  if (isPair(cards)) {
    const cv = cardValue(cards[0]);
    const name = cv === 1 ? 'Aces' : cv === 10 ? 'tens' : `${cv}s`;
    return `Pair of ${name} vs ${up}`;
  }
  const v = handValue(cards);
  return `${v.soft ? 'Soft' : 'Hard'} ${v.total} vs ${up}`;
}
