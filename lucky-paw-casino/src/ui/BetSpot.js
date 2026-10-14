// =============================================================================
// BetSpot — a clickable betting area that holds a chip stack.
//
//   const pass = new BetSpot(scene, 400, 420, {
//     game: 'craps', w: 260, h: 90, label: 'PASS LINE', payout: '1:1',
//     getChip: () => this.tray.value,   // chip value a click adds
//     tray: this.tray,                  // optional: chips fly from the tray
//   });
//   (BaseGameScene.addBetSpot(opts) fills game/getChip/tray for you and
//    registers the spot so leaving the scene refunds it.)
//
// Money (through the wallet; the only BetSpot calls that move chips):
//   bet(n = chip)  -> boolean   wallet.bet() after the checks; toasts the reason if refused
//                              (named bet(), not add(): Container.add() adds children)
//   undo()         -> number    refunds the last chip added
//   refund()       -> number    refunds the whole stack (before the round)
// Visual only (call AFTER BaseGameScene.settle()/wallet.pay() did the money):
//   lose()         chips slide to Booker and vanish        -> Promise
//   win(paid)      a payout stack slides in from Booker, then everything flies to the balance -> Promise
//   push()         the stack flies back to the balance      -> Promise
//   clear()        drop the stack instantly (amount -> 0); remembers lastAmount for rebet
// Other:
//   amount, lastAmount, locked; setLocked(bool); highlight(on, color); setLabel(str); setPayout(str)
//
// Options: game (wallet id, required), w, h, label, payout, shape 'rect' | 'circle' | 'none'
//   ('none' = invisible hit area over your own drawing), color (outline), fill (alpha fill colour),
//   stackX/stackY (stack offset from centre; default: bottom-centre for labelled spots >= 84 px tall,
//   else the centre), pillSide ('above' | 'right' | 'left' | 'below': where the amount pill sits
//   relative to the stack; default 'right' for the bottom stack of a tall labelled spot, else
//   'above'), maxBet (number | () => number;
//   default wallet.maxBet()), labelSize, onChange(amount, spot), getChip, tray, depth,
//   bookerPos/balancePos ({x,y}; defaults: scene.bookerPos / scene.balancePos / layout constants)
// =============================================================================

import Phaser from 'phaser';
import { CHIPS, CHIP_MINI, COLORS, FONT, LAYOUT, TIMING, chipBreakdown } from '../core/Constants.js';
import { wallet } from '../core/Casino.js';
import { playSfx } from '../audio/sfx.js';
import { toast } from './FloatText.js';
import { text, fmt } from './theme.js';
import { TOPBAR_POS } from './TopBar.js';

const MAX_VISIBLE = 10;
const miniKey = (v) => (CHIPS.find(c => c.value === v) || CHIPS[0]).mini;

