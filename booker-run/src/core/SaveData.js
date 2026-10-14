// =============================================================================
// SaveData — versioned progress for every level in localStorage.
//
// Key: STORAGE.SAVE_KEY ('booker-run:save:v1'):
//   { version: 1, levels: { level1: { completed, bestScore, bestStars, bestTimeS,
//     bestProgress, bestBones, attempts, clears }, ... }, updatedAt }
// The pre-v1 Level 1 best ('booker-run:best:level1' = { score, stars }) is
// migrated once when no v1 save exists. The mute flag keeps its own key
// (HighScore.js loadMuted/saveMuted).
//
// Unlock rule: Level 1 is always open; level N opens when level N-1 is completed.
// ?unlock=all opens everything for this page load (never saved).
// Every storage access is wrapped in try/catch: private windows, blocked
// site data and sandboxed iframes can all throw. Without storage the game
// still plays; progress just isn't kept.
//
// Several tabs: every write first re-reads the stored save and merges it into
// this tab's copy per level (completed OR; max of bests, progress, bones,
// attempts and clears; min of best time), and a `storage` event for the save
// key merges the other tab's write at once. Progress is never lost to a stale tab.
//
// Versions: MIGRATIONS upgrades an older save one version at a time. Before a
// migration (or when the save is newer than this build, or unreadable) the raw
// stored text is copied to STORAGE.SAVE_BACKUP_KEY + ':v<version>' / ':corrupt'.
// =============================================================================

import { STORAGE, SCORE } from './Constants.js';
import { LEVELS } from '../levels/index.js';
import { ABILITIES, abilitiesForLevel } from './Abilities.js';
import { getDebugOptions } from './Debug.js';

function blankLevel() {
  return {
    completed: false,
    bestScore: 0,
    bestStars: 0,
    bestTimeS: null,
    bestProgress: 0,
    bestBones: 0,
    attempts: 0,
    clears: 0,
  };
}

