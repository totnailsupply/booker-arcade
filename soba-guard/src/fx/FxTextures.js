import { createCanvasTexture } from '../core/Assets.js';

// Small white particle textures drawn once in code (tinted per use). Pixel-art
// shapes, except the glow, which is a soft radial gradient for ADD blending.

export const FXK = {
  PIXEL: 'fx-pixel',       // 2x2 square (debris, crumbs)
  DUST: 'fx-dust',         // 6x6 round puff
  SPARK: 'fx-spark',       // 5x5 plus
  LINE: 'fx-line',         // 10x1 speed line
  CONFETTI: 'fx-confetti', // 3x2
  FIREFLY: 'fx-firefly',   // 3x3 soft dot
  GLOW: 'fx-glow',         // 64x64 radial gradient
};

const GLOW_SIZE = 64;

const DRAW = {
  [FXK.PIXEL]: [2, 2, (c) => { c.fillRect(0, 0, 2, 2); }],
  [FXK.DUST]: [6, 6, (c) => { c.fillRect(1, 0, 4, 6); c.fillRect(0, 1, 6, 4); }],
  [FXK.SPARK]: [5, 5, (c) => { c.fillRect(2, 0, 1, 5); c.fillRect(0, 2, 5, 1); c.fillRect(1, 1, 3, 3); }],
  [FXK.LINE]: [10, 1, (c) => { c.fillRect(0, 0, 10, 1); }],
  [FXK.CONFETTI]: [3, 2, (c) => { c.fillRect(0, 0, 3, 2); }],
  [FXK.FIREFLY]: [3, 3, (c) => {
    c.globalAlpha = 0.5;
    c.fillRect(0, 0, 3, 3);
    c.globalAlpha = 1;
    c.fillRect(1, 1, 1, 1);
  }],
  [FXK.GLOW]: [GLOW_SIZE, GLOW_SIZE, (c) => {
    const r = GLOW_SIZE / 2;
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  }],
};

/** Creates any missing FX texture (idempotent; textures outlive scenes). */
export function ensureFxTextures(scene) {
  for (const [key, [w, h, draw]] of Object.entries(DRAW)) {
    if (scene.textures.exists(key)) continue;
    const tex = createCanvasTexture(scene, key, w, h);
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    draw(ctx);
    tex.refresh();
  }
}
