// =============================================================================
// Constants.js — every layout number and tunable that is not unit/enemy/level
// data (those live in src/data/*). Pure data: no Phaser import, so the sim and
// the Node balance scripts can read it.
// =============================================================================

export const GAME = {
  WIDTH: 640,
  HEIGHT: 360,
};

// Nothing important is drawn outside this rect (phones with rounded corners).
export const SAFE_ZONE = { X: 4, Y: 2, W: 632, H: 356 };

// --- Screen layout (PLAN §1) -------------------------------------------------
export const LAYOUT = {
  TOP_BAR: { X: 0, Y: 0, W: 640, H: 56 },
  HOUSE: { X: 0, Y: 56, W: 72, H: 248 },
  PORCH: { X: 72, Y: 84, W: 40, H: 200 },
  ALLEY: { X: 472, Y: 56, W: 168, H: 248 },
  BOTTOM_BAR: { X: 0, Y: 296, W: 640, H: 64 },
};

export const GRID = {
  X: 112,          // left edge of column 0
  Y: 84,           // top edge of row 0
  COLS: 9,
  ROWS: 5,
  TILE: 40,
  get RIGHT() { return this.X + this.COLS * this.TILE; },   // 472
  get BOTTOM() { return this.Y + this.ROWS * this.TILE; },  // 284
};

// --- Simulation ---------------------------------------------------------------
export const SIM = {
  DT: 1 / 60,               // fixed step (s)
  MAX_STEPS_PER_FRAME: 5,   // the scene drops time beyond this (tab switches)
  EPS: 1e-9,
  PRUNE_EVERY: 30,          // steps between dead-entity sweeps
};

export const ECONOMY = {
  START_COINS: 100,
  LANTERN_FIRST: 4,         // s until the first lantern coin
  LANTERN_INTERVAL: 9,      // s between lantern coins
  LANTERN_VALUE: 25,
  LANTERN_FALL_SPEED: 30,   // px/s
  LANTERN_MARGIN_X: 20,     // lantern coins land at least this far inside the grid
  LANTERN_MARGIN_Y: 10,
  LANTERN_START_Y: 48,      // y where a lantern coin appears (under the top bar)
  COIN_BLINK_AT: 7,         // s after landing
  COIN_LIFETIME: 10,        // s after landing
  COIN_PICK_RADIUS: 14,     // px around a coin that a tap/click collects
  CAT_COIN_SPREAD_MIN: 4,   // px sideways a cat coin lands from the cat
  CAT_COIN_SPREAD_MAX: 14,
  CAT_COIN_DROP_Y: 10,      // px below the cat's centre
  CAT_COIN_HOP_S: 0.4,      // view only: hop animation length
  CAT_COIN_HOP_PX: 14,
};

export const WAVE = {
  SETUP_TIME: 20,           // s before wave 1 (Start skips it)
  NEXT_WAVE_TIME: 25,       // s after a wave started, the next one starts...
  NEXT_WAVE_HP_GONE: 0.7,   // ...or once this fraction of the wave's HP is gone
  MIN_WAVE_TIME: 6,         // s a wave lasts at least
  SPREAD: 6,                // s a normal wave's spawns are spread over
  FLAG_SPREAD: 14,          // s a flag wave's spawns are spread over
  FLAG_WARNING: 3,          // s between "huge wave" and its first spawn
  SPAWN_JITTER: 0.5,        // ± s per spawn
  MAX_SAME_LANE: 2,         // no more than this many spawns in a row on one lane
};

export const ENEMY = {
  SPAWN_X: 600,             // enemies appear in the alley here...
  SPAWN_X_JITTER: 16,       // ...plus 0..this px
  HALF_W: 10,               // body half width (hits, porch, house)
  BITE_REACH: 28,           // px from a defender's centre where a walker stops to bite
  BITE_BEHIND: 4,           // a walker overlapping a defender by this much still bites it
  FIRE_RANGE_X: 488,        // shooters only fire at enemies left of this (in view)
  SPEED_JITTER: 0.06,       // ± fraction of base speed per enemy
};

