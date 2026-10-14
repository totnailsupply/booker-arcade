// =============================================================================
// Sound effects for Backyard Brawl, all synthesized (Web Audio, no files).
//
//   playSfx(name, o) -> true | false
//     Plays VOICES[name] on its bus (audioConfig SFX_DEFS: sfx | ui | sting)
//     with a small random pitch / volume variation and an optional stereo pan.
//     Returns false (silently) when the context isn't running, audio is muted,
//     or a voice limit says no:
//       - gapMs: minimum time between two starts of this sound
//       - max:   voices of this sound alive at once
//       - group: shared cap (every enemy death pop together)
//       - prio 0 sounds skip once GLOBAL_SOFT_CAP voices are alive; nothing
//         plays past GLOBAL_HARD_CAP.
//     Every skip is counted in audioManager.stats (audio-check reads them).
//
// VOICES[name](a, o) builds the sound at time a.t on a.out and returns its
// length in seconds (a = { ctx, out, noise, t, pitch }). They never touch the
// AudioManager, so offline.js can render them into an OfflineAudioContext.
//
// Loops (vacDrone) are started / stopped by the bridge with startLoop/stopLoop.
// =============================================================================

import { AUDIO, SFX_DEFS, SFX_GROUPS } from './audioConfig.js';
import { audioManager } from './AudioManager.js';
import { dbToGain, freqOf, tone, noise, silentGain, EPS } from './synth.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// --- helpers (pitch-scaled) ----------------------------------------------------------

function T(a, start, o) {
  const p = a.pitch || 1;
  const s = { ...o, freq: o.freq * p };
  if (o.to) s.to = o.to * p;
  return tone(a.ctx, o.dest || a.out, a.t + start, s);
}

function N(a, start, o) {
  const p = a.pitch || 1;
  const s = { ...o };
  for (const k of ['bp', 'lp', 'hp', 'sweepTo']) if (s[k]) s[k] = s[k] * p;
  return noise(a.ctx, a.noise, o.dest || a.out, a.t + start, s);
}

const M = freqOf;

/**
 * Synthesized dog voice: a sawtooth whose pitch jumps up then drops, through
 * two formant band-passes, plus a breathy onset. contour = [start, peak, end]
 * ratios of `pitch`.
 */
function dogVoice(a, start, pitch, { dur = 0.16, peak = 0.5, contour = [0.8, 1.25, 0.55], f1 = 900, f2 = 1700, breath = 0.12 } = {}) {
  const { ctx } = a;
  const t = a.t + start;
  const f = pitch * (a.pitch || 1);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * contour[0], t);
  osc.frequency.linearRampToValueAtTime(f * contour[1], t + Math.min(0.03, dur * 0.25));
  osc.frequency.exponentialRampToValueAtTime(f * contour[2], t + dur);
  const env = silentGain(ctx);
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.012);
  env.gain.exponentialRampToValueAtTime(peak * 0.4, t + dur * 0.45);
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);
  const b1 = ctx.createBiquadFilter();
  b1.type = 'bandpass';
  b1.Q.value = 3;
  b1.frequency.setValueAtTime(f1, t);
  b1.frequency.exponentialRampToValueAtTime(f1 * 0.55, t + dur);
  const b2 = ctx.createBiquadFilter();
  b2.type = 'bandpass';
  b2.Q.value = 5;
  b2.frequency.value = f2;
  const b2g = ctx.createGain();
  b2g.gain.value = 0.5;
  osc.connect(b1);
  osc.connect(b2);
  b2.connect(b2g);
  b1.connect(env);
  b2g.connect(env);
  env.connect(a.out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
  if (breath > 0) N(a, start, { dur: 0.05, peak: breath, bp: 1400, q: 1.5, attack: 0.003 });
}

/**
 * Harsh bird call: sawtooth with a rough 70 Hz amplitude wobble through two
 * formant band-passes (from soba-tower). Crow caw.
 */
