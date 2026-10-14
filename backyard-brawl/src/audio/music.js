// Procedural chiptune for Backyard Brawl: a look-ahead step sequencer
// (16th-note steps) that plays the song data in songs.js. Engine from
// booker-run, generalized to any number of sections per song.
//
// Tracks: menu, battle (5 intensity sections), boss (2 phases, kit variant),
// results. Section changes land on the next bar line (a soft crash cymbal
// when the section rises). Tempo may change per section (song.bpm array).
//
// Voices: square / triangle / sine, plus band-limited pulse waves (25% and
// 12.5% duty). A song may have an echo bus (feedback delay) that the lead,
// pad and arp send to.

import { AUDIO } from './audioConfig.js';
import { resolveSong } from './songs.js';
import { midiOf, freqOf, setWave } from './synth.js';

export { midiOf, freqOf, setWave };

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// --- song compilation ----------------------------------------------------------

/** "E5 - G5 . " -> [{ step, midi, len }] ; '-' holds the previous note, '.' rests. */
function parseLine(line, toValue) {
  const tokens = line.trim().split(/\s+/);
  const out = [];
  let cur = null;
  tokens.forEach((t, i) => {
    if (t === '-') {
      if (cur) cur.len += 1;
      return;
    }
    cur = null;
    if (t === '.') return;
    const v = toValue(t);
    if (v == null || Number.isNaN(v)) return;
    cur = { step: i, value: v, len: 1 };
    out.push(cur);
  });
  return out;
}

const GRID_WEIGHT = { x: 1, o: 0.55, g: 0.3, '.': 0 };
const parseGrid = (s) => s.trim().split(/\s+/).map(t => GRID_WEIGHT[t] ?? 0);

const QUALITY = {
  '': [0, 4, 7, 12],
  m: [0, 3, 7, 12],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  6: [0, 4, 7, 9],
  m7b5: [0, 3, 6, 10],
  sus4: [0, 5, 7, 12],
};

/** 'Am7' -> { root: bass midi (E2..D#3), tones: 4 midi notes from F4..E5 up } */
function parseChord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  const pc = (NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const iv = QUALITY[m[3]] || QUALITY[''];
  const base = 65 + ((pc - 5 + 12) % 12);   // F4..E5: C -> C5, A -> A4 (the original Yard voicing)
  return {
    root: 40 + ((pc - 4 + 12) % 12),        // E2..D#3: C -> C3, A -> A2, F -> F2, G -> G2
    tones: iv.map(i => base + i),
  };
}

const compiled = new Map();

function compile(song) {
  if (compiled.has(song.id)) return compiled.get(song.id);
  const c = {
    lead: song.lead.map(bar => parseLine(bar, midiOf)),
    bass: song.bass.map(bar => parseLine(bar, t => parseInt(t, 10))),
    chords: song.chords.map(parseChord),
    drums: Object.fromEntries(Object.entries(song.drums || {}).map(([k, v]) => [k, parseGrid(v)])),
    stab: song.stab ? parseGrid(song.stab.steps) : null,
    bars: song.lead.length,
  };
  compiled.set(song.id, c);
  return c;
}

/** Layer set, tempo and voice settings for one song / section / variant. */
function buildConfig(song, section, variant) {
  const secs = song.arrange.sections;
  const s = Math.max(1, Math.min(secs.length, section));
  const v = (variant && song.variants?.[variant]) || null;
  const set = new Set([...secs.slice(0, s).flat(), ...(v?.addLayers || [])]);
  if (set.has('hats16')) set.delete('hats8');
  const bpm = Array.isArray(song.bpm) ? song.bpm[s - 1] : song.bpm;
  return {
    bpm,
    section: s,
    layers: set,
    leadVoice: song.leadVoice,
    bassGain: song.bassVoice.gain,
    hatGain: song.hatGain ?? 0.06,
  };
}

