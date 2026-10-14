import { UI, COLORS } from '../core/Constants.js';
import { textStyle } from './Button.js';

// Top-bar tool (Upgrade / Recall), card-sized (44x52): an icon, the hotkey,
// and a caption. Highlighted in the tool colour while the tool is active.

export class ToolButton {
  constructor(scene, x, { texture, frame, keyLetter, caption, color, onClick }) {
    this.color = color;
    this.active = null;
    this.container = scene.add.container(x, UI.TOOL_Y);
    this.bg = scene.add.graphics();
    const W = UI.TOOL_W;
    const H = UI.TOOL_H;
    this.icon = scene.add.image(W / 2, H / 2 - 5, texture, frame).setScale(UI.TOOL_ICON_SCALE);
    this.caption = scene.add.text(W / 2, H - UI.TOOL_CAPTION_DY, caption, textStyle(UI.SMALL_SIZE - 2, COLORS.TEXT, { strokeThickness: 2 })).setOrigin(0.5);
    this.hotkey = scene.add.text(3, 1, keyLetter, textStyle(UI.SMALL_SIZE - 2, COLORS.TEXT, { strokeThickness: 2 }));
    this.hit = scene.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      onClick();
    });
    this.container.add([this.bg, this.icon, this.caption, this.hotkey, this.hit]);
    this.setActive(false);
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    const W = UI.TOOL_W;
    const H = UI.TOOL_H;
    this.bg.clear();
    this.bg.fillStyle(on ? this.color : COLORS.ABILITY_BG, 1).fillRoundedRect(0, 0, W, H, 4);
    this.bg.lineStyle(on ? 3 : 2, on ? 0xffffff : COLORS.OUTLINE, 1).strokeRoundedRect(0, 0, W, H, 4);
    this.container.y = UI.TOOL_Y + (on ? 1 : 0);
  }
}
