// =============================================================================
// Lounge music: a small jazz combo, synthesized. Electric piano comping,
// walking upright bass, brushes + ride, and a vibraphone line.
//
// One look-ahead step sequencer on a TRIPLET grid (12 steps per 4/4 bar, 3 per
// beat): swung 8ths are steps 0 and 2 of each beat, so the swing is built in.
// Straight-feel tracks (roulette bossa) use steps 0 and 1.5 via `swing: false`.
//
// Tracks (AudioManager.playMusic(key); EventBus MUSIC_PLAY { track }):
//   lobby      92 bpm  F major ii-V turnarounds, keys + bass + brushes + vibes
//   blackjack  84 bpm  C minor, smoky: brushes only, sparse vibes, low keys
//   craps     132 bpm  Bb, two chords a bar, busy ride + kick, more vibes
//   roulette  104 bpm  D minor bossa: straight 8ths, rim click + shaker
//   plinko    116 bpm  C major, bouncy, marimba-like vibes + bell sparkle
//   slots     108 bpm  Eb major, bright, bell arpeggio layer
// =============================================================================

import { AUDIO } from '../core/Constants.js';
import { dbToGain, freqOf, tone, noise } from './synth.js';

const STEPS = 12; // per bar (triplet 8ths)

const Q = {
  maj7: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10, 14], '7': [0, 4, 7, 10, 14], m7b5: [0, 3, 6, 10, 13],
  '13': [0, 4, 10, 14, 21], alt: [0, 4, 10, 13, 15], '6': [0, 4, 7, 9, 14], m9: [0, 3, 7, 10, 14],
};
const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

/** 'Dm7' -> { root: pitch class, q: intervals } ; 'F' -> maj7. */
function chord(sym) {
  const m = /^([A-G](?:b)?)(.*)$/.exec(sym);
  const pc = NOTE[m[1]];
  let q = m[2] || 'maj7';
  if (q === 'm') q = 'm7';
  return { pc, q: Q[q] || Q.maj7, sym };
}

// Melody cells: [step, chord-tone index (0..4, 5+ = next octave), length in steps]
const CELLS = {
  a: [[0, 2, 2], [2, 3, 1], [3, 4, 3]],
  b: [[3, 4, 2], [5, 3, 1], [6, 2, 3], [9, 1, 3]],
  c: [[0, 5, 1], [2, 4, 1], [3, 3, 1], [5, 2, 4]],
  d: [[2, 1, 1], [3, 2, 2], [6, 3, 2], [8, 4, 4]],
  e: [[0, 3, 6]],
  f: [[5, 2, 1], [6, 4, 2], [9, 5, 3]],
  rest: [],
};

const TRACKS = {
  lobby: {
    bpm: 92, swing: true,
    prog: ['Fmaj7', 'Dm7', 'Gm7', 'C7', 'Am7', 'D7', 'Gm7', 'C7'],
    melody: ['a', 'rest', 'b', 'rest', 'c', 'rest', 'd', 'e'],
    layers: { keys: 1, bass: 1, ride: 0.7, brush: 1, hat: 1, lead: 0.9 }, comp: 'charleston', vibes: 'vibes',
  },
  blackjack: {
    bpm: 84, swing: true,
    prog: ['Cm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Abmaj7', 'Dm7b5', 'G7'],
    melody: ['rest', 'e', 'rest', 'b', 'rest', 'a', 'rest', 'e'],
    layers: { keys: 0.85, bass: 1, brush: 1, hat: 0.8, lead: 0.7 }, comp: 'sparse', vibes: 'vibes', low: true,
  },
  craps: {
    bpm: 132, swing: true,
    prog: ['Bbmaj7', 'G7', 'Cm7', 'F7', 'Dm7', 'G7', 'Cm7', 'F7'],
    half: true,
    melody: ['a', 'c', 'b', 'rest', 'd', 'c', 'f', 'e'],
    layers: { keys: 1, bass: 1, ride: 1, kick: 1, hat: 1, lead: 0.9 }, comp: 'push', vibes: 'vibes',
  },
  roulette: {
    bpm: 104, swing: false,
    prog: ['Dm9', 'G13', 'Cmaj7', 'A7alt'],
    melody: ['e', 'b', 'a', 'd'],
    layers: { keys: 0.9, bass: 1, rim: 1, shaker: 1, kick: 0.7, lead: 0.8 }, comp: 'bossa', vibes: 'vibes', bossa: true,
  },
  plinko: {
    bpm: 116, swing: true,
    prog: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    melody: ['c', 'a', 'f', 'b'],
    layers: { keys: 0.9, bass: 1, ride: 0.8, hat: 1, kick: 0.6, lead: 1, bell: 0.7 }, comp: 'charleston', vibes: 'marimba',
  },
  slots: {
    bpm: 108, swing: true,
    prog: ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7'],
    melody: ['a', 'd', 'c', 'e'],
    layers: { keys: 1, bass: 1, ride: 0.9, brush: 0.6, hat: 1, lead: 0.9, bell: 1 }, comp: 'push', vibes: 'vibes',
  },
};
export const MUSIC_TRACKS = Object.keys(TRACKS);

