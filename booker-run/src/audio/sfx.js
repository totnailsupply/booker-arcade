// Sound effects, all synthesized. Every function returns silently when the
// AudioContext isn't running yet or audio is muted (audioManager.sfxOut returns
// null), so nothing throws before the first gesture or without Web Audio.
//
// Mix: SFX peaks stay at or under the music's peaks (see docs/audio-notes.md);
// repeated sounds get a small random pitch offset (AUDIO.PITCH_JITTER).

import { AUDIO } from '../core/Constants.js';
import { audioManager } from './AudioManager.js';
import { freqOf, setWave } from './music.js';

const jitter = (amount = AUDIO.PITCH_JITTER) => 1 + (Math.random() * 2 - 1) * amount;

function tone(a, { type = 'square', freq, freqEnd = null, start = 0, dur, peak, cutoff = null, attack = 0.004, curve = 'exp' }) {
  const { ctx, out } = a;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  setWave(ctx, osc, type);
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    else osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  return osc;
}

function noise(a, { start = 0, dur, peak, type = 'bandpass', freq, freqEnd = null, q = 1, attack = 0.004 }) {
  const { ctx, out } = a;
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = audioManager.noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

/** Freeze an AudioParam at its current value so a new ramp starts without a jump. */
function holdAt(param, t) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

// =============================================================================
// Core run SFX (Level 1)
// =============================================================================

/** Short rising blip. */
export function jumpSfx() {
  const a = audioManager.sfxOut('jump');
  if (!a) return;
  const j = jitter();
  tone(a, { type: 'square', freq: 280 * j, freqEnd: 620 * j, dur: 0.11, peak: 0.16, cutoff: 3200 });
}

/** Soft thump on landing. */
export function landSfx() {
  const a = audioManager.sfxOut('land');
  if (!a) return;
  const j = jitter();
  tone(a, { type: 'sine', freq: 130 * j, freqEnd: 55, dur: 0.09, peak: 0.32 });
  noise(a, { dur: 0.06, peak: 0.08, type: 'lowpass', freq: 700 });
}

// Major-pentatonic steps for bone streaks (C6 D6 E6 G6 A6 C7)
const BONE_SCALE = [84, 86, 88, 91, 93, 96];
let boneStreak = 0;
let lastBoneAt = 0;

/** Bright two-note chime; quick successive bones climb the scale. */
export function boneSfx() {
  const now = performance.now();
  boneStreak = now - lastBoneAt < AUDIO.BONE_STREAK_MS ? Math.min(boneStreak + 1, BONE_SCALE.length - 1) : 0;
  lastBoneAt = now;
  const a = audioManager.sfxOut('bone');
  if (!a) return;
  const base = BONE_SCALE[boneStreak];
  const j = jitter(0.01);
  tone(a, { type: 'square', freq: freqOf(base - 5) * j, dur: 0.07, peak: 0.09, cutoff: 6000 });
  tone(a, { type: 'square', freq: freqOf(base) * j, start: 0.06, dur: 0.16, peak: 0.09, cutoff: 6000 });
  tone(a, { type: 'sine', freq: freqOf(base + 12) * j, start: 0.06, dur: 0.18, peak: 0.06 });
}

/** Speed-up whoosh for a new section. */
export function whooshSfx() {
  const a = audioManager.sfxOut('whoosh');
  if (!a) return;
  noise(a, { dur: 0.45, peak: 0.22, type: 'bandpass', freq: 350, freqEnd: 3200, q: 1.4, attack: 0.18 });
  tone(a, { type: 'triangle', freq: 220, freqEnd: 660, dur: 0.4, peak: 0.07, attack: 0.15 });
}

/** Bonk + short descending tone. */
export function deathSfx() {
  const a = audioManager.sfxOut('death');
  if (!a) return;
  const j = jitter();
  tone(a, { type: 'sine', freq: 420 * j, freqEnd: 90, dur: 0.14, peak: 0.42 });
  tone(a, { type: 'square', freq: 900 * j, freqEnd: 300, dur: 0.04, peak: 0.12, cutoff: 2500 });
  noise(a, { dur: 0.05, peak: 0.15, type: 'bandpass', freq: 1800, q: 2 });
  tone(a, { type: 'square', freq: 523, freqEnd: 131, start: 0.12, dur: 0.42, peak: 0.12, cutoff: 1800, curve: 'linear' });
}

/** Happy fanfare when Booker reaches the steak. `golden` (final level) adds a sparkle run. */
export function fanfareSfx(golden = false) {
  const a = audioManager.sfxOut('fanfare');
  if (!a) return;
  const notes = [[72, 0.0, 0.1], [76, 0.1, 0.1], [79, 0.2, 0.1], [84, 0.3, 0.16], [79, 0.48, 0.08], [84, 0.58, 0.5]];
  for (const [m, s, d] of notes) {
    tone(a, { type: 'square', freq: freqOf(m), start: s, dur: d, peak: 0.13, cutoff: 4000 });
  }
  tone(a, { type: 'square', freq: freqOf(76), start: 0.58, dur: 0.5, peak: 0.08, cutoff: 3000 });
  tone(a, { type: 'triangle', freq: freqOf(48), start: 0.0, dur: 0.28, peak: 0.25 });
  tone(a, { type: 'triangle', freq: freqOf(55), start: 0.3, dur: 0.26, peak: 0.25 });
  tone(a, { type: 'triangle', freq: freqOf(48), start: 0.58, dur: 0.5, peak: 0.28 });
  if (golden) {
    [96, 100, 103, 108, 103, 108].forEach((m, i) => {
      tone(a, { type: 'sine', freq: freqOf(m), start: 0.62 + i * 0.07, dur: 0.16, peak: 0.05 });
    });
    tone(a, { type: 'triangle', freq: freqOf(88), start: 0.62, dur: 0.7, peak: 0.07 });
  }
}

/**
 * Synthesized bark: a sawtooth whose pitch jumps up then drops ("wo-of"),
 * through two formant band-passes, plus a breathy noise burst at the onset.
 */
function bark(a, start, pitch) {
  const { ctx, out } = a;
  const t = ctx.currentTime + start;
  const dur = 0.16;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch * 0.8, t);
  osc.frequency.linearRampToValueAtTime(pitch * 1.25, t + 0.03);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(0.5, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.2, t + 0.07);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 3;
  f1.frequency.setValueAtTime(900, t);
  f1.frequency.exponentialRampToValueAtTime(500, t + dur);
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 5;
  f2.frequency.value = 1700;
  const f2g = ctx.createGain();
  f2g.gain.value = 0.5;

  osc.connect(f1);
  osc.connect(f2);
  f2.connect(f2g);
  f1.connect(env);
  f2g.connect(env);
  env.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  noise(a, { start, dur: 0.05, peak: 0.12, type: 'bandpass', freq: 1400, q: 1.5, attack: 0.003 });
}

