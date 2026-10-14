// =============================================================================
// Stake — the chip stack that sits beside one blackjack hand while it plays.
// Visual only: the wallet moves the money (wallet.bet for doubles/splits,
// BaseGameScene.settle for the payout). Mirrors BetSpot's chip animations.
//
//   const st = new Stake(scene, x, y, 10, { depth });
//   await st.addChips(10, from);      // double: a second stack slides in
//   await st.win(paid) | st.lose() | st.push()
// =============================================================================

import Phaser from 'phaser';
import { CHIPS, CHIP_MINI, COLORS, TIMING, chipBreakdown } from '../../core/Constants.js';
import { TOPBAR_POS } from '../../ui/TopBar.js';
import { text, fmt } from '../../ui/theme.js';
import { playSfx } from '../../audio/sfx.js';

const MAX_VISIBLE = 9;
const miniKey = (v) => (CHIPS.find(c => c.value === v) || CHIPS[0]).mini;

export function buildStack(scene, container, amount, max = MAX_VISIBLE) {
  container.removeAll(true);
  const chips = chipBreakdown(amount, max);
  chips.forEach((v, i) => container.add(scene.add.image(0, -i * CHIP_MINI.STEP, miniKey(v))));
  return chips.length;
}

export class Stake extends Phaser.GameObjects.Container {
  constructor(scene, x, y, amount, { depth = 0 } = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.amount = 0;
    this.stack = scene.add.container(0, 0);
    this.pill = scene.add.container(0, 26);
    this.pillBg = scene.add.graphics();
    this.pillText = text(scene, 0, 0, '', { size: 20, color: COLORS.INK, num: true });
    this.pill.add([this.pillBg, this.pillText]);
    this.add([this.stack, this.pill]);
    this.setDepth(depth);
    this.set(amount);
  }

  set(amount) {
    this.amount = amount;
    buildStack(this.scene, this.stack, amount);
    this.pillText.setText(fmt(amount));
    const w = Math.max(44, this.pillText.width + 16);
    this.pillBg.clear();
    this.pillBg.fillStyle(COLORS.CREAM, 1);
    this.pillBg.fillRoundedRect(-w / 2, -13, w, 26, 13);
    this.pillBg.lineStyle(2, COLORS.INK, 0.8);
    this.pillBg.strokeRoundedRect(-w / 2, -13, w, 26, 13);
    this.pill.setVisible(amount > 0);
    return this;
  }

  /** A stack of n chips slides in from `from` and merges (double / split stake). */
  addChips(n, from) {
    const s = this.scene;
    const ghost = s.add.container(from.x, from.y).setDepth(this.depth + 1);
    buildStack(s, ghost, n);
    playSfx('chipStack', { count: 4 });
    return new Promise((resolve) => {
      s.tweens.add({
        targets: ghost, x: this.x, y: this.y, duration: TIMING.CHIP_FLY_MS, ease: 'Cubic.easeOut',
        onComplete: () => {
          ghost.destroy();
          this.set(this.amount + n);
          s.tweens.add({ targets: this.pill, scale: { from: 1.3, to: 1 }, duration: 160, ease: 'Back.easeOut' });
          resolve();
        },
      });
    });
  }

  fly(to, { delay = 0, sfx = 'chipStack' } = {}) {
    const s = this.scene;
    const ghost = s.add.container(this.x, this.y).setDepth(this.depth + 1);
    buildStack(s, ghost, this.amount);
    this.set(0);
    return new Promise((resolve) => {
      s.tweens.add({
        targets: ghost, x: to.x, y: to.y, alpha: 0.15, scale: 0.7, duration: TIMING.CHIP_FLY_MS + 120, delay, ease: 'Cubic.easeIn',
        onStart: () => { if (sfx) playSfx(sfx, { count: 3 }); },
        onComplete: () => { ghost.destroy(); resolve(); },
      });
    });
  }

  lose({ delay = 0 } = {}) {
    if (!this.amount) return Promise.resolve();
    return this.fly(this.scene.bookerPos, { delay });
  }

  push({ delay = 0 } = {}) {
    if (!this.amount) return Promise.resolve();
    return this.fly(this.scene.balancePos ?? TOPBAR_POS.BALANCE, { delay });
  }

  /** Booker slides the winnings next to the stake, then everything goes to the balance. */
  win(paid, { delay = 0 } = {}) {
    const s = this.scene;
    const from = s.bookerPos;
    const to = s.balancePos ?? TOPBAR_POS.BALANCE;
    const winnings = Math.max(0, paid - this.amount);
    const pay = s.add.container(from.x, from.y).setDepth(this.depth + 1);
    buildStack(s, pay, winnings || paid);
    return new Promise((resolve) => {
      s.tweens.add({
        targets: pay, x: this.x + 52, y: this.y, duration: TIMING.CHIP_FLY_MS, delay, ease: 'Cubic.easeOut',
        onStart: () => playSfx('chipStack', { count: 5 }),
        onComplete: () => {
          s.tweens.add({
            targets: pay, x: to.x, y: to.y, alpha: 0.2, scale: 0.6, duration: TIMING.CHIP_FLY_MS + 80, delay: 520, ease: 'Cubic.easeIn',
            onComplete: () => pay.destroy(),
          });
          this.fly(to, { delay: 520, sfx: null }).then(() => { playSfx('coin'); resolve(); });
        },
      });
    });
  }
}
