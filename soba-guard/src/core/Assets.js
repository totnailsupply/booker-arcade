// =============================================================================
// Assets.js — the single place that knows every texture key, size and file
// (PLAN §7 asset contract).
//
// How art drops in without code changes:
//   1. Put the file in public/assets/ (names in ASSETS[*].file below).
//   2. List it in public/assets/manifest.json. Accepted shapes:
//        ["soba.png", "rat.png", ...]
//        { "files": ["soba.png", { "file": "rat.png", "frameWidth": 32, "frameHeight": 32 }] }
//        { "assets": { "soba": "soba.png", "rat": { "file": "rat.png" } } }
//   3. Reload. Listed files are loaded; everything else (or anything that fails
//      to load) falls back to a code-drawn placeholder with the same key, frame
//      size and frame count, so the game never depends on the art being there.
//
// Frame layouts (all sheets are one row of frames):
//   soba                40x40 x10  idle 0-1, bark 2-3, run 4-7, cheer 8, sad 9 (faces right)
//   luckycat/steamer/chili 32x32 x3  idle 0-1, action 2
//   onigiri             32x32 x3   full, bitten, crumbling
//   rat/lidrat/crow/tanuki/fox 32x32 x4  walk 0-1, bite 2-3 (face left)
//   scooter             32x24 x2
//   items               16x16 x8   coin, dumpling, lid, ember, feather, stone puff, bone, star
//   tiles               40x40 x4   garden light, garden dark, porch, alley
//   house 72x248, alley 168x248, title 320x120 (single images)
// =============================================================================

export const ASSET_BASE = 'assets/';
export const MANIFEST_URL = `${ASSET_BASE}manifest.json`;

export const ITEM = { COIN: 0, DUMPLING: 1, LID: 2, EMBER: 3, FEATHER: 4, STONE: 5, BONE: 6, STAR: 7 };
export const TILE = { GARDEN_LIGHT: 0, GARDEN_DARK: 1, PORCH: 2, ALLEY: 3 };
export const UNIT_FRAMES = { IDLE: [0, 1], ACTION: 2 };
export const ENEMY_FRAMES = { WALK: [0, 1], BITE: [2, 3] };
export const SOBA_FRAMES = { IDLE: [0, 1], BARK: [2, 3], RUN: [4, 5, 6, 7], CHEER: 8, SAD: 9 };

const sheet = (file, w, h, frames) => ({ file, type: 'spritesheet', w, h, frames });
const image = (file, w, h) => ({ file, type: 'image', w, h });