export const PROJECTILE = {
  HIT_HALF_W: 10,           // |dumpling.x - enemy.x| that counts as a hit
  SPAWN_DX: 12,             // px right of the shooter's centre
  DESPAWN_X: 660,
};

export const SCOOTER = {
  X: 92,                    // parked on the porch (centre)
  SPEED: 220,               // px/s
  HIT_AHEAD: 16,            // px ahead of the scooter that it hits
  END_X: 488,               // it clears the garden row and leaves at the alley gate
};

export const HOUSE = {
  EDGE_X: 72,               // an enemy whose body passes this reaches the door
};

// --- Soba (PLAN §4 hero) ----------------------------------------------------
export const SOBA = {
  X: 92,                    // porch centre (she stands here between dashes)
  START_ROW: 2,
  MOVE_SPEED: 160,          // px/s between rows
  FETCH_DELAY: 1,           // s a landed coin waits in her row before it flies to her
  FETCH_FLIGHT_S: 0.35,     // s the coin takes to reach her
  BARK_COOLDOWN: 18,        // s
  BARK_MIN_COOLDOWN: 6,     // shop modifiers can't push it below this
  BARK_STUN: 2.5,           // s
  BARK_PUSH: 24,            // px pushed back (right)
  BARK_RANGE_TILES: 4,      // stun/push: tiles from the porch edge (enemy front inside x <= 112 + 4*40)
  BARK_LID_X: 472,          // lids: every lid rat in her row whose front is in the garden (x <= 472)
  BARK_ANIM_S: 0.6,         // view: bark frames this long
  ZOOMIES_KILLS: 12,        // kills to fill the meter
  ZOOMIES_S: 1.2,           // dash out and back
  ZOOMIES_DAMAGE: 150,
  ZOOMIES_END_X: 472,       // she turns at the alley gate
  CHEER_FPS: 2,
};

// --- Enemy mechanics ------------------------------------------------------------
export const MECHANIC = {
  HOP_S: 0.6,               // crow hop duration
  HOP_LAND_DX: 24,          // a crow lands this far left of the defender it hops
  HOP_HEIGHT: 22,           // view: arc height (px)
};

export const TIER = {
  RECALL_REFUND: 0.5,       // fraction of everything paid for the unit
  BURST_GAP: 0.15,          // s between the dumplings of a tier-2 burst
};

// --- Balance bots (src/sim/Bots.js) ----------------------------------------------
export const BOTS = {
  NOVICE: {
    THINK_EVERY: 0.5,       // s between decisions (a human doesn't act every frame)
    COLLECT_DELAY: 1.5,     // s after a coin lands
    CATS: 4,
    MAX_STEAMERS_PER_ROW: 3,
    STEAMER_COLS: [1, 4],   // random column range for steamers
    WALL_COL: 5,
  },
  SMART: {
    CATS_FIRST: 5,          // column 0
    CATS: 10,               // columns 0 and 1
    STEAMER_COLS: [2, 3],
    WALL_COL: 4,
    STEAMERS_PER_ROW: 2,
    RESERVE: 25,            // coins kept for emergencies once the cats are out
    WALL_HEAL_FRAC: 0.4,    // tier-1 wall below this: nori wrap (full heal)
    WALL_SWAP_FRAC: 0.2,    // tier-2 wall below this: recall it and put a fresh one down
    UNIT_SAVE_FRAC: 0.5,    // bark when a biter has a non-wall below this
    ZOOMIES_MIN_HP: 300,
  },
};

export const SCORE = {
  WIN_BONUS: 100,
};

export const DEBUG = {
  SEED: 20261014,           // seed for debug starts (?skip, ?wave, ...) without ?seed
  MAX_WAVE: 99,
  MAX_COINS: 99999,
};

