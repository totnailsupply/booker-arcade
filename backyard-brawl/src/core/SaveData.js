// =============================================================================
// SaveData — one localStorage entry, `backyard-brawl:save`, version 1.
// Every storage access is in try/catch: private windows, blocked site data and
// sandboxed iframes can all throw. Corrupt JSON, a wrong version or missing
// fields load as defaults (field by field). Debug runs (any URL flag, see
// Debug.js) read the save but never write it.
//
// Shape:
//   { version: 1,
//     scores: [{ id, score, wave, level, time, kills, weapon, date, victory, endless }] (top 10),
//     lastScoreId,                       // newest entry (Scores highlights it)
//     bones,                             // Golden Bones balance
//     kennel: { hearty, jaws, paws, sniffer, lucky, learner },  // ranks 0..5
//     stats: { runs, kills, bestWave, wins, bones, bossesBeaten: [] },
//     unlocks: { weapons: ['bark', ...], endless },
//     lastWeapon, lastEndless,           // WeaponSelect remembers the pick
//     muted }
// =============================================================================

import { STORAGE, MENU_META } from './Constants.js';
import { getDebugOptions } from './Debug.js';

const WEAPON_KEYS = MENU_META.WEAPON_ORDER;
const KENNEL_KEYS = MENU_META.KENNEL_ORDER;

function emptyKennel() {
  const k = {};
  for (const key of KENNEL_KEYS) k[key] = 0;
  return k;
}