function birdCall(a, start, f, dur, peak, contour) {
  const { ctx } = a;
  const t = a.t + start;
  f *= a.pitch || 1;
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
  for (const o of [osc, lfo]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Growl / roar: sawtooth through a lowpass with a rough AM wobble. */
function growl(a, start, f, dur, peak, { to = null, rate = 32, lp = 900, attack = 0.08 } = {}) {
  const { ctx } = a;
  const t = a.t + start;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f, t);
  if (to) {
    osc.frequency.linearRampToValueAtTime(f * 1.35, t + dur * 0.3);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  }
  const rough = ctx.createGain();
  rough.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth);
  depth.connect(rough.gain);
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = lp;
  lpf.Q.value = 2;
  osc.connect(rough);
  rough.connect(lpf);
  const env = silentGain(ctx);
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(peak, t + attack);
  env.gain.setValueAtTime(peak, t + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);
  lpf.connect(env);
  env.connect(a.out);
  for (const o of [osc, lfo]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Cartoon spring "boing": triangle sliding up with a decaying wobble. */
function boing(a, start, f0, f1, dur, peak, wobHz = 22) {
  const { ctx } = a;
  const t = a.t + start;
  const p = a.pitch || 1;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f0 * p, t);
  osc.frequency.exponentialRampToValueAtTime(f1 * p, t + dur * 0.75);
  const wob = ctx.createOscillator();
  wob.frequency.value = wobHz;
  const wobDepth = ctx.createGain();
  wobDepth.gain.setValueAtTime(f0 * 0.35, t);
  wobDepth.gain.exponentialRampToValueAtTime(2, t + dur);
  wob.connect(wobDepth);
  wobDepth.connect(osc.frequency);
  const g = silentGain(ctx);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  osc.connect(g);
  g.connect(a.out);
  for (const o of [osc, wob]) {
    o.start(t);
    o.stop(t + dur + 0.03);
  }
}

/** Kitten / cat mew: triangle + a bit of pulse through a formant. */
function mew(a, start, f, dur, peak) {
  T(a, start, { type: 'triangle', freq: f * 0.85, to: f * 1.15, glide: dur * 0.35, dur, peak, attack: 0.02 });
  T(a, start + dur * 0.35, { type: 'pulse25', freq: f * 1.15, to: f * 0.7, glide: dur * 0.65, dur: dur * 0.65, peak: peak * 0.35, lp: 2400 });
}

// =============================================================================
// Voices. Peaks are linear, before the bus gain. Each returns its length (s).
// =============================================================================

export const VOICES = {
  // --- weapons ------------------------------------------------------------------------

  /** Bark weapon: a small "woof" with a square blip on top. */
  shotBark(a) {
    dogVoice(a, 0, 430, { dur: 0.12, peak: 0.24, breath: 0.05 });
    T(a, 0.005, { type: 'square', freq: 900, to: 1350, dur: 0.05, peak: 0.035, lp: 4000, attack: 0.002 });
    return 0.14;
  },

  /** Tennis ball launch: a springy boing plus a felt "pock". */
  shotBall(a) {
    boing(a, 0, 260, 640, 0.17, 0.16);
    N(a, 0, { dur: 0.03, peak: 0.12, bp: 1800, q: 1.2, attack: 0.001 });
    return 0.18;
  },

  /** Ball ricochet: a short hollow pock. */
  ballBounce(a) {
    T(a, 0, { freq: 760, to: 420, dur: 0.06, peak: 0.13, attack: 0.002 });
    N(a, 0, { dur: 0.02, peak: 0.07, bp: 2400, q: 2, attack: 0.001 });
    return 0.07;
  },

  /** Bone boomerang: an airy whoosh that swells and passes. */
  shotBone(a) {
    N(a, 0, { dur: 0.24, peak: 0.13, bp: 600, sweepTo: 2600, q: 1.6, attack: 0.08 });
    T(a, 0, { type: 'triangle', freq: 220, to: 330, dur: 0.2, peak: 0.05, attack: 0.06 });
    return 0.25;
  },

  /** Frisbee orbit: a soft whirring "fwip" (o.n = disc count raises the pitch). */
  frisbeeWhirr(a, o = {}) {
    const k = 1 + 0.08 * ((o.n || 1) - 1);
    N(a, 0, { dur: 0.13, peak: 0.07, bp: 1500 * k, sweepTo: 2300 * k, q: 3, attack: 0.04 });
    T(a, 0, { freq: 520 * k, to: 760 * k, dur: 0.1, peak: 0.022, attack: 0.03 });
    return 0.14;
  },

  /** Squeaky toy shockwave: "squee-eak" plus a soft low thump. */
  shotSqueak(a) {
    T(a, 0, { type: 'triangle', freq: 1150, to: 1750, glide: 0.07, dur: 0.1, peak: 0.13, vib: { rate: 38, depth: 0.04 }, attack: 0.006 });
    T(a, 0.09, { type: 'triangle', freq: 1650, to: 1250, dur: 0.11, peak: 0.11, vib: { rate: 34, depth: 0.05 } });
    N(a, 0, { dur: 0.06, peak: 0.04, bp: 3500, q: 4, attack: 0.004 });
    T(a, 0, { freq: 130, to: 60, dur: 0.14, peak: 0.2, attack: 0.002 });
    return 0.21;
  },

  /** Zoomies paw patter: a tiny pat (o.side alternates left / right paw pitch). */
  zoomiesPatter(a, o = {}) {
    const f = o.side > 0 ? 1 : 0.86;
    N(a, 0, { dur: 0.03, peak: 0.07, lp: 1300 * f, attack: 0.001 });
    T(a, 0, { freq: 330 * f, to: 220 * f, dur: 0.035, peak: 0.06, attack: 0.001 });
    return 0.04;
  },

  // --- hits and deaths --------------------------------------------------------------

  /** Hit tick. o.k scales the pitch (small enemies tick higher). */
  hit(a, o = {}) {
    const k = o.k || 1;
    T(a, 0, { type: 'square', freq: 1100 * k, to: 700 * k, dur: 0.035, peak: 0.05, lp: 4500, attack: 0.001 });
    N(a, 0, { dur: 0.025, peak: 0.05, bp: 2600 * k, q: 1.5, attack: 0.001 });
    return 0.04;
  },

  /** Crit: a brighter double tick. */
  hitCrit(a, o = {}) {
    const k = o.k || 1;
    T(a, 0, { type: 'pulse25', freq: 1700 * k, to: 2300 * k, dur: 0.05, peak: 0.06, lp: 6000, attack: 0.001 });
    T(a, 0.03, { type: 'square', freq: 2400 * k, dur: 0.03, peak: 0.035, lp: 6000, attack: 0.001 });
    N(a, 0, { dur: 0.03, peak: 0.06, bp: 3500, q: 1.5, attack: 0.001 });
    return 0.07;
  },

  /** Boss hit: a dull thud (Big Tom) or a metal clank (Robo-Vac). */
  hitBoss(a, o = {}) {
    if (o.vac) {
      T(a, 0, { type: 'square', freq: 587, dur: 0.09, peak: 0.04, lp: 5000, attack: 0.001 });
      T(a, 0, { type: 'square', freq: 846, dur: 0.07, peak: 0.03, lp: 5000, attack: 0.001 });
      N(a, 0, { dur: 0.08, peak: 0.1, bp: 3200, q: 6, attack: 0.001 });
    } else {
      T(a, 0, { freq: 170, to: 80, dur: 0.08, peak: 0.22, attack: 0.002 });
      N(a, 0, { dur: 0.05, peak: 0.08, lp: 1200, attack: 0.001 });
    }
    return 0.1;
  },

  /** Cat: a quick hiss, then a falling "meow" blip and a pop. */
  deathCat(a) {
    N(a, 0, { dur: 0.07, peak: 0.07, hp: 3200, q: 0.7, attack: 0.005 });
    mew(a, 0.05, 820, 0.15, 0.13);
    T(a, 0, { freq: 600, to: 150, dur: 0.06, peak: 0.12, attack: 0.002 });
    return 0.21;
  },

  /** Squirrel: a rapid chitter (4 high blips) and a tiny pop. */
  deathSquirrel(a) {
    [0, 0.032, 0.064, 0.1].forEach((s, i) => {
      T(a, s, { type: 'pulse25', freq: 2200 + (i % 2) * 450, to: 1800, dur: 0.028, peak: 0.07, lp: 6000, attack: 0.001 });
    });
    T(a, 0, { freq: 900, to: 300, dur: 0.05, peak: 0.1, attack: 0.002 });
    return 0.14;
  },

  /** Crow: a short harsh caw and a feather puff. */
  deathCrow(a) {
    birdCall(a, 0, 620, 0.18, 0.2, [1, 1.12, 0.62]);
    N(a, 0.02, { dur: 0.12, peak: 0.05, bp: 3000, sweepTo: 1200, q: 1, attack: 0.01 });
    return 0.2;
  },

  /** Raccoon: a heavy thud and a little "oof". */
  deathRaccoon(a) {
    T(a, 0, { freq: 140, to: 45, dur: 0.2, peak: 0.34, attack: 0.002 });
    N(a, 0, { dur: 0.1, peak: 0.12, lp: 700, sweepTo: 200, attack: 0.002 });
    T(a, 0.02, { type: 'square', freq: 220, to: 130, dur: 0.1, peak: 0.05, lp: 900 });
    return 0.21;
  },

  /** Skunk: a soft stinky puff and a pop. */
  deathSkunk(a) {
    N(a, 0, { dur: 0.3, peak: 0.12, bp: 900, sweepTo: 280, q: 1.2, attack: 0.015 });
    T(a, 0, { freq: 520, to: 160, dur: 0.07, peak: 0.12, attack: 0.002 });
    T(a, 0.04, { type: 'triangle', freq: 240, to: 180, dur: 0.18, peak: 0.04, vib: { rate: 9, depth: 0.05 } });
    return 0.31;
  },

  /** Kitten (Big Tom's summons): a tiny mew. */
  deathKitten(a) {
    mew(a, 0, 1250, 0.1, 0.09);
    T(a, 0, { freq: 800, to: 300, dur: 0.04, peak: 0.08, attack: 0.002 });
    return 0.11;
  },

  /** Elite: a bigger boom with a golden two-note sparkle (layered over the type's death). */
  deathElite(a) {
    T(a, 0, { freq: 220, to: 50, dur: 0.3, peak: 0.3, attack: 0.002 });
    N(a, 0, { dur: 0.25, peak: 0.13, lp: 1800, sweepTo: 200, attack: 0.002 });
    T(a, 0.06, { type: 'pulse25', freq: M(88), dur: 0.08, peak: 0.05, lp: 6000 });
    T(a, 0.12, { type: 'pulse25', freq: M(95), dur: 0.2, peak: 0.05, lp: 6000 });
    T(a, 0.12, { freq: M(107), dur: 0.22, peak: 0.025 });
    return 0.34;
  },

  /** Wave-end pop: a light bubble pop. */
  pop(a) {
    T(a, 0, { freq: 480, to: 1150, dur: 0.05, peak: 0.08, attack: 0.002 });
    return 0.06;
  },

  // --- enemies and bosses -------------------------------------------------------------

  /** Crow starts a swoop: a distant caw. */
  crowSwoop(a) {
    birdCall(a, 0, 700, 0.16, 0.09, [1, 1.1, 0.75]);
    return 0.17;
  },

  /** Skunk lobs a stink cloud: a soft "pfft". */
  stinkLob(a) {
    N(a, 0, { dur: 0.12, peak: 0.07, lp: 900, sweepTo: 400, attack: 0.01 });
    T(a, 0, { freq: 210, to: 120, dur: 0.1, peak: 0.06 });
    return 0.13;
  },

  /** Big Tom arrives: a big cat roar (growl + hiss). */
  bossIntroCat(a) {
    growl(a, 0, 120, 1.0, 0.32, { to: 70, rate: 31, lp: 1000, attack: 0.08 });
    growl(a, 0.02, 181, 0.9, 0.16, { to: 105, rate: 27, lp: 1400, attack: 0.1 });
    N(a, 0, { dur: 0.9, peak: 0.08, bp: 2500, sweepTo: 1200, q: 0.8, attack: 0.1 });
    T(a, 0, { freq: 60, to: 40, dur: 0.6, peak: 0.25, attack: 0.03 });
    return 1.05;
  },

  /** Robo-Vac 9000 powers up: a motor hum and a rising vacuum whine. */
  bossIntroVac(a) {
    T(a, 0, { type: 'sawtooth', freq: 70, to: 140, dur: 1.2, peak: 0.12, lp: 600, attack: 0.15 });
    T(a, 0, { type: 'sawtooth', freq: 180, to: 1100, dur: 1.2, peak: 0.07, bp: 1500, q: 2, attack: 0.3 });
    N(a, 0, { dur: 1.2, peak: 0.14, bp: 400, sweepTo: 4500, q: 1.2, attack: 0.4 });
    [0.0, 0.18].forEach(s => T(a, s, { type: 'square', freq: 1320, dur: 0.08, peak: 0.03, lp: 5000 }));
    return 1.25;
  },

  /** Big Tom's wind-up: three warning beeps over a rising tone (0.7 s). */
  chargeWarn(a) {
    [0, 0.2, 0.4].forEach((s, i) => T(a, s, { type: 'square', freq: i === 2 ? 1320 : 880, dur: 0.1, peak: 0.07, lp: 4000, attack: 0.002 }));
    T(a, 0, { type: 'triangle', freq: 260, to: 820, dur: 0.66, peak: 0.12, attack: 0.05, curve: 'lin' });
    growl(a, 0.1, 110, 0.55, 0.12, { rate: 28, lp: 800, attack: 0.2 });
    return 0.7;
  },

  /** Big Tom charges: a roaring whoosh. */
  chargeGo(a) {
    N(a, 0, { dur: 0.35, peak: 0.16, bp: 300, sweepTo: 2200, q: 1.3, attack: 0.03 });
    growl(a, 0, 150, 0.3, 0.14, { to: 90, rate: 34, lp: 1100, attack: 0.02 });
    return 0.36;
  },

  /** Big Tom summons kittens: two little mews. */
  summon(a) {
    mew(a, 0, 1150, 0.12, 0.09);
    mew(a, 0.13, 1400, 0.12, 0.08);
    return 0.27;
  },

  /** Robo-Vac phase 2: a two-tone alarm and a motor rev. */
  vacPhase2(a) {
    for (let i = 0; i < 4; i++) T(a, i * 0.14, { type: 'square', freq: i % 2 ? 660 : 880, dur: 0.12, peak: 0.06, lp: 3500, attack: 0.003 });
    T(a, 0, { type: 'sawtooth', freq: 90, to: 220, dur: 0.6, peak: 0.12, lp: 900, attack: 0.05 });
    N(a, 0.1, { dur: 0.5, peak: 0.1, bp: 800, sweepTo: 3500, q: 1, attack: 0.2 });
    return 0.62;
  },

  /** Robo-Vac fires a dust-ball ring: a dusty puff burst. */
  dustRing(a) {
    N(a, 0, { dur: 0.25, peak: 0.13, bp: 1600, sweepTo: 400, q: 1, attack: 0.004 });
    T(a, 0, { freq: 260, to: 90, dur: 0.12, peak: 0.16, attack: 0.002 });
    return 0.26;
  },

  /** Robo-Vac bumps the fence: a plastic clunk. */
  vacBounce(a) {
    T(a, 0, { type: 'square', freq: 180, to: 120, dur: 0.08, peak: 0.07, lp: 800, attack: 0.001 });
    N(a, 0, { dur: 0.05, peak: 0.08, bp: 1200, q: 2, attack: 0.001 });
    return 0.09;
  },

  /** Boss defeated: a big boom, a falling whistle and a sparkle shower. */
  bossDeath(a) {
    T(a, 0, { freq: 95, to: 30, dur: 1.2, peak: 0.45, attack: 0.003 });
    N(a, 0, { dur: 1.1, peak: 0.22, lp: 2200, sweepTo: 120, attack: 0.003 });
    N(a, 0, { dur: 0.06, peak: 0.2, bp: 2500, q: 0.8, attack: 0.001 });
    T(a, 0.02, { type: 'square', freq: 520, to: 70, dur: 0.6, peak: 0.07, lp: 2000 });
    for (let i = 0; i < 8; i++) {
      T(a, 0.35 + i * 0.07, { freq: 2200 + Math.random() * 2600, dur: 0.07, peak: 0.03 });
    }
    return 1.25;
  },

  // --- pickups ---------------------------------------------------------------------

  /** Kibble: a short blip; o.step (0..) climbs a major pentatonic on fast chains. */
  kibble(a, o = {}) {
    const SCALE = [0, 2, 4, 7, 9];
    const s = Math.max(0, o.step || 0);
    const m = 79 + 12 * Math.floor(s / 5) + SCALE[s % 5];   // from G5 up
    T(a, 0, { type: 'pulse25', freq: M(m), dur: 0.05, peak: 0.06, lp: 6000, attack: 0.002 });
    T(a, 0, { freq: M(m + 12), dur: 0.06, peak: 0.025 });
    return 0.07;
  },

  /** Heart: a warm rising two-note with a soft "ba-dum". */
  heart(a) {
    T(a, 0, { freq: 90, to: 60, dur: 0.08, peak: 0.2 });
    T(a, 0.11, { freq: 90, to: 60, dur: 0.08, peak: 0.14 });
    T(a, 0.02, { type: 'triangle', freq: M(76), dur: 0.1, peak: 0.12 });
    T(a, 0.12, { type: 'triangle', freq: M(84), dur: 0.25, peak: 0.12 });
    T(a, 0.12, { freq: M(88), dur: 0.25, peak: 0.04 });
    return 0.38;
  },

  /** Magnet: a sucking whoosh that pulls up into a ping. */
  magnet(a) {
    N(a, 0, { dur: 0.5, peak: 0.13, bp: 400, sweepTo: 4200, q: 1.5, attack: 0.3 });
    T(a, 0, { type: 'triangle', freq: 300, to: 1200, dur: 0.48, peak: 0.08, vib: { rate: 12, depth: 0.04 }, attack: 0.2 });
    T(a, 0.46, { freq: M(96), dur: 0.2, peak: 0.05 });
    return 0.67;
  },

  /** Golden Bone: a bright bell chime with a sparkle. */
  goldenBone(a) {
    [[1, 0.13, 0.9], [2.0, 0.07, 0.6], [2.76, 0.05, 0.4], [5.4, 0.025, 0.25]].forEach(([r, pk, d]) => {
      T(a, 0, { freq: M(84) * r, dur: d, peak: pk, attack: 0.002 });
    });
    T(a, 0.09, { type: 'pulse25', freq: M(91), dur: 0.14, peak: 0.05, lp: 6000 });
    T(a, 0.16, { type: 'pulse25', freq: M(96), dur: 0.3, peak: 0.05, lp: 6000 });
    for (let i = 0; i < 4; i++) T(a, 0.2 + i * 0.06, { freq: 3000 + Math.random() * 2500, dur: 0.05, peak: 0.02 });
    return 0.9;
  },

  // --- player ----------------------------------------------------------------------

  /** Booker gets hurt: a sharp "yip" and a thump. */
  hurt(a) {
    dogVoice(a, 0, 760, { dur: 0.15, peak: 0.42, contour: [1.0, 1.4, 0.7], f1: 1300, f2: 2300, breath: 0.06 });
    T(a, 0, { freq: 180, to: 70, dur: 0.1, peak: 0.25, attack: 0.002 });
    return 0.16;
  },

  /** Dash: a fast rising zoom. */
  dash(a) {
    N(a, 0, { dur: 0.2, peak: 0.2, bp: 450, sweepTo: 5000, q: 1.5, attack: 0.012 });
    T(a, 0, { type: 'sawtooth', freq: 170, to: 700, dur: 0.17, peak: 0.07, lp: 2000 });
    return 0.21;
  },

  /** Low-HP heartbeat: lub-dub. */
  heartbeat(a) {
    T(a, 0, { freq: 72, to: 48, dur: 0.12, peak: 0.42, attack: 0.008 });
    T(a, 0.17, { freq: 66, to: 44, dur: 0.12, peak: 0.3, attack: 0.008 });
    N(a, 0, { dur: 0.05, peak: 0.04, lp: 300, attack: 0.005 });
    return 0.3;
  },

  /** Booker knocked out: a falling whimper and a bonk. */
  playerDeath(a) {
    T(a, 0, { freq: 420, to: 90, dur: 0.16, peak: 0.36, attack: 0.002 });
    N(a, 0, { dur: 0.05, peak: 0.12, bp: 1800, q: 2, attack: 0.001 });
    dogVoice(a, 0.12, 650, { dur: 0.5, peak: 0.3, contour: [1.1, 1.2, 0.45], f1: 1100, f2: 2000, breath: 0 });
    return 0.65;
  },

  // --- waves and level-up ------------------------------------------------------------

  /** Wave start: a brassy "ta-daa" horn (A3 -> E4). */
  waveHorn(a) {
    const horn = (s, m, d, pk) => {
      for (const dt of [-8, 8]) T(a, s, { type: 'sawtooth', freq: M(m), detune: dt, dur: d, peak: pk, lp: 700, sweepTo: 2600, attack: 0.03, hold: d * 0.5 });
    };
    horn(0, 57, 0.16, 0.06);
    horn(0.16, 64, 0.5, 0.07);
    T(a, 0.16, { type: 'triangle', freq: M(45), dur: 0.5, peak: 0.16 });
    return 0.7;
  },

  /** Boss wave start: a low ominous tritone horn. */
  bossHorn(a) {
    for (const [m, pk] of [[48, 0.07], [54, 0.05], [36, 0.06]]) {
      for (const dt of [-10, 10]) T(a, 0, { type: 'sawtooth', freq: M(m), detune: dt, dur: 1.1, peak: pk, lp: 400, sweepTo: 1400, attack: 0.15, hold: 0.5 });
    }
    T(a, 0, { freq: 55, to: 40, dur: 0.6, peak: 0.25, attack: 0.01 });
    return 1.2;
  },

  /** Level up: a fast bright arpeggio. */
  levelUp(a) {
    [72, 76, 79, 84, 88].forEach((m, i) => {
      T(a, i * 0.05, { type: 'pulse25', freq: M(m), dur: i === 4 ? 0.3 : 0.07, peak: 0.07, lp: 6000 });
    });
    T(a, 0.2, { freq: M(100), dur: 0.3, peak: 0.03 });
    N(a, 0, { dur: 0.3, peak: 0.04, bp: 2500, sweepTo: 7000, q: 1, attack: 0.15 });
    return 0.52;
  },

  // --- stingers (sting bus) ----------------------------------------------------------

  /** Wave clear: C major run into a held chord with a snare roll (about 1 s). */
  waveClear(a) {
    [67, 72, 76, 79].forEach((m, i) => T(a, i * 0.07, { type: 'pulse25', freq: M(m), dur: 0.08, peak: 0.12, lp: 5000 }));
    const e = 0.28;
    [72, 76, 79, 84].forEach(m => T(a, e, { type: 'square', freq: M(m), dur: 0.7, peak: 0.045, lp: 3500, hold: 0.25 }));
    T(a, e, { type: 'triangle', freq: M(48), dur: 0.7, peak: 0.3, hold: 0.25 });
    for (let i = 0; i < 4; i++) N(a, i * 0.07, { dur: 0.06, peak: 0.06 + i * 0.02, bp: 1800, q: 0.8, attack: 0.002 });
    N(a, e, { dur: 0.6, peak: 0.07, hp: 5500, q: 0.7, attack: 0.003 });
    return 1.0;
  },

  /** Victory fanfare: "ta-ta-ta-taaa", a climb, a big C chord and Booker's double bark (about 2.6 s). */
  victory(a) {
    const lead = [[67, 0, 0.1], [67, 0.12, 0.1], [67, 0.24, 0.1], [72, 0.36, 0.48], [70, 0.9, 0.13], [72, 1.05, 0.13], [74, 1.2, 0.13], [76, 1.35, 0.9]];
    lead.forEach(([m, s, d]) => {
      T(a, s, { type: 'pulse25', freq: M(m), dur: d, peak: 0.13, lp: 4500, hold: d * 0.5 });
      T(a, s, { type: 'square', freq: M(m - 12), dur: d, peak: 0.04, lp: 2500, hold: d * 0.5 });
    });
    [[48, 0, 0.34], [43, 0.36, 0.5], [46, 0.9, 0.4], [48, 1.35, 0.95]].forEach(([m, s, d]) => T(a, s, { type: 'triangle', freq: M(m), dur: d, peak: 0.3, hold: d * 0.4 }));
    [72, 79, 84].forEach(m => T(a, 1.35, { type: 'square', freq: M(m), dur: 0.95, peak: 0.035, lp: 3000, hold: 0.4 }));
    for (let i = 0; i < 6; i++) N(a, 1.1 + i * 0.04, { dur: 0.04, peak: 0.05 + i * 0.012, bp: 1800, q: 0.8, attack: 0.002 });
    N(a, 1.35, { dur: 1.0, peak: 0.09, hp: 5000, q: 0.7, attack: 0.003 });
    for (let i = 0; i < 8; i++) T(a, 1.4 + i * 0.07, { freq: 2400 + Math.random() * 3000, dur: 0.07, peak: 0.022 });
    dogVoice(a, 2.0, 320, { peak: 0.4 });
    dogVoice(a, 2.22, 360, { peak: 0.4 });
    return 2.45;
  },

  /** Game over: a gentle falling minor line that lands on A with a sigh (about 1.6 s). */
  gameOver(a) {
    [[76, 0, 0.15], [74, 0.16, 0.15], [72, 0.32, 0.15], [71, 0.48, 0.2]].forEach(([m, s, d]) => {
      T(a, s, { type: 'triangle', freq: M(m), dur: d, peak: 0.2 });
      T(a, s, { type: 'pulse25', freq: M(m), dur: d, peak: 0.035, lp: 2000 });
    });
    T(a, 0.7, { type: 'triangle', freq: M(69), to: M(68), glide: 0.9, dur: 0.95, peak: 0.2, hold: 0.3, vib: { rate: 5, depth: 0.012 } });
    T(a, 0, { type: 'triangle', freq: M(45), dur: 0.6, peak: 0.24 });
    T(a, 0.7, { type: 'triangle', freq: M(45), dur: 0.95, peak: 0.26, hold: 0.3 });
    [60, 64].forEach(m => T(a, 0.7, { type: 'square', freq: M(m), dur: 0.9, peak: 0.022, lp: 1500, hold: 0.3 }));
    return 1.7;
  },

  // --- cards and menus (ui bus) --------------------------------------------------------

  cardMove(a) {
    T(a, 0, { type: 'triangle', freq: 1250, dur: 0.035, peak: 0.1, attack: 0.002 });
    N(a, 0, { dur: 0.02, peak: 0.03, bp: 4000, q: 2, attack: 0.001 });
    return 0.04;
  },

  /** Card picked: a card flip and a bright confirm. */
  cardSelect(a) {
    N(a, 0, { dur: 0.06, peak: 0.08, bp: 2500, sweepTo: 5000, q: 1.5, attack: 0.004 });
    T(a, 0.03, { type: 'square', freq: M(84), dur: 0.06, peak: 0.08, lp: 5000 });
    T(a, 0.09, { type: 'square', freq: M(91), dur: 0.16, peak: 0.08, lp: 5000 });
    T(a, 0.09, { freq: M(103), dur: 0.16, peak: 0.03 });
    return 0.26;
  },

  /** Rare card: a sparkle run on top of the select. */
  cardRare(a) {
    [96, 100, 103, 108].forEach((m, i) => T(a, 0.12 + i * 0.05, { freq: M(m), dur: 0.12, peak: 0.04 }));
    T(a, 0.12, { type: 'triangle', freq: M(88), dur: 0.4, peak: 0.06 });
    return 0.52;
  },

  /** Reroll: a quick card shuffle and a rising blip. */
  cardReroll(a) {
    for (let i = 0; i < 5; i++) N(a, i * 0.035, { dur: 0.025, peak: 0.07, bp: 3000 + i * 300, q: 2, attack: 0.001 });
    T(a, 0.12, { type: 'triangle', freq: 500, to: 1100, dur: 0.1, peak: 0.1 });
    return 0.23;
  },

  menuMove(a) {
    T(a, 0, { type: 'triangle', freq: 1100, dur: 0.035, peak: 0.1, attack: 0.002 });
    T(a, 0, { type: 'square', freq: 2200, dur: 0.012, peak: 0.02, lp: 5000, attack: 0.001 });
    return 0.04;
  },

  menuSelect(a) {
    T(a, 0, { type: 'square', freq: M(88), dur: 0.05, peak: 0.08, lp: 5000 });
    T(a, 0.05, { type: 'square', freq: M(93), dur: 0.14, peak: 0.08, lp: 5000 });
    T(a, 0.05, { freq: M(105), dur: 0.15, peak: 0.03 });
    return 0.2;
  },

  /** Start a run: the select chime plus a happy woof. */
  menuStart(a) {
    VOICES.menuSelect(a);
    dogVoice(a, 0.1, 340, { peak: 0.32 });
    return 0.28;
  },

  menuBack(a) {
    T(a, 0, { type: 'triangle', freq: M(81), dur: 0.06, peak: 0.12 });
    T(a, 0.06, { type: 'triangle', freq: M(76), dur: 0.1, peak: 0.11 });
    return 0.17;
  },

  /** Kennel buy: a coin "cha-ching". */
  buy(a) {
    N(a, 0, { dur: 0.04, peak: 0.08, bp: 5000, q: 1, attack: 0.001 });
    T(a, 0.02, { type: 'square', freq: M(83), dur: 0.07, peak: 0.07, lp: 6000 });
    T(a, 0.09, { type: 'square', freq: M(88), dur: 0.25, peak: 0.07, lp: 6000 });
    T(a, 0.09, { freq: M(100), dur: 0.3, peak: 0.035 });
    T(a, 0.09, { freq: M(107), dur: 0.2, peak: 0.02 });
    return 0.4;
  },

  /** Denied (not enough bones, locked): a dull double buzz. */
  denied(a) {
    [0, 0.11].forEach((s) => {
      T(a, s, { type: 'square', freq: 98, dur: 0.09, peak: 0.07, lp: 500 });
      T(a, s, { type: 'square', freq: 104, dur: 0.09, peak: 0.07, lp: 500 });
    });
    T(a, 0, { freq: 110, to: 60, dur: 0.1, peak: 0.2 });
    return 0.21;
  },

  /** Unlock: a sparkly rising jingle that settles on a chord. */
  unlock(a) {
    const run = [84, 88, 91, 96, 100];
    run.forEach((m, i) => {
      T(a, i * 0.06, { type: 'pulse25', freq: M(m), dur: 0.09, peak: 0.07, lp: 6000 });
      T(a, i * 0.06, { freq: M(m + 12), dur: 0.1, peak: 0.03 });
    });
    const end = run.length * 0.06;
    [84, 88, 91].forEach(m => T(a, end, { type: 'triangle', freq: M(m), dur: 0.45, peak: 0.07 }));
    for (let i = 0; i < 4; i++) T(a, end + 0.04 + i * 0.07, { freq: 2600 + Math.random() * 2400, dur: 0.06, peak: 0.025 });
    return end + 0.46;
  },

  retry(a) {
    T(a, 0, { type: 'triangle', freq: 600, to: 900, dur: 0.07, peak: 0.11 });
    return 0.08;
  },

  newBest(a) {
    [79, 84, 88, 91].forEach((m, i) => {
      T(a, i * 0.055, { type: 'square', freq: M(m), dur: i === 3 ? 0.2 : 0.07, peak: 0.07, lp: 5000 });
    });
    T(a, 0.17, { freq: M(103), dur: 0.18, peak: 0.03 });
    return 0.38;
  },

  click(a) {
    T(a, 0, { type: 'square', freq: 1200, dur: 0.03, peak: 0.08, lp: 5000 });
    return 0.04;
  },
};

export const SFX_NAMES = Object.keys(VOICES);

// =============================================================================
// Voice limiting and playback
// =============================================================================

const lastAt = {};       // name -> performance.now() of the last start
const alive = {};        // name -> [end times (ctx s)]
const groupAlive = {};   // group -> [end times]
let allAlive = [];       // every voice's end time

function prune(list, now) {
  let k = 0;
  for (let i = 0; i < list.length; i++) if (list[i] > now) list[k++] = list[i];
  list.length = k;
  return list;
}

const DEFAULT_DEF = { bus: 'sfx', max: 4, gapMs: 0, prio: 1 };

/** Why `name` would be skipped right now ('gap' | 'cap' | 'group' | 'global'), or null. */
function limitReason(name, def, now, nowMs) {
  if (def.gapMs && nowMs - (lastAt[name] ?? -Infinity) < def.gapMs) return 'gap';
  if (prune(alive[name] || (alive[name] = []), now).length >= def.max) return 'cap';
  if (def.group) {
    const g = prune(groupAlive[def.group] || (groupAlive[def.group] = []), now);
    if (g.length >= (SFX_GROUPS[def.group]?.max ?? Infinity)) return 'group';
  }
  const n = prune(allAlive, now).length;
  if (def.bus === 'sfx' || !def.bus) {
    if (n >= AUDIO.GLOBAL_HARD_CAP) return 'global';
    if ((def.prio ?? 1) === 0 && n >= AUDIO.GLOBAL_SOFT_CAP) return 'global';
  }
  return null;
}

/** True if playSfx(name) would play now (no side effects). */
export function wouldPlay(name) {
  const def = { ...DEFAULT_DEF, ...SFX_DEFS[name] };
  const base = audioManager.sfxOut(def.bus);
  if (!base) return false;
  return !limitReason(name, def, base.ctx.currentTime, performance.now());
}

/**
 * @param {string} name a key of VOICES
 * @param {{gain?: number, pan?: number, delay?: number}} [o] plus voice options
 * @returns {boolean} played
 */
export function playSfx(name, o = {}) {
  const voice = VOICES[name];
  if (!voice) return false;
  const def = { ...DEFAULT_DEF, ...SFX_DEFS[name] };
  const base = audioManager.sfxOut(def.bus);
  if (!base) {
    audioManager.stats.blocked += 1;
    return false;
  }
  const { ctx } = base;
  const now = ctx.currentTime;
  const nowMs = performance.now();
  const why = limitReason(name, def, now, nowMs);
  if (why) {
    audioManager.noteSkip(name, why);
    return false;
  }
  lastAt[name] = nowMs;

  const v = def.vary || { pitch: AUDIO.PITCH_JITTER, db: AUDIO.VOL_JITTER_DB };
  const pitch = 1 + rand(-v.pitch, v.pitch);
  const vol = dbToGain((def.db || 0) + rand(-v.db, v.db)) * (o.gain ?? 1);
  try {
    const group = ctx.createGain();
    group.gain.value = vol;
    let head = group;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      group.connect(p);
      head = p;
    }
    head.connect(base.out);
    const t = now + 0.005 + (o.delay || 0);
    const dur = voice({ ctx, out: group, noise: base.noise, t, pitch }, o) || 0.3;
    const end = t + dur + 0.05;
    alive[name].push(end);
    if (def.group) groupAlive[def.group].push(end);
    allAlive.push(end);
    // Free the group once every node in it has stopped
    setTimeout(() => {
      try { head.disconnect(); } catch { /* gone */ }
    }, (end - now + 0.3) * 1000);

    const st = audioManager.stats;
    audioManager.noteVoice(name);
    st.peakVoices[name] = Math.max(st.peakVoices[name] || 0, alive[name].length);
    if (def.group) st.peakGroups[def.group] = Math.max(st.peakGroups[def.group] || 0, groupAlive[def.group].length);
    st.peakGlobal = Math.max(st.peakGlobal, allAlive.length);
    return true;
  } catch (err) {
    console.warn(`[Audio] sfx ${name} failed:`, err);
    return false;
  }
}

