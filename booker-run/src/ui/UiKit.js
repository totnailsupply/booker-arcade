// =============================================================================
// UiKit.js — shared pixel-art UI pieces for every menu, overlay and the HUD.
//
//   ensureUiAssets(scene)   pixel font + generated textures (once per game)
//   pixelRect / ring / panel  notched-corner fills and bevelled panels (Graphics)
//   PixelButton             Container + Graphics + BitmapText button with focus
//   bindMenuKeys            arrows/WASD move, Space/Enter confirm, Esc/Backspace back
//   icon(scene, x, y, frame, size)   ui-icons at 24 (art), 16 or 12 px (generated)
//   burst(scene, x, y, opts)         confetti / sparkle bursts for celebrations
//
// Everything draws at whole pixels; Graphics ignores roundPixels, so all
// coordinates passed here should be integers.
// =============================================================================

import Phaser from 'phaser';
import { UI_COLORS, UI_KIT } from '../core/Constants.js';
import { text, setText, setColor, relayout, ensurePixelFont } from './PixelFont.js';

export const UI_TEX = {
  ICONS12: 'ui-icons-12',
  ICONS16: 'ui-icons-16',
  DOT: 'ui-dot',
  SPARK: 'ui-spark',
  CONFETTI: 'ui-confetti',
  RAYS: 'ui-rays',
  STEAK_SM: 'ui-steak-sm',
  GOLDEN_STEAK_SM: 'ui-golden-steak-sm',
};

// --- generated textures ------------------------------------------------------

/** Box-downscales a texture (icons, steak) and snaps alpha so edges stay hard. */
function downscale(scene, srcKey, dstKey, factor, frame = null) {
  if (scene.textures.exists(dstKey) || !scene.textures.exists(srcKey)) return;
  const src = scene.textures.get(srcKey).getSourceImage();
  const w = Math.round(src.width * factor);
  const h = Math.round(src.height * factor);
  const tex = scene.textures.createCanvas(dstKey, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= UI_KIT.ALPHA_CUTOFF ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  if (frame) {
    const n = Math.floor(w / frame);
    for (let i = 0; i < n; i++) tex.add(i, 0, i * frame, 0, frame, frame);
  }
  tex.refresh();
}

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.getContext(), w, h);
  tex.refresh();
}

/** Pixel font + every generated UI texture. Cheap to call again. */
export function ensureUiAssets(scene) {
  ensurePixelFont(scene);
  downscale(scene, 'ui-icons', UI_TEX.ICONS12, 0.5, UI_KIT.ICON_SMALL);
  downscale(scene, 'ui-icons', UI_TEX.ICONS16, 2 / 3, UI_KIT.ICON_MED);
  downscale(scene, 'steak', UI_TEX.STEAK_SM, 0.5);
  downscale(scene, 'golden-steak', UI_TEX.GOLDEN_STEAK_SM, 0.5);
  canvasTex(scene, UI_TEX.DOT, 2, 2, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 2, 2); });
  canvasTex(scene, UI_TEX.CONFETTI, 3, 2, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 3, 2); });
  canvasTex(scene, UI_TEX.SPARK, 5, 5, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(2, 0, 1, 5);
    c.fillRect(0, 2, 5, 1);
  });
  canvasTex(scene, UI_TEX.RAYS, 128, 128, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + Math.PI / n;
      const g = c.createRadialGradient(cx, cy, 4, cx, cy, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * h);
      c.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * h);
      c.closePath();
      c.fill();
    }
  });
}

/** ui-icons frame at 24 (original art), 16 or 12 px. */
export function icon(scene, x, y, frame, size = 24) {
  const key = size === 12 ? UI_TEX.ICONS12 : size === 16 ? UI_TEX.ICONS16 : 'ui-icons';
  return scene.add.image(x, y, key, frame);
}

// --- pixel shapes --------------------------------------------------------------

/** Filled rect with stepped corners (notch px), no overlapping rows (alpha-safe). */
export function pixelRect(g, x, y, w, h, color, alpha = 1, notch = 1) {
  g.fillStyle(color, alpha);
  if (notch <= 0) {
    g.fillRect(x, y, w, h);
    return g;
  }
  for (let i = 0; i < notch; i++) {
    const inset = notch - i;
    g.fillRect(x + inset, y + i, w - inset * 2, 1);
    g.fillRect(x + inset, y + h - 1 - i, w - inset * 2, 1);
  }
  g.fillRect(x, y + notch, w, h - notch * 2);
  return g;
}

