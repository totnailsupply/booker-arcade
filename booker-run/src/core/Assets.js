// =============================================================================
// Assets.js — the single place that knows every texture key, size and file.
//
// How art drops in without code changes:
//   1. Put the file in public/assets/ (names in ASSETS[*].file below).
//   2. List it in public/assets/manifest.json. Accepted shapes:
//        ["booker.png", "cone.png", ...]
//        { "files": ["booker.png", { "file": "booker.png", "frameWidth": 48, "frameHeight": 36 }] }
//        { "assets": { "booker": "booker.png", "cone": { "file": "cone.png" } } }
//        { "booker": { "file": "booker.png", ... }, "l2-ground": { "file": "l2-ground.png" } }
//   3. Reload. Listed files are loaded; everything else (or anything that fails
//      to load) falls back to a generated placeholder (Placeholders.js) with the
//      same key/size.
// Spritesheets: w/h below are ONE frame; frames = frame count.
// =============================================================================

import { ANIM, ENEMY, MOVER } from './Constants.js';
import { BOOKER_FRAMES, PLACEHOLDER_DRAW } from './Placeholders.js';

export { BOOKER_FRAMES };

export const ASSET_BASE = 'assets/';
export const MANIFEST_URL = `${ASSET_BASE}manifest.json`;

const img = (file, w, h) => ({ file, type: 'image', w, h });
const sheet = (file, w, h, frames) => ({ file, type: 'spritesheet', w, h, frames });

function levelThemeAssets(n) {
  return {
    [`l${n}-bg-far`]: img(`l${n}-bg-far.png`, 480, 270),
    [`l${n}-bg-mid`]: img(`l${n}-bg-mid.png`, 480, 270),
    [`l${n}-bg-near`]: img(`l${n}-bg-near.png`, 480, 270),
    [`l${n}-ground`]: img(`l${n}-ground.png`, 32, 32),
    [`l${n}-pit`]: img(`l${n}-pit.png`, 32, 32),
    [`l${n}-platform`]: img(`l${n}-platform.png`, 32, 16),
  };
}

export const ASSETS = {
  booker:   sheet('booker.png', 48, 36, BOOKER_FRAMES.COUNT),
  cone:     img('cone.png', 16, 20),
  crate:    img('crate.png', 24, 24),
  pallets:  img('pallets.png', 24, 48),
  barrel:   img('barrel.png', 20, 20),
  bone:     img('bone.png', 16, 8),
  steak:    img('steak.png', 40, 28),
  ground:   img('ground.png', 32, 32),
  'bg-far': img('bg-far.png', 480, 270),
  'bg-mid': img('bg-mid.png', 480, 270),
  'bg-near': img('bg-near.png', 480, 270),
  // Optional title art. No placeholder: TitleScene draws text when it's missing.
  title:    { ...img('title.png', 480, 270), optional: true },

  // Menus
  'ui-icons': sheet('ui-icons.png', 24, 24, 10),
  'menu-bg':  img('menu-bg.png', 480, 270),
  'thumb-l1': img('thumb-l1.png', 128, 72),
  'thumb-l2': img('thumb-l2.png', 128, 72),
  'thumb-l3': img('thumb-l3.png', 128, 72),
  'thumb-l4': img('thumb-l4.png', 128, 72),
  'thumb-l5': img('thumb-l5.png', 128, 72),
  'thumb-l6': img('thumb-l6.png', 128, 72),
  'golden-steak': img('golden-steak.png', 48, 36),

  // Level themes 2-6
  ...levelThemeAssets(2),
  ...levelThemeAssets(3),
  ...levelThemeAssets(4),
  ...levelThemeAssets(5),
  ...levelThemeAssets(6),

  // Level 2: docks
  'l2-bollard': img('l2-bollard.png', 16, 20),
  'l2-tires':   img('l2-tires.png', 24, 32),
  'l2-crab':    img('l2-crab.png', 20, 12),
  // Level 3: rooftops
  'l3-acunit':  img('l3-acunit.png', 28, 24),
  'l3-antenna': img('l3-antenna.png', 12, 48),
  'l3-pigeon':  sheet('l3-pigeon.png', 16, 12, 2),
  'l3-vent':    img('l3-vent.png', 32, 16),
  // Level 4: factory
  'l4-wall':       img('l4-wall.png', 32, 32),
  'l4-gear':       img('l4-gear.png', 24, 24),
  'l4-crate':      img('l4-crate.png', 24, 24),
  'l4-steam-vent': img('l4-steam-vent.png', 16, 8),
  // Level 5: night market
  'l5-vacuum':  sheet('l5-vacuum.png', 24, 16, 2),
  'l5-drone':   sheet('l5-drone.png', 24, 16, 2),
  'l5-cart':    img('l5-cart.png', 32, 28),
  'l5-hydrant': img('l5-hydrant.png', 14, 20),
  // Level 6: steakhouse row
  'l6-boxes':    img('l6-boxes.png', 24, 48),
  'l6-gate':     img('l6-gate.png', 16, 56),
  'l6-grill':    img('l6-grill.png', 32, 24),
  'l6-trashcan': img('l6-trashcan.png', 20, 28),
};