/** Alive voice counts right now (QA). */
export function voiceCounts() {
  const now = audioManager.ctx ? audioManager.ctx.currentTime : 0;
  const per = {};
  for (const [k, list] of Object.entries(alive)) {
    const n = prune(list, now).length;
    if (n) per[k] = n;
  }
  return { total: prune(allAlive, now).length, per };
}

// =============================================================================
// Loops: Robo-Vac suction drone (phase 2)
// =============================================================================

const LOOPS = {
  /** Suction drone: a low motor hum, a breathy band of wind and a slow wobble. */
  vacDrone(ctx, out, buf) {
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.value = EPS;
    env.gain.setValueAtTime(EPS, t);
    env.gain.linearRampToValueAtTime(1, t + 0.4);
    env.connect(out);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 62;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 380;
    const humG = ctx.createGain();
    humG.gain.value = 0.09;
    hum.connect(humLp);
    humLp.connect(humG);
    humG.connect(env);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    const windG = ctx.createGain();
    windG.gain.value = 0.11;
    src.connect(bp);
    bp.connect(windG);
    windG.connect(env);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 350;
    lfo.connect(lfoDepth);
    lfoDepth.connect(bp.frequency);
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 1240;
    const whineG = ctx.createGain();
    whineG.gain.value = 0.012;
    whine.connect(whineG);
    whineG.connect(env);
    const srcs = [hum, lfo, whine];
    srcs.forEach(o => o.start(t));
    src.start(t, Math.random() * 0.5);
    srcs.push(src);
    return { env, srcs };
  },
};

/** Starts a loop (idempotent). Returns true if it is running. */
export function startLoop(name) {
  if (audioManager.loops[name]) return true;
  const base = audioManager.sfxOut('sfx');
  if (!base || !LOOPS[name]) return false;
  try {
    audioManager.loops[name] = LOOPS[name](base.ctx, base.out, base.noise);
    audioManager.noteVoice(name);
    return true;
  } catch (err) {
    console.warn(`[Audio] loop ${name} failed:`, err);
    return false;
  }
}

/** Fades a loop out and frees it. Safe to call any time. */
export function stopLoop(name, fadeS = 0.25) {
  const l = audioManager.loops[name];
  if (!l) return;
  audioManager.loops[name] = null;
  try {
    const ctx = audioManager.ctx;
    const t = ctx.currentTime;
    const g = l.env.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, EPS), t);
    g.exponentialRampToValueAtTime(EPS, t + fadeS);
    l.srcs.forEach(s => s.stop(t + fadeS + 0.05));
    setTimeout(() => { try { l.env.disconnect(); } catch { /* gone */ } }, (fadeS + 0.3) * 1000);
  } catch { /* context closed */ }
}

export function stopAllLoops() {
  Object.keys(audioManager.loops).forEach(k => stopLoop(k));
}
