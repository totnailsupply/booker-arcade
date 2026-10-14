// =============================================================================
// Constants.js — every tunable number in Booker Run lives here.
// All values are in design pixels of the 480x270 internal resolution.
// =============================================================================

// --- Display ---------------------------------------------------------------

export const GAME = {
  WIDTH: 480,
  HEIGHT: 270,
  BG_COLOR: '#0b0b12',      // page / letterbox color (also set in index.html)
};

// Play.fun-style safe-area insets. Not used inside the iframe here, kept so the
// HUD has one place to read its top margin from.
export const SAFE_ZONE = {
  TOP: 0,
  BOTTOM: 0,
  LEFT: 0,
  RIGHT: 0,
};

// --- World -----------------------------------------------------------------

export const WORLD = {
  TILE: 32,
  GROUND_Y: 238,            // y of the top surface of the ground (270 - 32)
  PIT_DEATH_DEPTH: 24,      // die once Booker's body top sinks this far below GROUND_Y
  GROUND_CHUNK_W: 1024,     // max width of one ground TileSprite (visual only)
  OBJECT_CULL_BEHIND: 160,  // px behind the camera's left edge before objects are hidden
};

// Parallax factors for the three background layers (0 = fixed, 1 = moves with world)
export const PARALLAX = {
  FAR: 0.025,               // default; a level with a baked-in sun/moon sets its own (it must not split at the edges)
  MID: 0.3,
  NEAR: 0.6,
  // Default far factor = min(FAR, FAR_MAX_TRAVEL / level.length): at most 400 px of
  // drift. That still lets a sun or moon slide off the left edge and wrap in at the
  // right (split in two), so levels with one set `parallax.far` so the disc stays
  // whole: (disc left x in the art - margin) / (finishX - 100). Level 1's lives in
  // the registry (src/levels/index.js), the others in levelN.js.
  // A level can override all three with `parallax: { far, mid, near }`.
  FAR_MAX_TRAVEL: 400,
};

// --- Player ----------------------------------------------------------------

export const PLAYER = {
  SCREEN_X: 100,            // Booker's fixed screen x; the camera scrolls to keep him here
  SPAWN_CLEAR: 40,          // debug starts (?x=, ?start=): free run-up kept before a wall, pit or hazard
  FRAME_W: 48,
  FRAME_H: 36,
  // Forgiving hitbox: 26x22 inside the 48x36 frame, feet on the frame's bottom row.
  BODY_W: 26,
  BODY_H: 22,
  BODY_OFFSET_X: 11,
  BODY_OFFSET_Y: 14,
  // Booker's body top never rises above this y (just under the HUD); rising
  // velocity is zeroed there. Nothing should need more height: walls <= ~170 px.
  CEILING_Y: 26,
};

// --- Jump physics ----------------------------------------------------------
//
// Derived from feel (platformer skill, Pattern 1), y points down:
//   RISE_GRAVITY = 2*H / T^2          = 2*72 / 0.36^2      = 1111 px/s^2
//   JUMP_VELOCITY = 2*H / T           = 2*72 / 0.36        = 400  px/s
//   FALL_GRAVITY = RISE_GRAVITY * 1.6                      = 1778 px/s^2
//
// Variable height: while the button is held Booker rises at full gravity.
// On release (after MIN_HOLD_MS) upward velocity is multiplied by JUMP_CUT.
//
// Full (held) jump, measured by Booker's feet above GROUND_Y:
//   apex 72 px at 0.36 s, falls 72 px in sqrt(2*72/1778) = 0.285 s
//   airtime 0.645 s
// Tap (released at once, cut applies at MIN_HOLD_MS = 90 ms):
//   at 0.09 s: vy = 400 - 1111*0.09 = 300, height = 31.5
//   cut to 150 -> + 150^2/(2*1111) = 10.1  -> apex ~41.6 px at 0.225 s
//   fall 41.6 px in 0.216 s -> airtime ~0.44 s
//
// Horizontal reach (ground-to-ground) = airtime * speed:
//   speed   full jump   tap hop
//   150     97 px       66 px
//   175     113 px      77 px
//   200     129 px      88 px
//   230     148 px      101 px
// A gap is clearable when gap.width < reach: Booker can take off with his body
// still overlapping the near edge, only 1 px of body has to land on the far edge,
// and coyote time adds 80 ms * speed of slack. Level 1 gaps: 48-64 at 200 (tap clears),
// 64-72 at 230 (tap 101 clears, full 148 clears with ~75 px slack).
//
// Obstacle clearance = time Booker's feet stay above the obstacle's HITBOX top,
// times speed, must exceed hitbox width + BODY_W:
//   crate   (hitbox 16x18): tap above 18 px for 0.33 s -> 49 px @150 vs 42 needed
//   cone    (hitbox 6x15):  tap above 15 px for 0.35 s -> 52 px @150 vs 32 needed
//   pallets (hitbox 18x44): tap apex 41.6 < 44, so a HELD jump is required;
//                           full jump above 44 px for 0.41 s -> 72 px @175 vs 44
//   barrel  (hitbox 12x12, rolls left at 90 px/s): relative speed 290 @200,
//                           tap above 14 px for 0.35 s -> 101 px vs 38 needed
// Spacing rule used in level1.js: consecutive single obstacles are >= 200 px
// apart (full jump lands ~70 px past an obstacle and needs ~80 px run-up).

const JUMP_HEIGHT = 72;
const TIME_TO_APEX = 0.36;
const RISE_GRAVITY = (2 * JUMP_HEIGHT) / (TIME_TO_APEX * TIME_TO_APEX);

export const JUMP = {
  HEIGHT: JUMP_HEIGHT,
  TIME_TO_APEX,
  RISE_GRAVITY,
  VELOCITY: (2 * JUMP_HEIGHT) / TIME_TO_APEX,
  FALL_MULT: 1.6,
  JUMP_CUT: 0.5,            // vy multiplier when the button is released while rising
  MIN_HOLD_MS: 90,          // the cut never applies before this, so a tap is a real hop
  COYOTE_MS: 80,
  BUFFER_MS: 100,
  MAX_FALL_SPEED: 600,
  // Levels 2+: a press while falling onto ground, a platform or a wall top, when the
  // landing comes before the buffer runs out, waits for it and becomes a full ground
  // jump instead of spending the double jump (or the dash) on a low hop. If the landing
  // stops being due in time, the press falls back to the air move. Off = old rules.
  LAND_BUFFER: true,
};

