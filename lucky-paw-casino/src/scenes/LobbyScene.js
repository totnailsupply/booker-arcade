// =============================================================================
// LobbyScene — the casino floor: logo, Booker & Soba, five game cards and the
// cashier (daily bonus / bailout). Keys: 1-5 play, S stats, D daily / B
// bailout, M mute.
//
// Layout (1280x720): top strip y 0..64 (balance, VIP, Stats, mute) | left
// column x 20..440 (logo, duo) | 3x2 card grid x 460..1260, y 84..606 (five
// games + cashier) | hint line y 664.
// =============================================================================

import Phaser from 'phaser';
import { COLORS, DEPTH, ECONOMY, FONT, GAME, GAMES, VIP_TIERS, css } from '../core/Constants.js';
import { eventBus, Events, listen } from '../core/EventBus.js';
import { wallet } from '../core/Casino.js';
import { goto, fadeIn } from '../core/Nav.js';
import { BalancePill, VipBadge } from '../ui/TopBar.js';
import { Button } from '../ui/Button.js';
import { MuteButton } from '../ui/MuteButton.js';
import { toast, floatText } from '../ui/FloatText.js';
import { text, fmt, fmtSigned, drawPanel, shade, modalOpen } from '../ui/theme.js';
import { playSfx } from '../audio/sfx.js';