export class BetSpot extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    if (!o.game) throw new Error('BetSpot needs { game }');
    this.o = o;
    this.game = o.game;
    this.w = o.w ?? 140;
    this.h = o.h ?? 90;
    this.shape = o.shape ?? 'rect';
    this.amount = 0;
    this.lastAmount = 0;
    this.history = [];
    this.locked = false;
    this.hovered = false;
    this.lit = null;

    this.gfx = scene.add.graphics();
    this.add(this.gfx);
    // Tall spots: label + payout at the top, chips stack up from the bottom.
    // Compact spots (h < 84): text centred, chips sit on top of it.
    const tall = this.h >= 84 && (o.label || o.payout);
    const ly = tall ? -this.h / 2 + 20 : (o.payout ? -10 : 0);
    if (o.label) {
      this.labelText = text(scene, 0, ly, o.label, {
        size: o.labelSize ?? FONT.SIZE.SMALL, weight: FONT.WEIGHT.BOLD, color: COLORS.CREAM, wrap: this.w - 12,
      });
      this.add(this.labelText);
    }
    if (o.payout) {
      this.payoutText = text(scene, 0, o.label ? ly + 24 : ly, o.payout, { size: 16, color: COLORS.GOLD_LIGHT, num: true });
      this.add(this.payoutText);
    }
    const defStackY = tall ? this.h / 2 - 16 : 0;
    this.pillSide = o.pillSide ?? (tall && o.stackY === undefined ? 'right' : 'above');
    this.stack = scene.add.container(o.stackX ?? 0, o.stackY ?? defStackY);
    this.add(this.stack);
    this.amountPill = scene.add.container(o.stackX ?? 0, o.stackY ?? defStackY).setVisible(false);
    this.pillBg = scene.add.graphics();
    this.pillText = text(scene, 0, 0, '', { size: 18, color: COLORS.INK, num: true });
    this.amountPill.add([this.pillBg, this.pillText]);
    this.add(this.amountPill);

    const hit = this.shape === 'circle'
      ? scene.add.zone(0, 0, this.w, this.h).setInteractive(new Phaser.Geom.Circle(this.w / 2, this.h / 2, Math.min(this.w, this.h) / 2), Phaser.Geom.Circle.Contains)
      : scene.add.zone(0, 0, this.w, this.h).setInteractive();
    hit.input.cursor = 'pointer';
    this.hit = hit;
    this.addAt(hit, 0);
    hit.on('pointerover', () => { this.hovered = true; this.draw(); });
    hit.on('pointerout', () => { this.hovered = false; this.draw(); });
    hit.on('pointerdown', (p) => {
      if (p.rightButtonDown && p.rightButtonDown()) this.undo();
      else this.add_();
    });

    if (o.depth !== undefined) this.setDepth(o.depth);
    this.setSize(this.w, this.h);
    this.draw();
  }

  // --- money --------------------------------------------------------------------------

  maxBet() {
    const m = this.o.maxBet;
    return typeof m === 'function' ? m() : (m ?? wallet.maxBet());
  }

  /** Reason this many chips can't go on the spot, or null. */
  whyNot(n) {
    if (this.locked) return 'Bets are closed';
    n = Math.floor(n || 0);
    if (n <= 0) return 'Pick a chip first';
    if (n > wallet.balance) return 'Not enough chips';
    const max = this.maxBet();
    if (n + this.amount > max) return this.amount >= max ? `Table limit is ${fmt(max)}` : `Max bet is ${fmt(max)}`;
    return null;
  }

  /** Bet n chips (default: the selected chip). Returns true if placed. */
  add_(n) {
    const v = n ?? this.o.getChip?.() ?? 0;
    const why = this.whyNot(v);
    if (why) {
      toast(this.scene, why, { kind: 'warn' });
      return false;
    }
    if (!wallet.bet(this.game, v)) return false;
    this.amount += v;
    this.history.push(v);
    playSfx('chip');
    this.flyIn(v);
    this.refreshStack(true);
    this.o.onChange?.(this.amount, this);
    return true;
  }

  /** Public name for add_ (Container already has add() for children). */
  bet(n) { return this.add_(n); }

  /** Refund the last chip added. */
  undo() {
    if (this.locked || !this.history.length) return 0;
    const v = this.history.pop();
    const back = wallet.refund(this.game, v);
    this.amount -= back;
    playSfx('chip', { gain: 0.7 });
    this.refreshStack(false);
    this.o.onChange?.(this.amount, this);
    return back;
  }

  /** Refund the whole stack (un-played chips). */
  refund() {
    if (!this.amount) return 0;
    const back = wallet.refund(this.game, this.amount);
    this.lastAmount = this.amount;
    this.amount = 0;
    this.history = [];
    if (back) playSfx('chipStack', { count: 3 });
    this.refreshStack(false);
    this.o.onChange?.(this.amount, this);
    return back;
  }

  /** Drop the stack without touching the wallet (after the round was settled). */
  clear() {
    if (this.amount) this.lastAmount = this.amount;
    this.amount = 0;
    this.history = [];
    this.stack.removeAll(true);
    this.amountPill.setVisible(false);
    this.o.onChange?.(this.amount, this);
  }

  // --- visuals --------------------------------------------------------------------------

  /** Chips slide to Booker and vanish. Visual only. */
  lose({ delay = 0 } = {}) {
    if (!this.amount) { this.clear(); return Promise.resolve(); }
    const to = this.o.bookerPos ?? this.scene.bookerPos ?? LAYOUT.BOOKER_SLOT;
    return this.flyStackTo(to, { delay, sfx: 'chipStack', fade: true });
  }

  /** Stack returns to the player (push). Visual only. */
  push({ delay = 0 } = {}) {
    if (!this.amount) { this.clear(); return Promise.resolve(); }
    const to = this.o.balancePos ?? this.scene.balancePos ?? TOPBAR_POS.BALANCE;
    return this.flyStackTo(to, { delay, sfx: 'chipStack', fade: true });
  }

  /** A payout stack slides in from Booker next to the bet, then all of it flies to the balance. Visual only. */
  win(paid, { delay = 0 } = {}) {
    const s = this.scene;
    const from = this.o.bookerPos ?? s.bookerPos ?? LAYOUT.BOOKER_SLOT;
    const to = this.o.balancePos ?? s.balancePos ?? TOPBAR_POS.BALANCE;
    const winnings = Math.max(0, paid - this.amount);
    const m = this.getWorldTransformMatrix();
    const sx = m.tx + this.stack.x;
    const sy = m.ty + this.stack.y;
    const pay = s.add.container(from.x, from.y).setDepth((this.depth || 0) + 1);
    this.buildStack(pay, winnings || paid);
    this.highlight(true, COLORS.GOLD);
    return new Promise((resolve) => {
      s.tweens.add({
        targets: pay, x: sx + 34, y: sy, duration: TIMING.CHIP_FLY_MS, delay, ease: 'Cubic.easeOut',
        onStart: () => playSfx('chipStack', { count: 5 }),
        onComplete: () => {
          s.tweens.add({
            targets: pay, x: to.x, y: to.y, alpha: 0.2, scale: 0.6, duration: TIMING.CHIP_FLY_MS + 80, delay: 420, ease: 'Cubic.easeIn',
            onComplete: () => pay.destroy(),
          });
          this.flyStackTo(to, { delay: 420, sfx: null, fade: true }).then(() => {
            playSfx('coin');
            this.highlight(false);
            resolve();
          });
        },
      });
    });
  }

  flyStackTo(to, { delay = 0, sfx = null, fade = false } = {}) {
    const s = this.scene;
    const m = this.getWorldTransformMatrix();
    const ghost = s.add.container(m.tx + this.stack.x, m.ty + this.stack.y).setDepth((this.depth || 0) + 1);
    this.buildStack(ghost, this.amount);
    this.clear();
    return new Promise((resolve) => {
      s.tweens.add({
        targets: ghost, x: to.x, y: to.y, alpha: fade ? 0.15 : 1, scale: 0.7,
        duration: TIMING.CHIP_FLY_MS + 120, delay, ease: 'Cubic.easeIn',
        onStart: () => { if (sfx) playSfx(sfx, { count: 3 }); },
        onComplete: () => { ghost.destroy(); resolve(); },
      });
    });
  }

  /** One chip flies from the tray (or below the spot) onto the stack. */
  flyIn(v) {
    const s = this.scene;
    const tray = this.o.tray;
    const m = this.getWorldTransformMatrix();
    const from = tray ? tray.chipPos(v) : { x: m.tx, y: m.ty + 120 };
    const def = CHIPS.find(c => c.value === v) || CHIPS[0];
    const chip = s.add.image(from.x, from.y, def.key).setDisplaySize(48, 48).setDepth((this.depth || 0) + 2);
    const n = Math.min(this.stack.length, MAX_VISIBLE);
    s.tweens.add({
      targets: chip, x: m.tx + this.stack.x, y: m.ty + this.stack.y - n * CHIP_MINI.STEP, scaleX: chip.scaleX * 0.8, scaleY: chip.scaleY * 0.45,
      duration: 220, ease: 'Cubic.easeOut', onComplete: () => chip.destroy(),
    });
  }

  buildStack(container, amount) {
    container.removeAll(true);
    const chips = chipBreakdown(amount, MAX_VISIBLE); // largest first = bottom of the stack
    chips.forEach((v, i) => {
      const img = this.scene.add.image(0, -i * CHIP_MINI.STEP, miniKey(v));
      container.add(img);
    });
    return chips.length;
  }

  refreshStack(pop) {
    const n = this.buildStack(this.stack, this.amount);
    if (!this.amount) {
      this.amountPill.setVisible(false);
      return;
    }
    // amount pill above the stack
    this.pillText.setText(fmt(this.amount));
    const w = Math.max(40, this.pillText.width + 16);
    this.pillBg.clear();
    this.pillBg.fillStyle(COLORS.CREAM, 1);
    this.pillBg.fillRoundedRect(-w / 2, -12, w, 24, 12);
    this.pillBg.lineStyle(2, COLORS.INK, 0.8);
    this.pillBg.strokeRoundedRect(-w / 2, -12, w, 24, 12);
    this.amountPill.setVisible(true);
    // pill position relative to the stack (pillSide)
    const sx = this.stack.x, sy = this.stack.y;
    switch (this.pillSide) {
      case 'right': this.amountPill.setPosition(sx + CHIP_MINI.W / 2 + w / 2 + 6, sy - 4); break;
      case 'left': this.amountPill.setPosition(sx - CHIP_MINI.W / 2 - w / 2 - 6, sy - 4); break;
      case 'below': this.amountPill.setPosition(sx, sy + CHIP_MINI.H / 2 + 16); break;
      default: this.amountPill.setPosition(sx, sy - n * CHIP_MINI.STEP - 26);
    }
    if (pop) {
      this.scene.tweens.add({ targets: this.amountPill, scale: { from: 1.3, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    }
  }

  setLocked(on) {
    this.locked = !!on;
    this.hit.input.cursor = this.locked ? 'default' : 'pointer';
    this.draw();
    return this;
  }

  /** Glow the spot (winning number, active bet). */
  highlight(on, color = COLORS.GOLD) {
    this.lit = on ? color : null;
    this.draw();
    if (on && this.scene) {
      this.scene.tweens.add({ targets: this.gfx, alpha: { from: 0.55, to: 1 }, duration: 260, yoyo: true, repeat: 2 });
    }
    return this;
  }

  setLabel(str) { this.labelText?.setText(str); return this; }
  setPayout(str) { this.payoutText?.setText(str); return this; }

  draw() {
    const g = this.gfx;
    const { w, h } = this;
    g.clear();
    if (this.shape === 'none' && !this.lit && !this.hovered) return;
    const col = this.lit ?? this.o.color ?? COLORS.CREAM;
    const a = this.lit ? 1 : this.hovered && !this.locked ? 0.9 : 0.5;
    if (this.lit) {
      g.fillStyle(this.lit, 0.25);
    } else {
      g.fillStyle(this.o.fill ?? 0xffffff, this.hovered && !this.locked ? 0.1 : (this.o.fill !== undefined ? 0.18 : 0.03));
    }
    if (this.shape === 'circle') {
      const r = Math.min(w, h) / 2;
      g.fillCircle(0, 0, r);
      g.lineStyle(this.lit ? 4 : 2, col, a);
      g.strokeCircle(0, 0, r);
    } else {
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      g.lineStyle(this.lit ? 4 : 2, col, a);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    }
  }
}
