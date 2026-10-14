// =============================================================================
// Board — the roulette betting layout (drawing, hit cells, chip markers).
//
// A lightweight replacement for 49 BetSpots: one Graphics for the cloth and
// lines, one Zone per bet, one chip marker per bet. The board NEVER moves
// chips itself: the scene decides (wallet.bet / wallet.refund) and calls
// setAmount(id, n) to show the stack.
//
//   const board = new Board(scene, { depth, onBet(id), onUndo(id), onHover(id|null) });
//   board.setAmount('17', 25)       chip marker with the amount
//   board.showCover(id | null)      hover highlight of every number a bet covers
//   board.showWin(n)                winning number glow + dolly, winning outside cells lit
//   board.clearWin()
//   board.sweep(id, to) / board.pay(id, winnings, from) / board.collect(id, to)   visual only (Promises)
//   board.center(id)                {x, y} of a cell (tests click here)
// =============================================================================

import { canvasTexture } from '../../core/Textures.js';
import { CHIPS, COLORS, FONT } from '../../core/Constants.js';
import { text, fmtK } from '../../ui/theme.js';
import { BETS, betById, colorOf } from './logic.js';
import { RL_COLORS, COLOR_OF, TABLE, cellRect } from './config.js';

const CHIP_D = 40;     // marker diameter (game px)
const K = 2;           // texture scale

