import { UI, COLORS } from '../core/Constants.js';
import { textStyle } from './Button.js';

// Round bottom-bar button for one of Soba's abilities (44 px across): an icon
// (a Soba frame), the key letter, and a ring that fills while it recharges
// (Bark cooldown) or charges (Zoomies meter). Gold and pulsing when ready.
// Hit area is a top-left Zone (see Button.js) so the click never reaches the
// scene's own pointerdown.

const START = -Math.PI / 2;

export class AbilityButton {
  constructor(scene, x, y, { texture, frame, keyLetter, onClick }) {
    const r = UI.ABILITY_R;
    this.container = scene.add.container(x, y);
    this.bg = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.icon = scene.add.image(0, 0, texture, frame).setScale(UI.ABILITY_ICON_SCALE);
    this.key = scene.add.text(UI.ABILITY_KEY_DX, UI.ABILITY_KEY_DY, keyLetter, textStyle(UI.SMALL_SIZE, COLORS.TEXT, { strokeThickness: 3 })).setOrigin(0.5);
    this.count = scene.add.text(0, 0, '', textStyle(UI.BODY_SIZE, COLORS.TEXT, { strokeThickness: 3 })).setOrigin(0.5);
    this.hit = scene.add.zone(-r, -r, r * 2, r * 2).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      onClick();
    });
    this.container.add([this.bg, this.icon, this.ring, this.count, this.key, this.hit]);
    this.bg.fillStyle(COLORS.ABILITY_BG, 1).fillCircle(0, 0, r);
    this.bg.lineStyle(2, COLORS.OUTLINE, 1).strokeCircle(0, 0, r);
    this.last = '';
  }

  /** frac 0..1 (1 = ready), label: text over the icon while not ready ('' none). */
  update(frac, ready, label, time) {
    const pulse = ready ? Math.floor(time * UI.ABILITY_PULSE_HZ * 2) % 2 : 0;
    const sig = `${Math.round(frac * 60)}|${ready}|${label}|${pulse}`;
    if (sig === this.last) return;
    this.last = sig;
    const r = UI.ABILITY_R - UI.ABILITY_RING_W / 2;
    const g = this.ring;
    g.clear();
    g.lineStyle(UI.ABILITY_RING_W, COLORS.ABILITY_RING_BG, 1).strokeCircle(0, 0, r);
    if (frac > 0) {
      g.lineStyle(UI.ABILITY_RING_W, ready ? COLORS.ABILITY_READY : COLORS.ABILITY_CHARGING, ready && pulse ? 0.6 : 1);
      g.beginPath();
      g.arc(0, 0, r, START, START + Math.PI * 2 * Math.min(1, frac), false);
      g.strokePath();
    }
    this.icon.setAlpha(ready ? 1 : UI.ABILITY_DIM_ALPHA);
    this.count.setText(label);
  }
}
