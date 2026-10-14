// =============================================================================
// VisualBake.js — Step 4 textures derived IN CODE from the loaded art (no image
// generation). Runs once in PreloadScene after registerAnimations(); every
// texture survives scene restarts, so each builder returns early if its key
// already exists. Works with the real art and with the placeholders.
//
//   wall-z1..z4   the facade per zone: the wall tile recoloured per zone palette,
//                 composed over the zone's whole height (so details don't repeat
//                 every 192 px), windows lit / unlit per zone, vines + planters
//                 (zone 1), balconies (2), red trim (3), moonlit edge + a narrower
//                 spire (4), and a dithered cross-fade into the zone below.
//   fx-eave       pagoda eave band for the zone gates, composed from the roof art
//   fx-lantern    paper lantern, fx-rope: its sagging rope
//   soba-rim      Soba's outline only (1 px around every frame, 1 px padding)
//   roof-tile     recoloured terracotta; roof-tile-rim + chimes-rim rebuilt hot
//   plat-crumble  paler with visible cracks (readable vs beams at phone size)
//   fx-*          tiny particle textures (dust, lines, leaves, wisps, motes ...)
// =============================================================================

import { ZONE_LOOK as L, DANGER, JUICE, BACKDROP } from './Constants.js';
import { RIM, ASSETS, createCanvasTexture } from './Assets.js';

export const FXK = {
  DUST: 'fx-dust',
  LINE: 'fx-line',
  LEAF: 'fx-leaf',          // 2 frames: leaf, petal
  WISP: 'fx-wisp',
  MOTE: 'fx-mote',
  STREAK: 'fx-streak',
  SPECK: 'fx-speck',
  CONFETTI: 'fx-confetti',
  GLOW: 'fx-glow',
  SPARK: 'fx-spark',
  FEATHER: 'fx-feather',
  LANTERN: 'fx-lantern',
  ROPE: 'fx-rope',
  EAVE: 'fx-eave',
  SOBA_RIM: 'soba-rim',
};

export const wallKey = i => `wall-z${i + 1}`;

/** Bakes everything (idempotent). */
export function bakeVisuals(scene, level) {
  bakeParticleTextures(scene);
  bakeLantern(scene);
  bakeEave(scene);
  bakeSobaRim(scene);
  bakeDanger(scene);
  bakeCrumble(scene);
  bakeZoneWalls(scene, level);
}

// --- helpers ------------------------------------------------------------------

const rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = c => `#${c.toString(16).padStart(6, '0')}`;
const mod = (a, n) => ((a % n) + n) % n;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ctx2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Pixels of one frame of a texture (ImageData). */
function readFrame(scene, key, frame) {
  const tex = scene.textures.get(key);
  const f = frame === undefined ? tex.get() : tex.get(frame);
  const ctx = ctx2d(f.cutWidth, f.cutHeight);
  ctx.drawImage(tex.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
  return ctx.getImageData(0, 0, f.cutWidth, f.cutHeight);
}

/** Creates a canvas texture, lets `paint(ctx)` draw it, adds frames, uploads. */
function makeCanvas(scene, key, w, h, paint, frames = null) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = createCanvasTexture(scene, key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  if (frames) for (const f of frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  tex.refresh();
  return tex;
}

/** Draws a pixel map: rows of chars, `pal` maps char -> [color, alpha]. */
function pixmap(ctx, rows, pal, dx = 0, dy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const p = pal[row[x]];
      if (!p) continue;
      ctx.globalAlpha = p[1] ?? 1;
      ctx.fillStyle = p[0];
      ctx.fillRect(dx + x, dy + y, 1, 1);
    }
  });
  ctx.globalAlpha = 1;
}

/** 1 px rim (4-neighbour) around the opaque pixels of an ImageData, in place.
 *  keepBody=false clears the body so only the rim remains. */
function rimPixels(img, color, alpha, keepBody = true) {
  const { width: w, height: h, data: d } = img;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? op[y * w + x] : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (op[y * w + x]) {
        if (!keepBody) d[o + 3] = 0;
        continue;
      }
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        d[o] = color[0];
        d[o + 1] = color[1];
        d[o + 2] = color[2];
        d[o + 3] = alpha;
      }
    }
  }
  return img;
}