const rgb = (n, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
const shadeN = (n, f) => {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
};

/** Top-down chip without a printed value (the amount is drawn on top). */
function drawMarkerChip(ctx, s, chip) {
  const c = s / 2;
  const R = c - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(c + 1, c + 3, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(chip.color);
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(chip.edge);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(c, c, R, a - 0.14, a + 0.14);
    ctx.arc(c, c, R * 0.76, a + 0.14, a - 0.14, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgb(shadeN(chip.color, chip.value === 1 ? -0.05 : 0.14));
  ctx.beginPath(); ctx.arc(c, c, R * 0.66, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(chip.edge, 0.85);
  ctx.lineWidth = 1.2 * K;
  ctx.beginPath(); ctx.arc(c, c, R * 0.66, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1 * K;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(c, c, R - 1.5 * K, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
}

/** The "dolly": a cream marker with a gold paw that sits on the winning number. */
function drawDolly(ctx, s) {
  const c = s / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(c + 2, c + 6, c - 4, c - 8, 0, 0, Math.PI * 2); ctx.fill();
  // body (short cylinder)
  ctx.fillStyle = '#b9a888';
  ctx.beginPath(); ctx.ellipse(c, c + 4, c - 5, c - 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(5, c - 4, s - 10, 8);
  const top = ctx.createRadialGradient(c - 6, c - 10, 2, c, c - 4, c - 5);
  top.addColorStop(0, '#fffaf0'); top.addColorStop(1, '#e8dcc0');
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.ellipse(c, c - 4, c - 5, c - 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2;
  ctx.stroke();
  // paw
  ctx.fillStyle = '#d9a52e';
  ctx.beginPath(); ctx.ellipse(c, c - 1, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy] of [[-11, -9], [-4, -14], [4, -14], [11, -9]]) {
    ctx.beginPath(); ctx.ellipse(c + dx, c - 4 + dy * 0.75, 3.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export function makeBoardTextures(scene) {
  for (const chip of CHIPS) {
    const key = `rl-chip-${chip.value}`;
    if (!scene.textures.exists(key)) canvasTexture(scene, key, CHIP_D * K + 4, CHIP_D * K + 4, (ctx, w) => drawMarkerChip(ctx, w, chip));
  }
  if (!scene.textures.exists('rl-dolly')) canvasTexture(scene, 'rl-dolly', 64, 64, (ctx, w) => drawDolly(ctx, w));
}

/** Chip colour for an amount: the largest chip value that fits. */
export function chipFor(amount) {
  let best = CHIPS[0];
  for (const c of CHIPS) if (amount >= c.value) best = c;
  return best;
}

export class Board {
  constructor(scene, o = {}) {
    this.scene = scene;
    this.o = o;
    this.depth = o.depth ?? 100;
    this.locked = false;
    this.markers = new Map();
    this.cells = new Map();
    makeBoardTextures(scene);

    this.drawCloth();
    this.winG = scene.add.graphics().setDepth(this.depth + 2);
    this.hoverG = scene.add.graphics().setDepth(this.depth + 3);
    this.dolly = scene.add.image(0, 0, 'rl-dolly').setScale(0.62).setDepth(this.depth + 6).setVisible(false);

    for (const b of BETS) {
      const r = cellRect(b.id);
      this.cells.set(b.id, r);
      const z = scene.add.zone(r.cx, r.cy, r.w, r.h).setInteractive({ useHandCursor: true }).setDepth(this.depth + 1);
      z.on('pointerover', () => o.onHover?.(b.id));
      z.on('pointerout', () => o.onHover?.(null));
      z.on('pointerdown', (p) => {
        if (p.rightButtonDown && p.rightButtonDown()) o.onUndo?.(b.id);
        else o.onBet?.(b.id);
      });
      r.zone = z;
    }
  }

  center(id) {
    const r = this.cells.get(String(id));
    return r ? { x: r.cx, y: r.cy } : null;
  }

  /** Where a bet's chip sits: the centre, or the right end of wide outside cells (labels stay readable). */
  chipPos(id) {
    const r = this.cells.get(String(id));
    if (r.w >= 120) return { x: r.x + r.w - 26, y: r.cy };
    return { x: r.cx, y: r.cy };
  }

  setLocked(on) {
    this.locked = !!on;
    for (const r of this.cells.values()) if (r.zone.input) r.zone.input.cursor = on ? 'default' : 'pointer';
  }

  // --- drawing ----------------------------------------------------------------------------

  /**
   * The cloth, grid, numbers and labels are baked once into one canvas texture
   * (2x for crisp text): drawn as live Graphics + 49 Texts, the static layout
   * cost ~40 ms a frame under software WebGL (headless checks).
   */
  drawCloth() {
    const T = TABLE;
    const x0 = T.ZX - 14, y0 = T.TOP - 14, x1 = T.RIGHT + 14, y1 = T.BOTTOM + 12;
    const pad = 10;
    const ox = x0 - pad, oy = y0 - pad;
    const W = x1 - x0 + pad * 2, H = y1 - y0 + pad * 2;
    const key = 'rl-cloth';
    if (!this.scene.textures.exists(key)) {
      canvasTexture(this.scene, key, W * K, H * K, (ctx) => {
        ctx.scale(K, K);
        ctx.translate(-ox, -oy);
        const rr = (x, y, w, h, r) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        };
        const poly = (pts) => {
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        };
        // shadow + panel + brass trim
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        rr(x0 + 3, y0 + 7, x1 - x0, y1 - y0, 18); ctx.fill();
        ctx.fillStyle = rgb(RL_COLORS.FELT_EDGE);
        rr(x0, y0, x1 - x0, y1 - y0, 18); ctx.fill();
        ctx.fillStyle = rgb(RL_COLORS.FELT);
        rr(x0 + 5, y0 + 5, x1 - x0 - 10, y1 - y0 - 10, 14); ctx.fill();
        ctx.strokeStyle = rgb(RL_COLORS.BRASS, 0.9); ctx.lineWidth = 3;
        rr(x0, y0, x1 - x0, y1 - y0, 18); ctx.stroke();

        // number cells
        for (let n = 1; n <= 36; n++) {
          const r = cellRect(String(n));
          ctx.fillStyle = rgb(COLOR_OF[colorOf(n)]);
          ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, (r.h - 6) * 0.4);
        }
        // zero: pointed left end
        const z = cellRect('0');
        poly([
          { x: z.x + z.w - 3, y: z.y + 3 }, { x: z.x + 18, y: z.y + 3 }, { x: z.x + 3, y: z.cy },
          { x: z.x + 18, y: z.y + z.h - 3 }, { x: z.x + z.w - 3, y: z.y + z.h - 3 },
        ]);
        ctx.closePath();
        ctx.fillStyle = rgb(RL_COLORS.GREEN); ctx.fill();

        // grid lines
        ctx.strokeStyle = rgb(RL_COLORS.LINE, 0.85); ctx.lineWidth = 2;
        poly([
          { x: z.x + z.w, y: z.y }, { x: z.x + 16, y: z.y }, { x: z.x, y: z.cy },
          { x: z.x + 16, y: z.y + z.h }, { x: z.x + z.w, y: z.y + z.h },
        ]);
        ctx.stroke();
        for (const b of BETS) {
          if (b.id === '0') continue;
          const r = cellRect(b.id);
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
        // red / black diamonds
        for (const id of ['red', 'black']) {
          const r = cellRect(id);
          const w = 30, h = 17;
          poly([{ x: r.cx - w, y: r.cy }, { x: r.cx, y: r.cy - h }, { x: r.cx + w, y: r.cy }, { x: r.cx, y: r.cy + h }]);
          ctx.closePath();
          ctx.fillStyle = rgb(id === 'red' ? RL_COLORS.RED : RL_COLORS.BLACK); ctx.fill();
          ctx.strokeStyle = rgb(RL_COLORS.LINE, 0.9); ctx.lineWidth = 2; ctx.stroke();
        }
        // labels
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const label = (str, x, y, size, stroke) => {
          ctx.font = `${Math.round(size * (FONT.SCALE ?? 1))}px ${FONT.NUMBERS}`;
          if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = '#000000'; ctx.strokeText(str, x, y); }
          ctx.fillStyle = '#f6ecd4';
          ctx.fillText(str, x, y);
        };
        for (let n = 0; n <= 36; n++) {
          const r = cellRect(String(n));
          label(String(n), r.cx + (n === 0 ? 5 : 0), r.cy + 1, n === 0 ? 30 : 26, true);
        }
        for (const b of BETS) {
          if (b.kind === 'straight' || b.kind === 'red' || b.kind === 'black') continue;
          const r = cellRect(b.id);
          label(b.label.toUpperCase(), r.cx, r.cy + 1, 22, false);
        }
      });
    }
    this.cloth = this.scene.add.image(ox, oy, key).setOrigin(0, 0).setScale(1 / K).setDepth(this.depth);
  }

  /** Highlight every number a bet covers (null clears). */
  showCover(id) {
    const g = this.hoverG;
    g.clear();
    if (!id) return;
    const b = betById(id);
    if (!b) return;
    g.fillStyle(RL_COLORS.HOVER, 0.16);
    g.lineStyle(3, RL_COLORS.GOLD, 0.95);
    for (const n of b.covers) {
      const r = cellRect(String(n));
      g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    if (b.kind !== 'straight') {
      const r = cellRect(id);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      g.lineStyle(3, RL_COLORS.GOLD, 0.95);
      g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
  }

  /** Winning number glow + dolly; winning outside bets get a gold frame. */
  showWin(n, winningIds = []) {
    const g = this.winG;
    g.clear();
    this.scene.tweens.killTweensOf(g);
    for (const id of winningIds) {
      if (id === String(n)) continue;
      const r = cellRect(id);
      g.lineStyle(3, RL_COLORS.GOLD, 0.9);
      g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      g.fillStyle(RL_COLORS.GOLD, 0.12);
      g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    const r = cellRect(String(n));
    g.fillStyle(RL_COLORS.HOVER, 0.35);
    g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    g.lineStyle(5, RL_COLORS.GOLD, 1);
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.setAlpha(1);
    this.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.55 }, duration: 380, yoyo: true, repeat: 4 });
    // the dolly drops onto the number (top-right corner, so the chip stays visible)
    const dx = r.x + r.w - 9, dy = r.y + 9;
    this.dolly.setVisible(true).setScale(0.5).setPosition(dx, dy - 40).setAlpha(0);
    this.scene.tweens.add({ targets: this.dolly, y: dy, alpha: 1, duration: 320, ease: 'Bounce.easeOut' });
  }

  clearWin() {
    this.scene.tweens.killTweensOf(this.winG);
    this.winG.clear();
    this.scene.tweens.killTweensOf(this.dolly);
    this.dolly.setVisible(false);
  }

  // --- chip markers ------------------------------------------------------------------------

  makeMarker(amount, x, y, depth) {
    const s = this.scene;
    const c = s.add.container(x, y).setDepth(depth);
    const chip = chipFor(amount);
    const count = Math.min(3, Math.max(1, Math.ceil(Math.log10(amount + 1))));
    for (let i = count - 1; i >= 1; i--) {
      c.add(s.add.image(0, i * 3, `rl-chip-${chip.value}`).setScale(1 / K).setTint(0xb0b0b0));
    }
    c.add(s.add.image(0, 0, `rl-chip-${chip.value}`).setScale(1 / K));
    const label = text(s, 0, 0, fmtK(amount), {
      size: 20, num: true, color: chip.value === 1 ? COLORS.INK : 0xffffff,
      stroke: chip.value === 1 ? 0xffffff : 0x000000, strokeW: 3,
    });
    if (label.width > CHIP_D - 4) label.setScale((CHIP_D - 4) / label.width);
    c.add(label);
    c.amount = amount;
    return c;
  }

  /** Show (or remove, n = 0) the chip marker on a bet. pop = little bounce. */
  setAmount(id, amount, { pop = true } = {}) {
    const old = this.markers.get(id);
    old?.destroy();
    this.markers.delete(id);
    if (!(amount > 0)) return null;
    const p = this.chipPos(id);
    const m = this.makeMarker(amount, p.x, p.y, this.depth + 5);
    this.markers.set(id, m);
    if (pop) this.scene.tweens.add({ targets: m, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    return m;
  }

  clearMarkers() {
    for (const m of this.markers.values()) m.destroy();
    this.markers.clear();
  }

  /** A chip flies from (fx, fy) onto the bet. */
  flyChip(id, value, from) {
    const s = this.scene;
    const p = this.chipPos(id);
    const chip = s.add.image(from.x, from.y, `rl-chip-${value}`).setScale(1.2 / K).setDepth(this.depth + 7);
    s.tweens.add({
      targets: chip, x: p.x, y: p.y, scale: 1 / K, duration: 200, ease: 'Cubic.easeOut',
      onComplete: () => chip.destroy(),
    });
  }

  /** Losing chips slide to the croupier and fade (visual only). */
  sweep(id, to, delay = 0) {
    const m = this.markers.get(id);
    if (!m) return Promise.resolve();
    this.markers.delete(id);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: m, x: to.x, y: to.y, alpha: 0, scale: 0.6, duration: 460, delay, ease: 'Cubic.easeIn',
        onComplete: () => { m.destroy(); resolve(); },
      });
    });
  }

  /** The winnings stack slides from the croupier next to the bet (visual only). */
  pay(id, winnings, from, delay = 0) {
    const r = this.cells.get(id);
    const p = this.chipPos(id);
    const m = this.makeMarker(winnings, from.x, from.y, this.depth + 6);
    const wide = r.w >= 120;
    const tx = wide ? p.x - 30 : p.x + Math.min(22, r.w / 2 - 6), ty = wide ? p.y - 4 : p.y - 10;
    (this.payouts ||= new Map()).set(id, m);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: m, x: tx, y: ty, duration: 420, delay, ease: 'Cubic.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  /** Bet + winnings fly to the balance (visual only). */
  collect(id, to, delay = 0) {
    const parts = [this.markers.get(id), this.payouts?.get(id)].filter(Boolean);
    this.markers.delete(id);
    this.payouts?.delete(id);
    return Promise.all(parts.map((m, i) => new Promise((resolve) => {
      this.scene.tweens.add({
        targets: m, x: to.x, y: to.y, alpha: 0.2, scale: 0.6, duration: 520, delay: delay + i * 60, ease: 'Cubic.easeIn',
        onComplete: () => { m.destroy(); resolve(); },
      });
    })));
  }

  destroy() {
    this.clearMarkers();
    for (const m of this.payouts?.values() || []) m.destroy();
  }
}

