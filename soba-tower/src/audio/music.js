// =============================================================================
// Procedural chiptune for Soba Tower, in D with Japanese pentatonic scales.
//   yo scale (D E G A B)  — zones 1-3, title, "BELL RUNG!" results
//   in scale (D Eb G A Bb) — zone 4 night, game-over results
// Melodies are stored as scale degrees, so zone 4 replays the same tune in
// the darker In scale (bar 5's E chord becomes Eb: a Japanese bII).
//
// One look-ahead step sequencer (16th-note steps, setInterval + AudioContext
// clock; notes are scheduled AUDIO.LOOKAHEAD_S ahead, never by setTimeout).
//
// Loop = 16 bars: phrase A (8) + phrase B (8) over D D G A E G A D.
// Vertical layering by track / zone (changes land on the next bar line):
//   title    koto lead (soft), long bass, drone, shakuhachi responses      92 bpm
//   zone 1   koto lead + soft bass                                        110 bpm
//   zone 2   + walking bass, taiko, 8th hats, kakko woodblock             112 bpm
//   zone 3   + festival: 16th hats, chappa cymbals, koto arpeggio,
//              fue flute doubling the long notes, matsuri taiko + fills    116 bpm
//   zone 4   night: In scale, phrase A only, darker lead, drone, heartbeat
//              taiko, ticking woodblock (thinner)                         118 bpm
//   zone 4 + drive (near the top): driving 8th bass, busy taiko, 16th hats,
//              arpeggio back, phrase B returns
//   results  horizontal re-sequencing: an intro segment (win fanfare or
//              lose sting) then a calm loop (yo after a win, In after a loss)
// =============================================================================

import { AUDIO } from '../core/Constants.js';
import {
  dbToGain, degreeOf, freqOfDegree, tone, noise, pluck, flute, silentGain, EPS,
} from './synth.js';

const STEPS = 16;          // per bar
const LOOP_BARS = 16;      // phrase A + phrase B

/** "E5 - G5 . ^A5" -> [{ step, deg, len, bend }]; '-' holds, '.' rests, '^' bends up into the note. */
function parseLine(line) {
  const out = [];
  let cur = null;
  line.trim().split(/\s+/).forEach((tok, i) => {
    if (tok === '-') {
      if (cur) cur.len += 1;
      return;
    }
    cur = null;
    if (tok === '.') return;
    const bend = tok.startsWith('^');
    const deg = degreeOf(bend ? tok.slice(1) : tok);
    if (deg === null) return;
    cur = { step: i, deg, len: 1, bend };
    out.push(cur);
  });
  return out;
}

const R = '. . . . . . . . . . . . . . . .';

// Koto lead, phrase A (calm, call and response)
const LEAD_A = [
  'A4 . . . D5 . E5 . A5 - - . G5 . E5 .',
  'D5 - - . . . . . E5 . D5 . B4 . A4 .',
  'G4 . . . B4 . D5 . G5 - - . E5 . D5 .',
  '^E5 - - - - - . . . . . . A4 . B4 .',
  'D5 . . . E5 . G5 . B5 - - . A5 . G5 .',
  'E5 - - . D5 . E5 . G5 - - . E5 . D5 .',
  'B4 . . . A4 . B4 . D5 - - . ^E5 - - .',
  'D5 - - - - - - - . . . . . . . .',
];
// Phrase B (higher, more motion)
const LEAD_B = [
  'D6 . B5 . A5 - - . B5 . A5 . G5 . E5 .',
  'D5 . E5 . G5 . A5 . ^B5 - - - A5 . . .',
  'G5 . A5 . B5 - - . D6 . B5 . A5 . G5 .',
  'A5 - - . E5 - - . G5 . E5 . D5 . . .',
  'E5 . G5 . B5 - - . E6 - - . D6 . B5 .',
  'D6 - - . B5 . G5 . A5 . G5 . E5 . . .',
  'D5 . E5 . A5 - - . G5 . E5 . D5 . B4 .',
  '^E5 - - . D5 - - - - - - - . . . .',
];
// Shakuhachi answers (title / results): only in the koto's gaps
const SHAKU_A = [R, R, R, '. . . . . . . . . . A4 - - - B4 -', R, R, R, '. . . . . . . . E5 - - - D5 - - -'];
const SHAKU_B = [R, R, R, '. . . . . . . . . . . . B4 - - -', R, R, R, '. . . . . . . . A4 - - - - - - -'];

