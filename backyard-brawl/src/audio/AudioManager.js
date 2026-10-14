// =============================================================================
// AudioManager — owns the AudioContext, the bus graph, the one music
// sequencer, ducking, the level-up shimmer pad and the SFX voice stats.
//
//   sequencer ─> musicBus ─> duck ─┐
//   stingers, shimmer pad ─> stingBus ─┤
//   game SFX voices ─> sfxBus ─────────┼─> master ─> limiter ─> destination
//   menu / card SFX ─> uiBus ──────────┘
//
// Levels are dB values in audioConfig.js. The context is created and resumed
// on the first user gesture (autoplay policy). Until then every call is a safe
// no-op: music requests are remembered and start once the context runs.
// =============================================================================

import { AUDIO } from './audioConfig.js';
import { Sequencer } from './music.js';
import { dbToGain, gainToDb, makeNoiseBuffer, freqOf, EPS } from './synth.js';

/** Builds the bus graph on any (Offline)AudioContext. Shared with offline.js. */
export function buildGraph(ctx, { muted = false } = {}) {
  const L = AUDIO.LIMITER;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = L.THRESHOLD_DB;
  limiter.knee.value = L.KNEE_DB;
  limiter.ratio.value = L.RATIO;
  limiter.attack.value = L.ATTACK_S;
  limiter.release.value = L.RELEASE_S;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : dbToGain(AUDIO.MASTER_DB);
  master.connect(limiter);

  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(master);

  const bus = (db, to) => {
    const g = ctx.createGain();
    g.gain.value = dbToGain(db);
    g.connect(to);
    return g;
  };
  return {
    limiter,
    master,
    duck,
    musicBus: bus(AUDIO.MUSIC_DB, duck),
    stingBus: bus(AUDIO.STING_DB, master),
    sfxBus: bus(AUDIO.SFX_DB, master),
    uiBus: bus(AUDIO.UI_DB, master),
    noise: makeNoiseBuffer(ctx),
  };
}

const emptyStats = () => ({
  played: {},        // name -> plays
  skipped: {},       // name -> { gap, cap, group, global }
  blocked: 0,        // plays while not running / muted
  peakVoices: {},    // name -> most voices of that sound alive at once
  peakGlobal: 0,     // most SFX voices alive at once
  peakGroups: {},
  last: null,
});

class AudioManager {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.muted = false;

    this.wanted = null;        // { track, variant, delay } | null
    this.section = 1;
    this.paused = false;
    this.bgSuspended = false;
    this.sequencer = null;
    this.sequencersStarted = 0;

