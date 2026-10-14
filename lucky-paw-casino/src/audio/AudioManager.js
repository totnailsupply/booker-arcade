// =============================================================================
// AudioManager — owns the AudioContext, the bus graph and the one music sequencer.
// (Copied from soba-tower; music.js is the casino lounge combo.)
//
//   sequencer layers (keys, bass, ride, lead, ...) ─> seq.out ─> musicBus ─> duck ─┐
//   sfx groups (one per play, varied volume/pan) ──────────> sfxBus ──────────┼─> master ─> limiter ─> out
//   reverb sends (bell, gong, chimes, koto lead) ─> convolver ─> reverbReturn ┘
//
// Levels are set in dB (Constants AUDIO.*_DB, AUDIO.MIX) and converted here.
// The context is created and resumed on the first user gesture (autoplay
// policy). Until then every call is a safe no-op: music requests are
// remembered and start as soon as the context runs. A hidden tab suspends
// the context; it resumes when the tab is visible again.
// =============================================================================

import { AUDIO } from '../core/Constants.js';
import { Sequencer } from './music.js';
import { dbToGain, gainToDb, makeImpulse, makeNoiseBuffer } from './synth.js';

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

  const musicBus = ctx.createGain();
  musicBus.gain.value = dbToGain(AUDIO.MUSIC_DB);
  musicBus.connect(duck);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = dbToGain(AUDIO.SFX_DB);
  sfxBus.connect(master);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = dbToGain(AUDIO.REVERB_RETURN_DB);
  try {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, AUDIO.REVERB_S, AUDIO.REVERB_DECAY);
    reverbSend.connect(conv);
    conv.connect(reverbReturn);
  } catch (err) {
    console.warn('[Audio] reverb unavailable:', err);
  }
  reverbReturn.connect(master);

  return { limiter, master, duck, musicBus, sfxBus, reverbSend, noise: makeNoiseBuffer(ctx) };
}

class AudioManager {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.muted = false;

    this.wanted = null;        // { track, section, drive, intro, delay } | null
    this.section = 1;
    this.drive = false;
    this.paused = false;
    this.bgSuspended = false;
    this.sequencer = null;
    this.sequencersStarted = 0;
    this.duckUntil = 0;
    this.sfxStats = { played: {}, skipped: 0, last: null };
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
      // Retried on the next gesture; warn once
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
    if (!this.init()) return;
    if (this.ctx.state === 'suspended' && !document.hidden) {
      this.bgSuspended = false;
      this.ctx.resume().then(() => this.syncMusic()).catch(() => {});
    } else {
      this.syncMusic();
    }
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Destinations for an SFX voice, or null when sound can't play (no context yet, blocked, muted). */
  sfxOut() {
    if (!this.running || this.muted) return null;
    const g = this.graph;
    return { ctx: this.ctx, out: g.sfxBus, rev: g.reverbSend, noise: g.noise };
  }

  noteSfx(name, played) {
    if (!played) {
      this.sfxStats.skipped += 1;
      return;
    }
    this.sfxStats.played[name] = (this.sfxStats.played[name] || 0) + 1;
    this.sfxStats.last = name;
  }

  // --- music -----------------------------------------------------------------

  /**
   * Request a track ('lobby' | 'plinko' | 'blackjack' | 'craps' | 'roulette' | 'slots').
   * Asking for the track that is already playing is a no-op; otherwise the old
   * sequencer fades out and the new one starts from bar 1 (never stacks).
   */
  playMusic(track, { section = this.section, drive = false, intro = null, delay = 0 } = {}) {
    if (this.wanted && this.wanted.track === track && !this.paused && (this.sequencer || !this.running)) return;
    this.wanted = { track, intro, delay };
    this.section = section;
    this.drive = drive;
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
    const g = this.graph;
    try {
      this.sequencer = new Sequencer(this.ctx, { out: g.musicBus, rev: g.reverbSend, noise: g.noise }, {
        track: this.wanted.track,
        section: this.section,
        drive: this.drive,
        intro: this.wanted.intro,
        delay: this.wanted.delay,
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

  setSection(section) {
    this.section = section;
    if (section < 4) this.drive = false;
    if (this.sequencer) this.sequencer.setSection(section);
  }

  setDrive(drive) {
    if (this.drive === !!drive) return;
    this.drive = !!drive;
    if (this.sequencer) this.sequencer.setDrive(this.drive);
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

  // --- mix -------------------------------------------------------------------

  /**
   * Duck the music bus by `db` for `holdS`, then recover over `releaseS`.
   * Overlapping ducks extend the hold instead of stacking.
   */
  duck(db, holdS, releaseS) {
    if (!this.ctx || !this.graph) return;
    const t = this.ctx.currentTime;
    const g = this.graph.duck.gain;
    const until = Math.max(this.duckUntil, t + AUDIO.DUCK_ATTACK_S + holdS);
    this.duckUntil = until;
    const target = dbToGain(-Math.abs(db));
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + AUDIO.DUCK_ATTACK_S);
    g.setValueAtTime(target, until);
    g.linearRampToValueAtTime(1, until + releaseS);
  }

  setMuted(muted) {
    this.muted = !!muted;
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

  /** For render_game_to_text() (main.js calls this getter). */
  debugState() {
    const seq = this.sequencer;
    const duckGain = this.graph ? this.graph.duck.gain.value : 1;
    return {
      muted: this.muted,
      contextState: this.ctx ? this.ctx.state : 'none',
      track: this.wanted ? this.wanted.track : null,
      intro: this.wanted ? this.wanted.intro : null,
      segment: seq ? seq.segment : null,
      musicPlaying: !!seq && !seq.paused && this.running,
      musicPaused: this.paused,
      section: seq ? seq.section : this.section,
      drive: seq ? seq.drive : this.drive,
      scale: seq ? seq.scale : null,
      bpm: seq ? seq.bpm : null,
      layers: seq ? seq.layers() : [],
      duckDb: Math.round(gainToDb(duckGain) * 10) / 10,
      sequencersStarted: this.sequencersStarted,
      liveSequencers: Sequencer.live,
      sfx: { ...this.sfxStats.played },
      sfxLast: this.sfxStats.last,
      sfxSkipped: this.sfxStats.skipped,
    };
  }
}

export const audioManager = new AudioManager();
