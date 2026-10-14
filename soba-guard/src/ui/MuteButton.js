import { COLORS } from '../core/Constants.js';
import { META_COLORS, MENU } from '../core/MetaConstants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { AUDIO } from '../audio/AudioConstants.js';
import { audioManager } from '../audio/AudioManager.js';

// Speaker button (no label). Sound on: a button-red face with a speaker and
// two sound waves. Muted: a dimmed face, the speaker and a cream X.
// Hover or focus: lighter face + the menu focus ring. Clicking/tapping toggles
// mute (AUDIO_TOGGLE_MUTE) and stops the pointer event, so the scene's own
// pointerdown (placing a unit, "tap to resume") never sees it.
//
//   new MuteButton(scene, x, y, { size, depth })   (x, y) = top-left corner

export class MuteButton {
  constructor(scene, x, y, { size = AUDIO.MUTE_BTN_HUD.SIZE, depth = 0 } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.size = size;
    this.hovered = false;
    this.focused = false;

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.hit = scene.add.zone(x, y, size, size)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    this.hit.name = 'mute-button';

    this.hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    });
    this.hit.on('pointerover', () => { this.hovered = true; this.draw(); });
    this.hit.on('pointerout', () => { this.hovered = false; this.draw(); });

    this.onChanged = () => this.draw();
    eventBus.on(Events.AUDIO_MUTE_CHANGED, this.onChanged);
    scene.events.once('shutdown', () => this.destroy());
    this.draw();
  }

  setFocused(on) {
    this.focused = !!on;
    this.draw();
    return this;
  }

  /** Screen rect (tests click its centre). */
  getBounds2() {
    return { x: this.x, y: this.y, w: this.size, h: this.size };
  }

  draw() {
    const g = this.gfx;
    const { x, y, size: S } = this;
    const muted = audioManager.muted;
    const hot = this.hovered || this.focused;
    g.clear();

    const face = muted ? (hot ? META_COLORS.BTN_DIM_HOVER : META_COLORS.BTN_DIM) : (hot ? COLORS.BTN_HOVER : COLORS.BTN);
    g.fillStyle(face, 1);
    g.fillRoundedRect(x, y, S, S, MENU.BTN_RADIUS);
    g.lineStyle(2, COLORS.OUTLINE, 1);
    g.strokeRoundedRect(x, y, S, S, MENU.BTN_RADIUS);
    if (hot) {
      const p = MENU.FOCUS_PAD;
      g.lineStyle(MENU.FOCUS_WIDTH, META_COLORS.FOCUS, 1);
      g.strokeRoundedRect(x - p, y - p, S + p * 2, S + p * 2, MENU.BTN_RADIUS + p);
    }

    // 14x14 pixel icon, centred
    const ox = x + Math.floor((S - AUDIO.MUTE_GRID) / 2);
    const oy = y + Math.floor((S - AUDIO.MUTE_GRID) / 2);
    const px = (cx, cy, w = 1, h = 1) => g.fillRect(ox + cx, oy + cy, w, h);
    // dark drop shadow, then the speaker
    g.fillStyle(COLORS.OUTLINE, 0.6);
    px(2, 6, 3, 4);
    g.fillTriangle(ox + 4, oy + 8, ox + 8, oy + 3, ox + 8, oy + 13);
    g.fillStyle(muted ? 0xd8ccc0 : 0xfff6e0, 1);
    px(1, 5, 3, 4);
    g.fillTriangle(ox + 3, oy + 7, ox + 7, oy + 2, ox + 7, oy + 12);

    if (muted) {
      g.fillStyle(META_COLORS.FOCUS, 1);
      for (let i = 0; i < 5; i++) {
        px(8 + i, 5 + i, 1, 1);
        px(12 - i, 5 + i, 1, 1);
      }
    } else {
      g.fillStyle(0xfff6e0, 1);
      px(9, 5, 1, 4);
      px(11, 3, 1, 8);
    }
  }

  destroy() {
    eventBus.off(Events.AUDIO_MUTE_CHANGED, this.onChanged);
  }
}