// Drum kits: per-voice settings (gains are peaks before the music bus)
const KITS = {
  chip: { kick: [150, 45, 0.16, 0.55], snareNoise: ['highpass', 1500, 1, 0.12, 0.22], snareTone: ['triangle', 190, 0.06, 0.12], hat: ['highpass', 7000, 1, 0.03] },
  clap: { kick: [120, 48, 0.18, 0.5], clap: true, hat: ['bandpass', 6000, 1.5, 0.05, 0.01] },
  soft: { kick: [110, 45, 0.2, 0.42], snareNoise: ['bandpass', 1800, 0.7, 0.2, 0.13], snareTone: ['triangle', 180, 0.05, 0.06], hat: ['highpass', 8000, 1, 0.025] },
  metal: { kick: [170, 40, 0.15, 0.55], click: true, snareNoise: ['bandpass', 2200, 1.5, 0.14, 0.2], ring: [330, 476], hat: ['bandpass', 9000, 5, 0.03] },
};

export class Sequencer {
  /** Sequencers whose scheduler is still running (should never exceed 1). */
  static live = 0;

  /**
   * `manual: true` (offline rendering for QA) skips the timer and the live
   * count; the caller drives it with scheduleUntil(t).
   */
  constructor(ctx, out, noise, { track, section = 1, delay = 0, variant = null, manual = false }) {
    this.manual = manual;
    if (!manual) Sequencer.live += 1;
    this.ctx = ctx;
    this.noise = noise;
    this.track = track;
    this.song = resolveSong(track);
    this.variant = variant;
    this.data = compile(this.song);
    const kit = (variant && this.song.variants?.[variant]?.kit) || this.song.kit;
    this.kit = KITS[kit] || KITS.chip;
    this.cfg = buildConfig(this.song, section, variant);
    this.section = this.cfg.section;
    this.pendingSection = null;
    this.stepsPerBar = this.song.stepsPerBar;
    this.totalSteps = this.stepsPerBar * this.data.bars;
    this.step = 0;
    this.paused = false;
    this.stopped = false;

    this.gain = ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(out);
    this.echoIn = null;
    if (this.song.echo) this.makeEcho(this.song.echo);

    this.nextTime = ctx.currentTime + 0.06 + delay;
    this.tick = () => this.schedule();
    this.timer = null;
    if (manual) return;
    this.timer = setInterval(this.tick, AUDIO.SCHEDULER_MS);
    this.schedule();
  }

  get bpm() {
    return this.cfg.bpm;
  }

  get songId() {
    return this.song.id;
  }

  get bar() {
    return Math.floor(this.step / this.stepsPerBar);
  }

  layers() {
    const l = [];
    for (const name of this.cfg.layers) {
      if (name === 'lead') l.push(`lead:${this.cfg.leadVoice.wave}`);
      else if (name === 'octave') l.push('lead-octave');
      else l.push(name);
    }
    return l;
  }

  get sectionCount() {
    return this.song.arrange.sections.length;
  }

  setSection(section) {
    const s = Math.max(1, Math.min(this.sectionCount, section));
    if (s === this.section) {
      this.pendingSection = null;
      return;
    }
    this.pendingSection = s;   // applied on the next bar line
  }

  stepDur() {
    return 60 / this.cfg.bpm / 4;
  }

  has(layer) {
    return this.cfg.layers.has(layer);
  }

  schedule() {
    if (this.stopped || this.paused) return;
    const ctx = this.ctx;
    // If the context stalled (suspended, tab throttled), don't burst-schedule a backlog
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    this.scheduleUntil(ctx.currentTime + AUDIO.LOOKAHEAD_S);
  }

  /** Schedules every step that starts before time `end` (seconds, context time). */
  scheduleUntil(end) {
    while (this.nextTime < end) {
      if (this.step % this.stepsPerBar === 0 && this.pendingSection != null) {
        const rising = this.pendingSection > this.section;
        this.section = this.pendingSection;
        this.pendingSection = null;
        this.cfg = buildConfig(this.song, this.section, this.variant);
        this.retimeEcho(this.nextTime);
        if (rising) this.crash(this.nextTime);
      }
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur();
      this.step = (this.step + 1) % this.totalSteps;
    }
  }

