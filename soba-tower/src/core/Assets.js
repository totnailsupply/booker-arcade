// =============================================================================
// Assets.js — the single place that knows every texture key, size and file.
//
// How art drops in without code changes:
//   1. Put the file in public/assets/ (names in ASSETS[*].file below).
//   2. List it in public/assets/manifest.json. Accepted shapes:
//        ["soba.png", "bell.png", ...]
//        { "files": ["soba.png", { "file": "soba.png", "frameWidth": 40, "frameHeight": 40 }] }
//        { "assets": { "soba": "soba.png", "bell": { "file": "bell.png" } } }
//   3. Reload. Listed files are loaded; everything else (or anything that fails
//      to load) falls back to a generated placeholder with the same key/size.
//
// Spritesheet layouts:
//   soba            40x40 frames, facing RIGHT, feet on the bottom row of every
//                   frame (frames differ in height on that shared baseline).
//                   Placeholder layout (SOBA_FRAMES): 0-1 idle, 2 crouch
//                   (landing), 3 rise, 4 apex, 5 fall, 6 steer (lean), 7 hurt,
//                   8-9 celebrate (no sit: falls back to idle). The real art
//                   (art/out, 12 frames) adds 'sit' [11] and a 2-frame fall; its
//                   manifest entry carries "animations": { "idle": [0, 1], ... }
//                   and registerAnimations() uses those frame lists instead.
//   plat-*          8x12 frames: 0 left cap, 1 middle, 2 right cap. Code composes
//                   any multiple-of-8 width (32-64 in play, wider for the roof).
//   spring          16x10, 2 frames (0 compressed = rest, 1 extended = sprung)
//   crow            24x16, 2 frames (wing up, wing down), facing RIGHT
//   roof            270x64, the roof deck surface on row PLATFORM.ROOF_DECK_ROW
// =============================================================================

import { SOBA, CROW, PLATFORM } from './Constants.js';

export const ASSET_BASE = 'assets/';
export const MANIFEST_URL = `${ASSET_BASE}manifest.json`;

export const SOBA_FRAMES = {
  IDLE: [0, 1],
  CROUCH: [2],
  RISE: [3],
  APEX: [4],
  FALL: [5],
  STEER: [6],
  HURT: [7],
  CELEBRATE: [8, 9],
  SIT: [0],
  COUNT: 10,
};

export const ASSETS = {
  soba:                   { file: 'soba.png', type: 'spritesheet', w: 40, h: 40, frames: SOBA_FRAMES.COUNT },
  'plat-beam':            { file: 'plat-beam.png', type: 'spritesheet', w: 8, h: 12, frames: 3 },
  'plat-slider':          { file: 'plat-slider.png', type: 'spritesheet', w: 8, h: 12, frames: 3 },
  'plat-crumble':         { file: 'plat-crumble.png', type: 'spritesheet', w: 8, h: 12, frames: 3 },
  'plat-crumble-cracked': { file: 'plat-crumble-cracked.png', type: 'spritesheet', w: 8, h: 12, frames: 3 },
  'plat-lift':            { file: 'plat-lift.png', type: 'spritesheet', w: 8, h: 12, frames: 3 },
  spring:                 { file: 'spring.png', type: 'spritesheet', w: 16, h: 10, frames: 2 },
  crow:                   { file: 'crow.png', type: 'spritesheet', w: 24, h: 16, frames: 2 },
  'roof-tile':            { file: 'roof-tile.png', type: 'image', w: 14, h: 10 },
  chimes:                 { file: 'chimes.png', type: 'image', w: 16, h: 24 },
  treat:                  { file: 'treat.png', type: 'image', w: 12, h: 12 },
  bell:                   { file: 'bell.png', type: 'image', w: 48, h: 48 },
  cushion:                { file: 'cushion.png', type: 'image', w: 40, h: 12 },
  'best-flag':            { file: 'best-flag.png', type: 'image', w: 16, h: 24 },
  paw:                    { file: 'paw.png', type: 'image', w: 10, h: 10 },
  wall:                   { file: 'wall.png', type: 'image', w: 192, h: 192 },
  skyline:                { file: 'skyline.png', type: 'image', w: 270, h: 160 },
  street:                 { file: 'street.png', type: 'image', w: 270, h: 48 },
  roof:                   { file: 'roof.png', type: 'image', w: 270, h: 64 },
  // Optional title art. No placeholder: TitleScene draws text when it's missing.
  title:                  { file: 'title.png', type: 'image', w: 240, h: 100, optional: true },
};

export const ANIMS = {
  IDLE: 'soba-idle',
  CROUCH: 'soba-crouch',
  RISE: 'soba-rise',
  APEX: 'soba-apex',
  FALL: 'soba-fall',
  STEER: 'soba-steer',
  HURT: 'soba-hurt',
  CELEBRATE: 'soba-celebrate',
  SIT: 'soba-sit',
  CROW_FLY: 'crow-fly',
};

// Tiny generated textures for particles (debris, feathers, sparkles).
export const FX_TEXTURES = { PIXEL: 'fx-px', DOT: 'fx-dot' };