export const ANIMS = {
  RUN: 'booker-run',
  JUMP: 'booker-jump',
  FALL: 'booker-fall',
  HURT: 'booker-hurt',
  WIN: 'booker-win',
  DOUBLE: 'booker-double',
  GLIDE: 'booker-glide',
  CLING: 'booker-cling',
  POUNCE: 'booker-pounce',
  DASH: 'booker-dash',
  PIGEON: 'l3-pigeon-fly',
  VACUUM: 'l5-vacuum-move',
  DRONE: 'l5-drone-move',
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
    // Also accept { "booker.png": {...}, "cone": "cone.png" } at the top level
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
      // frameWidth/Height in the manifest win, but only if they describe one frame
      const fw = entry.frameWidth && entry.frameWidth < spec.w * spec.frames ? entry.frameWidth : spec.w;
      const fh = entry.frameHeight || spec.h;
      loader.spritesheet(key, url, { frameWidth: fw, frameHeight: fh });
    } else {
      loader.image(key, url);
    }
    keys.push(key);
  }
  return keys;
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
    const tex = scene.textures.createCanvas(key, w, spec.h);
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

/** Number of numbered frames in a texture (0 when missing). */
function frameCount(scene, key) {
  const tex = scene.textures.exists(key) ? scene.textures.get(key) : null;
  if (!tex) return 0;
  let n = 0;
  while (tex.has(n)) n++;
  return n;
}

/**
 * Registers Booker's animations (and the 2-frame enemy loops). Tolerant of
 * sheets with fewer frames: the Level 1 sheet has 10, so the ability
 * animations (frames 10-17) fall back to the jump/fall frames.
 */
export function registerAnimations(scene) {
  const n = frameCount(scene, 'booker');
  const F = BOOKER_FRAMES;
  const pick = (i, fallback) => (i < n ? i : (fallback < n ? fallback : 0));

  const make = (key, frames, frameRate = 1, repeat = 0, texKey = 'booker') => {
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({ key, frames: frames.map(frame => ({ key: texKey, frame })), frameRate, repeat });
  };

  const runFrames = [];
  for (let i = F.RUN_START; i <= F.RUN_END; i++) if (i < n) runFrames.push(i);
  make(ANIMS.RUN, runFrames.length ? runFrames : [0], ANIM.RUN_FPS, -1);
  make(ANIMS.JUMP, [pick(F.JUMP, 0)]);
  make(ANIMS.FALL, [pick(F.FALL, 0)]);
  make(ANIMS.HURT, [pick(F.HURT, 0)]);
  make(ANIMS.WIN, [pick(F.WIN, 0)]);
  make(ANIMS.DOUBLE, [pick(F.DOUBLE_START, F.JUMP), pick(F.DOUBLE_START + 1, F.JUMP)], ANIM.SPIN_FPS, -1);
  make(ANIMS.GLIDE, [pick(F.GLIDE_START, F.FALL), pick(F.GLIDE_START + 1, F.FALL)], ANIM.GLIDE_FPS, -1);
  make(ANIMS.CLING, [pick(F.CLING, F.FALL)]);
  make(ANIMS.POUNCE, [pick(F.POUNCE, F.FALL)]);
  make(ANIMS.DASH, [pick(F.DASH_START, F.JUMP), pick(F.DASH_START + 1, F.JUMP)], ANIM.DASH_FPS, -1);

  const loop2 = (animKey, texKey, fps) => {
    const c = frameCount(scene, texKey);
    make(animKey, c >= 2 ? [0, 1] : [0], fps, -1, texKey);
  };
  loop2(ANIMS.PIGEON, 'l3-pigeon', MOVER.pigeon.FLAP_FPS);
  loop2(ANIMS.VACUUM, 'l5-vacuum', ENEMY.ANIM_FPS);
  loop2(ANIMS.DRONE, 'l5-drone', ENEMY.ANIM_FPS);

  return { bookerFrames: n, hasAbilityFrames: n >= F.COUNT };
}
