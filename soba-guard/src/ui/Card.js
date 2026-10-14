import { UI, COLORS, FX, FX_COLORS } from '../core/Constants.js';
import { textStyle } from './Button.js';

// One unit card in the top bar (44x52): unit icon, cost, hotkey, a dark
// recharge sweep that shrinks from the top, and a dim layer when unaffordable
// (the cost turns red). Feel (Step 3a): the selected card lifts and its gold
// outline pulses; a card that finishes recharging flashes white and hops.

export class Card {
  constructor(scene, x, y, key, cost, index, onClick) {
    this.key = key;
    this.selected = null;
    this.costValue = cost;
    const W = UI.CARD_W;
    const H = UI.CARD_H;
    this.container = scene.add.container(x, y);
    this.bg = scene.add.graphics();
    this.glow = scene.add.graphics();
    this.icon = scene.add.image(W / 2, H / 2 - 4, key, 0).setOrigin(0.5);
    this.cost = scene.add.text(W / 2, H - UI.CARD_COST_DY, String(cost), textStyle(UI.SMALL_SIZE, COLORS.TEXT_GOLD, { strokeThickness: 2 })).setOrigin(0.5);
    this.hotkey = scene.add.text(3, 1, String(index + 1), textStyle(UI.SMALL_SIZE - 2, COLORS.TEXT, { strokeThickness: 2 }));
    this.dim = scene.add.rectangle(0, 0, W, H, COLORS.CARD_DIM, COLORS.CARD_DIM_ALPHA).setOrigin(0, 0);
    this.sweep = scene.add.rectangle(0, 0, W, H, COLORS.CARD_DIM, COLORS.CARD_RECHARGE_ALPHA).setOrigin(0, 0);
    this.flash = scene.add.rectangle(0, 0, W, H, FX_COLORS.CARD_READY, 1).setOrigin(0, 0).setAlpha(0);
    this.hit = scene.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      onClick(this.key);
    });
    this.container.add([this.glow, this.bg, this.icon, this.cost, this.hotkey, this.dim, this.sweep, this.flash, this.hit]);
    this.time = 0;
    this.prevFrac = 0;
    this.flashT = 0;
    this.poor = null;
    this.setSelected(false);
  }

  setSelected(on) {
    if (this.selected === on) return;
    this.selected = on;
    const W = UI.CARD_W;
    const H = UI.CARD_H;
    this.bg.clear();
    this.bg.fillStyle(on ? COLORS.CARD_BG_SELECTED : COLORS.CARD_BG, 1);
    this.bg.fillRoundedRect(0, 0, W, H, 4);
    this.bg.lineStyle(on ? 3 : 2, on ? 0xffffff : COLORS.OUTLINE, 1);
    this.bg.strokeRoundedRect(0, 0, W, H, 4);
    this.glow.clear();
    if (on) this.glow.lineStyle(2, FX_COLORS.CARD_SELECTED_GLOW, 1).strokeRoundedRect(-2, -2, W + 4, H + 4, 5);
  }

  /** card: the sim card { cost, recharge, rechargeLeft }, coins: current coins, dt: frame seconds. */
  update(card, coins, dt = 0) {
    this.time += dt;
    const frac = card.recharge > 0 ? card.rechargeLeft / card.recharge : 0;
    if (this.prevFrac > 0 && frac <= 0) this.flashT = FX.CARD_READY_FLASH_S;
    this.prevFrac = frac;
    this.sweep.setVisible(frac > 0);
    this.sweep.setScale(1, Math.ceil(UI.CARD_H * frac) / UI.CARD_H);
    const poor = coins < card.cost;
    this.dim.setVisible(frac <= 0 && poor);
    if (poor !== this.poor) {
      this.poor = poor;
      this.cost.setColor(poor ? FX_COLORS.COST_BAD : COLORS.TEXT_GOLD);
    }

    let lift = this.selected ? FX.CARD_LIFT : 0;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / FX.CARD_READY_FLASH_S;
      this.flash.setAlpha(FX.CARD_READY_ALPHA * k * k);
      lift += Math.round(Math.sin((1 - k) * Math.PI) * FX.CARD_LIFT);
    } else if (this.flash.alpha) this.flash.setAlpha(0);
    this.container.y = UI.CARD_Y - Math.min(lift, UI.CARD_Y);
    if (this.selected) this.glow.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(this.time * FX.CARD_PULSE_HZ * Math.PI)));
  }

  destroy() {
    this.container.destroy();
  }
}
