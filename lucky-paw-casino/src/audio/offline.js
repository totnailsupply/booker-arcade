// Dev-only (not imported by the game): renders music and SFX through the real
// bus graph into an OfflineAudioContext and reports levels at the master,
// BEFORE the limiter, so a mix that leans on the limiter shows up.
// Used by `node scripts/audio-check.mjs --levels` via a dynamic import.

import { AUDIO } from '../core/Constants.js';
import { buildGraph } from './AudioManager.js';
import { Sequencer } from './music.js';
import { VOICES } from './sfx.js';
import { gainToDb } from './synth.js';

const RATE = 44100;

function offlineGraph(seconds) {
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
  const g = buildGraph(ctx);
  // measure pre-limiter
  g.master.disconnect();
  g.master.connect(ctx.destination);
  return { ctx, g };
}

function stats(buf, skipS = 0) {
  const thr = Math.pow(10, AUDIO.LIMITER.THRESHOLD_DB / 20);
  let peak = 0;
  let sum = 0;
  let n = 0;
  let over = 0;
  const from = Math.floor(skipS * buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = from; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      if (v > thr) over += 1;
      sum += d[i] * d[i];
      n += 1;
    }
  }
  // RMS over the loud part only (ignores the silent tail of one-shots)
  let loudSum = 0;
  let loudN = 0;
  const win = Math.floor(buf.sampleRate * 0.05);
  const d0 = buf.getChannelData(0);
  for (let i = from; i + win <= d0.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += d0[j] * d0[j];
    if (Math.sqrt(s / win) > 0.003) { loudSum += s; loudN += win; }
  }
  const r1 = x => Math.round(x * 10) / 10;
  return {
    peakDb: r1(gainToDb(peak)),
    rmsDb: r1(gainToDb(Math.sqrt(sum / Math.max(1, n)))),
    loudRmsDb: r1(gainToDb(Math.sqrt(loudSum / Math.max(1, loudN)))),
    overLimiterPct: r1((over / Math.max(1, n)) * 100),
  };
}

export async function renderMusic({ track = 'lobby', section = 1, drive = false, intro = null, seconds = 16 } = {}) {
  const { ctx, g } = offlineGraph(seconds);
  const seq = new Sequencer(ctx, { out: g.musicBus, rev: g.reverbSend, noise: g.noise }, {
    track, section, drive, intro, manual: true,
  });
  seq.scheduleUntil(seconds - 0.5);
  const buf = await ctx.startRendering();
  return { bpm: seq.bpm, layers: seq.layers(), ...stats(buf, 0.5) };
}

export async function renderSfx(name, opts = {}, seconds = 2) {
  const { ctx, g } = offlineGraph(seconds);
  VOICES[name]({ ctx, out: g.sfxBus, rev: g.reverbSend, noise: g.noise, t: 0.01, pitch: 1 }, opts);
  const buf = await ctx.startRendering();
  return stats(buf);
}

export { SFX_NAMES } from "./sfx.js";
