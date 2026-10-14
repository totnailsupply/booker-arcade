// =============================================================================
// Constants — every tunable in one place. Pure data, no imports, no Phaser:
// src/sim/ imports this file and runs headless in node.
// Design numbers come from PLAN.md section 2.
// =============================================================================

export const GAME = {
  WIDTH: 480,
  HEIGHT: 270,
  BG: '#1d2a16',
};

// --- Simulation --------------------------------------------------------------

export const SIM = {
  DT: 1 / 60,              // fixed step (s)
  MAX_STEPS_PER_FRAME: 5,  // accumulator cap; extra time is dropped (slow-down, never a spiral)
  MAX_FRAME_S: 0.1,        // a frame longer than this counts as 0.1 s
  SNAP_S: 0.0005,          // a frame within 0.5 ms of 1/60 s counts as exactly 1/60 s (vsync jitter)
  HASH_CELL: 32,           // SpatialHash cell size (px)
  MAX_EVENTS: 512,         // event queue cap per drain (oldest dropped)
};

export const ARENA = {
  W: 768,
  H: 512,
  // Fence thickness in arena.png: nobody's hit circle goes inside it.
  BORDER_X: 12,            // left / right fence
  BORDER_Y: 16,            // top / bottom fence
  SPAWN_MARGIN: 28,        // spawns stay this far from the arena edge
};

export const PLAYER = {
  SPEED: 110,              // px/s
  RADIUS: 7,               // hit circle
  HP: 10,
  IFRAMES_S: 0.75,         // invulnerable after a hit (Step 4: 0.6 -> 0.75, fewer early chip deaths)
  DASH_S: 0.18,
  DASH_SPEED: 340,         // px/s while dashing (~61 px per dash)
  DASH_COOLDOWN_S: 1.6,    // from the start of the dash
  PICKUP_RADIUS: 40,       // kibble inside this flies to Booker
  COLLECT_RADIUS: 10,      // kibble inside this is eaten
  MAX_WEAPONS: 4,
  DEATH_BEAT_S: 1.1,       // HP 0 -> this long frozen -> game over
  MIN_DAMAGE: 0.5,         // armor never lowers a hit below this
};

// Enemy table (PLAN section 2). speed px/s, r = hit radius, dmg = contact damage at wave 1.
// fromWave = first wave in the spawn pool (99 = never spawned by the budget).
// tex/scale = render texture (kittens reuse the cat sheet at 0.7x).
export const ENEMIES = {
  cat:      { hp: 8, speed: 55, r: 8, cost: 1, points: 10, xp: 1, dmg: 1, fromWave: 1, weight: 1, kbResist: 0 },
  squirrel: { hp: 4, speed: 95, r: 6, cost: 1, points: 10, xp: 1, dmg: 1, fromWave: 2, weight: 0.7, kbResist: 0,
    zigFreq: 2.6,          // Hz of the side-to-side weave
    zigAmp: 0.85,          // sideways speed as a fraction of forward speed
  },
  crow:     { hp: 6, speed: 70, r: 7, cost: 1.5, points: 15, xp: 2, dmg: 1, fromWave: 3, weight: 0.6, kbResist: 0, flying: true,
    hoverDist: 85,         // circles Booker at about this distance ...
    hoverS: 1.6,           // ... for this long (plus up to 1 s random) ...
    windupS: 0.45,         // ... shivers in place ...
    swoopSpeed: 230,       // ... then swoops in a straight line
    swoopS: 0.75,
    swoopFrom: 1.8,        // only winds up within hoverDist x this
  },
  raccoon:  { hp: 20, speed: 40, r: 10, cost: 3, points: 30, xp: 5, dmg: 1.2, fromWave: 4, weight: 0.35, kbResist: 0.8 },
  skunk:    { hp: 12, speed: 52, r: 8, cost: 2.5, points: 25, xp: 4, dmg: 1, fromWave: 6, weight: 0.4, kbResist: 0.2,
    keepDist: 90,          // backs off inside this, closes in beyond keepDist + keepBand
    keepBand: 30,
    firstShot: [1, 2],     // s before the first stink cloud (random in range)
    fireCd: 3.2,           // s between stink clouds (first one after 1-2 s)
    fireRange: 170,
  },
  kitten:   { hp: 5, speed: 78, r: 6, cost: 0, points: 5, xp: 1, dmg: 1, fromWave: 99, weight: 0, kbResist: 0, tex: 'cat', scale: 0.7 },
  'boss-cat': { name: 'BIG TOM', hp: 600, speed: 42, r: 20, points: 1000, xp: 120, dmg: 2, fromWave: 99, kbResist: 1, boss: true,
    homeWave: 5,
    walkS: 2.2,            // walks at Booker this long between charges
    windupS: 0.7,          // telegraph line, then ...
    chargeSpeed: 300,
    chargeS: 0.85,
    recoverS: 0.5,
    kittens: 4,            // summoned after each charge ...
    maxKittens: 8,         // ... while fewer than this are alive
  },
  'boss-vac': { name: 'ROBO-VAC 9000', hp: 1800, speed: 82, r: 22, points: 2500, xp: 250, dmg: 2.5, fromWave: 99, kbResist: 1, boss: true,
    homeWave: 10,
    ringCd: 2.8,           // s between dust-ball rings (phase 1)
    firstRing: 1.5,        // s after landing
    ringCount: 12,
    ring2Cd: 2.1,          // phase 2 (under 50 % HP)
    ring2Count: 16,
    pull: 42,              // phase 2: px/s pull on Booker toward the vac ...
    pullRange: 300,        // ... inside this distance
    phase2Speed: 105,
  },
};

