// =============================================================================
// Procedural chiptune for Soba Guard: a cozy night market in the noodle-house
// garden. D tonic, Japanese pentatonic scales:
//   yo scale (D E G A B)   — menus, battle, "Garden saved!" results
//   in scale (D Eb G A Bb) — huge-wave tension, "The rats got in!" results
// Melodies are stored as scale degrees, so the tension layer replays the same
// tune in the darker In scale.
//
// One look-ahead step sequencer (16th-note steps, setInterval + AudioContext
// clock; notes are scheduled AUDIO.LOOKAHEAD_S ahead, never by setTimeout).
// Loop = 16 bars: phrase A (8) + phrase B (8) over D Bm G A D E G A.
//
// Tracks and vertical layers (changes land on the next bar line):
//   menu     soft koto lead, long bass, D/A drone, shakuhachi answers     88 bpm
//   battle 1 (waves 1-3)  chip pulse lead, soft bass, kakko woodblock     104 bpm
//   battle 2 (waves 4-7)  + walking bass, taiko, 8th hats, koto arpeggio  106 bpm
//   battle 3 (waves 8-10) + matsuri taiko fills, 16th hats, chappa,
//                           fue flute doubling the long notes             110 bpm
//   + tension (a huge / flag wave is on): In scale, driving bass, busy taiko,
//                           shime-daiko 16ths, low drone                  114 bpm
//   results  horizontal re-sequencing: an intro segment (win fanfare or
//            lose sting) then a calm koto loop (yo after a win, In after a loss)
// =============================================================================

import { AUDIO } from './AudioConstants.js';
import {
  dbToGain, degreeOf, freqOfDegree, tone, noise, pluck, flute, chip, silentGain, EPS,
} from './synth.js';

const STEPS = 16;          // per bar
const LOOP_BARS = 16;      // phrase A + phrase B

