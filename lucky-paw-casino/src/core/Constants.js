// =============================================================================
// Constants.js — every shared number, colour and string for Lucky Paw Casino.
// Pure ES module (no Phaser import) so node tests and Wallet.js can read it.
//
// Colours are 0xRRGGBB numbers (Phaser fills/tints). Use css(COLORS.X) for
// Text styles, which want '#rrggbb' strings.
// =============================================================================

export const GAME = {
  WIDTH: 1280,
  HEIGHT: 720,
  TITLE: 'Lucky Paw Casino',
};

/** '#rrggbb' from a 0xRRGGBB number (Text styles take strings). */
export const css = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

// --- Palette -------------------------------------------------------------------
// After-hours backroom: green felt, warm wood, brass lamps, cream cards.
export const COLORS = {
  PAGE_BG: 0x0d1410,

  FELT_DARK: 0x0f2c1e,
  FELT: 0x1b5a3a,
  FELT_LIGHT: 0x2b7a50,

  WOOD_DARK: 0x2a170c,
  WOOD: 0x5a3820,
  WOOD_LIGHT: 0x8a5a33,

  BRASS_DARK: 0x8a6a2a,
  BRASS: 0xc9a24a,
  GOLD: 0xf2c94c,
  GOLD_LIGHT: 0xffe49a,

  CREAM: 0xf6ecd4,
  CREAM_DARK: 0xd9c9a3,
  INK: 0x1a120b,
  SHADOW: 0x000000,

  PANEL: 0x1a120c,          // dark wood panel fill
  PANEL_LIGHT: 0x2e1f14,
  PANEL_EDGE: 0xc9a24a,     // brass border

  TEXT: 0xf6ecd4,
  TEXT_DIM: 0xb9a888,
  TEXT_DARK: 0x1a120b,

  WIN: 0x5fd38d,
  LOSE: 0xe0574a,
  PUSH: 0xb9a888,
  WARN: 0xf0a43a,

  RED: 0xc0392b,
  BLACK: 0x1b1b1f,

  // One accent per game (felt tint, card glow, button style)
  PLINKO: 0x8e5cd9,      // violet
  BLACKJACK: 0x2e9e5b,   // green
  CRAPS: 0x3a7bd5,       // blue
  ROULETTE: 0x9b2335,    // burgundy
  SLOTS: 0xe0a526,       // gold
};

// --- Typography ----------------------------------------------------------------
// Jersey 10 and Silkscreen are bundled (@fontsource) and loaded before the game boots.
export const FONT = {
  // Jersey 10: one condensed pixel face for all UI text and numbers. Earlier
  // picks failed in play: Pixelify Sans closed "c" into "o" ("Blaokjaok"),
  // Tiny5 drew 8 like "$" (a balance of 874 read "$74"). Jersey's 8/$, 5/S
  // and C/O are all distinct. It is condensed and small for its px size, so
  // text() multiplies every requested size by SCALE (1.3 matches Tiny5's
  // line widths, so layouts sized for Tiny5 still fit). Canvas code that sets
  // ctx.font itself must multiply by FONT.SCALE too. One weight: never bold.
  FAMILY: '"Jersey 10", "Trebuchet MS", system-ui, monospace',
  SCALE: 1.3,
  // Silkscreen Bold (all caps, wide): optional display face for big titles
  // and banners. text(..., { display: true }). Not scaled.
  DISPLAY: '"Silkscreen", "Jersey 10", monospace',
  // Numbers use the same face; text(..., { num: true }) still routes here.
  NUMBERS: '"Jersey 10", monospace',
  NUM_SCALE: 1,
  // Sizes in game px (1280x720). 20 is the floor: a phone in landscape shows
  // the canvas at ~0.54x, so 20 px reads as ~11 px there.
  SIZE: { TINY: 18, SMALL: 20, BODY: 24, LARGE: 30, TITLE: 40, HUGE: 64, MEGA: 96 },
  WEIGHT: { REGULAR: '400', MEDIUM: '500', SEMI: '600', BOLD: '700' },
};