export const ENEMY = {
  HP_PER_WAVE: 0.25,       // HP x (1 + HP_PER_WAVE (n-1) + HP_QUAD (n-1)^2)
  HP_QUAD: 0.09,           // (wave 5 = 3.4x, wave 10 = 10.5x)
  DMG_PER_WAVE: 0.14,      // contact damage +14 % per wave (Step 4: was 10 %; late waves bite harder)
  SEPARATION: 0.5,         // fraction of overlap resolved per step (soft push)
  KNOCKBACK: 90,           // px/s impulse from a hit (scaled by 1 - kbResist)
  KNOCKBACK_DECAY: 10,     // 1/s exponential decay
  FLASH_S: 0.08,           // white flash after a hit (render only)
  CAP: 140,                // alive + telegraphed
  // Elites (PLAN: from wave 7, 10 %)
  ELITE_FROM_WAVE: 7,
  ELITE_CHANCE: 0.1,
  ELITE_SIZE: 1.2,
  ELITE_HP: 3,
  ELITE_XP: 4,
  ELITE_POINTS: 3,
  GOLDEN_BONE_CHANCE: 0.01,
};

// Enemy projectiles (stink clouds, dust balls). dmg scales per wave like contact damage (ENEMY.DMG_PER_WAVE).
export const HOSTILE = {
  STINK: { speed: 75, r: 6, dmg: 1, lingerS: 1.1, maxFlightS: 1.6 },  // flies to Booker's spot, then lingers
  DUST: { speed: 78, r: 5, dmg: 1.5, life: 5 },
  MAX: 160,
};

export const BOSS = {
  TELEGRAPH_S: 1.4,        // big paw marker before the boss lands
  SPAWN_MULT: 0.45,        // normal spawn budget on boss waves
  DEATH_BEAT_S: 1.3,       // boss dies -> golden bone flies in -> wave clears
  HP_PER_CYCLE: 0.6,       // endless: boss HP x (1 + 0.6 per repeat)
};

export const WAVES = {
  COUNT: 10,               // clearing wave 10 = win (Endless continues)
  BASE_S: 20,              // wave length = BASE_S + PER_WAVE_S * n
  PER_WAVE_S: 4,
  // cost units / s: BUDGET_BASE + BUDGET_PER_WAVE (n-1) + BUDGET_QUAD (n-1)^2
  // (gentle early, steep late: wave 1 = 1.6, wave 5 = 5.3, wave 10 = 18)
  BUDGET_BASE: 1.6,
  BUDGET_PER_WAVE: 0.2,
  BUDGET_QUAD: 0.18,       // Step 4: was 0.17
  BUDGET_ENDLESS_CAP: 14,  // endless: the rate stops growing here (the enemy cap does the rest)
  RAMP_START: 0.7,         // within a wave the rate ramps from 0.7x ...
  RAMP_END: 1.3,           // ... to 1.3x (the end of a wave is the busiest)
  OPENING_BUDGET: 3,       // budget granted at wave start so the yard isn't empty
  TELEGRAPH_S: 0.8,        // paw-print marker before an enemy appears
  MIN_SPAWN_DIST: 110,     // px from Booker
  SPAWN_TRIES: 12,
  BREAK_S: 2.5,
  HEAL_FRAC: 0.2,          // heal 20 % max HP at wave end
  BOSS_EVERY: 5,           // wave n % 5 == 0 is a boss wave: Robo-Vac on n % 10 == 0, else Big Tom
  WAVE_BONUS: 100,         // score bonus = WAVE_BONUS x n when wave n is cleared
};

export const SCORE = {
  COMBO_WINDOW_S: 1.5,
  COMBO_STEP: 0.1,         // multiplier = 1 + 0.1 per chained kill
  COMBO_CAP: 3,
};

