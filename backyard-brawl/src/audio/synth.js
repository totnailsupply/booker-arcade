// Shared synth building blocks for music.js and sfx.js (Web Audio, no deps).
// Ported from soba-tower's synth.js, plus chiptune pulse waves.
//
// Envelope rule (no clicks): every gain starts at EPS (0.0001), ramps
// linearly to its peak and decays exponentially back to EPS. A GainNode is
// created at EPS so a source that starts a frame early can't click.
//
// `dest` may be one AudioNode or an array of nodes.

export const EPS = 0.0001;

export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-6));
export const freqOf = midi => 440 * Math.pow(2, (midi - 69) / 12);

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#5' -> 73 (null for anything else). */
export function midiOf(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + acc;
}

// --- pulse waves ----------------------------------------------------------------

const waveCache = new WeakMap();

/** Band-limited pulse wave with the given duty cycle (cached per context). */
export function pulseWave(ctx, duty) {
  let m = waveCache.get(ctx);
  if (!m) {
    m = {};
    waveCache.set(ctx, m);
  }
  const key = String(duty);
  if (!m[key]) {
    const N = 48;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) {
      real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
      imag[n] = (2 * Math.sin(Math.PI * n * duty) ** 2) / (n * Math.PI);
    }
    m[key] = ctx.createPeriodicWave(real, imag);
  }
  return m[key];
}

/** 'square' | 'triangle' | 'sine' | 'sawtooth' | 'pulse25' | 'pulse12' */
export function setWave(ctx, osc, wave) {
  if (wave === 'pulse25') osc.setPeriodicWave(pulseWave(ctx, 0.25));
  else if (wave === 'pulse12') osc.setPeriodicWave(pulseWave(ctx, 0.125));
  else osc.type = wave;
}

// --- graph helpers ----------------------------------------------------------------

export function connectTo(node, dest) {
  if (Array.isArray(dest)) dest.forEach(d => d && node.connect(d));
  else node.connect(dest);
}

export function silentGain(ctx) {
  const g = ctx.createGain();
  g.gain.value = EPS;
  return g;
}

/** Percussive envelope: EPS -> peak (linear) [-> hold] -> EPS (exponential). */
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
 *   dur, peak, attack, hold, lp|hp|bp, q, sweepTo, sweepS, detune, vib {rate, depth (ratio)} }
 */
export function tone(ctx, dest, t, o) {
  const {
    type = 'sine', freq, to = null, glide = null, curve = 'exp', dur, peak,
    attack = 0.004, hold = 0, detune = 0, vib = null,
  } = o;
  const osc = ctx.createOscillator();
  setWave(ctx, osc, type);
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.value = detune;
  if (to) {
    const tt = t + (glide ?? dur);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(to, tt);
    else osc.frequency.linearRampToValueAtTime(to, tt);
  }
  const end = t + Math.max(dur, attack + hold) + 0.05;
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vib.rate;
    const depth = ctx.createGain();
    depth.gain.value = freq * vib.depth;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(end);
  }
  const node = filtered(ctx, osc, t, { sweepS: dur, ...o });
  const g = envGain(ctx, t, peak, attack, dur, hold);
  node.connect(g);
  connectTo(g, dest);
  osc.start(t);
  osc.stop(end);
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

export function makeNoiseBuffer(ctx) {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
