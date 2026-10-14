// =============================================================================
// One-shot sound effects for Soba Guard, all synthesized (Web Audio, no files).
//
//   playSfx(name, opts) -> handle | null
//     Returns null (silently) when the context isn't running or audio is muted.
//     Every play gets its own group gain (per-play volume variation, optional
//     stereo pan from a screen x) -> SFX bus; reverb sends go to the shared
//     reverb. A small random pitch/volume variation is applied per play
//     (AUDIO.PITCH_JITTER / VOL_JITTER_DB, or VARY[name]).
//   Throttling (gate()): a sound replayed inside AUDIO.SFX_GAP_MS[name] is
//     skipped, and more than DENSITY_FREE plays of one sound inside
//     DENSITY_WINDOW_MS get quieter (1/sqrt(n)), so 20 bites or hits at once
//     never stack into a clip.
//   cancelSfx(handle) fades a scheduled group out.
//
// VOICES[name](a, o) builds the sound at time a.t on a.out (a = { ctx, out,
// rev, noise, t, pitch }). They don't touch the AudioManager, so
// src/audio/offline.js can render them into an OfflineAudioContext.
// =============================================================================

import { AUDIO } from './AudioConstants.js';
import { audioManager } from './AudioManager.js';
import {
  dbToGain, freqOf, freqOfDegree, tone, noise, pluck, silentGain, EPS,
} from './synth.js';

// --- helpers ----------------------------------------------------------------------

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

/** Envelope gain at a.t + start: EPS -> peak (attack) -> hold -> EPS at dur. */
function env(a, start, peak, attack, dur, hold = 0) {
  const g = silentGain(a.ctx);
  const t = a.t + start;
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(Math.max(peak, EPS * 2), t + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(peak, EPS * 2), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(EPS, t + Math.max(dur, attack + hold + 0.01));
  return g;
}

function osc(a, type, start, stop) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.start(a.t + start);
  o.stop(a.t + stop);
  return o;
}

/**
 * A dog's "woof": a sawtooth voice that jumps up and falls, through two
 * formant band-passes, over a square body an octave down and a breathy
 * noise onset. f ~ 300 Hz is Soba's bark; higher and shorter = a happy yip.
 */
function woof(a, start, f, dur, peak, { rise = 1.25, fall = 0.68 } = {}) {
  const { ctx } = a;
  const t = a.t + start;
  const v = osc(a, 'sawtooth', start, start + dur + 0.05);
  v.frequency.setValueAtTime(f * 0.8, t);
  v.frequency.linearRampToValueAtTime(f * rise, t + dur * 0.18);
  v.frequency.exponentialRampToValueAtTime(f * fall, t + dur);
  const body = osc(a, 'square', start, start + dur + 0.05);
  body.frequency.setValueAtTime(f * 0.4, t);
  body.frequency.linearRampToValueAtTime(f * rise * 0.5, t + dur * 0.18);
  body.frequency.exponentialRampToValueAtTime(f * fall * 0.5, t + dur);
  const bodyLp = ctx.createBiquadFilter();
  bodyLp.type = 'lowpass';
  bodyLp.frequency.value = 650;
  const bodyG = ctx.createGain();
  bodyG.gain.value = 0.45;
  body.connect(bodyLp);
  bodyLp.connect(bodyG);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 950;
  f1.Q.value = 1.4;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 2100;
  f2.Q.value = 2.5;
  const f2g = ctx.createGain();
  f2g.gain.value = 0.5;
  const g = env(a, start, peak, 0.008, dur, dur * 0.25);
  v.connect(f1);
  v.connect(f2);
  f2.connect(f2g);
  f1.connect(g);
  f2g.connect(g);
  bodyG.connect(g);
  g.connect(a.out);
  N(a, a.out, start, { dur: dur * 0.5, peak: peak * 0.3, attack: 0.004, bp: 1600, q: 1 });
}