  playStep(step, t0) {
    const song = this.song;
    const d = this.data;
    const S = this.stepsPerBar;
    const bar = Math.floor(step / S);
    const s = step % S;
    const chord = d.chords[bar];
    const sd = this.stepDur();
    const t = t0 + (s % 2 === 1 ? (song.swing || 0) * sd : 0);
    const echo = this.has('echo');

    // Lead (+ an octave-up double in the top section)
    if (this.has('lead')) {
      const v = this.cfg.leadVoice;
      for (const n of d.lead[bar]) {
        if (n.step !== s) continue;
        const dur = n.len * sd * (v.gate ?? 0.92);
        this.note(v, n.value, t, dur, 1, echo ? (v.echo || 0) : 0);
        if (this.has('octave') && song.octave) {
          this.note(song.octave, n.value + 12, t, n.len * sd * 0.8, 1, 0);
        }
      }
    }

    // Bass
    if (this.has('bass')) {
      const pat = d.bass[bar % d.bass.length];
      const bv = song.bassVoice;
      for (const n of pat) {
        if (n.step !== s) continue;
        this.note({ ...bv, gain: this.cfg.bassGain }, chord.root + n.value, t, n.len * sd * (bv.gate ?? 0.8), 1, 0);
      }
    }

    // Pad: soft arpeggio on 8ths through the chord tones
    if (this.has('pad') && song.pad && s % 2 === 0) {
      const p = song.pad;
      const idx = p.order[(s / 2) % p.order.length];
      this.note(p, chord.tones[idx] + (p.shift || 0), t, p.len * sd, 1, echo ? (p.echo || 0) : 0);
    }

    // Chord stabs
    if (this.has('stab') && song.stab && d.stab[s] > 0) {
      const st = song.stab;
      const n = st.tones || 3;
      for (let k = 0; k < n; k++) {
        this.note(st, chord.tones[k] + (st.shift || 0), t, (st.len || 1) * sd, d.stab[s], 0);
      }
    }

    // 16th arpeggio
    if (this.has('arp') && song.arp) {
      const a = song.arp;
      const midi = chord.tones[a.order[s % a.order.length]] + (a.shift || 0);
      this.note(a, midi, t, sd * 0.5, 1, echo ? (a.echo || 0) : 0);
    }

    // Drums
    const dr = d.drums;
    const kickGrid = this.has('kick2') && dr.kick2 ? dr.kick2 : dr.kick;
    if (this.has('kick') && kickGrid && kickGrid[s]) this.kick(t, kickGrid[s] * (song.kickGain || 1));
    const sg = song.snareGain || 1;
    if (this.has('snare') && dr.snare && dr.snare[s]) this.snare(t, dr.snare[s] * sg);
    if (this.has('ghost') && dr.ghost && dr.ghost[s]) this.snare(t, dr.ghost[s] * sg);
    if (this.has('clank') && dr.clank && dr.clank[s]) this.clank(t, dr.clank[s]);
    if (this.has('hats8') && dr.hats8 && dr.hats8[s]) this.hat(t, this.cfg.hatGain * dr.hats8[s]);
    if (this.has('hats16') && dr.hats16 && dr.hats16[s]) this.hat(t, this.cfg.hatGain * dr.hats16[s]);
    // Snare fill into each new 8-bar phrase
    if (this.has('fill') && bar % 8 === 7 && s >= S - 4) this.snare(t, (0.45 + 0.15 * (s - (S - 4))) * sg);
  }

  // --- voices ---------------------------------------------------------------