export const ASSETS = {
  soba: sheet('soba.png', 40, 40, 10),
  luckycat: sheet('luckycat.png', 32, 32, 3),
  steamer: sheet('steamer.png', 32, 32, 3),
  chili: sheet('chili.png', 32, 32, 3),
  onigiri: sheet('onigiri.png', 32, 32, 3),
  rat: sheet('rat.png', 32, 32, 4),
  lidrat: sheet('lidrat.png', 32, 32, 4),
  crow: sheet('crow.png', 32, 32, 4),
  tanuki: sheet('tanuki.png', 32, 32, 4),
  fox: sheet('fox.png', 32, 32, 4),
  scooter: sheet('scooter.png', 32, 24, 2),
  items: sheet('items.png', 16, 16, 8),
  tiles: sheet('tiles.png', 40, 40, 4),
  house: image('house.png', 72, 248),
  alley: image('alley.png', 168, 248),
  title: image('title.png', 320, 120),
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
 * Like scene.textures.createCanvas, but the 2D context is created with
 * willReadFrequently (CPU-backed) before Phaser sees it. With pixelArt on,
 * Phaser's pooled canvases are GPU-backed, so getImageData (the outline pass)
 * would stall on a GPU readback.
 */
export function createCanvasTexture(scene, key, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return scene.textures.addCanvas(key, canvas);
}

/** Generates a placeholder for every key that has no texture yet. Returns the keys. */
export function generateMissingPlaceholders(scene) {
  const generated = [];
  for (const [key, spec] of Object.entries(ASSETS)) {
    if (scene.textures.exists(key)) continue;
    const draw = PLACEHOLDER_DRAW[key];
    if (!draw) continue;
    const frames = spec.type === 'spritesheet' ? spec.frames : 1;
    const tex = createCanvasTexture(scene, key, spec.w * frames, spec.h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < frames; i++) {
      ctx.save();
      ctx.translate(i * spec.w, 0);
      draw(ctx, i, spec);
      ctx.restore();
      if (!NO_OUTLINE.has(key)) outlineFrame(ctx, i * spec.w, 0, spec.w, spec.h);
    }
    if (spec.type === 'spritesheet') {
      for (let i = 0; i < frames; i++) tex.add(i, 0, i * spec.w, 0, spec.w, spec.h);
    }
    tex.refresh();
    generated.push(key);
  }
  return generated;
}

// ---------------------------------------------------------------------------
// Placeholder painting helpers (pixel-exact, no anti-aliasing)
// ---------------------------------------------------------------------------

const OUTLINE = [26, 18, 32];
const NO_OUTLINE = new Set(['tiles', 'house', 'alley', 'title']);

function rect(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function ellipse(ctx, color, cx, cy, rx, ry) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Filled triangle by scanlines: apex (ax, ay), base from (x0, by) to (x1, by). */
function triangle(ctx, color, ax, ay, x0, x1, by) {
  ctx.fillStyle = color;
  const h = by - ay;
  for (let y = ay; y <= by; y++) {
    const t = h === 0 ? 1 : (y - ay) / h;
    const l = Math.round(ax + (x0 - ax) * t);
    const r = Math.round(ax + (x1 - ax) * t);
    ctx.fillRect(Math.min(l, r), y, Math.abs(r - l) + 1, 1);
  }
}

/** 1 px dark outline around every opaque pixel of one frame. */
function outlineFrame(ctx, fx, fy, w, h) {
  const img = ctx.getImageData(fx, fy, w, h);
  const d = img.data;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const add = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) add.push(x, y);
    }
  }
  for (let i = 0; i < add.length; i += 2) {
    const o = (add[i + 1] * w + add[i]) * 4;
    d[o] = OUTLINE[0];
    d[o + 1] = OUTLINE[1];
    d[o + 2] = OUTLINE[2];
    d[o + 3] = 255;
  }
  ctx.putImageData(img, fx, fy);
}

// --- characters ----------------------------------------------------------------

function drawSoba(ctx, f) {
  // Tricolor dog block facing right: tan back, black saddle, white chest/muzzle
  const bob = (f === 1 || f === 5 || f === 7) ? 1 : 0;
  const sad = f === 9;
  const cheer = f === 8;
  const y0 = 18 + bob + (sad ? 1 : 0);
  // tail
  rect(ctx, '#c8783a', 5, cheer ? y0 - 6 : y0 - 2, 3, cheer ? 8 : 5);
  // body
  rect(ctx, '#c8783a', 8, y0, 20, 11);
  rect(ctx, '#2a2026', 11, y0, 13, 5);          // black saddle
  rect(ctx, '#fff6e8', 20, y0 + 6, 8, 5);        // white chest
  // legs (run frames alternate)
  const run = f >= 4 && f <= 7;
  const s = run ? ((f % 2) ? 2 : -2) : 0;
  rect(ctx, '#fff6e8', 10 + s, y0 + 11, 3, 6);
  rect(ctx, '#fff6e8', 23 - s, y0 + 11, 3, 6);
  // head
  const hy = y0 - 10 + (sad ? 3 : 0) - (cheer ? 2 : 0);
  rect(ctx, '#c8783a', 22, hy, 12, 11);
  rect(ctx, '#fff6e8', 30, hy + 5, 6, 5);        // muzzle
  rect(ctx, '#2a2026', 35, hy + 5, 2, 2);        // nose
  rect(ctx, '#2a2026', 29, hy + 3, 2, 2);        // eye
  // ears (droop when sad)
  if (sad) rect(ctx, '#2a2026', 21, hy + 1, 3, 6);
  else triangle(ctx, '#2a2026', 24, hy - 5, 22, 27, hy);
  // bark: open mouth + sound lines
  if (f === 2 || f === 3) {
    rect(ctx, '#d84050', 31, hy + 9, 5, 2);
    rect(ctx, '#ffe680', 38, hy + (f === 2 ? 1 : 0), 2, 2);
    rect(ctx, '#ffe680', 38, hy + 6, 2, 2);
  }
}