// --- Abilities (Levels 2-6) -------------------------------------------------
//
// One button. What a press means depends on the abilities the level grants
// (src/core/Abilities.js) and on Booker's state, in this priority order:
//   on the ground or within coyote time  -> jump (Level 1 rules, unchanged)
//   clinging to a wall face (wallkick)   -> wall kick
//   falling, landing within the buffer   -> buffered: a jump on landing (JUMP.LAND_BUFFER)
//   in the air, air jump left (double)   -> double jump
//   in the air, air jump spent (dash)    -> dash
//   otherwise                            -> buffered for BUFFER_MS (jump on landing)
// Holding while falling glides (glide). Landing on an enemy from above pounces.
// Air jump and dash refresh on landing, on a wall kick and on a pounce.
//
// Reach table, measured with the bot's frame-exact simulator (Arcade's 60 Hz
// integration gives a 68.7 px full jump, not the analytic 72): run
// `node scripts/reach-table.mjs` after changing any number below.
// h = feet height above the take-off surface, reach = take-off to landing (px)
// on flat ground. A pit is clearable when width < reach + BODY_W (26) - margin,
// because Booker can leave with his body over the near edge and land with
// 1 px on the far one. Keep 20+ px of margin for players.
//
//   speed | full jump    | tap     | double at apex | double, best | glide from | double then | jump, double,
//         | h 68.7, 0.62s| h 38    | h 121.6        | (press f34)  | full apex  | glide       | dash
//   150   | 93           | 63      | 158            | 178          | 248        | 438         | 253
//   160   | 99           | 67      | 168            | 189          | 264        | 467         | 269
//   175   | 108          | 73      | 184            | 207          | 289        | 510         | 295
//   195   | 120          | 81      | 205            | 231          | 322        | 569         | 328
//   200   | 123          | 83      | 210            | 237          | 330        | 583         | 337
//   230   | 142          | 96      | 241            | 272          | 379        | 671         | 387
//   240   | 148          | 100     | 252            | 284          | 396        | 700         | 404
//   250   | 154          | 104     | 263            | 296          | 413        | 729         | 421
//   260   | 160          | 108     | 273            | 308          | 429        | 758         | 438
//   280   | 173          | 117     | 294            | 331          | 462        | 817         | 471
//   Glide airtime from a full jump: 1.65 s (fall capped at 55 px/s).
//   Wall kick: +67 px per kick from the cling height (repeatable, 150 ms apart).
//   Pounce bounce: 77 px held, 41 px tapped.
//   Heights to clear (hitbox tops): tires 30, tire stack (2) 60, antenna 44,
//   acunit 20, cart 22, box stack 46 per box, gate 54.

// Double jump: a fixed boost (no variable height): vy = -sqrt(2 * g * HEIGHT).
//   v = sqrt(2 * 1111 * 56) = 353 px/s, rises 56 px in 0.32 s from the press.
export const DOUBLE = {
  HEIGHT: 56,
  VELOCITY: Math.sqrt(2 * RISE_GRAVITY * 56),
  AIR_JUMPS: 1,
  SPIN_MS: 260,            // how long the spin frames show after the press
};

// Ear glide: hold while falling. Fall speed eases to MAX_FALL and stays there.
//   Gliding from a full-jump apex (72 px) takes ~72 / 55 = 1.3 s to land, so it
//   covers ~1.3 s * speed px after the apex (220 px at 170 px/s).
export const GLIDE = {
  MAX_FALL: 55,            // px/s, terminal glide speed
  GRAVITY: 400,            // px/s^2 while gliding below MAX_FALL
  BRAKE: 1600,             // px/s^2 deceleration when the glide starts faster than MAX_FALL
  START_VY: 0,             // a glide starts once vy > this (falling); it then lasts while held
};

// Updrafts lift a GLIDING Booker: vy eases toward -strength (px/s, up) at ACCEL.
// No effect when not gliding. A level's updraft can set its own `strength`.
export const UPDRAFT = {
  ACCEL: 900,              // px/s^2 upward
  DEFAULT_STRENGTH: 150,   // px/s max rise speed
  VENT_KEY: 'l3-vent',
  STREAK_EVERY_MS: 28,
  STREAK_SPEED: [100, 180],
  STREAK_ALPHA: 0.85,
  COLUMN_COLOR: 0xcfe8ff,
  COLUMN_ALPHA: 0.1,
};

// Walls: solid from the ground up; the top is standable.
//   Touching a wall face in the air with wallkick = cling: fall speed capped at SLIDE_SPEED.
//   Press while clinging = kick: vy = -sqrt(2 * g * KICK_HEIGHT) = -377 px/s (+64 px).
//   Kicks repeat (one per press, KICK_COOLDOWN_MS apart), so any wall can be climbed.
//   On the ground against a wall face: a hit at once without wallkick; with
//   wallkick a hit after STUCK_MS (Booker must never be stuck forever).
export const WALL = {
  SLIDE_SPEED: 45,
  KICK_HEIGHT: 64,
  KICK_VELOCITY: Math.sqrt(2 * RISE_GRAVITY * 64),
  KICK_COOLDOWN_MS: 150,
  STUCK_MS: 1200,
  FACE_TOLERANCE: 1.5,     // px between Booker's right edge and a wall's left face that counts as touching
  MIN_FACE_OVERLAP: 4,     // px of vertical overlap with the face needed to cling
  TILE: 32,
  KEY: 'l4-wall',
};

