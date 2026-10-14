// =============================================================================
// One-shot sound effects, all synthesized (Web Audio, no files).
//
//   playSfx(name, opts) -> handle | null
//     Returns null (silently) when the context isn't running or audio is muted.
//     Every play gets its own group gain (per-play volume variation, optional
//     stereo pan from a world x) -> SFX bus; reverb sends go to the shared
//     reverb. A small random pitch/volume variation is applied per play
//     (AUDIO.SFX_VARY), and rate-limited sounds skip when played too often.
//   cancelSfx(handle) fades a scheduled group out (e.g. the roof-tile warning
//     when the game pauses).
//
// VOICES[name](a, o) builds the sound at time a.t on a.out (a = { ctx, out,
// rev, noise, t, pitch }). They don't touch the AudioManager, so
// src/audio/offline.js can render them into an OfflineAudioContext to
// measure levels.
// =============================================================================

import { AUDIO, TILE, WORLD } from '../core/Constants.js';
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

const T = (ctx, dest, a, start, o) => tone(ctx, dest, a.t + start, o);
const N = (ctx, dest, a, start, o) => noise(ctx, a.noise, dest, a.t + start, o);

/**
 * Harsh bird call: sawtooth with a rough 70 Hz amplitude wobble through two
 * formant band-passes. Used for the crow caw and the stomp squawk.
 */