function drawLuckyCat(ctx, f) {
  const bob = f === 1 ? 1 : 0;
  rect(ctx, '#fff6e8', 9, 15 + bob, 15, 14 - bob);   // body
  ellipse(ctx, '#fff6e8', 16, 11 + bob, 8, 7);       // head
  triangle(ctx, '#fff6e8', 10, 2 + bob, 8, 12, 7 + bob);
  triangle(ctx, '#fff6e8', 22, 2 + bob, 20, 24, 7 + bob);
  rect(ctx, '#f08aa0', 10, 5 + bob, 1, 2);
  rect(ctx, '#f08aa0', 22, 5 + bob, 1, 2);
  rect(ctx, '#2a2026', 12, 10 + bob, 2, 2);          // eyes
  rect(ctx, '#2a2026', 19, 10 + bob, 2, 2);
  rect(ctx, '#d83a3a', 9, 17 + bob, 15, 2);          // red collar
  ellipse(ctx, '#ffd84a', 16, 22 + bob, 3, 3);       // coin on chest
  // raised paw (higher on the action frame)
  const py = f === 2 ? 2 : 6 + bob;
  rect(ctx, '#fff6e8', 24, py, 4, 12);
  rect(ctx, '#f08aa0', 25, py + 1, 2, 2);
  if (f === 2) {
    rect(ctx, '#ffe680', 29, 1, 2, 2);
    rect(ctx, '#ffe680', 30, 6, 1, 1);
  }
}

function drawSteamer(ctx, f) {
  const lift = f === 2 ? 3 : (f === 1 ? 1 : 0);
  rect(ctx, '#d8a860', 5, 15, 22, 14);               // basket
  rect(ctx, '#a87838', 5, 19, 22, 2);
  rect(ctx, '#a87838', 5, 25, 22, 2);
  ellipse(ctx, '#e8c078', 16, 13 - lift, 11, 4);     // lid
  rect(ctx, '#a87838', 14, 7 - lift, 4, 3);          // handle
  rect(ctx, '#2a2026', 10, 21, 2, 3);                // face
  rect(ctx, '#2a2026', 20, 21, 2, 3);
  rect(ctx, '#d84050', 15, 24, 2, 1);
  if (f === 2) {                                     // steam puff
    ellipse(ctx, '#ffffff', 25, 5, 4, 3);
    ellipse(ctx, '#ffffff', 29, 9, 3, 2);
  }
}

function drawChili(ctx, f) {
  const glow = f === 2 ? '#ff9a3a' : '#e8402a';
  rect(ctx, '#2a2026', 15, 1, 2, 4);
  rect(ctx, '#ffd84a', 10, 5, 12, 3);
  ellipse(ctx, glow, 16, 16, 10, 9 + (f === 1 ? 1 : 0));
  rect(ctx, '#b02a1a', 9, 12, 14, 1);
  rect(ctx, '#b02a1a', 8, 18, 16, 1);
  rect(ctx, '#ffd84a', 10, 25, 12, 3);
  rect(ctx, '#2a2026', 12, 14, 2, 2);
  rect(ctx, '#2a2026', 18, 14, 2, 2);
  if (f === 2) ellipse(ctx, '#ffe680', 16, 30, 3, 2);
}

