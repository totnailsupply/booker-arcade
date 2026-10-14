// =============================================================================
// TopBar — the strip across the top of every game scene (64 px tall).
//
//   this.topBar = new TopBar(scene, {
//     title: 'Blackjack', accent: COLORS.BLACKJACK,
//     onLobby: () => scene.leaveToLobby(),     // Lobby button + Esc
//     rules: { title, lines: [...], payouts: [['Blackjack', '3:2'], ...] },  // '?' button
//   });
//   topBar.balancePos   {x, y} of the balance pill (fly payout chips here)
//   topBar.rules        the RulesPanel (open()/close())
//
// Layout (game px): Lobby button x 12..162 | title from x 180 |
//   balance pill centre (791, 32) | VIP badge centre (1031, 32) | '?' (1182, 32) | mute (1244, 32)
//
// Also exported for the lobby: BalancePill and VipBadge (both self-updating
// from wallet events, cleaned up with the scene).
// =============================================================================

import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, GAME, LAYOUT, TIMING } from '../core/Constants.js';
import { Events, listen } from '../core/EventBus.js';
import { wallet } from '../core/Casino.js';
import { Button } from './Button.js';
import { MuteButton } from './MuteButton.js';
import { RulesPanel } from './RulesPanel.js';
import { floatText } from './FloatText.js';
import { text, fmt, fmtK, shade } from './theme.js';

export const TOPBAR_POS = {
  LOBBY: { x: 87, y: 32 },
  TITLE: { x: 180, y: 32 },
  BALANCE: { x: 791, y: 32 },
  VIP: { x: 1031, y: 32 },
  RULES: { x: 1182, y: 32 },
  MUTE: { x: 1244, y: 32 },
};

/** Chip balance pill with a rolling counter and +/- float text (left of the pill, inside the bar). (x, y) = centre. */
export class BalancePill extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.w = o.w ?? 230;
    this.h = o.h ?? 48;
    this.shown = wallet.balance;
    this.gfx = scene.add.graphics();
    this.chip = scene.add.image(-this.w / 2 + 26, 0, 'chip-100').setDisplaySize(this.h - 12, this.h - 12);
    this.label = text(scene, 16, 0, fmt(this.shown), {
      size: o.size ?? FONT.SIZE.LARGE, color: COLORS.GOLD_LIGHT, num: true,
    });
    this.add([this.gfx, this.chip, this.label]);
    this.draw();
    this.pending = 0;
    this.lastFloatAt = -1e9;
    listen(this, Events.BALANCE_CHANGED, (d) => this.onChange(d));
    listen(this, Events.WALLET_RESET, () => this.setValue(wallet.balance, false));
    if (o.depth !== undefined) this.setDepth(o.depth);
  }

  draw() {
    const g = this.gfx;
    const { w, h } = this;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, h / 2);
    g.fillStyle(0x120c07, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(2, COLORS.BRASS, 0.95);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }

  onChange({ balance, delta, reason }) {
    this.setValue(balance, true);
    if (!delta || reason === 'reset') return;
    const gain = delta > 0;
    const quiet = reason === 'bet' || reason === 'refund';
    const now = this.scene.time.now;
    // Merge rapid same-sign changes (chip clicks) into one float
    if (this.lastFloat && this.lastFloat.active && now - this.lastFloatAt < 300 && Math.sign(this.pending) === Math.sign(delta)) {
      this.pending += delta;
      this.lastFloat.setText(`${this.pending > 0 ? '+' : '-'}${fmt(Math.abs(this.pending))}`);
    } else {
      this.pending = delta;
      // The float sits just left of the pill, inside the top bar, and drifts up a
      // few px (it used to drop below the bar into the game: Booker's bubble, the
      // Slots marquee).
      const m = this.getWorldTransformMatrix();
      this.lastFloat = floatText(this.scene, m.tx - this.w / 2 - 10, m.ty + 2, `${gain ? '+' : '-'}${fmt(Math.abs(delta))}`, {
        color: gain ? COLORS.WIN : COLORS.LOSE, size: quiet ? FONT.SIZE.SMALL : FONT.SIZE.BODY, rise: 8, ms: 900,
        depth: DEPTH.FLOAT, origin: [1, 0.5], strokeW: 5,
      });
    }
    this.lastFloatAt = now;
  }

  setValue(v, animate = true) {
    const from = this.shown;
    this.target = v;
    this.scene.tweens.killTweensOf(this.counter || {});
    if (!animate || from === v) {
      this.shown = v;
      this.label.setText(fmt(v));
      return;
    }
    this.counter = { v: from };
    this.scene.tweens.add({
      targets: this.counter, v, duration: TIMING.COUNTER_MS, ease: 'Cubic.easeOut',
      onUpdate: () => { this.shown = Math.round(this.counter.v); this.label.setText(fmt(this.shown)); },
      onComplete: () => { this.shown = v; this.label.setText(fmt(v)); },
    });
    this.scene.tweens.add({ targets: this.label, scale: v > from ? 1.15 : 0.94, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    if (v > from) this.scene.tweens.add({ targets: this.chip, angle: { from: 0, to: 360 }, duration: 500, ease: 'Cubic.easeOut' });
  }
}

/** VIP tier name + XP progress bar. (x, y) = centre. */
export class VipBadge extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.w = o.w ?? 230;
    this.h = o.h ?? 48;
    this.gfx = scene.add.graphics();
    this.bar = scene.add.graphics();
    this.name = text(scene, -this.w / 2 + 46, -10, '', { size: FONT.SIZE.SMALL, weight: FONT.WEIGHT.BOLD, origin: [0, 0.5] });
    this.xpText = text(scene, this.w / 2 - 12, 11, '', { size: 17, color: COLORS.TEXT_DIM, origin: [1, 0.5], num: true });
    this.star = scene.add.graphics();
    this.add([this.gfx, this.bar, this.star, this.name, this.xpText]);
    this.progress = wallet.vip().progress;
    this.refresh(false);
    listen(this, Events.XP_CHANGED, () => this.refresh(true));
    listen(this, Events.VIP_UP, () => this.celebrate());
    listen(this, Events.WALLET_RESET, () => this.refresh(false));
    if (o.depth !== undefined) this.setDepth(o.depth);
  }

  refresh(animate) {
    const v = wallet.vip();
    const { w, h } = this;
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, 12);
    g.fillStyle(0x120c07, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(2, v.color, 0.95);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    // paw/star medallion
    const s = this.star;
    s.clear();
    s.fillStyle(v.color, 1);
    s.fillCircle(-w / 2 + 24, 0, 15);
    s.fillStyle(0x120c07, 1);
    s.fillCircle(-w / 2 + 24, 3, 5.5);
    for (const [dx, dy] of [[-7, -5], [-2.5, -9], [2.5, -9], [7, -5]]) s.fillCircle(-w / 2 + 24 + dx, dy, 2.6);
    this.name.setText(`VIP ${v.name}`).setColor(`#${v.color.toString(16).padStart(6, '0')}`);
    this.xpText.setText(v.next ? `${fmtK(v.xp)} / ${fmtK(v.next)}` : `${fmtK(v.xp)} XP`);
    const to = v.progress;
    if (!animate) { this.progress = to; this.drawBar(v.color); return; }
    const o = { p: this.progress };
    this.scene.tweens.add({
      targets: o, p: to, duration: 500, ease: 'Cubic.easeOut',
      onUpdate: () => { this.progress = o.p; this.drawBar(v.color); },
    });
  }

  drawBar(color) {
    const { w } = this;
    const b = this.bar;
    const x = -w / 2 + 46;
    const bw = w - 46 - 12 - Math.max(64, this.xpText.width + 10);
    b.clear();
    b.fillStyle(0x000000, 0.6);
    b.fillRoundedRect(x, 6, bw, 10, 5);
    if (this.progress > 0.01) {
      b.fillStyle(color, 1);
      b.fillRoundedRect(x, 6, Math.max(10, bw * this.progress), 10, 5);
      b.fillStyle(0xffffff, 0.25);
      b.fillRoundedRect(x + 2, 7, Math.max(6, bw * this.progress - 4), 3, 2);
    }
  }

  celebrate() {
    this.refresh(false);
    this.scene.tweens.add({ targets: this, scale: 1.12, duration: 160, yoyo: true, repeat: 2, ease: 'Quad.easeOut' });
  }
}