// --- Layout --------------------------------------------------------------------
// Shared positions so every game seats Soba and Booker in the same places.
export const LAYOUT = {
  TOPBAR_H: 64,
  // Safe play area for game content (between the top bar and the control strip,
  // clear of the Soba seat and the Booker slot).
  PLAY: { x: 200, y: 76, w: 880, h: 520 },
  // Control strip under the play area (chip tray, deal/spin buttons)
  CONTROLS: { x: 200, y: 604, w: 1070, h: 108 },
  // Character seats (centre of the portrait)
  SOBA_SEAT: { x: 100, y: 610, size: 160 },
  BOOKER_SLOT: { x: 1180, y: 190, size: 170 },
  SAFE_ZONE: { top: 64, bottom: 8, left: 8, right: 8 },
  MIN_TOUCH: 56,          // min button height (touch)
  RADIUS: 14,
};

// --- Chips ---------------------------------------------------------------------
export const CHIPS = [
  { value: 1, color: 0xf3efe6, edge: 0x2f6fb5, text: 0x1a120b, key: 'chip-1', mini: 'chip-mini-1' },
  { value: 5, color: 0xc8352b, edge: 0xf6ecd4, text: 0xffffff, key: 'chip-5', mini: 'chip-mini-5' },
  { value: 25, color: 0x2e9e5b, edge: 0xf6ecd4, text: 0xffffff, key: 'chip-25', mini: 'chip-mini-25' },
  { value: 100, color: 0x222228, edge: 0xf2c94c, text: 0xf2c94c, key: 'chip-100', mini: 'chip-mini-100' },
  { value: 500, color: 0x7b3fc4, edge: 0xffe49a, text: 0xffffff, key: 'chip-500', mini: 'chip-mini-500' },
];
export const CHIP_VALUES = CHIPS.map(c => c.value);
export const CHIP_SIZE = 64;            // chip-N texture (px)
export const CHIP_MINI = { W: 48, H: 26, STEP: 6 };  // chip-mini-N texture, stack step (px)

/** Breaks an amount into chip values, largest first (for stacks). */
export function chipBreakdown(amount, max = 12) {
  const out = [];
  let left = Math.max(0, Math.floor(amount));
  for (let i = CHIP_VALUES.length - 1; i >= 0 && out.length < max; i--) {
    const v = CHIP_VALUES[i];
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  }
  return out;
}

// --- Economy (PLAN.md section 2) ------------------------------------------------
export const ECONOMY = {
  START_BALANCE: 1000,
  BAILOUT_BELOW: 10,       // balance < 10 and nothing in play
  BAILOUT_AMOUNT: 500,
  DAILY_AMOUNT: 250,
  XP_PER_CHIP: 1,
  BIG_WIN_X: 10,           // paid >= 10x wagered -> BIG_WIN event / banner
  MEGA_WIN_X: 50,
  LOG_SIZE: 200,           // wallet ring buffer
};

export const VIP_TIERS = [
  { tier: 0, name: 'Puppy', xp: 0, gift: 0, maxBet: 100, color: 0xc9a27a },
  { tier: 1, name: 'Good Boy', xp: 2500, gift: 250, maxBet: 250, color: 0x9fc7e8 },
  { tier: 2, name: 'Top Dog', xp: 10000, gift: 1000, maxBet: 500, color: 0x5fd38d },
  { tier: 3, name: 'Big Bone', xp: 40000, gift: 4000, maxBet: 1000, color: 0xb487f0 },
  { tier: 4, name: 'Golden Paw', xp: 150000, gift: 15000, maxBet: 2500, color: 0xf2c94c },
];