function birdCall(a, start, f, dur, peak, contour) {
  const { ctx } = a;
  const t = a.t + start;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * contour[0], t);
  osc.frequency.linearRampToValueAtTime(f * contour[1], t + dur * 0.15);
  osc.frequency.exponentialRampToValueAtTime(f * contour[2], t + dur);
  const rough = ctx.createGain();
  rough.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 70;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth);
  depth.connect(rough.gain);
  osc.connect(rough);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 1300;
  f1.Q.value = 2.5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 2600;
  f2.Q.value = 4;
  const env = silentGain(ctx);
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.012);
  env.gain.setValueAtTime(peak, t + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);
  rough.connect(f1);
  rough.connect(f2);
  f1.connect(env);
  f2.connect(env);
  env.connect(a.out);
  if (a.rev) {
    const s = ctx.createGain();
    s.gain.value = dbToGain(-14);
    env.connect(s);
    s.connect(a.rev);
  }
  for (const o of [osc, lfo]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Inharmonic partials with individual decays (+ optional beating pair). */
function partials(a, start, f0, list, scale, dest, { bloom = 0 } = {}) {
  list.forEach(([ratio, amp, decay, beat], i) => {
    const attack = 0.003 + i * bloom;
    const pk = amp * scale;
    if (beat) {
      T(a.ctx, dest, a, start, { freq: f0 * ratio, dur: decay, peak: pk * 0.55, attack });
      T(a.ctx, dest, a, start, { freq: f0 * ratio + beat, dur: decay * 0.92, peak: pk * 0.45, attack });
    } else {
      T(a.ctx, dest, a, start, { freq: f0 * ratio, dur: decay, peak: pk, attack });
    }
  });
}

// --- voices ------------------------------------------------------------------------

export const VOICES = {
  /** Soft "boing-pat": a paw pat + a short rising sine; pitch climbs a little per zone. */
  bounce(a, o) {
    const z = Math.max(1, Math.min(4, o.zone || 1));
    const f = 250 * a.pitch * Math.pow(2, ((z - 1) * AUDIO.BOUNCE_ZONE_SEMITONES) / 12);
    N(a.ctx, a.out, a, 0, { dur: 0.04, peak: 0.36, lp: 1100 });
    T(a.ctx, a.out, a, 0.004, { freq: f, to: f * 1.55, glide: 0.07, dur: 0.13, peak: 0.28, attack: 0.004 });
    T(a.ctx, a.out, a, 0.004, { type: 'triangle', freq: f * 2, to: f * 3.1, glide: 0.07, dur: 0.08, peak: 0.05 });
  },

  /** Big "boyoyoing": triangle sliding up with a decaying 14 Hz wobble, a metal twang and a whoosh. */
  spring(a) {
    const { ctx } = a;
    const t = a.t;
    const f = 150 * a.pitch;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 3.6, t + 0.38);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * 0.35, t);
    depth.gain.exponentialRampToValueAtTime(1, t + 0.45);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const g = silentGain(ctx);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.36, t + 0.006);
    g.gain.setValueAtTime(0.36, t + 0.2);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.55);
    osc.connect(g);
    g.connect(a.out);
    for (const n of [osc, lfo]) { n.start(t); n.stop(t + 0.6); }
    T(ctx, a.out, a, 0, { type: 'sawtooth', freq: 92 * a.pitch, dur: 0.28, peak: 0.16, bp: 900, q: 6 });
    N(ctx, a.out, a, 0.02, { dur: 0.32, peak: 0.12, attack: 0.08, bp: 600, sweepTo: 2600, q: 1.2 });
  },

  /** Crumble: sharp crack + wood snap + a short creak. */
  crack(a) {
    N(a.ctx, a.out, a, 0, { dur: 0.03, peak: 0.4, hp: 2200 });
    T(a.ctx, a.out, a, 0, { type: 'square', freq: 720 * a.pitch, to: 170, dur: 0.07, peak: 0.16, lp: 2600 });
    T(a.ctx, a.out, a, 0.025, { type: 'sawtooth', freq: 165 * a.pitch, to: 118, dur: 0.14, peak: 0.12, bp: 700, q: 4 });
  },

  /** Crumble falls apart: scattered pebble ticks over a falling rumble. */
  debris(a) {
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      N(a.ctx, a.out, a, rand(0, 0.38), { dur: rand(0.02, 0.045), peak: rand(0.4, 0.8) * (1 - i / (n * 1.6)), bp: rand(1400, 3600), q: 3 });
    }
    N(a.ctx, a.out, a, 0, { dur: 0.48, peak: 0.5, attack: 0.03, lp: 380, sweepTo: 140 });
  },

  /** Slider (wood): a woodblock "clack-clack" from the wheels. */
  clack(a) {
    const f = 820 * a.pitch;
    for (const [start, k] of [[0, 1], [0.055, 0.45]]) {
      T(a.ctx, a.out, a, start, { freq: f, to: f * 0.92, dur: 0.07, peak: 0.32 * k, attack: 0.001 });
      T(a.ctx, a.out, a, start, { type: 'triangle', freq: f * 2.03, dur: 0.025, peak: 0.1 * k, attack: 0.001 });
      N(a.ctx, a.out, a, start, { dur: 0.016, peak: 0.14 * k, bp: 1800, q: 2 });
    }
  },

  /** Lift (metal): inharmonic clink + a little chain rattle. */
  clink(a) {
    const d = wet(a, -16);
    const f = 1870 * a.pitch;
    partials(a, 0, f, [[1, 0.16, 0.38], [1.594, 0.1, 0.26], [2.358, 0.07, 0.19], [3.155, 0.04, 0.12]], 1, d);
    for (const s of [0.03, 0.065, 0.1]) N(a.ctx, a.out, a, s, { dur: 0.02, peak: 0.06, hp: 4200 });
  },

  /** Treat: sparkly two-note chime up the yo scale; o.streak steps it higher. */
  treat(a, o) {
    const deg = 10 + Math.min(o.streak || 0, 5);   // D6 E6 G6 A6 B6 D7
    const f = freqOfDegree(deg) * a.pitch;
    const fg = freqOfDegree(deg - 1) * a.pitch;
    const d = wet(a, -12);
    T(a.ctx, d, a, 0, { freq: fg, dur: 0.07, peak: 0.12 });
    T(a.ctx, d, a, 0.055, { freq: f, dur: 0.38, peak: 0.24 });
    T(a.ctx, d, a, 0.055, { freq: f * 2, dur: 0.22, peak: 0.06 });
    T(a.ctx, d, a, 0.055, { freq: f * 4.2, dur: 0.12, peak: 0.025 });
    N(a.ctx, a.out, a, 0.05, { dur: 0.09, peak: 0.035, hp: 8000 });
  },

  /** Crow on screen: "caw-caw". */
  caw(a) {
    birdCall(a, 0, 520 * a.pitch, 0.24, 0.5, [0.9, 1.08, 0.82]);
    birdCall(a, 0.29, 480 * a.pitch, 0.22, 0.42, [0.9, 1.06, 0.8]);
  },

  /** Stomp: a startled squawk + a soft thump + a puff of feathers. */
  stomp(a) {
    birdCall(a, 0.01, 760 * a.pitch, 0.15, 0.26, [1, 1.25, 0.7]);
    T(a.ctx, a.out, a, 0, { freq: 165, to: 48, glide: 0.11, dur: 0.14, peak: 0.55, attack: 0.002 });
    N(a.ctx, a.out, a, 0, { dur: 0.05, peak: 0.25, lp: 550 });
    N(a.ctx, a.out, a, 0.03, { dur: 0.2, peak: 0.08, attack: 0.03, bp: 3000, q: 0.7 });
  },

  /**
   * Roof-tile warning: an alarm pip on every bright phase of the red marker's
   * blink (TILE.BLINK_MS), then the falling whoosh when it drops (TILE.WARN_S).
   */
  tileWarn(a) {
    const period = (2 * TILE.BLINK_MS) / 1000;
    const pips = Math.ceil(TILE.WARN_S / period);
    for (let i = 0; i < pips; i++) {
      const f = i % 2 === 0 ? 1760 : 1568;
      T(a.ctx, a.out, a, i * period, { type: 'square', freq: f, dur: 0.05, peak: 0.22, attack: 0.002, hold: 0.025, lp: 4200 });
    }
    VOICES.tileWhoosh({ ...a, t: a.t + TILE.WARN_S });
  },

  /** A tile drops: a falling whistle-whoosh. */
  tileWhoosh(a) {
    N(a.ctx, a.out, a, 0, { dur: 0.38, peak: 0.45, attack: 0.04, bp: 2800, sweepTo: 520, q: 2 });
    T(a.ctx, a.out, a, 0, { freq: 1450, to: 520, dur: 0.36, peak: 0.1, attack: 0.03 });
  },

  /** Wind chimes nearby: 3-5 tubes, each with a 2.76x tube partial, into the reverb. */
  chimes(a, o) {
    const tubes = [1568, 1760, 1976, 2349, 2637];
    const n = o.hit ? 5 : 3 + Math.floor(Math.random() * 3);
    const order = tubes.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const d = wet(a, -6);
    let s = 0;
    order.forEach((f, i) => {
      const k = (o.hit ? 1 : rand(0.55, 1)) * (1 - i * 0.08);
      const len = rand(0.9, 1.4);
      T(a.ctx, d, a, s, { freq: f * a.pitch, dur: len, peak: 0.15 * k, attack: 0.002 });
      T(a.ctx, d, a, s, { freq: f * 2.76 * a.pitch, dur: len * 0.35, peak: 0.05 * k, attack: 0.002 });
      s += o.hit ? rand(0.02, 0.05) : rand(0.06, 0.16);
    });
  },

  /** Hurt: a yelp ("kai!") over a bump. */
  hurt(a) {
    const f = 620 * a.pitch;
    for (const [type, k] of [['triangle', 1], ['sawtooth', 0.35]]) {
      const { ctx } = a;
      const t = a.t;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.7, t + 0.03);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 1.2;
      const g = silentGain(ctx);
      g.gain.setValueAtTime(EPS, t);
      g.gain.linearRampToValueAtTime(0.5 * k, t + 0.006);
      g.gain.exponentialRampToValueAtTime(EPS, t + 0.26);
      osc.connect(bp);
      bp.connect(g);
      g.connect(a.out);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    T(a.ctx, a.out, a, 0.17, { type: 'triangle', freq: 900 * a.pitch, to: 520, dur: 0.11, peak: 0.16 });
    T(a.ctx, a.out, a, 0, { freq: 200, to: 70, dur: 0.09, peak: 0.32 });
  },

  /** Life lost (fell out): a falling whistle and a downward whoosh. */
  lifeLost(a) {
    T(a.ctx, a.out, a, 0, { freq: 1100 * a.pitch, to: 230, dur: 0.6, peak: 0.15, attack: 0.02 });
    N(a.ctx, a.out, a, 0, { dur: 0.55, peak: 0.24, attack: 0.1, bp: 1800, sweepTo: 300, q: 1.2 });
    T(a.ctx, a.out, a, 0.5, { freq: 140, to: 60, dur: 0.16, peak: 0.25 });
  },

  /** Respawn on the cushion: a short rising whoosh + a soft pop + a little sparkle. */
  respawn(a) {
    N(a.ctx, a.out, a, 0, { dur: 0.2, peak: 0.13, attack: 0.1, bp: 500, sweepTo: 2400, q: 1.4 });
    T(a.ctx, a.out, a, 0.04, { freq: 380 * a.pitch, to: 920, glide: 0.05, dur: 0.1, peak: 0.3, attack: 0.003 });
    N(a.ctx, a.out, a, 0.04, { dur: 0.08, peak: 0.1, lp: 2000 });
    const d = wet(a, -14);
    T(a.ctx, d, a, 0.09, { freq: freqOfDegree(10), dur: 0.2, peak: 0.05 });
    T(a.ctx, d, a, 0.13, { freq: freqOfDegree(13), dur: 0.25, peak: 0.045 });
  },

  /** Zone gate: a blooming gong (D3) under an open koto strum D5-A5-D6-E6. */
  gate(a) {
    const d = wet(a, -5);
    partials(a, 0, 146.83, [
      [1, 0.5, 3.2, 0.8], [1.52, 0.3, 2.6, 0], [2.0, 0.3, 2.4, 1.3], [2.68, 0.18, 1.6, 0],
      [3.36, 0.12, 1.2, 0], [4.24, 0.08, 0.9, 0], [5.4, 0.05, 0.6, 0],
    ], 0.6, d, { bloom: 0.025 });
    N(a.ctx, a.out, a, 0, { dur: 0.07, peak: 0.25, lp: 1500 });
    T(a.ctx, a.out, a, 0, { freq: 82, to: 55, dur: 0.12, peak: 0.3 });
    ['D5', 'A5', 'D6', 'E6'].forEach((n, i) => {
      const m = { D5: 74, A5: 81, D6: 86, E6: 88 }[n];
      pluck(a.ctx, d, a.t + 0.12 + i * 0.04, freqOf(m), 1.3, 0.13, { bright: 0.9 });
    });
  },

  /** Every 50 m: two koto plucks A5 -> D6 and a glint. */
  milestone(a) {
    const d = wet(a, -12);
    pluck(a.ctx, d, a.t, freqOf(81), 0.5, 0.2, { bright: 1 });
    pluck(a.ctx, d, a.t + 0.09, freqOf(86), 0.8, 0.22, { bright: 1 });
    T(a.ctx, d, a, 0.09, { freq: freqOf(98), dur: 0.25, peak: 0.03 });
  },

  /** New best height: a quick run D6 E6 G6 A6 to a ringing D7 with shimmer. */
  newBest(a) {
    const d = wet(a, -10);
    [86, 88, 91, 93].forEach((m, i) => pluck(a.ctx, d, a.t + i * 0.07, freqOf(m), 0.35, 0.14, { bright: 1 }));
    pluck(a.ctx, d, a.t + 0.28, freqOf(98), 1.1, 0.19, { bright: 1 });
    T(a.ctx, d, a, 0.28, { freq: freqOf(98) * 2, dur: 0.6, peak: 0.03 });
    N(a.ctx, a.out, a, 0.28, { dur: 0.3, peak: 0.03, attack: 0.05, hp: 8000 });
  },

  /** Near miss (fx:nearMiss): a quick airy "fwip". */
  nearMiss(a) {
    N(a.ctx, a.out, a, 0, { dur: 0.13, peak: 0.42, attack: 0.025, bp: 1200, sweepTo: 4200, q: 1.5 });
    T(a.ctx, a.out, a, 0, { freq: 900 * a.pitch, to: 1700, dur: 0.1, peak: 0.03, attack: 0.02 });
  },

  /** The flying biscuit lands in the HUD counter (fx:treatArrive): a tiny tick. */
  counter(a) {
    T(a.ctx, a.out, a, 0, { freq: freqOf(100) * a.pitch, dur: 0.04, peak: 0.07, attack: 0.001 });
    T(a.ctx, a.out, a, 0, { type: 'triangle', freq: freqOf(88) * a.pitch, dur: 0.03, peak: 0.05, attack: 0.001 });
  },

  /** A slider (wood knock) or lift (metal tick) turns around on screen (fx:platformTurn). */
  turn(a, o) {
    if (o.type === 'lift') {
      T(a.ctx, a.out, a, 0, { freq: 2210 * a.pitch, dur: 0.08, peak: 0.035, attack: 0.001 });
      T(a.ctx, a.out, a, 0, { freq: 3480 * a.pitch, dur: 0.05, peak: 0.02, attack: 0.001 });
    } else {
      T(a.ctx, a.out, a, 0, { freq: 540 * a.pitch, to: 470, dur: 0.05, peak: 0.08, attack: 0.001 });
      N(a.ctx, a.out, a, 0, { dur: 0.012, peak: 0.04, bp: 1500, q: 2 });
    }
  },

  /** A firework bursts over the roof (fx:firework): a soft distant boom + crackle, under the bell. */
  firework(a) {
    const d = wet(a, -10);
    N(a.ctx, d, a, 0, { dur: 0.4, peak: 0.3, attack: 0.004, lp: 900, sweepTo: 180 });
    T(a.ctx, a.out, a, 0, { freq: 72 * a.pitch, to: 40, dur: 0.22, peak: 0.18 });
    const n = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      N(a.ctx, d, a, rand(0.12, 0.7), { dur: rand(0.008, 0.016), peak: rand(0.08, 0.2), hp: 3000, attack: 0.001 });
    }
  },

  /** A Results star pops in (fx:resultsStar): earned stars climb A5 D6 A6; an empty one just ticks. */
  star(a, o) {
    if (!o.earned) {
      T(a.ctx, a.out, a, 0, { freq: 300, to: 240, dur: 0.07, peak: 0.1 });
      return;
    }
    const deg = [8, 10, 13][Math.max(0, Math.min(2, o.index || 0))];
    const d = wet(a, -10);
    pluck(a.ctx, d, a.t, freqOfDegree(deg), 0.7, 0.22, { bright: 1.1 });
    T(a.ctx, d, a, 0, { freq: freqOfDegree(deg) * 2, dur: 0.3, peak: 0.04 });
    N(a.ctx, a.out, a, 0, { dur: 0.12, peak: 0.03, hp: 8000 });
  },

  /** The Results score count-up finishes (fx:scoreTally done): a bright double pluck. */
  tally(a) {
    const d = wet(a, -12);
    pluck(a.ctx, d, a.t, freqOf(86), 0.6, 0.18, { bright: 1 });
    pluck(a.ctx, d, a.t, freqOf(93), 0.6, 0.14, { bright: 1 });
  },

  pause(a) {
    T(a.ctx, a.out, a, 0, { type: 'square', freq: freqOf(81), dur: 0.06, peak: 0.2, lp: 3000 });
    T(a.ctx, a.out, a, 0.07, { type: 'square', freq: freqOf(74), dur: 0.09, peak: 0.2, lp: 3000 });
  },

  unpause(a) {
    T(a.ctx, a.out, a, 0, { type: 'square', freq: freqOf(74), dur: 0.06, peak: 0.2, lp: 3000 });
    T(a.ctx, a.out, a, 0.07, { type: 'square', freq: freqOf(81), dur: 0.09, peak: 0.2, lp: 3000 });
  },

  /** UI select (start, retry, unmute): a bright koto double pluck. */
  select(a) {
    pluck(a.ctx, a.out, a.t, freqOf(86), 0.25, 0.2, { bright: 1.1 });
    pluck(a.ctx, a.out, a.t + 0.05, freqOf(93), 0.3, 0.16, { bright: 1.1 });
  },

  /**
   * The finish: a temple bell in D. A wooden striker thud and a bright strike
   * transient, then inharmonic partials over a D3 hum, each with its own
   * exponential decay (high partials die first) and slow beating pairs on the
   * hum, prime and nominal for the shimmer. A long reverb send carries the tail.
   */
  bell(a) {
    const d = wet(a, -4);
    const f = 293.66;   // prime = D4, hum = D3
    partials(a, 0.004, f, [
      // ratio, amp, decay (s), beat (Hz)
      [0.5, 0.42, 7.5, 0.55],
      [1.0, 0.5, 6.0, 0.9],
      [1.47, 0.2, 4.2, 0],
      [2.0, 0.42, 4.6, 1.4],
      [2.43, 0.14, 3.0, 0],
      [2.76, 0.16, 2.6, 2.1],
      [3.4, 0.1, 1.9, 0],
      [4.12, 0.07, 1.3, 0],
      [5.22, 0.05, 0.8, 0],
      [6.55, 0.035, 0.5, 0],
      [8.9, 0.02, 0.25, 0],
    ], 0.55, d, { bloom: 0.0015 });
    // strike: mallet thud + bright clang transient
    T(a.ctx, a.out, a, 0, { freq: 110, to: 60, dur: 0.12, peak: 0.3, attack: 0.002 });
    N(a.ctx, a.out, a, 0, { dur: 0.05, peak: 0.22, bp: 3000, q: 0.8 });
    T(a.ctx, d, a, 0.002, { freq: f * 11.3, dur: 0.07, peak: 0.03 });
    T(a.ctx, d, a, 0.002, { freq: f * 13.8, dur: 0.05, peak: 0.02 });
  },
};

