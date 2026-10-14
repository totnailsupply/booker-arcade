// =============================================================================
// Button — casino button (Container). Touch-friendly (min 56 px tall).
//
//   const deal = new Button(scene, 640, 660, {
//     label: 'Deal', hint: 'Space', hotkey: 'SPACE', style: 'gold',
//     w: 200, h: 60, onClick: () => this.deal(),
//   });
//   deal.setEnabled(false);  deal.setLabel('Hit');  deal.press();  deal.destroy();
//
// Options
//   label      string
//   hint       small hotkey hint drawn under the label (e.g. 'Space', 'Esc')
//   hotkey     Phaser key name(s): 'SPACE' | 'ENTER' | 'ESC' | 'H' | ['SPACE','ENTER']
//   style      'primary' (felt green) | 'secondary' (wood) | 'gold' | 'danger' | 'ghost'
//   color      custom face colour (overrides the style's face)
//   w, h       size (h is clamped to >= 56)
//   size       label font size
//   num        true: label in the numbers font (labels like 'Claim +250', 'Bet 25')
//   icon       texture key drawn left of the label (scaled to h*0.55)
//   sfx        sound on click (default 'click'; null for none)
//   modal      true for buttons inside a modal (their hotkeys work while it's open)
//   depth      container depth
//   onClick    () => void
//
// Hover lifts the button and brightens a glow; press squashes it. Disabled
// buttons are dimmed, ignore pointer and hotkeys, and play nothing.
// =============================================================================

import Phaser from 'phaser';
import { COLORS, FONT, LAYOUT } from '../core/Constants.js';
import { playSfx } from '../audio/sfx.js';
import { text, shade, modalOpen } from './theme.js';

const STYLES = {
  primary: { face: 0x23704a, edge: COLORS.BRASS, text: COLORS.CREAM },
  secondary: { face: 0x3a2617, edge: COLORS.BRASS, text: COLORS.CREAM },
  gold: { face: 0xe2b23f, edge: 0xfff0b8, text: COLORS.INK },
  danger: { face: 0xa8322a, edge: 0xf3b0a6, text: COLORS.CREAM },
  ghost: { face: 0x000000, edge: COLORS.BRASS, text: COLORS.CREAM, alpha: 0.45 },
};

