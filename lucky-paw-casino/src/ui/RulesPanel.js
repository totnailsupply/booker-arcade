// =============================================================================
// RulesPanel — modal "How to play" card. Built on open(), destroyed on close().
//
//   const rules = new RulesPanel(scene, {
//     title: 'Roulette',
//     lines: ['Click the layout to place chips.', 'Space spins.'],
//     payouts: [['Straight', '35:1'], ['Red / Black', '1:1']],   // optional
//     accent: COLORS.ROULETTE,
//   });
//   rules.open(); rules.close(); rules.toggle(); rules.isOpen
//
// Closes on the button, Esc/Enter, or a click on the dim backdrop. While open,
// other Buttons' hotkeys are ignored (theme.js modal stack) and clicks can't
// reach the table.
// =============================================================================

import { COLORS, DEPTH, FONT, GAME } from '../core/Constants.js';
import { playSfx } from '../audio/sfx.js';
import { Button } from './Button.js';
import { text, drawPanel, openModal, closeModal } from './theme.js';

export class RulesPanel {
  constructor(scene, o = {}) {
    this.scene = scene;
    this.o = o;
    this.root = null;
    scene.events.once('shutdown', () => this.close(true));
  }

  get isOpen() { return !!this.root; }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  open() {
    if (this.root) return this;
    const s = this.scene;
    const o = this.o;
    openModal(s);
    playSfx('cardFlip');
    const W = 900;
    const payouts = o.payouts || [];
    const lines = o.lines || [];
    const twoCol = payouts.length > 0;
    const root = s.add.container(0, 0).setDepth(DEPTH.MODAL);
    this.root = root;

    const dim = s.add.rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x000000, 0.6)
      .setInteractive();
    dim.on('pointerdown', () => this.close());
    root.add(dim);

    // Measure content height first
    const colL = twoCol ? 470 : W - 100;
    const bullets = lines.map((l) => text(s, 0, 0, l, {
      size: FONT.SIZE.SMALL + 1, wrap: colL - 34, align: 'left', origin: [0, 0], color: COLORS.CREAM, weight: FONT.WEIGHT.REGULAR,
    }));
    let hL = 0;
    for (const b of bullets) hL += b.height + 10;
    const hR = payouts.length * 36 + 44;
    const H = Math.min(GAME.HEIGHT - 60, Math.max(hL, hR) + 190);
    const x0 = (GAME.WIDTH - W) / 2;
    const y0 = (GAME.HEIGHT - H) / 2 + 10;

    const panel = s.add.graphics();
    drawPanel(panel, x0, y0, W, H, { radius: 22, inner: true });
    panel.fillStyle(o.accent ?? COLORS.BRASS, 1);
    panel.fillRoundedRect(x0 + 24, y0 + 74, W - 48, 3, 1);
    // block clicks on the panel itself
    const block = s.add.zone(GAME.WIDTH / 2, y0 + H / 2, W, H).setInteractive();
    root.add([panel, block]);

    root.add(text(s, GAME.WIDTH / 2, y0 + 42, o.title ? `How to play: ${o.title}` : 'How to play', {
      size: FONT.SIZE.TITLE - 4, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD,
    }));

    let y = y0 + 98;
    const lx = x0 + 40;
    for (const b of bullets) {
      const dot = s.add.graphics();
      dot.fillStyle(o.accent ?? COLORS.BRASS, 1);
      dot.fillCircle(lx + 6, y + 14, 5);
      b.setPosition(lx + 22, y);
      root.add([dot, b]);
      y += b.height + 10;
    }

    if (twoCol) {
      const rx = x0 + 40 + colL + 10;
      const rw = W - (rx - x0) - 36;
      const tg = s.add.graphics();
      tg.fillStyle(0x000000, 0.3);
      tg.fillRoundedRect(rx, y0 + 92, rw, payouts.length * 36 + 48, 12);
      root.add(tg);
      root.add(text(s, rx + 16, y0 + 112, 'Bet', { size: FONT.SIZE.TINY, color: COLORS.TEXT_DIM, origin: [0, 0.5] }));
      root.add(text(s, rx + rw - 16, y0 + 112, 'Pays', { size: FONT.SIZE.TINY, color: COLORS.TEXT_DIM, origin: [1, 0.5] }));
      payouts.forEach(([name, pays], i) => {
        const py = y0 + 148 + i * 36;
        if (i % 2 === 0) {
          tg.fillStyle(0xffffff, 0.04);
          tg.fillRect(rx + 6, py - 17, rw - 12, 34);
        }
        root.add(text(s, rx + 16, py, String(name), { size: FONT.SIZE.SMALL, origin: [0, 0.5], color: COLORS.CREAM }));
        root.add(text(s, rx + rw - 16, py, String(pays), { size: FONT.SIZE.SMALL, origin: [1, 0.5], color: COLORS.GOLD_LIGHT, weight: FONT.WEIGHT.BOLD }));
      });
    }

    this.closeBtn = new Button(s, GAME.WIDTH / 2, y0 + H - 46, {
      label: 'Got it', hint: 'Esc', hotkey: ['ESC', 'ENTER'], style: 'gold', w: 200, h: 58, modal: true,
      onClick: () => this.close(),
    });
    root.add(this.closeBtn);

    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 150 });
    return this;
  }

  close(silent = false) {
    if (!this.root) return this;
    const root = this.root;
    this.root = null;
    // Deferred so the Esc that closed this can't also trigger a non-modal Esc (Lobby) in the same dispatch
    queueMicrotask(() => closeModal(this.scene));
    if (silent || !this.scene.sys.isActive()) {
      root.destroy();
      return this;
    }
    this.scene.tweens.add({ targets: root, alpha: 0, duration: 120, onComplete: () => root.destroy() });
    return this;
  }
}