/** "Woof woof!" */
export function woofSfx(delayS = 0) {
  const a = audioManager.sfxOut('woof');
  if (!a) return;
  const j = jitter();
  bark(a, delayS, 300 * j);
  bark(a, delayS + 0.22, 340 * j);
}

/** UI click for the mute button (only audible when unmuting). */
export function clickSfx() {
  const a = audioManager.sfxOut('click');
  if (!a) return;
  tone(a, { type: 'square', freq: 1200, dur: 0.03, peak: 0.08, cutoff: 5000 });
}

// =============================================================================
// Ability SFX (Levels 2-6)
// =============================================================================

/** Double jump: an airy upward "flip" whoosh with a two-note sparkle on top. */
export function doubleJumpSfx() {
  const a = audioManager.sfxOut('doubleJump');
  if (!a) return;
  const j = jitter();
  noise(a, { dur: 0.2, peak: 0.13, type: 'bandpass', freq: 700 * j, freqEnd: 4200 * j, q: 1.2, attack: 0.03 });
  tone(a, { type: 'triangle', freq: 440 * j, freqEnd: 1320 * j, dur: 0.14, peak: 0.14 });
  tone(a, { type: 'sine', freq: freqOf(96) * j, start: 0.07, dur: 0.1, peak: 0.05 });
  tone(a, { type: 'sine', freq: freqOf(103) * j, start: 0.11, dur: 0.13, peak: 0.04 });
}