// Hazard sprites (and the spring) get a baked 1 px light rim so they read
// against the dark facade and the night sky ("every hazard visible before it
// can hurt").
// Each rimmed texture is the source sheet with 1 px of padding per frame.
export const RIM = {
  PAD: 1,
  COLOR: [255, 226, 176],   // warm cream
  ALPHA: 230,
  KEYS: { crow: 'crow-rim', 'roof-tile': 'roof-tile-rim', chimes: 'chimes-rim', spring: 'spring-rim' },
};

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Fetches public/assets/manifest.json. Resolves to null when absent or invalid. */
export async function fetchManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html')) return null; // dev-server SPA fallback
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Turns any accepted manifest shape into { key: { file, frameWidth?, frameHeight? } }
 * for keys that exist in ASSETS.
 */
export function resolveManifest(manifest) {
  const out = {};
  if (!manifest) return out;

  const byFile = {};
  for (const [key, spec] of Object.entries(ASSETS)) byFile[spec.file] = key;

  const addEntry = (entry, keyHint) => {
    if (!entry) return;
    const obj = typeof entry === 'string' ? { file: entry } : entry;
    if (!obj.file) return;
    const file = String(obj.file).replace(/^\/?(assets\/)?/, '');
    const key = (keyHint && ASSETS[keyHint]) ? keyHint : (obj.key && ASSETS[obj.key] ? obj.key : byFile[file]);
    if (!key) return;
    out[key] = { ...obj, file };
  };

  if (Array.isArray(manifest)) {
    manifest.forEach(e => addEntry(e));
  } else if (typeof manifest === 'object') {
    if (Array.isArray(manifest.files)) manifest.files.forEach(e => addEntry(e));
    if (manifest.assets && typeof manifest.assets === 'object') {
      for (const [k, v] of Object.entries(manifest.assets)) addEntry(v, k);
    }
    // Also accept { "soba.png": {...}, "bell": "bell.png" } at the top level
    for (const [k, v] of Object.entries(manifest)) {
      if (k === 'files' || k === 'assets') continue;
      if (ASSETS[k]) addEntry(typeof v === 'string' ? v : { file: ASSETS[k].file, ...v }, k);
      else if (byFile[k]) addEntry(typeof v === 'object' && v ? { ...v, file: k } : k);
    }
  }
  return out;
}

