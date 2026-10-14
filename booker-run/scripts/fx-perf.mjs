#!/usr/bin/env node
// FX performance sample in real-time mode (not deterministic): the bot plays a
// level while we sample fps and object counts once a second. Then the level is
// restarted N times and the same counts are taken a few seconds into each
// attempt, to show nothing grows across restarts.
//
// Usage: node scripts/fx-perf.mjs [--level 6] [--seconds 30] [--restarts 3] [--at 5] [--gpu]
//   --gpu  headless Chromium on the real GPU (ANGLE Metal on macOS) instead of SwiftShader,
//          so fps reflects the game rather than the software renderer
// Prints one JSON line per sample and a SUMMARY line.

import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const level = opt('--level', '6');
const seconds = parseInt(opt('--seconds', '30'), 10);
const restarts = parseInt(opt('--restarts', '3'), 10);
const at = parseInt(opt('--at', '5'), 10);

const gpu = args.includes('--gpu');
const browser = await launchBrowser({
  args: gpu ? ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] : [],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}/?level=${level}&autoplay=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const g = window.__GAME__;
  return g && g.scene.getScenes(true).some(s => s.scene.key === 'RunScene');
}, null, { timeout: 20000 });

const sample = () => page.evaluate(() => {
  const g = window.__GAME__;
  const run = g.scene.getScene('RunScene');
  const list = run.children.list;
  let alive = 0;
  let emitters = 0;
  let emitting = 0;
  for (const o of list) {
    if (o.type !== 'ParticleEmitter') continue;
    emitters++;
    alive += o.getAliveParticleCount();
    if (o.emitting) emitting++;
  }
  const bus = window.__EVENT_BUS__.listeners;
  const listeners = Object.values(bus).reduce((n, a) => n + a.length, 0);
  return {
    t: Math.round(window.__GAME_STATE__.runTimeMs / 100) / 10,
    mode: window.__GAME_STATE__.mode,
    attempt: window.__GAME_STATE__.attempts,
    x: Math.round(run.player?.sprite.x || 0),
    fps: Math.round(g.loop.actualFps),
    children: list.length,
    emitters,
    emitting,
    particles: alive,
    tweens: run.tweens.getTweens().length,
    listeners,
    sceneListeners: run.events.eventNames().reduce((n, e) => n + run.events.listenerCount(e), 0),
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null,
  };
});

const rows = [];
let maxParticles = 0;
const fps = [];
for (let i = 1; i <= seconds; i++) {
  await page.waitForTimeout(1000);
  const s = await sample();
  rows.push(s);
  if (s.mode === 'playing') fps.push(s.fps);
  maxParticles = Math.max(maxParticles, s.particles);
  console.log(JSON.stringify(s));
}

const atRestart = [];
for (let k = 1; k <= restarts; k++) {
  await page.evaluate(() => window.__GAME__.scene.getScene('RunScene').retry());
  await page.waitForTimeout(at * 1000);
  const s = await sample();
  atRestart.push(s);
  console.log('RESTART', k, JSON.stringify(s));
}
await browser.close();

const avg = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : null;
console.log('SUMMARY', JSON.stringify({
  level,
  renderer: gpu ? 'gpu' : 'swiftshader',
  seconds,
  fpsAvg: avg,
  fpsMin: fps.length ? Math.min(...fps) : null,
  maxParticles,
  restarts: atRestart.map(s => ({ attempt: s.attempt, children: s.children, emitters: s.emitters, particles: s.particles, tweens: s.tweens, listeners: s.listeners, sceneListeners: s.sceneListeners, heapMB: s.heapMB })),
  errors,
}));
process.exit(errors.length ? 1 : 0);
