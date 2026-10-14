// =============================================================================
// Menu kit — the shared look and input for every menu screen.
//
//   menuText()      cream pixel text with a dark outline (min 8 px)
//   drawFrame()     wood-frame panel: 1 px outline, 3 px wood, dark inset
//   addPanel()      a Graphics with drawFrame() on it
//   Tile            a focusable card (Container + Graphics + Zone) with a custom
//                   draw(), hover/focus bounce, shake + red flash
//   MenuNav         spatial focus navigation over Buttons / Tiles (arrows/WASD
//                   move to the nearest item in that direction, wrapping)
//   bindMenuKeys()  arrows/WASD + Enter/Space + Esc with a held-key guard
// =============================================================================

import { UI, MENU } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export function textStyle(size = UI.BODY_SIZE, color = MENU.TEXT, { bold = true, stroke = 3, align = 'left', wrap = 0 } = {}) {
  const s = {
    fontFamily: UI.FONT,
    fontSize: `${Math.max(UI.SMALL_SIZE, size)}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color,
    align,
  };
  if (stroke) {
    s.stroke = '#1a1208';
    s.strokeThickness = stroke;
  }
  if (wrap) s.wordWrap = { width: wrap };
  return s;
}

export function menuText(scene, x, y, str, { size, color, origin = [0, 0], ...opts } = {}) {
  const t = scene.add.text(Math.round(x), Math.round(y), str, textStyle(size, color, opts));
  return Array.isArray(origin) ? t.setOrigin(origin[0], origin[1]) : t.setOrigin(origin);
}

/**
 * Wood-frame panel. (x, y) = top-left of the outer frame.
 * opts: fill (inner color), alpha (inner alpha), frame (wood color), edge (outline color), thin (1 px frame)
 */
export function drawFrame(g, x, y, w, h, {
  fill = MENU.PANEL, alpha = MENU.PANEL_ALPHA, frame = MENU.WOOD, edge = MENU.OUTLINE, thin = false,
  light = MENU.WOOD_LIGHT, dark = MENU.WOOD_DARK,
} = {}) {
  const f = thin ? 1 : MENU.FRAME;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle(edge, 1);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(frame, 1);
  g.fillRect(x, y, w, h);
  if (!thin) {
    g.fillStyle(light, 1);
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillStyle(dark, 1);
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x + w - 1, y, 1, h);
  }
  g.fillStyle(edge, 1);
  g.fillRect(x + f - 1, y + f - 1, w - 2 * f + 2, h - 2 * f + 2);
  g.fillStyle(fill, alpha);
  g.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
}

export function addPanel(scene, x, y, w, h, opts) {
  const g = scene.add.graphics();
  drawFrame(g, x, y, w, h, opts);
  return g;
}

/** Full-screen background: an image (title / arena) with a dark wash. */
export function addBackdrop(scene, key = 'title', alpha = MENU.DIM_ALPHA) {
  if (scene.textures.exists(key)) {
    const img = scene.add.image(0, 0, key).setOrigin(0, 0);
    if (key === 'arena') img.setPosition(-144, -121);
  }
  scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, MENU.DIM, alpha).setOrigin(0, 0);
}

/** Header ribbon: wood plank with a title. Returns the text. */
export function addHeader(scene, title, y = 16) {
  const w = Math.max(140, title.length * 11 + 36);
  const x = scene.scale.width / 2 - w / 2;
  addPanel(scene, x, y - 11, w, 22, { fill: MENU.WOOD, alpha: 1 });
  return menuText(scene, scene.scale.width / 2, y, title, { size: UI.HEADING_SIZE, color: MENU.TEXT_GOLD, origin: 0.5, stroke: 3 });
}

/** Little horizontal shake (wrong / locked). */
export function shake(scene, target, baseX = target.x) {
  scene.tweens.killTweensOf(target);
  target.x = baseX;
  return scene.tweens.add({
    targets: target,
    x: { from: baseX - 3, to: baseX + 3 },
    duration: MENU.SHAKE_MS / 6,
    yoyo: true,
    repeat: 2,
    onComplete: () => { target.x = baseX; },
  });
}

/** Small "hop" when something gets focus. */
export function bounce(scene, target, baseY) {
  scene.tweens.killTweensOf(target);
  target.y = baseY;
  return scene.tweens.add({
    targets: target,
    y: baseY - MENU.BOUNCE_PX,
    duration: MENU.BOUNCE_MS,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => { target.y = baseY; },
  });
}

// ---------------------------------------------------------------------------
// Tile — a focusable card. draw(g, state, w, h) draws centered on (0, 0).
// state: { focused, hovered, selected, enabled, flash }
// ---------------------------------------------------------------------------

export class Tile {
  constructor(scene, x, y, w, h, { draw, onClick, children = [], label = '' } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.drawFn = draw || defaultTileDraw;
    this.onClick = onClick;
    this.onHover = null;
    this.state = { focused: false, hovered: false, selected: false, enabled: true, flash: 0 };

    this.bg = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.bg, ...children]);
    this.zone = scene.add.zone(x, y, w, Math.max(MENU.BTN_H, h)).setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => {
      this.state.hovered = true;
      this.onHover?.();
      this.draw();
    });
    this.zone.on('pointerout', () => { this.state.hovered = false; this.draw(); });
    this.zone.on('pointerdown', (_p, _x, _y, ev) => {
      ev?.stopPropagation?.();
      this.onHover?.();
      this.activate('pointer');
    });
    this.draw();
  }

  add(child) {
    this.container.add(child);
    return child;
  }

  setFocused(f, animate = true) {
    const was = this.state.focused;
    this.state.focused = !!f;
    this.draw();
    if (f && !was && animate) bounce(this.scene, this.container, this.y);
    return this;
  }

  setSelected(s) {
    this.state.selected = !!s;
    this.draw();
    return this;
  }

  setEnabled(e) {
    this.state.enabled = !!e;
    this.draw();
    return this;
  }

  /** via: 'key' (Enter/Space) or 'pointer' (click/tap). */
  activate(via = 'key') {
    this.onClick?.(this, via);
  }

  /** Shake + red flash (can't afford / locked). */
  deny() {
    shake(this.scene, this.container, this.x);
    this.state.flash = 1;
    this.draw();
    this.scene.time.delayedCall(MENU.SHAKE_MS, () => {
      this.state.flash = 0;
      if (this.bg.active) this.draw();
    });
  }

  draw() {
    this.bg.clear();
    this.drawFn(this.bg, this.state, this.w, this.h);
  }

  destroy() {
    this.container.destroy();
    this.zone.destroy();
  }
}

/** Card look: wood frame; focus = gold frame; selected = green inner line; flash = red. */
export function defaultTileDraw(g, s, w, h) {
  const hot = s.focused || s.hovered;
  let frame = MENU.WOOD;
  if (s.flash) frame = MENU.DANGER;
  else if (s.focused) frame = MENU.FOCUS;
  else if (s.hovered) frame = MENU.WOOD_LIGHT;
  const fill = s.enabled ? (hot ? 0x3a2614 : MENU.PANEL) : 0x221a14;
  drawFrame(g, -w / 2, -h / 2, w, h, {
    frame, fill, alpha: 0.96,
    light: s.focused ? 0xfff0a0 : MENU.WOOD_LIGHT,
    dark: s.focused ? 0xb08a20 : MENU.WOOD_DARK,
  });
  if (s.selected) {
    g.lineStyle(1, MENU.SELECT, 1);
    g.strokeRect(-w / 2 + MENU.FRAME + 1.5, -h / 2 + MENU.FRAME + 1.5, w - 2 * MENU.FRAME - 3, h - 2 * MENU.FRAME - 3);
  }
}

// ---------------------------------------------------------------------------
// MenuNav — spatial focus over items with { x, y, setFocused(f, animate), activate(), onHover }
// ---------------------------------------------------------------------------

export class MenuNav {
  constructor(items = [], { onMove = () => eventBus.emit(Events.MENU_MOVE), start = 0, onFocus = null } = {}) {
    this.items = [];
    this.index = -1;
    this.onMove = onMove;
    this.onFocus = onFocus;
    items.forEach(it => this.add(it));
    if (this.items.length) this.focus(start, false, false);
  }

  add(item) {
    this.items.push(item);
    item.onHover = () => {
      const i = this.items.indexOf(item);
      if (i !== this.index && i >= 0) this.focus(i, true, true, 'pointer');
    };
    return item;
  }

  get current() {
    return this.items[this.index] || null;
  }

  /** source: 'key' (arrows / initial) or 'pointer' (hover / tap) — passed to onFocus. */
  focus(i, sound = true, animate = true, source = 'key') {
    const n = this.items.length;
    if (!n) return;
    const prev = this.index;
    this.index = ((i % n) + n) % n;
    this.items.forEach((b, k) => b.setFocused(k === this.index, animate));
    if (prev !== this.index) {
      if (sound) this.onMove?.();
      this.onFocus?.(this.current, this.index, source);
    }
  }

  focusItem(item, sound = false) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.focus(i, sound);
  }

  /** Moves to the nearest item in direction (dx, dy); wraps to the far side. */
  move(dx, dy) {
    const cur = this.current;
    if (!cur) return;
    const visible = this.items.filter(it => it.visible !== false);
    let best = null;
    let bestScore = Infinity;
    for (const it of visible) {
      if (it === cur) continue;
      const ax = it.x - cur.x;
      const ay = it.y - cur.y;
      const along = ax * dx + ay * dy;
      const across = Math.abs(ax * dy - ay * dx);
      if (along <= 2) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (!best) {
      // wrap: farthest item the other way, closest in the cross axis
      for (const it of visible) {
        if (it === cur) continue;
        const ax = it.x - cur.x;
        const ay = it.y - cur.y;
        const along = ax * dx + ay * dy;
        const across = Math.abs(ax * dy - ay * dx);
        if (along >= -2) continue;
        const score = along + across * 2.5; // most negative along wins
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best) this.focus(this.items.indexOf(best));
  }

  activate() {
    this.current?.activate?.();
  }
}

/**
 * Standard menu keys. Ignores key repeat and anything pressed within
 * MENU.INPUT_GUARD_MS of the scene opening (a held key from the last screen).
 * handlers: { confirm, back, extra: { KEYNAME: fn }, confirmKeys }; arrows/WASD drive nav.
 */
export function bindMenuKeys(scene, nav, {
  confirm, back, extra = {}, guardMs = MENU.INPUT_GUARD_MS, confirmKeys = ['ENTER', 'SPACE'],
} = {}) {
  const opened = scene.time.now;
  const kb = scene.input.keyboard;
  const on = (key, fn) => kb.on(`keydown-${key}`, (e) => {
    if (e?.repeat || scene.time.now - opened < guardMs || scene.menuLocked) return;
    fn(e);
  });
  const dirs = { UP: [0, -1], W: [0, -1], DOWN: [0, 1], S: [0, 1], LEFT: [-1, 0], A: [-1, 0], RIGHT: [1, 0], D: [1, 0] };
  for (const [k, [dx, dy]] of Object.entries(dirs)) on(k, () => nav?.move(dx, dy));
  const ok = confirm || (() => nav?.activate());
  for (const k of confirmKeys) on(k, ok);
  if (back) {
    on('ESC', back);
    on('BACKSPACE', back);
  }
  for (const [k, fn] of Object.entries(extra)) on(k, fn);
}

/** "12,345" */
export const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

/** 125.4 s -> "2:05" */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Golden bone icon (items sheet frame 11). */
export function boneIcon(scene, x, y, scale = 1) {
  return scene.add.image(Math.round(x), Math.round(y), 'items', 11).setScale(scale);
}
