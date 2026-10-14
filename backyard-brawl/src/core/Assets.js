// =============================================================================
// Assets.js — the single place that knows every texture key, size and file
// (PLAN section 5 asset contract). Same mechanism as soba-tower:
//
//   1. Put the file in public/assets/ (names in ASSETS[*].file).
//   2. List it in public/assets/manifest.json. Accepted shapes:
//        ["booker.png", ...]
//        { "files": ["booker.png", { "file": "cat.png", "frameWidth": 24, "frameHeight": 24 }] }
//        { "assets": { "booker": "booker.png", "cat": { "file": "cat.png" } } }
//   3. Reload. Listed files load; any key that is missing (or fails to load)
//      gets a code-drawn placeholder with the same key and frame size.
//
// Also generated here (always code-drawn): spawn marker (paw print), particle
// pixel, joystick ring.
// =============================================================================

import { ITEM_FRAMES } from './Constants.js';

export const ASSET_BASE = 'assets/';
export const MANIFEST_URL = `${ASSET_BASE}manifest.json`;

export const BOOKER_FRAMES = { IDLE: [0, 1], RUN: [2, 3, 4, 5], HURT: [6], DASH: [7], COUNT: 8 };

export const ASSETS = {
  booker:     { file: 'booker.png', type: 'spritesheet', w: 32, h: 32, frames: 8 },
  cat:        { file: 'cat.png', type: 'spritesheet', w: 24, h: 24, frames: 2 },
  skunk:      { file: 'skunk.png', type: 'spritesheet', w: 24, h: 24, frames: 2 },
  crow:       { file: 'crow.png', type: 'spritesheet', w: 24, h: 24, frames: 2 },
  squirrel:   { file: 'squirrel.png', type: 'spritesheet', w: 20, h: 20, frames: 2 },
  raccoon:    { file: 'raccoon.png', type: 'spritesheet', w: 28, h: 28, frames: 2 },
  'boss-cat': { file: 'boss-cat.png', type: 'spritesheet', w: 64, h: 64, frames: 2 },
  'boss-vac': { file: 'boss-vac.png', type: 'spritesheet', w: 64, h: 64, frames: 2 },
  items:      { file: 'items.png', type: 'spritesheet', w: 16, h: 16, frames: 12 },
  icons:      { file: 'icons.png', type: 'spritesheet', w: 24, h: 24, frames: 16 },
  arena:      { file: 'arena.png', type: 'image', w: 768, h: 512 },
  title:      { file: 'title.png', type: 'image', w: 480, h: 270 },
};

export const ANIMS = {
  BOOKER_IDLE: 'booker-idle',
  BOOKER_RUN: 'booker-run',
  BOOKER_HURT: 'booker-hurt',
  BOOKER_DASH: 'booker-dash',
};

export const GEN = { MARKER: 'gen-marker', PIXEL: 'gen-px', RING: 'gen-ring', SHADOW: 'gen-shadow', AURA: 'gen-aura' };

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

/** Any accepted manifest shape -> { key: { file, frameWidth?, frameHeight?, animations? } } */
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

export function queueManifestLoads(loader, resolved) {
  const keys = [];
  for (const [key, entry] of Object.entries(resolved)) {
    const spec = ASSETS[key];
    const url = ASSET_BASE + entry.file;
    if (spec.type === 'spritesheet') {
      loader.spritesheet(key, url, { frameWidth: entry.frameWidth || spec.w, frameHeight: entry.frameHeight || spec.h });
    } else {
      loader.image(key, url);
    }
    keys.push(key);
  }
  return keys;
}

