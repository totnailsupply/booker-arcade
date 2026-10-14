// =============================================================================
// Constants.js — every tunable number in Soba Tower lives here.
// All values are in design pixels of the 270x480 portrait internal resolution.
// No Phaser import: this file is shared with node scripts (level validator, sims).
// =============================================================================

// --- Display ---------------------------------------------------------------

export const GAME = {
  WIDTH: 270,
  HEIGHT: 480,
  BG_COLOR: '#1a1030',      // page / letterbox color (dark violet; also in index.html)
};

// Safe-area insets (no Play.fun widget here). Kept so the HUD has one place
// to read its margins from.
export const SAFE_ZONE = {
  TOP: 0,
  BOTTOM: 0,
  LEFT: 0,
  RIGHT: 0,
};

// --- World coordinates -----------------------------------------------------
//
// World y points DOWN (Phaser default). The street surface is y = 0, so the
// climb goes into negative y. "Height" (px) = STREET_Y - y, always >= 0 above
// the street. Level data (src/levels/level1.js) is authored in height px.
// Meters: 1 m = 16 px.

export const WORLD = {
  STREET_Y: 0,
  PX_PER_M: 16,
  WRAP_W: 270,              // horizontal wrap period (= GAME.WIDTH)
};

// --- Soba (the player) -----------------------------------------------------
// The sprite's origin is the middle of the feet (0.5, 1), so soba.y = feet y.

export const SOBA = {
  FRAME_W: 40,
  FRAME_H: 40,
  ART_H: 36,                // visible art height inside the frame (ear tip to feet)
  // Hitboxes, checked against the real art (art/out/soba.png, ?debug=1):
  //   the paws in the fall frames (5, 6) span frame x 11..29 (19 px, centred on
  //   the feet origin), the body + head fill x 5..33, rows 11..39.
  BODY_W: 16,               // hurtbox for hazards: feet-anchored, INSIDE the art (forgiving)
  BODY_H: 24,
  FOOT_W: 18,               // visible width of the paws (fall pose)
  FOOT_FORGIVE: 2,          // landing box is FOOT_W + 2*FORGIVE wide (PLAN 3)
  PICKUP_W: 24,             // treat pickup box: about the whole art (generous)
  PICKUP_H: 32,
  HURT_VY: -240,            // hit by a hazard: a small pop up, then she tumbles off-screen
  HURT_VX: 50,              // ... pushed back against her facing
  CENTER_DY: 17,            // body centre is this far above the feet
  START_X: 135,             // spawn x on the street
  GHOST_MARGIN: 20,         // draw the wrap ghost when the centre is this close to an edge
  // Animation selection
  CROUCH_MS: 90,            // crouch frame right after each bounce
  APEX_VY: 140,             // |vy| below this shows the apex frame
  STEER_FRAME_VX: 120,      // |vx| above this (while rising) shows the lean frame
  IDLE_FPS: 3,
  CELEBRATE_FPS: 6,
  MULTI_FPS: 8,             // any other multi-frame pose (e.g. a 2-frame fall) loops at this rate
};

// --- Bounce physics ----------------------------------------------------------
//
// Derived from feel (platformer skill, Pattern 1), y points down:
//   GRAVITY  = 2H / T^2 = 2*112 / 0.44^2 = 1157.0 px/s^2   (rising)
//   VELOCITY = 2H / T   = 2*112 / 0.44   =  509.1 px/s     (bounce take-off)
//   FALL_GRAVITY = GRAVITY * 1.25        = 1446.3 px/s^2   (snappier fall)
//
// Flight from a bounce, feet height s(t) above the surface:
//   rising:  s = v0 t - g t^2 / 2           apex 112 px at t = 0.44 s
//   falling: s = 112 - gf (t - 0.44)^2 / 2
//   back to the same level: 0.44 + sqrt(2*112/1446) = 0.44 + 0.394 = 0.834 s
//
// Landing on a platform dh px higher (descending crossing):
//   t(dh) = 0.44 + sqrt(2 (112 - dh) / 1446)
//   dh = 40 -> 0.756 s   dh = 60 -> 0.708 s   dh = 75 -> 0.666 s   dh = 90 -> 0.614 s
// Horizontal reach in that time at full steer (after the 0.079 s ramp):
//   ~190 (t - 0.04)  ->  dh 40: 136 px   dh 60: 127 px   dh 90: 109 px
// so every gap <= 90 px (80% of H, PLAN 4) is reachable with a wide margin.

const BOUNCE_HEIGHT = 112;
const TIME_TO_APEX = 0.44;
const GRAVITY = (2 * BOUNCE_HEIGHT) / (TIME_TO_APEX * TIME_TO_APEX);
const FALL_MULT = 1.25;

export const BOUNCE = {
  HEIGHT: BOUNCE_HEIGHT,
  TIME_TO_APEX,
  GRAVITY,
  VELOCITY: (2 * BOUNCE_HEIGHT) / TIME_TO_APEX,
  FALL_MULT,
  FALL_GRAVITY: GRAVITY * FALL_MULT,
  MAX_FALL_SPEED: 900,      // terminal velocity; a fall of 227 px reaches ~810
};