// Pounce: landing on an enemy from above (falling, previous-frame feet above the
// middle of the enemy's hitbox + STOMP_TOLERANCE) stomps it and bounces Booker:
//   vy = -sqrt(2 * g * 80) = -422 px/s. The bounce uses the jump's variable-height
//   rule: release early (after MIN_HOLD_MS) and it is cut by JUMP_CUT.
export const POUNCE = {
  HEIGHT: 80,
  VELOCITY: Math.sqrt(2 * RISE_GRAVITY * 80),
  STOMP_TOLERANCE: 3,
  FREEZE_MS: 40,           // gameplay freeze (hit-stop) on a stomp
  POSE_MS: 220,            // pounce frame shows this long after the bounce
};

// Zoomies dash: DURATION_MS at SPEED_MULT x the current speed, vy = 0, no gravity.
//   Distance = 0.3 s * 2 * speed: 117 px @195, 144 px @240, 168 px @280
//   (0.3 s * speed further than running). Ends early against a wall face.
export const DASH = {
  DURATION_MS: 300,
  SPEED_MULT: 2,
  DASHES: 1,
};

// --- Speed -----------------------------------------------------------------

export const SPEED = {
  LERP_RATE: 1.5,           // 1/s; exponential approach to the section's target speed
};

// --- Obstacles, pickups, finish --------------------------------------------
// Sprite sizes match Assets.js; HIT_* are the (smaller) physics boxes,
// offset from the sprite's top-left.

export const OBSTACLE = {
  // Step 2: checked against the real art with ?debug=1. Cone narrowed so the
  // box's top corners sit inside the tapering cone (was 8x16 @4,4); barrel
  // box shrunk so all corners sit inside the round barrel (was 14x14 @3,5).
  cone:    { W: 16, H: 20, HIT_W: 6,  HIT_H: 15, HIT_X: 5, HIT_Y: 5 },
  crate:   { W: 24, H: 24, HIT_W: 16, HIT_H: 18, HIT_X: 4, HIT_Y: 6 },
  pallets: { W: 24, H: 48, HIT_W: 18, HIT_H: 44, HIT_X: 3, HIT_Y: 4 },
  barrel:  { W: 20, H: 20, HIT_W: 12, HIT_H: 12, HIT_X: 4, HIT_Y: 6 },
};

export const BARREL = {
  ROLL_SPEED: 90,           // px/s leftward in world space
  ACTIVATE_AHEAD: 400,      // starts rolling when this far ahead of Booker
  SPIN_DEG_PER_PX: 360 / (Math.PI * 20),
};

export const BONE = {
  W: 16,
  H: 8,
  HIT_W: 18,                // generous pickup box
  HIT_H: 14,
  BOB_AMPLITUDE: 2,
  BOB_MS: 600,
};

export const STEAK = {
  W: 40,
  H: 28,
  HIT_PAD: 6,
  COMPLETE_DELAY_MS: 900,
};

// Finish textures by `level.finish`
export const FINISH = {
  steak: { key: 'steak', W: 40, H: 28 },
  'golden-steak': { key: 'golden-steak', W: 48, H: 36 },
};

// --- Level 2-6 elements -----------------------------------------------------
// Sprite size (W x H, matches the asset contract) and the forgiving hitbox
// (HIT_*), offset from the sprite's top-left, as for OBSTACLE.

// One-way platforms: land on the top from above; pass through from below and the sides.
export const PLATFORM = {
  TILE_W: 32,
  TILE_H: 16,
  BODY_H: 8,               // collision thickness under the top surface
};

// Deadly objects. Static unless `move` is set. `fly` objects use `y` as their centre height.
export const HAZARD = {
  bollard:  { key: 'l2-bollard',  W: 16, H: 20, HIT_W: 10, HIT_H: 17, HIT_X: 3, HIT_Y: 3 },
  tires:    { key: 'l2-tires',    W: 24, H: 32, HIT_W: 20, HIT_H: 30, HIT_X: 2, HIT_Y: 2 },
  crab:     { key: 'l2-crab',     W: 20, H: 12, HIT_W: 14, HIT_H: 8,  HIT_X: 3, HIT_Y: 4, move: 'scuttle' },
  acunit:   { key: 'l3-acunit',   W: 28, H: 24, HIT_W: 24, HIT_H: 20, HIT_X: 2, HIT_Y: 4 },
  antenna:  { key: 'l3-antenna',  W: 12, H: 48, HIT_W: 4,  HIT_H: 44, HIT_X: 4, HIT_Y: 4 },
  pigeon:   { key: 'l3-pigeon',   W: 16, H: 12, HIT_W: 10, HIT_H: 6,  HIT_X: 3, HIT_Y: 3, move: 'fly', frames: 2 },
  gear:     { key: 'l4-gear',     W: 24, H: 24, HIT_W: 16, HIT_H: 16, HIT_X: 4, HIT_Y: 4, spin: true },
  l4crate:  { key: 'l4-crate',    W: 24, H: 24, HIT_W: 18, HIT_H: 19, HIT_X: 3, HIT_Y: 5 },
  cart:     { key: 'l5-cart',     W: 32, H: 28, HIT_W: 28, HIT_H: 22, HIT_X: 2, HIT_Y: 6 },
  hydrant:  { key: 'l5-hydrant',  W: 14, H: 20, HIT_W: 10, HIT_H: 16, HIT_X: 2, HIT_Y: 4 },
  grill:    { key: 'l6-grill',    W: 32, H: 24, HIT_W: 26, HIT_H: 18, HIT_X: 3, HIT_Y: 6 },
  trashcan: { key: 'l6-trashcan', W: 20, H: 28, HIT_W: 14, HIT_H: 24, HIT_X: 3, HIT_Y: 4 },
  // Timed: a vent on the ground fires a deadly column on a cycle (see STEAM)
  steam:    { key: 'l4-steam-vent', W: 16, H: 8, timed: true },
};

// Moving hazards start moving when Booker is ACTIVATE_AHEAD px away (like barrels),
// so they always meet him at the same place: about ACTIVATE_AHEAD * v / (speed + v)
// px to the left of their authored x.
export const MOVER = {
  crab:   { SPEED: 60, ACTIVATE_AHEAD: 400 },
  pigeon: { SPEED: 90, ACTIVATE_AHEAD: 520, FLAP_FPS: 8 },
};

