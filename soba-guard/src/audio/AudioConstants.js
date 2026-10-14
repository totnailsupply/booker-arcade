// Every audio number (levels in dB, times in s unless named _MS). Lives in
// src/audio so Step 3b never edits core/Constants.js (the polish agent's file).

export const AUDIO = {
  // Buses
  MASTER_DB: -1,
  MUSIC_DB: -7,
  SFX_DB: -3,
  REVERB_RETURN_DB: -9,
  REVERB_S: 2.0,            // generated impulse length
  REVERB_DECAY: 3.4,        // impulse envelope exponent
  LIMITER: { THRESHOLD_DB: -3, KNEE_DB: 2, RATIO: 20, ATTACK_S: 0.002, RELEASE_S: 0.15 },

  // Music layers (dB inside the music bus), pans and reverb sends (dB)
  MIX: {
    lead: -8, chip: -13, flute: -16, shaku: -11, bass: -9, drone: -16, arp: -18,
    taiko: -8, shime: -17, hats: -25, kakko: -20, chappa: -24,
  },
  PAN: { arp: -0.35, flute: 0.35, shaku: 0.2, hats: 0.25, chappa: -0.2, kakko: 0.15, shime: -0.15, chip: 0.1 },
  MUSIC_SEND: { lead: -12, chip: -16, flute: -8, shaku: -5, arp: -16, taiko: -20 },

  // Ducking (music bus) under the huge-wave gong and the win / lose moment
  DUCK_DB: 4,
  DUCK_ATTACK_S: 0.04,
  DUCK_HUGE_HOLD_S: 1.4,
  DUCK_HUGE_RELEASE_S: 1.0,

  // Transport
  MUTE_RAMP_S: 0.05,
  PAUSE_FADE_S: 0.2,
  STOP_FADE_S: 0.08,
  END_FADE_S: 1.0,          // battle music fades under the win / loss (VIEW.RESULTS_DELAY is 1.2 s)
  MENU_FADE_S: 0.3,
  LOOKAHEAD_S: 0.12,
  SCHEDULER_MS: 25,

  // Tempos (bpm)
  MENU_BPM: 88,
  BATTLE_BPM: [104, 106, 110],   // wave bands 1-3
  TENSION_BPM: 114,
  RESULTS_BPM: 92,
  FANFARE_BPM: 132,
  STING_BPM: 72,
  RESULTS_WIN_DELAY_S: 0.15,
  RESULTS_LOSE_DELAY_S: 0.1,
  // Wave bands: band 1 up to BAND_1 of the waves (10 waves: 1-3), band 2 up to BAND_2 (4-7), then band 3 (8-10)
  BAND_1: 0.3,
  BAND_2: 0.7,

  // SFX variation and throttling
  PITCH_JITTER: 0.04,       // +- per play
  VOL_JITTER_DB: 1.2,       // +- per play
  SFX_PAN_MAX: 0.55,
  SCREEN_W: 640,
  SFX_GAP_MS: {
    shoot: 55, hit: 40, lidHit: 60, ember: 90, coinDrop: 60, coinCollect: 45, uiMove: 35, cardReady: 120,
    killRat: 40, killLid: 40, killCrow: 60, killPoof: 40, caw: 500, place: 40, denied: 140, hop: 80,
    sobaMove: 140, unitLost: 60, cardSelect: 40, waveStart: 400, lidOff: 50, bite: 90, bark: 80,
  },
  // Density: more than DENSITY_FREE plays of one sound inside DENSITY_WINDOW_MS get quieter (1/sqrt)
  DENSITY_WINDOW_MS: 300,
  DENSITY_FREE: 2,
  DENSITY_MIN_GAIN: 0.35,
  COIN_STREAK_MS: 900,      // quick pickups step up the scale
  COIN_STREAK_MAX: 6,
  BITE_GAP_S: 0.42,         // crunch loop period (sim time) while anything bites
  BITE_MAX_GAIN: 1.6,       // more biters: a little louder, never more voices
  BITE_GAIN_PER: 0.15,
  HAPPY_BARKS_DELAY_S: 1.0, // after the win fanfare's run

  // Speaker button
  MUTE_BTN_HUD: { X: 566, Y: 12, SIZE: 28 },   // left of Pause (604)
  MUTE_GRID: 14,            // the icon is drawn on a 14x14 pixel grid
};