function drawOnigiri(ctx, f) {
  triangle(ctx, '#fffaf0', 16, 3, 3, 29, 28);
  rect(ctx, '#2a4a2a', 11, 19, 10, 10);              // nori band
  rect(ctx, '#2a2026', 11, 13, 2, 2);                // face
  rect(ctx, '#2a2026', 19, 13, 2, 2);
  if (f >= 1) {                                      // bite notch top right
    ctx.clearRect(20, 6, 6, 5);
    ctx.clearRect(22, 11, 4, 3);
  }
  if (f >= 2) {                                      // crumbling: second bite + crack
    ctx.clearRect(4, 22, 5, 5);
    rect(ctx, '#c8c0b0', 14, 6, 1, 6);
    rect(ctx, '#c8c0b0', 15, 11, 1, 4);
  }
}

/** Shared walker body (faces LEFT). f: 0-1 walk, 2-3 bite. */
function walker(ctx, f, pal) {
  const bite = f >= 2;
  const step = f % 2;
  const lunge = bite && step === 1 ? -2 : 0;
  rect(ctx, pal.tail, 25, 22, 6, 2);                 // tail
  ellipse(ctx, pal.body, 17, 21, 9, 6);              // body
  ellipse(ctx, pal.belly, 16, 24, 6, 2);
  rect(ctx, pal.body, 12 + (step ? 1 : -1), 26, 3, 4); // legs
  rect(ctx, pal.body, 20 + (step ? -1 : 1), 26, 3, 4);
  ellipse(ctx, pal.body, 8 + lunge, 19, 6, 5);       // head
  rect(ctx, pal.nose, 1 + lunge, 19, 3, 2);
  ellipse(ctx, pal.ear, 11 + lunge, 13, 3, 3);
  rect(ctx, '#2a2026', 6 + lunge, 17, 2, 2);         // eye
  if (bite) {
    rect(ctx, '#d84050', 2 + lunge, 21, 5, 2);
    rect(ctx, '#ffffff', 3 + lunge, 21, 1, 1);
    rect(ctx, '#ffffff', 5 + lunge, 21, 1, 1);
  }
}

const RAT = { body: '#8a8a96', belly: '#b8b8c4', tail: '#e8a0b0', nose: '#e88aa0', ear: '#e8a0b0' };

function drawRat(ctx, f) {
  walker(ctx, f, RAT);
}

function drawLidRat(ctx, f) {
  walker(ctx, f, RAT);
  const lx = f >= 2 && f % 2 ? -1 : 0;
  ellipse(ctx, '#9aa8b8', 3 + lx, 20, 3, 9);         // pot lid held in front
  rect(ctx, '#5a6878', 0 + lx, 19, 2, 3);
}

function drawCrow(ctx, f) {
  const flap = f % 2;
  ellipse(ctx, '#2a2a3a', 17, 19, 9, 6);             // body
  rect(ctx, '#2a2a3a', 24, 16, 6, 3);                // tail
  ellipse(ctx, '#2a2a3a', 9, 13, 5, 5);              // head
  rect(ctx, '#ffd84a', 2 + (f >= 2 ? -1 : 0), 13, 4, 2); // beak
  rect(ctx, '#ffffff', 7, 11, 2, 2);
  rect(ctx, '#3a3a52', 13, flap ? 9 : 15, 10, 4);    // wing
  rect(ctx, '#e8a040', 14, 25, 1, 5);                // legs
  rect(ctx, '#e8a040', 19, 25, 1, 5);
}

function drawTanuki(ctx, f) {
  walker(ctx, f, { body: '#8a6040', belly: '#d8b888', tail: '#5a3a28', nose: '#2a2026', ear: '#5a3a28' });
  rect(ctx, '#3a2a20', 4 + (f === 3 ? -2 : 0), 17, 8, 2); // mask band
  rect(ctx, '#d8b888', 26, 20, 2, 2);                // tail stripe
}

function drawFox(ctx, f) {
  walker(ctx, f, { body: '#e87a2a', belly: '#fff0d8', tail: '#e87a2a', nose: '#2a2026', ear: '#c85a1a' });
  rect(ctx, '#fff0d8', 29, 21, 3, 3);                // tail tip
}