const LEAD = { A: LEAD_A.map(parseLine), B: LEAD_B.map(parseLine) };
const SHAKU = { A: SHAKU_A.map(parseLine), B: SHAKU_B.map(parseLine) };

// Bar roots (same for both phrases): D D G A E G A D
const ROOTS = ['D3', 'D3', 'G2', 'A2', 'E3', 'G2', 'A2', 'D3'].map(degreeOf);

// Bass patterns: [step, degrees above the root (3 = fifth, 5 = octave), length in steps]
const BASS = {
  title: [[0, 0, 14]],
  soft: [[0, 0, 6], [8, 3, 4], [14, 5, 1]],
  walk: [[0, 0, 3], [3, 0, 1], [6, 3, 2], [8, 5, 2], [10, 3, 2], [12, 0, 2], [14, 3, 1]],
  night: [[0, 0, 10], [12, 5, 3]],
  drive: [[0, 0, 1], [2, 0, 1], [4, 5, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 5, 1], [14, 3, 1]],
};

// Koto arpeggio over the bar root's pitch class (degrees above it)
const ARP = [0, 2, 3, 5, 3, 2, 3, 5, 0, 2, 3, 5, 6, 5, 3, 2];

// Taiko: X accent, x medium, o soft
const TAIKO = {
  z2: 'X.........x.....',
  z2Fill: 'X.......x..x..X.',
  z3: 'X..x..X...x.X.x.',
  z3Fill: 'X.x.X.x.XxXxXxXx',
  z4: 'X..o............',
  drive: 'X..x..X.X..x..X.',
  driveFill: 'X..x..X.XxXxXxXx',
};
const VEL = { X: 1, x: 0.6, o: 0.35 };

// --- Results intros (horizontal re-sequencing) ---------------------------------

const INTROS = {
  // "BELL RUNG!": a run up the yo scale, a dotted answer, a big open strum
  win: {
    bpm: () => AUDIO.FANFARE_BPM,
    scale: 'yo',
    lead: ['D5 E5 G5 A5 B5 D6 E6 G6 A6 - - - - - - -', 'B5 . . A5 . . D6 - - - - - - - - -'].map(parseLine),
    bass: [[0, 0, 'D3', 8], [0, 8, 'A2', 8], [1, 6, 'D2', 16]],
    taiko: ['X.......X...X.x.', '......X.........'],
    strum: { bar: 1, step: 6, notes: ['D4', 'A4', 'D5', 'E5', 'A5'] },
    chappa: [[1, 6]],
  },
  // Out of paws: a slow fall down the In scale, then a low shakuhachi breath
  lose: {
    bpm: () => AUDIO.STING_BPM,
    scale: 'in',
    lead: ['A4 - - . G4 - - . E4 - - . D4 - - -', R].map(parseLine),
    shaku: [R, 'D4 - - - - - - - - - - - . . . .'].map(parseLine),
    bass: [[0, 12, 'D2', 20]],
    taiko: ['............o...', '................'],
  },
};

// --- Track configuration ---------------------------------------------------------

function trackConfig(track, section, drive, variant) {
  if (track === 'title') {
    return {
      bpm: AUDIO.TITLE_BPM, scale: 'yo', phrases: ['A', 'B'], lead: { gain: 0.8, bright: 0.75 },
      bass: 'title', drone: true, shaku: true,
    };
  }
  if (track === 'results') {
    const lose = variant === 'lose';
    return {
      bpm: AUDIO.RESULTS_BPM, scale: lose ? 'in' : 'yo', phrases: ['A', 'B'],
      lead: { gain: 0.85, bright: lose ? 0.6 : 0.8 }, bass: 'soft', shaku: true, drone: lose,
    };
  }
  const z = Math.max(1, Math.min(4, section || 1));
  const bpm = AUDIO.ZONE_BPM[z - 1];
  if (z === 1) return { bpm, scale: 'yo', phrases: ['A', 'B'], lead: { gain: 1, bright: 1 }, bass: 'soft' };
  if (z === 2) {
    return {
      bpm, scale: 'yo', phrases: ['A', 'B'], lead: { gain: 1, bright: 1 }, bass: 'walk',
      taiko: 'z2', hats: 8, kakko: true,
    };
  }
  if (z === 3) {
    return {
      bpm, scale: 'yo', phrases: ['A', 'B'], lead: { gain: 1, bright: 1.1 }, bass: 'walk',
      taiko: 'z3', hats: 16, kakko: true, chappa: true, arp: true, fue: true,
    };
  }
  if (!drive) {
    return {
      bpm, scale: 'in', phrases: ['A', 'A'], lead: { gain: 0.8, bright: 0.6 }, bass: 'night',
      taiko: 'z4', drone: true, tick: true,
    };
  }
  return {
    bpm, scale: 'in', phrases: ['A', 'B'], lead: { gain: 0.9, bright: 0.85 }, bass: 'drive',
    taiko: 'drive', hats: 16, drone: true, arp: true, drive: true,
  };
}