export const XP = {
  // next = BASE + PER_LEVEL (L-1) + floor(L^POW)
  BASE: 5,
  PER_LEVEL: 6,
  POW: 1.5,               // fixed: Pickups.xpForLevel uses DetMath.pow15 (L * sqrt(L))
  KIBBLE_S: 1,
  KIBBLE_M: 5,
  KIBBLE_L: 20,
  KIBBLE_SPEED: 60,        // initial pull speed (px/s)
  KIBBLE_ACCEL: 900,       // px/s^2 while pulled
  KIBBLE_MAX_SPEED: 520,
  MAX_PICKUPS: 400,        // more than this: new kibble merges into an old one
  MERGE_TRIES: 8,          // random picks to find a kibble to merge into
  HEART_CHANCE: 0.02,
  HEART_HEAL: 3,
  MAGNET_CHANCE: 0.005,
  REROLLS: 2,
  CHOICES: 3,
  RARE_CHANCE: 0.1,
  OWNED_WEAPON_WEIGHT: 3,  // card weight for levels of owned weapons
  NEW_WEAPON_WEIGHT: 1.6,
  STAT_WEIGHT: 1,
};

// Kennel (permanent upgrades, PLAN section 3). Per rank.
export const META = {
  MAX_RANK: 5,
  hearty: 2,               // +2 max HP
  jaws: 0.05,              // +5 % damage
  paws: 0.04,              // +4 % speed
  sniffer: 0.15,           // +15 % pickup radius
  lucky: 1,                // +1 reroll
  learner: 0.08,           // +8 % XP
};

export const WEAPON_KEYS = ['bark', 'ball', 'bone', 'frisbee', 'squeak', 'zoomies'];

// Weapons. Each level row is absolute (not cumulative).
export const WEAPONS = {
  bark: {
    name: 'Bark',
    desc: 'Sound wave at the nearest enemy',
    range: 210,            // only fires when a target is this close
    levels: [
      { dmg: 6, cd: 0.6, speed: 230, count: 1, pierce: 0, r: 5, life: 1.0, spread: 0.18 },
      { dmg: 8, cd: 0.55, speed: 240, count: 1, pierce: 0, r: 5, life: 1.0, spread: 0.18 },
      { dmg: 8, cd: 0.5, speed: 240, count: 2, pierce: 0, r: 5, life: 1.0, spread: 0.18 },
      { dmg: 10, cd: 0.45, speed: 250, count: 2, pierce: 1, r: 6, life: 1.1, spread: 0.18 },
      { dmg: 12, cd: 0.4, speed: 260, count: 3, pierce: 1, r: 6, life: 1.2, spread: 0.2 },
    ],
  },
  ball: {
    name: 'Tennis Ball',
    desc: 'Ricochets between enemies',
    range: 200,
    bounceRange: 115,      // next target must be this close to the last hit
    levels: [
      { dmg: 6, cd: 1.3, speed: 230, count: 1, bounces: 2, r: 5, life: 2.4 },
      { dmg: 8, cd: 1.2, speed: 240, count: 1, bounces: 2, r: 5, life: 2.4 },
      { dmg: 8, cd: 1.15, speed: 240, count: 2, bounces: 3, r: 5, life: 2.6 },
      { dmg: 10, cd: 1.1, speed: 250, count: 2, bounces: 4, r: 6, life: 2.8 },
      { dmg: 12, cd: 1.0, speed: 260, count: 3, bounces: 5, r: 6, life: 3.0 },
    ],
  },
  bone: {
    name: 'Boomerang Bone',
    desc: 'Pierces everything, comes back',
    range: 190,
    returnSpeed: 1.15,     // x throw speed on the way back
    catchDist: 10,         // px: Booker catches it
    levels: [
      { dmg: 10, cd: 1.6, speed: 210, count: 1, dist: 120, r: 7 },
      { dmg: 13, cd: 1.5, speed: 210, count: 1, dist: 125, r: 7 },
      { dmg: 13, cd: 1.4, speed: 220, count: 2, dist: 130, r: 7 },
      { dmg: 17, cd: 1.3, speed: 230, count: 2, dist: 145, r: 8 },
      { dmg: 22, cd: 1.15, speed: 240, count: 3, dist: 155, r: 8 },
    ],
  },
  frisbee: {
    name: 'Frisbee',
    desc: 'Discs orbit Booker',
    hitCd: 0.4,            // s before the same enemy can be hit by a disc again
    levels: [
      { dmg: 9, count: 1, orbit: 50, spin: 4.2, r: 8 },
      { dmg: 10, count: 2, orbit: 52, spin: 4.2, r: 8 },
      { dmg: 10, count: 2, orbit: 56, spin: 4.6, r: 8 },
      { dmg: 12, count: 3, orbit: 60, spin: 4.6, r: 8 },
      { dmg: 15, count: 3, orbit: 66, spin: 5.0, r: 9 },
    ],
  },
  squeak: {
    name: 'Squeaky Toy',
    desc: 'Shockwave ring with knockback',
    knockback: 3.5,        // x ENEMY.KNOCKBACK
    levels: [
      { dmg: 11, cd: 1.5, radius: 60 },
      { dmg: 13, cd: 1.4, radius: 64 },
      { dmg: 15, cd: 1.3, radius: 70 },
      { dmg: 18, cd: 1.2, radius: 76 },
      { dmg: 23, cd: 1.1, radius: 84 },
    ],
  },
  zoomies: {
    name: 'Zoomies',
    desc: 'Damaging paw-print trail',
    gap: 11,               // px travelled between paw prints
    tick: 0.35,            // s before the same enemy takes trail damage again
    maxPrints: 64,
    levels: [
      { dmg: 7, life: 2.6, r: 12 },
      { dmg: 8, life: 2.9, r: 12 },
      { dmg: 10, life: 3.2, r: 13 },
      { dmg: 12, life: 3.5, r: 14 },
      { dmg: 15, life: 4.0, r: 15 },
    ],
  },
};

