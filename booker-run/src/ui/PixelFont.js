// =============================================================================
// PixelFont.js — a generated pixel font for every menu, overlay and the HUD.
//
// Why: the game renders at 480x270 and scales up with nearest-neighbour, so a
// browser font (Courier) is anti-aliased at 1x and turns blurry and uneven.
// This module draws the glyphs in PixelFontData.js into a canvas texture once
// and registers two BitmapText fonts:
//   FONT.KEY  ('px')       white ink + a baked 1 px dark outline and a 1 px drop
//                          shadow: readable over any art. Tint it for colour
//                          (multiply tint keeps the outline dark).
//   FONT.FLAT ('px-flat')  ink only (for text on solid panels).
// Draw it at integer scales (1x = 7 px caps, 2x = 14 px, 3x = 21 px) and at
// integer positions; text() below snaps positions for you.
//
//   import { text, ensurePixelFont } from '../ui/PixelFont.js';
//   ensurePixelFont(scene);                       // once per game (cheap to repeat)
//   text(scene, 240, 20, 'LEVEL COMPLETE!', { scale: 2, color: '#ffd34d', align: 'center' });
// =============================================================================

import { GLYPH_SRC } from './PixelFontData.js';
import { PIXEL_FONT } from '../core/Constants.js';

export const FONT = {
  KEY: 'px',
  FLAT: 'px-flat',
  CAP: 7,                // cap height in px at 1x (the font's nominal size)
};

let glyphs = null;

function parseGlyphs() {
  if (glyphs) return glyphs;
  glyphs = new Map();
  for (const line of GLYPH_SRC.trim().split('\n')) {
    const toks = line.trim().split(' ');
    const key = toks[0] === 'SPACE' ? ' ' : toks[0];
    glyphs.set(key, toks.slice(1));
  }
  return glyphs;
}

const hexToCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** Builds the font texture + BitmapText data for one style. */
function buildFont(scene, key, outlined) {
  if (scene.cache.bitmapFont.exists(key)) return;
  const G = parseGlyphs();
  const pad = outlined ? 1 : 0;
  const shadow = outlined ? 1 : 0;
  const rows = 8;                                  // 7 cap rows + 1 descender
  const cellH = rows + pad * 2 + shadow;
  const texW = 256;
  // Pack cells left to right
  const cells = [];
  let x = 0;
  let y = 0;
  for (const [ch, g] of G) {
    const w = g[0].length + pad * 2;
    if (x + w > texW) { x = 0; y += cellH + 1; }
    cells.push({ ch, g, x, y, w });
    x += w + 1;
  }
  const texH = y + cellH + 1;
  const tex = scene.textures.createCanvas(`${key}-tex`, texW, texH);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, texW, texH);

  const ink = new Set();
  for (const c of cells) {
    c.g.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') ink.add(`${c.x + pad + rx},${c.y + pad + ry}`);
      }
    });
  }
  if (outlined) {
    ctx.fillStyle = hexToCss(PIXEL_FONT.OUTLINE);
    for (const p of ink) {
      const [px, py] = p.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1 + shadow; dy++) {
          if (!ink.has(`${px + dx},${py + dy}`)) ctx.fillRect(px + dx, py + dy, 1, 1);
        }
      }
    }
  }
  ctx.fillStyle = '#ffffff';
  for (const p of ink) {
    const [px, py] = p.split(',').map(Number);
    ctx.fillRect(px, py, 1, 1);
  }
  tex.refresh();

  const chars = {};
  for (const c of cells) {
    const w = c.g[0].length;
    const add = {
      x: c.x,
      y: c.y,
      width: c.w,
      height: cellH,
      centerX: Math.floor(c.w / 2),
      centerY: Math.floor(cellH / 2),
      xOffset: -pad,
      yOffset: -pad,
      xAdvance: w + PIXEL_FONT.LETTER_SPACING,
      data: {},
      kerning: {},
      u0: c.x / texW,
      v0: 1 - c.y / texH,
      u1: (c.x + c.w) / texW,
      v1: 1 - (c.y + cellH) / texH,
    };
    chars[c.ch.charCodeAt(0)] = add;
    // Lowercase renders as capitals
    const lower = c.ch.toLowerCase();
    if (lower !== c.ch) chars[lower.charCodeAt(0)] = add;
  }
  const data = {
    retroFont: true,
    font: key,
    size: FONT.CAP,
    lineHeight: FONT.CAP + PIXEL_FONT.LINE_GAP,
    chars,
  };
  scene.cache.bitmapFont.add(key, { data, texture: `${key}-tex`, frame: null });
}

/** Registers both fonts (once per game; safe to call from every scene). */
export function ensurePixelFont(scene) {
  buildFont(scene, FONT.KEY, true);
  buildFont(scene, FONT.FLAT, false);
}

const toTint = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);
const ALIGN = { left: 0, center: 0.5, right: 1, top: 0, middle: 0.5, bottom: 1 };

/** Width in px of a string at a scale (no object created). */
export function measure(str, scale = 1) {
  const G = parseGlyphs();
  let w = 0;
  const s = String(str).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = G.get(s[i]) || G.get('?');
    w += g[0].length + (i < s.length - 1 ? PIXEL_FONT.LETTER_SPACING : 0);
  }
  return w * scale;
}

/**
 * BitmapText in the pixel font, snapped to whole pixels.
 * opts: scale (1|2|3), color ('#rrggbb' | 0xrrggbb), align (left|center|right),
 *       valign (top|middle|bottom), flat (no outline), maxWidth (wrap, 1x px),
 *       lineGap (extra px between lines), depth, scroll (scrollFactor).
 * Returned object keeps its anchor: call relayout(t) after setText().
 */
export function text(scene, x, y, str, opts = {}) {
  ensurePixelFont(scene);
  const scale = opts.scale || 1;
  const t = scene.add.bitmapText(0, 0, opts.flat ? FONT.FLAT : FONT.KEY, String(str), FONT.CAP * scale);
  if (opts.maxWidth) t.setMaxWidth(opts.maxWidth);
  if (opts.lineGap) t.setLineSpacing(opts.lineGap);
  if (opts.color !== undefined) t.setTint(toTint(opts.color));
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  if (opts.scroll !== undefined) t.setScrollFactor(opts.scroll);
  if (opts.centerLines) t.setCenterAlign();
  t.anchor = { x, y, ax: ALIGN[opts.align || 'left'], ay: ALIGN[opts.valign || 'top'], scale };
  relayout(t);
  return t;
}

/** Re-snaps a pixel text to its anchor (after setText / moving the anchor). */
export function relayout(t, x = t.anchor.x, y = t.anchor.y) {
  t.anchor.x = x;
  t.anchor.y = y;
  t.setOrigin(0, 0);
  // One line: align on the cap height (bounds include the line gap below)
  const multi = t.text.includes('\n') || t.maxWidth > 0;
  const h = multi ? t.height : FONT.CAP * t.anchor.scale;
  t.setPosition(Math.round(x - t.width * t.anchor.ax), Math.round(y - h * t.anchor.ay));
  return t;
}

/** setText + relayout in one call. */
export function setText(t, str) {
  t.setText(String(str));
  return relayout(t);
}

/** Changes the tint of a pixel text ('#rrggbb' or number). */
export function setColor(t, color) {
  t.setTint(toTint(color));
  return t;
}
