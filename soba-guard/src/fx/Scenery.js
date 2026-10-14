import Phaser from 'phaser';
import { COLORS, SCENERY as S, FX, FX_COLORS } from '../core/Constants.js';
import { META_COLORS } from '../core/MetaConstants.js';
import { FXK, ensureFxTextures } from './FxTextures.js';

// Code-drawn battle scenery (Step 3a): the band between the top bar and the
// grid becomes night sky + a wooden garden fence + a hedge, with a string of
// paper lanterns over it; the strip under the grid becomes a plank edge.

const SCENERY_COLORS = {
  SKY_TOP: META_COLORS.SKY_TOP,
  SKY_BOTTOM: META_COLORS.SKY_BOTTOM,
  STAR: META_COLORS.STAR,
  FENCE: 0x6a4428,
  FENCE_LIGHT: 0x8a5a34,
  FENCE_DARK: 0x3a2418,
  HEDGE: 0x24402a,
  HEDGE_LIGHT: 0x346a3a,
  HEDGE_DARK: 0x1a2e20,
  STRING: 0x8a6a4a,
  OUTLINE: COLORS.OUTLINE,
  LANTERN: META_COLORS.LANTERN,
  LANTERN_CAP: META_COLORS.LANTERN_CAP,
  LANTERN_GLOW: META_COLORS.LANTERN_GLOW,
};

/** Sky, fence, hedge and lantern string in the rect (x, y, w, h). Returns the lantern glows. */
export function drawHedgeBand(scene, x, y, w, h, depth) {
  const C = SCENERY_COLORS;
  const g = scene.add.graphics().setDepth(depth);
  // sky: 3 bands of the menu night gradient, a few stars
  const top = Phaser.Display.Color.IntegerToColor(C.SKY_TOP);
  const bot = Phaser.Display.Color.IntegerToColor(C.SKY_BOTTOM);
  for (let i = 0; i < 3; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 2, i);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(x, y + i * 4, w, 4);
  }
  g.fillStyle(C.SKY_BOTTOM, 1).fillRect(x, y + 12, w, h - 12);
  for (let sx = x + 7; sx < x + w; sx += 23) g.fillStyle(C.STAR, ((sx * 7) % 5) / 8 + 0.3).fillRect(sx, y + 1 + ((sx * 3) % 7), 1, 1);

  // fence: planks with pointed tops, a rail, posts every few planks
  const fy = y + S.FENCE_TOP;
  const pw = S.FENCE_PLANK_W;
  for (let i = 0, px = x; px < x + w; i++, px += pw) {
    const post = i % S.FENCE_POST_EVERY === 0;
    const ty = fy - (post ? 3 : 0);
    g.fillStyle(C.FENCE_DARK, 1).fillRect(px, ty + 2, pw, h);
    g.fillStyle(post ? C.FENCE_LIGHT : C.FENCE, 1).fillRect(px + 1, ty + 2, pw - 2, h);
    g.fillTriangle(px + 1, ty + 2, px + pw / 2, ty, px + pw - 1, ty + 2);
    g.fillStyle(C.FENCE_LIGHT, 1).fillRect(px + 1, ty + 2, 1, h);
  }
  g.fillStyle(C.FENCE_DARK, 1).fillRect(x, fy + 6, w, 3);
  g.fillStyle(C.FENCE_LIGHT, 1).fillRect(x, fy + 6, w, 1);

  // hedge: a dark base and two rows of round bumps (back darker, front lighter)
  const hy = y + S.HEDGE_TOP;
  const r = S.HEDGE_BUMP_R;
  g.fillStyle(C.HEDGE_DARK, 1).fillRect(x, hy + r / 2, w, h - S.HEDGE_TOP - r / 2);
  for (let bx = x - r; bx < x + w + r; bx += S.HEDGE_BUMP_STEP) {
    g.fillStyle(C.HEDGE_DARK, 1).fillCircle(bx + r, hy + r / 2, r);
    g.fillStyle(C.HEDGE, 1).fillCircle(bx + r + S.HEDGE_BUMP_STEP / 2, hy + r + 2, r);
    g.fillStyle(C.HEDGE_LIGHT, 1).fillRect(bx + r + S.HEDGE_BUMP_STEP / 2 - 2, hy + 4, 3, 1);
  }
  // clip the bumps that poke past the band edges
  g.fillStyle(C.HEDGE_DARK, 1).fillRect(x, y + h - 2, w, 2);

  // lantern string: a sagging line with small paper lanterns
  ensureFxTextures(scene);
  const sy0 = y + S.LANTERN_STRING_Y;
  const pts = [];
  const n = S.LANTERN_COUNT;
  const sag = (u) => sy0 + Math.sin(u * Math.PI) * S.LANTERN_SAG;
  g.lineStyle(1, C.STRING, 1);
  g.beginPath();
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    const px = x + u * w;
    if (i === 0) g.moveTo(px, sag(u));
    else g.lineTo(px, sag(u));
  }
  g.strokePath();
  const glows = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const lx = Math.round(x + u * w);
    const ly = Math.round(sag(u)) + 1;
    pts.push({ x: lx, y: ly });
    const rx = S.LANTERN_RX;
    const ry = S.LANTERN_RY;
    // a round paper lantern: outline, body with clipped corners, gold caps, lit core
    g.fillStyle(C.OUTLINE, 1).fillRect(lx - rx - 1, ly + 1, rx * 2 + 2, ry * 2).fillRect(lx - rx, ly, rx * 2, ry * 2 + 2);
    g.fillStyle(C.LANTERN, 1).fillRect(lx - rx, ly + 2, rx * 2, ry * 2 - 2).fillRect(lx - rx + 1, ly + 1, rx * 2 - 2, ry * 2);
    g.fillStyle(C.LANTERN_CAP, 1).fillRect(lx - rx + 2, ly, rx * 2 - 4, 1).fillRect(lx - rx + 2, ly + ry * 2 + 1, rx * 2 - 4, 1);
    g.fillStyle(C.LANTERN_GLOW, 1).fillRect(lx - 1, ly + 2, 2, ry * 2 - 2);
    const glow = scene.add.image(lx, ly + ry, FXK.GLOW).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(FX_COLORS.GLOW).setScale(S.LANTERN_GLOW_SCALE).setAlpha(FX.GLOW_ALPHA_MIN).setDepth(depth);
    glow.flickerPhase = i * 2.1;
    glows.push(glow);
  }
  return glows;
}

/** The plank edge under the grid. */
export function drawPlankEdge(scene, x, y, w, h, depth) {
  const C = SCENERY_COLORS;
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(C.FENCE_DARK, 1).fillRect(x, y, w, h);
  for (let px = x, i = 0; px < x + w; px += S.BOTTOM_PLANK_W, i++) {
    g.fillStyle(i % 2 ? C.FENCE : C.FENCE_LIGHT, 1).fillRect(px + 1, y + 1, S.BOTTOM_PLANK_W - 2, h - 3);
    g.fillStyle(C.FENCE_DARK, 1).fillRect(px + 3, y + 3, 1, 1).fillRect(px + S.BOTTOM_PLANK_W - 4, y + 3, 1, 1);
  }
  return g;
}