// One line per level (level-up card text). Index 0 = the NEW! card.
export const WEAPON_DESC = {
  bark: ['Sound wave at the nearest enemy', '+2 damage, fires faster', '+1 sound wave', '+2 damage, pierces 1, bigger', '+2 damage, +1 wave, fastest'],
  ball: ['Ball ricochets to 3 enemies', '+2 damage, throws faster', '+1 ball, hits 4', '+3 damage, hits 5', '+2 damage, +1 ball, hits 6'],
  bone: ['Boomerang pierces, comes back', '+3 damage, throws faster', '+1 bone', '+4 damage, longer throw', '+5 damage, +1 bone'],
  frisbee: ['A disc orbits Booker', '+1 disc, +1 damage', 'Wider, faster orbit', '+1 disc, +2 damage', '+3 damage, widest orbit'],
  squeak: ['Shockwave knocks enemies back', '+2 damage, squeaks faster', '+2 damage, bigger ring', '+3 damage, bigger ring', '+4 damage, biggest ring'],
  zoomies: ['Paw prints hurt enemies', '+1 damage, longer trail', '+2 damage, longer trail', '+2 damage, bigger prints', '+3 damage, longest trail'],
};

// Stat cards (stack up to `max`). `per` is the value of one (non-rare) card.
export const STATS = {
  heart:    { name: 'Big Heart',        desc: '+3 max HP, heal 3',     max: 5, per: 3 },
  regen:    { name: 'Good Boy Snacks',  desc: '+0.25 HP/s regen',      max: 5, per: 0.25 },
  speed:    { name: 'Zoomies Boots',    desc: '+10% speed',            max: 5, per: 0.10 },
  damage:   { name: 'Sharp Teeth',      desc: '+15% damage',           max: 5, per: 0.15 },
  firerate: { name: 'Waggy Tail',       desc: '+12% fire rate',        max: 5, per: 0.12 },
  pickup:   { name: 'Big Ears',         desc: '+30% pickup radius',    max: 5, per: 0.30 },
  armor:    { name: 'Thick Fur',        desc: '+1 armor',              max: 5, per: 1 },
  crit:     { name: 'Lucky Collar',     desc: '+8% crit (2x damage)',  max: 5, per: 0.08 },
  area:     { name: 'Big Paws',         desc: '+20% area',             max: 5, per: 0.20 },
  proj:     { name: 'Extra Treats',     desc: '+1 projectile',         max: 2, per: 1 },
};
export const CRIT_MULT = 2;

// Icon frame index in the 'icons' sheet (6 weapons, then 10 stats)
export const ICON_FRAMES = {
  bark: 0, ball: 1, bone: 2, frisbee: 3, squeak: 4, zoomies: 5,
  heart: 6, regen: 7, speed: 8, damage: 9, firerate: 10, pickup: 11, armor: 12, crit: 13, area: 14, proj: 15,
};

// 'items' sheet frames (PLAN section 5)
export const ITEM_FRAMES = {
  BARK: 0, BALL: 1, BONE: 2, FRISBEE: 3, STINK: 4, DUST: 5,
  KIBBLE_S: 6, KIBBLE_M: 7, KIBBLE_L: 8, HEART: 9, MAGNET: 10, GOLDEN_BONE: 11,
};

// --- Bots (src/sim/bots.js) ----------------------------------------------------

