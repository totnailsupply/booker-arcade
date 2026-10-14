// Plinko layout, colours and timing (game px, 1280x720). Pure data.

export const PLINKO = {
  // Board geometry: row r (0..11) has r + 3 pegs, spaced DX apart, centred on CX.
  CX: 640,
  DX: 52,
  ROW0_Y: 136,
  DY: 35,
  PEG_R: 5,
  BALL_SIZE: 22,

  // Bins (13) sit right under the last peg row
  BIN_TOP: 530,
  BIN_H: 42,
  BIN_GAP: 4,

  // Chute mouth (balls appear here) and the pipe from Booker's seat
  CHUTE_Y: 98,

  // Cabinet backdrop over the plain wall in bg-plinko
  CABINET: { x: 278, y: 74, w: 724, h: 516 },

  // Characters
  BOOKER: { x: 872, y: 158, size: 140 },

  // Side panels
  RISK_PANEL: { x: 28, y: 84, w: 220, h: 372 },
  HISTORY: { x: 1104, y: 84, w: 160, h: 500 },

  // Controls strip
  BET_PANEL: { x: 212, y: 612, w: 380, h: 96 },
  AUTO_BTN: { x: 735, y: 664, w: 220, h: 64 },
  DROP_BTN: { x: 990, y: 664, w: 250, h: 76 },
  FLIGHT: { x: 1196, y: 664 },

  // Timing (ms)
  T: {
    CHUTE: 210,          // chute mouth -> first peg
    HOP: 158,            // peg -> next peg
    HOP_JITTER: 14,
    LAND: 175,           // last peg -> bin
    SPACE_DELAY: 360,    // hold Space: first repeat after
    SPACE_REPEAT: 210,   // then every
  },

  // Neon palette
  NEON: 0xb48cff,
  NEON_HOT: 0xff5fd2,
  NEON_DEEP: 0x8e5cd9,
  BALL_TRAIL: 0xd9f04a,
  PEG: 0xeadcff,

  // Bin colours by distance from the centre (0 = middle, 6 = edge): cool -> gold
  BIN_COLORS: [0x4a55d6, 0x6a4fe0, 0x9a4fd8, 0xcc4fb4, 0xee5f86, 0xf58f48, 0xf2c94c],
};

export const binColor = (bin) => PLINKO.BIN_COLORS[Math.abs(bin - 6)];