// --- Presentation -----------------------------------------------------------
export const VIEW = {
  WALK_FPS: 4,              // enemy walk frame rate
  BITE_FPS: 6,
  IDLE_FPS: 2,              // defender idle bob
  ACTION_FRAME_S: 0.25,     // a defender shows its action frame this long after acting
  HIT_FLASH_S: 0.08,
  BLINK_HZ: 6,              // expiring coins
  ENEMY_FOOT_Y: 36,         // sprite bottom relative to the row top
  UNIT_FOOT_Y: 36,
  COIN_DEPTH_OFFSET: 0.5,
  RESULTS_DELAY: 1.2,       // s between a loss and the Results screen
  RESULTS_DELAY_WIN: 2.2,   // s after a win (confetti and Soba's victory hops)
  PROJECTILE_Y: -4,         // dumplings fly this far above the row centre
  SOBA_FOOT_DY: 18,         // Soba's feet below her row centre
  RUN_FPS: 10,
  BARK_FPS: 8,
  STUN_ORBIT_R: 7,
  STUN_ORBIT_HZ: 1.5,
  STUN_Y: 30,               // stun star height above the feet
  STUN_SCALE: 0.75,
  BADGE_DX: 10,             // tier-2 star relative to the unit's feet
  BADGE_DY: 30,
  BADGE_SCALE: 0.75,
  LID_DROP_S: 0.7,
  LID_DROP_DX: 22,
  LID_DROP_UP: 14,
  LID_DROP_SPIN: 540,
  BARK_FX_S: 0.45,
  WOOF_RISE: 16,
  WOOF_S: 0.9,
  FETCH_ARC: 10,
  ZOOM_TRAIL_S: 0.25,
  PORCH_MARK_ALPHA: 0.35,
};

export const DEPTH = {
  BACKGROUND: 0,
  TILES: 1,
  CURSOR: 2,
  ROW_BASE: 10,             // units/enemies: ROW_BASE + row * ROW_STEP
  ROW_STEP: 10,
  PROJECTILE: 70,
  FX: 72,                   // particles, lids, death squish (Step 3a)
  SCOOTER: 75,
  SOBA: 76,                 // in front of the parked scooters
  COIN: 80,
  FX_TOP: 86,               // score pops, WOOF!, flying coins start here
  DEBUG: 90,
  HUD: 100,
  HUD_FX: 110,              // sparkles and flying coins over the HUD
  OVERLAY: 200,
};

export const UI = {
  // Same stack as MetaConstants.META_FONT (Step 3a unified the HUD with the menus)
  FONT: 'Verdana, Tahoma, "DejaVu Sans", "Segoe UI", sans-serif',
  TITLE_SIZE: 32,
  HEADING_SIZE: 20,
  BODY_SIZE: 12,
  SMALL_SIZE: 10,
  CARD_W: 44,
  CARD_H: 52,
  CARD_X: 76,               // first card's left edge
  CARD_Y: 2,
  CARD_GAP: 4,
  MAX_CARDS: 6,
  COIN_ICON_X: 14,
  COIN_ICON_Y: 18,
  COIN_TEXT_X: 38,
  COIN_TEXT_Y: 40,
  PAUSE_BTN: { X: 604, Y: 12, W: 28, H: 28 },
  START_BTN: { X: 560, Y: 328, W: 100, H: 28 },
  WAVE_BAR: { X: 330, Y: 328, W: 172, H: 10 },
  LEVEL_NAME: { X: 12, Y: 304 },
  WAVE_TEXT: { X: 322, Y: 333 },     // right edge, vertical centre (left of the bar)
  // Top-bar tools (same size as a card)
  TOOL_W: 44,
  TOOL_H: 52,
  TOOL_Y: 2,
  UPGRADE_X: 452,
  RECALL_X: 500,
  TOOL_ICON_SCALE: 1.5,
  TOOL_CAPTION_DY: 9,               // caption centre above the bottom edge
  TOOL_LABEL_DY: -12,               // cost/refund text above the cursor tile
  // Bottom-bar abilities (round buttons, 44 px across)
  ABILITY_R: 22,
  ABILITY_Y: 328,
  BARK_X: 158,
  ZOOMIES_X: 214,
  ABILITY_RING_W: 4,
  ABILITY_ICON_SCALE: 0.9,
  ABILITY_KEY_DX: 14,
  ABILITY_KEY_DY: 12,
  ABILITY_DIM_ALPHA: 0.4,
  ABILITY_PULSE_HZ: 2,
  LEVEL_SUB_Y: 320,                 // second line under the level name
  // Hints: a strip under the top bar (the hedge band, y 56-84)
  HINT_Y: 70,
  HINT_W: 600,
  HINT_PAD: 6,
  HINT_S: 4.5,
  HINT_GAP_S: 0.3,
  BTN_W: 140,
  BTN_H: 30,
  BTN_RADIUS: 6,
  RESULTS_BTN_GAP: 40,
  TOAST_Y: 160,
  TOAST_S: 2.2,
  TOAST_SHORT_S: 1,
  TOAST_WAVE_S: 1.2,
  COIN_BOX: { X: 4, Y: 4, W: 66, H: 48, R: 4 },
  COIN_ICON_SCALE: 2,
  CARD_COST_DY: 9,          // cost text centre above the card's bottom edge
  FLAG_POLE_H: 12,
  FLAG_W: 8,
  FLAG_H: 6,
  PAUSE_HINT_DY: 22,
  BTN_GAP: 10,
  BLINK_MS: 500,
  BLINK_ALPHA: 0.55,
};

