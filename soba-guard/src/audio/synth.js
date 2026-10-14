// Shared synth building blocks for music.js and sfx.js (Web Audio, no deps).
//
// Envelope rule (no clicks): every gain starts at EPS (0.0001), ramps
// linearly to its peak, and decays with an exponential ramp back to EPS.
// Nothing is ever set to 0 and then exponentially ramped.
//
// `dest` may be one AudioNode or an array of nodes (e.g. [dry, reverbSend]).

export const EPS = 0.0001;

export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-6));
export const freqOf = midi => 440 * Math.pow(2, (midi - 69) / 12);

// --- Scales ------------------------------------------------------------------
// Tonic D. Melodies are written as degrees of a 5-note scale (5 degrees per
// octave, degree 0 = D4) so the same line can be played in either scale.
export const TONIC = 62; // D4
export const SCALES = {
  yo: [0, 2, 5, 7, 9],   // D E G A B   — bright folk pentatonic (zones 1-3, title, win)
  in: [0, 1, 5, 7, 8],   // D Eb G A Bb — miyako-bushi, dark (zone 4 night, game over)
};

export function midiOfDegree(deg, scale = 'yo') {
  const s = SCALES[scale] || SCALES.yo;
  const oct = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  return TONIC + 12 * oct + s[i];
}

