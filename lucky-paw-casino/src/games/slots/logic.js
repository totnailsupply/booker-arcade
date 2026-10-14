// =============================================================================
// Slots logic — "Golden Paw". Pure JS (no Phaser), node-importable.
//
//   import { spinOutcome, evaluateGrid, gridFromStops, ... } from './logic.js';
//
// Grid convention: grid[reel][row], reel 0..4 left to right, row 0 = top,
// 1 = middle, 2 = bottom. A reel's stop is the strip index shown in the TOP row:
//   grid[r][row] = strips[r][(stop + row) % strip.length]
//
// Money convention: every pay in this file is in CHIPS for the given line bet.
// Line pays = PAYTABLE[sym][count] * lineBet; scatter pays = SCATTER_PAYS[n] *
// totalBet (totalBet = lineBet * 10). In free spins everything is multiplied
// by FREE_SPIN_MULT.
// =============================================================================

import {
  REELS, ROWS, LINES, STRIPS, PAYTABLE, SCATTER_PAYS, WILD, SCATTER,
  FREE_SPINS_AWARD, FREE_SPINS_CAP, FREE_SPIN_MULT, LINE_BETS, SYMBOLS,
} from './config.js';

export const NUM_LINES = LINES.length;

/** Total bet for a line bet. */
export const totalBetFor = (lineBet) => lineBet * NUM_LINES;

/** Line bets whose total fits under maxTotal (always at least the smallest). */
export function allowedLineBets(maxTotal) {
  const ok = LINE_BETS.filter(b => totalBetFor(b) <= maxTotal);
  return ok.length ? ok : [LINE_BETS[0]];
}

/** grid[reel][row] from 5 stops (wraps around each strip). */
export function gridFromStops(stops, strips = STRIPS) {
  const grid = [];
  for (let r = 0; r < REELS; r++) {
    const s = strips[r];
    const L = s.length;
    const col = [];
    for (let row = 0; row < ROWS; row++) col.push(s[(((stops[r] + row) % L) + L) % L]);
    grid.push(col);
  }
  return grid;
}

/** Random stops, one rng.int(L) per reel, left to right. */
export function randomStops(rng, strips = STRIPS) {
  return strips.map(s => rng.int(s.length));
}

/**
 * Best win for 5 symbols read left to right (one line).
 * Wilds substitute for every symbol except the scatter and also pay as
 * themselves; the line pays only its highest win.
 * @returns {{symbol, count, mult}|null}  mult in line bets
 */
export function evaluateLine(syms, paytable = PAYTABLE) {
  // Leading wild run
  let w = 0;
  while (w < syms.length && syms[w] === WILD) w++;
  let best = null;
  if (w >= 3 && paytable[WILD][w]) best = { symbol: WILD, count: w, mult: paytable[WILD][w] };
  if (w < syms.length) {
    const s = syms[w];
    if (s !== SCATTER && paytable[s]) {
      let n = w + 1;
      while (n < syms.length && (syms[n] === s || syms[n] === WILD)) n++;
      const m = n >= 3 ? paytable[s][n] || 0 : 0;
      // ties go to the real symbol (it used the wilds as substitutes)
      if (m > 0 && (!best || m >= best.mult)) best = { symbol: s, count: n, mult: m };
    }
  }
  return best;
}

/** Scatters anywhere in the grid: { count, cells: [[reel,row],...] } */
export function countScatters(grid) {
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    for (let row = 0; row < grid[r].length; row++) if (grid[r][row] === SCATTER) cells.push([r, row]);
  }
  return { count: cells.length, cells };
}

/** Free spins a spin awards given its scatter count and how many were awarded so far this bonus. */
export function freeSpinsFor(scatters, awardedSoFar = 0) {
  if (scatters < 3) return 0;
  return Math.max(0, Math.min(FREE_SPINS_AWARD, FREE_SPINS_CAP - awardedSoFar));
}

/**
 * Evaluate a whole grid.
 * @param {string[][]} grid  grid[reel][row]
 * @param {object} o  { lineBet = 1, free = false (2x wins), awardedSoFar = 0 }
 * @returns {{
 *   lines: {line, symbol, count, mult, pay, cells}[],  line is 1-based
 *   lineWin, scatters, scatterCells, scatterPay, win, multiplier, freeSpins
 * }}
 */
