// =============================================================================
// Slots textures, drawn once per game boot (Canvas 2D -> CanvasTexture):
//   slot-cell          light cream panel behind each symbol (CELL_W-6 x CELL_H-6)
//   sym-<id>-blur      vertical motion-blur copy of each symbol (same 128x128 size)
//   slot-bulb          marquee light bulb (white, tint it)
// Pixel art (symbols, blur copies) gets the NEAREST filter.
// =============================================================================

import Phaser from 'phaser';
import { SYMBOLS } from './config.js';

export const CELL_W = 108;
export const CELL_H = 104;
export const SYM_SIZE = 96; // 32-px art grid x3: crisp

function canvas(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeSlotTextures(scene) {
  // Cell panel: warm cream with a soft top light and a thin brass rim
  canvas(scene, 'slot-cell', CELL_W - 6, CELL_H - 6, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.55, '#f6e8c8');
    g.addColorStop(1, '#e2c995');
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(160,112,40,0.75)';
    ctx.stroke();
    // inner shadow at the bottom, light at the top
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(ctx, 5, 4, w - 10, 10, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,70,20,0.12)';
    roundRect(ctx, 4, h - 12, w - 8, 8, 4);
    ctx.fill();
  });

  // Motion-blurred symbols: stacked vertical copies at falling alpha
  for (const id of SYMBOLS) {
    const src = `sym-${id}`;
    const key = `${src}-blur`;
    if (!scene.textures.exists(src) || scene.textures.exists(key)) continue;
    const img = scene.textures.get(src).getSourceImage();
    const w = img.width || 128;
    const h = img.height || 128;
    canvas(scene, key, w, h, (ctx) => {
      ctx.imageSmoothingEnabled = false;
      const offs = [-30, -22, -15, -8, 8, 15, 22, 30];
      for (const o of offs) {
        ctx.globalAlpha = 0.16 * (1 - Math.abs(o) / 40);
        ctx.drawImage(img, 0, o, w, h);
      }
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.globalAlpha = 1;
    });
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  canvas(scene, 'slot-bulb', 18, 18, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