// --- Ear glide: a soft wind loop --------------------------------------------

let glide = null;

/**
 * Starts the glide wind loop (looping band-passed noise with a slow wobble and
 * a faint whistle). Fades in with setTargetAtTime, so no click. Returns true
 * if the loop is running.
 */
export function glideStart() {
  if (glide && !glide.stopping) return true;
  const a = audioManager.sfxOut('glide');
  if (!a) return false;
  const { ctx, out } = a;
  const t = ctx.currentTime;

  if (glide && glide.stopping) {
    // Grabbed again before the fade-out finished: fade the same loop back in
    clearTimeout(glide.cleanup);
    glide.stopping = false;
    holdAt(glide.env.gain, t);
    glide.env.gain.setTargetAtTime(1, t, AUDIO.GLIDE_FADE_IN_S);
    audioManager.glideActive = true;
    return true;
  }

  const src = ctx.createBufferSource();
  src.buffer = audioManager.noiseBuffer;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 0.9;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const level = ctx.createGain();            // follows fall speed
  level.gain.value = AUDIO.GLIDE_GAIN * 0.8;
  const env = ctx.createGain();              // fade in / out only
  env.gain.setValueAtTime(0, t);
  env.gain.setTargetAtTime(1, t, AUDIO.GLIDE_FADE_IN_S);

  // Slow gusting: an LFO wobbles the band centre and the whistle
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.7;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 130;
  const whistle = ctx.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.value = 950;
  const whistleGain = ctx.createGain();
  whistleGain.gain.value = 0.012;

  src.connect(bp);
  bp.connect(lp);
  lp.connect(level);
  whistle.connect(whistleGain);
  whistleGain.connect(level);
  level.connect(env);
  env.connect(out);
  lfo.connect(lfoDepth);
  lfoDepth.connect(bp.frequency);
  lfoDepth.connect(whistle.frequency);

  src.start(t, Math.random() * 0.5);
  lfo.start(t);
  whistle.start(t);
  glide = { ctx, src, bp, level, env, lfo, whistle, nodes: [src, bp, lp, level, env, lfo, lfoDepth, whistle, whistleGain], stopping: false, cleanup: null };
  audioManager.glideActive = true;
  return true;
}

/** Wind follows Booker's vertical speed a little (px/s; sign ignored). */
export function glideUpdate(vy) {
  if (!glide || glide.stopping || !Number.isFinite(vy)) return;
  const k = Math.min(Math.abs(vy), 300) / 300;
  const t = glide.ctx.currentTime;
  glide.bp.frequency.setTargetAtTime(480 + k * 560, t, 0.12);
  glide.whistle.frequency.setTargetAtTime(900 + k * 700, t, 0.12);
  glide.level.gain.setTargetAtTime(AUDIO.GLIDE_GAIN * (0.8 + k * 0.5), t, 0.15);
}

/** Fades the wind out smoothly and frees its nodes. Safe to call any time. */
export function glideStop() {
  audioManager.glideActive = false;
  if (!glide || glide.stopping) return;
  const node = glide;
  node.stopping = true;
  try {
    const t = node.ctx.currentTime;
    holdAt(node.env.gain, t);
    node.env.gain.setTargetAtTime(0, t, AUDIO.GLIDE_FADE_OUT_S);
  } catch { /* ignore */ }
  node.cleanup = setTimeout(() => {
    try { node.src.stop(); node.lfo.stop(); node.whistle.stop(); } catch { /* ignore */ }
    node.nodes.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
    if (glide === node) glide = null;
  }, AUDIO.GLIDE_FADE_OUT_S * 10 * 1000);
}

export function glideIsActive() {
  return !!glide && !glide.stopping;
}

// --- Wall cling / kick --------------------------------------------------------

/** Wall cling: a short paw scrape (three falling noise scratches). */
export function wallClingSfx() {
  const a = audioManager.sfxOut('wallCling');
  if (!a) return;
  const j = jitter();
  [[0, 3400, 0.08], [0.03, 2700, 0.065], [0.06, 2100, 0.05]].forEach(([s, f, p]) => {
    noise(a, { start: s, dur: 0.05, peak: p, type: 'bandpass', freq: f * j, freqEnd: f * 0.7 * j, q: 2.5, attack: 0.004 });
  });
  tone(a, { type: 'square', freq: 170 * j, dur: 0.03, peak: 0.05, cutoff: 1200 });
}