// --- Steering ----------------------------------------------------------------
//   time to full speed: 190 / 2400 = 0.079 s (covers 7.5 px)
//   stop after release: 190 / 1800 = 0.106 s (covers 10 px)
//   reversal is instant: vx is set to 0 the frame the direction flips

export const STEER = {
  MAX_SPEED: 190,
  ACCEL: 2400,
  DECEL: 1800,
};

// --- Platforms ---------------------------------------------------------------

export const PLATFORM = {
  HEIGHT: 12,
  SEG: 8,                   // art is [left cap, middle, right cap] 8x12 frames
  MIN_W: 32,
  MAX_W: 64,
  LAND_EPS: 0.5,            // swept landing: feet were within this of the top last frame
  CULL_MARGIN: 480,         // platforms are active within one screen above/below the view
  CUSHION_W: 40,
  CUSHION_FADE_MS: 300,     // the respawn cushion fades after its one bounce
  ROOF_DECK_ROW: 32,        // roof art row of the drawn deck = the roof platform's top
  RIG_COLOR: 0x1a1220,      // slider rails and lift chains
  RIG_ALPHA: 0.45,
};

// --- Platform types (PLAN 3) ---------------------------------------------------
// Moving platforms are a pure function of the world clock (ClimbSim.time), so the
// bot, the validator and the game agree on where they are at any time.

export const SLIDER = {
  RAIL_DY: 11,              // rail line below the plank top (under the wheels)
  POST_H: 4,                // little end posts on the rail
};

export const CRUMBLE = {
  FALL_DELAY_S: 0.15,       // holds one bounce, then falls this long after it
  SHAKE_PX: 1,
  SHAKE_HZ: 40,
  DROP_GRAVITY: 1100,       // the falling plank (visual only)
  DROP_MS: 650,             // then it's gone for this attempt (restored on respawn)
  DEBRIS: 10,
};

export const SPRING = {
  HEIGHT_MULT: 2.2,                  // 2.2x the bounce height (246 px apex)
  VELOCITY_MULT: Math.sqrt(2.2),     // height scales with v^2
  PAD_W: 16,                         // landing on this part of the beam triggers it
  PAD_TOP: 7,                        // spring (compressed, frame 0) sticks up this far
  SQUASH_MS: 70,                     // compressed hit frame, then ...
  EXTEND_MS: 420,                    // ... extended (frame 1)
};

export const LIFT = {
  CHAIN_ABOVE: 56,          // chain anchor this far above the lift's highest top
  CHAIN_INSET: 5,           // chains hang this far in from the lift's ends
};

// --- Hazards (PLAN 3) ----------------------------------------------------------
// Every hurtbox sits INSIDE the visible art (checked with ?debug=1), so a touch
// that looks like a miss is a miss.

export const CROW = {
  W: 24,
  H: 16,
  HURT_W: 10,               // body core: 95-97% opaque in both flap frames, either facing
  HURT_H: 6,                // (checked against art/out/crow.png)
  STOMP_HALF_W: 12,         // stomp zone: the whole crow width (+ the landing box)
  STOMP_TOP: 8,             // feet at or below crow centre - 8 (its head/wing tips) ...
  STOMP_SLOP: 2,            // ... coming from above its centre (+2) while falling
  FLAP_FPS: 7,
  FALL_GRAVITY: 1300,       // stomped: tumbles off-screen
  FALL_SPIN_DEG: 540,
  GONE_MS: 1400,
};

export const TILE = {
  W: 14,
  H: 10,
  HURT_W: 6,                // core of the diamond: >= 94% opaque at every wobble angle
  HURT_H: 6,
  WARN_S: 0.6,              // red flashing mark at the top edge, then it drops
  TRIGGER_WINDOW: 160,      // only triggers while Soba is within this far above the trigger
  FALL_V0: 160,
  FALL_GRAVITY: 1000,
  FALL_MAX: 700,
  BLINK_MS: 100,
  MARKER_Y: 44,             // marker screen y (just under the HUD panel)
  WOBBLE_DEG: 20,           // it rocks while falling (a full spin would swing the art off its hurtbox)
  WOBBLE_HZ: 3,
};

export const CHIMES = {
  W: 16,
  H: 24,
  HURT_W: 8,                // the tubes (art x 2..13, rows 9..19), narrowed for the sway
  HURT_TOP: 9,
  HURT_H: 10,
  SWAY_DEG: 7,
  SWAY_S: 2.4,
};

export const HAZARD = {
  CULL_MARGIN: 160,         // hazards update their views within this margin of the view
};

export const TREAT = {
  SIZE: 12,
  HALF: 5,                  // pickup half-size of the biscuit itself
  BOB_PX: 1,
  BOB_S: 1.6,
  POP_MS: 260,
};

// --- Camera ------------------------------------------------------------------

export const CAMERA = {
  ANCHOR: 0.42,             // Soba's body centre is kept this far down from the top
  FOLLOW_RATE: 10,          // 1/s, exponential smoothing toward the ratchet target
  STREET_MARGIN: 40,        // px of street visible below the street surface at the start
  RESPAWN_FRAC: 0.62,       // the respawn cushion sits this far down the screen
  RESPAWN_PAN_MS: 600,
  ROOF_SKY: 170,            // px of sky kept visible above the roof platform
};

// --- Lives, respawn, checkpoints ---------------------------------------------

