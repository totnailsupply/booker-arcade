#!/usr/bin/env node
// Screenshots of the tower at chosen heights (Step 4 zone-identity check).
// Each shot loads ?y=<height>&lives=99 (a cushion start at that height), steps
// the deterministic test clock a few frames and saves the canvas.
//
// Usage:
//   node scripts/zone-tour.mjs [--heights 0,1400,3000,4800,6300] [--frames 20]
//        [--out output/zone-tour] [--scale 2] [--query "debug=1"] [--no-manifest]
//        [--phone]   390x844 CSS px at DPR 2 (letterboxed like a phone; whole-page shot)
//        [--gpu]     launch Chromium on the real GPU (ANGLE Metal) instead of SwiftShader
// Gates are at 1400 / 3000 / 4800 px; the roof at 6400 px.
//
// Glitch mode (Step 6 regression check for the "half Soba" GL cut):
//   node scripts/zone-tour.mjs --glitch [--heights 1500,3100] [--frames 240]
//        [--maxtex N]   fake MAX_TEXTURE_IMAGE_UNITS = N (stress the multi-texture batch)
//        [--configs ",gltex=16"]  GL configs to run each height under (comma-separated URL
//                       flags; empty = the game's default). Default: the default guard,
//                       then gltex=16 (all 16 texture units, the shader fix alone)
//        [--query "glfix=0"]  extra URL flags for every run (glfix=0 shows the bug)
// The bot climbs (?autoplay=1) on the test clock. Before each render Soba and her
// wrap ghost are switched to a solid magenta fill tint (objects above her hidden for
// that render); after it, the GL drawing
// buffer is read back and the magenta pixels counted. Coverage = counted /
// (opaque pixels of the current frame x |scaleX * scaleY|). A frame below 0.6
// is a "cut" frame; any cut frame fails the run (exit 1). The first cut frame
// is saved as <out>/glitch-h<height>-f<frame>.png.
//
// Climb timeline (Step 6 pacing check):
//   node scripts/zone-tour.mjs --climb [--every 60] [--out output/climb] [--query "lives=3"]
// The bot climbs from the street (?autoplay=1) on the test clock; a canvas shot
// every N frames (default 60 = 1 s) as <out>/t<sec>.png, plus a line per shot
// with the height, zone, level chunk and what happened since the last shot
// (springs, crumbles, stomps, treats, lives lost, zone gates). It flags any
// stretch longer than 8 s without a new chunk or event.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const glitch = args.includes('--glitch');
const climb = args.includes('--climb');
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const heights = opt('--heights', glitch ? '1500,3100' : '40,1380,3000,4780,6300').split(',').map(Number);
const frames = Number(opt('--frames', glitch ? '240' : '20'));
const outDir = opt('--out', glitch ? 'output/glitch' : climb ? 'output/climb' : 'output/zone-tour');
const scale = Number(opt('--scale', '2'));
const extra = opt('--query', '');
const noManifest = args.includes('--no-manifest');
const phone = args.includes('--phone');
const gpu = args.includes('--gpu');
const fakeMaxTex = Number(opt('--maxtex', '0'));
const CUT_RATIO = 0.6;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});
const page = phone
  ? await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  : await browser.newPage({ viewport: { width: 270 * scale, height: 480 * scale } });
if (fakeMaxTex > 0) {
  await page.addInitScript((n) => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const orig = C.prototype.getParameter;
      C.prototype.getParameter = function (p) {
        return p === 0x8872 ? n : orig.call(this, p); // MAX_TEXTURE_IMAGE_UNITS
      };
    }
  }, fakeMaxTex);
}
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'warning') warnings.push(m.text());
  if (m.type() !== 'error') return;
  if (noManifest && (m.location()?.url || '').includes('manifest.json')) return;
  errors.push(m.text());
});
if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));