/** Wall kick: punchy tick + rising tone. `climb` semitones up for a kick chain. */
export function wallKickSfx(climb = 0) {
  const a = audioManager.sfxOut('wallKick');
  if (!a) return;
  const up = Math.pow(2, climb / 12) * jitter(0.02);
  tone(a, { type: 'square', freq: 1800 * up, dur: 0.02, peak: 0.08, cutoff: 5000, attack: 0.001 });
  tone(a, { type: 'sine', freq: 220 * up, freqEnd: 90, dur: 0.07, peak: 0.26 });
  noise(a, { dur: 0.04, peak: 0.07, type: 'bandpass', freq: 2500, q: 1.5, attack: 0.001 });
  tone(a, { type: 'pulse25', freq: 330 * up, freqEnd: 880 * up, start: 0.02, dur: 0.12, peak: 0.11, cutoff: 3500 });
}

// --- Pounce / stomp -------------------------------------------------------------

/** Pounce: a cartoon "boing" (rising spring with a fast wobble) and a squish. */
export function pounceSfx() {
  const a = audioManager.sfxOut('pounce');
  if (!a) return;
  const { ctx, out } = a;
  const j = jitter();
  const t = ctx.currentTime;
  const dur = 0.34;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(170 * j, t);
  osc.frequency.exponentialRampToValueAtTime(520 * j, t + 0.26);
  const wob = ctx.createOscillator();
  wob.frequency.value = 22;
  const wobDepth = ctx.createGain();
  wobDepth.gain.setValueAtTime(70, t);
  wobDepth.gain.exponentialRampToValueAtTime(4, t + dur);
  wob.connect(wobDepth);
  wobDepth.connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  wob.start(t);
  osc.stop(t + dur + 0.02);
  wob.stop(t + dur + 0.02);
  // squish
  noise(a, { dur: 0.1, peak: 0.12, type: 'lowpass', freq: 900, freqEnd: 250, attack: 0.003 });
  tone(a, { type: 'sine', freq: 140 * j, freqEnd: 70, dur: 0.08, peak: 0.16 });
}

/** Enemy stomped: a squelchy pop and a coin chime that climbs with a stomp chain. */
export function stompSfx(chain = 0) {
  const a = audioManager.sfxOut('stomp');
  if (!a) return;
  const j = jitter(0.02);
  const st = Math.min(chain * 2, 8);
  tone(a, { type: 'sine', freq: 900 * j, freqEnd: 160, dur: 0.07, peak: 0.2 });
  noise(a, { dur: 0.12, peak: 0.1, type: 'bandpass', freq: 1400 * j, freqEnd: 350, q: 3, attack: 0.003 });
  tone(a, { type: 'square', freq: freqOf(83 + st), start: 0.05, dur: 0.06, peak: 0.07, cutoff: 6000 });
  tone(a, { type: 'square', freq: freqOf(88 + st), start: 0.11, dur: 0.22, peak: 0.07, cutoff: 6000 });
  tone(a, { type: 'sine', freq: freqOf(100 + st), start: 0.11, dur: 0.2, peak: 0.035 });
}

// --- Zoomies dash ---------------------------------------------------------------

/** Dash: a fast rising noise zoom with a tone sweep and a low growl. */
export function dashSfx() {
  const a = audioManager.sfxOut('dash');
  if (!a) return;
  const j = jitter();
  noise(a, { dur: 0.24, peak: 0.3, type: 'bandpass', freq: 400 * j, freqEnd: 5200 * j, q: 1.5, attack: 0.015 });
  tone(a, { type: 'sawtooth', freq: 160 * j, freqEnd: 720 * j, dur: 0.2, peak: 0.11, cutoff: 2000 });
  tone(a, { type: 'sawtooth', freq: 90 * j, freqEnd: 140 * j, dur: 0.22, peak: 0.09, cutoff: 600 });
}