function layerNames(c) {
  const l = ['lead', 'bass'];
  if (c.drone) l.push('drone');
  if (c.shaku) l.push('shaku');
  if (c.taiko) l.push('taiko');
  if (c.hats) l.push(`hats${c.hats}`);
  if (c.kakko) l.push('kakko');
  if (c.tick) l.push('tick');
  if (c.chappa) l.push('chappa');
  if (c.arp) l.push('arp');
  if (c.fue) l.push('flute');
  if (c.drive) l.push('drive');
  return l;
}

// =============================================================================

export class Sequencer {
  /** Sequencers whose scheduler is running (must never exceed 1). */
  static live = 0;

  /**
   * @param {AudioContext|OfflineAudioContext} ctx
   * @param {{out: AudioNode, rev?: AudioNode, noise: AudioBuffer}} dest
   * @param {{track: 'title'|'game'|'results', section?: number, drive?: boolean,
   *          intro?: 'win'|'lose'|null, delay?: number, manual?: boolean}} opts
   *   manual: no timer (offline rendering calls scheduleUntil itself)
   */
  constructor(ctx, dest, { track, section = 1, drive = false, intro = null, delay = 0, manual = false }) {
    this.manual = manual;
    if (!manual) Sequencer.live += 1;
    this.ctx = ctx;
    this.dest = dest;
    this.noise = dest.noise;
    this.track = track;
    this.section = section;
    this.drive = !!drive;
    this.variant = intro;
    this.pending = null;
    this.layerNodes = {};
    this.paused = false;
    this.stopped = false;
    this.bars = 0;

    this.intro = intro && INTROS[intro] ? INTROS[intro] : null;
    this.segment = this.intro ? 'intro' : 'loop';
    this.cfg = trackConfig(track, section, this.drive, intro);
    this.step = 0;

    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest.out);