export const TITLE_LAYOUT = {
  LOGO_Y: 96,
  PROMPT_Y: 186,
  HELP_Y: 210,
  GROUND_Y: 280,
  FEET_Y: 284,
  SPRITE_SCALE: 2,
  SOBA_DX: -60,
  STEAMER_DX: 30,
  COIN_DX: 64,
  COIN_Y: 250,
  RAT_DX: 120,
};

export const RESULTS_LAYOUT = {
  TITLE_Y: 60,
  TITLE_SIZE: 26,
  LEVEL_Y: 86,
  SOBA_Y: 158,
  SOBA_SCALE: 1.5,
  SCORE_Y: 176,
  STATS_Y: 204,
  BUTTONS_Y: 250,
  HINT_Y: 290,
  INPUT_DELAY_MS: 300,      // keys are ignored this long (a key held at the end can't skip)
  TITLE_BTN: 0x5a4a6a,
  TITLE_BTN_HOVER: 0x7a6a8a,
};

export const COLORS = {
  PAGE_BG: '#1a1030',
  OUTLINE: 0x1a1220,
  TOP_BAR: 0x3a2418,
  TOP_BAR_EDGE: 0x5a3a24,
  BOTTOM_BAR: 0x2a1a2e,
  CARD_BG: 0xe8d5a8,
  CARD_BG_SELECTED: 0xffe680,
  CARD_DIM: 0x000000,
  CARD_DIM_ALPHA: 0.45,
  CARD_RECHARGE_ALPHA: 0.55,
  CURSOR: 0xfff3b0,
  CURSOR_BAD: 0xff6060,
  HEDGE: 0x24402a,
  FENCE: 0x4a3020,
  WAVE_BAR_BG: 0x1a1220,
  WAVE_BAR_FILL: 0x8fd16a,
  FLAG: 0xd83a3a,
  FLAG_DONE: 0x8fd16a,
  FLAG_POLE: 0xe8d5a8,
  TOOL_UPGRADE: 0xffd84a,
  TOOL_RECALL: 0x7ad0ff,
  ABILITY_BG: 0x3a2a40,
  ABILITY_RING_BG: 0x1a1220,
  ABILITY_READY: 0xffd84a,
  ABILITY_CHARGING: 0x7ad0ff,
  BARK_WAVE: 0xfff3b0,
  HINT_BG: 0x1a1220,
  HINT_BG_ALPHA: 0.85,
  HINT_EDGE: 0xffd84a,
  SOBA_MARK: 0xffd84a,
  STUN_TINT: 0xc8c8ff,
  BTN: 0xc8553d,
  BTN_HOVER: 0xe0705a,
  OVERLAY: 0x000000,
  OVERLAY_ALPHA: 0.55,
  TEXT: '#fff6e0',
  TEXT_MUTED: '#c8b8a0',
  TEXT_GOLD: '#ffd84a',
  TEXT_DANGER: '#ff6a5a',
  TEXT_STROKE: '#1a1220',
  DEBUG_GRID: 0x00ffff,
  DEBUG_BOX: 0xff00ff,
  DEBUG_REACH: 0xffff00,
};

export const TRANSITION = {
  FADE_MS: 250,
  RETRY_FADE_MS: 120,
};

