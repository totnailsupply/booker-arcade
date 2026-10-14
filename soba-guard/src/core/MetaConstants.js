// =============================================================================
// MetaConstants.js — numbers and strings for the meta layer (Step 2b): menus,
// save data, progression and the Treat Shop. Gameplay tunables stay in
// Constants.js. Pure data: no Phaser import.
// =============================================================================

// One UI font for every menu string. Verdana is built for small sizes, is on
// every desktop and phone (Tahoma / DejaVu Sans as fallbacks), and with a 3 px
// dark stroke it reads cleanly at 640x360 scaled up with nearest-neighbour.
// The battle HUD may adopt it later (it still uses Constants.UI.FONT).
export const META_FONT = 'Verdana, Tahoma, "DejaVu Sans", "Segoe UI", sans-serif';

export const META_TEXT = {
  TITLE: 26,
  SUBTITLE: 20,
  HEADING: 16,
  LABEL: 14,
  BODY: 11,
  SMALL: 9,
  STROKE: 3,
  STROKE_BIG: 5,
};

export const META_COLORS = {
  SKY_TOP: 0x120a26,
  SKY_BOTTOM: 0x2a1840,
  STAR: 0xfff6e0,
  MOON: 0xfff3c8,
  MOON_SHADE: 0xe8d8a0,
  PANEL: 0x2a1a2e,
  PANEL_EDGE: 0x5a3a24,
  PANEL_INNER: 0x3a2438,
  PANEL_ALPHA: 0.94,
  SHADE: 0x000000,
  SHADE_ALPHA: 0.6,
  FOCUS: 0xfff3b0,
  FOCUS_GLOW: 0xffd84a,
  BTN: 0xc8553d,
  BTN_HOVER: 0xe0705a,
  BTN_ALT: 0x5a4a6a,
  BTN_ALT_HOVER: 0x7a6a8a,
  BTN_GOOD: 0x4a8a3a,
  BTN_GOOD_HOVER: 0x62a84e,
  BTN_DIM: 0x4a4050,
  BTN_DIM_HOVER: 0x5a5060,
  BTN_LIP: 0x1a1220,
  NODE: 0xe8d5a8,
  NODE_CLEARED: 0xffd84a,
  NODE_LOCKED: 0x4a4258,
  NODE_EDGE: 0x1a1220,
  PATH: 0xe8d5a8,
  PATH_LOCKED: 0x5a5268,
  PIP_ON: 0xffd84a,
  PIP_OFF: 0x4a4050,
  STAR_EMPTY: 0x8a7a90,
  LANTERN: 0xe8402a,
  LANTERN_CAP: 0xffd84a,
  LANTERN_GLOW: 0xffb04a,
  LANTERN_STRING: 0x1a1220,
  CARD: 0xe8d5a8,
  CARD_EDGE: 0x8a5a34,
  MUTE_SLOT: 0xfff6e0,
  TEXT: '#fff6e0',
  TEXT_MUTED: '#c8b8a0',
  TEXT_GOLD: '#ffd84a',
  TEXT_DANGER: '#ff6a5a',
  TEXT_GOOD: '#9ae07a',
  TEXT_DARK: '#2a1a2e',
  TEXT_STROKE: '#1a1220',
};

// --- Save data (PLAN §5) ------------------------------------------------------
export const SAVE = {
  KEY: 'soba-guard:save',
  VERSION: 1,
  BONES_PER_STAR: 5,
  STAR_COUNT: 3,
  START_UNITS: ['luckycat', 'steamer', 'onigiri'],
  RESET_FLAG: 'reset',   // ?reset=1 wipes the save on load (tests)
  TEST_FLAG: 'test',     // ?test=1 installs window.__TEST_FINISH__
};

// Results star labels, in the order of result.stars
export const STAR_LABELS = ['Cleared', 'No scooter used', 'No crew lost'];

export const LOSS_TIPS = [
  'Tip: Lucky Cats first. More coins means more steamers.',
  'Tip: an Onigiri Wall buys your steamers time.',
  'Tip: Bark (B) knocks the lid off a Pot-Lid Rat.',
  'Tip: Soba fetches coins in her own row. Press F to move her.',
];

// --- Level select map (PLAN §6) -------------------------------------------------
// The five nodes and where they sit on the map (screen px). `reward` is the
// unit a first clear unlocks when the level data doesn't say (level.rewardUnits).
export const LEVEL_NODES = [
  { n: 1, name: 'Back Garden', x: 92, y: 236, reward: 'chili' },
  { n: 2, name: 'Night Market', x: 206, y: 156, reward: null },
  { n: 3, name: 'Rooftops', x: 320, y: 224, reward: null },
  { n: 4, name: 'Bamboo Grove', x: 434, y: 148, reward: null },
  { n: 5, name: 'Temple Gate', x: 548, y: 214, reward: null },
];

// --- Shared menu layout ----------------------------------------------------------
export const MENU = {
  FADE_MS: 220,
  BTN_H: 40,            // touch targets are at least 40 px tall
  BTN_W: 168,
  BTN_SMALL_W: 104,
  BTN_RADIUS: 6,
  BTN_LIP: 3,           // dark strip under a button (chunky arcade look)
  BTN_SHINE: 15,        // % lighter highlight line on a button face
  PANEL_BORDER: 3,
  BTN_PRESS_SCALE: 0.94,
  BTN_PRESS_MS: 60,
  FOCUS_PAD: 3,         // focus ring distance from the focused thing
  FOCUS_WIDTH: 2,
  FOCUS_PULSE_MS: 520,
  FOCUS_PULSE_MIN: 0.45,
  NAV_PERP_WEIGHT: 2,   // spatial nav: sideways distance counts double
  BONE_BADGE: { X: 8, Y: 8, W: 84, H: 28 },
  BACK_BTN: { X: 8, Y: 8, W: 88, H: 40 },
  MUTE_SLOT: { X: 600, Y: 8, W: 32, H: 32 }, // Step 3: the MuteButton goes here
  ICON_SCALE: 2,
  SHAKE_PX: 4,
  SHAKE_MS: 50,
  SHAKE_REPEAT: 3,
  TOAST_MS: 1400,
  TOAST_Y: 338,
};