    this.nextTime = ctx.currentTime + 0.06 + delay;
    if (!manual) {
      this.tick = () => this.schedule();
      this.timer = setInterval(this.tick, AUDIO.SCHEDULER_MS);
      this.schedule();
    }
  }

  get bpm() {
    return this.segment === 'intro' ? this.intro.bpm() : this.cfg.bpm;
  }

  get scale() {
    return this.segment === 'intro' ? this.intro.scale : this.cfg.scale;
  }

  layers() {
    if (this.segment === 'intro') return [`intro:${this.variant}`];
    return layerNames(this.cfg);
  }

  stepDur() {
    return 60 / this.bpm / 4;
  }

  /** Zone change: applied on the next bar line. */
  setSection(section) {
    if (this.track !== 'game') return;
    const want = { section, drive: this.pending?.drive ?? this.drive };
    if (section === this.section && want.drive === this.drive) { this.pending = null; return; }
    this.pending = want;
  }

  /** Drive layer near the top of zone 4: applied on the next bar line. */
  setDrive(drive) {
    if (this.track !== 'game') return;
    const want = { section: this.pending?.section ?? this.section, drive: !!drive };
    if (want.section === this.section && want.drive === this.drive) { this.pending = null; return; }
    this.pending = want;
  }

  // --- scheduling -------------------------------------------------------------------

  schedule() {
    if (this.stopped || this.paused) return;
    const now = this.ctx.currentTime;
    // The context stalled (suspended / throttled tab): don't burst-play a backlog
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    this.scheduleUntil(now + AUDIO.LOOKAHEAD_S);
  }

  /** Schedules every step that starts before `horizon` (also used offline). */
  scheduleUntil(horizon) {
    while (this.nextTime < horizon) {
      if (this.step % STEPS === 0) this.onBar();
      if (this.segment === 'intro') this.playIntroStep(this.nextTime);
      else this.playStep(this.nextTime);
      this.nextTime += this.stepDur();
      this.step += 1;
      if (this.segment === 'loop') this.step %= STEPS * LOOP_BARS;
    }
  }

  onBar() {
    if (this.segment === 'intro' && this.step >= this.intro.lead.length * STEPS) {
      this.segment = 'loop';
      this.step = 0;
    }
    if (this.pending) {
      this.section = this.pending.section;
      this.drive = this.pending.drive;
      this.pending = null;
      this.cfg = trackConfig(this.track, this.section, this.drive, this.variant);
    }
    this.bars += 1;
  }

  /** Per-layer gain (+ pan, + reverb send), created on first use. */
  layer(name) {
    let node = this.layerNodes[name];
    if (node) return node;
    const ctx = this.ctx;
    node = ctx.createGain();
    node.gain.value = dbToGain(AUDIO.MIX[name] ?? -12);
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

  playStep(t) {
    const c = this.cfg;
    const sd = this.stepDur();
    const bar = Math.floor(this.step / STEPS);
    const s = this.step % STEPS;
    const phrase = c.phrases[Math.floor(bar / 8) % 2];
    const pb = bar % 8;
    const root = ROOTS[pb];
    const sc = c.scale;

    for (const n of LEAD[phrase][pb]) {
      if (n.step !== s) continue;
      const f = freqOfDegree(n.deg, sc);
      const vel = 0.5 * c.lead.gain * (0.92 + Math.random() * 0.12);
      pluck(this.ctx, this.layer('lead'), t, f, Math.min(1.6, 0.35 + n.len * sd * 0.9), vel, { bend: n.bend, bright: c.lead.bright });
      if (c.fue && n.len >= 3) {
        flute(this.ctx, this.noise, this.layer('flute'), t, f, n.len * sd + 0.05, 0.5, { breath: 0.06, attack: 0.05 });
      }
    }
    if (c.shaku) {
      for (const n of SHAKU[phrase][pb]) {
        if (n.step === s) flute(this.ctx, this.noise, this.layer('shaku'), t, freqOfDegree(n.deg, sc), n.len * sd, 0.5, { breath: 0.22, attack: 0.14 });
      }
    }
    if (c.bass) {
      for (const [st, off, len] of BASS[c.bass]) {
        if (st === s) this.bassNote(t, freqOfDegree(root + off, sc), len * sd);
      }
    }
    if (c.drone && s === 0) this.drone(t, STEPS * sd);
    if (c.arp) {
      const pc = ((root % 5) + 5) % 5;
      pluck(this.ctx, this.layer('arp'), t, freqOfDegree(pc + ARP[s], sc), 0.2, s % 4 === 0 ? 0.4 : 0.28, { bright: 0.7, bite: 0.6 });
    }
    if (c.taiko) {
      const fill = pb === 7 ? TAIKO[`${c.taiko}Fill`] : null;
      const v = VEL[(fill || TAIKO[c.taiko])[s]];
      if (v) this.taiko(t, v);
    }
    if (c.hats === 8 && s % 2 === 0) this.hat(t, s % 4 === 2 ? 1 : 0.6);
    if (c.hats === 16) this.hat(t, s % 2 === 0 ? 1 : 0.45);
    if (c.kakko && (s === 4 || s === 12)) this.kakko(t, 1, 1);
    if (c.tick && (s === 6 || s === 14)) this.kakko(t, 0.5, 1.35);
    if (c.chappa && s % 4 === 2) this.chappa(t, s === 14 ? 1 : 0.7);
  }

  playIntroStep(t) {
    const it = this.intro;
    const sd = this.stepDur();
    const bar = Math.floor(this.step / STEPS);
    const s = this.step % STEPS;
    const sc = it.scale;
    for (const n of it.lead[bar] || []) {
      if (n.step === s) pluck(this.ctx, this.layer('lead'), t, freqOfDegree(n.deg, sc), Math.min(2.2, 0.4 + n.len * sd), 0.55, { bend: n.bend, bright: 1.1 });
    }
    for (const n of (it.shaku && it.shaku[bar]) || []) {
      if (n.step === s) flute(this.ctx, this.noise, this.layer('shaku'), t, freqOfDegree(n.deg, sc), n.len * sd, 0.55, { breath: 0.3, attack: 0.2 });
    }
    for (const [b, st, name, len] of it.bass) {
      if (b === bar && st === s) this.bassNote(t, freqOfDegree(degreeOf(name), sc), len * sd);
    }
    const tk = it.taiko && it.taiko[bar];
    if (tk && VEL[tk[s]]) this.taiko(t, VEL[tk[s]]);
    if (it.strum && it.strum.bar === bar && it.strum.step === s) {
      it.strum.notes.forEach((n, i) => {
        pluck(this.ctx, this.layer('lead'), t + i * 0.035, freqOfDegree(degreeOf(n), sc), 2.2, 0.32, { bright: 0.9 });
      });
    }
    for (const [b, st] of it.chappa || []) if (b === bar && st === s) this.chappa(t, 1);
  }

  // --- voices -------------------------------------------------------------------

  bassNote(t, f, dur) {
    const d = Math.max(0.12, dur);
    const L = this.layer('bass');
    tone(this.ctx, L, t, { type: 'triangle', freq: f, dur: d + 0.08, peak: 0.6, attack: 0.008, hold: d * 0.55, lp: 900 });
    tone(this.ctx, L, t, { type: 'sine', freq: f, dur: d + 0.08, peak: 0.35, attack: 0.008, hold: d * 0.55 });
  }

  /** Pedal drone on D2 + A2 for one bar; long attack/release overlap the next bar's drone. */
  drone(t, barDur) {
    const ctx = this.ctx;
    const g = silentGain(ctx);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.6);
    g.gain.setValueAtTime(0.5, t + barDur);
    g.gain.setTargetAtTime(EPS, t + barDur, 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(g);
    g.connect(this.layer('drone'));
    const end = t + barDur + 2.2;
    [[73.42, 'sine', 1], [110, 'sine', 0.6], [146.83, 'triangle', 0.18]].forEach(([f, type, amp]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 6;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a);
      a.connect(lp);
      o.start(t);
      o.stop(end);
    });
  }

  taiko(t, v) {
    const L = this.layer('taiko');
    tone(this.ctx, L, t, { type: 'sine', freq: 128, to: 52, glide: 0.2, dur: 0.55, peak: 0.9 * v, attack: 0.003 });
    tone(this.ctx, L, t, { type: 'triangle', freq: 210, to: 95, glide: 0.06, dur: 0.1, peak: 0.22 * v, attack: 0.002 });
    noise(this.ctx, this.noise, L, t, { dur: 0.07, peak: 0.3 * v, lp: 1000 });
  }

  hat(t, v) {
    noise(this.ctx, this.noise, this.layer('hats'), t, { dur: 0.035, peak: 0.5 * v, hp: 7500 });
  }

  /** Kakko / woodblock click (also the zone-4 night tick, pitched up). */
  kakko(t, v, pitch) {
    const L = this.layer(pitch > 1 ? 'tick' : 'kakko');
    tone(this.ctx, L, t, { type: 'sine', freq: 1250 * pitch, to: 1120 * pitch, dur: 0.05, peak: 0.6 * v, attack: 0.001 });
    noise(this.ctx, this.noise, L, t, { dur: 0.025, peak: 0.35 * v, bp: 2600 * pitch, q: 3 });
  }

  /** Chappa: small festival cymbals. */
  chappa(t, v) {
    const L = this.layer('chappa');
    noise(this.ctx, this.noise, L, t, { dur: 0.16, peak: 0.5 * v, bp: 5500, q: 0.9 });
    tone(this.ctx, L, t, { type: 'square', freq: 3120, dur: 0.09, peak: 0.05 * v, hp: 2000 });
    tone(this.ctx, L, t, { type: 'square', freq: 4470, dur: 0.07, peak: 0.04 * v, hp: 2000 });
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
    }, (fadeS + AUDIO.LOOKAHEAD_S + 0.2) * 1000);
  }

  ramp(value, fadeS) {
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + Math.max(0.01, fadeS));
  }
}