// --- Visual effects (Step 3a, src/fx) -----------------------------------------
// View only: nothing here is read by src/sim. Times in seconds unless named _MS.
export const FX = {
  // particle caps (alive at once, per emitter) and object pools
  CAP_DUST: 90,
  CAP_PIXELS: 90,
  CAP_SPARKS: 70,
  CAP_FEATHERS: 16,
  CAP_LINES: 40,
  CAP_TRAIL: 40,
  CAP_CONFETTI: 160,
  CAP_HUD_SPARKS: 30,
  POP_POOL: 10,             // score pops alive at once ("+10")
  FLY_COIN_POOL: 12,        // coins flying to the counter
  GHOST_POOL: 12,           // death squish / crumble images
  LID_POOL: 6,
  AFTERIMAGE_POOL: 10,
  // enemies
  HIT_WHITE_S: 0.06,        // pure-white flash after a hit
  HIT_SQUASH: 0.18,         // scale offset at the hit (x wider, y shorter)
  HIT_SQUASH_S: 0.16,
  HIT_PUFF: 3,              // steam puffs where a dumpling lands
  HIT_CRUMBS: 2,
  LID_HIT_SPARKS: 3,
  WALK_BOB_PX: 2,           // the walk frames differ little: a step bob sells the walk
  KILL_DUST: 9,
  KILL_PIXELS: 7,
  KILL_SQUISH_S: 0.18,      // the dead critter flattens and fades
  BITE_NIBBLE_PX: 1,        // biters lunge 1 px on their bite frame
  // score pop
  POP_RISE: 18,
  POP_S: 0.75,
  POP_IN_S: 0.12,
  POP_SCALE: 1.7,
  POP_DY: -26,              // above the critter's feet
  // lid
  LID_S: 0.75,
  LID_DX: 26,
  LID_UP: 18,
  LID_SPIN: 720,
  LID_CLANG_SPARKS: 9,
  LID_SHAKE_MS: 90,
  LID_SHAKE: 0.003,
  // crow hop
  HOP_DUST: 5,
  HOP_FEATHERS: 2,
  // coins
  COIN_BOUNCE_S: 0.4,       // after landing: two little hops
  COIN_BOUNCE_PX: 5,
  COIN_GLINT_EVERY_S: 1.4,
  COIN_DROP_SPARKS: 4,
  COIN_FALL_SPARK_EVERY_S: 0.25,
  COIN_FLY_S: 0.42,
  COIN_FLY_ARC: 34,
  COIN_BUMP_S: 0.2,
  COIN_BUMP_SCALE: 0.35,    // counter grows by this much on arrival
  COIN_ARRIVE_SPARKS: 4,
  // defenders
  PLACE_POP_S: 0.3,
  PLACE_POP_FROM: 0.35,     // scale at the moment of placing
  PLACE_RING: 12,
  BREATH_AMP: 0.035,        // idle breathing (scaleY), about 1 px on a 32 px unit
  BREATH_HZ: 0.7,
  SHOOT_RECOIL: 0.14,
  SHOOT_RECOIL_S: 0.18,
  SHOOT_STEAM: 2,
  CAT_HOP_PX: 5,
  CAT_HOP_S: 0.3,
  BITTEN_S: 0.1,            // a unit hit this recently is being bitten
  BITE_FLICKER_HZ: 3,
  BITE_WHITE: 0.14,         // share of a flicker cycle that is white...
  BITE_RED: 0.38,           // ...then red up to this share, then normal
  BITE_WOBBLE: 0.06,
  CRUMBLE_S: 0.5,
  CRUMBLE_DEBRIS: 12,
  CRUMBLE_DUST: 9,
  UPGRADE_SPARKS: 14,
  UPGRADE_POP_S: 0.35,
  RECALL_DUST: 8,
  // projectiles
  DUMPLING_TRAIL_EVERY_S: 0.09,
  DUMPLING_BOB_PX: 1,
  DUMPLING_BOB_HZ: 3,
  // scooter
  SCOOTER_SHAKE_MS: 180,
  SCOOTER_SHAKE: 0.006,
  SCOOTER_LINE_EVERY_S: 0.025,
  SCOOTER_PUFF_EVERY_S: 0.05,
  SCOOTER_BOUNCE_PX: 1,
  // bark
  BARK_RINGS: 3,
  BARK_RING_GAP: 20,        // px between rings
  BARK_S: 0.5,
  BARK_SHAKE_MS: 120,
  BARK_SHAKE: 0.004,
  BARK_JITTER_PX: 2,
  BARK_JITTER_S: 0.35,
  BARK_SQUASH: 0.12,
  BARK_FILL_ALPHA: 0.3,
  WOOF_S: 0.85,
  WOOF_RISE: 16,
  WOOF_DX: 26,
  // zoomies
  AFTERIMAGE_EVERY_S: 0.035,
  AFTERIMAGE_S: 0.24,
  AFTERIMAGE_ALPHA: 0.55,
  ZOOM_DUST_EVERY_S: 0.03,
  ZOOM_SPARKS: 10,
  ZOOM_SHAKE_MS: 90,
  ZOOM_SHAKE: 0.005,
  // huge-wave banner
  BANNER_Y: 160,
  BANNER_H: 38,
  BANNER_IN_S: 0.35,
  BANNER_HOLD_S: 1.7,
  BANNER_OUT_S: 0.3,
  BANNER_FLAG_POP_S: 0.35,
  BANNER_FLAG_WAVE_HZ: 3,
  BANNER_TEXT_SIZE: 18,
  BANNER_STRIPE: 3,
  // end of battle
  WIN_CONFETTI: 90,
  WIN_CONFETTI_2: 60,
  WIN_CONFETTI_DELAY_S: 0.4,
  WIN_SLOWMO: 0.3,          // effect time scale right after the win...
  WIN_SLOWMO_S: 1.2,        // ...easing back to 1 over this long
  WIN_FLASH_ALPHA: 0.35,
  WIN_FLASH_S: 0.4,
  WIN_HOP_PX: 6,
  WIN_HOP_HZ: 2.5,
  LOSS_FADE_S: 0.8,
  LOSS_DARK_ALPHA: 0.4,
  LOSS_SATURATE: -0.85,     // camera ColorMatrix saturate at the end of the fade
  HOUSE_SHAKE_MS: 320,
  HOUSE_SHAKE: 0.01,
  HOUSE_FLASH_ALPHA: 0.3,
  HOUSE_FLASH_S: 0.35,
  // ambience
  FIREFLIES: 10,            // alive at once (battle edges, menus)
  FIREFLY_EVERY_MS: 450,
  FIREFLY_LIFE_MS: 4200,
  GLOW_FLICKER_HZ: 1.1,
  GLOW_ALPHA_MIN: 0.26,
  GLOW_ALPHA_MAX: 0.42,
  TWINKLES: 14,             // menu stars that twinkle
  TWINKLE_HZ: 0.6,
  // HUD
  CARD_READY_FLASH_S: 0.4,
  CARD_READY_ALPHA: 0.75,
  CARD_LIFT: 2,             // selected card rises this much
  CARD_PULSE_HZ: 2,
  TOAST_IN_S: 0.18,
  TOAST_OUT_S: 0.25,
  TOAST_POP_SCALE: 1.5,
  HINT_FADE_S: 0.2,
  TOOL_ICON_BOB_PX: 2,
  TOOL_ICON_BOB_HZ: 2,
  TOOL_ICON_DX: 32,         // tool icon at the tile's top-right corner
  TOOL_ICON_DY: 6,
  GHOST_ALPHA: 0.6,
  GHOST_TILE_ALPHA: 0.22,
  // layout of individual effects (px)
  PUFF_JITTER_X: 4,
  PUFF_JITTER_Y: 2,
  BODY_DY: 12,              // a critter's middle above its feet
  LID_CLANG_DX: 6,
  PLACE_RING_RX: 12,
  PLACE_RING_RY: 3,
  CRUMBLE_W: 12,            // debris spread around a crumbling unit
  CRUMBLE_H: 24,
  CRUMBLE_SHAKE_HZ: 9.5,
  CRUMBLE_SHAKE_PX: 1.5,
  UPGRADE_POP_DY: 8,
  CARD_UNLOCK_SPARKS: 14,
  SCOOTER_LAUNCH_PUFFS: 6,
  SCOOTER_PUFF_DX: 16,      // exhaust behind the scooter
  EXHAUST_DY: 4,
  SCOOTER_LINE_DX: 14,
  SCOOTER_LINE_Y: [4, 22],  // speed lines between these heights above the wheels
  EMBER_SPREAD: 8,
  BARK_JITTER_HZ: 11,
  LID_ARC_SPEED: 1.4,       // the lid's arc finishes at 1/this of its flight
  TRAIL_DX: 6,
  GLINT_SPREAD: 5,
  GLINT_SWEEP_SLACK: 8,     // stale glint timers are swept past this many extra
  BANNER_FLAG: { POLE_H: 26, TOP: -14, W: 14, H: 10, GAP: 22 },
  RESULTS_SPARK_DEPTH: 10,
  RESULTS_CONFETTI_DEPTH: 9,
  STAR_POP_TIME: 1.6,       // star pop duration, x RESULTS_MENU.STAR_POP_MS
  GLOW_PHASE_STEP: 1.7,
  GLOW_FLICKER_RATIO: 2.7,  // second flicker sine runs this much faster
  // Results / menus
  RESULTS_FADE_MS: 300,     // battle -> Results fade
  STAR_POP_SPARKS: 12,
  STAR_POP_OVERSHOOT: 3.4,  // Back.easeOut overshoot for the result stars
  STAR_SHAKE_MS: 80,
  STAR_SHAKE: 0.004,
  SHINE_S: 0.7,
  SHINE_EVERY_S: 2.4,
  SHINE_W: 14,
  SHINE_SLANT: 0.5,         // px of x per px of y
  SHINE_ALPHA: 0.55,
};