/** Queues loader entries for every manifest-listed asset. Returns the keys queued. */
export function queueManifestLoads(loader, resolved) {
  const keys = [];
  for (const [key, entry] of Object.entries(resolved)) {
    const spec = ASSETS[key];
    const url = ASSET_BASE + entry.file;
    if (spec.type === 'spritesheet') {
      loader.spritesheet(key, url, {
        frameWidth: entry.frameWidth || spec.w,
        frameHeight: entry.frameHeight || spec.h,
      });
    } else {
      loader.image(key, url);
    }
    keys.push(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// CPU-backed canvas textures
// ---------------------------------------------------------------------------

/**
 * Like scene.textures.createCanvas, but the canvas's 2D context is created with
 * willReadFrequently (CPU-backed) before Phaser sees it. With pixelArt on,
 * Phaser's pooled canvases get a GPU-backed context first, so every
 * getImageData / drawImage-from-it during the load-time bakes was a GPU
 * readback stall ("GPU stall due to ReadPixels").
 */
export function createCanvasTexture(scene, key, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return scene.textures.addCanvas(key, canvas);
}

// ---------------------------------------------------------------------------
// Placeholders (canvas textures, same keys and sizes as the real art)
// ---------------------------------------------------------------------------

/** Generates a placeholder for every non-optional key that has no texture yet. */
export function generateMissingPlaceholders(scene) {
  const generated = [];
  for (const [key, spec] of Object.entries(ASSETS)) {
    if (spec.optional) continue;
    if (scene.textures.exists(key)) continue;
    const draw = PLACEHOLDER_DRAW[key];
    if (!draw) continue;
    const w = spec.type === 'spritesheet' ? spec.w * spec.frames : spec.w;
    const tex = createCanvasTexture(scene, key, w, spec.h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx, spec);
    if (spec.type === 'spritesheet') {
      for (let i = 0; i < spec.frames; i++) tex.add(i, 0, i * spec.w, 0, spec.w, spec.h);
    }
    tex.refresh();
    generated.push(key);
  }
  return generated;
}

/**
 * Registers Soba's animations. Frame lists come from the manifest entry's
 * "animations" (real art) when the sheet was loaded from a file, otherwise
 * from SOBA_FRAMES (placeholder). Tolerant of sheets with fewer frames.
 * @param {Phaser.Scene} scene
 * @param {object} [resolved] resolveManifest() output for the files that loaded
 */
export function registerAnimations(scene, resolved = {}) {
  const tex = scene.textures.get('soba');
  const has = (i) => tex && tex.has(i);
  const fromArt = resolved.soba?.animations || {};
  const listFor = (name, fallback) => {
    const l = fromArt[name];
    return Array.isArray(l) && l.length ? l : fallback;
  };
  const frames = (list) => {
    const out = list.filter(has).map(frame => ({ key: 'soba', frame }));
    return out.length ? out : [{ key: 'soba', frame: 0 }];
  };
  const make = (key, list, loopFps = SOBA.MULTI_FPS) => {
    if (scene.anims.exists(key)) scene.anims.remove(key);
    const f = frames(list);
    const loop = f.length > 1;
    scene.anims.create({ key, frames: f, frameRate: loop ? loopFps : 1, repeat: loop ? -1 : 0 });
  };
  make(ANIMS.IDLE, listFor('idle', SOBA_FRAMES.IDLE), SOBA.IDLE_FPS);
  make(ANIMS.CROUCH, listFor('crouch', SOBA_FRAMES.CROUCH));
  make(ANIMS.RISE, listFor('rise', SOBA_FRAMES.RISE));
  make(ANIMS.APEX, listFor('apex', SOBA_FRAMES.APEX));
  make(ANIMS.FALL, listFor('fall', SOBA_FRAMES.FALL));
  make(ANIMS.STEER, listFor('steer', SOBA_FRAMES.STEER));
  make(ANIMS.HURT, listFor('hurt', SOBA_FRAMES.HURT));
  make(ANIMS.CELEBRATE, listFor('celebrate', SOBA_FRAMES.CELEBRATE), SOBA.CELEBRATE_FPS);
  make(ANIMS.SIT, listFor('sit', SOBA_FRAMES.SIT));

  // Crow: 2-frame flap (the art's "fly" list, or both placeholder frames)
  const crowTex = scene.textures.get('crow');
  const crowList = (resolved.crow?.animations?.fly || [0, 1]).filter(i => crowTex && crowTex.has(i));
  buildRims(scene);
  // Crow (rimmed) flap animation, same frame list
  if (scene.anims.exists(ANIMS.CROW_FLY)) scene.anims.remove(ANIMS.CROW_FLY);
  scene.anims.create({
    key: ANIMS.CROW_FLY,
    frames: (crowList.length ? crowList : [0]).map(frame => ({ key: RIM.KEYS.crow, frame })),
    frameRate: CROW.FLAP_FPS,
    repeat: -1,
  });

  // Particle textures
  if (!scene.textures.exists(FX_TEXTURES.PIXEL)) {
    const t = createCanvasTexture(scene, FX_TEXTURES.PIXEL, 2, 2);
    const c = t.getContext();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 2, 2);
    t.refresh();
  }
  if (!scene.textures.exists(FX_TEXTURES.DOT)) {
    const t = createCanvasTexture(scene, FX_TEXTURES.DOT, 3, 3);
    const c = t.getContext();
    c.fillStyle = '#ffffff';
    c.fillRect(1, 0, 1, 3);
    c.fillRect(0, 1, 3, 1);
    t.refresh();
  }
}

/**
 * Bakes the rimmed hazard textures (RIM.KEYS) from whatever 'crow' /
 * 'roof-tile' / 'chimes' textures exist (loaded art or placeholders).
 */
export function buildRims(scene) {
  for (const [src, key] of Object.entries(RIM.KEYS)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const spec = ASSETS[src];
    const tex = scene.textures.get(src);
    const img = tex.getSourceImage();
    const frames = spec.type === 'spritesheet' ? spec.frames : 1;
    const P = RIM.PAD;
    const fw = spec.w + P * 2;
    const fh = spec.h + P * 2;
    const out = createCanvasTexture(scene, key, fw * frames, fh);
    const ctx = out.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < frames; i++) {
      const f = spec.type === 'spritesheet' ? tex.get(i) : tex.get();
      if (!f) continue;
      ctx.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, i * fw + P, P, spec.w, spec.h);
    }
    const data = ctx.getImageData(0, 0, fw * frames, fh);
    const d = data.data;
    const W = fw * frames;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < fh && d[(y * W + x) * 4 + 3] > 0;
    const rim = [];
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < W; x++) {
        if (opaque(x, y)) continue;
        const fx = x % fw;
        const same = (dx) => Math.floor((x + dx) / fw) === Math.floor(x / fw);   // don't bleed across frames
        if ((fx > 0 && same(-1) && opaque(x - 1, y)) || (same(1) && opaque(x + 1, y)) || opaque(x, y - 1) || opaque(x, y + 1)) {
          rim.push(x, y);
        }
      }
    }
    for (let i = 0; i < rim.length; i += 2) {
      const o = (rim[i + 1] * W + rim[i]) * 4;
      d[o] = RIM.COLOR[0];
      d[o + 1] = RIM.COLOR[1];
      d[o + 2] = RIM.COLOR[2];
      d[o + 3] = RIM.ALPHA;
    }
    ctx.putImageData(data, 0, 0);
    for (let i = 0; i < frames; i++) out.add(i, 0, i * fw, 0, fw, fh);
    out.refresh();
  }
}

/**
 * Builds (once) and returns the key of a platform texture `w` px wide, composed
 * from a 3-frame [left cap, middle, right cap] sheet. Works for placeholders
 * (canvas) and loaded images alike.
 */