/** 1 px ring (notch 0 or 1). */
export function ring(g, x, y, w, h, color, alpha = 1, notch = 1) {
  g.fillStyle(color, alpha);
  g.fillRect(x + notch, y, w - notch * 2, 1);
  g.fillRect(x + notch, y + h - 1, w - notch * 2, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
  return g;
}

/**
 * Bevelled pixel panel: drop shadow, dark outline, 1 px light bevel, fill.
 * opts: fill, hi, outline, alpha (fill), shadow (px, 0 = none), sheen (top highlight line)
 */
export function panel(g, x, y, w, h, opts = {}) {
  const fill = opts.fill ?? UI_COLORS.PANEL;
  const hi = opts.hi ?? UI_COLORS.PANEL_HI;
  const outline = opts.outline ?? UI_COLORS.OUTLINE;
  const alpha = opts.alpha ?? 1;
  const shadow = opts.shadow ?? 2;
  if (shadow > 0) pixelRect(g, x, y + shadow, w, h, 0x000000, UI_COLORS.SHADOW_ALPHA * alpha, 1);
  ring(g, x, y, w, h, outline, Math.max(alpha, 0.85), 1);
  ring(g, x + 1, y + 1, w - 2, h - 2, hi, Math.max(alpha, 0.85), 0);
  g.fillStyle(fill, alpha);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  if (opts.sheen !== false) {
    g.fillStyle(hi, 0.35 * alpha);
    g.fillRect(x + 2, y + 2, w - 4, 1);
  }
  return g;
}

/** Corner brackets (focus marker) around a rect, `len` px arms, `t` px thick. */
export function brackets(g, x, y, w, h, color, len = 6, t = 2) {
  g.fillStyle(color, 1);
  // top-left, top-right, bottom-left, bottom-right
  g.fillRect(x, y, len, t); g.fillRect(x, y, t, len);
  g.fillRect(x + w - len, y, len, t); g.fillRect(x + w - t, y, t, len);
  g.fillRect(x, y + h - t, len, t); g.fillRect(x, y + h - len, t, len);
  g.fillRect(x + w - len, y + h - t, len, t); g.fillRect(x + w - t, y + h - len, t, len);
  return g;
}

/** Progress bar with a best-percent tick: returns { g, set(p, best) }. */
export function miniBar(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics();
  const fillColor = opts.fill ?? UI_COLORS.ORANGE;
  const set = (p, best = 0) => {
    const pp = Phaser.Math.Clamp(p || 0, 0, 1);
    const bb = Phaser.Math.Clamp(best || 0, 0, 1);
    g.clear();
    pixelRect(g, x - 1, y - 1, w + 2, h + 2, UI_COLORS.OUTLINE, 1, 1);
    g.fillStyle(UI_COLORS.PANEL_DARK, 1).fillRect(x, y, w, h);
    const fw = Math.round(pp * w);
    if (fw > 0) {
      g.fillStyle(fillColor, 1).fillRect(x, y, fw, h);
      g.fillStyle(0xffffff, 0.35).fillRect(x, y, fw, 1);
    }
    if (bb > 0 && bb < 1) {
      const bx = x + Math.round(bb * w);
      g.fillStyle(0xffffff, 1).fillRect(bx - 1, y - 2, 2, h + 4);
    }
  };
  set(opts.value || 0, opts.best || 0);
  return { g, set };
}

// --- button --------------------------------------------------------------------

/**
 * Container + Graphics + BitmapText button.
 *   new PixelButton(scene, cx, cy, w, label, { id, onPress, enabled, style: 'primary'|'ghost', icon, iconSize })
 * focus is drawn by setFocused(); onFocus(btn) fires on pointer hover.
 */
export class PixelButton {
  constructor(scene, cx, cy, w, label, opts = {}) {
    this.scene = scene;
    this.id = opts.id || label.toLowerCase();
    this.w = w;
    this.h = opts.h || UI_KIT.BTN_H;
    this.enabled = opts.enabled !== false;
    this.style = opts.style || 'primary';
    this.onPress = opts.onPress || (() => {});
    this.onFocus = opts.onFocus || null;
    this.focused = false;
    this.pressedLook = false;

    this.container = scene.add.container(Math.round(cx), Math.round(cy));
    this.bg = scene.add.graphics();
    this.container.add(this.bg);
    const iconW = opts.icon !== undefined ? (opts.iconSize || 12) + 3 : 0;
    this.label = text(scene, 0, 0, label, { align: 'center', valign: 'middle', flat: false });
    this.container.add(this.label);
    if (opts.icon !== undefined) {
      this.iconImg = icon(scene, 0, 0, opts.icon, opts.iconSize || 12);
      this.container.add(this.iconImg);
    }
    this.layout(iconW);

    if (this.enabled) {
      this.container.setSize(this.w, this.h);
      this.container.setInteractive({ useHandCursor: true });
      this.container.on('pointerover', () => this.onFocus?.(this));
      this.container.on('pointerdown', (_p, _x, _y, e) => {
        e?.stopPropagation?.();
        this.pressedLook = true;
        this.draw();
      });
      this.container.on('pointerout', () => {
        if (this.pressedLook) { this.pressedLook = false; this.draw(); }
      });
      // A press counts only if it also started on this button: a finger or mouse
      // button held from before (e.g. while the pause menu opened) and released
      // over a button must not press it. Phaser fires pointerup before pointerout
      // on touch end, so taps still work.
      this.container.on('pointerup', (_p, _x, _y, e) => {
        const armed = this.pressedLook;
        this.pressedLook = false;
        if (!armed) {
          this.draw();
          return;
        }
        e?.stopPropagation?.();
        this.press();
      });
    }
    this.draw();
  }

  layout(iconW = this.iconImg ? 15 : 0) {
    const tw = this.label.width;
    const total = tw + iconW;
    const left = -Math.round(total / 2);
    if (this.iconImg) this.iconImg.setPosition(left + Math.round(this.iconImg.width / 2), 0);
    // Label: left edge after the icon, caps centred on the button (7 px caps -> y -4)
    Object.assign(this.label.anchor, { x: left + iconW, y: -4, ax: 0, ay: 0 });
    relayout(this.label);
  }

  setLabel(str) {
    setText(this.label, str);
    this.layout();
    this.draw();
  }

  setFocused(on) {
    this.focused = on;
    this.draw();
    return this;
  }

  draw() {
    const g = this.bg;
    const w = this.w;
    const h = this.h;
    const x = -Math.round(w / 2);
    const y = -Math.round(h / 2);
    const down = this.pressedLook ? 1 : 0;
    g.clear();
    if (!this.enabled) {
      panel(g, x, y, w, h, { fill: UI_COLORS.PANEL_LOCKED, hi: UI_COLORS.PANEL_LOCKED_HI, shadow: 1, sheen: false });
      setColor(this.label, UI_COLORS.DISABLED);
      return;
    }
    const primary = this.style === 'primary';
    const fill = this.focused ? (primary ? UI_COLORS.BTN_HI : UI_COLORS.BTN_GHOST_HI) : (primary ? UI_COLORS.BTN : UI_COLORS.BTN_GHOST);
    const hi = primary ? 0xffc27a : 0x7d68b0;
    if (this.focused) {
      // Gold focus ring outside the button
      ring(g, x - 2, y - 2 + down, w + 4, h + 4, UI_COLORS.GOLD, 1, 1);
    }
    panel(g, x, y + down, w, h, { fill, hi, shadow: down ? 1 : 2 });
    // darker lower half for a chunky arcade look
    g.fillStyle(0x000000, 0.12).fillRect(x + 2, y + down + Math.round(h / 2), w - 4, Math.floor(h / 2) - 2);
    setColor(this.label, this.focused ? UI_COLORS.INK : (primary ? 0xfff1dc : UI_COLORS.MUTED));
    this.label.setY(-4 + down);
    if (this.iconImg) this.iconImg.setY(down);
  }

  /** Visual press + callback. */
  press() {
    if (!this.enabled) return;
    this.pressedLook = true;
    this.draw();
    this.scene.time.delayedCall(UI_KIT.BTN_PRESS_MS, () => {
      if (!this.container.scene) return;
      this.pressedLook = false;
      this.draw();
    });
    this.onPress(this);
  }

  destroy() {
    this.container.destroy();
  }
}

// --- keyboard -------------------------------------------------------------------

const KEYMAP = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
  confirm: ['SPACE', 'ENTER'],
  back: ['ESC', 'BACKSPACE'],
};