export const TITLE_MENU = {
  LOGO_Y: 72,
  LOGO_BOB_PX: 3,
  LOGO_BOB_MS: 1600,
  PLAY_Y: 176,
  SHOP_Y: 224,
  HINT_Y: 268,
  GROUND_Y: 320,        // top of the garden strip
  HOUSE_X: 0,
  ALLEY_X: 472,
  BACKDROP_Y: 112,      // house/alley art top (they are 248 px tall)
  SOBA_X: 150,
  SOBA_SCALE: 2,
  CAT_X: 108,
  STEAMER_X: 530,
  RAT_X: 600,
  RAT_PEEK_PX: 10,
  RAT_PEEK_MS: 1800,
  SPRITE_SCALE: 1,
  SOBA_IDLE_FPS: 3,
  SKY_BANDS: 8,
  STAR_RNG: { A: 1103515245, C: 12345 },
  HEDGE_LEFT: 64,
  HEDGE_BUMP_R: 6,
  HEDGE_BUMP_STEP: 10,
  LANTERN_SWAY_STEP_MS: 90,
  STAR_COUNT: 46,
  STAR_SEED: 7,
  MOON: { X: 584, Y: 76, R: 16 },
  // lanterns hang from the top edge on both sides of the logo
  LANTERNS: [
    { x: 36, y: 62 }, { x: 108, y: 48 }, { x: 144, y: 84 }, { x: 500, y: 84 }, { x: 540, y: 48 },
  ],
  LANTERN_RX: 6,
  LANTERN_RY: 8,
  LANTERN_SWAY_DEG: 4,
  LANTERN_SWAY_MS: 1400,
};

export const SELECT_MENU = {
  TITLE_Y: 26,
  SUBTITLE_DY: 24,
  NODE_R: 22,
  HIT_PAD: 6,
  PATH_BEND: 10,
  HILLS: [
    { x0: -40, step: 120, dy: 10, r: 110, alpha: 0.8 },
    { x0: 20, step: 150, dy: 40, r: 100, alpha: 1 },
  ],
  NODE_ICON_DY: -2,
  LABEL_DY: 32,          // node name below the node centre
  STARS_DY: 47,
  STAR_GAP: 14,
  STAR_SCALE: 0.75,
  PATH_DOT: 3,
  PATH_STEP: 9,
  SOBA_DY: -26,          // Soba stands above the focused node
  SOBA_HOP_MS: 260,
  INFO: { X: 8, Y: 300, W: 624, H: 54 },
  INFO_PLAY_W: 120,
  INFO_PAD: 14,
  INFO_LINE_DY: 10,
  REWARD_TEXT_DX: 22,
  TOAST_DY: 12,
  REWARD_ICON_X: 360,
  LOCK_W: 12,
  LOCK_H: 9,
};

export const SHOP_MENU = {
  TITLE_Y: 26,
  ROW_X: 24,
  ROW_W: 592,
  ROW_Y: 60,
  ROW_H: 56,
  ROW_GAP: 6,
  ICON_X: 52,
  NAME_X: 86,
  NAME_DY: -11,
  DESC_DY: 8,
  PIPS_X: 350,
  PIP_W: 14,
  PIP_H: 10,
  PIP_GAP: 4,
  COST_X: 432,
  COST_TEXT_DX: 14,
  MAX_TEXT_DX: -8,
  BUY_X: 548,
  BUY_W: 120,
  TOAST_Y: 318,          // between the last row and the footer
  FOOTER_DY: 22,
};

export const RESULTS_MENU = {
  INPUT_DELAY_MS: 300,
  PANEL: { X: 24, Y: 12, W: 592, H: 262 },
  TITLE_Y: 42,
  LEVEL_Y: 68,
  SOBA_X: 104,
  SOBA_Y: 190,           // feet
  SOBA_SCALE: 2,
  SOBA_HOP_PX: 6,
  SOBA_HOP_MS: 260,
  STARS_X: 320,
  STARS_Y: 114,
  STAR_GAP: 92,
  STAR_SCALE: 3,
  STAR_LABEL_DY: 30,
  STAR_DELAY_MS: 380,
  STAR_POP_MS: 220,
  SCORE_Y: 180,
  BONES_Y: 206,
  STATS_Y: 232,
  UNLOCK: { X: 470, Y: 92, W: 128, H: 120 },
  UNLOCK_ICON_SCALE: 2,
  UNLOCK_HEAD_DY: 14,
  BUTTONS_Y: 312,
  LOSS: { WAVE_Y: 112, SCORE_Y: 156, STATS_Y: 190, TIP_Y: 224, NOTE_Y: 248 },
  BONE_ICON_GAP: 12,
  BTN_W: 168,
  BTN_GAP: 12,
};

// Fake numbers for window.__TEST_FINISH__ (?test=1)
export const TEST_RESULT = { WIN_SCORE: 500, LOSS_SCORE: 120, WIN_KILLS: 40, LOSS_KILLS: 12 };

export const PAUSE_MENU = {
  PANEL: { X: 200, Y: 60, W: 240, H: 236 },
  TITLE_Y: 92,
  FIRST_BTN_Y: 140,
  BTN_STEP: 50,
  HINT_Y: 280,
};