/** Rebuilds a padded rim texture (same layout as Assets.buildRims) with its own colour. */
function rebuildRim(scene, srcKey, color, alpha) {
  const spec = ASSETS[srcKey];
  const key = RIM.KEYS[srcKey];
  const frames = spec.type === 'spritesheet' ? spec.frames : 1;
  const P = RIM.PAD;
  const fw = spec.w + P * 2;
  const fh = spec.h + P * 2;
  const list = [];
  makeCanvas(scene, key, fw * frames, fh, (ctx) => {
    for (let i = 0; i < frames; i++) {
      const src = readFrame(scene, srcKey, spec.type === 'spritesheet' ? i : undefined);
      const cell = ctx2d(fw, fh);
      cell.putImageData(src, P, P);
      const img = rimPixels(cell.getImageData(0, 0, fw, fh), color, alpha, true);
      ctx.putImageData(img, i * fw, 0);
      list.push({ name: i, x: i * fw, y: 0, w: fw, h: fh });
    }
  }, list);
}

// --- particle textures ------------------------------------------------------------

function bakeParticleTextures(scene) {
  if (scene.textures.exists(FXK.DUST)) return;
  const W = ['#ffffff', 1];
  const w6 = ['#ffffff', 0.6];
  const w3 = ['#ffffff', 0.32];
  makeCanvas(scene, FXK.DUST, 4, 4, ctx => pixmap(ctx, ['.ab.', 'aWWa', 'aWWa', '.ab.'], { W, a: w6, b: w3 }));
  makeCanvas(scene, FXK.LINE, 1, 8, ctx => pixmap(ctx, ['c', 'c', 'b', 'b', 'a', 'a', 'W', 'W'],
    { W, a: ['#ffffff', 0.8], b: w6, c: w3 }));
  makeCanvas(scene, FXK.STREAK, 7, 1, ctx => pixmap(ctx, ['cbbaaWW'], { W, a: ['#ffffff', 0.75], b: w6, c: w3 }));
  makeCanvas(scene, FXK.SPECK, 1, 1, ctx => pixmap(ctx, ['W'], { W }));
  makeCanvas(scene, FXK.CONFETTI, 3, 2, ctx => pixmap(ctx, ['WWW', 'WWW'], { W }));
  makeCanvas(scene, FXK.MOTE, 3, 3, ctx => pixmap(ctx, ['.a.', 'aWa', '.a.'], { W, a: w6 }));
  makeCanvas(scene, FXK.SPARK, 5, 5, ctx => pixmap(ctx, ['..a..', '..W..', 'aWWWa', '..W..', '..a..'], { W, a: w6 }));
  makeCanvas(scene, FXK.FEATHER, 4, 2, ctx => pixmap(ctx, ['.WWa', 'WWa.'], { W, a: w6 }));
  makeCanvas(scene, FXK.WISP, 6, 4, ctx => pixmap(ctx, ['.bab..', 'baWab.', '.aWWab', '..bab.'], { W, a: w6, b: w3 }));
  // Leaf (frame 0) and petal (frame 1), coloured
  const [vd, vm, vl] = L.LEAF_COLORS.map(hex);
  const fl = hex(L.FLOWERS[0]);
  makeCanvas(scene, FXK.LEAF, 8, 3, (ctx) => {
    pixmap(ctx, ['.mm.', 'mllm', '.md.'], { m: [vm, 1], l: [vl, 1], d: [vd, 1] });
    pixmap(ctx, ['.p..', 'pPp.', '.p..'], { p: [fl, 1], P: ['#ffd0dc', 1] }, 4, 0);
  }, [{ name: 0, x: 0, y: 0, w: 4, h: 3 }, { name: 1, x: 4, y: 0, w: 4, h: 3 }]);
  // Soft radial glow, quantised in steps (pixel-art friendly), white for tinting
  const G = 24;
  makeCanvas(scene, FXK.GLOW, G, G, (ctx) => {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const r = Math.hypot(x + 0.5 - G / 2, y + 0.5 - G / 2) / (G / 2);
        if (r >= 1) continue;
        const a = Math.round((1 - r) * (1 - r) * 4) / 4;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  });
}

// --- lantern + rope -----------------------------------------------------------------