/** Harsh bird call: sawtooth with a 70 Hz wobble through two formants (crow caw). */
function birdCall(a, start, f, dur, peak, contour) {
  const { ctx } = a;
  const t = a.t + start;
  const o = osc(a, 'sawtooth', start, start + dur + 0.05);
  o.frequency.setValueAtTime(f * contour[0], t);
  o.frequency.linearRampToValueAtTime(f * contour[1], t + dur * 0.15);
  o.frequency.exponentialRampToValueAtTime(f * contour[2], t + dur);
  const rough = ctx.createGain();
  rough.gain.value = 0.6;
  const lfo = osc(a, 'square', start, start + dur + 0.05);
  lfo.frequency.value = 70;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth);
  depth.connect(rough.gain);
  o.connect(rough);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 1300;
  f1.Q.value = 2.5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 2600;
  f2.Q.value = 4;
  const g = env(a, start, peak, 0.012, dur, dur * 0.4);
  rough.connect(f1);
  rough.connect(f2);
  f1.connect(g);
  f2.connect(g);
  g.connect(a.out);
}

/** A small rodent squeak: a sine chirp with a fast flutter. */
function squeak(a, start, f, dur, peak) {
  const { ctx } = a;
  const t = a.t + start;
  const o = osc(a, 'sine', start, start + dur + 0.05);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.55, t + dur * 0.3);
  o.frequency.exponentialRampToValueAtTime(f * 0.85, t + dur);
  const lfo = osc(a, 'sine', start, start + dur + 0.05);
  lfo.frequency.value = 32;
  const depth = ctx.createGain();
  depth.gain.value = f * 0.06;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const g = env(a, start, peak, 0.006, dur, dur * 0.3);
  o.connect(g);
  g.connect(a.out);
}

/** Soft "poof": a puff of noise closing down, for a critter running off. */
function poof(a, start, peak) {
  N(a, a.out, start, { dur: 0.22, peak, attack: 0.012, lp: 2400, sweepTo: 500 });
}

/** Inharmonic partials with individual decays (+ optional beating pair). */
function partials(a, start, f0, list, scale, dest, { bloom = 0 } = {}) {
  list.forEach(([ratio, amp, decay, beat], i) => {
    const attack = 0.003 + i * bloom;
    const pk = amp * scale;
    if (beat) {
      T(a, dest, start, { freq: f0 * ratio, dur: decay, peak: pk * 0.55, attack });
      T(a, dest, start, { freq: f0 * ratio + beat, dur: decay * 0.92, peak: pk * 0.45, attack });
    } else {
      T(a, dest, start, { freq: f0 * ratio, dur: decay, peak: pk, attack });
    }
  });
}

/** One taiko "don". */
function taiko(a, start, v) {
  T(a, a.out, start, { freq: 120, to: 50, glide: 0.22, dur: 0.6, peak: 0.85 * v, attack: 0.003 });
  T(a, a.out, start, { type: 'triangle', freq: 200, to: 90, glide: 0.06, dur: 0.1, peak: 0.2 * v, attack: 0.002 });
  N(a, a.out, start, { dur: 0.08, peak: 0.3 * v, lp: 900 });
}

/** A blooming gong in D (D3 partials) into the reverb. */
function gong(a, start, scale) {
  const d = wet(a, -5);
  partials(a, start, 146.83, [
    [1, 0.5, 3.0, 0.8], [1.52, 0.3, 2.4, 0], [2.0, 0.3, 2.2, 1.3], [2.68, 0.18, 1.5, 0],
    [3.36, 0.12, 1.1, 0], [4.24, 0.08, 0.8, 0], [5.4, 0.05, 0.5, 0],
  ], scale, d, { bloom: 0.025 });
  T(a, a.out, start, { freq: 82, to: 55, dur: 0.12, peak: 0.3 * scale });
}

/** Little paw taps (soft, lowpassed noise ticks). */
function paws(a, start, n, gap, peak) {
  for (let i = 0; i < n; i++) {
    N(a, a.out, start + i * gap + rand(-0.008, 0.008), { dur: 0.03, peak: peak * rand(0.7, 1), lp: 1500, attack: 0.002 });
  }
}

// --- voices ------------------------------------------------------------------------

