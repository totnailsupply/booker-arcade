// =============================================================================
// SaveData.js — progression in localStorage (`soba-guard:save`, version 1).
//
// Every storage access is in try/catch. When storage is blocked (private mode,
// sandboxed iframe, quota) the save lives in memory for the session and the
// game plays normally. Corrupt or foreign JSON resets to a clean save.
//
// Shape (version 1):
//   {
//     version: 1,
//     levels: { "1": { cleared, stars: [bool, bool, bool], bestScore } },
//     goldenBones: 0,
//     shop: { piggy: 0, bark: 0, steam: 0, paws: 0 },
//     unlockedUnits: ['luckycat', 'steamer', 'onigiri'],
//     muted: false,
//   }
//
// Stars merge with OR (best ever); each star pays BONES_PER_STAR once ever.
// Debug runs (result.debug, or a battle config with debugRun) never write.
// Tests: ?reset=1 wipes the save on load; window.__SAVE__.reset() at any time.
// =============================================================================

import { SAVE } from './MetaConstants.js';
import { SHOP_ITEMS, SHOP_MAX_RANK, nextRankCost, getShopItem } from '../data/shop.js';

let data = null;
let storageOk = true;
let lastError = null;

function defaults() {
  const shop = {};
  for (const item of SHOP_ITEMS) shop[item.key] = 0;
  return {
    version: SAVE.VERSION,
    levels: {},
    goldenBones: 0,
    shop,
    unlockedUnits: [...SAVE.START_UNITS],
    muted: false,
  };
}

function storage() {
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

const isInt = (v) => Number.isFinite(v) && Math.floor(v) === v;

/** Keeps only well-formed fields; anything odd falls back to the default. */
function sanitize(raw) {
  const out = defaults();
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE.VERSION) return null;
  if (isInt(raw.goldenBones) && raw.goldenBones >= 0) out.goldenBones = raw.goldenBones;
  if (raw.levels && typeof raw.levels === 'object') {
    for (const [k, v] of Object.entries(raw.levels)) {
      if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
      const stars = Array.isArray(v.stars) ? v.stars : [];
      out.levels[k] = {
        cleared: !!v.cleared,
        stars: Array.from({ length: SAVE.STAR_COUNT }, (_, i) => !!stars[i]),
        bestScore: isInt(v.bestScore) && v.bestScore >= 0 ? v.bestScore : 0,
      };
    }
  }
  if (raw.shop && typeof raw.shop === 'object') {
    for (const item of SHOP_ITEMS) {
      const r = raw.shop[item.key];
      if (isInt(r)) out.shop[item.key] = Math.max(0, Math.min(SHOP_MAX_RANK, r));
    }
  }
  if (Array.isArray(raw.unlockedUnits)) {
    const set = new Set(SAVE.START_UNITS);
    for (const u of raw.unlockedUnits) if (typeof u === 'string' && u) set.add(u);
    out.unlockedUnits = [...set];
  }
  out.muted = !!raw.muted;
  return out;
}

