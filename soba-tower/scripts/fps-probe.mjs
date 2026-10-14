#!/usr/bin/env node
// Real-time frame-rate probe. Loads a debug start with the bot climbing (cold:
// a fresh page per run), records every requestAnimationFrame interval and every
// WebGL linkProgram call, and prints the average fps, the 1% low (the average
// frame rate of the slowest 1% of frames), the worst frame, the long frames (> 50 ms) and
// the shader programs compiled after the climb started (a first use of a new
// shader variant stalls the frame it happens in; Step 6 warms them at boot).
// Headless Chromium renders in software (SwiftShader) unless --gpu is given, so
// compare runs with each other rather than with a real device.
// Usage: node scripts/fps-probe.mjs [--query "zone=3&autoplay=1&lives=99"] [--seconds 10]
//        [--gpu] [--runs 1]
//        [--eval "<js run in the page once the climb is up, e.g. to hide a layer>"]

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const query = opt('--query', 'zone=3&autoplay=1&lives=99');
const seconds = Number(opt('--seconds', '10'));
const runs = Number(opt('--runs', '1'));
const evalJs = opt('--eval', null);
const gpu = args.includes('--gpu');

const launch = () => chromium.launch({
  headless: true,
  args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});
let browser = await launch();

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const summaries = [];
async function measure(run) {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  await page.addInitScript(() => {
    const links = [];
    window.__LINKS__ = links;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const orig = C.prototype.linkProgram;
      C.prototype.linkProgram = function (p) {
        const t0 = performance.now();
        const r = orig.call(this, p);
        // The link cost lands on the first getProgramParameter / draw; time the
        // status query too so the number shows the real stall.
        this.getProgramParameter(p, this.LINK_STATUS);
        links.push({ t: t0, ms: performance.now() - t0 });
        return r;
      };
    }
    const frames = [];
    window.__FRAMES__ = frames;
    const tick = (t) => {
      frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.getScenes(true).some(s => s.scene.key === 'ClimbScene'), null, { timeout: 20000 });
  if (evalJs) await page.evaluate(evalJs);
  const start = await page.evaluate(() => ({
    t: performance.now(),
    links: window.__LINKS__.length,
    programs: Object.keys(window.__GAME__.renderer.shaderProgramFactory?.programs || {}),
  }));
  await page.waitForTimeout(seconds * 1000);
  const res = await page.evaluate((t0) => {
    const f = window.__FRAMES__.filter(t => t >= t0);
    const dts = [];
    for (let i = 1; i < f.length; i++) dts.push(f[i] - f[i - 1]);
    const links = window.__LINKS__.filter(l => l.t >= t0);
    return {
      dts,
      links: links.map(l => Math.round(l.ms)),
      linkTimes: links.map(l => Math.round(l.t - t0)),
      programs: Object.keys(window.__GAME__.renderer.shaderProgramFactory?.programs || {}),
      maxTextures: window.__GAME__.renderer.maxTextures,
      guard: window.__GL_GUARD__ || null,
      state: JSON.parse(window.render_game_to_text()),
    };
  }, start.t);
  const dts = res.dts;
  const avg = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
  // 1% low = the average frame rate over the slowest 1% of frames
  const slow = [...dts].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(dts.length / 100)));
  const slowAvg = slow.reduce((a, b) => a + b, 0) / slow.length;
  const worst = Math.max(...dts);
  const long = dts.filter(d => d > 50).length;
  const newPrograms = res.programs.filter(k => !start.programs.includes(k));
  const s = {
    fps: Math.round(1000 / avg),
    low1: Math.round(1000 / slowAvg),
    worstMs: Math.round(worst),
    long,
    links: res.links.length,
    bootLinks: start.links,
  };
  summaries.push(s);
  console.log(`run ${run + 1}: avg ${s.fps} fps, 1% low ${s.low1} fps, worst ${s.worstMs} ms, ${long} frames > 50 ms, `
    + `${res.links.length} shader links during the climb (${res.links.join('/')} ms at ${res.linkTimes.join(',')} ms), `
    + `${start.links} before it; maxTextures ${res.maxTextures}; height ${res.state.heightM} m`);
  if (newPrograms.length) console.log(`  new programs: ${newPrograms.map(k => k.replace(/^(\w+?)__/, '$1:')).join('  ')}`);
  if (run === 0 && res.guard) console.log(`  GL guard: ${JSON.stringify(res.guard)}`);
  await page.close();
}

for (let run = 0; run < runs; run++) {
  // Headless Chromium is occasionally killed from outside: relaunch and retry once
  try {
    await measure(run);
  } catch (e) {
    console.log(`run ${run + 1}: browser died (${String(e.message || e).split('\n')[0]}), retrying`);
    try { await browser.close(); } catch { /* already gone */ }
    browser = await launch();
    await measure(run);
  }
}
if (runs > 1) {
  const med = k => pct(summaries.map(s => s[k]), 0.5);
  console.log(`median of ${runs}: avg ${med('fps')} fps, 1% low ${med('low1')} fps, worst ${med('worstMs')} ms, long ${med('long')}, links ${med('links')}`);
}
await browser.close();