export const LIVES = {
  START: 3,
  CHECKPOINT_MIN: 1,        // reaching a zone gate restores lives to at least this
  INVULN_MS: 1000,
  BLINK_MS: 80,
  FALL_BEAT_MS: 300,        // pause after falling out before the camera pans back
  HIT_BEAT_MS: 550,         // hit by a hazard: Soba tumbles this long first
  GAMEOVER_HIT_MS: 700,     // last life lost to a hazard: tumble before Results
  RESPAWN_LIFT: 0,          // cushion height above the zone's respawn y (px)
};

// --- Scoring -------------------------------------------------------------------
// score = floor(maxHeightM) * 10 + treats * 25 + stomps * 50
//         (+ 1000 finish bonus + time bonus on completion)
// Time bonus: full TIME_BONUS_MAX up to par, linear to 0 at ZERO_MULT * par.
// par = finish height / PAR_PX_PER_S (a steady ~60 px/s climb).

export const SCORE = {
  PER_METER: 10,
  TREAT: 25,
  STOMP: 50,
  FINISH_BONUS: 1000,
  TIME_BONUS_MAX: 500,
  PAR_PX_PER_S: 60,         // fallback par (levels set parS)
  TIME_BONUS_ZERO_MULT: 2,
  TREAT_STAR_RATIO: 0.75,   // 30 of 40 treats (PLAN 3)
};

export const FINISH = {
  COMPLETE_DELAY_MS: 1100,  // celebrate on the roof before the Results screen
  // The bell art (48x48) is a whole gate: teal roof, red frame, bronze bell.
  // It stands on the back of the roof deck; Soba is drawn in front of it.
  BELL_BACK: 2,             // gate feet sit this far above the deck surface (back edge)
  BELL_CENTER_DY: 16,       // bronze bell centre above the gate feet (art rows 24-41)
  SHAKE_PX: 1,
  SHAKE_MS: 45,
  SHAKES: 10,
  SQUASH_Y: 0.92,
  RINGS: 3,                 // sound-wave rings
  RING_MS: 700,
  RING_STAGGER_MS: 220,
  RING_R0: 10,
  RING_R1: 46,
  RING_COLOR: 0xffe08a,
  GLOW_COLOR: 0xffd34d,
  GLOW_R: 30,
  GLOW_MS: 900,
  BESIDE_DX: 38,            // on landing, Soba hops this far from the bell centre (never hides it)
  HOP_PX: 10,
  HOP_MS: 260,
};

// --- Autoplay bot (dev only, ?autoplay=1) --------------------------------------

export const AUTOPLAY = {
  SAFETY_PX: 6,             // aim to land at least this far inside a platform's edge
  REACTION_S: 0.05,         // time lost before steering takes effect
  REACH_FACTOR: 0.9,        // only plan moves that need <= 90% of the max reach
  ARRIVE_TOL: 3,            // px from the target centre that counts as "there"
  DEATH_MARGIN: 24,         // never target a platform this close to the death line
  HAZARD_MARGIN: 3,         // bot inflates hurtboxes by this much when planning
  REPLAN_FRAMES: 3,         // re-check the planned flight for hazards this often
  SIM_DT: 1 / 60,           // planning step for the flight simulation
  SIM_MAX_S: 1.6,
  AFTER_LAND_S: 0.3,        // depth-0 flights also check the start of the next bounce
  CONTINUATIONS: 5,         // depth-1 flights: try this many next targets after landing
};

// Sloppy bot (scripts/sim-climb.mjs --sloppy): a rough model of a casual player,
// used to tune the difficulty curve. Seeded, deterministic.
export const SLOPPY = {
  REACTION_S: 0.15,         // after every bounce / re-plan, hands keep doing what they did
  REACTION_JITTER_S: 0.04,
  HESITATE: 0.1,            // chance of an extra pause on top of the reaction ...
  HESITATE_S: [0.08, 0.25], // ... this long
  MOVE_ERR_S: 0.3,          // moving platforms: timing misjudged by up to +-0.3 s
  AIM_SIGMA_PX: 7,          // aim point error (normal), per target
  LATE_RELEASE: [0.45, 1],  // stop-distance misjudgement factor (< 1 = overshoot)
  MISPICK: 0.12,            // chance to pick a random reachable target instead of the best
  REACH_FACTOR: [0.85, 1.08], // reach judgement per choice (> 1 = overconfident)
  HAZARD_BLIND: 0.18,       // chance to not check the flight for hazards at all
  HAZARD_MARGIN: -1,        // and a tighter margin when it does
};

// --- Level rules (scripts/validate-level.mjs, PLAN 4) -----------------------------

export const LEVEL_RULES = {
  MAX_GAP: 90,              // normal bounce: next top at most 90 px higher (80% of H)
  SPRING_MAX_GAP: 197,      // spring: 80% of the 246 px spring apex
  REACTION_S: 0.12,         // a human loses this much air time before steering
  REACH_FACTOR: 0.85,       // and only uses 85% of the remaining reach
  SAFETY_PX: 4,             // must land this far inside the platform edge (+ forgiveness)
  POS_SAMPLES: 9,           // worst case over this many positions per moving platform
  DODGE_SAMPLES: 32,        // departure times tried when looking for a dodge window
  DODGE_SPAN_S: 8,
  BREATHER_MIN_W: 56,       // each zone opens with 3 static beams at least this wide
  TILE_FREE_PX: 12,         // a falling tile must leave this much landing room on route platforms
};