// Steam: `{ x, type: 'steam', period, on, offset, h }`. The vent's clock starts
// when Booker is ACTIVATE_AHEAD px away; the column is deadly while
// (clock + offset) % period < on, and puffs a warning for WINDUP_MS before.
export const STEAM = {
  PERIOD_MS: 1800,
  ON_MS: 700,
  OFFSET_MS: 0,
  HEIGHT: 80,              // column height above the ground (or `h`)
  HIT_W: 10,
  WINDUP_MS: 450,
  ACTIVATE_AHEAD: 480,
  COLOR: 0xf2f2f2,
  ALPHA: 0.55,
};

// Enemies: pounce-able. `patrol` px: walks between x - patrol and x, starting
// left (toward Booker). Drones hover with `y` = centre height and bob.
export const ENEMY = {
  vacuum: { key: 'l5-vacuum', W: 24, H: 16, HIT_W: 20, HIT_H: 10, HIT_X: 2, HIT_Y: 6, SPEED: 45, frames: 2 },
  drone:  { key: 'l5-drone',  W: 24, H: 16, HIT_W: 18, HIT_H: 10, HIT_X: 3, HIT_Y: 3, SPEED: 40, frames: 2, fly: true, BOB_PX: 4, BOB_MS: 1200 },
  ACTIVATE_AHEAD: 440,
  ANIM_FPS: 8,
  POP_MS: 700,             // stomped enemies spin up and off-screen
};

// Breakables: a dash smashes them; any other contact is a hit.
export const BREAKABLE = {
  boxes: { key: 'l6-boxes', W: 24, H: 48, HIT_W: 20, HIT_H: 46, HIT_X: 2, HIT_Y: 2 },
  gate:  { key: 'l6-gate',  W: 16, H: 56, HIT_W: 12, HIT_H: 54, HIT_X: 2, HIT_Y: 2 },
  FREEZE_MS: 60,           // gameplay freeze (hit-stop) on a smash
  DEBRIS: 16,
};

// --- Death -----------------------------------------------------------------

export const DEATH = {
  DURATION_MS: 600,
  SHAKE_MS: 220,
  SHAKE_INTENSITY: 0.012,
  TUMBLE_RISE: 26,
  TUMBLE_DRIFT: 18,
  TUMBLE_ANGLE: -220,
  TUMBLE_UP_MS: 260,
};

// --- Scoring ---------------------------------------------------------------

export const SCORE = {
  DISTANCE_DIVISOR: 10,     // 1 point per 10 px
  BONE: 10,
  FINISH_BONUS: 500,
  TIME_BONUS_MAX: 300,
  // Time bonus uses total time across all attempts since leaving the title.
  // Full bonus up to par + grace; linear down to 0 at TIME_BONUS_ZERO_MULT * par.
  TIME_BONUS_GRACE_S: 3,
  TIME_BONUS_ZERO_MULT: 3,
  STARS_TWO_RATIO: 0.5,
};

// --- Autoplay bot (dev only, ?autoplay=1) ----------------------------------

export const AUTOPLAY = {
  HOLD_MS: 380,             // hold for a full jump
  GAP_LEAD_PX: 6,           // jump when Booker's front edge is this close to a gap
  OBSTACLE_MARGIN_PX: 6,
};

// Planner bot (Levels 2-6, sandbox). It simulates Booker frame by frame with the
// same controller code (src/systems/BotSim.js) and searches press/hold timings.
export const BOT = {
  FRAME_MS: 1000 / 60,
  LOOK_FRAMES: 60,          // a plan must keep Booker alive this long after its last release...
  LAND_EXTRA_FRAMES: 240,   // ...and, if he is still airborne then, until he lands (max this long)
  SETTLE_FRAMES: 4,         // alive and not stuck this long after landing
  MAX_DEPTH: 3,             // presses per plan (jump, double, dash / kicks)
  BUDGET_FRAMES: 600000,    // simulated frames per planning call before giving up
  COMMIT_FRAMES: 30,        // commit to a planned press only when it is this close; re-plan before
  REPLAN_EVERY: 6,          // frames between re-plans while waiting
  IDLE_CHECK_EVERY: 3,      // frames between idle-safety checks when nothing is planned
  WINDOW_REACH: 8,          // frames scanned either side of the first working press
  ROBUST_K: 3,              // slack (frames) measured per press, capped here
  ROBUST_SLACK: 2,          // minimum slack target; the target is the jitter in frames (35 ms = 2, 50 ms = 3), capped at ROBUST_K
  // Iterative deepening: depth 0 (one press) for every hold, then depth 1, then 2.
  // Each depth may spend this share of the budget left when it starts (the last
  // depth gets the rest), split evenly over the holds still to try.
  DEPTH_SHARE: [0.25, 0.4],
  EXTRA_DEPTH: false,       // after the target is met below ROBUST_K, look one depth deeper for more slack
  EXTRA_DEPTH_SHARE: 0.15,  // ...spending at most this share of the budget left
  MAX_WINDOWS: 3,           // working windows measured per hold before settling for the best (if none reaches the target)
  WARM_FRAMES: 12,          // a re-plan this soon after a search, with no input since, skips the depths it found empty
  // Press holds tried, in frames (6 = tap, 23 = full jump; longer ones glide)
  HOLDS_GROUND: [23, 12, 6],
  HOLDS_GROUND_GLIDE: [23, 12, 6, 45, 80, 130],
  HOLDS_AIR: [6],
  HOLDS_AIR_GLIDE: [6, 30, 70, 130],
  // botPlan (level data): entries closer than CLUSTER_GAP_PX form one scripted
  // stretch; the planner pauses from LEAD_PX before its first entry until its
  // last press is released.
  PLAN_CLUSTER_GAP_PX: 300,
  PLAN_LEAD_PX: 60,
  PLAN_DEFAULT_HOLD_MS: 380,
  PLAN_TAP_MS: 100,
};

// --- Animation -------------------------------------------------------------

