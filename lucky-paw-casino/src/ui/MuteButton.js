// =============================================================================
// MuteButton — square speaker button. Click/tap toggles mute (EventBus
// AUDIO_TOGGLE_MUTE; AudioBridge saves it). The M key does the same anywhere.
//   new MuteButton(scene, x, y, { size: 48, depth })   (x, y = centre)
// =============================================================================

import Phaser from 'phaser';
import { COLORS } from '../core/Constants.js';
import { eventBus, Events, listen } from '../core/EventBus.js';
import { settings } from '../core/Casino.js';
import { shade } from './theme.js';

export class MuteButton extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.size = o.size ?? 48;
    this.gfx = scene.add.graphics();
    this.add(this.gfx);
    this.zone = scene.add.zone(0, 0, this.size + 8, this.size + 8).setInteractive({ useHandCursor: true });
    this.add(this.zone);
    this.hovered = false;
    this.zone.on('pointerdown', () => eventBus.emit(Events.AUDIO_TOGGLE_MUTE));
    this.zone.on('pointerover', () => { this.hovered = true; this.draw(); });
    this.zone.on('pointerout', () => { this.hovered = false; this.draw(); });
    listen(this, Events.AUDIO_MUTE_CHANGED, () => this.draw());
    if (o.depth !== undefined) this.setDepth(o.depth);
    this.draw();
  }

  draw() {
    const g = this.gfx;
    const S = this.size;
    const h = S / 2;
    const muted = settings.muted;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-h + 1, -h + 4, S, S, 12);
    g.fillStyle(this.hovered ? shade(COLORS.PANEL_LIGHT, 0.15) : COLORS.PANEL_LIGHT, 1);
    g.fillRoundedRect(-h, -h, S, S, 12);
    g.lineStyle(2, COLORS.BRASS, 0.9);
    g.strokeRoundedRect(-h, -h, S, S, 12);
    const ink = muted ? 0x9a8a70 : COLORS.CREAM;
    const k = S / 48;
    g.fillStyle(ink, 1);
    g.fillRect(-14 * k, -6 * k, 8 * k, 12 * k);
    g.fillTriangle(-8 * k, -6 * k, 2 * k, -14 * k, 2 * k, 14 * k);
    g.fillTriangle(-8 * k, 6 * k, -8 * k, -6 * k, 2 * k, 14 * k);
    if (muted) {
      g.lineStyle(4 * k, COLORS.LOSE, 1);
      g.lineBetween(7 * k, -7 * k, 17 * k, 7 * k);
      g.lineBetween(17 * k, -7 * k, 7 * k, 7 * k);
    } else {
      g.lineStyle(3 * k, ink, 1);
      g.beginPath();
      g.arc(4 * k, 0, 8 * k, -0.9, 0.9);
      g.strokePath();
      g.beginPath();
      g.arc(4 * k, 0, 14 * k, -0.9, 0.9);
      g.strokePath();
    }
  }
}