export const freqOfDegree = (deg, scale) => freqOf(midiOfDegree(deg, scale));

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'E5' -> yo-scale degree (null when the note isn't in the yo scale). */
export function degreeOf(name) {
  const m = /^([A-G])(\d)$/.exec(name);
  if (!m) return null;
  const midi = 12 * (Number(m[2]) + 1) + NOTE_INDEX[m[1]];
  const rel = midi - TONIC;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  const i = SCALES.yo.indexOf(pc);
  return i < 0 ? null : oct * 5 + i;
}

// --- Graph helpers -------------------------------------------------------------

export function connectTo(node, dest) {
  if (Array.isArray(dest)) dest.forEach(d => d && node.connect(d));
  else node.connect(dest);
}

/**
 * A GainNode that is already at EPS before its first automation event. A new
 * GainNode sits at 1.0 until then, and a source can start one frame before a
 * same-time setValueAtTime lands (float rounding): that frame would pass at
 * full gain as a one-sample click. Every envelope starts from this.
 */
export function silentGain(ctx) {
  const g = ctx.createGain();
  g.gain.value = EPS;
  return g;
}

/** Gain node with a percussive envelope: EPS -> peak (linear) [-> hold] -> EPS (exponential). */
export function envGain(ctx, t, peak, attack, dur, hold = 0) {
  const g = silentGain(ctx);
  const p = Math.max(peak, EPS * 2);
  const end = Math.max(dur, attack + hold + 0.01);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(p, t + attack);
  if (hold > 0) g.gain.setValueAtTime(p, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(EPS, t + end);
  return g;
}

/** Optional filter stage. sweepTo ramps the cutoff (exponentially) over `sweepS`. */
function filtered(ctx, src, t, { lp = null, hp = null, bp = null, q = 1, sweepTo = null, sweepS = 0.1 }) {
  const freq = bp || lp || hp;
  if (!freq) return src;
  const f = ctx.createBiquadFilter();
  f.type = bp ? 'bandpass' : lp ? 'lowpass' : 'highpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + sweepS);
  src.connect(f);
  return f;
}

/**
 * One oscillator note.
 * { type, freq, to (glide target), glide (s, default dur), curve 'exp'|'lin',
 *   dur, peak, attack, hold, lp|hp|bp, q, sweepTo, sweepS, detune }
 */
export function tone(ctx, dest, t, o) {
  const {
    type = 'sine', freq, to = null, glide = null, curve = 'exp', dur, peak,
    attack = 0.004, hold = 0, detune = 0,
  } = o;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.value = detune;
  if (to) {
    const tt = t + (glide ?? dur);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(to, tt);
    else osc.frequency.linearRampToValueAtTime(to, tt);
  }
  const node = filtered(ctx, osc, t, { sweepS: dur, ...o });
  const g = envGain(ctx, t, peak, attack, dur, hold);
  node.connect(g);
  connectTo(g, dest);
  osc.start(t);
  osc.stop(t + Math.max(dur, attack + hold) + 0.05);
  return osc;
}

/**
 * Filtered white-noise burst from the shared 1 s noise buffer.
 * { dur, peak, attack, hold, lp|hp|bp, q, sweepTo, sweepS }
 */
export function noise(ctx, buffer, dest, t, o) {
  const { dur, peak, attack = 0.003, hold = 0 } = o;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = dur > 0.5;
  const node = filtered(ctx, src, t, { sweepS: dur, ...o });
  const g = envGain(ctx, t, peak, attack, dur, hold);
  node.connect(g);
  connectTo(g, dest);
  src.start(t, Math.random() * 0.4);
  src.stop(t + Math.max(dur, attack + hold) + 0.05);
  return src;
}

/**
 * Koto-like pluck: triangle body + a little square bite, a fast pitch drop
 * from slightly sharp (the string's attack), a lowpass that closes as the
 * note decays, and an exponential decay with no sustain.
 * bend: start a whole tone low and push up into the note (koto "oshide").
 */
export function pluck(ctx, dest, t, freq, dur, peak, { bend = false, bright = 1, bite = 0.25 } = {}) {
  const f0 = bend ? freq * 0.8909 : freq * 1.025;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(Math.min(9000, freq * 7 * bright), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.6), t + Math.min(dur, 0.45));

  const oscs = [];
  const body = ctx.createOscillator();
  body.type = 'triangle';
  oscs.push(body);
  body.connect(lp);
  if (bite > 0) {
    const sq = ctx.createOscillator();
    sq.type = 'square';
    const sg = ctx.createGain();
    sg.gain.value = bite;
    sq.connect(sg);
    sg.connect(lp);
    oscs.push(sq);
  }
  for (const o of oscs) {
    o.frequency.setValueAtTime(f0, t);
    if (bend) {
      o.frequency.setValueAtTime(f0, t + 0.04);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    } else {
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
    }
  }

  const g = silentGain(ctx);
  const p = Math.max(peak, EPS * 2);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(p, t + 0.003);
  g.gain.exponentialRampToValueAtTime(p * 0.4, t + 0.07);   // pluck transient
  g.gain.exponentialRampToValueAtTime(EPS, t + Math.max(dur, 0.12));
  lp.connect(g);
  connectTo(g, dest);
  for (const o of oscs) {
    o.start(t);
    o.stop(t + Math.max(dur, 0.12) + 0.05);
  }
}

/**
 * Breathy flute (shakuhachi / festival fue): sine + soft triangle with a
 * scoop up into the pitch, delayed vibrato, and band-passed breath noise.
 */
export function flute(ctx, buffer, dest, t, freq, dur, peak, { breath = 0.2, attack = 0.08 } = {}) {
  const end = t + Math.max(dur, attack + 0.1);
  const g = silentGain(ctx);
  const p = Math.max(peak, EPS * 2);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(p, t + attack);
  g.gain.setValueAtTime(p, Math.max(t + attack, end - 0.18));
  g.gain.exponentialRampToValueAtTime(EPS, end);
  connectTo(g, dest);

  const a = ctx.createOscillator();
  a.type = 'sine';
  const b = ctx.createOscillator();
  b.type = 'triangle';
  const bg = ctx.createGain();
  bg.gain.value = 0.18;
  for (const o of [a, b]) {
    o.frequency.setValueAtTime(freq * 0.945, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
  }
  // delayed vibrato
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.value = 0;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(freq * 0.011, t + Math.min(0.35, dur * 0.6));
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  a.connect(g);
  b.connect(bg);
  bg.connect(g);

  if (breath > 0 && buffer) {
    noise(ctx, buffer, g, t, {
      dur: Math.max(0.15, dur * 0.7), peak: breath, attack: 0.03, bp: Math.min(8000, freq * 2), q: 1.8,
    });
  }
  for (const o of [a, b, lfo]) {
    o.start(t);
    o.stop(end + 0.05);
  }
}

/** Generated reverb impulse: stereo decaying noise, darkened with a one-pole lowpass. */
export function makeImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const pre = Math.floor(rate * 0.012);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const x = Math.random() * 2 - 1;
      y += 0.45 * (x - y);                       // darken
      d[i] = y * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function makeNoiseBuffer(ctx) {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Chiptune pulse lead: a square + a quiet octave-down triangle through a
 * lowpass (soft, "night market" rather than harsh), a short decay to a
 * sustain, and a little delayed vibrato on long notes.
 */
export function chip(ctx, dest, t, freq, dur, peak, { lp = 2600, vib = 0.006 } = {}) {
  const end = t + Math.max(dur, 0.06);
  const g = silentGain(ctx);
  const p = Math.max(peak, EPS * 2);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(p, t + 0.005);
  g.gain.exponentialRampToValueAtTime(p * 0.55, t + 0.09);
  g.gain.setValueAtTime(p * 0.55, Math.max(t + 0.09, end - 0.05));
  g.gain.exponentialRampToValueAtTime(EPS, end + 0.04);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  f.Q.value = 0.7;
  f.connect(g);
  connectTo(g, dest);

  const sq = ctx.createOscillator();
  sq.type = 'square';
  sq.frequency.setValueAtTime(freq, t);
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.setValueAtTime(freq / 2, t);
  const tg = ctx.createGain();
  tg.gain.value = 0.5;
  sq.connect(f);
  tri.connect(tg);
  tg.connect(f);
  const oscs = [sq, tri];
  if (vib > 0 && dur > 0.25) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * vib, t + Math.min(0.3, dur * 0.6));
    lfo.connect(depth);
    depth.connect(sq.frequency);
    oscs.push(lfo);
  }
  for (const o of oscs) {
    o.start(t);
    o.stop(end + 0.08);
  }
}