// Comping rhythms: steps where the keys play (with a velocity)
const COMP = {
  charleston: [[0, 0.9], [5, 0.7]],
  sparse: [[0, 0.8]],
  push: [[2, 0.75], [8, 0.8]],
  bossa: [[0, 0.7], [3, 0.6], [7, 0.7], [9, 0.55]],
};

export class Sequencer {
  /** Sequencers whose scheduler is running (must never exceed 1). */
  static live = 0;

  /**
   * @param {AudioContext|OfflineAudioContext} ctx
   * @param {{out: AudioNode, rev?: AudioNode, noise: AudioBuffer}} dest
   * @param {{track: string, delay?: number, manual?: boolean}} opts
   */
  constructor(ctx, dest, { track = 'lobby', delay = 0, manual = false } = {}) {
    this.manual = manual;
    if (!manual) Sequencer.live += 1;
    this.ctx = ctx;
    this.dest = dest;
    this.noise = dest.noise;
    this.track = TRACKS[track] ? track : 'lobby';
    this.cfg = TRACKS[this.track];
    this.chords = this.cfg.prog.map(chord);
    this.layerNodes = {};
    this.paused = false;
    this.stopped = false;
    this.step = 0;
    this.segment = 'loop';
    this.section = 1;
    this.drive = false;

    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest.out);

