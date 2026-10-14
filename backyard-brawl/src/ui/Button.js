// Menu button: Container (Graphics wood plank + Text) for the visuals, a Zone
// on top for pointer input (at least MENU.BTN_H tall for touch). Keyboard focus
// is drawn with setFocused() (gold frame + a little hop). Works with MenuNav
// (src/ui/Menu.js): exposes x, y, activate(), onHover.

import { UI, MENU } from '../core/Constants.js';
import { drawFrame, bounce, shake, textStyle } from './Menu.js';

export class Button {
  constructor(scene, x, y, w, h, label, onClick, {
    fontSize = UI.BODY_SIZE + 2, depth = 0, scrollFactor = 0, icon = null, primary = false,
  } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.primary = primary;
    this.focused = false;
    this.hovered = false;
    this.enabled = true;
    this.flash = 0;
    this.onClick = onClick;
    this.onHover = null;

    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, label, textStyle(fontSize, MENU.TEXT, { stroke: 3 })).setOrigin(0.5);
    const parts = [this.bg, this.text];
    if (icon) {
      this.icon = scene.add.image(0, 0, icon.key, icon.frame).setScale(icon.scale || 1);
      parts.push(this.icon);
      const iw = this.icon.displayWidth;
      const total = iw + 3 + this.text.width;
      this.icon.setPosition(Math.round(-total / 2 + iw / 2), 0);
      this.text.setPosition(Math.round(-total / 2 + iw + 3 + this.text.width / 2), 0);
    }
    this.text.y = 0;
    this.container = scene.add.container(x, y, parts).setDepth(depth).setScrollFactor(scrollFactor);

    this.zone = scene.add.zone(x, y, w, Math.max(MENU.BTN_H, h)).setDepth(depth).setScrollFactor(scrollFactor)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => {
      this.hovered = true;
      this.onHover?.();
      this.draw();
    });
    this.zone.on('pointerout', () => { this.hovered = false; this.draw(); });
    this.zone.on('pointerdown', (_p, _x, _y, ev) => {
      ev?.stopPropagation?.();
      this.onHover?.();
      this.activate();
    });
    this.draw();
  }

  setFocused(f, animate = true) {
    const was = this.focused;
    this.focused = !!f;
    this.draw();
    if (this.focused && !was && animate) bounce(this.scene, this.container, this.y);
    return this;
  }

  setLabel(label) {
    this.label = label;
    this.text.setText(label);
    return this;
  }

  setEnabled(e) {
    this.enabled = !!e;
    this.text.setAlpha(e ? 1 : 0.45);
    this.draw();
    return this;
  }

  setVisible(v) {
    this.visible = !!v;
    this.container.setVisible(v);
    if (v) this.zone.setInteractive();
    else this.zone.disableInteractive();
    return this;
  }

  activate() {
    if (this.enabled) this.onClick?.(this);
    else this.deny();
  }

  deny() {
    shake(this.scene, this.container, this.x);
    this.flash = 1;
    this.draw();
    this.scene.time.delayedCall(MENU.SHAKE_MS, () => {
      this.flash = 0;
      if (this.bg.active) this.draw();
    });
  }

  draw() {
    const g = this.bg;
    const { w, h } = this;
    const hot = this.enabled && (this.hovered || this.focused);
    g.clear();
    let fill = this.primary ? 0x3d6b25 : MENU.WOOD;
    if (hot) fill = this.primary ? 0x56913a : MENU.WOOD_LIGHT;
    if (this.flash) fill = MENU.DANGER;
    drawFrame(g, -w / 2, -h / 2, w, h, {
      frame: this.focused ? MENU.FOCUS : MENU.WOOD_DARK,
      fill,
      alpha: 1,
      thin: true,
    });
    // bevel: light top line, dark bottom line
    g.fillStyle(0xffffff, hot ? 0.28 : 0.16);
    g.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 1);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-w / 2 + 1, h / 2 - 2, w - 2, 1);
    if (this.focused) {
      // gold ring just outside the dark edge, plus corner ticks
      g.lineStyle(1, MENU.FOCUS, 1);
      g.strokeRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
      g.fillStyle(MENU.FOCUS, 1);
      g.fillRect(-w / 2 - 3, -h / 2 - 3, 4, 1); g.fillRect(-w / 2 - 3, -h / 2 - 3, 1, 4);
      g.fillRect(w / 2 - 1, -h / 2 - 3, 4, 1); g.fillRect(w / 2 + 2, -h / 2 - 3, 1, 4);
      g.fillRect(-w / 2 - 3, h / 2 + 2, 4, 1); g.fillRect(-w / 2 - 3, h / 2 - 1, 1, 4);
      g.fillRect(w / 2 - 1, h / 2 + 2, 4, 1); g.fillRect(w / 2 + 2, h / 2 - 1, 1, 4);
    }
  }

  destroy() {
    this.container.destroy();
    this.zone.destroy();
  }
}

/** Step 1 helper: keyboard focus over a list of Buttons (prefer MenuNav). */
export class ButtonGroup {
  constructor(buttons, onMove = null) {
    this.buttons = buttons;
    this.index = 0;
    this.onMove = onMove;
    this.focus(0, false);
  }

  focus(i, sound = true) {
    const n = this.buttons.length;
    this.index = ((i % n) + n) % n;
    this.buttons.forEach((b, k) => b.setFocused(k === this.index, sound));
    if (sound) this.onMove?.();
  }

  next() { this.focus(this.index + 1); }

  prev() { this.focus(this.index - 1); }

  activate() {
    this.buttons[this.index]?.activate();
  }
}