function bakeLantern(scene) {
  if (scene.textures.exists(FXK.LANTERN)) return;
  const pal = {
    k: ['#2a1a22', 1], g: ['#ffc04d', 1], G: ['#c88a2a', 1],
    r: ['#a82a26', 1], R: ['#e4483a', 1], h: ['#ff7a5a', 1], y: ['#ffd27a', 1], t: ['#ffc04d', 0.9],
    o: ['#ffb060', 0.22],
  };
  makeCanvas(scene, FXK.LANTERN, 9, 12, ctx => pixmap(ctx, [
    '....k....',
    '..GgggG..',
    '.rRRhRRr.',
    'orRhyyRro',
    'orRyyyRro',
    'orRhyyRro',
    '.rRRRRRr.',
    '..GgggG..',
    '....t....',
    '....t....',
    '...t.t...',
    '.........',
  ], pal));
  const w = BACKDROP.WALL_W;
  makeCanvas(scene, FXK.ROPE, w, L.LANTERN_SAG + 2, (ctx) => {
    ctx.fillStyle = '#2a1a22';
    for (let x = 0; x < w; x++) ctx.fillRect(x, Math.round(L.LANTERN_SAG * Math.sin((x / (w - 1)) * Math.PI)), 1, 1);
  });
}

// --- pagoda eave (from the roof art) -------------------------------------------------

function bakeEave(scene) {
  if (scene.textures.exists(FXK.EAVE) || !scene.textures.exists('roof')) return;
  const tex = scene.textures.get('roof');
  const f = tex.get();
  const src = tex.getSourceImage();
  const W = L.EAVE_W;
  const C = L.EAVE_CAP_W;
  const top = L.EAVE_SRC_TOP;
  const H = ASSETS.roof.h - top;
  const stripDy = L.EAVE_STRIP_TOP - top;
  const stripH = ASSETS.roof.h - L.EAVE_STRIP_TOP;
  makeCanvas(scene, FXK.EAVE, W, H, (ctx) => {
    ctx.drawImage(src, f.cutX, f.cutY + top, C, H, 0, 0, C, H);
    ctx.drawImage(src, f.cutX + ASSETS.roof.w - C, f.cutY + top, C, H, W - C, 0, C, H);
    for (let x = C; x < W - C; x += L.EAVE_STRIP_W) {
      const w = Math.min(L.EAVE_STRIP_W, W - C - x);
      ctx.drawImage(src, f.cutX + L.EAVE_STRIP_X, f.cutY + L.EAVE_STRIP_TOP, w, stripH, x, stripDy, w, stripH);
    }
  });
}

// --- Soba's night rim -------------------------------------------------------------------

function bakeSobaRim(scene) {
  if (scene.textures.exists(FXK.SOBA_RIM)) return;
  const tex = scene.textures.get('soba');
  const n = Object.keys(tex.frames).filter(k => k !== '__BASE').length;
  const fw = 40 + 2;
  const fh = 40 + 2;
  const list = [];
  makeCanvas(scene, FXK.SOBA_RIM, fw * n, fh, (ctx) => {
    for (let i = 0; i < n; i++) {
      if (!tex.has(i)) continue;
      const src = readFrame(scene, 'soba', i);
      const cell = ctx2d(fw, fh);
      cell.putImageData(src, 1, 1);
      const img = rimPixels(cell.getImageData(0, 0, fw, fh), JUICE.RIM_COLOR, JUICE.RIM_ALPHA, false);
      ctx.putImageData(img, i * fw, 0);
      list.push({ name: i, x: i * fw, y: 0, w: fw, h: fh });
    }
  }, list);
}

// --- danger readability ---------------------------------------------------------------------

function bakeDanger(scene) {
  if (scene.textures.get('roof-tile').__sobaDanger) return;
  // Roof tile: teal body -> hot terracotta ramp by brightness; light greys -> cream
  const img = readFrame(scene, 'roof-tile');
  const d = img.data;
  const ramp = DANGER.TILE_BODY[0].map(rgb);  // [mid, light, dark, darkest]
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    let c;
    if (lum < 34) continue;                       // keep the dark outline
    if (sat < 24 && lum > 110) c = [255, 226, 190];
    else if (lum > 120) c = ramp[1];
    else if (lum > 80) c = ramp[0];
    else if (lum > 52) c = ramp[2];
    else c = ramp[3];
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  const spec = ASSETS['roof-tile'];
  makeCanvas(scene, 'roof-tile', spec.w, spec.h, ctx => ctx.putImageData(img, 0, 0));
  scene.textures.get('roof-tile').__sobaDanger = true;
  rebuildRim(scene, 'roof-tile', DANGER.RIM, DANGER.RIM_ALPHA);
  rebuildRim(scene, 'chimes', DANGER.RIM, DANGER.RIM_ALPHA);
}