function drawScooter(ctx, f) {
  rect(ctx, '#d83a3a', 6, 8, 20, 8);                 // body
  rect(ctx, '#a82a2a', 4, 6, 8, 3);                  // seat
  rect(ctx, '#5a5a6a', 25, 2, 2, 10);                // handle post
  rect(ctx, '#5a5a6a', 23, 2, 6, 2);
  rect(ctx, '#ffe680', 27, 9, 3, 3);                 // headlight
  rect(ctx, '#ffd84a', 8, 0, 9, 7);                  // delivery box
  rect(ctx, '#a87838', 12, 2, 1, 4);
  for (const wx of [8, 24]) {
    ellipse(ctx, '#2a2026', wx, 19, 4, 4);
    rect(ctx, '#c8c8d0', wx - (f ? 0 : 1), 18 + (f ? 0 : 1), f ? 1 : 3, f ? 3 : 1);
  }
}

function drawItems(ctx, f) {
  switch (f) {
    case ITEM.COIN:
      ellipse(ctx, '#ffd84a', 8, 8, 6, 6);
      ellipse(ctx, '#e8a820', 8, 8, 4, 4);
      ctx.clearRect(7, 7, 2, 2);                     // square hole
      rect(ctx, '#fff6b0', 5, 4, 2, 1);
      break;
    case ITEM.DUMPLING:
      ellipse(ctx, '#fffaf0', 8, 9, 5, 4);
      rect(ctx, '#d8c8a8', 6, 6, 1, 2);
      rect(ctx, '#d8c8a8', 8, 5, 1, 2);
      rect(ctx, '#d8c8a8', 10, 6, 1, 2);
      break;
    case ITEM.LID:
      ellipse(ctx, '#9aa8b8', 8, 9, 7, 4);
      rect(ctx, '#5a6878', 7, 4, 3, 2);
      break;
    case ITEM.EMBER:
      triangle(ctx, '#ff9a3a', 8, 2, 4, 12, 13);
      triangle(ctx, '#ffe680', 8, 7, 6, 10, 13);
      break;
    case ITEM.FEATHER:
      rect(ctx, '#2a2a3a', 7, 2, 2, 12);
      rect(ctx, '#3a3a52', 5, 4, 2, 7);
      rect(ctx, '#3a3a52', 9, 5, 2, 6);
      break;
    case ITEM.STONE:
      ellipse(ctx, '#a8a8b0', 6, 9, 4, 4);
      ellipse(ctx, '#c8c8d0', 10, 8, 4, 4);
      break;
    case ITEM.BONE:
      rect(ctx, '#fffaf0', 4, 7, 8, 2);
      ellipse(ctx, '#fffaf0', 3, 6, 2, 2);
      ellipse(ctx, '#fffaf0', 3, 10, 2, 2);
      ellipse(ctx, '#fffaf0', 13, 6, 2, 2);
      ellipse(ctx, '#fffaf0', 13, 10, 2, 2);
      break;
    default: // star
      triangle(ctx, '#ffd84a', 8, 1, 4, 12, 10);
      triangle(ctx, '#ffd84a', 8, 14, 2, 14, 5);
      break;
  }
}

// --- environment (no outline) ---------------------------------------------------

function speckle(ctx, color, w, h, n, seed) {
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % w;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = s % h;
    rect(ctx, color, x, y, 1, 2);
  }
}

function drawTiles(ctx, f) {
  if (f === TILE.GARDEN_LIGHT || f === TILE.GARDEN_DARK) {
    rect(ctx, f === TILE.GARDEN_LIGHT ? '#5f9e4a' : '#528c40', 0, 0, 40, 40);
    speckle(ctx, f === TILE.GARDEN_LIGHT ? '#78b858' : '#68a450', 40, 40, 18, 7 + f);
    speckle(ctx, '#3e7032', 40, 40, 8, 31 + f);
  } else if (f === TILE.PORCH) {
    rect(ctx, '#8a5a34', 0, 0, 40, 40);
    for (let y = 0; y < 40; y += 10) rect(ctx, '#6a4224', 0, y, 40, 1);
    rect(ctx, '#a06c40', 0, 1, 40, 1);
  } else {
    rect(ctx, '#4a4258', 0, 0, 40, 40);
    for (let y = 0; y < 40; y += 8) {
      const off = (y / 8) % 2 ? 6 : 0;
      for (let x = -off; x < 40; x += 12) rect(ctx, '#5a5268', x + 1, y + 1, 10, 6);
    }
  }
}