export const ANIM = {
  RUN_FPS: 12,
  SPIN_FPS: 14,             // double-jump spin (frames 10-11)
  GLIDE_FPS: 6,             // ear flap (12-13)
  DASH_FPS: 16,             // zoomies (16-17)
  CLING_OFFSET_X: -10,      // display sprite shift while clinging: frame 14 draws the paws at x=47, but the body
                            // (and so the wall face) ends at x=37, so the art moves 10 px left onto the face
};

// --- Colors ----------------------------------------------------------------

export const COLORS = {
  PAGE_BG: 0x0b0b12,
  SKY_TOP: '#3b2a5c',
  SKY_MID: '#e0705a',
  SKY_LOW: '#ffc070',
  SUN: '#ffe39a',
  HANGAR: '#2a1f33',
  HANGAR_LIGHT: '#3b2c45',
  FENCE: '#1c1622',
  GROUND_TOP: '#6b5a4a',
  GROUND: '#4a3b30',
  GROUND_DARK: '#382c24',

  UI_TEXT: '#ffffff',
  UI_SHADOW: '#000000',
  MUTED_TEXT: '#c8b8d8',
  SCORE_GOLD: '#ffd34d',
  NEW_BEST: '#7dff9a',
  DISABLED: '#6a6178',
  HUD_PANEL: 0x000000,
  HUD_PANEL_ALPHA: 0.35,
  PROGRESS_BG: 0x2a2233,
  PROGRESS_FILL: 0xffb347,
  PROGRESS_STEAK: 0xd94a3a,
  STAR_ON: 0xffd34d,
  STAR_OFF: 0x4a4258,
  BTN_PRIMARY: 0xd9772b,
  BTN_PRIMARY_HOVER: 0xf08a3a,
  BTN_DISABLED: 0x3a3346,
  OVERLAY: 0x000000,
  OVERLAY_ALPHA: 0.55,
};

// --- UI --------------------------------------------------------------------

export const UI = {
  FONT: '"Courier New", Courier, monospace',
  TITLE_SIZE: 36,
  HEADING_SIZE: 20,
  BODY_SIZE: 12,
  SMALL_SIZE: 10,
  HUD_SIZE: 10,
  HUD_MARGIN: 6,
  HUD_HEIGHT: 18,
  HUD_BONE_X: 90,
  HUD_BONE_TEXT_X: 100,
  HUD_BAR_SHIFT_X: 30,
  HUD_STEAK_SCALE: 0.4,
  PROGRESS_W: 140,
  PROGRESS_H: 6,
  BTN_W: 170,
  BTN_H: 22,
  BTN_RADIUS: 4,
  STAR_RADIUS: 10,
  STAR_GAP: 28,
  BLINK_MS: 500,
};

// Draw order
export const DEPTH = {
  BG_FAR: -30,
  BG_MID: -20,
  BG_NEAR: -10,
  PIT: 4,
  GROUND: 5,
  UPDRAFT: 6,
  WALL: 7,
  PLATFORM: 8,
  OBSTACLE: 10,
  ENEMY: 11,
  PICKUP: 12,
  STEAM: 13,
  PLAYER: 20,
  HUD: 100,
};

export const TIMING = {
  MAX_DT_MS: 50,            // clamp long frames (tab switches) so physics/timers don't jump
  PAUSE_DEBOUNCE_MS: 200,   // game-loop ms after a resume during which a pause press is ignored
  // Real time: gameplay runs in fixed 1/60 s ticks (RunScene.update), whatever the display rate.
  MAX_TICKS_PER_FRAME: 3,   // catch-up cap: a longer frame (hitch, < 20 fps) slows game time instead of jumping
  TICK_SNAP_MS: 1,          // a frame this close to a full tick still runs it (absorbs vsync timestamp jitter)
};

export const TRANSITION = {
  FADE_DURATION: 250,
};

// --- High score storage ----------------------------------------------------

export const STORAGE = {
  PREFIX: 'booker-run:',
  MUTE_KEY: 'booker-run:muted',
  SAVE_KEY: 'booker-run:save:v1',     // SaveData (all levels)
  LEGACY_L1_KEY: 'booker-run:best:level1', // pre-v1 Level 1 best, migrated once
  SAVE_VERSION: 1,
  SAVE_BACKUP_KEY: 'booker-run:save:backup',  // + ':v<old version>' or ':corrupt' (SaveData)
};

// --- Menus and overlays ------------------------------------------------------
// Layouts: TITLE_UI, SELECT_UI, GAMEOVER_UI, COMPLETE_UI, PAUSE_UI, INTRO_UI, TIPS_UI below.

export const GAMEOVER = {
  // The card stays up until the player picks RETRY or LEVELS. Only the dev bot
  // (?autoplay=1) retries on its own, so QA runs keep going after a death.
  AUTO_RETRY_MS: 0,         // 0 = never retry automatically for players
  BOT_AUTO_RETRY_MS: 1200,  // ?autoplay=1 runs
  // Presses this soon after the card appears are ignored, so the jump taps a
  // player is still making when Booker gets hit don't dismiss it.
  INPUT_LOCK_MS: 600,
};

export const HUD_ABILITIES = {
  X: 138,                   // first icon centre, from the HUD margin (between bones and the progress bar)
  STEP: 14,                 // 12 px generated icons (ui-icons-12)
  BEST_MARK_COLOR: 0xffffff,
  BAR_X: 214,               // progress bar (start -> finish), 1x px
  BAR_W: 140,
  BAR_H: 5,
};

// --- Pixel UI (Phase 2 UI pass; src/ui/) ------------------------------------
// Every menu, overlay and the HUD use the generated pixel font (src/ui/PixelFont.js,
// 7 px caps at 1x, drawn at integer scales) and the pixel panels in src/ui/UiKit.js.

export const PIXEL_FONT = {
  OUTLINE: 0x1a0d24,        // baked 1 px outline + 1 px drop shadow
  LETTER_SPACING: 1,
  LINE_GAP: 4,              // px between lines at 1x (line height = 7 + 4)
};

