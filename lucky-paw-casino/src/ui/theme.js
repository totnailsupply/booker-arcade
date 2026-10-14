// =============================================================================
// theme.js — small helpers every UI piece shares.
//
//   text(scene, x, y, str, { size, color, weight, stroke, align, wrap, origin, shadow })
//   fmt(n)                 1234 -> '1,234'
//   fmtSigned(n)           +1,234 / -50
//   drawPanel(g, x, y, w, h, { fill, alpha, edge, radius, inner })  wood panel with brass edge (top-left x,y)
//   modal helpers: openModal(scene) / closeModal(scene) / modalOpen(scene)
//     While a modal (RulesPanel, confirm) is open, Button hotkeys that are not
//     part of the modal are ignored.
// =============================================================================

import { COLORS, FONT, css } from '../core/Constants.js';

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
/** Compact: 950 -> '950', 2500 -> '2.5k', 150000 -> '150k', 1.2e6 -> '1.2M'. */
export function fmtK(n) {
  const a = Math.abs(n);
  const s = (v, u) => `${(Math.round(v * 10) / 10).toString()}${u}`;
  if (a >= 1e6) return s(n / 1e6, 'M');
  if (a >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (a >= 1e3) return s(n / 1e3, 'k');
  return String(Math.round(n));
}
export const fmtSigned = (n) => `${n > 0 ? '+' : n < 0 ? '-' : '±'}${fmt(Math.abs(n))}`;

/**
 * Text in the casino font.
 * @param {Phaser.Scene} scene
 * @param {object} [o] size (px, default BODY), num (true: the numbers font, for amounts), display (Silkscreen caps title face), color (0xRRGGBB or css), weight ('400'..'700'),
 *   stroke (0xRRGGBB), strokeW, align, wrap (px width), origin (default 0.5), shadow (bool), lineSpacing
 */
export function text(scene, x, y, str, o = {}) {
  const size = Math.round((o.size ?? FONT.SIZE.BODY) * (o.display ? 1 : FONT.SCALE * (o.num ? FONT.NUM_SCALE : 1)));
  const color = typeof o.color === 'number' ? css(o.color) : (o.color ?? css(COLORS.TEXT));
  const style = {
    fontFamily: o.display ? FONT.DISPLAY : (o.num ? FONT.NUMBERS : FONT.FAMILY),
    fontSize: `${size}px`,
    // Pixel faces: Jersey 10 has one weight (never synthesise bold); Silkscreen uses 700.
    fontStyle: o.display ? 'bold' : 'normal',
    color,
    align: o.align ?? 'center',
  };
  if (o.stroke !== undefined && o.stroke !== null) {
    style.stroke = typeof o.stroke === 'number' ? css(o.stroke) : o.stroke;
    style.strokeThickness = o.strokeW ?? Math.max(3, Math.round(size / 7));
  }
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  if (o.shadow) style.shadow = { offsetX: 0, offsetY: 3, color: '#000000', blur: 0, fill: true, stroke: true };
  const t = scene.add.text(x, y, str, style);
  t.setOrigin(...(Array.isArray(o.origin) ? o.origin : [o.origin ?? 0.5, o.origin ?? 0.5]));
  if (o.lineSpacing) t.setLineSpacing(o.lineSpacing);
  t.setPadding(2, 2, 2, 2);
  return t;
}

/** Dark wood panel with a brass edge. (x, y) = top-left. */
export function drawPanel(g, x, y, w, h, o = {}) {
  const r = o.radius ?? 16;
  const fill = o.fill ?? COLORS.PANEL;
  const alpha = o.alpha ?? 0.94;
  if (o.shadow !== false) {
    g.fillStyle(0x000000, 0.35 * alpha);
    g.fillRoundedRect(x + 2, y + 6, w, h, r);
  }
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  // soft top sheen
  g.fillStyle(0xffffff, 0.04 * alpha);
  g.fillRoundedRect(x + 4, y + 4, w - 8, Math.min(h * 0.4, 60), { tl: r - 4, tr: r - 4, bl: 4, br: 4 });
  if (o.edge !== null) {
    g.lineStyle(o.edgeW ?? 3, o.edge ?? COLORS.PANEL_EDGE, o.edgeAlpha ?? 0.9);
    g.strokeRoundedRect(x, y, w, h, r);
  }
  if (o.inner) {
    g.lineStyle(1, 0xffffff, 0.08);
    g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 5));
  }
  return g;
}

// --- modal stack (per scene) -------------------------------------------------------

export function openModal(scene) {
  scene.__modals = (scene.__modals || 0) + 1;
}

export function closeModal(scene) {
  scene.__modals = Math.max(0, (scene.__modals || 0) - 1);
}

export function modalOpen(scene) {
  return (scene.__modals || 0) > 0;
}

/** Lighten (f > 0) or darken (f < 0) a 0xRRGGBB colour. */
export function shade(n, f) {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