/** Dash end: a soft falling tail. */
export function dashEndSfx() {
  const a = audioManager.sfxOut('dashEnd');
  if (!a) return;
  noise(a, { dur: 0.14, peak: 0.05, type: 'bandpass', freq: 2400 * jitter(), freqEnd: 700, q: 1, attack: 0.01 });
}

// --- Breakables -----------------------------------------------------------------

/** Breakable smashed: a crunchy cardboard/wood crash; a gate adds a metal clang. */
export function smashSfx(type = 'boxes') {
  const a = audioManager.sfxOut('smash');
  if (!a) return;
  const j = jitter();
  tone(a, { type: 'sine', freq: 120 * j, freqEnd: 45, dur: 0.16, peak: 0.3 });
  [[0, 1700], [0.022, 900], [0.05, 2300], [0.085, 1200]].forEach(([s, f]) => {
    noise(a, { start: s, dur: 0.05, peak: 0.15, type: 'bandpass', freq: f * j * (0.85 + Math.random() * 0.3), q: 1.4, attack: 0.002 });
  });
  noise(a, { dur: 0.22, peak: 0.11, type: 'lowpass', freq: 1400, freqEnd: 300, attack: 0.004 });
  for (let i = 0; i < 5; i++) {
    noise(a, {
      start: 0.12 + i * 0.04 + Math.random() * 0.02, dur: 0.025, peak: 0.05 * (1 - i * 0.15),
      type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 2, attack: 0.002,
    });
  }
  if (type === 'gate') {
    tone(a, { type: 'square', freq: 523 * j, dur: 0.28, peak: 0.045, cutoff: 4000, attack: 0.002 });
    tone(a, { type: 'square', freq: 757 * j, dur: 0.22, peak: 0.035, cutoff: 4000, attack: 0.002 });
  }
}

// --- Steam vents (volume = distance from Booker) ---------------------------------

/** Windup: a quiet hiss that rises. vol 0..1 */
export function steamWindupSfx(vol = 1) {
  const a = audioManager.sfxOut('steamWindup');
  if (!a || vol <= 0) return;
  noise(a, { dur: 0.5, peak: 0.06 * vol, type: 'bandpass', freq: 1500 * jitter(), freqEnd: 5000, q: 0.8, attack: 0.35 });
}

/** Steam on: a louder hiss burst. vol 0..1 */
export function steamOnSfx(vol = 1) {
  const a = audioManager.sfxOut('steamOn');
  if (!a || vol <= 0) return;
  const j = jitter();
  noise(a, { dur: 0.55, peak: 0.12 * vol, type: 'highpass', freq: 2200 * j, q: 0.7, attack: 0.015 });
  noise(a, { dur: 0.3, peak: 0.05 * vol, type: 'bandpass', freq: 900 * j, q: 1, attack: 0.01 });
}

// =============================================================================
// UI SFX
// =============================================================================

/** Menu cursor move: a soft tick. */
export function menuMoveSfx() {
  const a = audioManager.sfxOut('menuMove');
  if (!a) return;
  const j = jitter(0.02);
  tone(a, { type: 'triangle', freq: 1100 * j, dur: 0.035, peak: 0.1, attack: 0.002 });
  tone(a, { type: 'square', freq: 2200 * j, dur: 0.012, peak: 0.02, cutoff: 5000, attack: 0.001 });
}

/** Menu select: a bright two-note confirm. */
export function menuSelectSfx() {
  const a = audioManager.sfxOut('menuSelect');
  if (!a) return;
  tone(a, { type: 'square', freq: freqOf(88), dur: 0.05, peak: 0.08, cutoff: 5000 });
  tone(a, { type: 'square', freq: freqOf(93), start: 0.05, dur: 0.14, peak: 0.08, cutoff: 5000 });
  tone(a, { type: 'sine', freq: freqOf(105), start: 0.05, dur: 0.15, peak: 0.03 });
}

/** Retry from the game-over card: a quick soft blip (fast retries). */
export function retrySfx() {
  const a = audioManager.sfxOut('retry');
  if (!a) return;
  tone(a, { type: 'triangle', freq: 600 * jitter(0.02), freqEnd: 900, dur: 0.07, peak: 0.11 });
}

