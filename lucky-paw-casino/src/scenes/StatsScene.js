// =============================================================================
// StatsScene — modal overlay launched over the paused Lobby (S / Stats button).
// Per-game table, totals, overall numbers, the VIP ladder, and "Reset
// progress" behind a confirm. Esc / S / Close returns to the lobby.
// =============================================================================

import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, GAME, GAMES, VIP_TIERS, css } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { wallet } from '../core/Casino.js';
import { Button } from '../ui/Button.js';
import { text, fmt, fmtSigned, drawPanel, openModal, closeModal, modalOpen } from '../ui/theme.js';
import { playSfx } from '../audio/sfx.js';

const P = { x: 50, y: 22, w: 1180, h: 676 };
const ROW = 38;
const COLS = [
  { key: 'name', label: 'Game', x: 96, align: 0 },
  { key: 'rounds', label: 'Rounds', x: 420, align: 1 },
  { key: 'wagered', label: 'Wagered', x: 560, align: 1 },
  { key: 'won', label: 'Won', x: 700, align: 1 },
  { key: 'net', label: 'Net', x: 840, align: 1 },
  { key: 'biggestWin', label: 'Biggest win', x: 1010, align: 1 },
  { key: 'bestStreak', label: 'Best streak', x: 1180, align: 1 },
];

export class StatsScene extends Phaser.Scene {
  constructor() {
    super('Stats');
  }

  init() {
    this.__modals = 0;
    this.confirm = null;
  }

  create() {
    eventBus.emit(Events.STATS_OPEN);
    playSfx('cardFlip');
    const dim = this.add.rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.66).setInteractive();
    dim.on('pointerdown', () => { if (!modalOpen(this)) this.close(); });
    const g = this.add.graphics();
    drawPanel(g, P.x, P.y, P.w, P.h, { radius: 24, inner: true, alpha: 0.98 });
    this.add.zone(P.x + P.w / 2, P.y + P.h / 2, P.w, P.h).setInteractive(); // swallow clicks on the panel

    const title = text(this, P.x + 44, P.y + 44, 'Stats', { size: FONT.SIZE.TITLE, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD, origin: [0, 0.5] });
    const s = wallet.summary();
    const bx = title.x + title.width + 28;
    text(this, bx, P.y + 47, 'Balance', { size: FONT.SIZE.BODY, color: COLORS.TEXT_DIM, origin: [0, 0.5] });
    text(this, bx + 104, P.y + 47, `${fmt(wallet.balance)} chips`, { size: FONT.SIZE.BODY, color: COLORS.GOLD_LIGHT, origin: [0, 0.5], num: true });
    this.closeBtn = new Button(this, P.x + P.w - 100, P.y + 46, {
      label: 'Close', hint: 'Esc', hotkey: ['ESC', 'S'], style: 'secondary', w: 150, h: 56, onClick: () => this.close(),
    });

    // --- per-game table ---
    const top = P.y + 100;
    const tg = this.add.graphics();
    tg.fillStyle(0x000000, 0.3);
    tg.fillRoundedRect(P.x + 30, top, P.w - 60, 46 + 6 * ROW + 14, 14);
    for (const c of COLS) {
      text(this, c.x, top + 24, c.label, { size: FONT.SIZE.TINY, color: COLORS.TEXT_DIM, origin: [c.align, 0.5] });
    }
    const rows = GAMES.map(gm => ({ ...wallet.gameSummary(gm.id), name: gm.name, accent: gm.accent }));
    rows.push({
      name: 'All games', rounds: s.rounds, wagered: s.wagered, won: s.won, net: s.net,
      biggestWin: s.biggestWin.amount, bestStreak: Math.max(0, ...rows.map(r => r.bestStreak)), total: true,
    });
    rows.forEach((r, i) => {
      const y = top + 66 + i * ROW + (r.total ? 8 : 0);
      if (r.total) {
        tg.fillStyle(COLORS.BRASS, 0.7);
        tg.fillRect(P.x + 44, y - 24, P.w - 88, 2);
      } else if (i % 2 === 0) {
        tg.fillStyle(0xffffff, 0.035);
        tg.fillRect(P.x + 36, y - ROW / 2, P.w - 72, ROW);
      }
      if (r.accent) {
        tg.fillStyle(r.accent, 1);
        tg.fillCircle(COLS[0].x - 14, y, 6);
      }
      for (const c of COLS) {
        let v = r[c.key];
        let color = r.total ? COLORS.GOLD_LIGHT : COLORS.CREAM;
        if (c.key === 'net') {
          color = v > 0 ? COLORS.WIN : v < 0 ? COLORS.LOSE : COLORS.TEXT_DIM;
          v = r.rounds || v ? fmtSigned(v) : '-';
        } else if (c.key === 'biggestWin') {
          v = v > 0 ? `+${fmt(v)}` : '-';
        } else if (c.key !== 'name') {
          v = fmt(v);
        }
        text(this, c.x, y, String(v), {
          size: FONT.SIZE.SMALL, color, origin: [c.align, 0.5], weight: r.total || c.key === 'name' ? FONT.WEIGHT.BOLD : FONT.WEIGHT.MEDIUM,
          num: c.key !== 'name',
        });
      }
    });