    this.nextTime = ctx.currentTime + 0.08 + delay;
    if (!manual) {
      this.tick = () => this.schedule();
      this.timer = setInterval(this.tick, AUDIO.SCHEDULER_MS);
      this.schedule();
    }
  }

  get bpm() { return this.cfg.bpm; }
  get scale() { return this.cfg.prog[0]; }
  layers() { return Object.keys(this.cfg.layers); }
  setSection() {}
  setDrive() {}

  stepDur() { return 60 / this.cfg.bpm / 3; }

  /** Time offset of a step: straight tracks place the "and" at 1.5 of 3. */
  stepTime(base, s) {
    if (this.cfg.swing) return base + s * this.stepDur();
    const beat = Math.floor(s / 3);
    const sub = s % 3;
    return base + (beat * 3 + (sub === 2 ? 1.5 : sub)) * this.stepDur();
  }

  schedule() {
    if (this.stopped || this.paused) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    this.scheduleUntil(now + AUDIO.LOOKAHEAD_S);
  }

  /** Schedules whole bars that start before `horizon` (also used offline). */
  scheduleUntil(horizon) {
    while (this.nextTime < horizon) {
      this.playBar(this.nextTime, this.step);
      this.nextTime += STEPS * this.stepDur();
      this.step += 1;
    }
  }

  layer(name) {
    let node = this.layerNodes[name];
    if (node) return node;
    const ctx = this.ctx;
    node = ctx.createGain();
    node.gain.value = dbToGain(AUDIO.MIX[name] ?? -14) * (this.cfg.layers[name] ?? 1);
    const pan = AUDIO.PAN[name];
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(this.out);
    } else {
      node.connect(this.out);
    }
    const send = AUDIO.MUSIC_SEND[name];
    if (send !== undefined && this.dest.rev) {
      const s = ctx.createGain();
      s.gain.value = dbToGain(send);
      node.connect(s);
      s.connect(this.dest.rev);
    }
    this.layerNodes[name] = node;
    return node;
  }

  /** Chord at a bar (and half-bar for `half` tracks). */
  chordAt(bar, half = 0) {
    const n = this.chords.length;
    if (this.cfg.half) return this.chords[(bar * 2 + half) % n];
    return this.chords[bar % n];
  }

  playBar(t0, bar) {
    const c = this.cfg;
    const L = c.layers;
    const sd = this.stepDur();
    const beatT = (b) => this.stepTime(t0, b * 3);

    // --- bass: walking quarters (bossa: root-fifth half notes) ---
    for (let b = 0; b < 4; b++) {
      const ch = this.chordAt(bar, b >= 2 ? 1 : 0);
      const root = 36 + ((ch.pc + 7) % 12) - 7 + 12;     // around E2..D3
      let midi;
      if (c.bossa) {
        if (b % 2) continue;
        midi = b === 0 ? root : root + 7;
        this.bass(beatT(b), freqOf(midi), sd * 5.5);
        this.bass(this.stepTime(t0, b * 3 + 2), freqOf(midi), sd * 0.9, 0.55);
        continue;
      }
      if (b === 0 || (c.half && b === 2)) midi = root;
      else if (b === 3 || (c.half && b === 1)) {
        const nxt = this.chordAt(bar + (b === 3 ? 1 : 0), b === 3 ? 0 : 1);
        const nRoot = 36 + ((nxt.pc + 7) % 12) - 7 + 12;
        midi = nRoot + ((bar + b) % 2 ? 1 : -1);         // chromatic approach
      } else {
        midi = root + (b === 1 ? ch.q[1] : ch.q[2]);
      }
      this.bass(beatT(b), freqOf(midi), sd * 2.6);
    }

    // --- keys: rootless voicings on the comp rhythm ---
    const comp = COMP[c.comp] || COMP.charleston;
    for (const [s, v] of comp) {
      const ch = this.chordAt(bar, s >= 6 ? 1 : 0);
      const lowBase = c.low ? 50 : 53;
      const notes = [ch.q[1], ch.q[3], ch.q[4]].map(i => {
        let m = 48 + ch.pc + i;
        while (m < lowBase) m += 12;
        while (m > lowBase + 14) m -= 12;
        return m;
      });
      const len = c.comp === 'sparse' ? sd * 9 : sd * 2.4;
      for (const m of notes) this.keys(this.stepTime(t0, s), freqOf(m), len, v);
    }

    // --- drums ---
    for (let s = 0; s < STEPS; s++) {
      const t = this.stepTime(t0, s);
      const beat = Math.floor(s / 3);
      const sub = s % 3;
      if (L.ride) {
        if (sub === 0) this.ride(t, beat % 2 ? 0.8 : 1);
        else if (sub === 2 && beat % 2 === 1) this.ride(t, 0.55);
      }
      if (L.brush && sub === 0) this.brush(t, beat % 2 ? 1 : 0.45, sd * 2.5);
      if (L.hat && sub === 0 && beat % 2 === 1) this.hat(t, 0.8);
      if (L.kick && sub === 0 && (beat === 0 || (c.bossa && beat === 2))) this.kick(t, 1);
      if (L.kick && c.bossa && sub === 2 && beat === 1) this.kick(t, 0.6);
      if (L.rim && [0, 4, 7, 9].includes(s) && bar % 2 === 0) this.rim(t, 0.8);
      if (L.rim && [2, 6, 10].includes(s) && bar % 2 === 1) this.rim(t, 0.8);
      if (L.shaker && sub !== 1) this.shaker(t, sub === 0 ? 0.6 : 1);
    }

    // --- vibes melody (cells per bar) ---
    const cell = CELLS[c.melody[bar % c.melody.length]] || [];
    for (const [s, idx, len] of cell) {
      const ch = this.chordAt(bar, s >= 6 ? 1 : 0);
      const tones = ch.q;
      const oct = Math.floor(idx / tones.length);
      const iv = tones[idx % tones.length];
      let m = 60 + ch.pc + iv + 12 * oct;
      while (m < 67) m += 12;
      while (m > 86) m -= 12;
      this.vibes(this.stepTime(t0, s), freqOf(m), Math.max(0.3, len * sd * 1.3));
    }

    // --- bell sparkle (plinko/slots): an arpeggio every other bar ---
    if (L.bell && bar % 2 === 1) {
      const ch = this.chordAt(bar);
      [0, 1, 2, 3].forEach((i) => {
        const m = 84 + ch.pc + ch.q[i % ch.q.length] - (ch.pc > 5 ? 12 : 0);
        this.bell(this.stepTime(t0, 6 + i), freqOf(m));
      });
    }
  }

  // --- instruments --------------------------------------------------------------

  bass(t, f, dur, v = 1) {
    const L = this.layer('bass');
    tone(this.ctx, L, t, { type: 'triangle', freq: f, dur: dur + 0.1, peak: 0.55 * v, attack: 0.012, lp: 650 });
    tone(this.ctx, L, t, { type: 'sine', freq: f, dur: dur + 0.15, peak: 0.45 * v, attack: 0.01 });
    noise(this.ctx, this.noise, L, t, { dur: 0.03, peak: 0.08 * v, lp: 500 });
  }

  /** Electric piano: sine body + a quick bell tine. */
  keys(t, f, dur, v) {
    const L = this.layer('keys');
    tone(this.ctx, L, t, { freq: f, dur: dur + 0.25, peak: 0.22 * v, attack: 0.006 });
    tone(this.ctx, L, t, { type: 'triangle', freq: f, dur: dur * 0.6 + 0.1, peak: 0.06 * v, attack: 0.006, lp: 1800 });
    tone(this.ctx, L, t, { freq: f * 3.5, dur: 0.12, peak: 0.035 * v, attack: 0.002 });
  }

  vibes(t, f, dur) {
    const L = this.layer('lead');
    const marimba = this.cfg.vibes === 'marimba';
    tone(this.ctx, L, t, { freq: f, dur: marimba ? 0.35 : dur + 0.4, peak: 0.32, attack: 0.003 });
    tone(this.ctx, L, t, { freq: f * 4, dur: 0.15, peak: marimba ? 0.12 : 0.06, attack: 0.002 });
    if (!marimba) tone(this.ctx, L, t, { freq: f * 2.0, dur: dur * 0.5, peak: 0.04, attack: 0.004 });
  }

  bell(t, f) {
    const L = this.layer('bell');
    tone(this.ctx, L, t, { freq: f, dur: 0.5, peak: 0.2, attack: 0.002 });
    tone(this.ctx, L, t, { freq: f * 2.76, dur: 0.18, peak: 0.06, attack: 0.002 });
  }

  ride(t, v) {
    const L = this.layer('ride');
    noise(this.ctx, this.noise, L, t, { dur: 0.32, peak: 0.35 * v, hp: 6500 });
    tone(this.ctx, L, t, { type: 'square', freq: 3520, dur: 0.12, peak: 0.03 * v, hp: 2500 });
    tone(this.ctx, L, t, { type: 'square', freq: 5150, dur: 0.09, peak: 0.02 * v, hp: 2500 });
  }

  brush(t, v, dur) {
    noise(this.ctx, this.noise, this.layer('brush'), t, { dur, peak: 0.4 * v, bp: 3200, q: 0.6, attack: dur * 0.3 });
  }

  hat(t, v) {
    noise(this.ctx, this.noise, this.layer('brush'), t, { dur: 0.045, peak: 0.35 * v, hp: 7000 });
  }

  kick(t, v) {
    tone(this.ctx, this.layer('kick'), t, { freq: 95, to: 48, glide: 0.12, dur: 0.28, peak: 0.6 * v, attack: 0.003 });
  }

  rim(t, v) {
    const L = this.layer('perc');
    tone(this.ctx, L, t, { type: 'triangle', freq: 1650, dur: 0.04, peak: 0.25 * v, attack: 0.001 });
    noise(this.ctx, this.noise, L, t, { dur: 0.02, peak: 0.25 * v, bp: 2400, q: 4 });
  }

  shaker(t, v) {
    noise(this.ctx, this.noise, this.layer('perc'), t, { dur: 0.06, peak: 0.25 * v, hp: 5500, attack: 0.015 });
  }

  // --- transport ------------------------------------------------------------------

  pause(fadeS) {
    if (this.paused || this.stopped) return;
    this.paused = true;
    clearInterval(this.timer);
    this.timer = null;
    this.ramp(0, fadeS);
  }

  resume(fadeS) {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.ramp(1, fadeS);
    if (!this.manual) this.timer = setInterval(this.tick, AUDIO.SCHEDULER_MS);
    this.schedule();
  }

  stop(fadeS) {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.manual) Sequencer.live -= 1;
    clearInterval(this.timer);
    this.timer = null;
    this.ramp(0, fadeS);
    const g = this.out;
    setTimeout(() => {
      try { g.disconnect(); } catch { /* already gone */ }
    }, (fadeS + AUDIO.LOOKAHEAD_S + 3) * 1000);
  }

  ramp(value, fadeS) {
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + Math.max(0.01, fadeS));
  }
}