// Tint-ready palette (numbers) shared by panels, buttons and text
export const UI_COLORS = {
  INK: 0xffffff,
  OUTLINE: 0x140a1c,
  PANEL: 0x251b3b,
  PANEL_HI: 0x4a3a70,
  PANEL_DARK: 0x150f20,
  PANEL_LOCKED: 0x19141f,
  PANEL_LOCKED_HI: 0x2f2740,
  GOLD: 0xffd34d,
  GOLD_DARK: 0xb8660f,
  ORANGE: 0xffa04a,
  GOOD: 0x7dff9a,
  BAD: 0xff6b5a,
  MUTED: 0xd2c4e2,
  DIM: 0x9a8cb3,
  DISABLED: 0x625877,
  BTN: 0xd9772b,
  BTN_HI: 0xf7a24b,
  BTN_DARK: 0x7a3812,
  BTN_GHOST: 0x3a2d57,
  BTN_GHOST_HI: 0x5a4785,
  NEW_TAG: 0xff4f5e,
  DIM_OVERLAY: 0x0b0714,
  SHADOW_ALPHA: 0.45,
  CONFETTI: [0xffd34d, 0xff6b6b, 0x7dff9a, 0x6bc5ff, 0xffffff, 0xff9f43],
};

export const UI_KIT = {
  BTN_H: 20,
  BTN_PRESS_MS: 90,
  FOCUS_PULSE_MS: 420,      // focus brackets breathe in/out
  FOCUS_SLIDE_MS: 130,      // focus frame slides between cards
  ICON_SMALL: 12,           // generated half-size icons (ui-icons-12)
  ICON_MED: 16,             // generated two-thirds icons (ui-icons-16)
  ALPHA_CUTOFF: 110,        // downscaled icon pixels below this alpha become transparent
  LAST_LEVEL_KEY: 'booker-run:ui:lastLevel',
};

export const TITLE_UI = {
  PANEL_Y: 216,
  PROMPT_Y: 223,            // 2x prompt (cap top)
  STATS_Y: 243,
  HINT_Y: 257,
  TWINKLE_EVERY_MS: 260,
  STEAK_X: 370,             // where the steak sits in title.png (sparkles)
  STEAK_Y: 150,
};

export const SELECT_UI = {
  COLS: 3,
  CARD_W: 148,
  CARD_H: 100,
  GAP_X: 8,
  GAP_Y: 6,
  TOP: 38,
  THUMB_W: 128,
  THUMB_H: 54,              // 128x72 thumbnails cropped to this height
  THUMB_Y: 6,
  HEADER_Y: 9,
  FOOTER_Y: 252,
  LOCKED_SHAKE_PX: 3,
  LIFT_PX: 2,               // focused card rises this much
  REVEAL_DELAY_MS: 450,     // unlock reveal on arrival from a clear
  TOAST_MS: 1600,
};

export const GAMEOVER_UI = {
  CARD_W: 236,
  CARD_H: 112,
  CARD_Y: 66,               // top edge
  POP_MS: 120,
  SO_CLOSE: 0.9,            // "SO CLOSE!" from this progress on
  BAR_W: 120,
  HEADERS: ['OUCH!', 'BONK!', 'WHOOPS!', 'RUFF!', 'YIPE!', 'OOF!'],
};

export const COMPLETE_UI = {
  PANEL_Y: 38,
  PANEL_H: 196,
  LEFT_X: 10,
  RIGHT_X: 246,
  PANEL_W: 224,
  BTN_Y: 252,               // button row centre
  ROW_H: 12,
  TALLY_START_MS: 350,
  TALLY_ROW_MS: 380,        // per row count-up
  STAR_GAP_MS: 260,
  REVEAL_DELAY_MS: 250,     // after the stars
  ENDING_MS: 3600,          // Level 6 golden steak flourish (any press or tap skips)
  ENDING_MIN_MS: 600,       // presses and taps on the flourish count after this long
};

export const PAUSE_UI = {
  PANEL_W: 168,
  BTN_W: 136,
  BTN_GAP: 24,
};

export const INTRO_UI = {
  AUTO_MS: 2400,            // the ability card dismisses itself after this
  MIN_MS: 300,              // presses earlier than this are ignored
  POP_MS: 220,
  OUT_MS: 160,
  CARD_W: 252,
  CARD_H: 96,
};

export const TIPS_UI = {
  MAX_ATTEMPT: 2,           // tips show on the first 2 attempts of a session
  HOLD_MS: 2800,
  IN_MS: 180,
  OUT_MS: 220,
  Y: 24,                    // toast top (just under the HUD bar)
  MAX_W: 300,
  AHEAD_MIN_PX: 40,         // with ?start= / ?x=, skip tips this close behind the start
  NAME_HOLD_MS: 2200,       // level name label on attempt 1
};

// --- Audio (Web Audio API, all procedural; see src/audio/) -----------------

