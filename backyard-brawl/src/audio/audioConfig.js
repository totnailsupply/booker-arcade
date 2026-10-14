// Audio tunables for Backyard Brawl (Step 3B). Everything audio reads its
// numbers from here, not from core/Constants.js (Constants.AUDIO only keeps
// the mute button's size for the UI).
//
// Levels are in dB and converted with dbToGain at the edges.

export const AUDIO = {
  // --- mix (dB) ----------------------------------------------------------------
  //   music loop ─> musicBus ─> duck ─┐
  //   stingers / level-up pad ─> stingBus ─┤
  //   game SFX ─> sfxBus ──────────────────┼─> master ─> limiter ─> out
  //   menu / card SFX ─> uiBus ────────────┘
  // Offline renders (audio-check levels): music bed loud RMS about -23 dB,
  // peaks about -8 dB; common SFX peaks -19 (hit tick) to -10 (deaths); big
  // moments (boss death, roar, fanfare) peak about -5 dB, under the limiter.
  MASTER_DB: 0,
  MUSIC_DB: -7,
  STING_DB: -2,
  SFX_DB: 4,
  UI_DB: 0,
  LIMITER: { THRESHOLD_DB: -6, KNEE_DB: 6, RATIO: 12, ATTACK_S: 0.003, RELEASE_S: 0.15 },

  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.15,
  STOP_FADE_S: 0.12,
  DEATH_FADE_S: 0.35,
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,

  // --- ducking (music bus only; stingers and SFX are never ducked) ----------------
  DUCK_ATTACK_S: 0.06,
  DUCK_RELEASE_S: 0.45,
  DUCK: {
    levelUp: -8,       // held while the level-up overlay is open
    pause: 0,
    bossIntro: -7,     // roar / vacuum whine, held BOSS_INTRO_HOLD_S
    bossDeath: -9,
    waveClear: -6,     // under the wave-clear sting
  },
  BOSS_INTRO_HOLD_S: 1.4,
  BOSS_DEATH_HOLD_S: 1.6,
  WAVE_CLEAR_HOLD_S: 1.0,

  // --- music ----------------------------------------------------------------------
  // Battle intensity: score = (wave - 1) * WAVE_W + alive * ALIVE_W, capped;
  // levels 1..5 = base, +drums, +hats, +arp, +lead octave. A level change waits
  // for the next bar line. Dropping a level needs score < threshold - HYST.
  INTENSITY: {
    WAVE_W: 0.25,
    ALIVE_W: 0.05,
    THRESHOLDS: [0.3, 1.2, 2.2, 3.4],   // to reach levels 2, 3, 4, 5
    HYST: 0.35,
  },
  RESULTS_DELAY_S: 1.1,           // calm Results loop starts after the sting
  RESULTS_WIN_DELAY_S: 1.6,       // ...or after the victory fanfare
  GAME_OVER_STING_DELAY_S: 0.45,  // after Booker's death yelp
  SHIMMER_FADE_IN_S: 0.35,
  SHIMMER_FADE_OUT_S: 0.25,

  // --- SFX variation (per play) ------------------------------------------------------
  PITCH_JITTER: 0.05,   // ±5 %
  VOL_JITTER_DB: 1.5,   // ±1.5 dB

  // --- voice limiting ----------------------------------------------------------------
  // Per sound: max = voices of this sound alive at once, gapMs = minimum time
  // between two starts. A play over either limit is skipped (counted in stats).
  // Low-priority sounds (prio 0) also skip when GLOBAL_SOFT_CAP voices are alive;
  // nothing plays past GLOBAL_HARD_CAP.
  GLOBAL_SOFT_CAP: 16,
  GLOBAL_HARD_CAP: 28,
  KIBBLE_CHAIN_RESET_MS: 400,
  KIBBLE_CHAIN_STEPS: 14,

  // --- polled loops -------------------------------------------------------------------
  POLL_MS: 50,
  HEARTBEAT_HP_FRAC: 0.3,
  HEARTBEAT_S: 0.86,           // at 30 % HP
  HEARTBEAT_FAST_S: 0.6,       // at <= 10 % HP
  FRISBEE_TICK_S: 0.3,         // whirr tick per disc set (faster with more discs)
  ZOOMIES_PATTER_S: 0.12,
};

/**
 * Per-sound settings: bus ('sfx' | 'ui' | 'sting'), max concurrent voices,
 * min gap (ms), priority (0 = droppable under load, 1 = normal, 2 = always),
 * variation override { pitch, db }, level trim `db` (added to the voice).
 */