export const BOTS = {
  LANE_TIE_PX: 1,          // smart bot: |offset| from Big Tom's lane under this = dead centre (dodge to the open side)
  THREAT_RADIUS: 130,      // enemies inside this push the kite bot
  BOSS_RADIUS: 220,        // bosses push from this far
  BOSS_WEIGHT: 6,
  HOSTILE_RADIUS: 70,      // enemy projectiles push from this far
  HOSTILE_WEIGHT: 2,
  WALL_MARGIN: 70,         // start steering away from the fence this close
  WALL_WEIGHT: 2.2,
  CENTER_PULL: 0.15,       // gentle pull toward the arena middle
  KIBBLE_PULL: 0.6,        // smart bot drifts toward nearby kibble when safe
  KIBBLE_RADIUS: 120,
  KIBBLE_RISK: 1,          // pull toward close kibble while enemies are around ...
  KIBBLE_RISK_RADIUS: 90,  // ... within this distance ...
  KIBBLE_RISK_DIST: 40,    // ... unless an enemy is this close
  DASH_RADIUS: 30,         // smart bot dashes when an enemy is this close ...
  DASH_CROWD: 3,           // ... or this many enemies are inside CROWD_RADIUS
  CROWD_RADIUS: 50,
  CHARGE_LANE: 34,         // smart bot sidesteps Big Tom's charge lane (px from the line)
  CHARGE_DASH_DIST: 90,    // and dashes when a charging boss is this close
  // Smart bot card scores (higher = better)
  CARD_SCORE: {
    weaponLevel: 10, startWeapon: 1.5, newWeapon: 8.5, newWeaponLate: 2, secondWeapon: 13,
    damage: 7, firerate: 6.5, proj: 7.5, heart: 5, armor: 5.5, regen: 4, speed: 4.5, area: 4, crit: 3.5, pickup: 3,
    rare: 1.5, lowHpHeart: 4,
  },
  WEAPON_PREF: { bark: 0.5, ball: 0.6, bone: 0.8, frisbee: 0.7, squeak: 0.6, zoomies: 0 },
};

// --- Presentation ----------------------------------------------------------------

export const CAMERA = {
  LERP: 0.15,
  DEADZONE_W: 40,
  DEADZONE_H: 28,
  // Step 4: the camera may scroll this far above the top fence, so Booker (and the
  // enemies by the fence) are never hidden under the top HUD rows (HP, score, combo).
  HUD_TOP_PAD: 30,
};

// Sprite anchoring: ground units are drawn with their feet (origin 0.5, 1) this many
// px below the sim position (the hit-circle centre); crows are centred.
export const RENDER = {
  FEET: { booker: 9, cat: 8, squirrel: 7, crow: 0, raccoon: 9, skunk: 8, kitten: 6, 'boss-cat': 22, 'boss-vac': 18 },
  SHADOW_W: { booker: 18, cat: 16, squirrel: 12, crow: 12, raccoon: 20, skunk: 16, kitten: 11, 'boss-cat': 46, 'boss-vac': 52 },
  CROW_SHADOW_DY: 12,      // crows fly: their shadow is this far below
  ELITE_TINT: 0xffd040,
  TRAIL_TINT: 0x7a3e12,
  SQUEAK_RING: 0xfff2a0,
  CHARGE_LINE: 0xff3a2a,
  PULL_TINT: 0x9adfff,
};

export const DEPTH = {
  ARENA: 0,
  MARKER: 5,
  PICKUP: 10,
  ACTORS: 100,             // + y, so lower sprites draw in front
  PROJECTILE: 1000,
  DEBUG: 1500,
  TRAIL: 4,
  HUD: 2000,
  TOUCH: 2100,
  BANNER: 2200,
};

export const UI = {
  FONT: '"Courier New", Courier, monospace',
  TITLE_SIZE: 22,
  HEADING_SIZE: 16,
  BODY_SIZE: 10,
  SMALL_SIZE: 8,
  PAD: 6,
  // Level-up cards
  CARD_W: 132,
  CARD_H: 150,
  CARD_GAP: 12,
  // Wave banner
  BANNER_HOLD_MS: 1100,
  BANNER_FADE_MS: 300,
  // Results
  REPLAY_GUARD_MS: 250,    // ignore keys this long after Results opens (held keys)
  LEVELUP_AUTOPICK_MS: 250, // ?autoplay=1 picks a card after this
};

export const COLORS = {
  OVERLAY: 0x0e1408,
  OVERLAY_ALPHA: 0.72,
  HUD_PANEL: 0x14200c,
  HP: 0xe0473a,
  HP_BACK: 0x3a1512,
  XP: 0x4fb3ff,
  XP_BACK: 0x16283a,
  DASH: 0xffd44a,
  CARD: 0xf6ead0,
  CARD_EDGE: 0x5a3a1c,
  CARD_RARE: 0xffc93a,
  CARD_HOVER: 0xfff6e0,
  BUTTON: 0x3d6b25,
  BUTTON_HOVER: 0x56913a,
  UI_TEXT: '#fff6e0',
  MUTED_TEXT: '#c9d8b0',
  DARK_TEXT: '#3a2410',
  ACCENT_TEXT: '#ffd44a',
  STROKE: '#1a1208',
  JOYSTICK: 0xffffff,
};