function urlFlag(name) {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function load() {
  if (data) return data;
  const ls = storage();
  if (urlFlag(SAVE.RESET_FLAG)) {
    try { ls?.removeItem(SAVE.KEY); } catch (e) { lastError = String(e); }
  }
  let raw = null;
  try {
    raw = ls ? ls.getItem(SAVE.KEY) : null;
    if (!ls) storageOk = false;
  } catch (e) {
    storageOk = false;
    lastError = String(e);
  }
  if (raw) {
    try {
      data = sanitize(JSON.parse(raw));
      if (!data) console.warn('[save] unknown save version, starting fresh');
    } catch (e) {
      console.warn('[save] corrupt save, starting fresh');
      lastError = String(e);
      data = null;
    }
    if (!data) {
      data = defaults();
      persist();
    }
  } else {
    data = defaults();
  }
  return data;
}

function persist() {
  const ls = storage();
  if (!ls) {
    storageOk = false;
    return false;
  }
  try {
    ls.setItem(SAVE.KEY, JSON.stringify(data));
    storageOk = true;
    return true;
  } catch (e) {
    storageOk = false;
    lastError = String(e);
    return false;
  }
}

function levelEntry(n) {
  const d = load();
  return d.levels[String(n)] || { cleared: false, stars: [false, false, false], bestScore: 0 };
}

/** Normalises the stars array of a result (defaults: [won, false, false]). */
export function resultStars(result) {
  const won = isWin(result);
  const s = Array.isArray(result?.stars) ? result.stars : [won, false, false];
  return Array.from({ length: SAVE.STAR_COUNT }, (_, i) => won && !!s[i]);
}

export function isWin(result) {
  if (!result) return false;
  if (typeof result.won === 'boolean') return result.won;
  return result.outcome === 'won';
}

export const SaveData = {
  /** A deep copy of the whole save (read-only use). */
  get() {
    return JSON.parse(JSON.stringify(load()));
  },

  level(n) {
    const e = levelEntry(n);
    return { cleared: e.cleared, stars: [...e.stars], bestScore: e.bestScore };
  },

  bones() {
    return load().goldenBones;
  },

  shopRank(key) {
    return load().shop[key] || 0;
  },

  shopRanks() {
    return { ...load().shop };
  },

  unlockedUnits() {
    return [...load().unlockedUnits];
  },

  isUnitUnlocked(key) {
    return load().unlockedUnits.includes(key);
  },

  muted() {
    return load().muted;
  },

  setMuted(muted) {
    load().muted = !!muted;
    persist();
  },

  /** Shop modifiers for makeBattleConfig: { startCoins, barkCooldownS, dumplingDamagePct, catRatePct } (see src/data/shop.js). */
  getModifiers() {
    const out = { startCoins: 0, barkCooldownS: 0, dumplingDamagePct: 0, catRatePct: 0 };
    for (const item of SHOP_ITEMS) out[item.stat] += item.perRank * (load().shop[item.key] || 0);
    return out;
  },

  /**
   * Buys the next rank of a shop item.
   * Returns { ok, reason?: 'max' | 'bones' | 'unknown', cost, rank, bones }.
   */
  buy(key) {
    const d = load();
    const item = getShopItem(key);
    if (!item) return { ok: false, reason: 'unknown', cost: null, rank: 0, bones: d.goldenBones };
    const rank = d.shop[key] || 0;
    const cost = nextRankCost(rank);
    if (cost === null) return { ok: false, reason: 'max', cost, rank, bones: d.goldenBones };
    if (d.goldenBones < cost) return { ok: false, reason: 'bones', cost, rank, bones: d.goldenBones };
    d.goldenBones -= cost;
    d.shop[key] = rank + 1;
    persist();
    return { ok: true, cost, rank: rank + 1, bones: d.goldenBones };
  },

  /**
   * Records a finished battle. Debug runs only report what they would earn.
   * Returns { saved, debug, won, stars, newStars: [i], bonesEarned, firstClear,
   *           newBest, unlocked: [unit keys newly unlocked] }.
   */
  recordResult(result, { debug = false } = {}) {
    const d = load();
    const n = Math.max(1, Math.floor(result?.levelNumber) || 1);
    const won = isWin(result);
    const stars = resultStars(result);
    const prev = levelEntry(n);
    const newStars = [];
    stars.forEach((s, i) => { if (s && !prev.stars[i]) newStars.push(i); });
    const unlocked = (Array.isArray(result?.unlocks) ? result.unlocks : [])
      .filter(u => typeof u === 'string' && u && !d.unlockedUnits.includes(u));
    const score = isInt(result?.score) ? result.score : 0;
    const summary = {
      saved: false,
      persisted: false,
      debug: !!debug || !!result?.debug,
      won,
      stars,
      newStars,
      bonesEarned: newStars.length * SAVE.BONES_PER_STAR,
      firstClear: won && !prev.cleared,
      newBest: score > prev.bestScore,
      unlocked: won ? unlocked : [],
    };
    if (summary.debug) return summary;

    d.levels[String(n)] = {
      cleared: prev.cleared || won,
      stars: prev.stars.map((s, i) => s || stars[i]),
      bestScore: Math.max(prev.bestScore, score),
    };
    d.goldenBones += summary.bonesEarned;
    for (const u of summary.unlocked) d.unlockedUnits.push(u);
    summary.saved = true;                // recorded (in memory at least)
    summary.persisted = persist();       // false when storage is blocked
    return summary;
  },

  /** Wipes the save (memory and storage). */
  reset() {
    data = defaults();
    try { storage()?.removeItem(SAVE.KEY); } catch (e) { lastError = String(e); }
    return this.get();
  },

  /** For tests: drops the in-memory copy so the next read reloads storage. */
  reload() {
    data = null;
    return this.get();
  },

  status() {
    return { storageOk, lastError, key: SAVE.KEY, version: SAVE.VERSION };
  },
};

try {
  window.__SAVE__ = SaveData;
} catch {
  // no window (Node): nothing to expose
}