export const VOICES = {
  // --- placing and cards ---
  /** Place a unit: a soft wooden thunk into the soil. */
  place(a) {
    T(a, a.out, 0, { freq: 165 * a.pitch, to: 62, glide: 0.1, dur: 0.16, peak: 0.55, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.06, peak: 0.3, lp: 700 });
    T(a, a.out, 0, { type: 'triangle', freq: 620 * a.pitch, to: 540, dur: 0.035, peak: 0.08, attack: 0.001 });
  },

  /** Place denied / upgrade or ability not ready: a soft "bu-bu". */
  denied(a) {
    T(a, a.out, 0, { type: 'triangle', freq: 233, dur: 0.07, peak: 0.28, attack: 0.003, hold: 0.03, lp: 1400 });
    T(a, a.out, 0.1, { type: 'triangle', freq: 196, dur: 0.1, peak: 0.28, attack: 0.003, hold: 0.04, lp: 1400 });
  },

  /** A card is picked up: a wood tok and a little pluck. */
  cardSelect(a) {
    T(a, a.out, 0, { freq: 980 * a.pitch, to: 860, dur: 0.04, peak: 0.18, attack: 0.001 });
    pluck(a.ctx, a.out, a.t + 0.015, freqOf(86) * a.pitch, 0.18, 0.12, { bright: 1 });
  },

  /** A card finished recharging: a tiny tick. */
  cardReady(a) {
    T(a, a.out, 0, { freq: 2349 * a.pitch, dur: 0.06, peak: 0.07, attack: 0.001 });
    T(a, a.out, 0, { freq: 3520 * a.pitch, dur: 0.035, peak: 0.03, attack: 0.001 });
  },

  /** A new crew card: a koto run up to a ringing D7. */
  cardUnlock(a) {
    const d = wet(a, -10);
    [86, 88, 91, 93].forEach((m, i) => pluck(a.ctx, d, a.t + i * 0.07, freqOf(m), 0.35, 0.14, { bright: 1 }));
    pluck(a.ctx, d, a.t + 0.28, freqOf(98), 1.1, 0.19, { bright: 1 });
    T(a, d, 0.28, { freq: freqOf(98) * 2, dur: 0.6, peak: 0.03 });
  },

  // --- coins ---
  /** A coin drops (lantern drift or a Lucky Cat): a soft bell chime. */
  coinDrop(a) {
    const d = wet(a, -10);
    const f = freqOf(91) * a.pitch;   // G6
    T(a, d, 0, { freq: f, dur: 0.5, peak: 0.1, attack: 0.002 });
    T(a, d, 0, { freq: f * 2.76, dur: 0.18, peak: 0.03, attack: 0.002 });
    T(a, d, 0.07, { freq: f * 1.122, dur: 0.4, peak: 0.07, attack: 0.002 });
  },

  /** Coin collected: a bright ding; o.streak steps it up the yo scale. */
  coinCollect(a, o) {
    const deg = 10 + Math.min(o.streak || 0, AUDIO.COIN_STREAK_MAX);   // D6 E6 G6 A6 B6 D7 E7
    const f = freqOfDegree(deg) * a.pitch;
    const d = wet(a, -12);
    T(a, d, 0, { type: 'square', freq: f, dur: 0.05, peak: 0.06, lp: 5000 });
    T(a, d, 0.04, { freq: f * 1.5, dur: 0.3, peak: 0.2 });
    T(a, d, 0.04, { freq: f * 3, dur: 0.14, peak: 0.04 });
    N(a, a.out, 0.03, { dur: 0.06, peak: 0.03, hp: 8000 });
  },

  // --- defenders ---
  /** Dumpling Steamer fires: a puff of steam and a little pop. */
  shoot(a) {
    N(a, a.out, 0, { dur: 0.13, peak: 0.28, attack: 0.006, bp: 900, sweepTo: 320, q: 1.2 });
    T(a, a.out, 0, { freq: 320 * a.pitch, to: 170, dur: 0.06, peak: 0.12, attack: 0.002 });
  },

  /** A dumpling hits a critter: a soft splat. */
  hit(a) {
    N(a, a.out, 0, { dur: 0.08, peak: 0.32, attack: 0.002, lp: 1000, sweepTo: 300 });
    T(a, a.out, 0, { freq: 240 * a.pitch, to: 110, dur: 0.07, peak: 0.16, attack: 0.002 });
    N(a, a.out, 0.012, { dur: 0.025, peak: 0.07, bp: 2600, q: 2 });
  },

  /** A dumpling hits a pot lid: a small tink. */
  lidHit(a) {
    partials(a, 0, 1420 * a.pitch, [[1, 0.1, 0.12], [2.32, 0.05, 0.08], [4.1, 0.025, 0.05]], 1, a.out);
    N(a, a.out, 0, { dur: 0.02, peak: 0.08, hp: 3000 });
  },

  /** Chili Lantern embers: a fiery whoosh with crackles. */
  ember(a) {
    N(a, a.out, 0, { dur: 0.3, peak: 0.25, attack: 0.03, bp: 900, sweepTo: 2800, q: 0.9 });
    for (let i = 0; i < 5; i++) N(a, a.out, rand(0.03, 0.28), { dur: 0.012, peak: rand(0.08, 0.16), hp: 3000, attack: 0.001 });
  },

  /** A critter bites: a small crunch (the bridge loops it while anything bites). */
  bite(a) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      N(a, a.out, i * rand(0.028, 0.045), { dur: rand(0.018, 0.03), peak: rand(0.4, 0.55), bp: rand(1800, 3400), q: 2, attack: 0.001 });
    }
    N(a, a.out, 0, { dur: 0.05, peak: 0.25, lp: 500 });
  },

  /** A defender is eaten: a crumbly crunch and a sad falling pop. */
  unitLost(a) {
    N(a, a.out, 0, { dur: 0.36, peak: 0.35, attack: 0.004, lp: 1100, sweepTo: 220 });
    for (let i = 0; i < 4; i++) N(a, a.out, rand(0.02, 0.25), { dur: 0.02, peak: rand(0.12, 0.22), bp: rand(1500, 3000), q: 2, attack: 0.001 });
    T(a, a.out, 0.05, { type: 'triangle', freq: 440 * a.pitch, to: 130, dur: 0.3, peak: 0.16, attack: 0.004 });
  },

  /** Upgrade: a sparkling koto arpeggio up. */
  upgrade(a) {
    const d = wet(a, -10);
    [74, 79, 81, 86, 88, 93].forEach((m, i) => pluck(a.ctx, d, a.t + i * 0.045, freqOf(m), 0.4, 0.12 + i * 0.012, { bright: 1.1 }));
    T(a, d, 0.27, { freq: freqOf(98), dur: 0.5, peak: 0.035 });
    N(a, a.out, 0.2, { dur: 0.25, peak: 0.03, attack: 0.05, hp: 8000 });
  },

  /** Recall: a reverse whoosh that snaps shut, and a coin chink. */
  recall(a) {
    N(a, a.out, 0, { dur: 0.33, peak: 0.3, attack: 0.29, bp: 400, sweepTo: 3200, q: 1.2 });
    T(a, a.out, 0, { freq: 300 * a.pitch, to: 1100, dur: 0.32, peak: 0.06, attack: 0.28 });
    T(a, a.out, 0.33, { freq: freqOf(93), dur: 0.2, peak: 0.1, attack: 0.001 });
  },

  // --- critters ---
  /** A rat is beaten: a squeak and a poof. */
  killRat(a) {
    squeak(a, 0, 1500 * a.pitch, 0.12, 0.2);
    poof(a, 0.05, 0.18);
  },

  /** A pot-lid rat is beaten: a lower squeak, a poof, a tiny pot tink. */
  killLid(a) {
    squeak(a, 0, 1180 * a.pitch, 0.15, 0.2);
    poof(a, 0.05, 0.2);
    T(a, a.out, 0.08, { freq: 1900 * a.pitch, dur: 0.1, peak: 0.04 });
  },

  /** A crow is beaten: a short caw and a feather puff. */
  killCrow(a) {
    birdCall(a, 0, 620 * a.pitch, 0.18, 0.3, [0.95, 1.12, 0.78]);
    N(a, a.out, 0.04, { dur: 0.22, peak: 0.08, attack: 0.03, bp: 3000, q: 0.7 });
  },

  /** Anything else (tanuki, fox, later levels): a round "pon" + poof. */
  killPoof(a) {
    T(a, a.out, 0, { freq: 200 * a.pitch, to: 120, dur: 0.12, peak: 0.25 });
    poof(a, 0, 0.22);
  },

  /** A crow steps into the garden: one caw. */
  caw(a) {
    birdCall(a, 0, 540 * a.pitch, 0.22, 0.3, [0.9, 1.08, 0.82]);
  },

  /** Crow hops a defender: three wing flaps. */
  hop(a) {
    for (let i = 0; i < 3; i++) {
      N(a, a.out, i * 0.085, { dur: 0.06, peak: 0.55 * (1 - i * 0.15), attack: 0.01, bp: 700, sweepTo: 1300, q: 1.1 });
    }
  },

  /** The lid is knocked off: a metallic clang, then it clatters twice. */
  lidOff(a) {
    const d = wet(a, -14);
    partials(a, 0, 520 * a.pitch, [[1, 0.22, 0.6], [2.32, 0.14, 0.42], [4.25, 0.08, 0.26], [6.63, 0.04, 0.15]], 1, d);
    N(a, a.out, 0, { dur: 0.04, peak: 0.25, hp: 2500 });
    for (const [s, k] of [[0.17, 0.45], [0.27, 0.25]]) {
      partials(a, s, 560 * a.pitch, [[1, 0.12, 0.18], [2.32, 0.07, 0.12]], k * 2, a.out);
      N(a, a.out, s, { dur: 0.02, peak: 0.1 * k, hp: 3000 });
    }
  },

  // --- Soba ---
  /** Soba's bark: one big woof (pitch varies per play) and a soft shock thump. */
  bark(a) {
    woof(a, 0, 300 * a.pitch, 0.2, 0.55);
    T(a, a.out, 0.02, { freq: 90, to: 50, dur: 0.18, peak: 0.25 });
  },

  /** Win: a couple of happy yips. */
  happyBarks(a) {
    woof(a, 0, 470 * a.pitch, 0.11, 0.38, { rise: 1.35, fall: 0.9 });
    woof(a, 0.19, 520 * a.pitch, 0.1, 0.36, { rise: 1.4, fall: 0.95 });
    woof(a, 0.42, 440 * a.pitch, 0.15, 0.4, { rise: 1.3, fall: 0.75 });
  },

  /** Soba trots to another row: a few soft paw taps. */
  sobaMove(a) {
    paws(a, 0, 3, 0.07, 0.35);
  },

  /** Zoomies: a yip, fast paw patter and a whoosh down the row and back (1.2 s). */
  zoomies(a) {
    woof(a, 0, 500 * a.pitch, 0.1, 0.3, { rise: 1.4, fall: 0.95 });
    paws(a, 0.08, 14, 0.075, 0.35);
    N(a, a.out, 0.05, { dur: 0.55, peak: 0.22, attack: 0.2, bp: 500, sweepTo: 2600, q: 1.3 });
    N(a, a.out, 0.6, { dur: 0.55, peak: 0.22, attack: 0.15, bp: 2600, sweepTo: 500, q: 1.3 });
  },

  /** The zoomies meter is full: a rising three-bell chime. */
  zoomiesReady(a) {
    const d = wet(a, -8);
    [81, 86, 93].forEach((m, i) => {
      T(a, d, i * 0.08, { freq: freqOf(m), dur: 0.6, peak: 0.12, attack: 0.002 });
      T(a, d, i * 0.08, { freq: freqOf(m) * 2.76, dur: 0.2, peak: 0.03, attack: 0.002 });
    });
  },

  /** Delivery scooter: horn beep-beep, then a two-stroke engine putting away. */
  scooter(a) {
    const { ctx } = a;
    for (const s of [0, 0.17]) {
      for (const f of [523, 659]) T(a, a.out, s, { type: 'square', freq: f, dur: 0.11, peak: 0.07, attack: 0.004, hold: 0.06, lp: 2400 });
    }
    const start = 0.3;
    const dur = 1.0;
    const eng = osc(a, 'sawtooth', start, start + dur + 0.05);
    eng.frequency.setValueAtTime(52, a.t + start);
    eng.frequency.exponentialRampToValueAtTime(96, a.t + start + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = osc(a, 'square', start, start + dur + 0.05);
    lfo.frequency.setValueAtTime(13, a.t + start);
    lfo.frequency.exponentialRampToValueAtTime(24, a.t + start + dur);
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth);
    depth.connect(am.gain);
    const g = env(a, start, 0.4, 0.05, dur, dur * 0.5);
    eng.connect(lp);
    lp.connect(am);
    am.connect(g);
    g.connect(a.out);
  },

  // --- waves ---
  /** A normal wave starts: one taiko don and a koto signal. */
  waveStart(a) {
    taiko(a, 0, 0.5);
    pluck(a.ctx, a.out, a.t + 0.05, freqOf(74), 0.4, 0.16, { bright: 1 });
    pluck(a.ctx, a.out, a.t + 0.17, freqOf(81), 0.6, 0.16, { bright: 1 });
  },

  /** A huge wave is coming: taiko don ... don ... don-don, then a gong. */
  hugeWave(a) {
    [[0, 0.85], [0.34, 0.75], [0.68, 0.7], [0.84, 0.85]].forEach(([s, v]) => taiko(a, s, v));
    gong(a, 1.05, 0.5);
  },

  /** The last push of a wave: three quick taiko hits. */
  push(a) {
    [[0, 0.55], [0.16, 0.5], [0.32, 0.7]].forEach(([s, v]) => taiko(a, s, v));
  },

  /** The battle is won (before Results): taiko + cymbal + a bright strum. */
  winHit(a) {
    taiko(a, 0, 0.8);
    N(a, a.out, 0, { dur: 0.3, peak: 0.2, bp: 5500, q: 0.9 });
    const d = wet(a, -10);
    [74, 81, 86, 88, 93].forEach((m, i) => pluck(a.ctx, d, a.t + 0.04 + i * 0.03, freqOf(m), 1.2, 0.12, { bright: 1 }));
  },

  /** A critter reached the door: a wooden bang and a falling groan. */
  doorBang(a) {
    T(a, a.out, 0, { freq: 110, to: 45, dur: 0.3, peak: 0.6, attack: 0.002 });
    N(a, a.out, 0, { dur: 0.12, peak: 0.4, lp: 1500 });
    T(a, a.out, 0.12, { type: 'sawtooth', freq: 180, to: 95, dur: 0.5, peak: 0.08, lp: 700 });
  },

  // --- menus ---
  /** Menu focus moves: a soft tick. */
  uiMove(a) {
    T(a, a.out, 0, { type: 'triangle', freq: 1320 * a.pitch, dur: 0.035, peak: 0.1, attack: 0.001 });
  },

  /** Menu confirm (and unmute): a bright koto double pluck. */
  uiConfirm(a) {
    pluck(a.ctx, a.out, a.t, freqOf(86), 0.25, 0.2, { bright: 1.1 });
    pluck(a.ctx, a.out, a.t + 0.05, freqOf(93), 0.3, 0.16, { bright: 1.1 });
  },

  /** Menu back: the same pluck, falling. */
  uiBack(a) {
    pluck(a.ctx, a.out, a.t, freqOf(86), 0.2, 0.16, { bright: 0.9 });
    pluck(a.ctx, a.out, a.t + 0.06, freqOf(79), 0.3, 0.14, { bright: 0.9 });
  },

  /** Treat Shop purchase: a ka-ching and a sparkle up. */
  shopBuy(a) {
    partials(a, 0, 2100, [[1, 0.12, 0.15], [1.5, 0.08, 0.12]], 1, a.out);
    partials(a, 0.07, 2600, [[1, 0.12, 0.25], [1.5, 0.08, 0.18]], 1, a.out);
    const d = wet(a, -10);
    [86, 91, 95, 98].forEach((m, i) => pluck(a.ctx, d, a.t + 0.12 + i * 0.05, freqOf(m), 0.5, 0.13, { bright: 1.1 }));
  },

  /** Treat Shop refused: a low double buzz. */
  shopRefused(a) {
    T(a, a.out, 0, { type: 'square', freq: 147, dur: 0.09, peak: 0.12, attack: 0.003, hold: 0.04, lp: 900 });
    T(a, a.out, 0.13, { type: 'square', freq: 139, dur: 0.14, peak: 0.12, attack: 0.003, hold: 0.06, lp: 900 });
  },

  pause(a) {
    T(a, a.out, 0, { type: 'square', freq: freqOf(81), dur: 0.06, peak: 0.16, lp: 3000 });
    T(a, a.out, 0.07, { type: 'square', freq: freqOf(74), dur: 0.09, peak: 0.16, lp: 3000 });
  },

  unpause(a) {
    T(a, a.out, 0, { type: 'square', freq: freqOf(74), dur: 0.06, peak: 0.16, lp: 3000 });
    T(a, a.out, 0.07, { type: 'square', freq: freqOf(81), dur: 0.09, peak: 0.16, lp: 3000 });
  },
};