function defaults() {
  return {
    version: STORAGE.VERSION,
    scores: [],
    lastScoreId: 0,
    bones: 0,
    kennel: emptyKennel(),
    stats: { runs: 0, kills: 0, bestWave: 0, wins: 0, bones: 0, bossesBeaten: [] },
    unlocks: { weapons: ['bark'], endless: false },
    lastWeapon: 'bark',
    lastEndless: false,
    muted: false,
  };
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const nat = (v, d = 0) => Math.max(0, Math.floor(num(v, d)));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function sanitize(raw) {
  const d = defaults();
  if (!isObj(raw) || raw.version !== STORAGE.VERSION) return d;

  const scores = Array.isArray(raw.scores) ? raw.scores : [];
  d.scores = scores
    .filter(s => isObj(s) && Number.isFinite(s.score))
    .map(s => ({
      id: num(s.id, 0),
      score: nat(s.score),
      wave: nat(s.wave, 1),
      level: nat(s.level, 1),
      time: Math.max(0, num(s.time, 0)),
      kills: nat(s.kills),
      weapon: WEAPON_KEYS.includes(s.weapon) ? s.weapon : 'bark',
      date: typeof s.date === 'string' ? s.date.slice(0, 10) : '',
      victory: !!s.victory,
      endless: !!s.endless,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, STORAGE.MAX_SCORES);
  d.lastScoreId = num(raw.lastScoreId, 0);

  d.bones = nat(raw.bones);
  const kn = isObj(raw.kennel) ? raw.kennel : {};
  for (const key of KENNEL_KEYS) d.kennel[key] = Math.min(MENU_META.KENNEL_MAX, nat(kn[key]));

  const st = isObj(raw.stats) ? raw.stats : {};
  d.stats = {
    runs: nat(st.runs),
    kills: nat(st.kills),
    bestWave: nat(st.bestWave),
    wins: nat(st.wins),
    bones: nat(st.bones),
    bossesBeaten: Array.isArray(st.bossesBeaten)
      ? [...new Set(st.bossesBeaten.filter(b => typeof b === 'string'))]
      : [],
  };

  const un = isObj(raw.unlocks) ? raw.unlocks : {};
  const weapons = Array.isArray(un.weapons) ? un.weapons.filter(w => WEAPON_KEYS.includes(w)) : [];
  d.unlocks = {
    weapons: WEAPON_KEYS.filter(w => w === 'bark' || weapons.includes(w)),
    endless: !!un.endless,
  };
  d.lastWeapon = d.unlocks.weapons.includes(raw.lastWeapon) ? raw.lastWeapon : 'bark';
  d.lastEndless = d.unlocks.endless && !!raw.lastEndless;
  d.muted = !!raw.muted;
  return d;
}

function read() {
  try {
    const s = window.localStorage.getItem(STORAGE.KEY);
    return sanitize(s ? JSON.parse(s) : null);
  } catch {
    return defaults();
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Whether a weapon's unlock condition holds for these (post-run) stats. */
function meetsUnlock(key, stats, bestWaveReached) {
  const u = MENU_META.WEAPON_INFO[key]?.unlock;
  if (!u) return true;
  if (u.wave) return bestWaveReached >= u.wave;
  if (u.kills) return stats.kills >= u.kills;
  if (u.boss) return stats.bossesBeaten.includes(u.boss);
  if (u.wins) return stats.wins >= u.wins;
  return false;
}

/** Normalizes a Results payload: older / partial results default safely. */
export function normalizeResult(r = {}) {
  const victory = r.victory !== undefined ? !!r.victory : r.outcome === 'victory';
  const weapons = Array.isArray(r.weapons) && r.weapons.length
    ? r.weapons.filter(w => w && typeof w.key === 'string').map(w => ({ key: w.key, level: nat(w.level, 1) }))
    : [{ key: r.startWeapon || r.weapon || 'bark', level: 1 }];
  return {
    ...r,
    score: nat(r.score),
    wave: Math.max(1, nat(r.wave, 1)),
    wavesCleared: nat(r.wavesCleared),
    level: Math.max(1, nat(r.level, 1)),
    kills: nat(r.kills),
    timeSec: Math.max(0, num(r.timeSec, num(r.time, 0))),
    bestCombo: nat(r.bestCombo),
    victory,
    endless: !!r.endless,
    goldenBones: nat(r.goldenBones),
    bossesBeaten: Array.isArray(r.bossesBeaten) ? r.bossesBeaten.filter(b => typeof b === 'string') : [],
    weapons,
    startWeapon: r.startWeapon || r.weapon || weapons[0]?.key || 'bark',
    debug: r.debug !== undefined ? !!r.debug : getDebugOptions().isDebugRun,
  };
}

/** Golden Bones earned by a (normalized) result, with the breakdown. */
export function bonesFor(r) {
  const fromScore = Math.floor(r.score / MENU_META.BONES_SCORE_DIV);
  const fromWaves = MENU_META.BONES_PER_WAVE * r.wavesCleared;
  const drops = r.goldenBones;
  return { fromScore, fromWaves, drops, total: fromScore + fromWaves + drops };
}

/** Kennel cost of the next rank (null when maxed). */
export function kennelCost(rank) {
  return rank >= MENU_META.KENNEL_MAX ? null : MENU_META.KENNEL_COSTS[rank];
}

let cache = null;

export const SaveData = {
  get() {
    if (!cache) cache = read();
    return cache;
  },

  get writable() {
    return !getDebugOptions().isDebugRun;
  },

  write() {
    if (!this.writable) return false;
    try {
      window.localStorage.setItem(STORAGE.KEY, JSON.stringify(this.get()));
      return true;
    } catch {
      return false;
    }
  },

  bestScore() {
    return this.get().scores[0]?.score || 0;
  },

  isUnlocked(weapon) {
    return this.get().unlocks.weapons.includes(weapon);
  },

  /** Kennel ranks for runConfig.meta (every key present, 0..5). */
  kennelRanks() {
    return { ...emptyKennel(), ...this.get().kennel };
  },

  /**
   * Records a finished run (call once per run). Returns
   *   { rank (1-based, 0 = not in the top 10), isNewBest, best, saved, entryId,
   *     bones: { fromScore, fromWaves, drops, total }, balance, prevBalance,
   *     newWeapons: [key], endlessUnlocked }
   * Debug runs compute everything against a copy and change nothing.
   */
  recordRun(raw) {
    const r = normalizeResult(raw);
    const data = this.get();
    const next = clone(data);
    const prevBest = this.bestScore();

    const entry = {
      id: Date.now(),
      score: r.score,
      wave: r.wave,
      level: r.level,
      time: Math.round(r.timeSec * 10) / 10,
      kills: r.kills,
      weapon: WEAPON_KEYS.includes(r.startWeapon) ? r.startWeapon : 'bark',
      date: new Date().toISOString().slice(0, 10),
      victory: r.victory,
      endless: r.endless,
    };
    if (entry.id <= next.lastScoreId) entry.id = next.lastScoreId + 1;
    const scores = [...next.scores, entry].sort((a, b) => b.score - a.score).slice(0, STORAGE.MAX_SCORES);
    const rank = scores.indexOf(entry) + 1;
    const isNewBest = r.score > prevBest && r.score > 0;
    next.scores = scores;
    if (rank > 0) next.lastScoreId = entry.id;

    const bones = bonesFor(r);
    next.bones += bones.total;

    const st = next.stats;
    st.runs += 1;
    st.kills += r.kills;
    st.bestWave = Math.max(st.bestWave, r.wave);
    st.bones += bones.total;
    if (r.victory) st.wins += 1;
    for (const b of r.bossesBeaten) if (!st.bossesBeaten.includes(b)) st.bossesBeaten.push(b);

    const newWeapons = [];
    for (const key of WEAPON_KEYS) {
      if (next.unlocks.weapons.includes(key)) continue;
      if (meetsUnlock(key, st, Math.max(st.bestWave, r.wave))) {
        next.unlocks.weapons.push(key);
        newWeapons.push(key);
      }
    }
    next.unlocks.weapons = WEAPON_KEYS.filter(k => next.unlocks.weapons.includes(k));
    const endlessUnlocked = !next.unlocks.endless && st.wins > 0;
    if (endlessUnlocked) next.unlocks.endless = true;

    const out = {
      rank, isNewBest, best: Math.max(prevBest, r.score), entryId: rank > 0 ? entry.id : 0,
      bones, prevBalance: data.bones, balance: next.bones, newWeapons, endlessUnlocked, saved: false,
    };
    if (!this.writable) return out;
    cache = next;
    out.saved = this.write();
    return out;
  },

  /**
   * Buys the next rank of a Kennel upgrade. Returns
   *   { ok, reason?: 'max' | 'funds' | 'unknown', rank, cost, balance, need? }
   */
  buyKennel(key) {
    const data = this.get();
    if (!(key in MENU_META.KENNEL)) return { ok: false, reason: 'unknown' };
    const rank = data.kennel[key] || 0;
    const cost = kennelCost(rank);
    if (cost === null) return { ok: false, reason: 'max', rank, balance: data.bones };
    if (data.bones < cost) return { ok: false, reason: 'funds', rank, cost, balance: data.bones, need: cost - data.bones };
    data.bones -= cost;
    data.kennel[key] = rank + 1;
    const saved = this.write();
    return { ok: true, rank: rank + 1, cost, balance: data.bones, saved };
  },

  /** WeaponSelect: remember the last pick. */
  setLastPick(weapon, endless) {
    const data = this.get();
    if (data.unlocks.weapons.includes(weapon)) data.lastWeapon = weapon;
    data.lastEndless = data.unlocks.endless && !!endless;
    this.write();
  },

  setMuted(muted) {
    this.get().muted = !!muted;
    this.write();
  },

  /** Test helper: forget the in-memory copy (next get() re-reads storage). */
  reload() {
    cache = null;
    return this.get();
  },
};

/** booker-run / soba-tower AudioBridge API */
export function saveMuted(muted) {
  SaveData.setMuted(muted);
}