    // --- overall line ---
    const oy = top + 46 + 6 * ROW + 38;
    const big = s.biggestWin.amount > 0 ? `+${fmt(s.biggestWin.amount)} (${GAMES.find(x => x.id === s.biggestWin.game)?.name ?? '?'})` : '-';
    text(this, P.x + P.w / 2, oy, `Hands ${fmt(s.rounds)}   ·   Biggest win ${big}   ·   Bailouts ${s.bailouts}   ·   Daily bonuses ${s.dailies}   ·   VIP gifts ${s.gifts}`,
      { size: FONT.SIZE.SMALL, color: COLORS.CREAM });

    // --- VIP ladder ---
    this.buildLadder(oy + 36);

    this.resetBtn = new Button(this, P.x + 140, P.y + P.h - 44, {
      label: 'Reset progress', style: 'danger', w: 220, h: 56, size: FONT.SIZE.SMALL, onClick: () => this.askReset(),
    });
    text(this, P.x + P.w - 40, P.y + P.h - 44, '1 XP per chip wagered. Each tier pays a one-time gift and raises the table limit.', {
      size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [1, 0.5], wrap: 860, align: 'right',
    });
  }

  buildLadder(y0) {
    const v = wallet.vip();
    const n = VIP_TIERS.length;
    const gap = 14;
    const w = (P.w - 80 - gap * (n - 1)) / n;
    const h = 140;
    const g = this.add.graphics();
    VIP_TIERS.forEach((t, i) => {
      const x = P.x + 40 + i * (w + gap);
      const cur = t.tier === v.tier;
      const reached = t.tier <= v.tier;
      g.fillStyle(cur ? 0x2a1d10 : 0x140d08, 0.95);
      g.fillRoundedRect(x, y0, w, h, 14);
      g.lineStyle(cur ? 4 : 2, t.color, reached ? 1 : 0.35);
      g.strokeRoundedRect(x, y0, w, h, 14);
      const a = reached ? 1 : 0.55;
      text(this, x + w / 2, y0 + 26, t.name, { size: FONT.SIZE.BODY, weight: FONT.WEIGHT.BOLD, color: t.color }).setAlpha(a);
      text(this, x + w / 2, y0 + 56, t.xp ? `${fmt(t.xp)} XP` : 'Start', { size: 20, color: COLORS.TEXT_DIM, num: !!t.xp }).setAlpha(a);
      text(this, x + w / 2, y0 + 82, t.gift ? `Gift +${fmt(t.gift)}` : 'Welcome!', { size: 20, color: COLORS.GOLD_LIGHT, num: !!t.gift }).setAlpha(a);
      text(this, x + w / 2, y0 + 108, `Max bet ${fmt(t.maxBet)}`, { size: 20, color: COLORS.CREAM, num: true }).setAlpha(a);
      if (cur) {
        g.fillStyle(t.color, 1);
        g.fillRoundedRect(x + w / 2 - 30, y0 - 12, 60, 22, 11);
        text(this, x + w / 2, y0 - 1, 'YOU', { size: 18, weight: FONT.WEIGHT.BOLD, color: COLORS.INK });
        if (v.next) {
          g.fillStyle(0x000000, 0.6);
          g.fillRoundedRect(x + 14, y0 + h - 13, w - 28, 7, 3);
          g.fillStyle(t.color, 1);
          g.fillRoundedRect(x + 14, y0 + h - 13, Math.max(7, (w - 28) * v.progress), 7, 3);
        }
      }
      if (reached && !cur) {
        g.fillStyle(t.color, 1);
        g.fillCircle(x + w - 16, y0 + 16, 7);
      }
    });
  }

  askReset() {
    if (this.confirm) return;
    openModal(this);
    const c = this.add.container(0, 0).setDepth(DEPTH.MODAL);
    this.confirm = c;
    const dim = this.add.rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.6).setInteractive();
    const g = this.add.graphics();
    drawPanel(g, GAME.WIDTH / 2 - 300, GAME.HEIGHT / 2 - 130, 600, 260, { radius: 20, edge: COLORS.LOSE });
    c.add([dim, g,
      text(this, GAME.WIDTH / 2, GAME.HEIGHT / 2 - 80, 'Reset all progress?', { size: FONT.SIZE.LARGE, weight: FONT.WEIGHT.BOLD, color: COLORS.CREAM }),
      text(this, GAME.WIDTH / 2, GAME.HEIGHT / 2 - 26, 'Chips, stats and VIP go back to the start.\nThis can\'t be undone.', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM }),
    ]);
    const cancel = new Button(this, GAME.WIDTH / 2 - 130, GAME.HEIGHT / 2 + 64, {
      label: 'Cancel', hint: 'Esc', hotkey: 'ESC', style: 'secondary', w: 220, h: 58, modal: true, onClick: () => this.closeConfirm(),
    });
    const ok = new Button(this, GAME.WIDTH / 2 + 130, GAME.HEIGHT / 2 + 64, {
      label: 'Reset', style: 'danger', w: 220, h: 58, modal: true, onClick: () => this.doReset(),
    });
    c.add([cancel, ok]);
  }

  closeConfirm() {
    if (!this.confirm) return;
    this.confirm.destroy();
    this.confirm = null;
    queueMicrotask(() => closeModal(this));
  }

  doReset() {
    this.closeConfirm();
    wallet.reset();
    playSfx('woof');
    this.close(true);
  }

  close(restartLobby = false) {
    eventBus.emit(Events.STATS_CLOSE);
    this.scene.stop();
    if (restartLobby) {
      this.scene.get('Lobby').scene.restart();
    } else {
      this.scene.resume('Lobby');
    }
  }
}