/** Menu keys: handlers { left, right, up, down, confirm, back }. Confirm ignores key repeat. */
export function bindMenuKeys(scene, handlers) {
  const kb = scene.input.keyboard;
  for (const [name, keys] of Object.entries(KEYMAP)) {
    const fn = handlers[name];
    if (!fn) continue;
    for (const k of keys) {
      kb.on(`keydown-${k}`, (e) => {
        if ((name === 'confirm' || name === 'back') && e?.repeat) return;
        fn(e);
      });
    }
  }
}

// --- celebration particles ---------------------------------------------------------

/**
 * One-shot burst. opts: count, colors, speed [min,max], gravity, lifespan, depth, texture, scroll
 * Returns the emitter (destroyed automatically).
 */
export function burst(scene, x, y, opts = {}) {
  ensureUiAssets(scene);
  const lifespan = opts.lifespan ?? 900;
  const em = scene.add.particles(x, y, opts.texture || UI_TEX.CONFETTI, {
    emitting: false,
    lifespan,
    speed: { min: (opts.speed || [60, 180])[0], max: (opts.speed || [60, 180])[1] },
    angle: opts.angle || { min: 0, max: 360 },
    gravityY: opts.gravity ?? 220,
    rotate: opts.rotate === false ? 0 : { min: 0, max: 360 },
    scale: opts.scale || { start: 1, end: 0.6 },
    alpha: { start: 1, end: 0 },
    tint: opts.colors || UI_COLORS.CONFETTI,
  });
  if (opts.depth !== undefined) em.setDepth(opts.depth);
  if (opts.scroll !== undefined) em.setScrollFactor(opts.scroll);
  em.explode(opts.count || 24);
  scene.time.delayedCall(lifespan + 100, () => em.destroy());
  return em;
}

// --- small persisted UI prefs ------------------------------------------------------

export function loadPref(key, fallback = null) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // storage blocked: the preference just isn't kept
  }
}