export function composedPlatformKey(scene, baseKey, w) {
  const key = `${baseKey}@${w}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(baseKey);
  const spec = ASSETS[baseKey];
  const segW = spec.w;
  const h = spec.h;
  const tex = createCanvasTexture(scene, key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const img = src.getSourceImage();
  const blit = (frameIndex, dx) => {
    const f = src.get(frameIndex);
    if (!f) return;
    ctx.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, dx, 0, segW, h);
  };
  const segs = Math.max(2, Math.round(w / segW));
  for (let i = 0; i < segs; i++) {
    const frame = i === 0 ? 0 : (i === segs - 1 ? 2 : 1);
    blit(frame, i * segW);
  }
  tex.refresh();
  return key;
}

// --- drawing helpers ---

function rect(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Fills spans: rows = [[y, x0, x1], ...] inclusive. */
function spans(ctx, color, rows, dx = 0, dy = 0) {
  ctx.fillStyle = color;
  for (const [y, x0, x1] of rows) ctx.fillRect(x0 + dx, y + dy, x1 - x0 + 1, 1);
}

/** Adds a 1 px outline around every opaque pixel of a canvas region. */
function outline(ctx, x, y, w, h, color) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const opaque = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0;
  const add = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (opaque(i, j)) continue;
      if (opaque(i - 1, j) || opaque(i + 1, j) || opaque(i, j - 1) || opaque(i, j + 1)) add.push([i, j]);
    }
  }
  ctx.fillStyle = color;
  for (const [i, j] of add) ctx.fillRect(x + i, y + j, 1, 1);
}

// ---------------------------------------------------------------------------
// Soba placeholder: a small fluffy tricolor dog, 40x40 per frame, facing right.
// Black body/head, tall pointed ears with pink insides, tan brow dots and
// cheeks, thin white blaze, white muzzle, big white chest ruff, white front
// legs, tan back legs with white toes, pink tongue, plumed black tail.
// ---------------------------------------------------------------------------

const DOG = {
  OUT: '#1a1220',
  BLACK: '#2e2836',
  BLACK_HI: '#4f4760',
  BLACK_SH: '#221d29',
  WHITE: '#f6f1e8',
  WHITE_SH: '#cdc3c4',
  TAN: '#c47a3a',
  TAN_HI: '#e09a58',
  TAN_SH: '#97582a',
  PINK: '#f2879e',
  PINK_DK: '#c4566f',
  EYE: '#6b3a1c',
  NOSE: '#120e16',
};

const SOBA_POSES = [
  { by: 0, legs: 'stand', ears: 'up', eyes: 'open', tongue: true },                     // 0 idle
  { by: 1, legs: 'stand', ears: 'up', eyes: 'open', tongue: true },                     // 1 idle (breath)
  { by: 3, legs: 'crouch', ears: 'low', eyes: 'happy', tongue: false },                 // 2 crouch
  { by: -1, legs: 'stretch', ears: 'back', eyes: 'open', tongue: false },               // 3 rise
  { by: 0, legs: 'spread', ears: 'up', eyes: 'happy', tongue: true },                   // 4 apex
  { by: 0, legs: 'dangle', ears: 'flap', eyes: 'wide', tongue: false },                 // 5 fall
  { by: 0, legs: 'stretch', ears: 'back', eyes: 'open', tongue: true, lean: 2 },        // 6 steer
  { by: 0, legs: 'dangle', ears: 'back', eyes: 'x', tongue: true },                     // 7 hurt
  { by: 0, legs: 'stand', ears: 'up', eyes: 'happy', tongue: true, pawsUp: true },      // 8 celebrate
  { by: -2, legs: 'hop', ears: 'flap', eyes: 'happy', tongue: true, pawsUp: true },     // 9 celebrate
];

function drawSobaPose(ctx, pose) {
  const by = pose.by;
  const hx = pose.lean || 0;      // head lean (steer)
  const C = DOG;

  // --- legs (drawn first, behind the body) ---
  const backLeg = (x, y0, y1, toe = true, color = C.TAN) => {
    rect(ctx, color, x, y0, 3, y1 - y0 + 1);
    if (toe) rect(ctx, C.WHITE, x, y1 - 1, 3, 2);
  };
  const frontLeg = (x, y0, y1) => {
    rect(ctx, C.WHITE, x, y0, 3, y1 - y0 + 1);
    rect(ctx, C.WHITE_SH, x + 2, y0 + 1, 1, Math.max(1, y1 - y0 - 1));
    rect(ctx, C.WHITE, x - 1, y1, 4, 1);
  };
  switch (pose.legs) {
    case 'crouch':
      backLeg(9, 35, 39, true, C.TAN_SH); backLeg(14, 35, 39);
      frontLeg(19, 35, 39); frontLeg(27, 35, 39);
      break;
    case 'stretch':
      backLeg(7, 33, 39, true, C.TAN_SH); backLeg(11, 33, 38);
      frontLeg(25, 32, 35); frontLeg(29, 32, 34);
      break;
    case 'spread':
      backLeg(5, 32, 36, true, C.TAN_SH); backLeg(9, 32, 37);
      frontLeg(27, 31, 34); frontLeg(31, 30, 33);
      break;
    case 'dangle':
      backLeg(9, 33, 39, true, C.TAN_SH); backLeg(14, 33, 39);
      frontLeg(22, 33, 39); frontLeg(27, 33, 39);
      break;
    case 'hop':
      backLeg(9, 32, 36, true, C.TAN_SH); backLeg(14, 32, 36);
      if (!pose.pawsUp) { frontLeg(22, 32, 36); frontLeg(27, 32, 36); }
      break;
    default: // stand
      backLeg(10, 33, 39, true, C.TAN_SH); backLeg(14, 33, 39);
      if (!pose.pawsUp) { frontLeg(21, 33, 39); frontLeg(26, 33, 39); }
      else { frontLeg(22, 33, 39); }
  }

  // --- tail: plumed, curling up behind the body ---
  spans(ctx, C.BLACK, [
    [16, 5, 7], [17, 4, 8], [18, 3, 8], [19, 3, 9], [20, 3, 9], [21, 4, 10],
    [22, 5, 10], [23, 6, 11], [24, 7, 11], [25, 8, 11], [26, 9, 11],
  ], -hx / 2, by);
  spans(ctx, C.BLACK_HI, [[16, 5, 6], [17, 4, 4], [18, 3, 3], [19, 3, 3]], -hx / 2, by);

  // --- body ---
  spans(ctx, C.BLACK, [[25, 11, 25], ...[26, 27, 28, 29, 30, 31, 32].map(y => [y, 9, 27]), [33, 10, 26]], 0, by);
  spans(ctx, C.BLACK_HI, [[25, 12, 20]], 0, by);
  spans(ctx, C.BLACK_SH, [[32, 10, 18], [33, 11, 17]], 0, by);
  // tan thigh
  spans(ctx, C.TAN, [[29, 10, 15], [30, 9, 15], [31, 9, 15], [32, 9, 14], [33, 10, 14]], 0, by);
  spans(ctx, C.TAN_HI, [[29, 11, 13]], 0, by);

  // --- big white chest ruff ---
  spans(ctx, C.WHITE, [
    [24, 20, 30], [25, 19, 31], [26, 19, 31], [27, 19, 31], [28, 19, 31], [29, 19, 31],
    [30, 19, 31], [31, 20, 30], [32, 20, 21], [32, 23, 24], [32, 26, 27], [32, 29, 30],
    [33, 21, 21], [33, 24, 24], [33, 27, 27],
  ], hx / 2, by);
  spans(ctx, C.WHITE_SH, [[26, 19, 19], [27, 19, 19], [28, 19, 19], [29, 19, 19], [30, 19, 19], [31, 20, 20]], hx / 2, by);

  if (pose.pawsUp) {
    // front legs raised in a cheer
    rect(ctx, C.WHITE, 30 + hx, 22 + by, 3, 6);
    rect(ctx, C.WHITE, 31 + hx, 20 + by, 3, 2);
    rect(ctx, C.WHITE_SH, 32 + hx, 23 + by, 1, 4);
  }

  // --- ears (tall, pointed, pink inside) ---
  let earLift = 0;
  let tipShift = 0;
  let splay = 0;
  if (pose.ears === 'low') earLift = 2;
  if (pose.ears === 'back') tipShift = -2;
  if (pose.ears === 'flap') { earLift = -2; splay = 1; }
  const ear = (rows, inner, dir) => {
    const shifted = rows.map(([y, x0, x1]) => {
      const k = Math.max(0, (11 - y) / 7);           // 1 at the tip, 0 at the base
      const sx = Math.round(k * (tipShift + splay * dir * 2));
      return [y + Math.round(k * earLift), x0 + sx + hx, x1 + sx + hx];
    });
    spans(ctx, C.BLACK, shifted, 0, by);
    const inn = inner.map(([y, x0, x1]) => {
      const k = Math.max(0, (11 - y) / 7);
      const sx = Math.round(k * (tipShift + splay * dir * 2));
      return [y + Math.round(k * earLift), x0 + sx + hx, x1 + sx + hx];
    });
    spans(ctx, C.PINK, inn, 0, by);
  };
  ear([[4, 19, 19], [5, 19, 20], [6, 18, 20], [7, 18, 21], [8, 18, 21], [9, 18, 22], [10, 18, 22]],
    [[7, 19, 19], [8, 19, 20], [9, 19, 20], [10, 20, 21]], -1);
  ear([[4, 30, 30], [5, 29, 30], [6, 29, 31], [7, 28, 31], [8, 28, 31], [9, 27, 31], [10, 27, 32]],
    [[7, 30, 30], [8, 29, 30], [9, 29, 30], [10, 28, 29]], 1);

  // --- head ---
  const head = [[11, 20, 30], [12, 19, 31]];
  for (let y = 13; y <= 22; y++) head.push([y, 18, 32]);
  head.push([23, 19, 31], [24, 21, 29]);
  spans(ctx, C.BLACK, head, hx, by);
  spans(ctx, C.BLACK_HI, [[11, 20, 24], [12, 19, 19], [13, 18, 18], [14, 18, 18], [15, 18, 18]], hx, by);

  // white blaze up the forehead, widening into the muzzle
  spans(ctx, C.WHITE, [[12, 25, 25], [13, 25, 25], [14, 25, 25], [15, 25, 25], [16, 25, 25], [17, 24, 26]], hx, by);
  // muzzle
  spans(ctx, C.WHITE, [[18, 24, 30], [19, 24, 33], [20, 23, 34], [21, 23, 34], [22, 24, 33], [23, 25, 31]], hx, by);
  spans(ctx, C.WHITE_SH, [[22, 24, 26], [23, 25, 27]], hx, by);
  // nose
  spans(ctx, C.NOSE, [[19, 32, 34], [20, 33, 34]], hx, by);
  // tan cheeks and brow dots
  spans(ctx, C.TAN, [[18, 19, 21], [19, 19, 22], [20, 20, 22]], hx, by);
  spans(ctx, C.TAN, [[14, 21, 22], [14, 28, 29]], hx, by);

  // eyes
  const eye = (x) => {
    switch (pose.eyes) {
      case 'happy':
        rect(ctx, C.EYE, x + hx, 16 + by); rect(ctx, C.EYE, x + 1 + hx, 15 + by); rect(ctx, C.EYE, x + 2 + hx, 16 + by);
        break;
      case 'wide':
        rect(ctx, C.EYE, x + hx, 15 + by, 2, 3); rect(ctx, C.WHITE, x + hx, 15 + by);
        break;
      case 'x':
        rect(ctx, C.WHITE, x + hx, 15 + by); rect(ctx, C.WHITE, x + 2 + hx, 15 + by);
        rect(ctx, C.WHITE, x + 1 + hx, 16 + by);
        rect(ctx, C.WHITE, x + hx, 17 + by); rect(ctx, C.WHITE, x + 2 + hx, 17 + by);
        break;
      default:
        rect(ctx, C.EYE, x + hx, 15 + by, 2, 2); rect(ctx, C.WHITE, x + hx, 15 + by);
    }
  };
  eye(pose.eyes === 'happy' || pose.eyes === 'x' ? 20 : 21);
  eye(pose.eyes === 'happy' || pose.eyes === 'x' ? 27 : 28);

  // mouth + tongue
  if (pose.tongue) {
    spans(ctx, C.PINK, [[22, 29, 31], [23, 29, 31], [24, 29, 31], [25, 30, 30]], hx, by);
    rect(ctx, C.PINK_DK, 30 + hx, 23 + by);
  } else {
    rect(ctx, C.BLACK_SH, 29 + hx, 22 + by, 3, 1);
  }
}

function drawSobaSheet(ctx, spec) {
  for (let f = 0; f < spec.frames; f++) {
    const ox = f * spec.w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, 0, spec.w, spec.h);
    ctx.clip();
    ctx.translate(ox, 0);
    drawSobaPose(ctx, SOBA_POSES[f] || SOBA_POSES[0]);
    ctx.restore();
    outline(ctx, ox, 0, spec.w, spec.h, DOG.OUT);
  }
}

// ---------------------------------------------------------------------------
// Platforms: [left cap, middle, right cap], 8x12 each, top surface at row 0.
// ---------------------------------------------------------------------------

function drawPlatformSheet(ctx, pal, extra) {
  for (let f = 0; f < 3; f++) {
    const ox = f * 8;
    rect(ctx, pal.top, ox, 0, 8, 2);
    rect(ctx, pal.body, ox, 2, 8, 6);
    rect(ctx, pal.grain, ox, 4, 8, 1);
    rect(ctx, pal.under, ox, 8, 8, 3);
    rect(ctx, pal.edge, ox, 11, 8, 1);
    if (f === 0) {
      rect(ctx, pal.edge, ox, 0, 1, 12);
      rect(ctx, pal.top, ox + 1, 0, 1, 1);
      rect(ctx, pal.bolt, ox + 3, 5, 2, 2);
      ctx.clearRect(ox, 0, 1, 1);
      ctx.clearRect(ox, 11, 1, 1);
    } else if (f === 2) {
      rect(ctx, pal.edge, ox + 7, 0, 1, 12);
      rect(ctx, pal.bolt, ox + 3, 5, 2, 2);
      ctx.clearRect(ox + 7, 0, 1, 1);
      ctx.clearRect(ox + 7, 11, 1, 1);
    } else {
      rect(ctx, pal.grain, ox + 2, 6, 3, 1);
    }
    if (extra) extra(ctx, ox, f);
  }
}

const PAL_BEAM = { top: '#f0b878', body: '#c0803f', grain: '#9a5f2e', under: '#6a3f22', edge: '#3a2216', bolt: '#5a3820' };
const PAL_SLIDER = { top: '#c8dcea', body: '#7f9bb0', grain: '#5f7b90', under: '#3e4e5c', edge: '#1e2630', bolt: '#e8f0f6' };
const PAL_CRUMBLE = { top: '#ead2a0', body: '#c9a26b', grain: '#a07a48', under: '#6e5232', edge: '#3e2c1c', bolt: '#7a5a38' };
const PAL_LIFT = { top: '#b8a2d0', body: '#6e5a7e', grain: '#56446a', under: '#3a2c4a', edge: '#1c1424', bolt: '#e0c060' };

const PLACEHOLDER_DRAW = {
  soba: drawSobaSheet,

  'plat-beam'(ctx) { drawPlatformSheet(ctx, PAL_BEAM); },
  'plat-slider'(ctx) {
    drawPlatformSheet(ctx, PAL_SLIDER, (c, ox) => { rect(c, PAL_SLIDER.bolt, ox + 1, 3, 1, 1); rect(c, PAL_SLIDER.bolt, ox + 6, 3, 1, 1); });
  },
  'plat-crumble'(ctx) {
    drawPlatformSheet(ctx, PAL_CRUMBLE, (c, ox, f) => { rect(c, PAL_CRUMBLE.edge, ox + 3 + f, 2, 1, 3); rect(c, PAL_CRUMBLE.edge, ox + 4 + f, 5, 1, 2); });
  },
  'plat-crumble-cracked'(ctx) {
    drawPlatformSheet(ctx, PAL_CRUMBLE, (c, ox) => {
      c.clearRect(ox + 3, 0, 2, 5);
      rect(c, PAL_CRUMBLE.edge, ox + 2, 0, 1, 7); rect(c, PAL_CRUMBLE.edge, ox + 5, 3, 1, 6);
      c.clearRect(ox + 4, 8, 1, 4);
    });
  },
  'plat-lift'(ctx) {
    drawPlatformSheet(ctx, PAL_LIFT, (c, ox, f) => { if (f !== 1) rect(c, PAL_LIFT.bolt, ox + 3, 1, 2, 1); });
  },

  spring(ctx) {
    for (let f = 0; f < 2; f++) {
      const ox = f * 16;
      const h = f === 0 ? 6 : 9;
      rect(ctx, '#8a8a9a', ox + 2, 10 - 2, 12, 2);
      for (let i = 0; i < h - 2; i += 2) rect(ctx, '#d0d0e0', ox + 4, 10 - 3 - i, 8, 1);
      rect(ctx, '#e04a4a', ox + 1, 10 - h, 14, 2);
    }
  },

  crow(ctx) {
    for (let f = 0; f < 2; f++) {
      const ox = f * 24;
      rect(ctx, '#1c1824', ox + 6, 6, 12, 6);
      rect(ctx, '#1c1824', ox + 16, 4, 5, 5);
      rect(ctx, '#f0b030', ox + 21, 6, 3, 2);
      rect(ctx, '#ffffff', ox + 18, 5, 1, 1);
      rect(ctx, '#1c1824', ox + 2, 7, 5, 2);
      if (f === 0) rect(ctx, '#2e2838', ox + 8, 0, 7, 6);
      else rect(ctx, '#2e2838', ox + 8, 11, 7, 5);
    }
  },

  'roof-tile'(ctx) {
    rect(ctx, '#b4503a', 0, 0, 14, 10);
    rect(ctx, '#d8704e', 0, 0, 14, 2);
    rect(ctx, '#7a3020', 0, 8, 14, 2);
    rect(ctx, '#7a3020', 6, 2, 2, 6);
  },

  chimes(ctx) {
    rect(ctx, '#6a4a2a', 1, 0, 14, 2);
    [2, 6, 10, 13].forEach((x, i) => rect(ctx, '#d8d0b0', x, 2, 1, 12 + (i % 2) * 6));
    rect(ctx, '#ff5a4a', 6, 18, 4, 6);
  },

  treat(ctx) {
    rect(ctx, '#c8803e', 3, 4, 6, 4);
    rect(ctx, '#c8803e', 1, 2, 3, 3); rect(ctx, '#c8803e', 1, 7, 3, 3);
    rect(ctx, '#c8803e', 8, 2, 3, 3); rect(ctx, '#c8803e', 8, 7, 3, 3);
    rect(ctx, '#e8a868', 2, 2, 2, 1); rect(ctx, '#e8a868', 4, 4, 4, 1);
    outline(ctx, 0, 0, 12, 12, '#3a2216');
  },

  bell(ctx) {
    // wooden frame
    rect(ctx, '#6a3a22', 3, 2, 42, 4);
    rect(ctx, '#8a5232', 3, 2, 42, 1);
    rect(ctx, '#6a3a22', 5, 6, 4, 42);
    rect(ctx, '#6a3a22', 39, 6, 4, 42);
    rect(ctx, '#3a2216', 23, 6, 2, 5);
    // bronze bell
    const rows = [];
    for (let y = 11; y <= 40; y++) {
      const t = (y - 11) / 29;
      const half = Math.round(5 + t * t * 9 + (y > 36 ? 2 : 0));
      rows.push([y, 24 - half, 23 + half]);
    }
    spans(ctx, '#c8902e', rows);
    spans(ctx, '#f0c860', rows.filter((_, i) => i % 1 === 0).map(([y, x0]) => [y, x0 + 2, x0 + 3]));
    rect(ctx, '#8a5a1a', 9, 37, 30, 2);
    rect(ctx, '#8a5a1a', 13, 22, 22, 1);
    rect(ctx, '#3a2216', 22, 41, 4, 4);   // clapper
    outline(ctx, 0, 0, 48, 48, '#1a1220');
  },

  cushion(ctx) {
    spans(ctx, '#e0456a', [[2, 6, 33], [3, 3, 36], [4, 2, 37], [5, 1, 38], [6, 1, 38], [7, 1, 38], [8, 2, 37], [9, 3, 36], [10, 6, 33]]);
    spans(ctx, '#ff7a98', [[3, 6, 30], [4, 4, 20]]);
    spans(ctx, '#a82a4a', [[9, 6, 33], [10, 8, 31]]);
    rect(ctx, '#ffd34d', 0, 4, 2, 5); rect(ctx, '#ffd34d', 38, 4, 2, 5);
    rect(ctx, '#ffd34d', 19, 5, 2, 2);
  },

  'best-flag'(ctx) {
    rect(ctx, '#d8d0c0', 1, 0, 2, 24);
    rect(ctx, '#ffd34d', 3, 1, 12, 9);
    rect(ctx, '#e0a020', 3, 8, 12, 2);
    rect(ctx, '#7a4a10', 7, 3, 1, 5); rect(ctx, '#7a4a10', 8, 3, 2, 1); rect(ctx, '#7a4a10', 8, 5, 2, 1); rect(ctx, '#7a4a10', 8, 7, 2, 1); rect(ctx, '#7a4a10', 10, 4, 1, 1); rect(ctx, '#7a4a10', 10, 6, 1, 1);
  },

  paw(ctx) {
    spans(ctx, '#ffffff', [[4, 3, 6], [5, 2, 7], [6, 2, 7], [7, 2, 7], [8, 3, 6]]);
    rect(ctx, '#ffffff', 0, 2, 2, 2); rect(ctx, '#ffffff', 3, 0, 2, 2); rect(ctx, '#ffffff', 6, 0, 2, 2); rect(ctx, '#ffffff', 8, 2, 2, 2);
    spans(ctx, '#f2879e', [[5, 4, 5], [6, 3, 6], [7, 4, 5]]);
  },

  wall(ctx, spec) {
    // Tower facade: plum plaster, 3 floors per tile (64 px), warm lit windows.
    const W = spec.w;
    rect(ctx, '#5a3448', 0, 0, W, spec.h);
    for (let y = 0; y < spec.h; y += 8) rect(ctx, '#55304a', (y / 8) % 2 ? 0 : 6, y, W, 1);
    const lit = ['#ffd27a', '#ffc060', '#2a1a2e', '#ffd27a', '#ffb860', '#ffd27a', '#2a1a2e', '#ffe090', '#ffd27a'];
    for (let floor = 0; floor < 3; floor++) {
      const fy = floor * 64;
      rect(ctx, '#3e2234', 0, fy + 58, W, 6);          // floor ledge
      rect(ctx, '#74465c', 0, fy + 58, W, 1);
      for (let i = 0; i < 3; i++) {
        const wx = 22 + i * 56;
        const color = lit[(floor * 3 + i) % lit.length];
        rect(ctx, '#2a1424', wx - 2, fy + 18, 28, 32);   // frame
        rect(ctx, color, wx, fy + 20, 24, 28);
        rect(ctx, '#2a1424', wx + 11, fy + 20, 2, 28);  // mullion
        rect(ctx, '#2a1424', wx, fy + 32, 24, 2);
        if (color !== '#2a1a2e') rect(ctx, '#fff2c0', wx + 2, fy + 22, 3, 6);
        rect(ctx, '#c8503a', wx - 3, fy + 14, 30, 3);   // little awning
      }
    }
    // pilasters on both sides
    rect(ctx, '#3e2234', 0, 0, 6, spec.h);
    rect(ctx, '#3e2234', W - 6, 0, 6, spec.h);
    rect(ctx, '#6e4258', 6, 0, 1, spec.h);
    rect(ctx, '#6e4258', W - 7, 0, 1, spec.h);
  },

  skyline(ctx, spec) {
    // Far rooftops in silhouette, transparent above.
    const base = spec.h;
    const shapes = [[0, 40, 70], [34, 30, 100], [60, 46, 56], [104, 26, 120], [126, 50, 84], [172, 34, 64], [202, 40, 108], [238, 32, 76]];
    for (const [x, w, h] of shapes) {
      rect(ctx, '#3a2448', x, base - h, w, h);
      // pagoda-ish roof cap
      spans(ctx, '#2e1c3a', [[base - h - 1, x - 2, x + w + 1], [base - h - 2, x + 1, x + w - 2], [base - h - 3, x + 4, x + w - 5]]);
      for (let wy = base - h + 8; wy < base - 10; wy += 14) {
        for (let wx = x + 5; wx < x + w - 6; wx += 10) {
          if (((wx * 7 + wy * 3) % 5) < 2) rect(ctx, '#ffcf7a', wx, wy, 3, 4);
        }
      }
    }
  },

  street(ctx, spec) {
    rect(ctx, '#7a6070', 0, 0, spec.w, 6);      // sidewalk
    rect(ctx, '#9a8090', 0, 0, spec.w, 1);
    for (let x = 0; x < spec.w; x += 18) rect(ctx, '#5e4a58', x, 1, 1, 5);
    rect(ctx, '#4a3a48', 0, 6, spec.w, 2);      // curb
    rect(ctx, '#2e2433', 0, 8, spec.w, spec.h - 8);
    for (let x = 6; x < spec.w; x += 34) rect(ctx, '#d8c070', x, 26, 18, 2);
    rect(ctx, '#241c2a', 0, spec.h - 4, spec.w, 4);
  },

  roof(ctx, spec) {
    // Same layout as the real art: a railed deck whose walkable surface is row
    // PLATFORM.ROOF_DECK_ROW, teal tiles with upturned eaves below it.
    const W = spec.w;
    const d = PLATFORM.ROOF_DECK_ROW;
    // back railings
    for (const [x0, x1] of [[36, 92], [178, 234]]) {
      rect(ctx, '#7a2a24', x0, d - 12, x1 - x0, 2);
      rect(ctx, '#7a2a24', x0, d - 6, x1 - x0, 2);
      for (let x = x0; x <= x1; x += 14) rect(ctx, '#a0402a', x, d - 14, 3, 14);
    }
    rect(ctx, '#1a1220', 30, d - 1, W - 60, 1);
    rect(ctx, '#87462c', 30, d, W - 60, 7);           // deck planks
    rect(ctx, '#653221', 30, d + 7, W - 60, 2);
    rect(ctx, '#1a1220', 30, d + 9, W - 60, 1);
    for (let y = d + 10; y < d + 22; y++) {
      const inset = Math.max(0, Math.round((y - d - 10) * -1.2 + 14));
      rect(ctx, (y % 3 === 0) ? '#184652' : '#3a7a80', inset, y, W - inset * 2, 1);
    }
    rect(ctx, '#2a1a30', 0, d + 22, W, 3);
    rect(ctx, '#e0a040', 0, d + 8, 6, 4); rect(ctx, '#e0a040', W - 6, d + 8, 6, 4);
    for (let x = 30; x < W - 30; x += 46) rect(ctx, '#87462c', x, spec.h - 6, 8, 6);
  },
};