// --- Colors -------------------------------------------------------------------

export const COLORS = {
  PAGE_BG: 0x1a1030,
  // Sky gradient stops by height fraction (0 = street, 1 = above the roof)
  SKY_STOPS: [
    [0.00, 0xffb066],
    [0.12, 0xf27a5e],
    [0.30, 0xc9547a],
    [0.50, 0x7f4a8f],
    [0.75, 0x3f3a78],
    [1.00, 0x141a3c],
  ],
  SUN: 0xffe1a0,
  SUN_BAND: 0xf7a35c,
  STAR: 0xfff4d6,

  UI_TEXT: '#ffffff',
  UI_SHADOW: '#1a1220',
  MUTED_TEXT: '#d8c8e8',
  SCORE_GOLD: '#ffd34d',
  NEW_BEST: '#7dff9a',
  DANGER: '#ff6b6b',
  DISABLED: '#6a6178',
  HUD_PANEL: 0x120a20,
  HUD_PANEL_ALPHA: 0.45,
  PROGRESS_BG: 0x2a2040,
  PROGRESS_FILL: 0xffb347,
  PROGRESS_SOBA: 0xffffff,
  PROGRESS_BEST: 0xffd34d,
  PROGRESS_ZONE: 0x120a20,
  STAR_ON: 0xffd34d,
  STAR_OFF: 0x4a4258,
  BTN_PRIMARY: 0xd9772b,
  BTN_PRIMARY_HOVER: 0xf08a3a,
  BTN_DISABLED: 0x3a3346,
  OVERLAY: 0x0b0614,
  OVERLAY_ALPHA: 0.6,
  ZONE_ROPE: 0x2a1a22,
  ZONE_LANTERN: [0xff6a4d, 0xffc94d, 0xff6a4d, 0x7dd3ff],
  DEBUG_BODY: 0x00ff88,
  DEBUG_FOOT: 0xffff00,
  DEBUG_PLATFORM: 0xff00ff,
  DEBUG_PAD: 0x00e0ff,
  DEBUG_HURT: 0xff3030,
  DEBUG_STOMP: 0xffa020,
  DEBUG_TREAT: 0xffd34d,
  TILE_WARN: 0xff3b30,
  UI_SHADOW_HEX: 0x1a1220,
  TILE_WARN_TEXT: '#ffffff',
  BEST_LINE: 0xffd34d,
  PROGRESS_BACK: 0x120a20,
  PROGRESS_BACK_ALPHA: 0.55,
  STOMP_TEXT: '#ffe08a',
  TREAT_TEXT: '#ffd34d',
  FEATHER: [0xe8e0f0, 0x9a90a8],
  DEBRIS: [0xc9a26b, 0xa07a48, 0x6e5232],
  HIT_FLASH: [255, 70, 70],
};

// --- UI ------------------------------------------------------------------------

export const UI = {
  FONT: '"Courier New", Courier, monospace',
  TITLE_SIZE: 34,
  HEADING_SIZE: 20,
  BODY_SIZE: 12,
  SMALL_SIZE: 10,
  HUD_SIZE: 10,
  HUD_HEIGHT_SIZE: 16,
  HUD_MARGIN: 6,
  HUD_PANEL_H: 40,
  HUD_PAW_GAP: 12,
  PROGRESS_X: 262,          // vertical progress bar (street at the bottom, bell on top)
  PROGRESS_TOP: 70,
  PROGRESS_BOTTOM: 420,
  PROGRESS_W: 4,
  PROGRESS_ALPHA: 0.85,
  PROGRESS_BELL_SCALE: 0.34,
  BTN_W: 150,
  BTN_H: 24,
  BTN_RADIUS: 4,
  STAR_RADIUS: 11,
  STAR_GAP: 30,
  BLINK_MS: 500,
  BANNER_Y: 120,
  BANNER_MS: 1400,
  NEW_BEST_Y: 168,
  NEW_BEST_MS: 1300,
  TREAT_ICON_X: 104,        // HUD treat counter (top panel, centre)
  PROGRESS_BACK_W: 12,
  POP_RISE: 18,             // "+50" / "+25" pops drift up this far
  POP_MS: 650,
};

export const BEST_FLAG = {
  X: 46,                    // pole x on the facade (left side)
  LABEL_DX: 8,
  LINE_X0: 39,              // faint gold line across the facade at the best height
  LINE_X1: 231,
  LINE_ALPHA: 0.5,
};

// Draw order
export const DEPTH = {
  SKY: -60,
  SKYLINE: -50,
  WALL: -40,
  ZONE_GATE: -35,
  BEST_FLAG: -33,
  ROOF_ART: -30,
  STREET: -20,
  RIG: -5,                  // slider rails, lift chains
  PLATFORM: 0,
  BELL: 5,
  TREAT: 6,
  HAZARD: 8,
  SOBA: 10,
  FX: 20,
  DEBUG: 90,
  HUD: 100,
  TITLE_TEXT: 120,
};