export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.o = o;
    this.w = o.w ?? 200;
    this.h = Math.max(LAYOUT.MIN_TOUCH, o.h ?? 60);
    this.styleName = o.style ?? 'primary';
    this.enabled = o.disabled ? false : true;
    this.hovered = false;
    this.pressed = false;
    this.onClick = o.onClick || null;
    this.baseY = y;

    this.glow = scene.add.graphics();
    this.gfx = scene.add.graphics();
    this.add([this.glow, this.gfx]);

    const st = this.style();
    const fs = o.size ?? (this.h >= 64 ? FONT.SIZE.LARGE : FONT.SIZE.BODY);
    const hasHint = !!o.hint;
    let lx = 0;
    if (o.icon && scene.textures.exists(o.icon)) {
      const s = this.h * 0.55;
      this.icon = scene.add.image(0, 0, o.icon);
      const k = s / Math.max(this.icon.width, this.icon.height);
      this.icon.setScale(k);
      this.add(this.icon);
      lx = s * 0.6;
    }
    this.label = text(scene, lx, hasHint ? -9 : -1, o.label ?? '', {
      size: fs, color: st.text, weight: FONT.WEIGHT.BOLD, num: !!o.num,
    });
    this.add(this.label);
    if (this.icon) this.icon.x = this.label.x - this.label.width / 2 - this.icon.displayWidth * 0.6;
    if (hasHint) {
      this.hint = text(scene, lx, 17, o.hint, { size: 16, color: st.text, weight: FONT.WEIGHT.REGULAR });
      this.hint.setAlpha(0.7);
      this.add(this.hint);
    }

    this.zone = scene.add.zone(0, 0, this.w, this.h).setInteractive({ useHandCursor: true });
    this.add(this.zone);
    this.zone.on('pointerover', () => this.setHover(true));
    this.zone.on('pointerout', () => { this.setHover(false); this.setPressed(false); });
    this.zone.on('pointerdown', () => { if (this.enabled) this.setPressed(true); });
    this.zone.on('pointerup', () => {
      if (this.pressed) {
        this.setPressed(false);
        this.fire();
      }
    });

    // Hotkeys
    this.keyHandlers = [];
    const keys = o.hotkey ? (Array.isArray(o.hotkey) ? o.hotkey : [o.hotkey]) : [];
    for (const k of keys) {
      const ev = `keydown-${k}`;
      const fn = (e) => {
        if (e?.repeat) return;
        if (!this.active || !this.visibleInTree()) return;
        if (modalOpen(scene) && !o.modal) return;
        this.press();
      };
      scene.input.keyboard?.on(ev, fn);
      this.keyHandlers.push([ev, fn]);
    }
    if (o.depth !== undefined) this.setDepth(o.depth);
    this.setSize(this.w, this.h);
    this.draw();
    this.once('destroy', () => this.cleanup());
  }

  style() {
    const s = STYLES[this.styleName] || STYLES.primary;
    return this.o.color !== undefined ? { ...s, face: this.o.color } : s;
  }

  visibleInTree() {
    let n = this;
    while (n) {
      if (!n.visible) return false;
      n = n.parentContainer;
    }
    return true;
  }

  draw() {
    const g = this.gfx;
    const st = this.style();
    const { w, h } = this;
    const r = Math.min(16, h / 3);
    const x = -w / 2;
    const y = -h / 2;
    const face = this.enabled ? (this.hovered ? shade(st.face, 0.12) : st.face) : shade(st.face, -0.45);
    const a = st.alpha ?? 1;
    g.clear();
    // drop + lip
    g.fillStyle(0x000000, 0.4 * a);
    g.fillRoundedRect(x + 1, y + 5, w, h, r);
    g.fillStyle(shade(face, -0.35), a);
    g.fillRoundedRect(x, y + 3, w, h, r);
    g.fillStyle(face, a);
    g.fillRoundedRect(x, y, w, h, r);
    // sheen
    g.fillStyle(0xffffff, this.enabled ? 0.14 : 0.05);
    g.fillRoundedRect(x + 4, y + 3, w - 8, h * 0.42, { tl: r - 3, tr: r - 3, bl: 4, br: 4 });
    g.lineStyle(2, this.enabled ? st.edge : shade(st.edge, -0.5), this.enabled ? 0.95 : 0.5);
    g.strokeRoundedRect(x, y, w, h, r);

    this.glow.clear();
    if (this.enabled && this.hovered) {
      this.glow.fillStyle(st.edge, 0.22);
      this.glow.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, r + 6);
    }
    const alpha = this.enabled ? 1 : 0.5;
    this.label.setAlpha(alpha);
    if (this.hint) this.hint.setAlpha(this.enabled ? 0.7 : 0.35);
    if (this.icon) this.icon.setAlpha(alpha);
  }

  setHover(on) {
    if (this.hovered === on) return;
    this.hovered = on && this.enabled;
    if (this.hovered) playSfx('hover', { gain: 0.6 });
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, y: this.baseY - (this.hovered ? 3 : 0), duration: 120, ease: 'Quad.easeOut' });
    this.draw();
  }

  setPressed(on) {
    this.pressed = on && this.enabled;
    this.scene.tweens.add({
      targets: this, scaleX: this.pressed ? 1.04 : 1, scaleY: this.pressed ? 0.92 : 1, duration: this.pressed ? 60 : 140,
      ease: this.pressed ? 'Quad.easeOut' : 'Back.easeOut',
    });
  }

  /** Programmatic click (hotkeys use this): squash + click if enabled. */
  press() {
    if (!this.enabled) return false;
    this.scene.tweens.add({ targets: this, scaleX: 1.04, scaleY: 0.92, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
    this.fire();
    return true;
  }

  fire() {
    if (!this.enabled) return;
    if (this.o.sfx !== null) playSfx(this.o.sfx || 'click');
    this.onClick?.(this);
  }

  setEnabled(on) {
    on = !!on;
    if (this.enabled === on) return this;
    this.enabled = on;
    if (!on) { this.hovered = false; this.pressed = false; this.setScale(1); }
    this.zone.input.cursor = on ? 'pointer' : 'default';
    this.draw();
    return this;
  }

  setLabel(str) {
    this.label.setText(str);
    if (this.icon) this.icon.x = this.label.x - this.label.width / 2 - this.icon.displayWidth * 0.6;
    return this;
  }

  setHint(str) {
    if (this.hint) this.hint.setText(str);
    return this;
  }

  setStyle(name) {
    this.styleName = name;
    this.label.setColor(`#${this.style().text.toString(16).padStart(6, '0')}`);
    this.draw();
    return this;
  }

  /** Move the button (keeps the hover lift baseline right). */
  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    return this;
  }

  cleanup() {
    for (const [ev, fn] of this.keyHandlers) this.scene?.input?.keyboard?.off(ev, fn);
    this.keyHandlers = [];
  }
}
