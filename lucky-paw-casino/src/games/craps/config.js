// =============================================================================
// craps/config.js — table layout (game px, 1280x720) and timings.
//
// bg-craps: shop shelves above y≈240, wood rail y≈240–280, plain blue felt below.
// The layout sits on the felt (y 288–592); the info strip (phase line + roll
// history) sits on a dark panel over the shelves; the chip tray and buttons use
// the shared control strip (y 604–712).
// =============================================================================

export const FELT_TOP = 286;          // just under the rail = the dice's back wall
export const WALL_Y = 300;            // dice ground y where they hit the back wall

export const L = {
  // left block (line bets + field + point boxes)
  left: 206,
  right: 852,
  pointBoxes: { x: 258, y: 290, w: 94, h: 70, gap: 6 },  // 6 boxes: 258..852
  puckOff: { x: 228, y: 325 },                            // puck rest (OFF) left of the boxes
  field: { x: 206, y: 368, w: 646, h: 76 },
  dontPass: { x: 206, y: 452, w: 646, h: 48 },
  pass: { x: 206, y: 508, w: 478, h: 84 },
  odds: { x: 692, y: 508, w: 160, h: 84 },
  // right column: one-roll props
  props: { x: 864, y: 290, w: 220, header: 22 },
  propBoxes: [
    { key: 'any7', y: 318, h: 86, name: 'ANY 7', pays: '4 to 1', note: 'rolls a 7' },
    { key: 'anyCraps', y: 410, h: 86, name: 'ANY CRAPS', pays: '7 to 1', note: '2, 3 or 12' },
    { key: 'yo', y: 502, h: 90, name: 'YO 11', pays: '15 to 1', note: 'rolls 11' },
  ],
  // info panel over the shelves
  info: { x: 200, y: 74, w: 610, h: 104 },
  // controls
  tray: { x: 410, y: 664 },
  clearBtn: { x: 688, y: 664, w: 128 },
  rebetBtn: { x: 826, y: 664, w: 128 },
  rollBtn: { x: 1046, y: 664, w: 232 },
};

export const DICE = {
  TEX: 16,           // texture px per face
  SCALE: 3,          // on-table scale (48 px)
  MINI: 1.5,         // layout icons (24 px)
  HOME: [{ x: 968, y: 262 }, { x: 1010, y: 265 }],   // the stickman's spot on the rail
  START: { x: 206, y: 548 },                           // Soba's paw
  REST: { x: [440, 690], y: [394, 428] },              // first die rest box (2nd is offset)
  WALL_X: [560, 760],
  THROW_MS: 560,
  BOUNCE_MS: 440,
  SETTLE_MS: 200,
  FETCH_MS: 240,     // dice slide from the stickman to Soba before a throw
  HOME_MS: 520,      // stick pulls the dice back
  ARC: 130,          // throw height (px)
};

export const COL = {
  LINE: 0xf6ecd4,      // layout lines (cream)
  BOX: 0x0a1f4a,       // box fill (dark blue)
  PROP: 0x4a1020,      // prop column fill (dark red)
  GOLD: 0xf2c94c,
  RED: 0xe0574a,
  GREEN: 0x5fd38d,
  DIE: 0xd0302a,
};

export const HISTORY_MAX = 12;
