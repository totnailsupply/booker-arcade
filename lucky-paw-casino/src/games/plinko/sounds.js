// Plinko-only sounds, built from the shared synth primitives and played into
// the shared SFX bus (same plumbing as audio/sfx.js playSfx).
//
//   plinkoSfx('bin', { mult })   ball lands in a bin: a wooden thunk + a blip
//                                that rises with the multiplier
//   plinkoSfx('chute')           Booker lets a ball go: a short pipe whoosh

import { audioManager } from '../../audio/AudioManager.js';
import { tone, noise, freqOf, dbToGain } from '../../audio/synth.js';

const lastAt = {};
const GAP_MS = { bin: 35, chute: 40 };

const VOICES = {
  bin(a, o) {
    const m = Math.max(0.1, o.mult ?? 1);
    // thunk
    tone(a.ctx, a.out, a.t, { freq: 210, to: 95, dur: 0.12, peak: 0.4, attack: 0.002 });
    noise(a.ctx, a.noise, a.out, a.t, { dur: 0.05, peak: 0.25, lp: 1100 });
    // blip: below 1x a dull low note, above it climbs (log of the multiplier)
    const midi = m < 1 ? 57 : Math.min(96, 72 + Math.round(Math.log2(m) * 4));
    tone(a.ctx, a.out, a.t + 0.03, { type: 'triangle', freq: freqOf(midi), dur: m < 1 ? 0.16 : 0.22, peak: m < 1 ? 0.1 : 0.16, attack: 0.003 });
    if (m >= 2) tone(a.ctx, a.out, a.t + 0.09, { type: 'triangle', freq: freqOf(midi + 7), dur: 0.22, peak: 0.12, attack: 0.003 });
  },
  chute(a) {
    noise(a.ctx, a.noise, a.out, a.t, { dur: 0.16, peak: 0.16, bp: 900, q: 1.4, sweepTo: 2600, sweepS: 0.14, attack: 0.02 });
    tone(a.ctx, a.out, a.t + 0.05, { freq: 620, to: 980, dur: 0.08, peak: 0.08, attack: 0.004 });
  },
};

export function plinkoSfx(name, o = {}) {
  const voice = VOICES[name];
  const base = audioManager.sfxOut?.();
  if (!voice || !base) return null;
  const now = performance.now();
  if (now - (lastAt[name] ?? -Infinity) < (GAP_MS[name] || 0)) return null;
  lastAt[name] = now;
  try {
    const { ctx } = base;
    const group = ctx.createGain();
    group.gain.value = dbToGain(o.db ?? 0) * (o.gain ?? 1);
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      group.connect(p);
      p.connect(base.out);
    } else {
      group.connect(base.out);
    }
    voice({ ctx, out: group, noise: base.noise, t: ctx.currentTime + 0.005 }, o);
    audioManager.noteSfx(`plinko:${name}`, true);
    return group;
  } catch (err) {
    console.warn(`[plinko] sfx ${name} failed:`, err);
    return null;
  }
}