  /**
   * One pitched note. v = { wave, gain, cutoff?, attack?, detune? (cents, makes
   * a detuned pair), vibrato? { rate, cents, after } }.
   */
  note(v, midi, t, dur, gainMul = 1, send = 0) {
    const ctx = this.ctx;
    const attack = v.attack || 0.005;
    dur = Math.max(dur, attack + 0.02);
    const peak = v.gain * gainMul;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack + 0.001, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let input = g;
    if (v.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = v.cutoff;
      f.connect(g);
      input = f;
    }
    const freq = freqOf(midi);
    const oscs = [];
    for (const dt of (v.detune ? [-v.detune, v.detune] : [0])) {
      const o = ctx.createOscillator();
      setWave(ctx, o, v.wave);
      o.frequency.setValueAtTime(freq, t);
      if (dt) o.detune.setValueAtTime(dt, t);
      o.connect(input);
      o.start(t);
      o.stop(t + dur + 0.02);
      oscs.push(o);
    }
    if (v.vibrato && dur > v.vibrato.after + 0.12) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = v.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + v.vibrato.after);
      depth.gain.linearRampToValueAtTime(v.vibrato.cents, t + v.vibrato.after + 0.2);
      lfo.connect(depth);
      oscs.forEach(o => depth.connect(o.detune));
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.connect(this.gain);
    if (send > 0 && this.echoIn) {
      const sg = ctx.createGain();
      sg.gain.value = send;
      g.connect(sg);
      sg.connect(this.echoIn);
    }
  }

  noiseHit(t, dur, peak, type, freq, q = 1, attack = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
    } else {
      g.gain.setValueAtTime(peak, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.gain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  blip(type, freq, t, dur, peak, cutoff = null) {
    this.note({ wave: type, gain: peak, cutoff, attack: 0.002 }, 69 + 12 * Math.log2(freq / 440), t, dur);
  }

  kick(t, w = 1) {
    const ctx = this.ctx;
    const [f0, f1, dur, peak] = this.kit.kick;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.75);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(peak * w, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    if (this.kit.click) this.blip('square', 1300, t, 0.012, 0.06 * w, 4000);
  }

  snare(t, w = 1) {
    const k = this.kit;
    if (k.clap) {
      // Hand clap: three quick bursts and a short tail
      for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 0.02, 0.18 * w, 'bandpass', 1100, 1.2);
      this.noiseHit(t + 0.033, 0.11, 0.15 * w, 'bandpass', 1200, 1);
      return;
    }
    const [type, freq, q, dur, peak] = k.snareNoise;
    this.noiseHit(t, dur, peak * w, type, freq, q);
    if (k.snareTone) {
      const [wave, f, d, p] = k.snareTone;
      this.blip(wave, f, t, d, p * w);
    }
    if (k.ring) k.ring.forEach(f => this.blip('square', f, t, 0.07, 0.025 * w, 3000));
  }

  hat(t, peak) {
    const [type, freq, q, dur, attack = 0] = this.kit.hat;
    this.noiseHit(t, dur, peak, type, freq, q, attack);
  }

  /** Metallic clank: an inharmonic square pair plus ringing noise. */
  clank(t, w = 1) {
    this.blip('square', 587, t, 0.1, 0.04 * w, 6000);
    this.blip('square', 846, t, 0.08, 0.03 * w, 6000);
    this.noiseHit(t, 0.09, 0.14 * w, 'bandpass', 3200, 6);
  }

  /** Soft crash on the downbeat of a new (faster) section. */
  crash(t) {
    this.noiseHit(t, 0.9, 0.08, 'highpass', 5500, 0.7);
  }

  // --- echo bus ---------------------------------------------------------------

  makeEcho({ steps, feedback, wet, cutoff }) {
    const ctx = this.ctx;
    this.echoSteps = steps;
    this.echoIn = ctx.createGain();
    this.echoDelay = ctx.createDelay(2);
    this.echoDelay.delayTime.value = steps * this.stepDur();
    this.echoFilter = ctx.createBiquadFilter();
    this.echoFilter.type = 'lowpass';
    this.echoFilter.frequency.value = cutoff;
    this.echoFb = ctx.createGain();
    this.echoFb.gain.value = feedback;
    this.echoWet = ctx.createGain();
    this.echoWet.gain.value = wet;
    this.echoIn.connect(this.echoDelay);
    this.echoDelay.connect(this.echoFilter);
    this.echoFilter.connect(this.echoFb);
    this.echoFb.connect(this.echoDelay);
    this.echoFilter.connect(this.echoWet);
    this.echoWet.connect(this.gain);
  }

  retimeEcho(t) {
    if (!this.echoDelay) return;
    this.echoDelay.delayTime.setTargetAtTime(this.echoSteps * this.stepDur(), t, 0.05);
  }

  // --- transport --------------------------------------------------------------

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
    this.timer = setInterval(this.tick, AUDIO.SCHEDULER_MS);
    this.schedule();
  }

  stop(fadeS) {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.manual) Sequencer.live -= 1;
    clearInterval(this.timer);
    this.timer = null;
    this.ramp(0, fadeS);
    const nodes = [this.gain, this.echoIn, this.echoDelay, this.echoFilter, this.echoFb, this.echoWet].filter(Boolean);
    setTimeout(() => {
      nodes.forEach((n) => {
        try { n.disconnect(); } catch { /* ignore */ }
      });
    }, (fadeS + AUDIO.LOOKAHEAD_S + 0.1) * 1000);
  }

  ramp(value, fadeS) {
    const t = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + fadeS);
  }
}