export const TIMING = {
  MAX_DT_MS: 50,            // clamp long frames (tab switches) so physics/timers don't jump
  PAUSE_DEBOUNCE_MS: 200,   // the key that resumes must not instantly pause again
};

// Title rows (screen y). Soba bounces on the street (screen y 440) up to an
// apex at y ~328 (ears ~296), so all text stays above y 290.
export const TITLE_LAYOUT = {
  LOGO_Y: 88,               // centre of the 240x100 logo (38..138)
  BEST_Y: 146,              // level name + best (2 lines, top-anchored)
  PROMPT_Y: 212,            // blinking start prompt (2 lines, centred)
  HINT_Y: 246,              // controls hint (2 lines, top-anchored)
  PROMPT_MIN_ALPHA: 0.6,    // blink never dims below this (contrast)
  PANEL_X: 6,               // translucent panel behind the text rows
  PANEL_TOP: 140,
  PANEL_BOTTOM: 278,
  PANEL_ALPHA: 0.55,
};

// Results screen rows (y, screen px)
// Step 4: rows re-spaced so 5 breakdown lines (254..~314) clear BEST (332), and
// the star-reason icons (stars + 17) clear HEIGHT.
export const RESULTS_LAYOUT = {
  TITLE_Y: 40,
  SUB_Y: 64,
  SOBA_Y: 152,              // feet of the 2x Soba
  SOBA_SCALE: 2,
  STARS_Y: 174,
  STAR_POP_MS: 250,
  STAR_DELAY_MS: 200,
  STAR_STAGGER_MS: 180,
  HEIGHT_Y: 212,
  SCORE_Y: 236,
  BREAKDOWN_Y: 256,
  BEST_Y: 334,
  NEW_BEST_Y: 354,
  BUTTON_Y: 390,
  HINT_Y: 414,
};

export const DEBUG = {
  MIN_ROOF_GAP: 40,         // ?y= is clamped this far below the roof
  MAX_LIVES: 99,
};

export const TRANSITION = {
  FADE_DURATION: 250,
  RETRY_FADE: 250,          // Results -> Climb (same as the title fade, so every run lines up frame-for-frame)
};

// --- Backdrop -----------------------------------------------------------------

export const BACKDROP = {
  SKY_BAND: 4,              // sky drawn as flat bands this tall (pixel-art banding)
  SKY_SPREAD: 0.16,         // extra height fraction from the bottom to the top of the screen
  SKY_ABOVE_ROOF: 300,      // sky fraction 1.0 is reached this far above the roof
  STAR_FROM: 0.45,          // stars fade in from this sky fraction ...
  STAR_FULL: 0.8,           // ... to full brightness here
  STAR_COUNT: 70,
  STAR_TILE_H: 960,
  STAR_PARALLAX: 0.05,
  SUN_X: 250,
  SUN_R: 34,
  SUN_SCREEN_Y: 380,        // sun centre on screen at the start
  SUN_PARALLAX: 0.25,
  SKYLINE_PARALLAX: 0.35,
  WALL_X: 39,               // tower facade column (192 px wide, centred)
  WALL_W: 192,
};

// --- High score storage ----------------------------------------------------

export const STORAGE = {
  PREFIX: 'soba-tower:',
  MUTE_KEY: 'soba-tower:muted',
};

// --- Audio (Web Audio API, all procedural; see src/audio/) -----------------
// Step 5. Levels in dB. Chain: per-layer / per-play gains -> music bus (-> duck)
// or SFX bus -> master -> limiter. Reverb sends -> convolver -> return -> master.

export const AUDIO = {
  // Buses
  MASTER_DB: -1,
  MUSIC_DB: -5,
  SFX_DB: -2,
  REVERB_RETURN_DB: -8,
  REVERB_S: 2.4,            // generated impulse length
  REVERB_DECAY: 3.2,        // impulse envelope exponent
  LIMITER: { THRESHOLD_DB: -3, KNEE_DB: 2, RATIO: 20, ATTACK_S: 0.002, RELEASE_S: 0.15 },
  // Music layers (dB inside the music bus), pans and reverb sends (dB)
  MIX: {
    lead: -6, flute: -15, shaku: -10, bass: -8, drone: -15, arp: -17,
    taiko: -7, hats: -24, kakko: -19, tick: -22, chappa: -23,
  },
  PAN: { arp: -0.35, flute: 0.35, shaku: 0.2, hats: 0.25, chappa: -0.2, kakko: 0.15, tick: -0.15 },
  MUSIC_SEND: { lead: -12, flute: -8, shaku: -5, arp: -16, taiko: -20 },
  // Ducking (music bus) under the bell ring and a hurt
  DUCK_DB: 4,
  DUCK_ATTACK_S: 0.04,
  DUCK_HURT_HOLD_S: 0.35,
  DUCK_HURT_RELEASE_S: 0.6,
  DUCK_BELL_HOLD_S: 1.2,
  DUCK_BELL_RELEASE_S: 1.2,
  // Transport
  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.15,
  STOP_FADE_S: 0.08,
  GAMEOVER_FADE_S: 0.35,
  COMPLETE_FADE_S: 1.4,     // zone music fades out under the bell
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,
  // Tempos (bpm)
  TITLE_BPM: 92,
  RESULTS_BPM: 96,
  FANFARE_BPM: 120,
  STING_BPM: 76,
  ZONE_BPM: [110, 112, 116, 118],
  DRIVE_PROGRESS: 0.88,     // zone 4: driving layer once the best height passes 88% of the climb
  RESULTS_WIN_DELAY_S: 0.3, // the finale (FINALE.RESULTS_AFTER_MS) already let the bell sing
  RESULTS_LOSE_DELAY_S: 0.2,
  // SFX
  PITCH_JITTER: 0.04,       // +- per play
  VOL_JITTER_DB: 1.2,       // +- per play
  SFX_PAN_MAX: 0.5,
  SFX_GAP_MS: {
    bounce: 40, caw: 400, chimes: 150, clack: 60, clink: 60, debris: 80, turn: 450, nearMiss: 250, counter: 50,
  },
  BOUNCE_ZONE_SEMITONES: 1.5,
  TREAT_STREAK_MS: 1200,
  CROW_CAW_ABOVE_PX: 290,   // a crow scrolls into view during a bounce's flight ~this far above the landing
  CROW_CAW_BELOW_PX: 200,
  CROW_CAW_GAP_MS: 1500,
  CHIMES_NEAR_X: 60,
  CHIMES_NEAR_BELOW: 40,
  CHIMES_NEAR_ABOVE: 150,
  CHIMES_GAP_MS: 1200,
  TILE_PENDING_S: 1.2,
  // Speaker button
  MUTE_BTN_SIZE: 14,
  MUTE_BTN_MARGIN: 4,
};