const CARD = { W: 252, H: 250, GAP_X: 22, GAP_Y: 22, X0: 460, Y0: 86 };
const KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  init() {
    this.__leaving = false;
    this.__modals = 0;
    this.cards = [];
  }

  create() {
    this.input.enabled = true;
    this.buildBackdrop();
    this.buildLeftColumn();
    this.buildTopStrip();
    GAMES.forEach((g, i) => this.buildGameCard(g, i));
    this.buildCashier();

    this.hint = text(this, CARD.X0 + (CARD.W * 3 + CARD.GAP_X * 2) / 2, 668,
      '1-5  play     S  stats     M  sound', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, num: true }).setDepth(DEPTH.UI);

    KEYS.forEach((k, i) => {
      this.input.keyboard.on(`keydown-${k}`, () => { if (!modalOpen(this)) this.enterGame(GAMES[i]); });
    });

    listen(this, Events.BALANCE_CHANGED, () => this.refreshCashier());
    listen(this, Events.VIP_UP, (d) => toast(this, `VIP ${d.name}! +${fmt(d.gift)} chips, max bet ${fmt(d.maxBet)}`, { ms: 2600 }));
    const onResume = () => { this.refreshCashier(); this.refreshCards(); };
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));

    eventBus.emit(Events.MUSIC_PLAY, { track: 'lobby' });
    eventBus.emit(Events.SCENE_CHANGED, { key: 'Lobby' });
    fadeIn(this);
  }

  // --- backdrop ----------------------------------------------------------------------

  buildBackdrop() {
    this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'bg-lobby').setDisplaySize(GAME.WIDTH, GAME.HEIGHT).setDepth(DEPTH.BG);
    // warm lamp pools that breathe (positions match the lobby art's hanging lamps)
    for (const [x, y, s] of [[125, 60, 2.6], [446, 40, 2.4], [912, 40, 2.4], [1162, 60, 2.6]]) {
      const glow = this.add.image(x, y, 'ui-glow').setScale(s).setTint(0xffc977).setAlpha(0.22).setBlendMode('ADD').setDepth(DEPTH.BG + 1);
      this.tweens.add({ targets: glow, alpha: 0.36, scale: s * 1.06, duration: 1800 + x, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // dim the floor so cards read, then a vignette
    const shade1 = this.add.graphics().setDepth(DEPTH.BG + 2);
    shade1.fillStyle(0x0b0705, 0.45);
    shade1.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'ui-vignette').setDisplaySize(GAME.WIDTH, GAME.HEIGHT).setDepth(DEPTH.BG + 3);
    // drifting dust in the lamplight
    this.dust = this.add.particles(0, 0, 'particle-spark', {
      x: { min: 0, max: GAME.WIDTH }, y: { min: 120, max: GAME.HEIGHT },
      speedY: { min: -18, max: -6 }, speedX: { min: -6, max: 6 },
      lifespan: 7000, frequency: 260, quantity: 1,
      scale: { start: 0.35, end: 0.1 }, alpha: { start: 0.35, end: 0 },
      tint: 0xffd9a0, blendMode: 'ADD',
    }).setDepth(DEPTH.BG + 4);
    this.dust.fastForward(6000);
  }

  buildLeftColumn() {
    const cx = 230;
    const logo = this.add.image(cx, 150, 'title-logo').setDepth(DEPTH.UI);
    const lk = Math.min(420 / logo.width, 150 / logo.height);
    logo.setScale(lk);
    this.logo = logo;
    this.tweens.add({ targets: logo, scale: lk * 1.025, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Booker & Soba, standing on the floor of the left column
    const duo = this.add.image(cx, 700, 'duo-hero').setOrigin(0.5, 1).setDepth(DEPTH.UI);
    const dk = Math.min(430 / duo.width, 420 / duo.height);
    duo.setScale(dk);
    this.duo = duo;
    const glow = this.add.image(cx, 700 - duo.displayHeight * 0.45, 'ui-glow').setScale(4.2, 3.4)
      .setTint(0xffb35a).setAlpha(0.28).setBlendMode('ADD').setDepth(DEPTH.UI - 1);
    this.tweens.add({ targets: glow, alpha: 0.4, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: duo, y: 694, scaleY: dk * 1.012, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    duo.setInteractive({ useHandCursor: true, pixelPerfect: false });
    duo.on('pointerdown', () => {
      playSfx('woof');
      this.tweens.add({ targets: duo, angle: { from: -2, to: 2 }, duration: 90, yoyo: true, repeat: 1, onComplete: () => { duo.angle = 0; } });
    });
  }

  buildTopStrip() {
    const g = this.add.graphics().setDepth(DEPTH.TOPBAR - 1);
    g.fillStyle(0x0d0805, 0.75);
    g.fillRect(0, 0, GAME.WIDTH, 64);
    g.fillStyle(COLORS.BRASS, 0.8);
    g.fillRect(0, 63, GAME.WIDTH, 2);
    this.balance = new BalancePill(this, 590, 32, { w: 240, depth: DEPTH.TOPBAR });
    this.vip = new VipBadge(this, 860, 32, { w: 260, depth: DEPTH.TOPBAR });
    this.statsBtn = new Button(this, 1104, 32, {
      label: 'Stats', hint: 'S', hotkey: 'S', style: 'secondary', w: 150, h: 56, depth: DEPTH.TOPBAR,
      onClick: () => this.openStats(),
    });
    this.mute = new MuteButton(this, 1244, 32, { size: 52, depth: DEPTH.TOPBAR });
    text(this, 24, 32, 'Booker\'s backroom', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(DEPTH.TOPBAR);
  }

  // --- cards ---------------------------------------------------------------------------

  cardPos(i) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      x: CARD.X0 + CARD.W / 2 + col * (CARD.W + CARD.GAP_X),
      y: CARD.Y0 + CARD.H / 2 + row * (CARD.H + CARD.GAP_Y),
    };
  }

  cardFrame(c, accent, i) {
    const { W, H } = CARD;
    const glow = this.add.image(0, 0, 'ui-glow').setScale(3.4, 3.2).setTint(accent).setAlpha(0).setBlendMode('ADD');
    const g = this.add.graphics();
    drawPanel(g, -W / 2, -H / 2, W, H, { radius: 20, edge: shade(accent, 0.15), edgeW: 3, fill: 0x1a110b, alpha: 0.95 });
    // accent band behind the icon
    g.fillStyle(accent, 0.28);
    g.fillRoundedRect(-W / 2 + 6, -H / 2 + 6, W - 12, 118, { tl: 15, tr: 15, bl: 4, br: 4 });
    g.fillStyle(accent, 0.6);
    g.fillRect(-W / 2 + 6, -H / 2 + 122, W - 12, 2);
    c.add([glow, g]);
    if (i !== null) {
      const b = this.add.graphics();
      b.fillStyle(0x0d0805, 0.9);
      b.fillCircle(-W / 2 + 26, -H / 2 + 26, 16);
      b.lineStyle(2, COLORS.GOLD, 1);
      b.strokeCircle(-W / 2 + 26, -H / 2 + 26, 16);
      c.add([b, text(this, -W / 2 + 26, -H / 2 + 26, String(i + 1), { size: FONT.SIZE.SMALL, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD })]);
    }
    return glow;
  }

  buildGameCard(game, i) {
    const p = this.cardPos(i);
    const c = this.add.container(p.x, p.y).setDepth(DEPTH.UI);
    const { W, H } = CARD;
    const glow = this.cardFrame(c, game.accent, i);
    const icon = this.add.image(0, -H / 2 + 64, game.icon);
    const ik = 108 / Math.max(icon.width, icon.height);
    icon.setScale(ik);
    const name = text(this, 0, -H / 2 + 146, game.name, { size: FONT.SIZE.LARGE, weight: FONT.WEIGHT.BOLD, color: COLORS.CREAM });
    const pitch = text(this, 0, -H / 2 + 166, game.pitch, {
      size: FONT.SIZE.TINY, color: COLORS.TEXT_DIM, wrap: W - 30, origin: [0.5, 0], weight: FONT.WEIGHT.REGULAR,
    });
    const line = this.add.graphics();
    line.fillStyle(0xffffff, 0.08);
    line.fillRect(-W / 2 + 16, H / 2 - 36, W - 32, 1);
    const limit = text(this, -W / 2 + 16, H / 2 - 19, '', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5], num: true });
    const best = text(this, W / 2 - 16, H / 2 - 19, '', { size: FONT.SIZE.SMALL, color: COLORS.GOLD_LIGHT, origin: [1, 0.5], num: true });
    c.add([icon, name, pitch, line, limit, best]);

    const zone = this.add.zone(0, 0, W, H).setInteractive({ useHandCursor: true });
    c.add(zone);
    const card = { game, c, glow, icon, ik, limit, best, base: p, hovered: false };
    zone.on('pointerover', () => this.hoverCard(card, true));
    zone.on('pointerout', () => this.hoverCard(card, false));
    zone.on('pointerup', () => this.enterGame(game));
    this.tweens.add({ targets: icon, y: icon.y - 5, duration: 1400, delay: i * 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // entrance
    c.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, delay: 60 + i * 60, ease: 'Back.easeOut' });
    this.cards.push(card);
    this.refreshCard(card);
  }

  refreshCard(card) {
    const g = wallet.gameSummary(card.game.id);
    card.limit.setText(`Bet ${fmt(card.game?.minBet ?? 1)}-${fmt(wallet.maxBet())}`);
    card.best.setText(g.biggestWin > 0 ? `Best ${fmtSigned(g.biggestWin)}` : g.rounds ? `${g.rounds} played` : 'New!');
  }

  refreshCards() {
    for (const c of this.cards) this.refreshCard(c);
  }

  hoverCard(card, on) {
    if (card.hovered === on) return;
    card.hovered = on;
    if (on) playSfx('hover');
    this.tweens.killTweensOf([card.c, card.glow]);
    this.tweens.add({ targets: card.c, y: card.base.y - (on ? 8 : 0), scale: on ? 1.035 : 1, duration: 160, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: card.glow, alpha: on ? 0.55 : 0, duration: 180 });
  }

  enterGame(game) {
    if (this.__leaving || !game) return;
    playSfx('chipStack', { count: 3 });
    const card = this.cards.find(c => c.game === game);
    if (card) this.tweens.add({ targets: card.c, scale: 1.08, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    goto(this, game.key);
  }

  // --- cashier (daily bonus + bailout) ---------------------------------------------------

  buildCashier() {
    const p = this.cardPos(5);
    const c = this.add.container(p.x, p.y).setDepth(DEPTH.UI);
    const { W, H } = CARD;
    this.cardFrame(c, COLORS.BRASS, null);
    // Booker at the teller window. The 256 px dealer master (the 17 px
    // booker-cage sprite looked blocky next to the crisp game icons).
    const cage = this.add.container(-W / 2 + 62, -H / 2 + 64);
    const win = this.add.graphics();
    win.fillStyle(0x163a28, 1);
    win.fillRoundedRect(-50, -50, 100, 100, 14);
    win.fillStyle(0xffffff, 0.06);
    win.fillCircle(0, -10, 36);
    win.lineStyle(3, COLORS.BRASS, 1);
    win.strokeRoundedRect(-50, -50, 100, 100, 14);
    const face = this.add.image(0, 4, 'dealer');
    face.setScale(92 / Math.max(face.width, face.height));
    cage.add([win, face]);
    const title = text(this, 44, -H / 2 + 44, 'Cashier', { size: FONT.SIZE.LARGE, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD });
    const sub = text(this, 44, -H / 2 + 80, 'Booker\'s cage', { size: FONT.SIZE.TINY, color: COLORS.TEXT_DIM });
    this.cashierMsg = text(this, 0, -H / 2 + 156, '', { size: FONT.SIZE.SMALL, color: COLORS.CREAM, wrap: W - 30 });
    c.add([cage, title, sub, this.cashierMsg]);
    this.cashierBtn = new Button(this, 0, H / 2 - 44, {
      label: 'Claim', hint: 'D', hotkey: ['D', 'B'], style: 'gold', w: W - 40, h: 58, num: true,
      onClick: () => this.cashierAction(),
    });
    c.add(this.cashierBtn);
    this.cashier = c;
    this.cage = cage;
    this.tweens.add({ targets: cage, y: cage.y - 4, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    c.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, delay: 360, ease: 'Back.easeOut' });
    this.refreshCashier();
  }

  cashierState() {
    if (wallet.bailoutAvailable()) return 'bailout';
    if (wallet.dailyAvailable()) return 'daily';
    return 'done';
  }

  refreshCashier() {
    if (!this.cashierBtn) return;
    const st = this.cashierState();
    this.cashierStateNow = st;
    if (st === 'bailout') {
      this.cashierMsg.setText(`Booker spots you ${fmt(ECONOMY.BAILOUT_AMOUNT)}!`);
      this.cashierBtn.setLabel(`Take ${fmt(ECONOMY.BAILOUT_AMOUNT)}`).setHint('B').setEnabled(true);
    } else if (st === 'daily') {
      this.cashierMsg.setText('Daily bonus is ready!');
      this.cashierBtn.setLabel(`Claim +${fmt(ECONOMY.DAILY_AMOUNT)}`).setHint('D').setEnabled(true);
    } else {
      this.cashierMsg.setText('Today\'s bonus: claimed');
      this.cashierBtn.setLabel('See you tomorrow').setHint('').setEnabled(false);
    }
    if (st !== 'done' && !this.cashierPulse) {
      this.cashierPulse = this.tweens.add({ targets: this.cashierBtn, scale: 1.04, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (st === 'done' && this.cashierPulse) {
      this.cashierPulse.remove();
      this.cashierPulse = null;
      this.cashierBtn.setScale(1);
    }
  }

  cashierAction() {
    const st = this.cashierState();
    let n = 0;
    if (st === 'bailout') n = wallet.takeBailout();
    else if (st === 'daily') n = wallet.claimDaily();
    if (!n) return;
    this.flyChips(n);
    floatText(this, this.cashier.x, this.cashier.y - 40, `+${fmt(n)}`, { color: COLORS.WIN, size: FONT.SIZE.TITLE });
    this.tweens.add({ targets: this.cage, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 2, onComplete: () => { this.cage.angle = 0; } });
    this.refreshCashier();
  }

  flyChips(amount) {
    const from = { x: this.cashier.x, y: this.cashier.y + 60 };
    const to = { x: this.balance.x - 90, y: this.balance.y };
    const n = Math.min(12, 4 + Math.floor(amount / 60));
    for (let i = 0; i < n; i++) {
      const key = amount >= 500 ? (i % 3 ? 'chip-100' : 'chip-25') : (i % 2 ? 'chip-25' : 'chip-5');
      const chip = this.add.image(from.x + (i % 4 - 1.5) * 18, from.y, key).setDisplaySize(44, 44).setDepth(DEPTH.FLOAT);
      const midX = (from.x + to.x) / 2 + (i % 2 ? 60 : -60);
      const midY = Math.min(from.y, to.y) - 80;
      const path = { t: 0 };
      this.tweens.add({
        targets: path, t: 1, duration: 520, delay: i * 45, ease: 'Cubic.easeIn',
        onUpdate: () => {
          const t = path.t;
          const u = 1 - t;
          chip.x = u * u * (from.x + (i % 4 - 1.5) * 18) + 2 * u * t * midX + t * t * to.x;
          chip.y = u * u * from.y + 2 * u * t * midY + t * t * to.y;
          chip.angle = t * 540;
        },
        onComplete: () => { chip.destroy(); playSfx('chip', { gain: 0.5 }); },
      });
    }
  }

  // --- stats ------------------------------------------------------------------------------

  openStats() {
    if (this.__leaving || this.scene.isActive('Stats')) return;
    this.scene.launch('Stats');
    this.scene.pause();
  }
}

