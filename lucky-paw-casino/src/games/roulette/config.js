// Roulette table geometry, colours and spin timing (game px, 1280x720).
// Pure data: no Phaser import.

export const RL_COLORS = {
  RED: 0xb8302a,
  BLACK: 0x1c1a1f,
  GREEN: 0x1e7b4c,
  FELT: 0x4a0f1a,          // layout panel (a shade darker than the burgundy room felt)
  FELT_EDGE: 0x2a070e,
  LINE: 0xf6ecd4,          // cream grid lines
  BRASS: 0xc9a24a,
  GOLD: 0xf2c94c,
  HOVER: 0xffe49a,
};

export const COLOR_OF = { red: RL_COLORS.RED, black: RL_COLORS.BLACK, green: RL_COLORS.GREEN };

// --- the betting layout -------------------------------------------------------
// Zero on the left, 3 x 12 numbers (top row 3,6..36), 2:1 column cells on the right,
// dozens row and even-money row underneath.
export const TABLE = {
  ZX: 206,            // zero cell left edge
  ZW: 60,             // zero cell width
  NX: 266,            // first number column left edge
  TOP: 352,           // top of the number grid
  CW: 60,             // number cell width
  CH: 54,             // number cell height
  COLW: 64,           // 2:1 column cell width
  RH: 44,             // dozens / even-money row height
};
TABLE.RIGHT = TABLE.NX + 12 * TABLE.CW + TABLE.COLW; // 1050
TABLE.BOTTOM = TABLE.TOP + 3 * TABLE.CH + 2 * TABLE.RH; // 602

/** Even-money row order, left to right. */
export const EVEN_ROW = ['low', 'even', 'red', 'black', 'odd', 'high'];

/** Rectangle {x, y, w, h, cx, cy} of a bet cell. */
export function cellRect(id) {
  const T = TABLE;
  const mk = (x, y, w, h) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
  if (/^\d+$/.test(id)) {
    const n = Number(id);
    if (n === 0) return mk(T.ZX, T.TOP, T.ZW, 3 * T.CH);
    const col = Math.ceil(n / 3) - 1;
    const row = 2 - ((n - 1) % 3);
    return mk(T.NX + col * T.CW, T.TOP + row * T.CH, T.CW, T.CH);
  }
  const m = /^col([123])$/.exec(id);
  if (m) return mk(T.NX + 12 * T.CW, T.TOP + (3 - Number(m[1])) * T.CH, T.COLW, T.CH);
  const d = /^dozen([123])$/.exec(id);
  if (d) return mk(T.NX + (Number(d[1]) - 1) * 4 * T.CW, T.TOP + 3 * T.CH, 4 * T.CW, T.RH);
  const i = EVEN_ROW.indexOf(id);
  if (i >= 0) return mk(T.NX + i * 2 * T.CW, T.TOP + 3 * T.CH + T.RH, 2 * T.CW, T.RH);
  return null;
}

// --- the wheel ------------------------------------------------------------------------
export const WHEEL = {
  X: 182,
  Y: 208,
  R: 136,             // outer bowl
  TRACK_OUT: 118,     // ball track (outer)
  TRACK_IN: 100,      // ball track (inner) = rotor edge
  NUM_IN: 82,         // number ring inner edge
  POCKET_IN: 66,      // pocket floor inner edge
  CONE_IN: 28,        // turret base
  BALL_TRACK_R: 109,  // ball orbit radius
  BALL_POCKET_R: 74,  // ball resting radius
  BALL_R: 6.5,
  TEX_SCALE: 2,       // textures drawn at 2x for crisp rotation
};

// --- upper panels -----------------------------------------------------------------------
export const PANELS = {
  MARQUEE: { x: 340, y: 80, w: 476, h: 150 },
  INFO: { x: 828, y: 80, w: 254, h: 150 },
  HISTORY: { x: 340, y: 240, w: 742, h: 100 },
};

// --- spin feel ------------------------------------------------------------------------------
export const SPIN = {
  T: 4800,            // ms from launch to the ball settling
  DROP_U: 0.69,       // fraction of T when the ball leaves the track
  FALL_MS: 260,       // track -> pocket fall
  REVS: 4.5,          // relative revolutions of the ball against the rotor
  EASE_P: 2.3,        // relative offset = D0 * (1 - u)^p
  WHEEL_IDLE: 0.35,   // rad/s while betting
  WHEEL_SPIN: 2.6,    // rad/s at launch
  WHEEL_TAU: 3.0,     // s, decay back to idle
  LAUNCH_ANGLE: -Math.PI * 0.2, // ball starts at the upper right (towards Booker)
  BOUNCES: [0, 0.42, 0.72, 0.9, 1], // bounce arc boundaries (fraction of the bounce phase)
  BOUNCE_H: [16, 8, 3.5, 1.2],      // px the ball hops out of the pocket ring
  // after the ball settles
  REVEAL_MS: 520,
  SWEEP_MS: 460,
  PAY_MS: 700,
  COLLECT_MS: 760,
};

export const HISTORY_LEN = 12;