// --- FX (slim for Step 1; Step 4 adds the full juice pass) -------------------

export const FX = {
  SQUASH_X: 1.22,
  SQUASH_Y: 0.78,
  SQUASH_MS: 80,
  SPRING_STRETCH_X: 0.8,    // spring launch: tall stretch
  SPRING_STRETCH_Y: 1.3,
  SPRING_STRETCH_MS: 260,
  HIT_FLASH_MS: 160,
  HIT_SHAKE_MS: 120,
  HIT_SHAKE: 0.006,
  STOMP_FEATHERS: 8,
  DEBRIS_LIFE_MS: 650,
  FEATHER_LIFE_MS: 700,
  TREAT_SPARKLES: 6,
  PROMPT_ON_MS: 650,
  PROMPT_OFF_MS: 300,
};

// --- FX (Step 4: visual polish) -----------------------------------------------
// Presentation only: no gameplay rule, bot or validator reads these. Hit-stop
// and slow motion pause/slow the WHOLE sim (world clock included), so they never
// change what happens, only when you see it.

// Soba's squash & stretch, lean and night rim (systems/SobaJuice.js)
export const JUICE = {
  LAND_X: 1.24,             // landing squash (blends into the rise stretch)
  LAND_Y: 0.76,
  LAND_MS: 80,
  SPRING_X: 0.72,           // spring launch: tall stretch
  SPRING_Y: 1.38,
  SPRING_MS: 300,
  RISE_STRETCH: 0.09,       // extra scaleY at take-off speed while rising
  FALL_STRETCH: 0.05,       // ... and at FALL_REF px/s while falling
  FALL_REF: 700,
  THIN: 0.6,                // scaleX shrinks by this fraction of the stretch
  LEAN_DEG: 7,              // tilt into the steering direction at full speed
  LEAN_RATE: 14,            // 1/s smoothing toward the lean target
  TUMBLE_DEG_S: 480,        // hurt tumble spin (around her centre)
  // Light rim so the black fur reads on the night facade/sky (zones 3-4)
  RIM_COLOR: [226, 232, 255],
  RIM_ALPHA: 255,
  RIM_FROM_ZONE: 3,         // fully on from this zone's gate ...
  RIM_FADE_PX: 320,         // ... fading in over this many px below it
  RIM_MAX: 0.7,
};

// Particle bursts and hit-stop (systems/Effects.js)
export const BURST = {
  DUST: 4,                  // dust puff on every bounce
  DUST_SPRING: 9,
  DUST_LIFE_MS: 380,
  DUST_TINT: [0xf6e7cf, 0xe0c8a4, 0xffffff],
  SPEEDLINE_MS: 320,        // spring: speed lines trail Soba this long
  SPEEDLINE_EVERY_MS: 34,
  SPEEDLINE_LIFE_MS: 240,
  STOMP_STOP_MS: 50,        // hit-stop (PLAN 7)
  HURT_STOP_MS: 60,
  HIT_FLASH_ALPHA: 0.4,     // red overlay peak (a full-screen camera flash hid everything)
  HIT_FLASH_MS: 240,
  STOMP_SHAKE_MS: 90,
  STOMP_SHAKE: 0.004,
  STOMP_FEATHERS: 12,
  HURT_STARS: 7,
  CRACK_DUST: 5,
  FALL_DUST: 8,
  IDLE_CRUMB_MIN_S: 0.8,    // idle crumbles shed a grain of dust every 0.8-1.7 s
  IDLE_CRUMB_MAX_S: 1.7,
  TURN_DUST: 3,             // slider/lift turnaround puff (on screen only)
  RESPAWN_DUST: 10,
  TREAT_SPARKLES: 7,
  TREAT_FLY_MS: 420,        // the biscuit flies to the HUD counter
  POP_SCALE: 1.35,          // "+50" / "+25" pops start this big and settle ...
  POP_DX: 30,               // ... beside the action, toward the screen centre
  NEAR_MISS_PX: 7,          // a hazard passed within this gap of Soba's hurtbox ...
  NEAR_MISS_COOLDOWN_S: 1.5,
  MILESTONE_M: 50,          // height pop every 50 m
  MAX_ALIVE: 90,            // cap per emitter (phones)
};