// Particle emitter configs (Phaser ParticleEmitter config, plain data). Effects
// adds emitting: false, the cap, depth and blend mode; speeds px/s, times ms.
export const FX_PARTICLES = {
  DUST: {
    speedX: { min: -40, max: 40 }, speedY: { min: -30, max: -4 }, gravityY: -10,
    lifespan: { min: 280, max: 480 }, scale: { start: 1, end: 0.3 }, alpha: { start: 0.85, end: 0 },
  },
  PIXELS: {
    speed: { min: 30, max: 95 }, angle: { min: 200, max: 340 }, gravityY: 320,
    lifespan: { min: 380, max: 620 }, alpha: { start: 1, end: 0.2 },
  },
  SPARKS: {
    speed: { min: 40, max: 110 }, angle: { min: 0, max: 360 },
    lifespan: { min: 220, max: 380 }, scale: { start: 1, end: 0.2 }, alpha: { start: 1, end: 0 },
  },
  FEATHERS: {
    speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 }, gravityY: 50,
    rotate: { start: 0, end: 300 }, scale: { start: 0.75, end: 0.6 },
    lifespan: { min: 700, max: 1000 }, alpha: { start: 1, end: 0 },
  },
  LINES: {
    speedX: { min: -260, max: -180 }, speedY: 0, lifespan: 180,
    scaleX: { start: 1.6, end: 0.4 }, alpha: { start: 0.8, end: 0 },
  },
  TRAIL: {
    speedX: { min: -12, max: -4 }, speedY: { min: -10, max: -4 },
    lifespan: 300, scale: { start: 0.6, end: 0.2 }, alpha: { start: 0.45, end: 0 },
  },
  CONFETTI: {
    speedX: { min: -40, max: 40 }, speedY: { min: 40, max: 110 }, gravityY: 40,
    rotate: { min: 0, max: 360 }, lifespan: { min: 2200, max: 3400 }, scaleY: 1.4,
  },
  CONFETTI_FLUTTER: 30,     // scaleX = cos(life * this + x) * CONFETTI_W: the paper flips
  CONFETTI_W: 1.4,
  CONFETTI_ZONE_H: 8,       // spawns in a strip this tall above the screen
  HUD_SPARKS: {
    speed: { min: 30, max: 80 }, angle: { min: 0, max: 360 },
    lifespan: { min: 260, max: 420 }, scale: { start: 1, end: 0.2 }, alpha: { start: 1, end: 0 },
  },
  RESULT_SPARKS: {
    speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
    lifespan: { min: 300, max: 520 }, scale: { start: 1.4, end: 0.2 }, alpha: { start: 1, end: 0 },
  },
  FIREFLY: {
    speedX: { min: -8, max: 8 }, speedY: { min: -7, max: 3 }, scale: { min: 1, max: 1.5 },
  },
};