// Per-sound variation (pitch +-, volume +-dB); the rest use the defaults
const VARY_DEFAULT = { pitch: AUDIO.PITCH_JITTER, db: AUDIO.VOL_JITTER_DB };
const VARY = {
  bark: { pitch: 0.08, db: 1 },
  coinCollect: { pitch: 0.004, db: 1 },
  cardUnlock: { pitch: 0, db: 0 },
  upgrade: { pitch: 0, db: 0.5 },
  zoomiesReady: { pitch: 0, db: 0 },
  hugeWave: { pitch: 0, db: 0 },
  waveStart: { pitch: 0, db: 0.5 },
  push: { pitch: 0, db: 0.5 },
  winHit: { pitch: 0, db: 0 },
  doorBang: { pitch: 0, db: 0 },
  uiConfirm: { pitch: 0.01, db: 0.5 },
  uiBack: { pitch: 0.01, db: 0.5 },
  shopBuy: { pitch: 0, db: 0 },
  shopRefused: { pitch: 0, db: 0 },
  pause: { pitch: 0, db: 0 },
  unpause: { pitch: 0, db: 0 },
  denied: { pitch: 0.01, db: 0.5 },
};

/**
 * Throttle state machine shared with offline.js: returns the gain multiplier
 * for a play of `name` at `nowMs`, or 0 to skip it.
 */
