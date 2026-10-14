// =============================================================================
// Casino sound effects, all synthesized (Web Audio, no files).
//
//   import { playSfx } from '../../audio/sfx.js';
//   playSfx('chip');                       // one-shot
//   playSfx('peg', { note: row });         // voice options (see each voice)
//   playSfx('win', { gain: 0.7, pan: -0.3, delay: 0.1 });
//
// Names: click, hover, chip, chipStack, card, cardFlip, shuffle, dice, diceLand,
//        wheelTick, ballDrop, peg, reelSpin, reelStop, win, bigWin, lose, push,
//        coin, bonus, error, woof
// Common opts: gain (linear, default 1), pan (-1..1), delay (s)
// Voice opts:  peg { note: 0..15 } (pitch steps up a pentatonic scale)
//              reelStop { index: 0..4 } (pitch rises per reel)
//              coin { index } (rising pitch for coin streams)
//              wheelTick { speed: 0..1 } (brighter when fast)
//              woof { small: true } (a yip)
//              dice { count: 1..3 }
//
// playSfx returns null (silently) before the first user gesture or while
// muted. Rate-limited names (AUDIO.SFX_GAP_MS) skip plays that come too fast.
// VOICES are pure builders so src/audio/offline.js can render them.
// =============================================================================

import { AUDIO } from '../core/Constants.js';
import { audioManager } from './AudioManager.js';
import { dbToGain, freqOf, tone, noise, silentGain, EPS } from './synth.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** [dry, wet] destinations: wet = a reverb send at `db`. */
function wet(a, db) {
  if (!a.rev) return a.out;
  const s = a.ctx.createGain();
  s.gain.value = dbToGain(db);
  s.connect(a.rev);
  return [a.out, s];
}

const T = (a, dest, start, o) => tone(a.ctx, dest, a.t + start, o);
const N = (a, dest, start, o) => noise(a.ctx, a.noise, dest, a.t + start, o);

// Major pentatonic from C5 (peg ladder, coin streams)
const PENTA = [0, 2, 4, 7, 9];
const pentaMidi = (i, base = 72) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

/** Mallet / bell note: sine body + a short bright partial. */
function mallet(a, dest, start, f, dur, peak, bright = 0.25) {
  T(a, dest, start, { freq: f, dur, peak, attack: 0.003 });
  T(a, dest, start, { freq: f * 4.0, dur: dur * 0.25, peak: peak * bright, attack: 0.002 });
}

/** Clay chip "clack": two band-passed clicks + a tiny ping. */
function clack(a, dest, start, v = 1, p = 1) {
  N(a, dest, start, { dur: 0.03, peak: 0.55 * v, bp: 3200 * p, q: 3.5 });
  N(a, dest, start + 0.012, { dur: 0.025, peak: 0.35 * v, bp: 2200 * p, q: 4 });
  T(a, dest, start, { freq: 2600 * p, dur: 0.04, peak: 0.07 * v, attack: 0.001 });
}