/** CPU-backed canvas texture (willReadFrequently), see soba-tower Assets.js. */
export function createCanvasTexture(scene, key, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return scene.textures.addCanvas(key, canvas);
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

export function generateMissingPlaceholders(scene) {
  const generated = [];
  for (const [key, spec] of Object.entries(ASSETS)) {
    if (scene.textures.exists(key)) continue;
    const draw = PLACEHOLDER_DRAW[key];
    if (!draw) continue;
    const frames = spec.type === 'spritesheet' ? spec.frames : 1;
    const tex = createCanvasTexture(scene, key, spec.w * frames, spec.h);
    const ctx = tex.getContext();
    for (let i = 0; i < frames; i++) {
      ctx.save();
      ctx.translate(i * spec.w, 0);
      draw(ctx, i, spec.w, spec.h);
      ctx.restore();
    }
    if (spec.type === 'spritesheet') {
      for (let i = 0; i < frames; i++) tex.add(i, 0, i * spec.w, 0, spec.w, spec.h);
    }
    tex.refresh();
    generated.push(key);
  }
  generateFxTextures(scene);
  return generated;
}

export function registerAnimations(scene, resolved = {}) {
  const tex = scene.textures.get('booker');
  const art = resolved.booker?.animations || {};
  const list = (name, fallback) => (Array.isArray(art[name]) && art[name].length ? art[name] : fallback)
    .filter(i => tex.has(i));
  const make = (key, frames, fps, repeat) => {
    if (scene.anims.exists(key)) scene.anims.remove(key);
    const f = (frames.length ? frames : [0]).map(frame => ({ key: 'booker', frame }));
    scene.anims.create({ key, frames: f, frameRate: fps, repeat });
  };
  make(ANIMS.BOOKER_IDLE, list('idle', BOOKER_FRAMES.IDLE), 3, -1);
  make(ANIMS.BOOKER_RUN, list('run', BOOKER_FRAMES.RUN), 10, -1);
  make(ANIMS.BOOKER_HURT, list('hurt', BOOKER_FRAMES.HURT), 1, 0);
  make(ANIMS.BOOKER_DASH, list('dash', BOOKER_FRAMES.DASH), 1, 0);

  // Enemies: one 2-frame loop each ('<key>-move'), frames from the manifest's
  // first animation when present. ArenaScene sets frames by enemy age instead
  // of playing these (per-enemy phase, deterministic under the test clock);
  // menus and the title can play them.
  for (const key of ENEMY_SHEETS) {
    if (!scene.textures.exists(key)) continue;
    const etex = scene.textures.get(key);
    const anims = resolved[key]?.animations || {};
    const first = Object.values(anims).find(a => Array.isArray(a) && a.length);
    const frames = (first || [0, 1]).filter(i => etex.has(i));
    const akey = enemyAnim(key);
    if (scene.anims.exists(akey)) scene.anims.remove(akey);
    scene.anims.create({ key: akey, frames: (frames.length ? frames : [0]).map(frame => ({ key, frame })), frameRate: 6, repeat: -1 });
  }
}

export const ENEMY_SHEETS = ['cat', 'squirrel', 'crow', 'raccoon', 'skunk', 'boss-cat', 'boss-vac'];
export const enemyAnim = (key) => `${key}-move`;

function generateFxTextures(scene) {
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const t = createCanvasTexture(scene, key, w, h);
    draw(t.getContext());
    t.refresh();
  };
  make(GEN.PIXEL, 2, 2, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 2, 2);
  });
  make(GEN.MARKER, 14, 14, (c) => {
    // Paw print: pad + 4 toes
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(7, 9, 3.5, 3, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y] of [[2.5, 5], [5.5, 3], [8.5, 3], [11.5, 5]]) {
      c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
    }
  });
  // Elite aura: soft white ellipse (tinted gold under elites)
  make(GEN.AURA, 20, 8, (c) => {
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(10, 4, 9.5, 3.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.ellipse(10, 4, 7, 2.6, 0, 0, Math.PI * 2); c.fill();
  });
  make(GEN.SHADOW, 16, 6, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(8, 3, 7.5, 2.8, 0, 0, Math.PI * 2); c.fill();
  });
}

// --- drawing helpers ---------------------------------------------------------------

const px = (c, color, x, y, w = 1, h = 1) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};
const oval = (c, color, x, y, rx, ry) => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};
const outlineOval = (c, fill, x, y, rx, ry, ink = '#1a1208') => {
  oval(c, ink, x, y, rx + 1, ry + 1);
  oval(c, fill, x, y, rx, ry);
};

/** Side-view quadruped critter (cat / skunk / raccoon / squirrel), facing right. */
function critter(c, w, h, frame, o) {
  const bob = frame % 2;
  const by = h * 0.58 - bob;
  // legs
  const legY = h * 0.72;
  const step = frame % 2 ? 2 : -2;
  px(c, '#1a1208', w * 0.3 + step, legY, 2, h - legY - 2);
  px(c, '#1a1208', w * 0.62 - step, legY, 2, h - legY - 2);
  // tail
  if (o.tail) o.tail(c, w, h, by, frame);
  outlineOval(c, o.body, w * 0.46, by, w * 0.28, h * 0.17);
  // head
  outlineOval(c, o.head || o.body, w * 0.74, by - h * 0.14, w * 0.15, h * 0.15);
  // ears
  px(c, '#1a1208', w * 0.66, by - h * 0.32, 2, 3);
  px(c, '#1a1208', w * 0.8, by - h * 0.32, 2, 3);
  if (o.extra) o.extra(c, w, h, by, frame);
  // eye
  px(c, '#ffffff', w * 0.78, by - h * 0.18, 2, 2);
  px(c, '#1a1208', w * 0.8, by - h * 0.17, 1, 1);
}

