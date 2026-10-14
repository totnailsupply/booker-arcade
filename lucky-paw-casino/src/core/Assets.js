// =============================================================================
// Assets.js — every texture key, where it comes from, and how it is filtered.
//
// Sources, in priority order:
//   1. public/assets/manifest.json  { "<key>": { "file": "dir/name.png", "pixel": true, "w": 256, "h": 256 } }
//      (also accepted: { "assets": { ... } }). `file` is relative to assets/.
//      Missing manifest or keys = fine.
//   2. BOOKER_FILES below (the existing Booker art in assets/booker/).
//   3. Code-drawn placeholders (src/core/Textures.js) for any ART_CONTRACT key
//      that still doesn't exist, so the game always runs.
//
// Pixel textures (manifest pixel !== false, and all Booker art) get the
// NEAREST filter one by one (the game itself is antialiased so text and
// generated chips stay smooth). Call setPixelFilter(scene, key) for any
// texture you add later.
//
// Keys games can rely on (always present after Preload):
//   Booker:  dealer, dealer-excited, dealer-sly, dealer-sympathy, dealer-wince, dealer-sleepy,
//            croupier, croupier-excited, croupier-sly, croupier-sympathy,
//            stick, stick-win, stick-out, plinko-booker, plinko-booker-excited, plinko-booker-sly,
//            booker-cage, card-back (24x34 pixel), slots-paw, slots-paw-spinning,
//            booker-head, bone, booker-excited, booker-proud, booker-sly, booker-sleepy
//   Art:     soba-neutral|happy|sad|nervous|smug, duo-hero, title-logo,
//            bg-lobby|plinko|blackjack|craps|roulette|slots (1280x720),
//            icon-plinko|blackjack|craps|roulette|slots (160x160),
//            sym-wild|scatter|booker|soba|bone|ball|hydrant|bowl (128x128)
//   Code:    chip-1|5|25|100|500 (64x64), chip-mini-1..500 (40x22 stack chip),
//            particle-coin (20), particle-spark (24), particle-confetti (10x14, white: tint it),
//            ui-glow (128 radial white), ui-vignette (1280x720), ui-pixel (4x4 white)
// =============================================================================

import Phaser from 'phaser';

export const ASSET_BASE = 'assets/';
export const MANIFEST_URL = `${ASSET_BASE}manifest.json`;

/** Booker art copied from tot-hq (all pixel art). */
export const BOOKER_FILES = {
  dealer: 'booker/dealer.webp',
  'dealer-excited': 'booker/dealer-excited.webp',
  'dealer-sly': 'booker/dealer-sly.webp',
  'dealer-sympathy': 'booker/dealer-sympathy.webp',
  'dealer-wince': 'booker/dealer-wince.webp',
  'dealer-sleepy': 'booker/dealer-sleepy.webp',
  croupier: 'booker/croupier.webp',
  'croupier-excited': 'booker/croupier-excited.webp',
  'croupier-sly': 'booker/croupier-sly.webp',
  'croupier-sympathy': 'booker/croupier-sympathy.webp',
  stick: 'booker/booker-stick.webp',
  'stick-win': 'booker/booker-stick-win.webp',
  'stick-out': 'booker/booker-stick-out.webp',
  'plinko-booker': 'booker/plinko-booker.webp',
  'plinko-booker-excited': 'booker/plinko-booker-excited.webp',
  'plinko-booker-sly': 'booker/plinko-booker-sly.webp',
  'booker-cage': 'booker/booker-cage.webp',
  'card-back': 'booker/card-back.webp',
  'slots-paw': 'booker/slots-paw.png',
  'slots-paw-spinning': 'booker/slots-paw-spinning.png',
  'booker-head': 'booker/booker.png',
  bone: 'booker/bone.png',
  'booker-excited': 'booker/booker-excited.webp',
  'booker-proud': 'booker/booker-proud.webp',
  'booker-sly': 'booker/booker-sly.webp',
  'booker-sleepy': 'booker/booker-sleepy.webp',
};

/** Keys the art agent delivers (placeholder size when missing). */
export const ART_CONTRACT = {
  'soba-neutral': { w: 256, h: 256 },
  'soba-happy': { w: 256, h: 256 },
  'soba-sad': { w: 256, h: 256 },
  'soba-nervous': { w: 256, h: 256 },
  'soba-smug': { w: 256, h: 256 },
  'duo-hero': { w: 768, h: 512 },
  'title-logo': { w: 960, h: 320 },
  'bg-lobby': { w: 1280, h: 720 },
  'bg-plinko': { w: 1280, h: 720 },
  'bg-blackjack': { w: 1280, h: 720 },
  'bg-craps': { w: 1280, h: 720 },
  'bg-roulette': { w: 1280, h: 720 },
  'bg-slots': { w: 1280, h: 720 },
  'icon-plinko': { w: 160, h: 160 },
  'icon-blackjack': { w: 160, h: 160 },
  'icon-craps': { w: 160, h: 160 },
  'icon-roulette': { w: 160, h: 160 },
  'icon-slots': { w: 160, h: 160 },
  'sym-wild': { w: 128, h: 128 },
  'sym-scatter': { w: 128, h: 128 },
  'sym-booker': { w: 128, h: 128 },
  'sym-soba': { w: 128, h: 128 },
  'sym-bone': { w: 128, h: 128 },
  'sym-ball': { w: 128, h: 128 },
  'sym-hydrant': { w: 128, h: 128 },
  'sym-bowl': { w: 128, h: 128 },
};

/** Fetch the manifest; resolves {} when missing or broken (normal while art is in progress). */
export async function fetchManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return {};
    const text = await res.text();
    if (!text.trim().startsWith('{')) return {}; // dev server's index.html fallback
    const json = JSON.parse(text);
    const entries = json && typeof json.assets === 'object' ? json.assets : json;
    const out = {};
    for (const [key, v] of Object.entries(entries || {})) {
      if (key.startsWith('_')) continue;
      if (typeof v === 'string') out[key] = { file: v, pixel: true };
      else if (v && typeof v.file === 'string') out[key] = { pixel: true, ...v };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Queue every image load. Returns { key: { file, pixel } } of what was queued.
 * Manifest entries override the Booker defaults with the same key.
 */
export function queueLoads(loader, manifest = {}) {
  const queued = {};
  for (const [key, file] of Object.entries(BOOKER_FILES)) queued[key] = { file, pixel: true };
  for (const [key, v] of Object.entries(manifest)) queued[key] = { file: v.file, pixel: v.pixel !== false, w: v.w, h: v.h };
  for (const [key, v] of Object.entries(queued)) loader.image(key, ASSET_BASE + v.file);
  return queued;
}

/** NEAREST filter for one texture (Phaser 4: Texture#setFilter). */
export function setPixelFilter(scene, key) {
  const tex = scene.textures.get(key);
  if (tex && key !== '__MISSING') tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Apply NEAREST to every loaded pixel texture. */
export function applyFilters(scene, queued) {
  for (const [key, v] of Object.entries(queued)) {
    if (v.pixel && scene.textures.exists(key)) setPixelFilter(scene, key);
  }
}

/** Lists what's real vs placeholder (render_game_to_text / debugging). */
export const assetReport = { files: [], placeholders: [], failed: [] };