function bakeCrumble(scene) {
  const tex = scene.textures.get('plat-crumble');
  if (tex.__sobaPale) return;
  const spec = ASSETS['plat-crumble'];
  const cream = [255, 240, 214];
  const crack = rgb(DANGER.CRUMBLE_CRACK);
  const k = DANGER.CRUMBLE_PALE;
  const frames = [];
  // Read every frame BEFORE makeCanvas replaces the texture under the same key
  const src = Array.from({ length: spec.frames }, (_, i) => readFrame(scene, 'plat-crumble', i));
  makeCanvas(scene, 'plat-crumble', spec.w * spec.frames, spec.h, (ctx) => {
    for (let i = 0; i < spec.frames; i++) {
      const img = src[i];
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        if (!d[p + 3]) continue;
        const lum = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
        if (lum < 50) continue;                      // keep outlines
        for (let c = 0; c < 3; c++) d[p + c] = Math.round(d[p + c] + (cream[c] - d[p + c]) * k);
      }
      // Hairline cracks (different per frame so a composed plank reads as cracked)
      const cracks = [
        [[5, 3], [6, 4], [6, 5], [5, 6], [6, 7]],
        [[2, 3], [3, 4], [3, 5], [4, 6], [6, 4], [7, 3]],
        [[2, 3], [1, 4], [2, 5], [2, 6], [1, 7]],
      ][i % 3];
      for (const [x, y] of cracks) {
        if (x >= spec.w || y >= spec.h) continue;
        const o = (y * spec.w + x) * 4;
        if (!d[o + 3]) continue;
        d[o] = crack[0];
        d[o + 1] = crack[1];
        d[o + 2] = crack[2];
      }
      ctx.putImageData(img, i * spec.w, 0);
      frames.push({ name: i, x: i * spec.w, y: 0, w: spec.w, h: spec.h });
    }
  }, frames);
  scene.textures.get('plat-crumble').__sobaPale = true;
}

// --- zone facades ---------------------------------------------------------------------------

/**
 * Builds wall-z1..z4. Canvas k covers heights [start_k - BLEND/2, end_k + BLEND/2]
 * (zone 1 from the street, zone 4 up to the roof). Zone k's bottom band fades in
 * over zone k-1 with an ordered dither; its top extension above its gate only
 * covers the next zone's column (so the spire narrows cleanly at the eave).
 */