// In-page probe: tint Soba magenta before each render, count magenta pixels after it.
function installGlitchProbe(cutRatio) {
  const game = window.__GAME__;
  const gl = game.renderer.gl;
  const scene = game.scene.getScene('ClimbScene');
  const soba = scene.soba;
  const tex = game.textures.get(soba.sprite.texture.key);
  const src = tex.getSourceImage();
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const opaque = {};
  for (const name of tex.getFrameNames()) {
    const f = tex.get(name);
    const d = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++;
    opaque[name] = n;
  }
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  const probe = { frames: [], w, h, cutRatio };
  let pending = null;
  let hidden = [];
  game.events.on('prerender', () => {
    const s = soba.sprite;
    pending = null;
    const cam = scene.cameras.main;
    if (!s.visible || soba.state !== 'air' || cam.zoom !== 1 || cam.fadeEffect.isRunning || cam.flashEffect.isRunning) return;
    for (const o of [s, soba.ghost]) if (o.visible) o.setTint(0xff00ff).setTintMode(1); // TintModes.FILL
    // Hide whatever draws above Soba for this one render (pops, dust, HUD), so
    // nothing covers her. Objects drawn after her can't change which texture
    // unit she gets, so the batch she is in stays exactly as in the game.
    hidden = scene.children.list.filter(o => o.depth > s.depth && o.visible && o !== s && o !== soba.ghost);
    for (const o of hidden) o.visible = false;
    const area = Math.abs(s.scaleX * s.scaleY);
    pending = { name: s.frame.name, expected: opaque[s.frame.name] * area, ghost: soba.ghost.visible, angle: Math.round(s.angle * 10) / 10, sx: Math.round(s.scaleX * 1000) / 1000, sy: Math.round(s.scaleY * 1000) / 1000 };
  });
  game.events.on('postrender', () => {
    for (const o of hidden) o.visible = true;
    hidden = [];
    if (!pending) return;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i]; const g = buf[i + 1]; const b = buf[i + 2];
      if (r > 150 && b > 150 && g * 4 < r && g * 4 < b && Math.abs(r - b) < 40) n++;
    }
    pending.count = n;
    pending.ratio = Math.round((n / Math.max(1, pending.expected)) * 1000) / 1000;
    pending.cut = pending.ratio < cutRatio;
    pending.frameNo = window.__TEST_CLOCK__.frames;
    probe.frames.push(pending);
    pending = null;
  });
  let ri = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    ri = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* ignore */ }
  probe.renderer = ri;
  probe.maxTextures = game.renderer.maxTextures;
  probe.glGuard = window.__GL_GUARD__ || null;
  window.__GLITCH__ = probe;
  return { renderer: ri, maxTextures: probe.maxTextures, glGuard: probe.glGuard };
}

if (climb) {
  const { LEVEL1 } = await import('../src/levels/level1.js');
  const every = Number(opt('--every', '60'));
  // Chunk spans by height (platform heights per chunk)
  const spans = {};
  for (const p of LEVEL1.platforms) {
    if (!p.chunk) continue;
    const sp = spans[p.chunk] || (spans[p.chunk] = { lo: Infinity });
    sp.lo = Math.min(sp.lo, p.y);
  }
  const order = Object.entries(spans).sort((a, b) => a[1].lo - b[1].lo);
  const chunkAt = (h) => {
    let name = order[0][0];
    for (const [n, sp] of order) if (h >= sp.lo - 30) name = n;
    return name;
  };
  await page.goto(`${base}/?autoplay=1${extra ? `&${extra}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.getScenes(true).some(s => s.scene.key === 'ClimbScene'), null, { timeout: 15000 });
  await page.evaluate(() => {
    const log = [];
    window.__CLIMB_LOG__ = log;
    const E = window.__EVENTS__;
    const watch = {
      [E.SPRING]: 'spring', [E.CRUMBLE]: 'crumble', [E.STOMP]: 'stomp', [E.TREAT_COLLECTED]: 'treat',
      [E.SOBA_FELL]: 'LIFE LOST', [E.ZONE_CHANGED]: 'GATE', [E.FX_MILESTONE]: 'milestone',
    };
    for (const [ev, label] of Object.entries(watch)) window.__EVENT_BUS__.on(ev, () => log.push(label));
  });
  let lastNew = 0;
  let lastChunk = '';
  let longest = { s: 0, from: 0 };
  const rows = [];
  for (let sec = 1; sec <= 200; sec++) {
    await page.evaluate(n => window.advanceTime(n * 1000 / 60), every);
    const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const evs = await page.evaluate(() => window.__CLIMB_LOG__.splice(0));
    const h = st.soba ? st.soba.heightPx : 0;
    const chunk = chunkAt(Math.max(0, h));
    const t = (sec * every) / 60;
    const fresh = chunk !== lastChunk || evs.some(e => e !== 'treat');
    if (fresh) {
      if (t - lastNew > longest.s) longest = { s: t - lastNew, from: lastNew };
      lastNew = t;
    }
    lastChunk = chunk;
    const file = path.join(outDir, `t${String(Math.round(t)).padStart(3, '0')}.png`);
    await page.locator('canvas').screenshot({ path: file });
    const counts = {};
    for (const e of evs) counts[e] = (counts[e] || 0) + 1;
    const evStr = Object.entries(counts).map(([k, v]) => (v > 1 ? `${k} x${v}` : k)).join(', ');
    const row = `t=${String(t.toFixed(0)).padStart(3)}s  ${String(st.maxHeightM).padStart(5)} m  zone ${st.zone}  ${chunk.padEnd(20)} lives ${st.lives}  ${evStr}`;
    rows.push(row);
    console.log(row);
    if (st.mode === 'complete' || st.mode === 'game_over') {
      console.log(`${st.mode} at t=${t.toFixed(0)} s, score ${st.score}`);
      break;
    }
  }
  fs.writeFileSync(path.join(outDir, 'timeline.txt'), `${rows.join('\n')}\n`);
  console.log(`longest stretch without a new chunk or event: ${longest.s.toFixed(0)} s (from t=${longest.from.toFixed(0)} s)${longest.s > 8 ? '  <-- over 8 s' : ''}`);
}