export const TOUCH = {
  JOY_RADIUS: 28,          // knob travel (game px)
  JOY_DEADZONE: 0.18,      // fraction of JOY_RADIUS
  JOY_ZONE_FRAC: 0.7,      // a touch starting left of this fraction of the width moves
  DASH_R: 18,
  DASH_X: 444,             // Dash button centre (screen px)
  DASH_Y: 232,
};

export const STORAGE = {
  KEY: 'backyard-brawl:save',
  VERSION: 1,
  MAX_SCORES: 10,
};

export const DEBUG = {
  MAX_WAVE: 10,
  MAX_HP: 999,
  MAX_SPEED: 16,           // ?speed=N: sim steps run N x faster than real time (QA only)
};

// --- Audio (engine copied from booker-run) ----------------------------------------

export const AUDIO = {
  MASTER_GAIN: 0.8,
  MUSIC_GAIN: 0.42,
  SFX_GAIN: 0.5,
  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.15,
  STOP_FADE_S: 0.08,
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,
  MENU_BPM: 100,
  COMPLETE_BPM: 118,
  SECTION_BPM: [132, 138, 144, 152],
  VARIANT_BPM: {
    yard: [132, 138, 144, 152],
    docks: [138, 144, 150, 159],
    rooftops: [116, 120, 126, 132],
    factory: [136, 142, 148, 156],
    market: [126, 132, 138, 146],
    steakhouse: [144, 150, 158, 166],
  },
  COMPLETE_MUSIC_DELAY_S: 0.4,
  PITCH_JITTER: 0.04,
  BONE_STREAK_MS: 1200,
  LAND_MIN_GAP_MS: 120,
  CLING_MIN_GAP_MS: 150,
  KICK_STREAK_MS: 700,
  STOMP_STREAK_MS: 1500,
  STEAM_MIN_GAP_MS: 250,
  STEAM_NEAR_PX: 140,
  STEAM_FAR_PX: 560,
  MENU_MOVE_MIN_GAP_MS: 40,
  TALLY_MIN_GAP_MS: 45,
  GLIDE_GAIN: 0.5,
  GLIDE_FADE_IN_S: 0.08,
  GLIDE_FADE_OUT_S: 0.06,
  GLIDE_POLL_MS: 50,
  UNLOCK_JINGLE_DELAY_S: 1.2,
  INTRO_DUCK: 0.3,
  ENDING_DUCK: 0.3,
  ENDING_DUCK_S: 2.8,
  DUCK_RAMP_S: 0.25,
  DUCK_RELEASE_S: 0.6,
  // Backyard Brawl remaps: rate limits so 100 enemies don't stack 100 voices
  SHOT_MIN_GAP_MS: 70,
  HIT_MIN_GAP_MS: 45,
  KILL_MIN_GAP_MS: 40,
  PICKUP_MIN_GAP_MS: 35,
  MUSIC_VARIANT: 'yard',
  // HUD mute button
  MUTE_BTN_SIZE: 14,
  MUTE_BTN_MARGIN: 4,
};

// --- Menus and meta progression (Step 2B; owned by the menu scenes) ---------------

// Weapon roster as the menus show it (PLAN section 2 weapon table). `unlock`
// is checked by SaveData.recordRun(): wave = reach wave n, kills = lifetime
// kills, boss = beat that boss, wins = win n runs.
export const MENU_META = {
  WEAPON_ORDER: ['bark', 'ball', 'bone', 'frisbee', 'squeak', 'zoomies'],
  WEAPON_INFO: {
    bark:    { name: 'Bark',    blurb: 'Sound wave at the nearest enemy', unlock: null },
    ball:    { name: 'Ball',    blurb: 'Tennis ball ricochets to 3 foes', unlock: { wave: 3 }, unlockText: 'Reach wave 3' },
    bone:    { name: 'Bone',    blurb: 'Boomerang that pierces all',     unlock: { kills: 500 }, unlockText: '500 total kills' },
    frisbee: { name: 'Frisbee', blurb: 'Discs orbit around Booker',      unlock: { wave: 6 }, unlockText: 'Reach wave 6' },
    squeak:  { name: 'Squeak',  blurb: 'Shockwave ring, knocks back',    unlock: { boss: 'boss-cat' }, unlockText: 'Beat Big Tom' },
    zoomies: { name: 'Zoomies', blurb: 'Damaging paw-print trail',       unlock: { wins: 1 }, unlockText: 'Win a run' },
  },
  ENDLESS_UNLOCK_TEXT: 'Win a run to unlock Endless',
  BOSS_NAMES: { 'boss-cat': 'Big Tom', 'boss-vac': 'Robo-Vac 9000' },

  // Golden Bones earned per run = floor(score / BONES_SCORE_DIV) + BONES_PER_WAVE x waves cleared + drops.
  // Step 4 retune (was /250 and 5 per wave: a win paid ~400, the whole Kennel costs 1200).
  // Now a win pays ~90 and a wave-5 death ~25; Kennel progression sims (buy the cheapest
  // rank when affordable): kite bot maxes it in 20-22 runs, smart bot in 13.
  BONES_SCORE_DIV: 2000,
  BONES_PER_WAVE: 3,

  // Kennel: permanent upgrades, 5 ranks. `per` = effect of one rank (2A's Arena
  // applies runConfig.meta[key] x per). icon = 'icons' sheet frame.
  KENNEL_COSTS: [10, 20, 35, 55, 80],
  KENNEL_MAX: 5,
  KENNEL_ORDER: ['hearty', 'jaws', 'paws', 'sniffer', 'lucky', 'learner'],
  KENNEL: {
    hearty:  { name: 'Hearty',       per: 2,    unit: 'hp',   desc: '+2 max HP',           short: 'max HP', icon: 6 },
    jaws:    { name: 'Strong Jaws',  per: 0.05, unit: 'pct',  desc: '+5% damage',          short: 'damage', icon: 9 },
    paws:    { name: 'Quick Paws',   per: 0.04, unit: 'pct',  desc: '+4% speed',           short: 'speed',  icon: 8 },
    sniffer: { name: 'Sniffer',      per: 0.15, unit: 'pct',  desc: '+15% pickup radius',  short: 'pickup', icon: 11 },
    lucky:   { name: 'Lucky',        per: 1,    unit: 'count', desc: '+1 reroll',          short: 'reroll', icon: 13 },
    learner: { name: 'Fast Learner', per: 0.08, unit: 'pct',  desc: '+8% XP',              short: 'XP',     icon: 7 },
  },
};

