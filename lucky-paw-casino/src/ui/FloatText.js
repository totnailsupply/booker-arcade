// =============================================================================
// FloatText + Toast
//
//   floatText(scene, x, y, '+250', { color: COLORS.WIN, size: 30, rise: 70, ms: 1100, delay: 0, origin: [1, 0.5] })
//     A label that pops, rises and fades, then destroys itself.
//
//   toast(scene, 'Max bet is 250', { kind: 'warn', ms: 1600 })
//     One short message under the top bar (a new toast replaces the old one).
//     kind: 'info' (cream) | 'warn' (amber) | 'error' (red, plays the error sfx)
// =============================================================================

import { COLORS, DEPTH, FONT, GAME, LAYOUT, TIMING } from '../core/Constants.js';
import { playSfx } from '../audio/sfx.js';
import { text } from './theme.js';

export function floatText(scene, x, y, str, o = {}) {
  const t = text(scene, x, y, str, {
    num: o.num ?? /^[+\-±x]?[\d,.:x]+$/.test(String(str)),
    size: o.size ?? FONT.SIZE.LARGE, color: o.color ?? COLORS.GOLD_LIGHT, weight: FONT.WEIGHT.BOLD,
    stroke: COLORS.INK, strokeW: o.strokeW ?? 6,
  });
  if (o.origin) t.setOrigin(...(Array.isArray(o.origin) ? o.origin : [o.origin, o.origin]));
  t.setDepth(o.depth ?? DEPTH.FLOAT).setScale(0.6).setAlpha(0);
  const ms = o.ms ?? TIMING.FLOAT_MS;
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 140, delay: o.delay ?? 0, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: t, y: y - (o.rise ?? 70), duration: ms, delay: o.delay ?? 0, ease: 'Cubic.easeOut',
  });
  scene.tweens.add({
    targets: t, alpha: 0, duration: ms * 0.35, delay: (o.delay ?? 0) + ms * 0.65,
    onComplete: () => t.destroy(),
  });
  return t;
}

export class Toast {
  /** One per scene; use toast() below. */
  static for(scene) {
    if (!scene.__toast || !scene.__toast.box.active) scene.__toast = new Toast(scene);
    return scene.__toast;
  }

  constructor(scene) {
    this.scene = scene;
    this.box = scene.add.container(GAME.WIDTH / 2, LAYOUT.TOPBAR_H + 40).setDepth(DEPTH.TOAST).setAlpha(0);
    this.bg = scene.add.graphics();
    this.label = text(scene, 0, 0, '', { size: FONT.SIZE.BODY, weight: FONT.WEIGHT.SEMI });
    this.box.add([this.bg, this.label]);
    this.timer = null;
  }

  show(str, { kind = 'info', ms = TIMING.TOAST_MS } = {}) {
    const color = kind === 'error' ? COLORS.LOSE : kind === 'warn' ? COLORS.WARN : COLORS.CREAM;
    this.label.setText(str).setColor(`#${color.toString(16).padStart(6, '0')}`);
    const w = Math.max(220, this.label.width + 48);
    const h = 52;
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.4);
    this.bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 14);
    this.bg.fillStyle(COLORS.PANEL, 0.96);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    this.bg.lineStyle(2, color, 0.9);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    if (kind === 'error' || kind === 'warn') playSfx('error', { gain: kind === 'warn' ? 0.6 : 1 });
    const s = this.scene;
    s.tweens.killTweensOf(this.box);
    this.box.setScale(0.85);
    s.tweens.add({ targets: this.box, alpha: 1, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.timer?.remove(false);
    this.timer = s.time.delayedCall(ms, () => {
      s.tweens.add({ targets: this.box, alpha: 0, duration: 200 });
    });
    this.lastText = str;
    return this;
  }
}

export function toast(scene, str, o = {}) {
  return Toast.for(scene).show(str, o);
}