function blankSave() {
  return { version: STORAGE.SAVE_VERSION, levels: {}, updatedAt: 0 };
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function sanitizeLevel(raw) {
  const b = blankLevel();
  if (!raw || typeof raw !== 'object') return b;
  return {
    completed: !!raw.completed,
    bestScore: Math.max(0, num(raw.bestScore)),
    bestStars: Math.max(0, Math.min(3, num(raw.bestStars))),
    bestTimeS: Number.isFinite(raw.bestTimeS) ? raw.bestTimeS : null,
    bestProgress: Math.max(0, Math.min(1, num(raw.bestProgress))),
    bestBones: Math.max(0, num(raw.bestBones)),
    attempts: Math.max(0, num(raw.attempts)),
    clears: Math.max(0, num(raw.clears)),
  };
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save format upgrades, keyed by the version they upgrade FROM. Each takes the
 * parsed save at version k and returns it at version k + 1. Add one whenever
 * the stored format changes (and bump STORAGE.SAVE_VERSION).
 */
const MIGRATIONS = {
  // 1: (save) => ({ ...save, version: 2, ... }),
};

function backup(raw, tag) {
  storageSet(`${STORAGE.SAVE_BACKUP_KEY}:${tag}`, raw);
}

/** The stored save (migrated and sanitized), or null when there is none or it can't be read. */
function readStored() {
  const raw = storageGet(STORAGE.SAVE_KEY);
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.levels || typeof parsed.levels !== 'object') {
    backup(raw, 'corrupt');
    return null;
  }
  let version = Number.isInteger(parsed.version) ? parsed.version : STORAGE.SAVE_VERSION;
  if (version !== STORAGE.SAVE_VERSION) backup(raw, `v${version}`);
  while (version < STORAGE.SAVE_VERSION && MIGRATIONS[version]) {
    parsed = MIGRATIONS[version](parsed);
    version += 1;
  }
  const data = blankSave();
  for (const [id, lv] of Object.entries(parsed.levels || {})) data.levels[id] = sanitizeLevel(lv);
  data.updatedAt = num(parsed.updatedAt);
  return data;
}

/** Merges level b into level a in place: progress only ever goes up. */
function mergeLevel(a, b) {
  a.completed = a.completed || b.completed;
  a.bestScore = Math.max(a.bestScore, b.bestScore);
  a.bestStars = Math.max(a.bestStars, b.bestStars);
  a.bestProgress = Math.max(a.bestProgress, b.bestProgress);
  a.bestBones = Math.max(a.bestBones, b.bestBones);
  a.attempts = Math.max(a.attempts, b.attempts);
  a.clears = Math.max(a.clears, b.clears);
  if (b.bestTimeS !== null) a.bestTimeS = a.bestTimeS === null ? b.bestTimeS : Math.min(a.bestTimeS, b.bestTimeS);
}

class SaveDataStore {
  constructor() {
    this.data = null;
    this.migrated = false;   // true when this load migrated the legacy Level 1 best
    // Another tab wrote the save: take its progress now (merged, never lost)
    try {
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE.SAVE_KEY || !this.data) return;
        const stored = readStored();
        if (stored) this.mergeFrom(this.data, stored);
      });
    } catch {
      // no window (tools): single-tab behaviour
    }
  }

  /** Loads (once) and returns the save object. */
  load() {
    if (this.data) return this.data;
    let data = readStored();
    if (!data) {
      data = blankSave();
      this.migrateLegacy(data);
    }
    this.data = data;
    return data;
  }

  /** Merges a stored save into `data` in place (level objects keep their identity). */
  mergeFrom(data, stored) {
    for (const [id, lv] of Object.entries(stored.levels)) {
      if (data.levels[id]) mergeLevel(data.levels[id], lv);
      else data.levels[id] = lv;
    }
  }

  /** Pre-v1 Level 1 best -> v1 save (only when no v1 save exists). */
  migrateLegacy(data) {
    const raw = storageGet(STORAGE.LEGACY_L1_KEY);
    if (!raw) return;
    try {
      const old = JSON.parse(raw);
      const score = num(old?.score);
      const stars = num(old?.stars);
      if (score <= 0) return;
      const lv = blankLevel();
      lv.completed = true;              // a stored best only exists after reaching the steak
      lv.bestScore = score;
      lv.bestStars = Math.max(1, Math.min(3, stars));
      lv.bestProgress = 1;
      lv.clears = 1;
      data.levels.level1 = lv;
      this.migrated = true;
      this.write(data);
    } catch {
      // unreadable legacy value: ignore
    }
  }

  /** Writes `data`, after merging in whatever another tab stored since this tab read it. */
  write(data = this.data) {
    const stored = readStored();
    if (stored) this.mergeFrom(data, stored);
    data.version = STORAGE.SAVE_VERSION;
    data.updatedAt = Date.now();
    return storageSet(STORAGE.SAVE_KEY, JSON.stringify(data));
  }

  /** Forget the cached copy (tests; next access reloads from storage). */
  invalidate() {
    this.data = null;
  }

  level(id) {
    const data = this.load();
    if (!data.levels[id]) {
      if (!this.isTracked(id)) return blankLevel();   // sandbox / unknown ids are never saved
      data.levels[id] = blankLevel();
    }
    return data.levels[id];
  }

  /** Read-only copy for UI. */
  getLevel(id) {
    return { ...this.level(id) };
  }

  isUnlocked(n) {
    if (n <= 1) return true;
    if (getDebugOptions().unlockAll) return true;
    const prev = LEVELS[n - 2];
    return !!prev && this.level(prev.id).completed;
  }

  isUnlockedId(id) {
    const lv = LEVELS.find(l => l.id === id);
    return lv ? this.isUnlocked(lv.number) : true;   // sandbox and unknown ids are always playable
  }

  recordAttempt(id) {
    if (!this.isTracked(id)) return;
    this.level(id).attempts += 1;
    this.write();
  }

  /** On every death. Returns { bestProgress, isNewBestProgress }. */
  recordDeath(id, progress) {
    if (!this.isTracked(id)) return { bestProgress: progress, isNewBestProgress: false };
    const lv = this.level(id);
    const p = Math.max(0, Math.min(1, progress));
    const isNew = p > lv.bestProgress + 1e-6;
    if (isNew) {
      lv.bestProgress = p;
      this.write();
    }
    return { bestProgress: lv.bestProgress, isNewBestProgress: isNew };
  }

  /**
   * On reaching the finish. result = ScoreSystem.finalize() output.
   * Returns { isNewBest, best: {score, stars}, firstClear, unlocked: {levelId, ability} | null }.
   */
  recordCompletion(id, result) {
    if (!this.isTracked(id)) {
      return { isNewBest: false, best: { score: result.score, stars: result.stars }, firstClear: false, unlocked: null };
    }
    const lv = this.level(id);
    const n = LEVELS.find(l => l.id === id)?.number || 0;
    const nextWasUnlocked = n > 0 && n < LEVELS.length ? this.isUnlocked(n + 1) : true;
    const firstClear = !lv.completed;
    const isNewBest = result.score > lv.bestScore;
    lv.completed = true;
    lv.clears += 1;
    lv.bestScore = Math.max(lv.bestScore, result.score);
    lv.bestStars = Math.max(lv.bestStars, result.stars);
    lv.bestBones = Math.max(lv.bestBones, result.bones);
    lv.bestProgress = 1;
    if (Number.isFinite(result.totalSeconds)) {
      lv.bestTimeS = lv.bestTimeS === null ? result.totalSeconds : Math.min(lv.bestTimeS, result.totalSeconds);
    }
    this.write();
    let unlocked = null;
    if (n > 0 && n < LEVELS.length && !nextWasUnlocked && this.isUnlocked(n + 1)) {
      const next = LEVELS[n];
      unlocked = { levelId: next.id, number: next.number, name: next.name, ability: next.ability };
    }
    return { isNewBest, best: { score: lv.bestScore, stars: lv.bestStars }, firstClear, unlocked };
  }

  isTracked(id) {
    return LEVELS.some(l => l.id === id);
  }

  /** Totals for the menus and render_game_to_text(). */
  summary() {
    const levels = LEVELS.map(l => {
      const lv = this.level(l.id);
      return {
        id: l.id,
        number: l.number,
        unlocked: this.isUnlocked(l.number),
        completed: lv.completed,
        bestScore: lv.bestScore,
        bestStars: lv.bestStars,
        bestProgress: Math.round(lv.bestProgress * 1000) / 1000,
        bestTimeS: lv.bestTimeS,
        attempts: lv.attempts,
        clears: lv.clears,
      };
    });
    const highestUnlocked = levels.filter(l => l.unlocked).reduce((m, l) => Math.max(m, l.number), 1);
    return {
      totalScore: levels.reduce((s, l) => s + l.bestScore, 0),
      totalStars: levels.reduce((s, l) => s + l.bestStars, 0),
      maxStars: LEVELS.length * 3,
      levelsCleared: levels.filter(l => l.completed).length,
      levelCount: LEVELS.length,
      abilitiesUnlocked: abilitiesForLevel(highestUnlocked).filter(id => ABILITIES[id]),
      levels,
    };
  }

  /** Stars for a finished run (same rule for every level). */
  static starsFor(bones, total) {
    if (total > 0 && bones >= total) return 3;
    if (total > 0 && bones / total >= SCORE.STARS_TWO_RATIO) return 2;
    return 1;
  }
}

export const SaveData = new SaveDataStore();