function bakeZoneWalls(scene, level) {
  if (scene.textures.exists(wallKey(0))) return;
  const tile = readFrame(scene, 'wall');
  const tw = tile.width;
  const th = tile.height;
  const W = BACKDROP.WALL_W;
  const zones = level.zones;
  const roofH = level.finish.y;
  const half = L.BLEND_PX / 2;
  const srcIdx = new Map(L.WALL_SRC.map((c, i) => [c, i]));
  const WIN = 3;

  for (let k = 0; k < zones.length; k++) {
    const z = zones[k];
    const last = k === zones.length - 1;
    const hBot = k === 0 ? 0 : z.startY - half;
    const hTop = last ? roofH : z.endY + half;
    const H = Math.round(hTop - hBot);
    const rand = rng(1009 * (k + 1));

    // 1. the tile recoloured with this zone's palette (window pixels flagged)
    const pal = L.PALETTES[k].map(rgb);
    const tint = rgb(L.FALLBACK_TINT[k]);
    const rec = new Uint8ClampedArray(tile.data.length);
    const recWin = new Uint8Array(tw * th);
    for (let i = 0, p = 0; i < tile.data.length; i += 4, p++) {
      const c = (tile.data[i] << 16) | (tile.data[i + 1] << 8) | tile.data[i + 2];
      const idx = srcIdx.get(c);
      if (idx !== undefined) {
        const [r, g, b] = pal[idx];
        rec[i] = r;
        rec[i + 1] = g;
        rec[i + 2] = b;
        if (idx === WIN) recWin[p] = 1;
      } else {
        rec[i] = (tile.data[i] * tint[0]) / 255;
        rec[i + 1] = (tile.data[i + 1] * tint[1]) / 255;
        rec[i + 2] = (tile.data[i + 2] * tint[2]) / 255;
      }
      rec[i + 3] = 255;
    }

    // 2. compose the zone's full height (tile phase anchored at the roof, like
    //    the old TileSprite, so the pattern meets the roof the same way)
    const ctx = ctx2d(W, H);
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const win = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) {
      const ty = mod(r - hTop + roofH, th);
      for (let x = 0; x < W; x++) {
        const s = (ty * tw + (x % tw));
        const o = (r * W + x) * 4;
        px[o] = rec[s * 4];
        px[o + 1] = rec[s * 4 + 1];
        px[o + 2] = rec[s * 4 + 2];
        px[o + 3] = 255;
        win[r * W + x] = recWin[s];
      }
    }

    // 3. windows: label, merge panes into windows, light some of them
    const windows = findWindows(win, W, H);
    for (const wb of windows) {
      const lit = rand() < L.LIT[k];
      let color = null;
      if (!lit) color = rgb(L.UNLIT[k]);
      else if (k === 3 && rand() < L.LIT_COOL_SHARE) color = rgb(L.LIT_COOL);
      wb.lit = lit;
      if (!color) continue;
      for (const p of wb.pixels) {
        px[p * 4] = color[0];
        px[p * 4 + 1] = color[1];
        px[p * 4 + 2] = color[2];
      }
    }
    ctx.putImageData(img, 0, 0);

    // 4. zone details
    if (k === 0) drawGarden(ctx, windows, W, H, rand);
    if (k === 1) drawBalconies(ctx, windows, rand);
    if (k === 2) drawTrim(ctx, windows);
    if (k === 3) drawMoonEdge(ctx, H, half);

    // 5. column masks + the dithered fade into the zone below
    const out = ctx.getImageData(0, 0, W, H);
    const d = out.data;
    const own = L.X_RANGE[k];
    const next = L.X_RANGE[k + 1] || own;
    const above = [Math.max(own[0], next[0]), Math.min(own[1], next[1])];
    for (let r = 0; r < H; r++) {
      const h = hTop - r;
      const [x0, x1] = !last && h > z.endY ? above : own;
      const fade = k > 0 && h < z.startY + half ? (h - (z.startY - half)) / L.BLEND_PX : 1;
      for (let x = 0; x < W; x++) {
        const o = (r * W + x) * 4;
        if (x < x0 || x >= x1) { d[o + 3] = 0; continue; }
        if (fade < 1 && (BAYER[(r & 3) * 4 + (x & 3)] + 0.5) / 16 >= fade) d[o + 3] = 0;
      }
    }
    makeCanvas(scene, wallKey(k), W, H, c => c.putImageData(out, 0, 0));
    const t = scene.textures.get(wallKey(k));
    t.__hTop = hTop;
    t.__hBot = hBot;
  }
}

/** Window-coloured pixels -> windows (panes merged when their boxes nearly touch). */
function findWindows(mask, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = comps.length;
    const c = { x0: W, y0: H, x1: -1, y1: -1, pixels: [] };
    comps.push(c);
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p - x) / W;
      c.pixels.push(p);
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && label[q] < 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
  }
  // Union panes whose boxes come within GAP px
  const GAP = 3;
  const parent = comps.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < comps.length; a++) {
    for (let b = a + 1; b < comps.length; b++) {
      const A = comps[a];
      const B = comps[b];
      if (A.x0 - GAP > B.x1 || B.x0 - GAP > A.x1 || A.y0 - GAP > B.y1 || B.y0 - GAP > A.y1) continue;
      parent[find(a)] = find(b);
    }
  }
  const groups = new Map();
  comps.forEach((c, i) => {
    const r = find(i);
    let g = groups.get(r);
    if (!g) {
      g = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, pixels: [] };
      groups.set(r, g);
    }
    g.x0 = Math.min(g.x0, c.x0);
    g.y0 = Math.min(g.y0, c.y0);
    g.x1 = Math.max(g.x1, c.x1);
    g.y1 = Math.max(g.y1, c.y1);
    for (const p of c.pixels) g.pixels.push(p);
  });
  return [...groups.values()].filter(g => g.pixels.length >= 12);
}

