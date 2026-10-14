// =============================================================================
// Slots config — "Golden Paw": symbols, paylines, paytable, reel strips, bets.
// Pure data (no Phaser), shared by logic.js, the scene, the tests and the RTP script.
//
// FROZEN MATH (node scripts/rtp-check.mjs --only slots, 2026-10-14):
//   base-game lines (exact)      85.96 % (one line, in line bets = base line RTP)
//   scatter pays (exact)          1.45 %
//   full game incl. free spins   96.20 % exact (Wald + capped retrigger chain),
//                                Monte Carlo 8M rounds: 96.15 % +- 0.11 %
//   hit rate (any win per paid spin)  ~30.4 %
//   bonus (3+ scatters)          1 in 166.9 spins (exact), 8.40 free spins per bonus
// Change a strip or a pay and these numbers move: re-run the RTP script and
// update this comment.
// =============================================================================

export const REELS = 5;
export const ROWS = 3;

export const WILD = 'wild';
export const SCATTER = 'scatter';

/** High -> low. Texture key = `sym-${id}`. */
export const SYMBOLS = ['wild', 'scatter', 'booker', 'soba', 'bone', 'ball', 'hydrant', 'bowl'];

export const SYMBOL_NAMES = {
  wild: 'Golden Paw', scatter: 'Star Tag', booker: 'Booker', soba: 'Soba',
  bone: 'Bone', ball: 'Tennis Ball', hydrant: 'Hydrant', bowl: 'Dog Bowl',
};
/** Short caps names for the win line message ("LINE 3 · 3x BONE · 40"). */
export const SYMBOL_SHORT = {
  wild: 'GOLDEN PAW', scatter: 'STAR TAG', booker: 'BOOKER', soba: 'SOBA',
  bone: 'BONE', ball: 'BALL', hydrant: 'HYDRANT', bowl: 'BOWL',
};

/**
 * 10 fixed paylines: rows (0 top, 1 middle, 2 bottom) on reels 1..5.
 * Index + 1 = the line number shown on the cabinet markers.
 */
export const LINES = [
  [1, 1, 1, 1, 1], // 1  middle
  [0, 0, 0, 0, 0], // 2  top
  [2, 2, 2, 2, 2], // 3  bottom
  [0, 1, 2, 1, 0], // 4  V
  [2, 1, 0, 1, 2], // 5  inverted V
  [0, 0, 1, 2, 2], // 6  step down
  [2, 2, 1, 0, 0], // 7  step up
  [1, 0, 0, 0, 1], // 8  arch
  [1, 2, 2, 2, 1], // 9  bowl
  [0, 1, 0, 1, 0], // 10 zig-zag
];

/** One colour per line (polyline + side markers). */
export const LINE_COLORS = [
  0xffd23f, 0xff5e5b, 0x3ddc97, 0x4cc9f0, 0xf72585,
  0xff9f1c, 0xb388ff, 0x9ef01a, 0x00f5d4, 0xffffff,
];

/** Line pays in LINE BETS for 3 / 4 / 5 of a kind (left to right). */
export const PAYTABLE = {
  wild: { 3: 50, 4: 250, 5: 1000 },
  booker: { 3: 25, 4: 120, 5: 500 },
  soba: { 3: 20, 4: 75, 5: 300 },
  bone: { 3: 12, 4: 40, 5: 150 },
  ball: { 3: 8, 4: 30, 5: 120 },
  hydrant: { 3: 6, 4: 20, 5: 80 },
  bowl: { 3: 5, 4: 15, 5: 60 },
};

/** Scatter pays in TOTAL BETS, anywhere on the reels. */
export const SCATTER_PAYS = { 3: 2, 4: 10, 5: 50 };

export const FREE_SPINS_AWARD = 8;   // 3+ scatters, base game or retrigger
export const FREE_SPINS_CAP = 50;    // most free spins one bonus can award in total
export const FREE_SPIN_MULT = 2;     // every free-spin win x2

/** Line bet steps; total bet = line bet x 10 (capped by the VIP table limit). */
export const LINE_BETS = [1, 2, 5, 10, 25, 50, 100, 250];

// Strip letters: W wild, S scatter, K booker, O soba, N bone, L ball, H hydrant, D dog bowl.
// 34 stops each, one scatter per reel (>= 3 stops from any other scatter, so a
// reel window never shows two). Low symbols come in pairs: wins stack across
// lines, which keeps the hit rate near 30 % at this RTP.
const CODE = { W: 'wild', S: 'scatter', K: 'booker', O: 'soba', N: 'bone', L: 'ball', H: 'hydrant', D: 'bowl' };
const STRIP_CODES = [
  'N K H H D O L L D H H D D S K L L O N N O H H D K W L L N D D O N K',
  'L L H H D D O K N O D N D W D D S L L N O W K N H H D L L H K H O N',
  'D D D L L O N K H H N D D H H O L L O K S N N K L L D D H H O N H W',
  'N W L L H H D D O K L L N K H H D D D O N D D O S W O L L H H K N N',
  'O N L L H H W D D D N K O N L L K H H D N D K H H N L L S D D K O O',
];
export const STRIPS = STRIP_CODES.map(s => s.split(' ').map(c => CODE[c]));

/** Presentation timings (ms). Turbo uses the TURBO values. */
export const TIMING = {
  KICK: 130,            // upward kick before the reels drop
  FIRST_STOP: 620,      // first reel's stop request after the spin starts
  STAGGER: 210,         // between reel stop requests
  ANTICIPATE: 520,      // slow spin after the previous reel lands while 2 scatters wait for a third
  TURBO: { KICK: 80, FIRST_STOP: 260, STAGGER: 90, ANTICIPATE: 260 },
  LINE_SHOW: 1100,      // each winning line in the cycle
  AUTO_GAP: 450,        // pause between auto spins
};
