// Touch (and mouse-drag) controls: a floating virtual joystick that appears
// where a finger lands on the left part of the screen, and a Dash button at
// the bottom right. A second finger tapping anywhere else also dashes.
// Output: vector() -> { x, y } (length <= 1) and consumeDash() -> boolean.

import { GAME, TOUCH, DEPTH, COLORS } from '../core/Constants.js';

export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.joyId = null;
    this.baseX = 0;
    this.baseY = 0;
    this.vec = { x: 0, y: 0 };
    this.dashIds = new Set();
    this.dashTap = false;
    this.touchSeen = false;

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.TOUCH);

    this.onDown = (p, over) => {
      if (over && over.length) return;          // a button / mute got it
      if (p.wasTouch) this.touchSeen = true;
      const dx = p.x - TOUCH.DASH_X;
      const dy = p.y - TOUCH.DASH_Y;
      if (this.touchSeen && dx * dx + dy * dy <= (TOUCH.DASH_R + 6) ** 2) {
        this.dashIds.add(p.id);
        this.dashTap = true;
        return;
      }
      if (this.joyId === null && p.x < GAME.WIDTH * TOUCH.JOY_ZONE_FRAC) {
        this.joyId = p.id;
        this.baseX = p.x;
        this.baseY = p.y;
        this.vec.x = 0;
        this.vec.y = 0;
        return;
      }
      // Second finger tap elsewhere = dash
      if (this.joyId !== null && p.id !== this.joyId) this.dashTap = true;
    };
    this.onMove = (p) => {
      if (p.id !== this.joyId || !p.isDown) return;
      let dx = p.x - this.baseX;
      let dy = p.y - this.baseY;
      const d = Math.hypot(dx, dy);
      const R = TOUCH.JOY_RADIUS;
      if (d > R) {
        // Drag past the rim: the base follows the finger
        this.baseX = p.x - (dx / d) * R;
        this.baseY = p.y - (dy / d) * R;
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      const m = Math.min(1, d / R);
      if (m < TOUCH.JOY_DEADZONE) {
        this.vec.x = 0;
        this.vec.y = 0;
      } else {
        this.vec.x = dx / R;
        this.vec.y = dy / R;
      }
    };
    this.onUp = (p) => {
      if (p.id === this.joyId) {
        this.joyId = null;
        this.vec.x = 0;
        this.vec.y = 0;
      }
      this.dashIds.delete(p.id);
    };
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);
    scene.events.once('shutdown', () => this.destroy());
  }

  vector() {
    return this.vec;
  }

  consumeDash() {
    const d = this.dashTap || this.dashIds.size > 0;
    this.dashTap = false;
    return d;
  }

  draw(dashReady = 1) {
    const g = this.gfx;
    g.clear();
    if (this.joyId !== null) {
      const p = this.scene.input.manager.pointers.find(q => q.id === this.joyId);
      g.lineStyle(2, COLORS.JOYSTICK, 0.35);
      g.strokeCircle(this.baseX, this.baseY, TOUCH.JOY_RADIUS);
      const kx = this.baseX + this.vec.x * TOUCH.JOY_RADIUS;
      const ky = this.baseY + this.vec.y * TOUCH.JOY_RADIUS;
      g.fillStyle(COLORS.JOYSTICK, p ? 0.45 : 0.3);
      g.fillCircle(kx, ky, 9);
    }
    if (this.touchSeen) {
      g.fillStyle(0x000000, 0.3);
      g.fillCircle(TOUCH.DASH_X, TOUCH.DASH_Y, TOUCH.DASH_R);
      g.lineStyle(2, COLORS.DASH, dashReady >= 1 ? 0.9 : 0.35);
      g.strokeCircle(TOUCH.DASH_X, TOUCH.DASH_Y, TOUCH.DASH_R);
      if (dashReady < 1) {
        g.lineStyle(2, COLORS.DASH, 0.9);
        g.beginPath();
        g.arc(TOUCH.DASH_X, TOUCH.DASH_Y, TOUCH.DASH_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashReady);
        g.strokePath();
      }
    }
  }

  destroy() {
    const i = this.scene.input;
    i.off('pointerdown', this.onDown);
    i.off('pointermove', this.onMove);
    i.off('pointerup', this.onUp);
    i.off('pointerupoutside', this.onUp);
  }
}
