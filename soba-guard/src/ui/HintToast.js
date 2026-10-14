import { UI, COLORS, GAME, DEPTH, FX } from '../core/Constants.js';
import { textStyle } from './Button.js';

// Non-blocking teaching hints: a dark strip under the top bar. Hints queue up
// (one at a time, UI.HINT_S each) and never take input.

export class HintToast {
  constructor(scene) {
    this.scene = scene;
    this.queue = [];
    this.left = 0;
    this.gap = 0;
    this.shown = [];
    this.bg = scene.add.graphics().setDepth(DEPTH.OVERLAY);
    this.text = scene.add.text(GAME.WIDTH / 2, UI.HINT_Y, '', textStyle(UI.SMALL_SIZE + 1, COLORS.TEXT, {
      strokeThickness: 2, align: 'center', wordWrap: { width: UI.HINT_W - UI.HINT_PAD * 2 },
    })).setOrigin(0.5).setDepth(DEPTH.OVERLAY);
    this.hide();
  }

  push(id, text) {
    this.queue.push({ id, text });
  }

  hide() {
    this.bg.setVisible(false);
    this.text.setVisible(false);
  }

  show({ id, text }) {
    this.shown.push(id);
    this.text.setText(text).setVisible(true);
    const w = Math.min(UI.HINT_W, this.text.width + UI.HINT_PAD * 2);
    const h = this.text.height + UI.HINT_PAD;
    const x = GAME.WIDTH / 2 - w / 2;
    const y = UI.HINT_Y - h / 2;
    this.bg.clear();
    this.bg.fillStyle(COLORS.HINT_BG, COLORS.HINT_BG_ALPHA).fillRoundedRect(x, y, w, h, 4);
    this.bg.lineStyle(1, COLORS.HINT_EDGE, 1).strokeRoundedRect(x, y, w, h, 4);
    this.bg.setVisible(true);
    this.left = UI.HINT_S;
    this.setAlpha(0);
  }

  setAlpha(a) {
    this.bg.setAlpha(a);
    this.text.setAlpha(a);
  }

  get current() {
    return this.left > 0 ? this.shown[this.shown.length - 1] : null;
  }

  update(dt) {
    if (this.left > 0) {
      this.left -= dt;
      // fades in and out instead of popping
      const age = UI.HINT_S - this.left;
      this.setAlpha(Math.max(0, Math.min(1, age / FX.HINT_FADE_S, this.left / FX.HINT_FADE_S)));
      if (this.left <= 0) {
        this.hide();
        this.gap = UI.HINT_GAP_S;
      }
      return;
    }
    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    if (this.queue.length) this.show(this.queue.shift());
  }
}