let totalCut = 0;
let totalFrames = 0;
// Glitch mode runs every height once per GL config: the game's default (software
// GL gets maxTextures 1) and gltex=16 (all 16 units, so only the shader fix
// stands between Soba and the cut).
const configs = glitch ? opt('--configs', ',gltex=16').split(',') : [''];
const jobs = climb ? [] : configs.flatMap(cfg => heights.map(h => ({ h, cfg })));
for (const { h, cfg } of jobs) {
  const q = `y=${h}&lives=99${glitch ? '&autoplay=1' : ''}${cfg ? `&${cfg}` : ''}${extra ? `&${extra}` : ''}`;
  await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.scene.getScenes(true).some(s => s.scene.key === 'ClimbScene'), null, { timeout: 15000 });

  if (glitch) {
    await page.evaluate(() => window.advanceTime(1000 / 60)); // switch to the test clock
    const info = await page.evaluate(installGlitchProbe, CUT_RATIO);
    let firstCutSaved = false;
    for (let done = 0; done < frames; done += 20) {
      const n = Math.min(20, frames - done);
      // Step one frame at a time so the first cut frame can be captured as it is.
      const shot = await page.evaluate(async ({ n, wantShot }) => {
        let dataUrl = null;
        for (let i = 0; i < n; i++) {
          const before = window.__GLITCH__.frames.length;
          await window.advanceTime(1000 / 60);
          const f = window.__GLITCH__.frames[before];
          if (wantShot && !dataUrl && f && f.cut) {
            dataUrl = window.__GAME__.canvas.toDataURL('image/png');
            dataUrl = { url: dataUrl, frameNo: f.frameNo };
          }
        }
        return dataUrl;
      }, { n, wantShot: !firstCutSaved });
      if (shot) {
        firstCutSaved = true;
        const file = path.join(outDir, `glitch-h${String(h).padStart(4, '0')}${cfg ? `-${cfg.replace(/[^a-z0-9]+/gi, '')}` : ''}-f${shot.frameNo}.png`);
        fs.writeFileSync(file, Buffer.from(shot.url.split(',')[1], 'base64'));
        console.log(`  first cut frame saved: ${file}`);
      }
    }
    const res = await page.evaluate(() => {
      const fr = window.__GLITCH__.frames;
      const ratios = fr.map(f => f.ratio).sort((a, b) => a - b);
      const cut = fr.filter(f => f.cut);
      return {
        measured: fr.length,
        cut: cut.length,
        minRatio: ratios[0],
        p5Ratio: ratios[Math.floor(ratios.length * 0.05)],
        medianRatio: ratios[Math.floor(ratios.length / 2)],
        cutSamples: cut.slice(0, 6).map(f => `f${f.frameNo}:${f.name} r${f.ratio} a${f.angle} s${f.sx}x${f.sy}${f.ghost ? ' ghost' : ''}`),
      };
    });
    const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    totalCut += res.cut;
    totalFrames += res.measured;
    console.log(`h${h}${cfg ? ` [${cfg}]` : ''}: ${res.cut}/${res.measured} cut frames (coverage min ${res.minRatio}, p5 ${res.p5Ratio}, median ${res.medianRatio})  renderer "${info.renderer}" maxTextures ${info.maxTextures} guard ${JSON.stringify(info.glGuard)}  ended at ${st.heightM} m`);
    if (res.cutSamples.length) console.log(`  e.g. ${res.cutSamples.join('  ')}`);
    continue;
  }

  await page.evaluate(n => window.advanceTime(n * 1000 / 60), frames);
  const file = path.join(outDir, `h${String(h).padStart(4, '0')}.png`);
  if (phone) await page.screenshot({ path: file });
  else await page.locator('canvas').screenshot({ path: file });
  const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  console.log(`${file}  zone ${st.zone} ${st.zoneName}  camY ${st.cameraY}  mode ${st.mode}`);
}
await browser.close();
const uniq = [...new Set(warnings)];
if (uniq.length) console.log(`warnings (${uniq.length} distinct):\n  ${uniq.slice(0, 10).join('\n  ')}`);
if (errors.length) {
  console.log(`ERRORS (${errors.length}):\n  ${errors.slice(0, 8).join('\n  ')}`);
  process.exit(1);
}
console.log('no console errors');
if (glitch) {
  console.log(`GLITCH ${totalCut === 0 ? 'OK' : 'FAIL'}: ${totalCut}/${totalFrames} frames with Soba's coverage < ${CUT_RATIO}`);
  if (totalCut > 0 || totalFrames === 0) process.exit(1);
}