export const SFX_DEFS = {
  // weapons
  shotBark: { db: -2, max: 3, gapMs: 55, prio: 0 },
  shotBall: { db: -2, max: 3, gapMs: 60, prio: 0 },
  ballBounce: { db: -2, max: 2, gapMs: 70, prio: 0 },
  shotBone: { db: 3, max: 2, gapMs: 90, prio: 0 },
  frisbeeWhirr: { db: 4, max: 2, gapMs: 120, prio: 0 },
  shotSqueak: { db: -2, max: 2, gapMs: 120, prio: 1 },
  zoomiesPatter: { max: 2, gapMs: 70, prio: 0, vary: { pitch: 0.08, db: 2 } },
  // hits and deaths
  hit: { max: 4, gapMs: 30, prio: 0, vary: { pitch: 0.1, db: 2 } },
  hitCrit: { max: 2, gapMs: 60, prio: 0 },
  hitBoss: { db: -3, max: 2, gapMs: 70, prio: 1 },
  deathCat: { max: 3, gapMs: 45, prio: 0, group: 'death' },
  deathSquirrel: { max: 3, gapMs: 45, prio: 0, group: 'death' },
  deathCrow: { max: 2, gapMs: 60, prio: 0, group: 'death' },
  deathRaccoon: { db: -4, max: 2, gapMs: 60, prio: 0, group: 'death' },
  deathSkunk: { max: 2, gapMs: 60, prio: 0, group: 'death' },
  deathKitten: { max: 2, gapMs: 60, prio: 0, group: 'death' },
  deathElite: { db: -1, max: 2, gapMs: 100, prio: 1 },
  pop: { max: 3, gapMs: 40, prio: 0, group: 'death' },
  // enemies and bosses
  crowSwoop: { max: 1, gapMs: 400, prio: 0 },
  stinkLob: { max: 2, gapMs: 200, prio: 0 },
  bossIntroCat: { db: -3, max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  bossIntroVac: { db: 4, max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  chargeWarn: { db: 3, max: 1, gapMs: 300, prio: 2, vary: { pitch: 0, db: 0.5 } },
  chargeGo: { max: 1, gapMs: 300, prio: 1 },
  summon: { db: 2, max: 1, gapMs: 400, prio: 1 },
  vacPhase2: { db: 3, max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  vacDrone: { max: 1, gapMs: 0, prio: 2, vary: { pitch: 0, db: 0 } },
  dustRing: { max: 1, gapMs: 300, prio: 1 },
  vacBounce: { max: 1, gapMs: 200, prio: 0 },
  bossDeath: { db: -4, max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  // pickups
  kibble: { db: 3, max: 4, gapMs: 35, prio: 0, vary: { pitch: 0.005, db: 1 } },
  heart: { max: 1, gapMs: 100, prio: 1 },
  magnet: { db: 2, max: 1, gapMs: 300, prio: 1 },
  goldenBone: { max: 2, gapMs: 100, prio: 2, vary: { pitch: 0, db: 0.5 } },
  // player
  hurt: { max: 1, gapMs: 150, prio: 2 },
  dash: { db: 2, max: 1, gapMs: 100, prio: 1 },
  heartbeat: { db: -3, max: 1, gapMs: 300, prio: 2, vary: { pitch: 0, db: 0.5 } },
  playerDeath: { db: -1, max: 1, gapMs: 500, prio: 2, vary: { pitch: 0, db: 0 } },
  // waves and level-up
  waveHorn: { db: 2, max: 1, gapMs: 500, prio: 2, vary: { pitch: 0, db: 0 } },
  bossHorn: { max: 1, gapMs: 500, prio: 2, vary: { pitch: 0, db: 0 } },
  levelUp: { db: 3, max: 1, gapMs: 250, prio: 2, vary: { pitch: 0, db: 0 } },
  // stingers (music-level, not ducked)
  waveClear: { bus: 'sting', max: 1, gapMs: 500, prio: 2, vary: { pitch: 0, db: 0 } },
  victory: { bus: 'sting', max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  gameOver: { bus: 'sting', max: 1, gapMs: 1000, prio: 2, vary: { pitch: 0, db: 0 } },
  // cards (level-up overlay) and menus
  cardMove: { bus: 'ui', max: 2, gapMs: 40, prio: 2, vary: { pitch: 0.02, db: 0.5 } },
  cardSelect: { bus: 'ui', max: 2, gapMs: 80, prio: 2, vary: { pitch: 0, db: 0 } },
  cardRare: { bus: 'ui', max: 2, gapMs: 80, prio: 2, vary: { pitch: 0, db: 0 } },
  cardReroll: { bus: 'ui', max: 2, gapMs: 120, prio: 2, vary: { pitch: 0.02, db: 0.5 } },
  menuMove: { bus: 'ui', max: 2, gapMs: 40, prio: 2, vary: { pitch: 0.02, db: 0.5 } },
  menuSelect: { bus: 'ui', max: 2, gapMs: 60, prio: 2, vary: { pitch: 0, db: 0 } },
  menuStart: { bus: 'ui', max: 2, gapMs: 200, prio: 2, vary: { pitch: 0, db: 0 } },
  menuBack: { bus: 'ui', max: 2, gapMs: 60, prio: 2, vary: { pitch: 0, db: 0 } },
  buy: { bus: 'ui', max: 2, gapMs: 80, prio: 2, vary: { pitch: 0, db: 0 } },
  denied: { bus: 'ui', max: 2, gapMs: 120, prio: 2, vary: { pitch: 0, db: 0 } },
  unlock: { bus: 'ui', max: 3, gapMs: 120, prio: 2, vary: { pitch: 0, db: 0 } },
  retry: { bus: 'ui', max: 2, gapMs: 80, prio: 2, vary: { pitch: 0, db: 0 } },
  newBest: { bus: 'ui', max: 1, gapMs: 500, prio: 2, vary: { pitch: 0, db: 0 } },
  click: { bus: 'ui', max: 2, gapMs: 40, prio: 2, vary: { pitch: 0, db: 0 } },
};

/** Groups share one extra cap (e.g. every enemy death pop together). */
export const SFX_GROUPS = {
  death: { max: 6 },
};