    this.heldDucks = {};       // key -> dB (held until released)
    this.timedDucks = [];      // { db, until (ctx time) }
    this.duckTimer = null;
    this.shimmer = null;
    this.loops = {};           // name -> loop handle (sfx.js)
    this.stats = emptyStats();
    this.meter = null;
  }

  /** Create the context (idempotent). Must be called from a user gesture to start running. */
  init() {
    if (this.ctx) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
      this.graph = buildGraph(this.ctx, { muted: this.muted });
    } catch (err) {
      if (!this.initWarned) console.warn('[Audio] AudioContext unavailable:', err);
      this.initWarned = true;
      this.ctx = null;
      this.graph = null;
      return false;
    }
    this.ctx.onstatechange = () => this.syncMusic();
    return true;
  }

  /** Call from any user gesture. Creates/resumes the context. Never throws. */
  unlock() {
    try {
      if (!this.init()) return;
      if (this.ctx.state === 'suspended' && !document.hidden) {
        this.bgSuspended = false;
        this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
      } else {
        this.syncMusic();
      }
    } catch { /* never throw from a gesture handler */ }
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** { ctx, out, noise } for a voice on `bus`, or null when sound can't play. */
  sfxOut(bus = 'sfx') {
    if (!this.running || this.muted || !this.graph) return null;
    const g = this.graph;
    const out = bus === 'ui' ? g.uiBus : bus === 'sting' ? g.stingBus : g.sfxBus;
    return { ctx: this.ctx, out, noise: g.noise };
  }

  // --- music -----------------------------------------------------------------

  get track() {
    return this.wanted ? this.wanted.track : null;
  }

  /**
   * Request a track. Restarts from bar 1 unless `keep` and the same track and
   * variant are already wanted. Never stacks sequencers.
   */
  playMusic(track, { section = 1, variant = null, delay = 0, keep = false } = {}) {
    if (keep && this.wanted && this.wanted.track === track && this.wanted.variant === variant && !this.paused) {
      this.setSection(section);
      return;
    }
    this.wanted = { track, variant, delay };
    this.section = section;
    this.paused = false;
    this.killSequencer(AUDIO.STOP_FADE_S);
    this.syncMusic();
  }

  stopMusic(fadeS = AUDIO.STOP_FADE_S) {
    this.wanted = null;
    this.paused = false;
    this.killSequencer(fadeS);
  }

  /** Start the wanted track if the context is running and nothing is playing. */
  syncMusic() {
    if (!this.running || !this.wanted || this.sequencer || this.paused) return;
    try {
      this.sequencer = new Sequencer(this.ctx, this.graph.musicBus, this.graph.noise, {
        track: this.wanted.track,
        section: this.section,
        delay: this.wanted.delay,
        variant: this.wanted.variant,
      });
      this.wanted.delay = 0;
      this.sequencersStarted += 1;
    } catch (err) {
      console.warn('[Audio] music error:', err);
      this.sequencer = null;
    }
  }

  killSequencer(fadeS) {
    if (!this.sequencer) return;
    try { this.sequencer.stop(fadeS); } catch { /* ignore */ }
    this.sequencer = null;
  }

  /** Section (intensity level / boss phase); applied on the next bar line. */
  setSection(section) {
    this.section = section;
    if (this.sequencer) this.sequencer.setSection(section);
  }

  pauseMusic() {
    this.paused = true;
    if (this.sequencer) this.sequencer.pause(AUDIO.PAUSE_FADE_S);
    this.stopShimmer();
  }

  resumeMusic() {
    if (!this.paused) return;
    this.paused = false;
    if (this.sequencer) this.sequencer.resume(AUDIO.PAUSE_FADE_S);
    else this.syncMusic();
  }

  // --- ducking (music bus only) -------------------------------------------------

  /** Hold a duck (e.g. level-up overlay) until releaseDuck(key). */
  holdDuck(key, db) {
    this.heldDucks[key] = -Math.abs(db);
    this.applyDuck();
  }

  releaseDuck(key) {
    if (!(key in this.heldDucks)) return;
    delete this.heldDucks[key];
    this.applyDuck();
  }

  /** Duck by `db` for `holdS` seconds, then recover. Overlaps keep the deepest. */
  duck(db, holdS) {
    if (!this.ctx) return;
    this.timedDucks.push({ db: -Math.abs(db), until: this.ctx.currentTime + AUDIO.DUCK_ATTACK_S + holdS });
    this.applyDuck();
  }

  /** Current duck target in dB (0 = none). */
  duckDb() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.timedDucks = this.timedDucks.filter(d => d.until > now);
    let db = 0;
    for (const v of Object.values(this.heldDucks)) db = Math.min(db, v);
    for (const d of this.timedDucks) db = Math.min(db, d.db);
    return db;
  }

  applyDuck() {
    if (!this.ctx || !this.graph) return;
    const db = this.duckDb();
    const t = this.ctx.currentTime;
    const g = this.graph.duck.gain;
    const target = dbToGain(db);
    const ramp = target < g.value ? AUDIO.DUCK_ATTACK_S : AUDIO.DUCK_RELEASE_S;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + ramp);
    clearTimeout(this.duckTimer);
    if (this.timedDucks.length) {
      const next = Math.min(...this.timedDucks.map(d => d.until));
      this.duckTimer = setTimeout(() => this.applyDuck(), Math.max(10, (next - t) * 1000 + 5));
    }
  }

  // --- level-up shimmer pad (stinger bus, not ducked) -----------------------------

  startShimmer() {
    if (this.shimmer || !this.running || this.muted) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const env = ctx.createGain();
      env.gain.value = EPS;
      env.gain.setValueAtTime(EPS, t);
      env.gain.linearRampToValueAtTime(1, t + AUDIO.SHIMMER_FADE_IN_S);
      env.connect(this.graph.stingBus);
      // A(add9) shimmer: A4 E5 B5 C#6, detuned sine pairs with a slow tremolo
      const trem = ctx.createGain();
      trem.gain.value = 0.75;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.2;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.25;
      lfo.connect(lfoDepth);
      lfoDepth.connect(trem.gain);
      trem.connect(env);
      const oscs = [lfo];
      [[69, 0.05], [76, 0.04], [83, 0.03], [85, 0.025]].forEach(([m, pk]) => {
        for (const dt of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freqOf(m);
          o.detune.value = dt;
          const g = ctx.createGain();
          g.gain.value = pk;
          o.connect(g);
          g.connect(trem);
          oscs.push(o);
        }
      });
      oscs.forEach(o => o.start(t));
      this.shimmer = { env, oscs, trem };
      this.noteVoice('shimmerPad');
    } catch (err) {
      console.warn('[Audio] shimmer failed:', err);
      this.shimmer = null;
    }
  }

  stopShimmer() {
    const s = this.shimmer;
    if (!s) return;
    this.shimmer = null;
    try {
      const t = this.ctx.currentTime;
      const g = s.env.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, EPS), t);
      g.exponentialRampToValueAtTime(EPS, t + AUDIO.SHIMMER_FADE_OUT_S);
      s.oscs.forEach(o => o.stop(t + AUDIO.SHIMMER_FADE_OUT_S + 0.05));
      setTimeout(() => { try { s.env.disconnect(); } catch { /* gone */ } }, (AUDIO.SHIMMER_FADE_OUT_S + 0.2) * 1000);
    } catch { /* context closed */ }
  }

  // --- mute ----------------------------------------------------------------

  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) this.stopShimmer();
    if (!this.graph) return;
    const t = this.ctx.currentTime;
    const g = this.graph.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.muted ? 0 : dbToGain(AUDIO.MASTER_DB), t + AUDIO.MUTE_RAMP_S);
  }

  // --- background tab --------------------------------------------------------

  suspendForBackground() {
    if (!this.running) return;
    this.bgSuspended = true;
    this.ctx.suspend().catch(() => {});
  }

  resumeFromBackground() {
    if (!this.bgSuspended || !this.ctx) return;
    this.bgSuspended = false;
    this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
  }

  // --- stats (QA) --------------------------------------------------------------

  noteVoice(name) {
    this.stats.played[name] = (this.stats.played[name] || 0) + 1;
    this.stats.last = name;
  }

  noteSkip(name, reason) {
    const s = this.stats.skipped[name] || (this.stats.skipped[name] = { gap: 0, cap: 0, group: 0, global: 0 });
    s[reason] += 1;
  }

  resetStats() {
    this.stats = emptyStats();
  }

  // --- debug level meter (QA only; audio-check turns it on) -------------------

  /**
   * Taps the music bus (post-duck), stinger bus, SFX bus, UI bus and master
   * (post-mute) with a ScriptProcessor, so short transients are never missed.
   */
  enableMeter() {
    if (this.meter) return true;
    if (!this.ctx || typeof this.ctx.createScriptProcessor !== 'function') return false;
    const ctx = this.ctx;
    const g = this.graph;
    const taps = { music: g.duck, sting: g.stingBus, sfx: g.sfxBus, ui: g.uiBus, master: g.master };
    const keys = Object.keys(taps);
    const merger = ctx.createChannelMerger(keys.length);
    keys.forEach((k, i) => taps[k].connect(merger, 0, i));
    const proc = ctx.createScriptProcessor(1024, keys.length, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    merger.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
    this.meter = { keys, merger, proc, sink, stats: {} };
    this.resetMeter();
    proc.onaudioprocess = (e) => {
      const st = this.meter.stats;
      keys.forEach((k, ch) => {
        const d = e.inputBuffer.getChannelData(ch);
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < d.length; i++) {
          const v = d[i];
          const av = v < 0 ? -v : v;
          if (av > peak) peak = av;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / d.length);
        const s = st[k];
        if (peak > s.peak) s.peak = peak;
        if (rms > s.rmsMax) s.rmsMax = rms;
        s.rmsSum += rms;
        s.n += 1;
      });
    };
    return true;
  }

  resetMeter() {
    if (!this.meter) return;
    for (const k of this.meter.keys) this.meter.stats[k] = { peak: 0, rmsMax: 0, rmsSum: 0, n: 0 };
  }

  /** { music|sting|sfx|ui|master: { peak, rmsMax, rmsAvg } } since the last reset (linear). */
  readMeter(reset = false) {
    if (!this.meter) return null;
    const out = {};
    for (const [k, st] of Object.entries(this.meter.stats)) {
      out[k] = {
        peak: Math.round(st.peak * 10000) / 10000,
        rmsMax: Math.round(st.rmsMax * 10000) / 10000,
        rmsAvg: st.n ? Math.round((st.rmsSum / st.n) * 10000) / 10000 : 0,
      };
    }
    if (reset) this.resetMeter();
    return out;
  }

  /** For render_game_to_text() (main.js calls this). */
  debugState() {
    const seq = this.sequencer;
    const duckGain = this.graph ? this.graph.duck.gain.value : 1;
    return {
      muted: this.muted,
      contextState: this.ctx ? this.ctx.state : 'none',
      track: this.track,
      variant: this.wanted ? this.wanted.variant : null,
      song: seq ? seq.songId : null,
      bar: seq ? seq.bar + 1 : null,
      musicPlaying: !!seq && !seq.paused && this.running,
      musicPaused: this.paused,
      section: seq ? seq.section : this.section,
      pendingSection: seq ? seq.pendingSection : null,
      bpm: seq ? seq.bpm : null,
      layers: seq ? seq.layers() : [],
      duckDb: Math.round(gainToDb(duckGain) * 10) / 10,
      duckTarget: this.ctx ? this.duckDb() : 0,
      shimmer: !!this.shimmer,
      loops: Object.keys(this.loops).filter(k => this.loops[k]),
      sequencersStarted: this.sequencersStarted,
      liveSequencers: Sequencer.live,
      sfx: { ...this.stats.played },
      sfxLast: this.stats.last,
      peakVoices: this.stats.peakGlobal,
    };
  }
}

export const audioManager = new AudioManager();