export const AUDIO = {
  // Bus gains (linear). Master feeds a soft limiter so summed voices never clip.
  MASTER_GAIN: 0.8,
  MUSIC_GAIN: 0.42,
  SFX_GAIN: 0.5,
  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.15,
  STOP_FADE_S: 0.08,
  // Look-ahead scheduler (standard Web Audio pattern)
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,
  // Music tempo: BPM of a quarter note, 16th-note steps (songs live in src/audio/songs.js).
  // Menu theme, results loop, and each level's variant (LEVELS[n].music) by section 1-4.
  // Docks is 6/8 (12 steps a bar): 138 here = 92 dotted-quarter beats.
  MENU_BPM: 100,
  COMPLETE_BPM: 118,
  SECTION_BPM: [132, 138, 144, 152],   // Yard; fallback for an unknown variant
  VARIANT_BPM: {
    yard: [132, 138, 144, 152],
    docks: [138, 144, 150, 159],
    rooftops: [116, 120, 126, 132],    // half-time drums: feels slower, same ramp
    factory: [136, 142, 148, 156],
    market: [126, 132, 138, 146],
    steakhouse: [144, 150, 158, 166],  // finale: fastest
  },
  // Delay before the calm loop starts on the results screen, so the fanfare reads
  COMPLETE_MUSIC_DELAY_S: 0.4,
  // SFX
  PITCH_JITTER: 0.04,       // +/- 4% random pitch on repeated SFX
  BONE_STREAK_MS: 1200,     // bones picked within this window climb the scale
  LAND_MIN_GAP_MS: 120,     // ignore land thumps closer together than this
  // Ability / UI SFX: rate limits and tuning
  CLING_MIN_GAP_MS: 150,
  KICK_STREAK_MS: 700,      // wall kicks this close climb a semitone each (max +5)
  STOMP_STREAK_MS: 1500,    // stomps this close climb the coin chime
  STEAM_MIN_GAP_MS: 250,    // per steam event type, across all vents
  STEAM_NEAR_PX: 140,       // full steam volume within this distance of Booker
  STEAM_FAR_PX: 560,        // silent beyond this
  MENU_MOVE_MIN_GAP_MS: 40,
  TALLY_MIN_GAP_MS: 45,
  GLIDE_GAIN: 0.5,          // wind loop level (before the SFX bus)
  GLIDE_FADE_IN_S: 0.08,    // setTargetAtTime time constants: smooth start/stop, no clicks
  GLIDE_FADE_OUT_S: 0.06,
  GLIDE_POLL_MS: 50,        // how often the wind follows Booker's fall speed
  UNLOCK_JINGLE_DELAY_S: 1.2, // LEVEL_UNLOCKED fires with the fanfare; the jingle waits for it
  // Music ducks (music bus multiplier): under the new-ability card and the Level 6 ending
  INTRO_DUCK: 0.3,          // about -10 dB while the card is up; swells back when it goes
  ENDING_DUCK: 0.3,
  ENDING_DUCK_S: 2.8,       // the ending flourish is ~2.4 s
  DUCK_RAMP_S: 0.25,
  DUCK_RELEASE_S: 0.6,
  // HUD mute button
  MUTE_BTN_SIZE: 14,
  MUTE_BTN_MARGIN: 4,
};

// --- FX (Step 2 visual design / game feel) ---------------------------------
// All purely visual: nothing here touches physics, hitboxes or scoring.