// --- Games ------------------------------------------------------------------------
// key = Phaser scene key; id = wallet/stats id and folder name.
// minBet: the smallest stake the game accepts (Plinko pays tenths, Slots bets 10 lines). Default 1.
export const GAMES = [
  { key: 'Plinko', id: 'plinko', name: 'Plinko', accent: COLORS.PLINKO, icon: 'icon-plinko', bg: 'bg-plinko', minBet: 10, pitch: 'Drop tennis balls down 12 rows of pegs. Up to 170x!', music: 'plinko' },
  { key: 'Blackjack', id: 'blackjack', name: 'Blackjack', accent: COLORS.BLACKJACK, icon: 'icon-blackjack', bg: 'bg-blackjack', pitch: 'Beat Booker to 21. Soba knows the book.', music: 'blackjack' },
  { key: 'Craps', id: 'craps', name: 'Craps', accent: COLORS.CRAPS, icon: 'icon-craps', bg: 'bg-craps', pitch: 'Soba rolls the bones. Pass, odds, props.', music: 'craps' },
  { key: 'Roulette', id: 'roulette', name: 'Roulette', accent: COLORS.ROULETTE, icon: 'icon-roulette', bg: 'bg-roulette', pitch: 'Single zero wheel. Pick a number, any number.', music: 'roulette' },
  { key: 'Slots', id: 'slots', name: 'Slots', accent: COLORS.SLOTS, icon: 'icon-slots', bg: 'bg-slots', minBet: 10, pitch: 'Five reels, ten lines, golden paw wilds.', music: 'slots' },
];
export const GAME_IDS = GAMES.map(g => g.id);
export const gameById = (id) => GAMES.find(g => g.id === id || g.key === id) || null;

// --- Timing / feel -------------------------------------------------------------------
export const TIMING = {
  FADE_MS: 220,              // scene fade in/out
  COUNTER_MS: 650,           // balance counter roll
  FLOAT_MS: 1100,            // float text life
  TOAST_MS: 1600,
  REACT_MS: 1600,            // portrait reaction hold
  SAY_MS: 2200,              // speech bubble
  BANNER_MS: { WIN: 1400, BIG: 2400, MEGA: 3400 },
  CHIP_FLY_MS: 380,
};

// --- Audio mix (dB) ---------------------------------------------------------------------
export const AUDIO = {
  MASTER_DB: -1,
  MUSIC_DB: -11,
  SFX_DB: -3,
  REVERB_RETURN_DB: -10,
  REVERB_S: 1.8,
  REVERB_DECAY: 3.0,
  LIMITER: { THRESHOLD_DB: -3, KNEE_DB: 2, RATIO: 20, ATTACK_S: 0.002, RELEASE_S: 0.15 },
  // Music layers (dB inside the music bus), pans and reverb sends
  MIX: { keys: -9, bass: -6, lead: -11, brush: -20, ride: -24, kick: -12, snare: -18, bell: -18, perc: -18 },
  PAN: { keys: -0.15, lead: 0.25, ride: 0.3, brush: -0.2, bell: 0.35, perc: -0.3 },
  MUSIC_SEND: { keys: -12, lead: -8, bell: -6 },
  DUCK_DB: 6,
  DUCK_ATTACK_S: 0.04,
  DUCK_WIN_HOLD_S: 1.2,
  DUCK_WIN_RELEASE_S: 1.0,
  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.15,
  STOP_FADE_S: 0.25,
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,
  // SFX
  PITCH_JITTER: 0.03,
  VOL_JITTER_DB: 1.0,
  SFX_GAP_MS: { hover: 60, peg: 25, wheelTick: 30, chip: 30, coin: 35, reelStop: 40, card: 40 },
};

export const SAVE = {
  KEY: 'lucky-paw-casino:v1',
  VERSION: 1,
};

export const DEPTH = {
  BG: 0,
  TABLE: 10,
  GAME: 100,
  CHARACTERS: 400,
  UI: 800,
  TOPBAR: 900,
  FLOAT: 950,
  BANNER: 1000,
  MODAL: 1100,
  TOAST: 1200,
};
