import { AUDIO, COLORS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

// Speaker icon drawn with Graphics. Sound on: cone + two sound waves.
// Muted: cone + red X. Clicking/tapping toggles mute and stops the pointer
// event so it never reaches the scene (no jump, no "tap to start").

export class MuteButton {
  /** (x, y) is the top-left corner of the button. */
  constructor(scene, x, y, depth = 0) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    const S = AUDIO.MUTE_BTN_SIZE;

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    // Padded hit area so it's easy to tap on a phone
    const pad = 4;
    this.hit = scene.add.zone(x - pad, y - pad, S + pad * 2, S + pad * 2)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    this.hovered = false;
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

  draw() {
    const g = this.gfx;
    const { x, y } = this;
    const S = AUDIO.MUTE_BTN_SIZE;
    const muted = !!gameState.isMuted;
    g.clear();

    g.fillStyle(COLORS.HUD_PANEL, this.hovered ? 0.6 : 0.4);
    g.fillRect(x, y, S, S);

    const ink = muted ? 0xc8b8d8 : 0xffffff;
    // speaker body + cone (pixel-aligned)
    g.fillStyle(ink, 1);
    g.fillRect(x + 2, y + 5, 3, 4);
    g.fillTriangle(x + 4, y + 7, x + 8, y + 2, x + 8, y + 12);

    if (muted) {
      // pixel-drawn 5x5 X
      g.fillStyle(0xff5a4a, 1);
      for (let i = 0; i < 5; i++) {
        g.fillRect(x + 9 + i, y + 5 + i, 1, 1);
        g.fillRect(x + 13 - i, y + 5 + i, 1, 1);
      }
    } else {
      g.fillRect(x + 10, y + 5, 1, 4);
      g.fillRect(x + 12, y + 3, 1, 8);
    }
  }

  destroy() {
    eventBus.off(Events.AUDIO_MUTE_CHANGED, this.onChanged);
  }
}