export function evaluateGrid(grid, { lineBet = 1, free = false, awardedSoFar = 0 } = {}) {
  const k = free ? FREE_SPIN_MULT : 1;
  const lines = [];
  let lineWin = 0;
  LINES.forEach((rows, i) => {
    const syms = rows.map((row, r) => grid[r][row]);
    const best = evaluateLine(syms);
    if (!best) return;
    const pay = best.mult * lineBet * k;
    lineWin += pay;
    lines.push({
      line: i + 1, symbol: best.symbol, count: best.count, mult: best.mult, pay,
      cells: rows.slice(0, best.count).map((row, r) => [r, row]),
    });
  });
  const sc = countScatters(grid);
  const scatterPay = (SCATTER_PAYS[Math.min(sc.count, 5)] || 0) * totalBetFor(lineBet) * k;
  return {
    lines, lineWin,
    scatters: sc.count, scatterCells: sc.cells, scatterPay,
    win: lineWin + scatterPay,
    multiplier: k,
    freeSpins: freeSpinsFor(sc.count, awardedSoFar),
  };
}

/** One spin from the rng: stops -> grid -> evaluation. */
export function spinOutcome(rng, { lineBet = 1, free = false, awardedSoFar = 0, strips = STRIPS } = {}) {
  const stops = randomStops(rng, strips);
  const grid = gridFromStops(stops, strips);
  return { stops, grid, ...evaluateGrid(grid, { lineBet, free, awardedSoFar }) };
}

/**
 * A whole paid round, free spins included (RTP sim + tests). The scene plays
 * the same steps one at a time.
 * @returns {{ wagered, baseWin, bonusWin, win, freeSpinsPlayed, triggered, hit }}
 */
export function playRound(rng, lineBet = 1) {
  const wagered = totalBetFor(lineBet);
  const base = spinOutcome(rng, { lineBet });
  let left = base.freeSpins;
  let awarded = base.freeSpins;
  let bonusWin = 0;
  let played = 0;
  while (left > 0) {
    const fs = spinOutcome(rng, { lineBet, free: true, awardedSoFar: awarded });
    left -= 1;
    played += 1;
    bonusWin += fs.win;
    left += fs.freeSpins;
    awarded += fs.freeSpins;
  }
  return {
    wagered, baseWin: base.win, bonusWin, win: base.win + bonusWin,
    freeSpinsPlayed: played, triggered: base.freeSpins > 0, hit: base.win > 0,
  };
}

// --- exact math ------------------------------------------------------------------------

/** Per-reel symbol probabilities { sym: p } (a row of a reel is uniform over its strip). */
export function reelProbs(strips = STRIPS) {
  return strips.map((s) => {
    const p = {};
    for (const sym of s) p[sym] = (p[sym] || 0) + 1 / s.length;
    return p;
  });
}

/**
 * Exact expected line pay (in line bets) for ONE line. Every line has the same
 * value: its 5 cells are on different reels, each uniform over its strip and
 * independent. Base-game line RTP = this value (10 lines, 10 line bets).
 * Also returns per-(symbol,count) hit probabilities.
 */
export function exactLineEV(strips = STRIPS, paytable = PAYTABLE) {
  const probs = reelProbs(strips);
  const syms = SYMBOLS;
  let ev = 0;
  let pHit = 0;
  const contrib = {};
  const cur = [];
  const walk = (r, p) => {
    if (r === REELS) {
      const best = evaluateLine(cur, paytable);
      if (best) {
        ev += p * best.mult;
        pHit += p;
        const key = `${best.symbol}x${best.count}`;
        contrib[key] = (contrib[key] || 0) + p;
      }
      return;
    }
    for (const s of syms) {
      const q = probs[r][s] || 0;
      if (!q) continue;
      cur[r] = s;
      walk(r + 1, p * q);
    }
  };
  walk(0, 1);
  return { ev, pHit, contrib };
}

/**
 * Exact scatter distribution assuming at most one scatter fits a reel window
 * (config strips keep scatters >= ROWS stops apart): P(n scatters) for n = 0..5.
 */
export function scatterDistribution(strips = STRIPS) {
  const q = strips.map(s => (s.filter(x => x === SCATTER).length * ROWS) / s.length);
  let dist = [1];
  for (const p of q) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, n) => { next[n] += v * (1 - p); next[n + 1] += v * p; });
    dist = next;
  }
  return dist;
}
