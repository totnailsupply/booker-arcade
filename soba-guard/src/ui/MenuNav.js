import Phaser from 'phaser';
import { MENU } from '../core/MetaConstants.js';
import { eventBus, Events } from '../core/EventBus.js';

// Keyboard focus for a menu screen (mouse and touch keep working on the items
// themselves). One item is always focused and drawn with a focus ring.
//
//   const nav = new MenuNav(scene, { onBack, keys: { KeyR: fn }, inputDelayMs });
//   nav.add('play', button);            // anything with getBounds2/activate/setFocused
//   nav.focus('play');
//
// Arrows / WASD move focus to the nearest item in that direction (sideways
// distance counts double); Enter / Space activate; Esc / Backspace call onBack.
// Hovering an item with the mouse focuses it, so mouse and keyboard agree.

const MOVES = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const ACTIVATE = new Set(['Enter', 'NumpadEnter', 'Space']);
const BACK = new Set(['Escape', 'Backspace']);

export class MenuNav {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.items = [];
    this.index = -1;
    this.onBack = opts.onBack || null;
    this.onFocus = opts.onFocus || null;
    this.keys = opts.keys || {};
    this.inputDelayMs = opts.inputDelayMs || 0;
    this.bornAt = scene.time.now;
    this.enabled = true;

    this.onKey = (event) => this.handleKey(event);
    scene.input.keyboard.on('keydown', this.onKey);
    scene.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /**
   * item: { getBounds2(), activate(), setFocused(bool), on?(event, fn) }
   * links: optional explicit neighbours { left, right, up, down } (item names)
   */
  add(name, item, links = null) {
    const entry = { name, item, links };
    this.items.push(entry);
    item.on?.('hover', () => this.focus(name));
    if (this.index < 0) this.focus(name);
    return item;
  }

  get focused() {
    return this.items[this.index] || null;
  }

  get focusedName() {
    return this.focused ? this.focused.name : null;
  }

  focus(nameOrIndex) {
    const i = typeof nameOrIndex === 'number' ? nameOrIndex : this.items.findIndex(e => e.name === nameOrIndex);
    if (i < 0 || i >= this.items.length) return;
    if (i === this.index) {
      this.items[i].item.setFocused(true);
      return;
    }
    if (this.index >= 0 && this.scene.time.now > this.bornAt) eventBus.emit(Events.UI_MENU_MOVE, { to: this.items[i].name }); // Step 3b sound
    this.focused?.item.setFocused(false);
    this.index = i;
    this.items[i].item.setFocused(true);
    this.onFocus?.(this.items[i].name);
  }

  move(dx, dy) {
    const cur = this.focused;
    if (!cur) return;
    const dir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
    if (cur.links && dir in cur.links) {
      if (cur.links[dir]) this.focus(cur.links[dir]);
      return;
    }
    const a = center(cur.item.getBounds2());
    let best = -1;
    let bestScore = Infinity;
    this.items.forEach((e, i) => {
      if (i === this.index) return;
      const b = center(e.item.getBounds2());
      const along = (b.x - a.x) * dx + (b.y - a.y) * dy;
      if (along <= 0) return;
      const perp = Math.abs((b.x - a.x) * dy) + Math.abs((b.y - a.y) * dx);
      const score = along + perp * MENU.NAV_PERP_WEIGHT;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) this.focus(best);
  }

  ready() {
    return this.enabled && this.scene.time.now - this.bornAt >= this.inputDelayMs;
  }

  handleKey(event) {
    if (!this.ready()) return;
    const code = event.code;
    const custom = this.keys[code];
    if (custom) {
      if (!event.repeat) custom(event);
      return;
    }
    const mv = MOVES[code];
    if (mv) {
      this.move(mv[0], mv[1]);
      return;
    }
    if (event.repeat) return;
    if (ACTIVATE.has(code)) this.focused?.item.activate();
    else if (BACK.has(code)) { eventBus.emit(Events.UI_MENU_BACK); this.onBack?.(); }
  }

  destroy() {
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.items = [];
  }
}

function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