function drawHouse(ctx) {
  rect(ctx, '#6a3a2a', 0, 0, 72, 248);               // wooden back wall
  for (let x = 6; x < 72; x += 12) rect(ctx, '#5a2e20', x, 0, 1, 248);
  rect(ctx, '#3a2018', 66, 0, 6, 248);               // corner post
  rect(ctx, '#2a1810', 0, 0, 72, 10);                // eave shadow
  // door, centred on the middle row
  rect(ctx, '#3a2018', 16, 92, 40, 72);
  rect(ctx, '#d8a860', 20, 96, 32, 64);
  for (let y = 104; y < 160; y += 12) rect(ctx, '#a87838', 20, y, 32, 1);
  rect(ctx, '#a87838', 35, 96, 1, 64);
  // noren curtain
  rect(ctx, '#2a3a6a', 16, 92, 40, 14);
  rect(ctx, '#fff6e0', 30, 96, 12, 6);
  // lanterns
  for (const ly of [40, 200]) {
    ellipse(ctx, '#e8402a', 36, ly, 9, 11);
    rect(ctx, '#ffd84a', 30, ly - 12, 12, 2);
    rect(ctx, '#ffd84a', 30, ly + 10, 12, 2);
    rect(ctx, '#ffe680', 34, ly - 4, 4, 8);
  }
}

function drawAlley(ctx) {
  rect(ctx, '#2e2638', 0, 0, 168, 248);              // back wall
  for (let y = 0; y < 28; y += 7) {
    const off = (y / 7) % 2 ? 7 : 0;
    for (let x = -off; x < 168; x += 14) rect(ctx, '#3a3048', x + 1, y + 1, 12, 5);
  }
  rect(ctx, '#4a4258', 0, 28, 168, 200);             // cobbles where the rows run
  for (let y = 28; y < 228; y += 8) {
    const off = ((y - 28) / 8) % 2 ? 6 : 0;
    for (let x = -off; x < 168; x += 12) rect(ctx, '#544c64', x + 1, y + 1, 10, 6);
  }
  rect(ctx, '#2e2638', 0, 228, 168, 20);
  // garden gate posts on the left edge
  rect(ctx, '#5a3a24', 0, 20, 4, 212);
  // crates and a string of lanterns
  rect(ctx, '#8a5a34', 140, 2, 22, 22);
  rect(ctx, '#6a4224', 140, 12, 22, 2);
  rect(ctx, '#2a1810', 0, 6, 168, 1);
  for (let x = 12; x < 168; x += 26) ellipse(ctx, '#e8402a', x, 11, 3, 4);
}

function drawTitle(ctx) {
  rect(ctx, '#2a1a2e', 0, 0, 320, 120);
  rect(ctx, '#d83a3a', 0, 0, 320, 6);
  rect(ctx, '#d83a3a', 0, 114, 320, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px "Courier New", monospace';
  ctx.fillStyle = '#1a1220';
  ctx.fillText('SOBA GUARD', 163, 59);
  ctx.fillStyle = '#ffd84a';
  ctx.fillText('SOBA GUARD', 160, 56);
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.fillStyle = '#fff6e0';
  ctx.fillText('defend the noodle house', 160, 96);
}

const PLACEHOLDER_DRAW = {
  soba: drawSoba,
  luckycat: drawLuckyCat,
  steamer: drawSteamer,
  chili: drawChili,
  onigiri: drawOnigiri,
  rat: drawRat,
  lidrat: drawLidRat,
  crow: drawCrow,
  tanuki: drawTanuki,
  fox: drawFox,
  scooter: drawScooter,
  items: drawItems,
  tiles: drawTiles,
  house: drawHouse,
  alley: drawAlley,
  title: drawTitle,
};