/** "E5 - G5 . ^A5" -> [{ step, deg, len, bend }]; '-' holds, '.' rests, '^' bends up into the note. */
export function parseLine(line) {
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

// Lead, phrase A: a bouncy little stall-keeper's tune
export const LEAD_A = [
  'D5 . E5 . G5 . . . A5 . G5 . E5 . D5 .',
  'B4 . . . D5 . E5 . D5 - - . B4 . A4 .',
  'G4 . B4 . D5 . G5 . E5 - - . D5 . B4 .',
  'A4 - - . E5 . D5 . ^E5 - - - . . . .',
  'D5 . E5 . G5 . A5 . B5 - - . A5 . G5 .',
  'E5 - - . G5 . E5 . D5 . B4 . D5 . E5 .',
  'G5 . . . E5 . D5 . B4 . D5 . E5 . G5 .',
  'A5 - - - D5 - - - . . . . . . . .',
];
// Phrase B: higher, call and response
export const LEAD_B = [
  'A5 . B5 . D6 - - . B5 . A5 . G5 . A5 .',
  'B5 - - . A5 . G5 . E5 - - . . . . .',
  'G5 . A5 . B5 . D6 . E6 - - . D6 . B5 .',
  'A5 - - . G5 . E5 . ^E5 - - - D5 . E5 .',
  'D6 . . . B5 . A5 . B5 . D6 . E6 . D6 .',
  'E6 - - . D6 . B5 . A5 - - . G5 . E5 .',
  'G5 . E5 . D5 . E5 . G5 . A5 . B5 . A5 .',
  'D6 - - - - - - - . . . . . . . .',
];
// Shakuhachi answers (menu / results): only in the lead's gaps
const SHAKU_A = [R, R, R, '. . . . . . . . . . . . A4 - B4 -', R, R, R, '. . . . . . . . A4 - - - B4 - - -'];
const SHAKU_B = [R, '. . . . . . . . . . . . D5 - - -', R, R, R, R, R, '. . . . . . . . A5 - - - - - - -'];

const LEAD = { A: LEAD_A.map(parseLine), B: LEAD_B.map(parseLine) };
const SHAKU = { A: SHAKU_A.map(parseLine), B: SHAKU_B.map(parseLine) };

// Bar roots (same for both phrases): D Bm G A D E G A
const ROOTS = ['D3', 'B2', 'G2', 'A2', 'D3', 'E3', 'G2', 'A2'].map(degreeOf);

// Bass patterns: [step, degrees above the root (3 ~ fifth, 5 = octave), length in steps]
const BASS = {
  long: [[0, 0, 14]],
  soft: [[0, 0, 6], [8, 3, 4], [14, 5, 1]],
  walk: [[0, 0, 3], [3, 0, 1], [6, 3, 2], [8, 5, 2], [10, 3, 2], [12, 0, 2], [14, 3, 1]],
  drive: [[0, 0, 1], [2, 0, 1], [4, 5, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 5, 1], [14, 3, 1]],
};

// Koto arpeggio over the bar root's pitch class (degrees above it)
const ARP = [0, 2, 3, 5, 3, 2, 3, 5, 0, 2, 3, 5, 6, 5, 3, 2];

// Taiko: X accent, x medium, o soft
const TAIKO = {
  band2: 'X.......x.......',
  band2Fill: 'X.......x..x..X.',
  band3: 'X..x..X...x.X.x.',
  band3Fill: 'X.x.X.x.XxXxXxXx',
  drive: 'X..x..X.X..x..X.',
  driveFill: 'X..x..X.XxXxXxXx',
};
const SHIME = 'XoxoXoxoXoxoXxXx';
const VEL = { X: 1, x: 0.6, o: 0.35 };

// --- Results intros (horizontal re-sequencing) ---------------------------------

const INTROS = {
  // "Garden saved!": a chip run up the yo scale, a bounce, a big open strum
  win: {
    bpm: () => AUDIO.FANFARE_BPM,
    scale: 'yo',
    lead: ['G5 A5 B5 D6 . B5 D6 E6 G6 - - - E6 . G6 .', 'A6 - - - - - D6 - - - - - - - - -'].map(parseLine),
    bass: [[0, 0, 'G2', 8], [0, 8, 'A2', 8], [1, 0, 'D2', 16]],
    taiko: ['X.......X...X.x.', 'X...............'],
    strum: { bar: 1, step: 6, notes: ['D4', 'A4', 'D5', 'E5', 'A5'] },
    chappa: [[0, 12], [1, 0]],
  },
  // The rats got in: a slow fall down the In scale, then a low shakuhachi breath
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

function trackConfig(track, section, tension, variant) {
  if (track === 'menu') {
    return {
      bpm: AUDIO.MENU_BPM, scale: 'yo', phrases: ['A', 'B'], lead: { voice: 'koto', gain: 0.8, bright: 0.75 },
      bass: 'long', drone: true, shaku: true,
    };
  }
  if (track === 'results') {
    const lose = variant === 'lose';
    return {
      bpm: AUDIO.RESULTS_BPM, scale: lose ? 'in' : 'yo', phrases: ['A', 'B'],
      lead: { voice: 'koto', gain: 0.85, bright: lose ? 0.6 : 0.8 }, bass: 'soft', shaku: true, drone: lose,
    };
  }
  const b = Math.max(1, Math.min(3, section || 1));
  let c;
  if (b === 1) {
    c = { scale: 'yo', phrases: ['A', 'B'], lead: { voice: 'chip', gain: 1 }, bass: 'soft', kakko: true };
  } else if (b === 2) {
    c = {
      scale: 'yo', phrases: ['A', 'B'], lead: { voice: 'chip', gain: 1 }, bass: 'walk',
      kakko: true, taiko: 'band2', hats: 8, arp: true,
    };
  } else {
    c = {
      scale: 'yo', phrases: ['A', 'B'], lead: { voice: 'chip', gain: 1 }, bass: 'walk',
      kakko: true, taiko: 'band3', hats: 16, arp: true, chappa: true, fue: true,
    };
  }
  c.bpm = AUDIO.BATTLE_BPM[b - 1];
  if (tension) {
    Object.assign(c, {
      bpm: AUDIO.TENSION_BPM, scale: 'in', bass: 'drive', taiko: 'drive', shime: true, drone: true,
      hats: c.hats || 8, tension: true,
    });
  }
  return c;
}

function layerNames(c) {
  const l = [c.lead.voice === 'chip' ? 'chip' : 'lead', 'bass'];
  if (c.drone) l.push('drone');
  if (c.shaku) l.push('shaku');
  if (c.kakko) l.push('kakko');
  if (c.taiko) l.push('taiko');
  if (c.hats) l.push(`hats${c.hats}`);
  if (c.arp) l.push('arp');
  if (c.chappa) l.push('chappa');
  if (c.fue) l.push('flute');
  if (c.shime) l.push('shime');
  if (c.tension) l.push('tension');
  return l;
}

// =============================================================================

export class Sequencer {
  /** Sequencers whose scheduler is running (must never exceed 1). */
  static live = 0;

  /**
   * @param {AudioContext|OfflineAudioContext} ctx
   * @param {{out: AudioNode, rev?: AudioNode, noise: AudioBuffer}} dest
   * @param {{track: 'menu'|'battle'|'results', section?: number, tension?: boolean,
   *          intro?: 'win'|'lose'|null, delay?: number, manual?: boolean}} opts
   *   manual: no timer (offline rendering calls scheduleUntil itself)
   */
  constructor(ctx, dest, { track, section = 1, tension = false, intro = null, delay = 0, manual = false }) {
    this.manual = manual;
    if (!manual) Sequencer.live += 1;
    this.ctx = ctx;
    this.dest = dest;
    this.noise = dest.noise;
    this.track = track;
    this.section = section;
    this.tension = !!tension;
    this.variant = intro;
    this.pending = null;
    this.layerNodes = {};
    this.paused = false;
    this.stopped = false;
    this.bars = 0;

    this.intro = intro && INTROS[intro] ? INTROS[intro] : null;
    this.segment = this.intro ? 'intro' : 'loop';
    this.cfg = trackConfig(track, section, this.tension, intro);
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

  /** Wave band / tension change: applied on the next bar line. */
  setState(section, tension) {
    if (this.track !== 'battle') return;
    const want = { section, tension: !!tension };
    if (want.section === this.section && want.tension === this.tension) { this.pending = null; return; }
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
      this.tension = this.pending.tension;
      this.pending = null;
      this.cfg = trackConfig(this.track, this.section, this.tension, this.variant);
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
      if (c.lead.voice === 'chip') {
        chip(this.ctx, this.layer('chip'), t, f, Math.min(1.4, n.len * sd * 0.92), vel, { lp: c.tension ? 2000 : 2600 });
      } else {
        pluck(this.ctx, this.layer('lead'), t, f, Math.min(1.6, 0.35 + n.len * sd * 0.9), vel, { bend: n.bend, bright: c.lead.bright });
      }
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
    if (c.shime) {
      const v = VEL[SHIME[s]];
      if (v) this.shime(t, v);
    }
    if (c.hats === 8 && s % 2 === 0) this.hat(t, s % 4 === 2 ? 1 : 0.6);
    if (c.hats === 16) this.hat(t, s % 2 === 0 ? 1 : 0.45);
    if (c.kakko && (s === 4 || s === 12)) this.kakko(t, 1);
    if (c.chappa && s % 4 === 2) this.chappa(t, s === 14 ? 1 : 0.7);
  }

  playIntroStep(t) {
    const it = this.intro;
    const sd = this.stepDur();
    const bar = Math.floor(this.step / STEPS);
    const s = this.step % STEPS;
    const sc = it.scale;
    for (const n of it.lead[bar] || []) {
      if (n.step !== s) continue;
      const f = freqOfDegree(n.deg, sc);
      if (this.variant === 'win') chip(this.ctx, this.layer('chip'), t, f, Math.min(1.2, n.len * sd * 0.95), 0.6, { lp: 3200 });
      else pluck(this.ctx, this.layer('lead'), t, f, Math.min(2.2, 0.4 + n.len * sd), 0.55, { bend: n.bend, bright: 1.1 });
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

  /** Shime-daiko: the small, tight festival drum (tension 16ths). */
  shime(t, v) {
    const L = this.layer('shime');
    tone(this.ctx, L, t, { type: 'triangle', freq: 420, to: 300, glide: 0.04, dur: 0.07, peak: 0.6 * v, attack: 0.001 });
    noise(this.ctx, this.noise, L, t, { dur: 0.04, peak: 0.35 * v, bp: 1800, q: 1.5 });
  }

  hat(t, v) {
    noise(this.ctx, this.noise, this.layer('hats'), t, { dur: 0.035, peak: 0.5 * v, hp: 7500 });
  }

  /** Kakko / woodblock click on 2 and 4. */
  kakko(t, v) {
    const L = this.layer('kakko');
    tone(this.ctx, L, t, { type: 'sine', freq: 1250, to: 1120, dur: 0.05, peak: 0.6 * v, attack: 0.001 });
    noise(this.ctx, this.noise, L, t, { dur: 0.025, peak: 0.35 * v, bp: 2600, q: 3 });
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