/** Menu back: two falling notes. */
export function menuBackSfx() {
  const a = audioManager.sfxOut('menuBack');
  if (!a) return;
  tone(a, { type: 'triangle', freq: freqOf(81), dur: 0.06, peak: 0.12 });
  tone(a, { type: 'triangle', freq: freqOf(76), start: 0.06, dur: 0.1, peak: 0.11 });
}

/** Locked level: a dull thud with a low buzz. */
export function lockedSfx() {
  const a = audioManager.sfxOut('locked');
  if (!a) return;
  tone(a, { type: 'square', freq: 98, dur: 0.2, peak: 0.07, cutoff: 500 });
  tone(a, { type: 'square', freq: 104, dur: 0.2, peak: 0.07, cutoff: 500 });
  tone(a, { type: 'sine', freq: 110, freqEnd: 60, dur: 0.12, peak: 0.22 });
}

/** Level unlocked: a sparkly rising jingle that settles on a chord. */
export function unlockSfx(delayS = 0) {
  const a = audioManager.sfxOut('unlock');
  if (!a) return;
  const run = [84, 88, 91, 96, 100];   // C6 E6 G6 C7 E7
  run.forEach((m, i) => {
    const s = delayS + i * 0.06;
    tone(a, { type: 'pulse25', freq: freqOf(m), start: s, dur: 0.09, peak: 0.07, cutoff: 6000 });
    tone(a, { type: 'sine', freq: freqOf(m + 12), start: s, dur: 0.1, peak: 0.03 });
  });
  const end = delayS + run.length * 0.06;
  [84, 88, 91].forEach(m => tone(a, { type: 'triangle', freq: freqOf(m), start: end, dur: 0.45, peak: 0.07 }));
  for (let i = 0; i < 4; i++) {
    tone(a, { type: 'sine', freq: 2600 + Math.random() * 2400, start: end + 0.04 + i * 0.07, dur: 0.06, peak: 0.025 });
  }
}

/** Game-over card: a short, gentle two-note "aw" (not punishing). */
export function gameOverStingSfx() {
  const a = audioManager.sfxOut('gameOver');
  if (!a) return;
  tone(a, { type: 'triangle', freq: freqOf(76), dur: 0.09, peak: 0.12 });
  tone(a, { type: 'triangle', freq: freqOf(72), start: 0.09, dur: 0.18, peak: 0.11 });
}

/** New best progress: a small rising arpeggio. */
export function newBestSfx() {
  const a = audioManager.sfxOut('newBest');
  if (!a) return;
  [79, 84, 88, 91].forEach((m, i) => {
    tone(a, { type: 'square', freq: freqOf(m), start: i * 0.055, dur: i === 3 ? 0.2 : 0.07, peak: 0.07, cutoff: 5000 });
  });
  tone(a, { type: 'sine', freq: freqOf(103), start: 0.17, dur: 0.18, peak: 0.03 });
}

/** Results star reveal: each star pops a step higher (index 0, 1, 2). */
export function starPopSfx(index = 0, earned = true) {
  const a = audioManager.sfxOut('starPop');
  if (!a) return;
  if (!earned) {
    tone(a, { type: 'triangle', freq: 330, dur: 0.06, peak: 0.07 });
    return;
  }
  const m = [88, 91, 96][Math.max(0, Math.min(2, index))];
  const f = freqOf(m);
  tone(a, { type: 'pulse25', freq: f * 0.8, freqEnd: f, dur: 0.14, peak: 0.09, cutoff: 6000, attack: 0.002 });
  tone(a, { type: 'sine', freq: f * 2, start: 0.02, dur: 0.16, peak: 0.04 });
  noise(a, { dur: 0.03, peak: 0.05, type: 'bandpass', freq: 3000, q: 1.5, attack: 0.001 });
}

/** Score tally tick; `progress` 0..1 nudges the pitch up as the count climbs. */
export function tallyTickSfx(progress = 0) {
  const a = audioManager.sfxOut('tally');
  if (!a) return;
  const p = Math.max(0, Math.min(1, progress || 0));
  tone(a, { type: 'square', freq: (1200 + p * 800) * jitter(0.01), dur: 0.02, peak: 0.04, cutoff: 6000, attack: 0.001 });
}