export const FX = {
  // Dust at Booker's feet
  DUST_COLOR: 0xf2dfc4,
  DUST_RUN_EVERY_MS: 70,    // one puff per this many ms while running on the ground
  DUST_LAND_COUNT: 10,
  DUST_JUMP_COUNT: 5,
  DUST_LIFESPAN: 380,
  FOOT_BACK_X: 8,           // puffs start this far behind Booker's centre

  // Squash & stretch (applied to Booker's display sprite, never the body)
  SQUASH_X: 1.28,
  SQUASH_Y: 0.74,
  SQUASH_MS: 140,
  STRETCH_X: 0.82,
  STRETCH_Y: 1.2,
  STRETCH_MS: 170,

  // Bone pickup
  BONE_SPARK_COUNT: 9,
  BONE_SPARK_COLOR: 0xffe27a,
  FLOAT_TEXT_RISE: 18,
  FLOAT_TEXT_MS: 520,

  // Steak (goal)
  STEAK_BOB_PX: 3,
  STEAK_BOB_MS: 700,
  STEAK_HALO_COLOR: 0xffc94d,
  STEAK_HALO_ALPHA: 0.45,
  STEAK_HALO_PULSE_MS: 600,
  STEAK_SPARKLE_EVERY_MS: 140,
  STEAK_BEAM_W: 26,         // soft light column above the steak, visible from afar
  STEAK_BEAM_H: 200,
  STEAK_BEAM_ALPHA: 0.35,

  // Death beat (total stays under ~700 ms: HIT_STOP + DEATH.DURATION_MS)
  HIT_STOP_MS: 60,
  DEATH_FLASH_MS: 140,
  DEATH_FLASH_RGB: [255, 90, 80],
  DEATH_BURST_COUNT: 12,
  DEATH_FADE_MS: 160,       // fade to black over the last part of DEATH.DURATION_MS
  RESPAWN_FADE_MS: 140,

  // Section banner
  BANNER_Y: 52,
  BANNER_IN_MS: 180,
  BANNER_HOLD_MS: 750,
  BANNER_OUT_MS: 180,
  BANNER_FONT_SCALE: 2,     // pixel font (src/ui/PixelFont.js): 2x = 14 px caps, the old Courier banner's size
  BANNER_SUB_Y: 15,

  // Speed lines (sections 3 and 4, index 2+)
  SPEEDLINE_FROM_SECTION: 2,
  SPEEDLINE_EVERY_MS: [0, 0, 90, 45],   // by section index; 0 = off
  SPEEDLINE_SPEED: [700, 1000],
  SPEEDLINE_ALPHA: 0.6,
  SPEEDLINE_Y: [28, 230],

  // Level complete
  SLOWMO_SCALE: 0.3,        // tweens/particles/physics time scale at the moment of the win
  SLOWMO_RECOVER_MS: 700,   // real ms to ease back to 1
  WIN_HOP_PX: 12,
  CONFETTI_COUNT: 60,
  CONFETTI_COLORS: [0xffd34d, 0xff6b6b, 0x7dff9a, 0x6bc5ff, 0xffffff, 0xff9f43],

  // Title prompt
  PROMPT_ON_MS: 650,
  PROMPT_OFF_MS: 300,

  // Abilities (Levels 2-6)
  DASH_TRAIL_COLOR: 0xf1dcb4,       // Booker's light cream (dash speed lines)
  DASH_STRETCH_X: 1.25,
  DASH_STRETCH_Y: 0.85,
  DEBRIS_COLORS: [0xb08350, 0x6e4e2a, 0xd9b27a, 0x6d737e],
  SMASH_SHAKE_MS: 90,
  SMASH_SHAKE_INTENSITY: 0.006,

  // --- Levels 2-6 ability juice (src/fx/AbilityFx.js; docs/fx-notes.md) ---
  SPIN_ARC_DEG_PER_MS: 1.9,         // double-jump whoosh arc spin speed
  GLIDE_TRAIL_MS: 230,              // ear-tip wind trails
  GLIDE_TRAIL_ALPHA: 0.55,
  GLIDE_TRAIL_EVERY_MS: 30,
  GLIDE_PUFF_EVERY_MS: 150,
  GLIDE_BOB_PX: 1,                  // display-only float bob while gliding
  GLIDE_BOB_MS: 520,
  CLING_SQUASH_X: 0.84,             // squash against the wall on contact
  CLING_SQUASH_Y: 1.12,
  CLING_PAW_DX: 23,                 // frame 14 paws are 23 px right of the frame centre
  SCRAPE_EVERY_MS: 35,              // sparks + dust while sliding down a wall
  SCRAPE_SPARK_COLORS: [0xffffff, 0xfff0a8, 0xffb347],
  SCRAPE_DUST_COLOR: 0xb9b2a8,
  POUNCE_STARS: 6,
  POUNCE_HOLD_MS: 40,               // squash held through RunScene's 40 ms stomp freeze
  POUNCE_STRETCH_X: 0.8,
  POUNCE_STRETCH_Y: 1.26,
  POUNCE_SHAKE_MS: 70,
  POUNCE_SHAKE_INTENSITY: 0.004,
  STOMP_SQUASH_X: 1.5,              // stomped enemy: white flash + squash, then the pop
  STOMP_SQUASH_Y: 0.45,
  STOMP_SQUASH_MS: 60,
  DASH_GHOSTS: 6,                   // afterimage pool
  DASH_GHOST_EVERY_MS: 32,
  DASH_GHOST_MS: 170,
  DASH_GHOST_ALPHA: 0.55,
  DASH_GHOST_COLOR: 0xfff1d6,
  DASH_LINE_MS: 150,                // speed lines behind Booker
  DASH_LINE_EVERY_MS: 20,
  DASH_NUDGE_PX: 8,                 // camera lags this far at a dash start, then catches up
  DASH_NUDGE_BACK_MS: 260,
  SMASH_CHUNK_POOL: 8,              // smashed boxes / gate split into tumbling chunks
  SMASH_CHUNK_MS: 700,
  SMASH_CHUNK_GRAVITY: 760,
  SMASH_SPLINTERS: 14,
  SMASH_SPLINTER_COLORS: [0xc8955a, 0x9c6b3a, 0xe3c08a, 0x8a5a2b],
  SMASH_DUST_COLOR: 0xcbb08a,

  // --- Levels 2-6 world (src/fx/SteamView.js, UpdraftView.js, WorldFx.js) ---
  STEAM_COL_W: 16,                  // drawn column (hitbox is STEAM.HIT_W = 10)
  STEAM_COL_ALPHA: 0.95,
  STEAM_POP_SCALE: 1.7,             // column pops wide when it starts firing
  STEAM_SCROLL_PX_PER_MS: 0.3,
  STEAM_BILLOW_EVERY_MS: 30,
  STEAM_SPUTTER_EVERY_MS: [140, 40], // wind-up puffs: slow -> fast
  STEAM_GLOW_COLOR: 0xff6a2a,
  STEAM_GLOW_SCALE: 2.2,
  STEAM_VENT_WARM: 0xffc080,        // vent tint through the wind-up
  STEAM_VENT_HOT: 0xff4a3a,
  STEAM_VENT_ON: 0xffd2a8,
  UPDRAFT_FILL_ALPHA: 0.2,
  UPDRAFT_EDGE_ALPHA: 0.55,
  UPDRAFT_EDGE_SCROLL: 0.06,        // px/ms the dashed edges rise
  UPDRAFT_STREAK_EVERY_MS: 45,
  UPDRAFT_STREAK_ALPHA: 0.8,
  UPDRAFT_STREAK_MAX: 22,
  UPDRAFT_LEAF_EVERY_MS: 520,
  UPDRAFT_LEAF_COLORS: [0xd9c27a, 0xa8c46a, 0xf2efe6],
  // Per level number: air = column/streak tint, vent = vent + pipe tint, leaves = scrap colours
  UPDRAFT_THEMES: {
    6: { air: 0xffc48a, vent: 0xffa070, leaves: [0xffb347, 0xff7a3a, 0x8c7f7a] },  // hot air, embers, ash
  },
  WALL_TINTS: { 6: 0xe0a080 },      // per level number: the factory wall art tinted to rusty steel
  ROTOR_COLOR: 0xdfe8f0,
  DRONE_SHADOW_ALPHA: 0.35,
  DRONE_OUTLINE_COLOR: 0x12091c,   // 1 px outline behind drones (readable against the L5 stalls)
  DRONE_OUTLINE_ALPHA: 0.9,
  VACUUM_LIGHT_COLOR: 0xff3a3a,
  VACUUM_LIGHT_SCALE: 0.9,
  GOLDEN_RAY_COLOR: 0xffcf4a,       // Level 6 golden steak
  GOLDEN_RAY_ALPHA: 0.42,
  GOLDEN_RAY_SCALE: 0.9,
  GOLDEN_RAY_SPIN_MS: 14000,
  GOLDEN_GLINT_EVERY_MS: 110,
  GOLDEN_HALO_SCALE: 1.6,
  GOLDEN_BEAM_W: 40,
  GOLDEN_BEAM_ALPHA: 0.5,
  GOLDEN_WIN_SPARKLES: 40,

  // --- Levels 2-6 ambience (src/fx/Ambience.js) ---
  AMB_SPRAY_EVERY_MS: 50,           // docks: spray over water pits
  AMB_SPRAY_MAX: 22,
  AMB_GULLS: 3,
  AMB_STARS: 22,                    // rooftops
  AMB_CLOUDS: 2,
  AMB_EMBER_EVERY_MS: 80,           // factory / steakhouse
  AMB_EMBER_MAX: 20,
  AMB_SPURT_EVERY_MS: 900,
  AMB_BOKEH: 12,                    // market
  AMB_SKY_LANTERNS: 4,
  AMB_BOKEH_COLORS: [0xff8a5c, 0xffc46b, 0xff5c8a, 0x5ce1e6, 0xffe08a],
  AMB_SMOKE_EVERY_MS: 160,          // steakhouse
  AMB_SMOKE_MAX: 16,
  AMB_DRIFT_EMBERS: 7,
};
