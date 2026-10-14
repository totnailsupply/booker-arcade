// Thin compatibility wrapper. Progress now lives in SaveData (versioned save for
// every level); this file keeps the old HighScore API and the mute flag.
// Every storage access is wrapped in try/catch: private windows, blocked
// site data and sandboxed iframes can all throw.

import { STORAGE } from './Constants.js';
import { SaveData } from './SaveData.js';

export const HighScore = {
  /** { score, stars } best for a level. */
  get(levelId) {
    const lv = SaveData.getLevel(levelId);
    return { score: lv.bestScore, stars: lv.bestStars };
  },

  /** Records a finished run. Returns { isNewBest, best: {score, stars} }. */
  submit(levelId, score, stars) {
    const r = SaveData.recordCompletion(levelId, { score, stars, bones: 0, totalSeconds: NaN });
    return { isNewBest: r.isNewBest, best: r.best };
  },
};

export function loadMuted() {
  try {
    return window.localStorage.getItem(STORAGE.MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(muted) {
  try {
    window.localStorage.setItem(STORAGE.MUTE_KEY, String(!!muted));
  } catch {
    // ignore
  }
}