export const VOICES = {
  click(a) {
    T(a, a.out, 0, { type: 'triangle', freq: 1300 * a.pitch, to: 900 * a.pitch, dur: 0.06, peak: 0.28, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.015, peak: 0.18, hp: 4000 });
  },

  hover(a) {
    T(a, a.out, 0, { freq: 1900 * a.pitch, dur: 0.05, peak: 0.07, attack: 0.004 });
  },

  chip(a) {
    clack(a, a.out, 0, 1, a.pitch);
  },

  chipStack(a, o) {
    const n = Math.max(2, Math.min(8, o.count || 4));
    for (let i = 0; i < n; i++) clack(a, a.out, i * rand(0.03, 0.045), 0.9 - i * 0.06, a.pitch * (1 + i * 0.02));
  },

  card(a) {
    N(a, a.out, 0, { dur: 0.09, peak: 0.35, bp: 2400, q: 0.8, sweepTo: 5200, sweepS: 0.08, attack: 0.01 });
    N(a, a.out, 0.075, { dur: 0.04, peak: 0.25, lp: 900 });
  },

  cardFlip(a) {
    N(a, a.out, 0, { dur: 0.05, peak: 0.4, hp: 2500, attack: 0.002 });
    T(a, a.out, 0.01, { type: 'triangle', freq: 700 * a.pitch, to: 520 * a.pitch, dur: 0.06, peak: 0.12 });
  },

  shuffle(a) {
    for (let i = 0; i < 16; i++) {
      N(a, a.out, i * 0.032 + rand(0, 0.01), { dur: 0.025, peak: 0.22 + 0.1 * Math.sin(i / 3), bp: rand(3000, 5000), q: 2 });
    }
    N(a, a.out, 0.55, { dur: 0.12, peak: 0.3, lp: 1200 });
  },

  dice(a, o) {
    const n = 5 + 3 * Math.max(1, Math.min(3, o.count || 2));
    for (let i = 0; i < n; i++) {
      const t = i * rand(0.02, 0.045);
      N(a, a.out, t, { dur: 0.02, peak: rand(0.2, 0.45), bp: rand(1400, 2600), q: 5 });
    }
  },

  diceLand(a) {
    T(a, a.out, 0, { freq: 190 * a.pitch, to: 90, dur: 0.14, peak: 0.45, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.06, peak: 0.4, lp: 900 });
    N(a, a.out, 0.05, { dur: 0.02, peak: 0.25, bp: 2000, q: 5 });
    N(a, a.out, 0.09, { dur: 0.015, peak: 0.15, bp: 2300, q: 5 });
  },

  wheelTick(a, o) {
    const s = Math.max(0, Math.min(1, o.speed ?? 0.5));
    T(a, a.out, 0, { type: 'square', freq: (2200 + 900 * s) * a.pitch, dur: 0.018, peak: 0.06, attack: 0.001, lp: 5000 });
    N(a, a.out, 0, { dur: 0.012, peak: 0.25, bp: 4500, q: 6 });
  },

  ballDrop(a) {
    T(a, a.out, 0, { freq: 950 * a.pitch, to: 620 * a.pitch, dur: 0.07, peak: 0.25, attack: 0.002 });
    T(a, a.out, 0.11, { freq: 860 * a.pitch, to: 600 * a.pitch, dur: 0.05, peak: 0.14, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.02, peak: 0.15, lp: 1500 });
  },

  peg(a, o) {
    const f = freqOf(pentaMidi(Math.max(0, o.note ?? 0), 67));
    mallet(a, wet(a, -18), 0, f * a.pitch, 0.22, 0.22, 0.3);
  },

  reelSpin(a) {
    N(a, a.out, 0, { dur: 0.5, peak: 0.22, bp: 900, q: 1.2, sweepTo: 2600, sweepS: 0.4, attack: 0.08 });
    for (let i = 0; i < 10; i++) N(a, a.out, 0.04 + i * 0.045, { dur: 0.015, peak: 0.16, bp: 3000, q: 4 });
  },

  reelStop(a, o) {
    const k = Math.max(0, Math.min(4, o.index || 0));
    const p = a.pitch * Math.pow(2, k / 12);
    T(a, a.out, 0, { freq: 240 * p, to: 120 * p, dur: 0.12, peak: 0.45, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.05, peak: 0.35, lp: 1400 });
    N(a, a.out, 0.01, { dur: 0.02, peak: 0.25, bp: 3500, q: 4 });
  },

  win(a) {
    const dest = wet(a, -12);
    [72, 76, 79, 84].forEach((m, i) => mallet(a, dest, i * 0.075, freqOf(m) * a.pitch, 0.5, 0.26, 0.3));
    T(a, dest, 0.3, { type: 'triangle', freq: freqOf(88) * a.pitch, dur: 0.5, peak: 0.08 });
  },

  bigWin(a) {
    const dest = wet(a, -8);
    const run = [67, 72, 76, 79, 84, 88, 91, 96];
    run.forEach((m, i) => mallet(a, dest, i * 0.06, freqOf(m), 0.6, 0.22, 0.35));
    // brass-ish chord stab (filtered saws)
    [60, 64, 67, 72, 76].forEach((m) => {
      T(a, dest, 0.5, { type: 'sawtooth', freq: freqOf(m), dur: 1.0, peak: 0.06, attack: 0.02, hold: 0.35, lp: 2400 });
    });
    T(a, dest, 0.5, { type: 'sine', freq: freqOf(48), dur: 1.0, peak: 0.35, attack: 0.01, hold: 0.3 });
    for (let i = 0; i < 10; i++) mallet(a, dest, 0.6 + i * 0.07, freqOf(pentaMidi(10 + (i % 6), 72)), 0.4, 0.07, 0.4);
  },

  lose(a) {
    T(a, a.out, 0, { type: 'triangle', freq: freqOf(64) * a.pitch, to: freqOf(62) * a.pitch, glide: 0.18, dur: 0.24, peak: 0.2, lp: 1600 });
    T(a, a.out, 0.22, { type: 'triangle', freq: freqOf(60) * a.pitch, to: freqOf(57) * a.pitch, glide: 0.35, dur: 0.45, peak: 0.2, lp: 1200 });
  },

  push(a) {
    mallet(a, a.out, 0, freqOf(74) * a.pitch, 0.25, 0.16, 0.2);
    mallet(a, a.out, 0.12, freqOf(74) * a.pitch, 0.3, 0.14, 0.2);
  },

  coin(a, o) {
    const k = (o.index || 0) % 8;
    const p = a.pitch * Math.pow(2, k / 24);
    T(a, a.out, 0, { type: 'square', freq: 988 * p, dur: 0.06, peak: 0.07, attack: 0.002, lp: 6000 });
    T(a, a.out, 0.055, { type: 'square', freq: 1319 * p, dur: 0.16, peak: 0.07, attack: 0.002, lp: 6000 });
    T(a, a.out, 0.055, { freq: 2638 * p, dur: 0.1, peak: 0.05 });
  },

  bonus(a) {
    const dest = wet(a, -8);
    for (let i = 0; i < 12; i++) mallet(a, dest, i * 0.045, freqOf(pentaMidi(i, 72)) * a.pitch, 0.5, 0.12, 0.45);
    T(a, dest, 0.55, { freq: freqOf(96), dur: 0.9, peak: 0.08 });
  },

  error(a) {
    for (const s of [0, 0.11]) T(a, a.out, s, { type: 'square', freq: 165, dur: 0.08, peak: 0.12, attack: 0.003, lp: 900 });
  },

  /** A short playful bark: sawtooth chirp through a vowel formant + a breath. */
  woof(a, o) {
    const { ctx } = a;
    const small = !!o.small;
    const t = a.t;
    const f0 = (small ? 700 : 430) * a.pitch;
    const dur = small ? 0.1 : 0.17;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.8, t);
    osc.frequency.linearRampToValueAtTime(f0, t + dur * 0.25);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(small ? 1500 : 900, t);
    f1.frequency.linearRampToValueAtTime(small ? 1100 : 650, t + dur);
    f1.Q.value = 3;
    const env = silentGain(ctx);
    env.gain.setValueAtTime(EPS, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.012);
    env.gain.setValueAtTime(0.9, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(EPS, t + dur);
    osc.connect(f1);
    f1.connect(env);
    env.connect(a.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    N(a, a.out, 0, { dur: dur * 0.6, peak: 0.12, bp: 1800, q: 1 });
  },
};

// Per-name variation (pitch +- fraction, volume +- dB)
const VARY_DEFAULT = { pitch: AUDIO.PITCH_JITTER, db: AUDIO.VOL_JITTER_DB };
const VARY = {
  win: { pitch: 0, db: 0.5 }, bigWin: { pitch: 0, db: 0 }, bonus: { pitch: 0, db: 0 },
  lose: { pitch: 0, db: 0.5 }, push: { pitch: 0, db: 0.5 }, error: { pitch: 0, db: 0 },
  chip: { pitch: 0.08, db: 1.5 }, peg: { pitch: 0.01, db: 1.5 }, woof: { pitch: 0.08, db: 1 },
};

// Per-voice trim (dB) so quick clicks sit level with the tonal stingers over the music
const TRIM_DB = {
  chip: 9, chipStack: 8, dice: 13, wheelTick: 9, shuffle: 9, coin: 6, reelSpin: 7, card: 6,
  ballDrop: 4, lose: 3, push: 3, error: 4, cardFlip: -2,
};

const lastAt = {};

export const SFX_NAMES = Object.keys(VOICES);

/**
 * @param {string} name a key of VOICES
 * @param {{gain?: number, pan?: number, delay?: number}} [o] plus voice options
 * @returns {{group: GainNode, name: string}|null}
 */
export function playSfx(name, o = {}) {
  const voice = VOICES[name];
  if (!voice) {
    console.warn(`[Audio] unknown sfx "${name}"`);
    return null;
  }
  const base = audioManager.sfxOut();
  if (!base) {
    audioManager.noteSfx(name, false);
    return null;
  }
  const now = performance.now();
  const gap = AUDIO.SFX_GAP_MS[name] || 0;
  if (gap && now - (lastAt[name] ?? -Infinity) < gap) return null;
  lastAt[name] = now;

  const { ctx } = base;
  const v = VARY[name] || VARY_DEFAULT;
  const pitch = 1 + rand(-v.pitch, v.pitch);
  const vol = dbToGain(rand(-v.db, v.db) + (TRIM_DB[name] || 0)) * (o.gain ?? 1);
  try {
    const group = ctx.createGain();
    group.gain.value = vol;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      group.connect(p);
      p.connect(base.out);
    } else {
      group.connect(base.out);
    }
    voice({ ctx, out: group, rev: base.rev, noise: base.noise, t: ctx.currentTime + 0.005 + (o.delay || 0), pitch }, o);
    audioManager.noteSfx(name, true);
    return { group, name };
  } catch (err) {
    console.warn(`[Audio] sfx ${name} failed:`, err);
    return null;
  }
}

/** Fade a played group out now (cancels anything it still has scheduled). */
export function cancelSfx(handle) {
  if (!handle || !audioManager.ctx) return;
  try {
    const t = audioManager.ctx.currentTime;
    const g = handle.group.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.03);
    setTimeout(() => {
      try { handle.group.disconnect(); } catch { /* gone */ }
    }, 120);
  } catch { /* context closed */ }
}

/** Stereo pan for a game x (0..1280). */
export const panOfX = (x) => Math.max(-0.6, Math.min(0.6, (x / 1280) * 1.2 - 0.6));