/** Score tally finished: a short bright ding. */
export function tallyDoneSfx() {
  const a = audioManager.sfxOut('tallyDone');
  if (!a) return;
  tone(a, { type: 'sine', freq: freqOf(96), dur: 0.25, peak: 0.07 });
  tone(a, { type: 'sine', freq: freqOf(103), start: 0.03, dur: 0.25, peak: 0.04 });
}

/** New ability card: a rising shimmer that lands on a bright chord. */
export function abilityIntroSfx() {
  const a = audioManager.sfxOut('abilityIntro');
  if (!a) return;
  noise(a, { dur: 0.35, peak: 0.06, type: 'bandpass', freq: 1500, freqEnd: 6000, q: 1.2, attack: 0.2 });
  [79, 84, 88].forEach((m, i) => {
    tone(a, { type: 'pulse25', freq: freqOf(m), start: 0.08 + i * 0.07, dur: 0.12, peak: 0.07, cutoff: 5000 });
  });
  [84, 88, 91, 96].forEach(m => tone(a, { type: 'triangle', freq: freqOf(m), start: 0.3, dur: 0.5, peak: 0.055 }));
  tone(a, { type: 'sine', freq: freqOf(108), start: 0.32, dur: 0.3, peak: 0.025 });
}

/** Level tip toast: a soft two-note "ding-dong". */
export function tipSfx() {
  const a = audioManager.sfxOut('tip');
  if (!a) return;
  tone(a, { type: 'sine', freq: freqOf(84), dur: 0.14, peak: 0.08 });
  tone(a, { type: 'sine', freq: freqOf(79), start: 0.12, dur: 0.2, peak: 0.07 });
}

/**
 * Level 6 ending flourish (Golden Steak): a rising sweep, the Yard theme's
 * opening quoted up a step in D major, a big held chord with a timpani-style
 * hit and shimmer, then Booker's double bark. About 2.4 s.
 */
export function endingSfx() {
  const a = audioManager.sfxOut('ending');
  if (!a) return;
  // lead-in sweep
  noise(a, { dur: 0.32, peak: 0.07, type: 'bandpass', freq: 500, freqEnd: 5000, q: 1.2, attack: 0.25 });
  tone(a, { type: 'triangle', freq: freqOf(62), freqEnd: freqOf(74), dur: 0.3, peak: 0.08, attack: 0.2 });
  // the Yard motif (E5 G5 C6 G5 A5 G5 E5), up a step
  const t0 = 0.3;
  const motif = [[78, 0, 0.12], [81, 0.12, 0.12], [86, 0.24, 0.12], [81, 0.36, 0.1], [83, 0.48, 0.08], [81, 0.56, 0.08], [78, 0.64, 0.16]];
  motif.forEach(([m, st, d]) => {
    tone(a, { type: 'pulse25', freq: freqOf(m), start: t0 + st, dur: d, peak: 0.1, cutoff: 4000 });
    tone(a, { type: 'triangle', freq: freqOf(m - 12), start: t0 + st, dur: d, peak: 0.06 });
  });
  // big D major chord + timpani-ish hit + shimmer
  const end = t0 + 0.84;
  [74, 78, 81, 86].forEach(m => tone(a, { type: 'square', freq: freqOf(m), start: end, dur: 1.0, peak: 0.04, cutoff: 3000 }));
  [86, 90, 93].forEach(m => tone(a, { type: 'triangle', freq: freqOf(m), start: end, dur: 1.0, peak: 0.035 }));
  tone(a, { type: 'triangle', freq: freqOf(50), start: end, dur: 1.0, peak: 0.16 });
  tone(a, { type: 'sine', freq: 140, freqEnd: 70, start: end, dur: 0.35, peak: 0.14 });
  noise(a, { start: end, dur: 0.9, peak: 0.06, type: 'highpass', freq: 5500, q: 0.7, attack: 0.005 });
  for (let i = 0; i < 10; i++) {
    tone(a, { type: 'sine', freq: 2400 + Math.random() * 3000, start: end + 0.05 + i * 0.08, dur: 0.07, peak: 0.022 });
  }
  // Booker approves
  const j = jitter();
  bark(a, end + 0.95, 320 * j);
  bark(a, end + 1.17, 360 * j);
}
