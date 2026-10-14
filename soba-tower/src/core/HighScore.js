// Per-level bests in localStorage: best height (m), best score, best time (s,
// completions only) and best stars. Every storage access is wrapped in
// try/catch: private windows, blocked site data and sandboxed iframes can all throw.

import { STORAGE } from './Constants.js';

function keyFor(levelId) {
  return `${STORAGE.PREFIX}best:${levelId}`;
}

const EMPTY = { height: 0, score: 0, time: null, stars: 0 };

const num = (v, def) => (Number.isFinite(v) ? v : def);

export const HighScore = {
  get(levelId) {
    try {
      const raw = window.localStorage.getItem(keyFor(levelId));
      if (!raw) return { ...EMPTY };
      const data = JSON.parse(raw);
      return {
        height: num(data.height, 0),
        score: num(data.score, 0),
        time: num(data.time, null),
        stars: num(data.stars, 0),
      };
    } catch {
      return { ...EMPTY };
    }
  },

  /**
   * Records a run. `time` is null unless the level was completed.
   * Returns { best, isNewBest: { height, score, time, stars } }.
   */
  submit(levelId, { height = 0, score = 0, time = null, stars = 0 }) {
    const prev = this.get(levelId);
    const isNewBest = {
      height: height > prev.height,
      score: score > prev.score,
      time: time !== null && (prev.time === null || time < prev.time),
      stars: stars > prev.stars,
    };
    const best = {
      height: Math.max(prev.height, height),
      score: Math.max(prev.score, score),
      time: isNewBest.time ? time : prev.time,
      stars: Math.max(prev.stars, stars),
    };
    try {
      window.localStorage.setItem(keyFor(levelId), JSON.stringify(best));
    } catch {
      // Storage unavailable: the result still shows, it just isn't kept.
    }
    return { isNewBest, best };
  },

  clear(levelId) {
    try {
      window.localStorage.removeItem(keyFor(levelId));
    } catch {
      // ignore
    }
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