// Per-zone facade looks, baked from the wall art at load (core/VisualBake.js).
// Palettes map the 8 colours of public/assets/wall.png; any other colour (the
// placeholder art) falls back to the zone's multiply tint.
export const ZONE_LOOK = {
  BLEND_PX: 150,            // dithered cross-fade centred on each gate
  // Facade column per zone, x range inside the 192 px wall (0..192). Zone 4
  // narrows to the pillar lines at 25 / 174: the spire.
  X_RANGE: [[0, 192], [0, 192], [0, 192], [25, 174]],
  WALL_SRC: [0x554042, 0x815c5d, 0x413741, 0xd5826a, 0x60515a, 0xaa663d, 0x87462c, 0x302d34],
  //          beams     panels    pillars   windows   lattice   frames/lantern  lantern dark  outline
  PALETTES: [
    [0x5b4243, 0x8c6159, 0x46373e, 0xf2a46e, 0x67525a, 0xd47a3e, 0x9a4a2a, 0x302830],  // 1 warm, lit
    [0x4c4352, 0x75616f, 0x3b3646, 0xeab77c, 0x5b5368, 0xa8805a, 0x76503a, 0x2a2934],  // 2 cooler dusk
    [0x4b3446, 0x6f4a5c, 0x3a2a3a, 0xffa070, 0x603e50, 0xe4483a, 0xa82a26, 0x2a1d2a],  // 3 lantern red
    [0x2c2f48, 0x42486c, 0x24273e, 0xe9c98e, 0x363b5c, 0x5e6290, 0x40426a, 0x1a1b2c],  // 4 night
  ],
  FALLBACK_TINT: [0xfff0e0, 0xe4dcf0, 0xf0d0d8, 0x8890c0],
  LIT: [1, 0.86, 0.95, 0.3],              // share of windows lit per zone
  UNLIT: [0x5a4048, 0x4a4560, 0x4a3040, 0x262b48],
  LIT_COOL: 0xa9c4f2,                     // zone 4: some windows glow TV-blue
  LIT_COOL_SHARE: 0.3,
  VINE: [0x2f5a2e, 0x5e9a4a, 0x86c25e],   // zone 1 vines + planters
  LEAF_COLORS: [0x5e9a4a, 0x86c25e, 0xc8ee8e], // drifting leaves: a step lighter than the vines (Step 6: they vanished on the brown facade)
  FLOWERS: [0xf28aa8, 0xffd36e, 0xff7a5a],
  PLANTER: 0x6a4630,
  VINES_PER_TILE: 7,                      // per 192 px of height
  RAIL: [0x2a2633, 0x8b7f98, 0x5b5368],   // zone 2 balcony: shadow, top rail, balusters
  BALCONY_SHARE: 0.7,
  TRIM: 0xc83a30,                          // zone 3 red trim on the beam lines
  TRIM_GOLD: 0xffc04d,
  MOON_EDGE: [0xa6b6ee, 0x6f7cb4],         // zone 4 moonlit left edge (2 px)
  // Pagoda eave band at each gate, composed from the roof art (x 0-30 caps,
  // a 36 px bracket strip in between); purely decorative, behind platforms.
  EAVE_W: 240,
  EAVE_CAP_W: 30,
  EAVE_SRC_TOP: 25,         // cap rows 25..63 of the roof art (curled ends)
  EAVE_STRIP_X: 62,         // 36 px strip x 62..98, rows 39..63 (one bracket)
  EAVE_STRIP_W: 36,
  EAVE_STRIP_TOP: 39,
  EAVE_GATE_ROW: 22,        // eave texture row that sits on the gate line (teal band)
  EAVE_TINT: [0xffffff, 0xffffff, 0xffffff, 0xb8c0e0],
  SIGN_X: 86,               // hanging zone sign centre (left of the centre breather beams)
  SIGN_MIN_X: 18,           // a nudged sign's left edge stays under the eave (eave x 15..255)
  SIGN_CLEAR: 3,            // px kept between a sign and any platform art in its rows
  SIGN_FILL: 0x5a1e1e,
  SIGN_EDGE: 0xffc04d,
  SIGN_TEXT: '#ffe6b0',
  // Paper lantern strings across the facade (height px of each rope)
  // Step 6: zone 3 thinned from 7 strings x 6 lanterns to 4 x 4 (it read as busy behind the hazards)
  LANTERN_STRINGS: [130, 3160, 3600, 4040, 4480],
  LANTERNS_PER_STRING: 4,
  LANTERN_SAG: 7,
  LANTERN_SWAY_DEG: 6,
  LANTERN_SWAY_S: 2.6,
  LANTERN_ALPHA: 0.92,
  // Moon over the spire (sky, screen space, slow parallax)
  MOON_X: 34,
  MOON_R: 19,
  MOON_Y_AT_ROOF: 92,       // moon centre on screen when the view is at the roof
  MOON_PARALLAX: 0.05,
  MOON_FROM: 0.62,          // sky fraction where it fades in ...
  MOON_FULL: 0.8,
  MOON: [0xf6efd6, 0xdcd2b2, 0xc4b994],
};

