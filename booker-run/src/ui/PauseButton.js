import { AUDIO, COLORS } from '../core/Constants.js';

// HUD pause button (two bars), next to the mute button: the only way to open the
// pause menu on a touch screen. Same size and hit padding as MuteButton. Its
// pointerdown stops propagation, so the tap never reaches the scene (no jump).
// While the pause menu is up it covers the HUD, and a tap here lands outside
// its panel, which resumes.

export class PauseButton {
  /** (x, y) is the top-left corner of the button; onPress opens the pause menu. */
  constructor(scene, x, y, depth, onPress) {
    this.x = x;
    this.y = y;
    const S = AUDIO.MUTE_BTN_SIZE;
    const pad = 4;

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.hit = scene.add.zone(x - pad, y - pad, S + pad * 2, S + pad * 2)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    this.hovered = false;
    this.hit.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      onPress();
    });
    this.hit.on('pointerover', () => { this.hovered = true; this.draw(); });
    this.hit.on('pointerout', () => { this.hovered = false; this.draw(); });
    this.draw();
  }

  draw() {
    const g = this.gfx;
    const { x, y } = this;
    const S = AUDIO.MUTE_BTN_SIZE;
    g.clear();
    g.fillStyle(COLORS.HUD_PANEL, this.hovered ? 0.6 : 0.4);
    g.fillRect(x, y, S, S);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + 4, y + 3, 2, 8);
    g.fillRect(x + 8, y + 3, 2, 8);
  }
}