export class TopBar extends Phaser.GameObjects.Container {
  constructor(scene, o = {}) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(DEPTH.TOPBAR);
    const H = LAYOUT.TOPBAR_H;
    const accent = o.accent ?? COLORS.BRASS;

    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, H, GAME.WIDTH, 6);
    g.fillStyle(0x1a110a, 0.94);
    g.fillRect(0, 0, GAME.WIDTH, H);
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(0, 0, GAME.WIDTH, H * 0.45);
    g.fillStyle(COLORS.BRASS, 1);
    g.fillRect(0, H - 3, GAME.WIDTH, 3);
    g.fillStyle(accent, 1);
    g.fillRect(0, H - 3, 420, 3);
    this.add(g);

    if (o.onLobby) {
      this.lobbyBtn = new Button(scene, TOPBAR_POS.LOBBY.x, TOPBAR_POS.LOBBY.y, {
        label: 'Lobby', hint: 'Esc', hotkey: 'ESC', style: 'secondary', w: 150, h: 56, size: FONT.SIZE.BODY,
        onClick: () => o.onLobby(),
      });
      this.add(this.lobbyBtn);
    }
    const tx = o.onLobby ? TOPBAR_POS.TITLE.x : 24;
    const dot = scene.add.graphics();
    dot.fillStyle(accent, 1);
    dot.fillCircle(tx + 8, TOPBAR_POS.TITLE.y, 8);
    dot.lineStyle(2, shade(accent, 0.5), 1);
    dot.strokeCircle(tx + 8, TOPBAR_POS.TITLE.y, 8);
    this.title = text(scene, tx + 26, TOPBAR_POS.TITLE.y, o.title ?? '', {
      size: FONT.SIZE.LARGE, weight: FONT.WEIGHT.BOLD, color: COLORS.CREAM, origin: [0, 0.5],
    });
    this.add([dot, this.title]);

    this.balance = new BalancePill(scene, TOPBAR_POS.BALANCE.x, TOPBAR_POS.BALANCE.y);
    this.vip = new VipBadge(scene, TOPBAR_POS.VIP.x, TOPBAR_POS.VIP.y);
    this.add([this.balance, this.vip]);

    if (o.rules) {
      this.rules = new RulesPanel(scene, { accent, ...o.rules });
      this.rulesBtn = new Button(scene, TOPBAR_POS.RULES.x, TOPBAR_POS.RULES.y, {
        label: '?', style: 'secondary', w: 56, h: 56, size: FONT.SIZE.LARGE, onClick: () => this.rules.toggle(),
      });
      this.add(this.rulesBtn);
    }
    this.mute = new MuteButton(scene, TOPBAR_POS.MUTE.x, TOPBAR_POS.MUTE.y, { size: 52 });
    this.add(this.mute);
  }

  /** Where payouts should fly to (centre of the balance pill, game px). */
  get balancePos() {
    return { x: TOPBAR_POS.BALANCE.x, y: TOPBAR_POS.BALANCE.y };
  }
}
