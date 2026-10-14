// Dev-only (not imported by the game): renders music and SFX through the real
// bus graph into an OfflineAudioContext and reports levels at the master,
// BEFORE the limiter, so a mix that leans on the limiter shows up.
// scripts/audio-check.mjs loads it with a dynamic import (Vite serves /src).

import { AUDIO, SFX_DEFS } from './audioConfig.js';
import { buildGraph } from './AudioManager.js';
import { Sequencer } from './music.js';
import { VOICES } from './sfx.js';
import { gainToDb } from './synth.js';

const RATE = 44100;

function offlineGraph(seconds) {
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
  const g = buildGraph(ctx);
  g.master.disconnect();
  g.master.connect(ctx.destination);   // measure pre-limiter
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

/** 16-bit stereo WAV as base64. */
function wavBase64(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytes = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(bytes);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, len * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function renderMusic({ track = 'battle', section = 1, variant = null, seconds = 12, wav = false } = {}) {
  const { ctx, g } = offlineGraph(seconds);
  const seq = new Sequencer(ctx, g.musicBus, g.noise, { track, section, variant, manual: true });
  seq.scheduleUntil(seconds - 0.3);
  const buf = await ctx.startRendering();
  return { bpm: seq.bpm, layers: seq.layers(), ...stats(buf, 0.3), wav: wav ? wavBase64(buf) : null };
}

export async function renderSfx(name, opts = {}, seconds = 3, wav = false) {
  const { ctx, g } = offlineGraph(seconds);
  const which = SFX_DEFS[name]?.bus || 'sfx';
  const bus = which === 'ui' ? g.uiBus : which === 'sting' ? g.stingBus : g.sfxBus;
  const trim = ctx.createGain();
  trim.gain.value = Math.pow(10, (SFX_DEFS[name]?.db || 0) / 20);
  trim.connect(bus);
  VOICES[name]({ ctx, out: trim, noise: g.noise, t: 0.01, pitch: 1 }, opts);
  const buf = await ctx.startRendering();
  return { ...stats(buf), wav: wav ? wavBase64(buf) : null };
}

export const SFX_NAMES = Object.keys(VOICES);