export const MENU = {
  // Wood-frame panel palette
  OUTLINE: 0x1a1208,
  WOOD: 0x7a4a24,
  WOOD_LIGHT: 0xa0683a,
  WOOD_DARK: 0x4a2c14,
  PANEL: 0x2a1a0c,
  PANEL_ALPHA: 0.94,
  INSET: 0x3a2614,
  CREAM: 0xfff6e0,
  FOCUS: 0xffd44a,
  SELECT: 0x7fd65a,
  DANGER: 0xe0473a,
  LOCKED_TINT: 0x3a3a3a,
  ROW_ALT: 0x34200f,
  ROW_NEW: 0x6a5410,
  DIM: 0x0e1408,
  DIM_ALPHA: 0.55,
  // Text colors
  TEXT: '#fff6e0',
  TEXT_MUTED: '#c8b49a',
  TEXT_GOLD: '#ffd44a',
  TEXT_GOOD: '#9be27a',
  TEXT_BAD: '#ff7a6a',
  // Layout / feel
  BTN_H: 24,               // touch targets >= 24 px tall
  FRAME: 3,                // wood frame thickness (px)
  BOUNCE_PX: 2,            // focus bounce height
  BOUNCE_MS: 90,
  INPUT_GUARD_MS: 120,     // ignore keys this long after a menu opens (held keys)
  SHAKE_MS: 240,
  COUNT_MS: 900,           // Results count-up length
  UNLOCK_DELAY_MS: 1000,   // unlock cards pop in after the count-up
  TROT_SPEED: 42,          // Title Booker trot (px/s)
};

// --- Visual polish / game feel (Step 3A; owned by src/fx/, ArenaScene, Hud, LevelUp) ---
// Every FX tunable. Times in ms unless the name ends in _S. Hit-stop and the
// level-up intro count frame delta (not wall time), so they behave the same
// under the deterministic test clock.