export function createGate() {
  const lastAt = {};
  const recent = {};
  return (name, nowMs) => {
    const gap = AUDIO.SFX_GAP_MS[name] || 0;
    if (gap && nowMs - (lastAt[name] ?? -Infinity) < gap) return 0;
    lastAt[name] = nowMs;
    const list = (recent[name] || []).filter(t => nowMs - t < AUDIO.DENSITY_WINDOW_MS);
    list.push(nowMs);
    recent[name] = list;
    const extra = list.length - AUDIO.DENSITY_FREE;
    return extra > 0 ? Math.max(AUDIO.DENSITY_MIN_GAIN, 1 / Math.sqrt(1 + extra)) : 1;
  };
}

const gate = createGate();

/** Screen x (0..640) -> stereo pan (-max..+max). */
export function panOfX(x) {
  if (x === undefined || x === null || !Number.isFinite(x)) return 0;
  const k = Math.max(0, Math.min(1, x / AUDIO.SCREEN_W));
  return (k * 2 - 1) * AUDIO.SFX_PAN_MAX;
}

/** Applies a play's variation and builds the voice on a fresh group gain. */
export function buildVoice(ctx, base, name, o, gainMul) {
  const voice = VOICES[name];
  const v = VARY[name] || VARY_DEFAULT;
  const pitch = 1 + rand(-v.pitch, v.pitch);
  const vol = dbToGain(rand(-v.db, v.db)) * (o.gain ?? 1) * gainMul;
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
  voice({ ctx, out: group, rev: base.rev, noise: base.noise, t: (o.at ?? ctx.currentTime + 0.005) + (o.delay || 0), pitch }, o);
  return group;
}

/**
 * @param {string} name a key of VOICES
 * @param {{gain?: number, pan?: number, delay?: number}} [o] plus voice options (streak)
 * @returns {{group: GainNode, name: string}|null}
 */
export function playSfx(name, o = {}) {
  if (!VOICES[name]) return null;
  const base = audioManager.sfxOut();
  if (!base) {
    audioManager.noteSfx(name, false);
    return null;
  }
  const mul = gate(name, performance.now());
  if (!mul) return null;
  try {
    const group = buildVoice(base.ctx, base, name, o, mul);
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