export const FX_COLORS = {
  WHITE: 0xffffff,
  DUST: 0xe8dcc8,
  STEAM: 0xf6f2ea,
  DOUGH: 0xf0e0c0,
  SPARK: 0xffe08a,
  CLANG: 0xdfe6f0,
  FEATHER: 0x2a2836,
  EXHAUST: 0x9a90a8,
  SPEED_LINE: 0xfff6e0,
  COIN_SPARK: 0xfff3a0,
  ZOOM_GHOST: 0xffd84a,
  BITE_RED: 0xff7070,
  POP_TEXT: '#ffd84a',
  POP_REFUND: '#9ae07a',
  WOOF: '#fff3b0',
  BARK_RING: 0xfff3b0,
  BANNER: 0xb8322a,
  BANNER_EDGE: 0x5a1410,
  BANNER_STRIPE: 0xffd84a,
  FLAG: 0xd83a3a,
  FLAG_POLE: 0xe8d5a8,
  FLASH_WIN: 0xfff6d0,
  FLASH_HURT: 0xff3020,
  LOSS_DARK: 0x0a0618,
  GHOST_OK: 0x8fd16a,
  GHOST_BAD: 0xff5050,
  FIREFLY: 0xd8ff7a,
  GLOW: 0xffa040,
  GLOW_WINDOW: 0xffc860,
  CONFETTI: [0xffd84a, 0xe8402a, 0x8fd16a, 0x7ad0ff, 0xff9ad0, 0xfff6e0],
  // debris colours per defender (crumble) and per critter (death poof)
  UNIT_DEBRIS: { luckycat: 0xf4ece0, steamer: 0xd8913a, onigiri: 0xf6f6f0, chili: 0xe0402a },
  ENEMY_DEBRIS: { rat: 0x8a8098, lidrat: 0x8a8098, crow: 0x3a3648, tanuki: 0x8a6a4a, fox: 0xe08040 },
  CARD_READY: 0xffffff,
  COST_BAD: '#ff6a5a',
  CARD_SELECTED_GLOW: 0xffd84a,
};

