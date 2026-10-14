// AudioManager — owns the AudioContext, the bus graph and the one music sequencer.
//
//   music track gain ─┐
//                     ├─> musicBus ─┐
//   sfx voices ──────────> sfxBus ──┼─> master ─> limiter ─> destination
//
// The context is created and resumed on the first user gesture (browser
// autoplay policy). Until then every call is a safe no-op: music requests are
// remembered and start as soon as the context is running.

import { AUDIO } from '../core/Constants.js';
import { Sequencer } from './music.js';

/** Peak, overall RMS and the loudest 50 ms RMS window of a rendered buffer. */
function bufferStats(buf) {
  const d = buf.getChannelData(0);
  const win = Math.round(buf.sampleRate * 0.05);
  let peak = 0;
  let sum = 0;
  let wsum = 0;
  let wmax = 0;
  let peakAt = 0;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    const av = v < 0 ? -v : v;
    if (av > peak) {
      peak = av;
      peakAt = i;
    }
    sum += v * v;
    wsum += v * v;
    if ((i + 1) % win === 0) {
      wmax = Math.max(wmax, Math.sqrt(wsum / win));
      wsum = 0;
    }
  }
  const r = (x) => Math.round(x * 10000) / 10000;
  return { peak: r(peak), peakAt: r(peakAt / buf.sampleRate), rms: r(Math.sqrt(sum / d.length)), rmsMax: r(wmax) };
}

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.muted = false;

    this.wantedTrack = null;   // 'menu' | 'game' | 'complete' | null
    this.variant = null;       // level music variant id (LEVELS[n].music)
    this.wantedDelay = 0;
    this.section = 1;
    this.paused = false;
    this.sequencer = null;
    this.sequencersStarted = 0; // debug counter
    this.sfxCounts = {};        // debug: SFX actually played, by name
    this.glideActive = false;   // set by the glide wind loop (sfx.js)
    this.meter = null;          // debug level meter (enableMeter)
    this.duckLevel = 1;         // music bus multiplier (ability card, ending flourish)
  }

  /** Create the context (idempotent). Must be called from a user gesture to start running. */
  init() {
    if (this.ctx) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
    } catch (err) {
      console.warn('[Audio] AudioContext unavailable:', err);
      this.ctx = null;
      return false;
    }
    const ctx = this.ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    this.limiter = limiter;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.MASTER_GAIN;
    this.master.connect(limiter);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = AUDIO.MUSIC_GAIN * this.duckLevel;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = AUDIO.SFX_GAIN;
    this.sfxBus.connect(this.master);

    // 1 s of white noise, shared by drums and noisy SFX
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    ctx.onstatechange = () => this.syncMusic();
    return true;
  }

  /** Call from any user gesture. Creates/resumes the context. Never throws. */
  unlock() {
    if (!this.init()) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
    } else {
      this.syncMusic();
    }
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Returns { ctx, out } for an SFX voice, or null when sound can't play
   * (no context yet, suspended, or muted). `name` counts plays for QA.
   */
  sfxOut(name = null) {
    if (!this.running || this.muted || !this.sfxBus) return null;
    if (name) this.sfxCounts[name] = (this.sfxCounts[name] || 0) + 1;
    return { ctx: this.ctx, out: this.sfxBus };
  }

  // --- music -----------------------------------------------------------------

  /** Request a track. Always restarts from bar 1; never stacks loops. */
  playMusic(track, { section = this.section, delay = 0, variant = null } = {}) {
    this.wantedTrack = track;
    this.variant = track === 'game' ? variant : null;   // level music variant id (LEVELS[n].music)
    this.wantedDelay = delay;
    this.section = section;
    this.paused = false;
    this.killSequencer();
    this.syncMusic();
  }

  stopMusic() {
    this.wantedTrack = null;
    this.paused = false;
    this.killSequencer();
  }

  /** Start the wanted track if the context is running and nothing is playing. */
  syncMusic() {
    if (!this.running || !this.wantedTrack || this.sequencer || this.paused) return;
    try {
      this.sequencer = new Sequencer(this.ctx, this.musicBus, this.noiseBuffer, {
        track: this.wantedTrack,
        section: this.section,
        delay: this.wantedDelay,
        variant: this.variant,
      });
      this.wantedDelay = 0;
      this.sequencersStarted += 1;
    } catch (err) {
      console.warn('[Audio] music error:', err);
      this.sequencer = null;
    }
  }

  killSequencer() {
    if (!this.sequencer) return;
    try { this.sequencer.stop(AUDIO.STOP_FADE_S); } catch { /* ignore */ }
    this.sequencer = null;
  }

  setSection(section) {
    this.section = section;
    if (this.sequencer) this.sequencer.setSection(section);
  }

  pauseMusic() {
    this.paused = true;
    if (this.sequencer) this.sequencer.pause(AUDIO.PAUSE_FADE_S);
  }

  resumeMusic() {
    if (!this.paused) return;
    this.paused = false;
    if (this.sequencer) this.sequencer.resume(AUDIO.PAUSE_FADE_S);
    else this.syncMusic();
  }

  /**
   * Ducks the whole music bus to `level` (1 = normal) with a smooth ramp. The
   * duck lives on the bus, so it holds across a sequencer restart.
   */
  duckMusic(level = 1, rampS = AUDIO.DUCK_RAMP_S) {
    this.duckLevel = level;
    if (!this.musicBus) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
    else {
      const v = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(v, t);
    }
    g.setTargetAtTime(AUDIO.MUSIC_GAIN * level, t, rampS / 3);
  }

  // --- mute ----------------------------------------------------------------

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.master) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.muted ? 0 : AUDIO.MASTER_GAIN, t + AUDIO.MUTE_RAMP_S);
  }

  // --- debug level meter (QA only; audio-check turns it on) -------------------

  /**
   * Taps the music bus, SFX bus and master (post-mute). A ScriptProcessor sees
   * every sample block, so short transients are never missed (polling an
   * AnalyserNode on a timer is unreliable in headless Chromium). Debug only:
   * nothing is created unless a QA script calls this.
   */
  enableMeter() {
    if (this.meter) return true;
    if (!this.ctx || typeof this.ctx.createScriptProcessor !== 'function') return false;
    const ctx = this.ctx;
    const keys = ['music', 'sfx', 'master'];
    const merger = ctx.createChannelMerger(3);
    this.musicBus.connect(merger, 0, 0);
    this.sfxBus.connect(merger, 0, 1);
    this.master.connect(merger, 0, 2);
    const proc = ctx.createScriptProcessor(1024, 3, 1);
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

  /** { music|sfx|master: { peak, rmsMax, rmsAvg } } since the last reset (linear). */
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

  // --- offline rendering (QA: load-independent mix numbers) ------------------

  /**
   * Renders `seconds` of a song offline through a music-bus gain and returns
   * { peak, rms, rmsMax } (linear, as it leaves the music bus).
   */
  async renderMusicOffline({ track = 'game', variant = null, section = 1, seconds = 8 } = {}) {
    const sr = 44100;
    const off = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
    const bus = off.createGain();
    bus.gain.value = AUDIO.MUSIC_GAIN;
    bus.connect(off.destination);
    const seq = new Sequencer(off, bus, this.offlineNoise(off), { track, variant, section, manual: true });
    seq.scheduleUntil(seconds);
    return bufferStats(await off.startRendering());
  }

  /**
   * Renders whatever SFX `trigger()` plays (synchronously) into an offline
   * context through an SFX-bus gain; returns { peak, rms, rmsMax, played }.
   */
  async renderSfxOffline(trigger, seconds = 1) {
    const sr = 44100;
    const off = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
    const bus = off.createGain();
    bus.gain.value = AUDIO.SFX_GAIN;
    bus.connect(off.destination);
    const savedNoise = this.noiseBuffer;
    if (!this.noiseBuffer) this.noiseBuffer = this.offlineNoise(off);
    const played = [];
    this.sfxOut = (name) => {
      if (name) played.push(name);
      return { ctx: off, out: bus };
    };
    try {
      trigger();
    } finally {
      delete this.sfxOut;          // back to the prototype method
      this.noiseBuffer = savedNoise;
    }
    return { ...bufferStats(await off.startRendering()), played };
  }

  offlineNoise(off) {
    if (this.noiseBuffer) return this.noiseBuffer;
    const b = off.createBuffer(1, off.sampleRate, off.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** For render_game_to_text() */
  debugState() {
    const seq = this.sequencer;
    return {
      muted: this.muted,
      contextState: this.ctx ? this.ctx.state : 'none',
      track: this.wantedTrack,
      variant: this.variant || null,
      song: seq ? seq.songId : null,
      bar: seq ? seq.bar + 1 : null,
      glide: this.glideActive,
      duck: this.duckLevel,
      sfx: { ...this.sfxCounts },
      musicPlaying: !!seq && !seq.paused && this.running,
      musicPaused: this.paused,
      section: seq ? seq.section : this.section,
      bpm: seq ? seq.bpm : null,
      layers: seq ? seq.layers() : [],
      sequencersStarted: this.sequencersStarted,
      liveSequencers: Sequencer.live,
    };
  }
}

export const audioManager = new AudioManager();
