import Phaser from 'phaser';
import { UI, COLORS } from '../core/Constants.js';
import { MENU, META_COLORS } from '../core/MetaConstants.js';
import { eventBus, Events } from '../core/EventBus.js';

// Container + Graphics + Text button with a Zone hit area (top-left based, so
// the hit rect matches what is drawn). Stops the pointer event so the scene's
// own pointerdown handler never sees the click.
//
// createButton(scene, x, y, w, h, label, onClick, opts) — (x, y) is the centre.
// opts: size, color, hover, font, textColor, icon { key, frame, scale, dx },
//       lip (dark strip under the face, default off for the battle HUD).
// The returned container also has (menus use these through MenuNav):
//   setFocused(bool), setDimmed(bool), setLabel(text), activate(), getBounds2()

export function textStyle(size, color = COLORS.TEXT, extra = {}) {
  return {
    fontFamily: UI.FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: COLORS.TEXT_STROKE,
    strokeThickness: 3,
    ...extra,
  };
}

function lighten(c) {
  return Phaser.Display.Color.IntegerToColor(c).lighten(MENU.BTN_SHINE).color;
}

export function createButton(scene, x, y, w, h, label, onClick, opts = {}) {
  let color = opts.color ?? COLORS.BTN;
  let hover = opts.hover ?? COLORS.BTN_HOVER;
  const baseColor = color;
  const baseHover = hover;
  const lip = opts.lip ? MENU.BTN_LIP : 0;
  const radius = opts.radius ?? UI.BTN_RADIUS;
  const state = { hovered: false, focused: false, dimmed: false };

  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const draw = () => {
    const c = state.hovered || state.focused ? hover : color;
    bg.clear();
    if (lip) {
      bg.fillStyle(META_COLORS.BTN_LIP, 1);
      bg.fillRoundedRect(-w / 2, -h / 2 + lip, w, h, radius);
    }
    bg.fillStyle(c, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h - lip, radius);
    if (lip) {
      bg.fillStyle(lighten(c), 1);
      bg.fillRect(-w / 2 + radius, -h / 2 + 2, w - radius * 2, 2);
    }
    bg.lineStyle(2, COLORS.OUTLINE, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
    if (state.focused) {
      const p = MENU.FOCUS_PAD;
      bg.lineStyle(MENU.FOCUS_WIDTH, META_COLORS.FOCUS, 1);
      bg.strokeRoundedRect(-w / 2 - p, -h / 2 - p, w + p * 2, h + p * 2, radius + p);
    }
  };
  draw();

  const items = [bg];
  let icon = null;
  if (opts.icon) {
    icon = scene.add.image(opts.icon.dx ?? 0, -lip / 2, opts.icon.key, opts.icon.frame ?? 0).setScale(opts.icon.scale ?? 1);
    items.push(icon);
  }
  const style = textStyle(opts.size ?? UI.BODY_SIZE, opts.textColor ?? COLORS.TEXT);
  if (opts.font) style.fontFamily = opts.font;
  const txt = scene.add.text(opts.labelDx ?? 0, -lip / 2, label, style).setOrigin(0.5);
  items.push(txt);
  const hit = scene.add.zone(-w / 2, -h / 2, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  items.push(hit);
  container.add(items);

  const press = () => {
    scene.tweens.add({
      targets: container,
      scale: MENU.BTN_PRESS_SCALE,
      duration: MENU.BTN_PRESS_MS,
      yoyo: true,
      onComplete: () => container.setScale(1),
    });
    eventBus.emit(Events.UI_PRESS, { label: txt.text }); // Step 3b: confirm / back sound
    onClick();
  };

  hit.on('pointerover', () => { state.hovered = true; draw(); container.emit('hover'); });
  hit.on('pointerout', () => { state.hovered = false; draw(); });
  hit.on('pointerdown', (_p, _x, _y, event) => {
    event?.stopPropagation?.();
    press();
  });

  container.label = txt;
  container.hit = hit;
  container.icon = icon;
  container.activate = press;
  container.setFocused = (on) => {
    if (state.focused === !!on) return container;
    state.focused = !!on;
    draw();
    return container;
  };
  container.setDimmed = (on) => {
    state.dimmed = !!on;
    color = on ? (opts.dimColor ?? META_COLORS.BTN_DIM) : baseColor;
    hover = on ? (opts.dimHover ?? META_COLORS.BTN_DIM_HOVER) : baseHover;
    txt.setAlpha(on ? 0.7 : 1);
    draw();
    return container;
  };
  container.setLabel = (s) => {
    txt.setText(s);
    return container;
  };
  /** Screen-space rect of the button face (no container scale). */
  container.getBounds2 = () => ({ x: container.x - w / 2, y: container.y - h / 2, w, h });
  return container;
}
