// Code-drawn FX textures (small, hard-edged, pixel-like). Generated once per
// game (textures are global), the first time an FX module needs them.
//
//   fx-ring      ground ring under Booker (cream outline, soft fill)
//   fx-outline   Booker's silhouette dilated by 1 px, same frames as 'booker'
//   fx-digits    3x5 pixel digits with a 1 px dark outline (RetroFont 'fx-num')
//   fx-confetti  3x2 white chip (tinted)
//   fx-sparkle   5x5 plus-shaped twinkle
//   fx-dust      4x4 soft blob
//   fx-arrow     7x9 off-screen indicator (points right)
//   fx-vignette  480x270 radial edge gradient (white, tinted red), LINEAR filter

import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';

export const FXT = {
  RING: 'fx-ring',
  OUTLINE: 'fx-outline',
  DIGITS: 'fx-digits',
  FONT: 'fx-num',
  CONFETTI: 'fx-confetti',
  SPARKLE: 'fx-sparkle',
  DUST: 'fx-dust',
  ARROW: 'fx-arrow',
  VIGNETTE: 'fx-vignette',
};

const FONT_CHARS = '0123456789+-!x';
// 3x5 glyphs, rows top to bottom
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  x: ['000', '101', '010', '101', '000'],
};
const CELL_W = 5;
const CELL_H = 7;

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return scene.textures.addCanvas(key, canvas);
}

function makeDigits(scene) {
  if (scene.textures.exists(FXT.DIGITS)) return;
  const w = CELL_W * FONT_CHARS.length;
  canvasTex(scene, FXT.DIGITS, w, CELL_H, (c) => {
    [...FONT_CHARS].forEach((ch, i) => {
      const g = GLYPHS[ch];
      const ox = i * CELL_W + 1;
      const oy = 1;
      // outline: every 8-neighbour of a lit pixel
      c.fillStyle = '#1a1208';
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
        if (g[y][x] !== '1') continue;
        c.fillRect(ox + x - 1, oy + y - 1, 3, 3);
      }
      c.fillStyle = '#ffffff';
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
        if (g[y][x] === '1') c.fillRect(ox + x, oy + y, 1, 1);
      }
    });
  });
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: FXT.DIGITS, width: CELL_W, height: CELL_H, chars: FONT_CHARS,
    charsPerRow: FONT_CHARS.length, spacing: { x: 0, y: 0 }, offset: { x: 0, y: 0 },
  });
  // glyphs overlap by 1 px (shared outline) so numbers stay compact
  for (const k of Object.keys(entry.data.chars)) entry.data.chars[k].xAdvance = CELL_W - 1;
  if (!scene.cache.bitmapFont.exists(FXT.FONT)) scene.cache.bitmapFont.add(FXT.FONT, entry);
}

/** Booker's frames dilated by 1 px into a white silhouette (drawn behind him as a rim). */
function makeOutline(scene) {
  if (scene.textures.exists(FXT.OUTLINE) || !scene.textures.exists('booker')) return;
  const src = scene.textures.get('booker');
  const img = src.getSourceImage();
  const W = img.width;
  const H = img.height;
  const base = scene.textures.getFrame('booker', 0);
  const fw = base?.width || 32;
  const fh = base?.height || 32;
  const tex = canvasTex(scene, FXT.OUTLINE, W, H, (c) => {
    c.drawImage(img, 0, 0);
    const id = c.getImageData(0, 0, W, H);
    const a = id.data;
    const out = c.createImageData(W, H);
    const o = out.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 40;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // stay inside the source frame (no bleed into the neighbour frame)
        const fx0 = Math.floor(x / fw) * fw;
        const inFrame = (xx) => xx >= fx0 && xx < fx0 + fw;
        const lit = solid(x, y)
          || (inFrame(x - 1) && solid(x - 1, y)) || (inFrame(x + 1) && solid(x + 1, y))
          || solid(x, y - 1) || solid(x, y + 1);
        if (lit) {
          const i = (y * W + x) * 4;
          o[i] = 255; o[i + 1] = 255; o[i + 2] = 255; o[i + 3] = 255;
        }
      }
    }
    c.clearRect(0, 0, W, H);
    c.putImageData(out, 0, 0);
  });
  // same frame names as the 'booker' spritesheet (0..n-1)
  const cols = Math.floor(W / fw);
  const rows = Math.floor(H / fh);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) tex.add(n++, 0, col * fw, r * fh, fw, fh);
  }
  tex.refresh?.();
}

export function ensureFxTextures(scene) {
  canvasTex(scene, FXT.RING, 26, 10, (c) => {
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.ellipse(13, 5, 11.5, 4.2, 0, 0, Math.PI * 2); c.fill();
    // 1 px pixel ring
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      c.fillRect(Math.round(13 + Math.cos(t) * 12 - 0.5), Math.round(5 + Math.sin(t) * 4.4 - 0.5), 1, 1);
    }
  });
  canvasTex(scene, FXT.CONFETTI, 3, 2, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 3, 2); });
  canvasTex(scene, FXT.SPARKLE, 5, 5, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(2, 0, 1, 5);
    c.fillRect(0, 2, 5, 1);
  });
  canvasTex(scene, FXT.DUST, 4, 4, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(1, 0, 2, 4);
    c.fillRect(0, 1, 4, 2);
  });
  canvasTex(scene, FXT.ARROW, 9, 9, (c) => {
    c.fillStyle = '#1a1208';
    for (let x = 0; x < 9; x++) {
      const h = Math.max(0, 4 - Math.floor(x / 2));
      c.fillRect(x, 4 - h, 1, h * 2 + 1);
    }
    c.fillStyle = '#ffffff';
    for (let x = 1; x < 8; x++) {
      const h = Math.max(0, 3 - Math.floor(x / 2));
      c.fillRect(x, 4 - h, 1, h * 2 + 1);
    }
  });
  if (!scene.textures.exists(FXT.VIGNETTE)) {
    const t = canvasTex(scene, FXT.VIGNETTE, GAME.WIDTH, GAME.HEIGHT, (c) => {
      const cx = GAME.WIDTH / 2;
      const cy = GAME.HEIGHT / 2;
      const g = c.createRadialGradient(cx, cy, GAME.HEIGHT * 0.38, cx, cy, GAME.WIDTH * 0.62);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    });
    t.setFilter?.(Phaser.Textures.FilterMode.LINEAR);
  }
  makeDigits(scene);
  makeOutline(scene);
}