// Ambient particles per zone (systems/Ambient.js), behind the platforms
export const AMBIENT = {
  RATE: [2.0, 1.6, 2.2, 3.2],       // particles per second per zone (Step 6: zone 1 1.7 -> 2.0)
  MAX_ALIVE: 18,
  LEAF_TINT: [0xffffff],
  LEAF_SCALE: 2,                    // 4x3 art drawn at 8x6 (Step 6: 1x was too faint to notice)
  LEAF_ALPHA: 0.95,
  STEAM_TINT: 0xf4e8ff,
  MOTE_TINT: [0xffb060, 0xffd07a, 0xff7a4a],
  WIND_TINT: 0xdfe8ff,
};

// Height milestones, zone banner, NEW BEST (ui/Hud.js, ui/BestFlag.js)
export const PROGRESS_FX = {
  MILESTONE_Y: 58,          // "100 m" pop, screen y (just under the HUD band)
  MILESTONE_MS: 900,
  BANNER_Y: 338,            // zone ribbon: below Soba's anchor line, so upcoming platforms stay clear
  BANNER_ALPHA: 0.8,
  NEW_BEST_Y: 300,
  OLD_BEST_FADE_MS: 350,    // the passed flag's "BEST nn m" label fades when NEW BEST pops
  BANNER_IN_MS: 260,
  BANNER_HOLD_MS: 900,      // Step 6: 1300 -> 900 (it covered a platform below Soba for ~1.8 s)
  BANNER_HOLD_ALPHA: 0.45,  // fades from BANNER_ALPHA to this while it holds
  BANNER_OUT_MS: 240,
  BANNER_H: 38,
  BANNER_FILL: 0x2a1426,
  BANNER_EDGE: 0xffc04d,
  CONFETTI: 46,
  CONFETTI_COLORS: [0xffd34d, 0x7dff9a, 0xff6a8a, 0x7dd3ff, 0xffffff],
  FLAG_FLUTTER_MS: 70,
  FLAG_FLUTTERS: 8,
  HUD_BAND_ALPHA: 0.62,
  HUD_EDGE: 0xffe6b0,
  HUD_EDGE_ALPHA: 0.22,
  COUNTER_BUMP: 1.35,
};

// Finish: bell ring, zoom, slow motion, fireworks, then Results (systems/Finale.js)
export const FINALE = {
  SLOWMO_SCALE: 0.35,
  SLOWMO_MS: 600,           // real time (PLAN 7)
  ZOOM: 2,                  // Step 6: 1.4 -> 2 (integer zoom keeps every pixel square)
  BELL_SCREEN_Y: 214,       // where the zoom leaves the bell on screen (the fireworks need the sky above it)
  FIREWORK_DX: [16, 52],    // burst x offset from the bell (either side), fits the zoomed view
  FIREWORK_DY: [34, 74],    // burst height above the bell's centre
  ZOOM_MS: 520,
  HUD_FADE_MS: 260,
  FIREWORKS: 7,
  FIREWORK_FIRST_MS: 300,
  FIREWORK_EVERY_MS: 330,
  FIREWORK_SPARKS: 40,
  FIREWORK_RISE_MS: 300,
  FIREWORK_COLORS: [0xffd34d, 0xff6a8a, 0x7dd3ff, 0x7dff9a, 0xffffff, 0xff9a4a],
  RESULTS_AFTER_MS: 2700,   // real time from the landing to the Results fade
  SKIP_AFTER_MS: 900,       // a fresh key / tap after this skips to Results
};

// Danger readability: roof tiles + chimes recoloured/rimmed hot at load,
// a pulsing red glow behind them, a stronger tile warning column.
export const DANGER = {
  TILE_BODY: [[0xd8503a, 0xf07850, 0xa8322a, 0x6e1e1e]],   // teal -> terracotta (light .. dark)
  RIM: [255, 196, 92],
  RIM_ALPHA: 255,
  GLOW_TINT: 0xff3b30,
  GLOW_ALPHA: [0.18, 0.42],
  GLOW_HZ: 2.2,
  GLOW_SCALE: 1.25,
  WARN_COL_ALPHA: [0.62, 0.34],   // tile warning column (blink on / off), was 0.4 / 0.2
  WARN_COL_W: 3,
  CRUMBLE_PALE: 0.32,             // idle crumble: blend toward cream by this much
  CRUMBLE_CRACK: 0x5a3c22,
};

// Results screen animation (scenes/ResultsScene.js)
export const RESULTS_FX = {
  TALLY_MS: 750,
  TALLY_DELAY_MS: 250,
  ICON_DY: 17,              // star reason icons under each star
};

// Title (scenes/TitleScene.js)
export const TITLE_FX = {
  INTRO_PAN_PX: 360,        // camera starts this far up the tower and eases down
  INTRO_PAN_MS: 1700,
  LOGO_BOB_PX: 3,
  LOGO_BOB_MS: 1300,
  SOBA_X: 118,
  HOP_MS: 220,
};