function fill(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(x, y, w, h);
}

/** Zone 1: ivy hanging down the facade, planter boxes under lit windows. */
function drawGarden(ctx, windows, W, H, rand) {
  const [dark, mid, light] = L.VINE;
  const vines = Math.round((H / 192) * L.VINES_PER_TILE);
  for (let i = 0; i < vines; i++) {
    const x = 2 + Math.floor(rand() * (W - 4));
    const top = Math.floor(rand() * H);
    const len = 8 + Math.floor(rand() * 22);
    const ph = rand() * 6;
    fill(ctx, mid, x - 1, top, 3, 1);
    for (let j = 0; j < len; j++) {
      const sx = x + Math.round(Math.sin(j * 0.45 + ph) * 0.9);
      fill(ctx, dark, sx, top + j);
      if (j % 3 === 1) fill(ctx, j % 2 ? light : mid, sx + (j % 6 < 3 ? 1 : -2), top + j, 2, 1);
    }
    fill(ctx, light, x + Math.round(Math.sin(len * 0.45 + ph) * 0.9), top + len);
  }
  for (const w of windows) {
    if (rand() > 0.6 || w.x1 - w.x0 < 8) continue;
    const y = w.y1 + 1;
    const x0 = w.x0 - 1;
    const bw = w.x1 - w.x0 + 3;
    for (let x = x0; x < x0 + bw; x += 2) {
      fill(ctx, rand() < 0.5 ? mid : light, x, y - 2, 1, 2);
      if (rand() < 0.35) fill(ctx, L.FLOWERS[Math.floor(rand() * L.FLOWERS.length)], x + 1, y - 2);
    }
    fill(ctx, L.PLANTER, x0, y, bw, 3);
    fill(ctx, 0x8a5c3c, x0, y, bw, 1);
    fill(ctx, 0x3a2418, x0, y + 3, bw, 1);
  }
}

/** Zone 2: little balconies (slab, top rail, balusters) under most windows. */
function drawBalconies(ctx, windows, rand) {
  const [shadow, top, post] = L.RAIL;
  for (const w of windows) {
    if (rand() > L.BALCONY_SHARE || w.x1 - w.x0 < 8) continue;
    const x0 = w.x0 - 3;
    const bw = w.x1 - w.x0 + 7;
    const y = w.y1 + 1;
    fill(ctx, top, x0, y - 5, bw, 1);
    for (let x = x0; x < x0 + bw; x += 3) fill(ctx, post, x, y - 4, 1, 4);
    fill(ctx, top, x0 - 1, y, bw + 2, 1);
    fill(ctx, shadow, x0 - 1, y + 1, bw + 2, 2);
  }
}

/** Zone 3: red lacquer trim above and below every window, gold studs. */
function drawTrim(ctx, windows) {
  for (const w of windows) {
    if (w.x1 - w.x0 < 8) continue;
    const x0 = w.x0 - 3;
    const bw = w.x1 - w.x0 + 7;
    fill(ctx, L.TRIM, x0, w.y0 - 2, bw, 1);
    fill(ctx, L.TRIM, x0, w.y1 + 2, bw, 1);
    fill(ctx, L.TRIM_GOLD, x0, w.y1 + 2);
    fill(ctx, L.TRIM_GOLD, x0 + bw - 1, w.y1 + 2);
  }
}

/** Zone 4: moonlight on the spire's left edge (the moon hangs left). */
function drawMoonEdge(ctx, H, half) {
  const x0 = L.X_RANGE[3][0];
  fill(ctx, L.MOON_EDGE[0], x0, 0, 1, H);
  for (let y = 0; y < H; y += 2) fill(ctx, L.MOON_EDGE[1], x0 + 1, y + ((y >> 1) & 1));
  // the right edge falls into shadow
  const x1 = L.X_RANGE[3][1] - 1;
  ctx.globalAlpha = 0.35;
  fill(ctx, 0x0c0d18, x1 - 1, 0, 2, H);
  ctx.globalAlpha = 1;
  void half;
}