const PLACEHOLDER_DRAW = {
  booker(c, frame, w, h) {
    // Tan dog, cream chest, black muzzle, dark-tipped ears, facing right.
    const runPhase = frame >= 2 && frame <= 5 ? frame - 2 : -1;
    const bob = frame === 1 ? 1 : (runPhase === 1 || runPhase === 3 ? -1 : 0);
    const dash = frame === 7;
    const hurt = frame === 6;
    const body = hurt ? '#e8a090' : '#c98e4f';
    const by = 19 + bob;
    // legs
    const legs = runPhase < 0 ? [0, 0] : [[-2, 2], [0, 0], [2, -2], [0, 0]][runPhase];
    px(c, '#1a1208', 10 + legs[0], 23, 3, 7);
    px(c, '#1a1208', 19 + legs[1], 23, 3, 7);
    px(c, body, 11 + legs[0], 23, 1, 6);
    px(c, body, 20 + legs[1], 23, 1, 6);
    // tail
    px(c, '#1a1208', 3, by - 6, 3, 5);
    px(c, body, 4, by - 5, 1, 3);
    // body
    if (dash) {
      outlineOval(c, body, 15, by, 11, 5);
    } else {
      outlineOval(c, body, 15, by, 9, 6);
    }
    oval(c, '#f2e2c0', 19, by + 2, 4, 3);
    // head
    const hx = dash ? 25 : 23;
    const hy = by - 8;
    outlineOval(c, body, hx, hy, 6, 5.5);
    // muzzle mask
    oval(c, '#2a1a10', hx + 5, hy + 2, 3, 2.5);
    px(c, '#000000', hx + 7, hy + 1, 1, 1);
    // ear (floppy, dark tip)
    oval(c, '#1a1208', hx - 3, hy - 1, 2.5, 4);
    oval(c, '#8a5a2c', hx - 3, hy - 2, 1.5, 3);
    // eye
    px(c, hurt ? '#1a1208' : '#ffc040', hx + 1, hy - 2, 2, 2);
    px(c, '#1a1208', hx + 2, hy - 2, 1, 1);
    if (hurt) {
      px(c, '#ffffff', 2, 2, 2, 2);
      px(c, '#ffffff', 27, 4, 2, 2);
    }
    if (dash) {
      px(c, '#ffffff', 0, by - 2, 4, 1);
      px(c, '#ffffff', 1, by + 2, 3, 1);
    }
  },
  cat(c, f, w, h) {
    critter(c, w, h, f, {
      body: '#e38b3a',
      tail: (cx, W, H, by, fr) => { px(cx, '#1a1208', 2, by - 8 + fr, 2, 9); px(cx, '#e38b3a', 2.5, by - 7 + fr, 1, 7); },
      extra: (cx, W, H, by) => { px(cx, '#b85c1c', W * 0.4, by - 3, 2, 5); px(cx, '#b85c1c', W * 0.52, by - 3, 2, 5); },
    });
  },
  squirrel(c, f, w, h) {
    critter(c, w, h, f, {
      body: '#9a5a2c',
      tail: (cx, W, H, by, fr) => { outlineOval(cx, '#b8743a', 4, by - 6 - fr, 3.5, 6); },
    });
  },
  skunk(c, f, w, h) {
    critter(c, w, h, f, {
      body: '#26222e',
      tail: (cx, W, H, by, fr) => { outlineOval(cx, '#26222e', 4, by - 6 - fr, 3.5, 6); px(cx, '#ffffff', 3.5, by - 11 - fr, 1.5, 9); },
      extra: (cx, W, H, by) => { px(cx, '#ffffff', W * 0.3, by - 4, W * 0.45, 2); },
    });
  },
  raccoon(c, f, w, h) {
    critter(c, w, h, f, {
      body: '#7d7a80',
      tail: (cx, W, H, by, fr) => {
        for (let i = 0; i < 4; i++) px(cx, i % 2 ? '#2a2830' : '#a8a4ac', 2 + i * 1.5, by - 2 - fr - i, 3, 3);
      },
      extra: (cx, W, H, by) => { px(cx, '#1a1208', W * 0.68, by - H * 0.17, W * 0.2, 2); },
    });
  },
  crow(c, f, w, h) {
    outlineOval(c, '#24202c', 12, 13, 7, 4.5);
    outlineOval(c, '#24202c', 18, 10, 3.5, 3.5);
    px(c, '#f0b030', 21, 10, 3, 2);
    px(c, '#ffffff', 18, 9, 1, 1);
    const up = f === 0;
    c.fillStyle = '#1a1208';
    c.beginPath();
    c.moveTo(8, 12);
    c.lineTo(16, 12);
    c.lineTo(up ? 9 : 11, up ? 2 : 21);
    c.closePath();
    c.fill();
  },
  'boss-cat'(c, f, w, h) {
    critter(c, w, h, f, {
      body: '#d0702a',
      tail: (cx, W, H, by, fr) => { px(cx, '#1a1208', 4, by - 20 + fr * 2, 5, 22); px(cx, '#d0702a', 5, by - 19 + fr * 2, 3, 20); },
      extra: (cx, W, H, by) => { for (let i = 0; i < 3; i++) px(cx, '#8a4012', W * (0.32 + i * 0.1), by - 8, 3, 12); },
    });
  },
  'boss-vac'(c, f, w, h) {
    outlineOval(c, '#9aa0aa', 32, 36, 28, 20);
    oval(c, '#6a707a', 32, 40, 24, 12);
    oval(c, f ? '#ff4040' : '#40ff80', 32, 28, 4, 3);
    px(c, '#1a1208', 12, 50, 40, 3);
  },
  items(c, i, w, h) {
    const F = ITEM_FRAMES;
    const cx = w / 2;
    const cy = h / 2;
    switch (i) {
      case F.BARK:
        c.strokeStyle = '#fff6c0';
        c.lineWidth = 2;
        for (const r of [3, 6]) { c.beginPath(); c.arc(cx - 3, cy, r, -0.9, 0.9); c.stroke(); }
        break;
      case F.BALL: outlineOval(c, '#d8f040', cx, cy, 4, 4); px(c, '#ffffff', cx - 3, cy - 1, 6, 1); break;
      case F.BONE:
        px(c, '#1a1208', 3, 6, 10, 4); px(c, '#f6ead0', 4, 7, 8, 2);
        outlineOval(c, '#f6ead0', 3, 6, 2, 2); outlineOval(c, '#f6ead0', 3, 10, 2, 2);
        outlineOval(c, '#f6ead0', 13, 6, 2, 2); outlineOval(c, '#f6ead0', 13, 10, 2, 2);
        break;
      case F.FRISBEE: outlineOval(c, '#ff5a8a', cx, cy, 6, 3); break;
      case F.STINK: oval(c, 'rgba(150,200,60,0.85)', cx, cy, 6, 5); oval(c, 'rgba(110,160,40,0.9)', cx + 2, cy - 1, 3, 3); break;
      case F.DUST: outlineOval(c, '#a8a098', cx, cy, 5, 5); break;
      case F.KIBBLE_S: outlineOval(c, '#c08040', cx, cy, 2, 2); break;
      case F.KIBBLE_M: outlineOval(c, '#d89848', cx, cy, 3.5, 3); px(c, '#f0c080', cx - 1, cy - 2, 2, 1); break;
      case F.KIBBLE_L: outlineOval(c, '#f0b050', cx, cy, 5, 4.5); px(c, '#fff0c0', cx - 2, cy - 3, 3, 1); break;
      case F.HEART:
        c.fillStyle = '#1a1208';
        c.beginPath(); c.arc(cx - 2.5, cy - 1, 3.5, 0, Math.PI * 2); c.arc(cx + 2.5, cy - 1, 3.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy); c.lineTo(cx, cy + 6.5); c.fill();
        c.fillStyle = '#e83a3a';
        c.beginPath(); c.arc(cx - 2.5, cy - 1, 2.5, 0, Math.PI * 2); c.arc(cx + 2.5, cy - 1, 2.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(cx - 5, cy); c.lineTo(cx + 5, cy); c.lineTo(cx, cy + 5); c.fill();
        break;
      case F.MAGNET:
        px(c, '#1a1208', 3, 3, 10, 11); px(c, '#e03a3a', 4, 4, 8, 6); px(c, '#ffffff', 4, 10, 3, 3); px(c, '#ffffff', 9, 10, 3, 3);
        px(c, '#1a1208', 7, 4, 2, 9);
        break;
      default: // golden bone
        px(c, '#1a1208', 3, 6, 10, 4); px(c, '#ffd040', 4, 7, 8, 2);
        outlineOval(c, '#ffd040', 3, 6, 2, 2); outlineOval(c, '#ffd040', 3, 10, 2, 2);
        outlineOval(c, '#ffd040', 13, 6, 2, 2); outlineOval(c, '#ffd040', 13, 10, 2, 2);
    }
  },
  icons(c, i, w, h) {
    const hue = (i * 47) % 360;
    c.fillStyle = '#1a1208';
    c.fillRect(1, 1, w - 2, h - 2);
    c.fillStyle = `hsl(${hue}, 55%, ${i < 6 ? 45 : 60}%)`;
    c.fillRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#fff6e0';
    c.font = 'bold 12px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labels = ['B', 'T', 'O', 'F', 'Q', 'Z', 'H', 'R', 'S', 'D', 'W', 'E', 'A', 'L', 'P', '+'];
    c.fillText(labels[i] || '?', w / 2, h / 2 + 1);
  },
  arena(c, _f, w, h) {
    // Lawn with mower stripes, fence border, flower beds and a few props
    c.fillStyle = '#5f9a3a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#679f40';
    for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 32, h);
    // grass tufts (deterministic)
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 900; i++) px(c, r() < 0.5 ? '#4f8530' : '#7cb04c', r() * w, r() * h, 1, 2);
    // flower beds
    const bed = (x, y, bw, bh) => {
      c.fillStyle = '#6b4424';
      c.fillRect(x, y, bw, bh);
      for (let i = 0; i < bw * bh / 30; i++) {
        px(c, ['#ff6a8a', '#ffd84a', '#ffffff', '#b07aff'][i % 4], x + 2 + r() * (bw - 4), y + 2 + r() * (bh - 4), 2, 2);
      }
    };
    bed(40, 40, 90, 22); bed(w - 130, 40, 90, 22); bed(40, h - 62, 90, 22); bed(w - 130, h - 62, 90, 22);
    // props: stepping stones, a bowl, a doghouse corner
    for (let i = 0; i < 7; i++) oval(c, '#b8b0a0', w / 2 - 120 + i * 40, h / 2 + 90 + (i % 2) * 6, 9, 5);
    outlineOval(c, '#3a7ad8', 140, h / 2 - 20, 9, 5);
    c.fillStyle = '#8a4a2a'; c.fillRect(w - 110, h / 2 - 40, 50, 36);
    c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(w - 116, h / 2 - 40); c.lineTo(w - 85, h / 2 - 62); c.lineTo(w - 54, h / 2 - 40); c.fill();
    c.fillStyle = '#1a1208'; c.fillRect(w - 94, h / 2 - 26, 18, 22);
    // fence (16 px border)
    c.fillStyle = '#a0683a';
    c.fillRect(0, 0, w, 16); c.fillRect(0, h - 16, w, 16); c.fillRect(0, 0, 16, h); c.fillRect(w - 16, 0, 16, h);
    c.fillStyle = '#7a4a24';
    for (let x = 0; x < w; x += 8) { c.fillRect(x, 0, 1, 16); c.fillRect(x, h - 16, 1, 16); }
    for (let y = 0; y < h; y += 8) { c.fillRect(0, y, 16, 1); c.fillRect(w - 16, y, 16, 1); }
    c.fillStyle = '#5a3418';
    c.fillRect(16, 15, w - 32, 1); c.fillRect(16, h - 16, w - 32, 1); c.fillRect(15, 16, 1, h - 32); c.fillRect(w - 16, 16, 1, h - 32);
  },
  title(c, _f, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7ec8f0');
    g.addColorStop(0.62, '#c8ecff');
    g.addColorStop(0.62, '#5f9a3a');
    g.addColorStop(1, '#3f7a24');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#a0683a';
    for (let x = 0; x < w; x += 12) c.fillRect(x, h * 0.5, 9, h * 0.13);
    c.fillRect(0, h * 0.53, w, 3);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 34px "Courier New", monospace';
    c.lineWidth = 6;
    c.strokeStyle = '#1a1208';
    c.fillStyle = '#ffd44a';
    c.strokeText("BOOKER'S", w / 2, 52);
    c.fillText("BOOKER'S", w / 2, 52);
    c.font = 'bold 30px "Courier New", monospace';
    c.strokeText('BACKYARD BRAWL', w / 2, 88);
    c.fillStyle = '#fff6e0';
    c.fillText('BACKYARD BRAWL', w / 2, 88);
  },
};