// Scenery drawn in code (Step 3a): the hedge/fence band between the top bar
// and the grid, the lantern string over it, and the lantern glows on the art.
export const SCENERY = {
  SKY_H: 8,                 // sky strip at the top of the band
  FENCE_TOP: 6,             // fence plank tops (px below the band top)
  FENCE_PLANK_W: 8,
  FENCE_POST_EVERY: 5,      // planks per post
  HEDGE_TOP: 14,            // hedge bush tops (px below the band top)
  HEDGE_BUMP_R: 6,
  HEDGE_BUMP_STEP: 9,
  LANTERN_STRING_Y: 4,      // string ends (px below the band top)
  LANTERN_SAG: 9,
  LANTERN_COUNT: 6,
  LANTERN_RX: 4,
  LANTERN_RY: 5,
  LANTERN_GLOW_SCALE: 0.75,
  BOTTOM_PLANK_W: 20,
  // glow spots on the house / alley art (art-local px) and their size (glow texture scale)
  HOUSE_GLOWS: [{ x: 37, y: 52, s: 1.3, window: true }, { x: 17, y: 91, s: 0.8 }, { x: 17, y: 190, s: 0.8 }],
  ALLEY_GLOWS: [
    { x: 30, y: 25, s: 0.7 }, { x: 57, y: 25, s: 0.7 }, { x: 85, y: 25, s: 0.7 },
    { x: 112, y: 25, s: 0.7 }, { x: 137, y: 25, s: 0.7 }, { x: 161, y: 25, s: 0.7 },
  ],
  MOON_GLOW_SCALE: 1.6,
};