export const FX = {
  // Depths (DEPTH.ACTORS + y ranges up to ~700; projectiles are 1000)
  DEPTH: {
    PLAYER_RING: DEPTH.ACTORS - 0.5, // above every enemy shadow, below every actor
    PLAYER: 950,                     // Booker draws over enemies
    PARTICLES: 1010,
    NUMBERS: 1020,
    SPOTLIGHT: 1050,                 // boss intro darkening
    SPOTLIGHT_BOSS: 1060,            // the boss stands above it
    VIGNETTE: 1900,
    ARROWS: 1950,
  },

  // Player readability
  RING_COLOR: 0xfff2c0,
  RING_ALPHA: 0.85,
  OUTLINE_COLOR: 0xfff6e0,
  OUTLINE_ALPHA: 0.8,
  HURT_FLASH_MS: 60,               // white FILL ...
  HURT_TINT_MS: 220,               // ... then red MULTIPLY until this
  HURT_TINT: 0xff5a4a,
  DASH_RING_COLOR: 0xffd44a,
  DASH_READY_POP_MS: 220,

  // Enemy hits
  SQUASH_X: 0.22,                  // scale bump while e.flash > 0 (sim's 0.08 s flash)
  SQUASH_Y: 0.18,
  NUMBERS_MAX: 40,                 // pooled damage numbers on screen
  NUMBER_LIFE_MS: 520,
  NUMBER_RISE: 14,                 // px over the life
  NUMBER_MERGE_MS: 160,            // a hit on the same enemy within this adds to its number
  NUMBER_CRIT_SCALE: 2,
  NUMBER_TINT: 0xffffff,
  NUMBER_CRIT_TINT: 0xffd44a,
  NUMBER_BOSS_TINT: 0xffb0a0,
  NUMBER_HEAL_TINT: 0x9be27a,

  // Particles
  PARTICLES_MAX: 600,              // per emitter
  PUFF_COUNT: 7,
  PUFF_ELITE_COUNT: 18,
  PUFF_POP_COUNT: 3,               // wave-end pops (can be 100+ at once)
  PUFF_SPEED: [25, 80],
  PUFF_LIFE: [220, 460],
  KIBBLE_POP_S: 0.32,              // dropped kibble hops this long ...
  KIBBLE_POP_H: 7,                 // ... this high
  SPARKLE_EVERY_MS: 140,           // a twinkle on a random big kibble / bone
  STREAK_LEN_S: 0.035,             // magnet streak length (s of travel)
  PICKUP_BLIP_MAX: 6,              // kibble blips per 100 ms
  ENEMY_COLORS: {
    cat: [0x7c7c86, 0xd8d8e0],
    kitten: [0x8c8c96, 0xe8e8f0],
    squirrel: [0xe0582a, 0xf8b070],
    crow: [0x24242e, 0x6a6a80],
    raccoon: [0x8a6448, 0x3a2a20],
    skunk: [0x22222a, 0xf4f4f4],
    'boss-cat': [0xf09030, 0xfff0d0],
    'boss-vac': [0x3a3a44, 0xff8a2a],
  },
  CONFETTI: [0xff5a4a, 0xffd44a, 0x7fd65a, 0x4fb3ff, 0xff8ad8, 0xfff6e0],
  CONFETTI_COUNT: 70,
  GOLD: 0xffd44a,

  // Camera shake (ms, intensity) and hit-stop (ms of frame delta)
  SHAKE_HURT: [110, 0.007],
  SHAKE_BOSS_HIT: [50, 0.0018],
  SHAKE_BOSS_HIT_GAP_MS: 160,
  SHAKE_CHARGE: [140, 0.006],
  SHAKE_CHARGE_IMPACT: [160, 0.01], // Big Tom's charge ends (bossSummon follows it)
  SHAKE_BOSS_LAND: [220, 0.012],
  SHAKE_BOSS_DEATH: [420, 0.016],
  SHAKE_PHASE2: [200, 0.008],
  HITSTOP_HURT_MS: 50,
  HITSTOP_BOSS_DEATH_MS: 60,

  // Level-up
  LEVELUP_INTRO_MS: 260,           // golden burst + flash, then the card overlay
  LEVELUP_BURST: 26,
  CARD_IN_MS: 240,
  CARD_STAGGER_MS: 70,
  CARD_RISE: 70,                   // px the cards slide up from
  CARD_OUT_MS: 170,                // pick confirmation pop
  CARD_BOB: 1.5,                   // focused card idle bob (px)
  SHIMMER_PERIOD_MS: 1400,

  // Waves and bosses
  BANNER_PUNCH_SCALE: 2.4,
  BANNER_PUNCH_MS: 230,
  SWEEP_MS: 520,                   // wave-clear ring sweeping the yard
  BOSS_INTRO_MS: 800,
  BOSS_DARKEN: 0.5,
  ARROW_INSET: 12,
  ARROW_COLORS: { boss: 0xff3a2a, goldenBone: 0xffd44a, heart: 0xff7a9a },
  MARKER_PULSE: 0.25,              // spawn paw scale pulse

  // Danger
  LOW_HP_FRAC: 0.3,
  VIGNETTE_ALPHA: [0.45, 0.85],    // pulse range at low HP
  VIGNETTE_TINT: 0xff0a00,
  VIGNETTE_HURT: 0.55,             // brief flash on any hit
  VIGNETTE_PULSE_HZ: 1.6,
  STINK_RING: 0xd8ff6a,
  STINK_EDGE: 0x2a3a10,

  // Screen transitions and the death beat
  SCENE_FADE_MS: 150,
  DEATH_FADE_S: 0.3,               // fade to black over the last part of the 1.1 s death beat
  DEATH_SLOWMO: 0.35,              // FX time scale during the death beat
  DEATH_DESAT: 0.75,

  // HUD
  SCORE_POP_MS: 140,
  SCORE_POP_SCALE: 0.22,
  HP_TRAIL_HOLD_MS: 280,
  HP_TRAIL_RATE: 0.9,              // max HP fractions per second
  XP_FLASH_MS: 320,
};