// Per-sound variation (pitch +-, volume +-dB) and minimum gap between plays (ms)
const VARY_DEFAULT = { pitch: AUDIO.PITCH_JITTER, db: AUDIO.VOL_JITTER_DB };
const VARY = {
  treat: { pitch: 0.004, db: 1 },
  milestone: { pitch: 0, db: 0.5 },
  newBest: { pitch: 0, db: 0 },
  gate: { pitch: 0, db: 0 },
  bell: { pitch: 0, db: 0 },
  select: { pitch: 0.01, db: 0.5 },
  pause: { pitch: 0, db: 0 },
  unpause: { pitch: 0, db: 0 },
  tileWarn: { pitch: 0, db: 0.5 },
  star: { pitch: 0, db: 0.5 },
  tally: { pitch: 0, db: 0 },
  counter: { pitch: 0.02, db: 1 },
};

const lastAt = {};

/** World x (0..270) -> stereo pan (-max..+max). */
export function panOfX(x) {
  if (x === undefined || x === null) return 0;
  return ((x / WORLD.WRAP_W) * 2 - 1) * AUDIO.SFX_PAN_MAX;
}

/**
 * @param {string} name a key of VOICES
 * @param {{gain?: number, pan?: number, delay?: number}} [o] plus voice options (zone, streak, hit)
 * @returns {{group: GainNode, name: string}|null}
 */
export function playSfx(name, o = {}) {
  const voice = VOICES[name];
  if (!voice) return null;
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
  const vol = dbToGain(rand(-v.db, v.db)) * (o.gain ?? 1);
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
