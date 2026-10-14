// =============================================================================
// PlinkoScene — Booker drops tennis balls down 12 rows of neon pegs; Soba
// watches the bins.
//
// Each drop is its own round: wallet.bet() when the ball leaves the chute, the
// path (12 fair left/right steps) comes from this.rng FIRST (logic.js), and the
// ball then animates peg to peg along exactly that path. settle() pays when it
// lands. Up to 10 balls fly at once; risk is locked while any are in flight.
//
// Keys: Space = drop (hold to repeat), A = Auto x10 (again = stop),
//       - / + (or arrows) = bet, R = next risk, Esc = lobby.
// Debug (?debug=1): window.__CASINO__.force.plinko([12, 0, 6]) forces the next bins.
// =============================================================================

import { BaseGameScene } from '../BaseGameScene.js';
import { CHIPS, COLORS, DEPTH, FONT } from '../../core/Constants.js';
import { wallet, rng as rootRng } from '../../core/Casino.js';
import { Events, listen } from '../../core/EventBus.js';
import { canvasTexture } from '../../core/Textures.js';
import { text, fmt, fmtK, drawPanel, modalOpen, shade } from '../../ui/index.js';
import { playSfx, panOfX } from '../../audio/sfx.js';
import { plinkoSfx } from './sounds.js';
import { PLINKO as C, binColor } from './config.js';
import {
  ROWS, BINS, RISKS, RISK_LABELS, MULTIPLIERS, MAX_IN_FLIGHT, AUTO_COUNT, AUTO_GAP_MS,
  generatePath, pathToBin, pegOffset, binOffset, payoutFor, multiplier, stepBet, allowedBets, fmtMult, exactRtp,
} from './logic.js';

// Remembered while the page is open (risk and bet survive lobby trips)
const memo = { risk: 'medium', bet: 10 };

const rowY = (r) => C.ROW0_Y + r * C.DY;
const binX = (bin) => C.CX + binOffset(bin) * C.DX;
const CONTACT = C.PEG_R + C.BALL_SIZE / 2 - 1; // ball centre sits this far above a peg it touches

function rulesConfig() {
  const half = (r) => MULTIPLIERS[r].slice(0, 7).map(fmtMult).join(', ');
  const pct = (r) => `${(exactRtp(r).rtp * 100).toFixed(2)}%`;
  return {
    lines: [
      'Set your bet per ball with - and +, then DROP (Space). Hold Space to keep dropping.',
      'Booker lets the tennis ball go. At each of the 12 rows it bounces left or right, 50/50.',
      'The bin it lands in multiplies your bet. Middle bins are common; the edges are rare.',
      'Risk sets the multipliers. High pays up to 170x but mostly 0.2x. Locked while balls fly.',
      'Auto x10 drops ten balls (A). Up to 10 balls can be in the air at once.',
    ],
    payouts: [
      ['Risk', 'edge ... middle'],
      ['Low', half('low')],
      ['Medium', half('medium')],
      ['High', half('high')],
      ['Return', `${pct('low')} / ${pct('medium')} / ${pct('high')}`],
    ],
  };
}

const FLOAT_MERGE_MS = 650;
/** Bet panel chip: the largest chip that fits in the bet (50 -> 25, 250 -> 100). */
function chipKeyFor(bet) {
  let key = CHIPS[0].key;
  for (const c of CHIPS) if (c.value <= bet) key = c.key;
  return key;
}

export class PlinkoScene extends BaseGameScene {
  constructor() {
    super('Plinko', {
      id: 'plinko',
      booker: 'booker-plinko',
      bookerSlot: C.BOOKER,
      rules: rulesConfig(),
    });
    this.forceQueue = [];
  }

  init() {
    super.init();
    this.balls = [];
    this.history = [];            // newest first: { bin, mult, bet, paid, risk }
    this.historyItems = [];
    this.totals = { balls: 0, wagered: 0, paid: 0 };
    this.auto = { left: 0, nextAt: 0 };
    this.ballSeq = 0;
    this.space = { held: false, nextAt: 0 };
    this.react = { soba: { at: -1e9, rank: 0 }, booker: { at: -1e9, rank: 0 } };
    this.sobaWorried = false;
    this.lastBigAt = -1e9;
    this.binFloats = [];          // per bin: { t, at, sum, count, win } (float merging)
  }

  create() {
    super.create();
    this.risk = memo.risk;
    this.bet = memo.bet;
    this.fx = rootRng.stream('plinko-fx'); // cosmetic jitter only; never decides outcomes
    this.makeTextures();
    this.buildCabinet();
    this.buildPegs();
    this.buildBins();
    this.buildChute();
    this.buildSign();
    this.buildRiskPanel();
    this.buildHistory();
    this.buildControls();
    this.buildEffects();

    this.soba.bubbleSide = 'top';
    // Booker talks into the gap between his frame and the history column (never over "LAST 10")
    if (this.booker) { this.booker.bubbleSide = 'right'; this.booker.bubbleWidth = 144; }

    // Space: the keydown event drops (a tap never gets lost), holding repeats (update)
    this.spaceKey = this.input.keyboard?.addKey('SPACE');
    this.input.keyboard?.on('keydown-SPACE', this.onSpaceDown, this);
    this.input.keyboard?.on('keydown-R', this.onRiskKey, this);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-SPACE', this.onSpaceDown, this);
      this.input.keyboard?.off('keydown-R', this.onRiskKey, this);
    });
    listen(this, Events.VIP_UP, () => this.time.delayedCall(0, () => this.refreshUi()));
    listen(this, Events.BALANCE_CHANGED, () => this.refreshUi());

    this.installDebugHook();
    this.applyRisk(false);
    this.refreshUi();
    this.time.delayedCall(450, () => this.say('booker', 'Step right up! Twelve rows of pegs. Where will it land?', 2600));
  }

  // --- textures ----------------------------------------------------------------------

  makeTextures() {
    if (!this.textures.exists('plinko-peg')) {
      canvasTexture(this, 'plinko-peg', 20, 20, (ctx) => {
        const g = ctx.createRadialGradient(8, 8, 0.5, 10, 10, 9);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.55, '#e4d4ff');
        g.addColorStop(1, '#9b7be0');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(10, 10, 9, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  // --- board ---------------------------------------------------------------------------

  buildCabinet() {
    const { x, y, w, h } = C.CABINET;
    const g = this.add.graphics().setDepth(DEPTH.TABLE);
    // outer neon glow
    for (const [lw, a] of [[16, 0.05], [10, 0.08], [5, 0.14]]) {
      g.lineStyle(lw, C.NEON_DEEP, a);
      g.strokeRoundedRect(x, y, w, h, 22);
    }
    g.fillStyle(0x07040e, 0.72);
    g.fillRoundedRect(x, y, w, h, 22);
    // faint grid on the back wall
    g.lineStyle(1, C.NEON_DEEP, 0.07);
    for (let gx = x + 24; gx < x + w; gx += 26) g.lineBetween(gx, y + 10, gx, y + h - 10);
    for (let gy = y + 20; gy < y + h; gy += 26) g.lineBetween(x + 10, gy, x + w - 10, gy);
    g.lineStyle(2, C.NEON, 0.85);
    g.strokeRoundedRect(x, y, w, h, 22);
    g.lineStyle(1, 0xffffff, 0.08);
    g.strokeRoundedRect(x + 6, y + 6, w - 12, h - 12, 17);

    // funnel rails along the triangle's edges
    const r = this.add.graphics().setDepth(DEPTH.TABLE + 2);
    const off = 16;
    const top = rowY(0) - 22;
    const bot = C.BIN_TOP - 6;
    const xAt = (yy, side) => {
      const rr = (yy - C.ROW0_Y) / C.DY;
      return C.CX + side * (((rr + 2) / 2) * C.DX + off);
    };
    for (const side of [-1, 1]) {
      const x0 = xAt(top, side);
      const x1 = xAt(bot, side);
      for (const [lw, col, a] of [[9, C.NEON_HOT, 0.10], [4, C.NEON_HOT, 0.25], [2, 0xffd6f4, 0.9]]) {
        r.lineStyle(lw, col, a);
        r.lineBetween(x0, top, x1, bot);
      }
    }
    // bin shelf
    const sx0 = binX(0) - C.DX / 2 - 8;
    const sx1 = binX(12) + C.DX / 2 + 8;
    const sy = C.BIN_TOP + C.BIN_H + 6;
    r.fillStyle(0x000000, 0.45);
    r.fillRoundedRect(sx0, sy - 2, sx1 - sx0, 10, 4);
    r.lineStyle(2, C.NEON, 0.8);
    r.lineBetween(sx0 + 6, sy, sx1 - 6, sy);
  }

  buildPegs() {
    this.pegs = [];
    const scale = (C.PEG_R * 2) / 18;
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let i = 0; i < r + 3; i++) {
        const x = C.CX + (i - (r + 2) / 2) * C.DX;
        const y = rowY(r);
        const glow = this.add.image(x, y, 'ui-glow').setDepth(DEPTH.GAME + 1).setBlendMode('ADD')
          .setTint(C.NEON).setAlpha(0.2).setScale(0.26);
        const dot = this.add.image(x, y, 'plinko-peg').setDepth(DEPTH.GAME + 2).setScale(scale);
        row.push({ x, y, glow, dot, heat: 0, scale, hot: false });
      }
      this.pegs.push(row);
    }
  }

  buildBins() {
    this.bins = [];
    const w = C.DX - C.BIN_GAP;
    const h = C.BIN_H;
    for (let k = 0; k < BINS; k++) {
      const x = binX(k);
      const y = C.BIN_TOP + h / 2;
      const glow = this.add.image(x, y, 'ui-glow').setDepth(DEPTH.GAME + 3).setBlendMode('ADD')
        .setTint(binColor(k)).setAlpha(0.22).setScale(0.62, 0.42);
      const box = this.add.container(x, y).setDepth(DEPTH.GAME + 4);
      const g = this.add.graphics();
      const flash = this.add.graphics();
      flash.fillStyle(0xffffff, 1);
      flash.fillRoundedRect(-w / 2, -h / 2, w, h, 9);
      flash.setAlpha(0);
      const label = text(this, 0, 1, '', { size: 20, num: true, color: COLORS.INK });
      box.add([g, label, flash]);
      this.bins.push({ x, y, w, h, box, g, flash, label, glow });
    }
  }

  drawBin(k) {
    const b = this.bins[k];
    const col = binColor(k);
    const { w, h, g } = b;
    g.clear();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, 9);
    g.fillStyle(shade(col, -0.35), 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h - 3, 9);
    g.fillStyle(col, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h - 4, 9);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 2, w - 6, (h - 4) * 0.38, { tl: 7, tr: 7, bl: 3, br: 3 });
    g.lineStyle(2, shade(col, 0.45), 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h - 4, 9);
    const m = MULTIPLIERS[this.risk][k];
    const str = fmtMult(m);
    b.label.setText(`${str}x`);
    b.label.setColor(k === 6 || Math.abs(k - 6) <= 2 ? '#ffffff' : '#1a120b');
    if (Math.abs(k - 6) <= 2) b.label.setStroke('#1a1240', 3); else b.label.setStroke('#000000', 0);
    // keep long labels inside the box
    b.label.setScale(1);
    if (b.label.width > w - 4) b.label.setScale((w - 4) / b.label.width);
  }

  buildChute() {
    const cx = C.CX;
    const g = this.add.graphics().setDepth(DEPTH.GAME + 6);
    // pipe from Booker's seat to the chute
    const py = 92;
    const px1 = C.BOOKER.x - C.BOOKER.size / 2 + 4;
    g.fillStyle(0x1a0f2e, 1);
    g.fillRoundedRect(cx + 10, py - 9, px1 - cx - 10, 18, 9);
    g.lineStyle(2, C.NEON, 0.9);
    g.strokeRoundedRect(cx + 10, py - 9, px1 - cx - 10, 18, 9);
    g.lineStyle(1, 0xffffff, 0.15);
    g.lineBetween(cx + 18, py - 4, px1 - 8, py - 4);
    // funnel
    g.fillStyle(0x1a0f2e, 1);
    g.fillPoints([{ x: cx - 30, y: 78 }, { x: cx + 30, y: 78 }, { x: cx + 15, y: C.CHUTE_Y + 8 }, { x: cx - 15, y: C.CHUTE_Y + 8 }], true);
    g.lineStyle(2, C.NEON_HOT, 1);
    g.strokePoints([{ x: cx - 30, y: 78 }, { x: cx + 30, y: 78 }, { x: cx + 15, y: C.CHUTE_Y + 8 }, { x: cx - 15, y: C.CHUTE_Y + 8 }], true);
    this.chuteGlow = this.add.image(cx, C.CHUTE_Y + 8, 'ui-glow').setDepth(DEPTH.GAME + 5).setBlendMode('ADD')
      .setTint(C.NEON_HOT).setAlpha(0.3).setScale(0.6, 0.35);
    this.pipePulse = this.add.image(px1, py, 'ui-glow').setDepth(DEPTH.GAME + 7).setBlendMode('ADD')
      .setTint(C.BALL_TRAIL).setAlpha(0).setScale(0.3);
    this.pipe = { x0: px1 - 6, x1: cx + 16, y: py };
  }

  buildSign() {
    const sx = 432;
    const sy = 128;
    this.signGlow = this.add.image(sx, sy, 'ui-glow').setDepth(DEPTH.TABLE + 3).setBlendMode('ADD')
      .setTint(C.NEON_HOT).setAlpha(0.32).setScale(2.0, 0.75);
    this.sign = text(this, sx, sy, 'PLINKO', { display: true, size: 40, color: 0xffd6f4, stroke: C.NEON_HOT, strokeW: 4 })
      .setDepth(DEPTH.TABLE + 4);
    this.subSign = text(this, sx, sy + 42, '', { size: 22, num: true, color: COLORS.GOLD_LIGHT }).setDepth(DEPTH.TABLE + 4);
    // neon flicker
    this.tweens.add({ targets: [this.sign, this.signGlow], alpha: { from: 1, to: 0.82 }, duration: 90, yoyo: true, repeat: -1, repeatDelay: 2600, hold: 60 });
  }

  // --- side panels -------------------------------------------------------------------------

  buildRiskPanel() {
    const p = C.RISK_PANEL;
    const g = this.add.graphics().setDepth(DEPTH.UI - 1);
    drawPanel(g, p.x, p.y, p.w, p.h, { radius: 18, edge: C.NEON_DEEP, inner: true, fill: 0x140b20 });
    const cx = p.x + p.w / 2;
    text(this, cx, p.y + 30, 'RISK', { display: true, size: 24, color: C.NEON }).setDepth(DEPTH.UI);
    this.riskBtns = {};
    RISKS.forEach((r, i) => {
      this.riskBtns[r] = this.addButton(cx, p.y + 86 + i * 70, {
        label: RISK_LABELS[r], style: 'secondary', w: 184, h: 58, size: 26,
        onClick: () => this.setRisk(r),
      });
    });
    this.riskInfo = text(this, cx, p.y + 300, '', { size: 20, color: COLORS.TEXT_DIM, wrap: p.w - 24 }).setDepth(DEPTH.UI);
    this.riskLock = text(this, cx, p.y + 342, 'Locked while balls fly', { size: 20, color: COLORS.WARN, wrap: p.w - 20 })
      .setDepth(DEPTH.UI).setAlpha(0);
  }

  buildHistory() {
    const p = C.HISTORY;
    // below the character layer, so Booker's speech bubble draws over it
    const d = DEPTH.CHARACTERS - 20;
    const g = this.add.graphics().setDepth(d);
    drawPanel(g, p.x, p.y, p.w, p.h, { radius: 18, edge: C.NEON_DEEP, inner: true, fill: 0x140b20 });
    text(this, p.x + p.w / 2, p.y + 30, 'LAST 10', { display: true, size: 22, color: C.NEON }).setDepth(d + 1);
    this.historyEmpty = text(this, p.x + p.w / 2, p.y + 120, 'Drop a ball!', { size: 20, color: COLORS.TEXT_DIM }).setDepth(d + 1);
  }

  historySlotY(i) {
    return C.HISTORY.y + 76 + i * 43;
  }

  pushHistory(entry) {
    this.history.unshift(entry);
    if (this.history.length > 10) this.history.length = 10;
    this.historyEmpty?.setVisible(false);
    const p = C.HISTORY;
    const cx = p.x + p.w / 2;
    const w = p.w - 30;
    const h = 36;
    const col = binColor(entry.bin);
    const item = this.add.container(cx, this.historySlotY(0)).setDepth(DEPTH.CHARACTERS - 18);
    const g = this.add.graphics();
    g.fillStyle(shade(col, -0.4), 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 12);
    g.fillStyle(col, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h - 2, 12);
    g.fillStyle(0xffffff, 0.2);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 2, w - 6, 12, { tl: 9, tr: 9, bl: 2, br: 2 });
    const light = Math.abs(entry.bin - 6) <= 2;
    const t = text(this, 0, 0, `${fmtMult(entry.mult)}x`, {
      size: 22, num: true, color: light ? 0xffffff : COLORS.INK, stroke: light ? 0x1a1240 : null, strokeW: 3,
    });
    item.add([g, t]);
    item.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: item, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.historyItems.unshift(item);
    this.historyItems.forEach((it, i) => {
      if (i === 0) return;
      if (i >= 10) {
        this.tweens.add({ targets: it, alpha: 0, y: this.historySlotY(10), duration: 180, onComplete: () => it.destroy() });
      } else {
        this.tweens.add({ targets: it, y: this.historySlotY(i), duration: 180, ease: 'Quad.easeOut' });
      }
    });
    if (this.historyItems.length > 10) this.historyItems.length = 10;
  }

  // --- controls ---------------------------------------------------------------------------

  buildControls() {
    const bp = C.BET_PANEL;
    const g = this.add.graphics().setDepth(DEPTH.UI - 1);
    drawPanel(g, bp.x, bp.y, bp.w, bp.h, { radius: 18, edge: C.NEON_DEEP, inner: true, fill: 0x140b20 });
    const cx = bp.x + bp.w / 2;
    text(this, cx, bp.y + 18, 'BET PER BALL', { size: 20, color: COLORS.TEXT_DIM }).setDepth(DEPTH.UI);
    const rowYc = bp.y + 60;
    this.minusBtn = this.addButton(bp.x + 50, rowYc, {
      label: '-', w: 68, h: 56, size: 34, style: 'secondary', hotkey: ['MINUS', 'LEFT', 'DOWN'],
      onClick: () => this.changeBet(-1),
    });
    this.plusBtn = this.addButton(bp.x + bp.w - 50, rowYc, {
      label: '+', w: 68, h: 56, size: 34, style: 'secondary', hotkey: ['PLUS', 'RIGHT', 'UP'],
      onClick: () => this.changeBet(1),
    });
    this.betChip = this.add.image(cx - 66, rowYc, chipKeyFor(this.bet)).setDisplaySize(38, 38).setDepth(DEPTH.UI);
    this.betText = text(this, cx + 14, rowYc, fmt(this.bet), { size: 34, num: true, color: COLORS.GOLD_LIGHT }).setDepth(DEPTH.UI);

    const a = C.AUTO_BTN;
    this.autoBtn = this.addButton(a.x, a.y, {
      label: `Auto x${AUTO_COUNT}`, hint: 'A', hotkey: 'A', w: a.w, h: a.h, color: 0x5b3a9e, style: 'primary',
      onClick: () => this.toggleAuto(),
    });
    const d = C.DROP_BTN;
    this.dropBtn = this.addButton(d.x, d.y, {
      label: 'DROP', hint: 'Space (hold)', w: d.w, h: d.h, style: 'gold', size: 34, sfx: null,
      onClick: () => this.drop(),
    });

    const f = C.FLIGHT;
    text(this, f.x, f.y - 22, 'IN PLAY', { size: 20, color: COLORS.TEXT_DIM }).setDepth(DEPTH.UI);
    this.flightText = text(this, f.x, f.y + 12, `0/${MAX_IN_FLIGHT}`, { size: 30, num: true, color: COLORS.CREAM }).setDepth(DEPTH.UI);
  }

  buildEffects() {
    this.trailG = this.add.graphics().setDepth(DEPTH.GAME + 9).setBlendMode('ADD');
    this.coinFx = this.add.particles(0, 0, 'particle-coin', {
      emitting: false, speed: { min: 160, max: 380 }, angle: { min: 235, max: 305 }, gravityY: 900,
      lifespan: 950, scale: { start: 1.1, end: 0.6 }, rotate: { min: 0, max: 360 },
    }).setDepth(DEPTH.FLOAT - 2);
    this.sparkFx = this.add.particles(0, 0, 'particle-spark', {
      emitting: false, speed: { min: 60, max: 220 }, angle: { min: 200, max: 340 }, lifespan: 420,
      scale: { start: 0.9, end: 0 }, blendMode: 'ADD',
    }).setDepth(DEPTH.GAME + 8);
    this.pegFx = this.add.particles(0, 0, 'particle-spark', {
      emitting: false, speed: { min: 30, max: 90 }, lifespan: 240, scale: { start: 0.45, end: 0 }, blendMode: 'ADD',
      tint: [C.NEON_HOT, C.NEON, 0xffffff],
    }).setDepth(DEPTH.GAME + 8);
  }

  // --- state changes ----------------------------------------------------------------------

  setRisk(r) {
    if (r === this.risk) return;
    if (this.balls.length) {
      this.toast('Wait for the balls to land', 'warn');
      return;
    }
    this.risk = r;
    memo.risk = r;
    playSfx('chip');
    this.applyRisk(true);
    if (r === 'high') this.say('soba', 'High risk? My paws are sweating...', 1800);
  }

  onRiskKey() {
    if (modalOpen(this)) return;
    const i = RISKS.indexOf(this.risk);
    this.setRisk(RISKS[(i + 1) % RISKS.length]);
  }

  applyRisk(animate) {
    for (let k = 0; k < BINS; k++) {
      this.drawBin(k);
      if (animate) {
        const b = this.bins[k];
        b.box.setScale(1, 0.4);
        this.tweens.add({ targets: b.box, scaleY: 1, duration: 260, delay: Math.abs(k - 6) * 35, ease: 'Back.easeOut' });
      }
    }
    for (const r of RISKS) {
      const b = this.riskBtns[r];
      const on = r === this.risk;
      b.o.color = on ? 0x7a48d6 : undefined;
      b.styleName = on ? 'primary' : 'secondary';
      b.draw();
    }
    const top = MULTIPLIERS[this.risk][0];
    const mid = MULTIPLIERS[this.risk][6];
    this.subSign.setText(`UP TO ${fmtMult(top)}x`);
    this.riskInfo.setText(`Edges ${fmtMult(top)}x\nMiddle ${fmtMult(mid)}x`);
    this.refreshUi();
  }

  changeBet(dir) {
    const max = wallet.maxBet();
    const next = stepBet(this.bet, dir, max);
    if (next === this.bet) {
      if (dir > 0) this.toast(this.bet >= max && max < 2500 ? `Table limit is ${fmt(max)} (VIP)` : 'That is the top bet', 'warn');
      else this.toast('Minimum bet is 10', 'warn');
      return;
    }
    this.bet = next;
    memo.bet = next;
    this.betText.setText(fmt(next));
    this.betChip.setTexture(chipKeyFor(next)).setDisplaySize(38, 38);
    this.tweens.killTweensOf(this.betText);
    this.betText.setScale(1.25);
    this.tweens.add({ targets: this.betText, scale: 1, duration: 180, ease: 'Back.easeOut' });
    playSfx('chip', { gain: 0.8 });
    this.refreshUi();
  }

  refreshUi() {
    if (!this.dropBtn?.active) return;
    // table limit can only grow, but a remembered bet may be over it
    const max = wallet.maxBet();
    if (this.bet > max) {
      this.bet = stepBet(this.bet, 0, max);
      memo.bet = this.bet;
      this.betText.setText(fmt(this.bet));
      this.betChip.setTexture(chipKeyFor(this.bet)).setDisplaySize(38, 38);
    }
    const list = allowedBets(max);
    this.minusBtn.setEnabled(this.bet > list[0]);
    this.plusBtn.setEnabled(true);
    const flying = this.balls.length;
    for (const r of RISKS) this.riskBtns[r].setEnabled(!flying || r === this.risk);
    this.riskLock.setAlpha(flying ? 1 : 0);
    this.flightText.setText(`${flying}/${MAX_IN_FLIGHT}`);
    this.flightText.setColor(flying >= MAX_IN_FLIGHT ? '#f0a43a' : '#f6ecd4');
    this.dropBtn.setEnabled(flying < MAX_IN_FLIGHT);
  }

  toggleAuto() {
    if (this.auto.left > 0) {
      this.stopAuto();
      return;
    }
    if (wallet.balance < this.bet) {
      this.toast(wallet.balance < 10 ? 'Out of chips! The cashier is in the lobby' : 'Not enough chips for that bet', 'warn');
      return;
    }
    this.auto.left = AUTO_COUNT;
    this.auto.nextAt = this.time.now;
    this.autoBtn.setLabel('Stop').setHint(`${AUTO_COUNT} left`);
    this.autoBtn.o.color = 0xa8322a;
    this.autoBtn.draw();
  }

  stopAuto() {
    this.auto.left = 0;
    if (!this.autoBtn?.active) return;
    this.autoBtn.setLabel(`Auto x${AUTO_COUNT}`).setHint('A');
    this.autoBtn.o.color = 0x5b3a9e;
    this.autoBtn.draw();
  }

  // --- dropping ------------------------------------------------------------------------------

  /** Drop one ball. opts.quiet: no toast when refused (held Space / auto). Returns true if it dropped. */
  drop(opts = {}) {
    if (this.balls.length >= MAX_IN_FLIGHT) {
      if (!opts.quiet) this.toast(`${MAX_IN_FLIGHT} balls max. Wait for one to land`, 'warn');
      return false;
    }
    const bet = this.bet;
    const why = wallet.whyNot(bet);
    if (why) {
      if (!opts.quiet || opts.auto) {
        this.toast(wallet.balance < 10 ? 'Out of chips! The cashier is in the lobby' : `${why}. Lower the bet`, 'warn');
        this.soba.react('nervous', 900);
      }
      return false;
    }
    if (!wallet.bet(this.id, bet)) return false;

    // OUTCOME FIRST: 12 fair steps from the game's RNG stream (or a debug force)
    const forced = this.forceQueue.length ? this.forceQueue.shift() : null;
    const path = forced !== null ? pathToBin(forced, this.fx) : generatePath(this.rng);
    this.beginRound();
    this.spawnBall({ bet, risk: this.risk, ...path });
    this.totals.balls += 1;
    this.totals.wagered += bet;

    // Booker lets it go
    plinkoSfx('chute', { gain: 0.7 });
    playSfx('ballDrop', { gain: 0.5 });
    this.pipePulse.setPosition(this.pipe.x0, this.pipe.y).setAlpha(0.9);
    this.tweens.killTweensOf(this.pipePulse);
    this.tweens.add({ targets: this.pipePulse, x: this.pipe.x1, duration: 120, ease: 'Quad.easeIn', onComplete: () => this.pipePulse.setAlpha(0) });
    this.tweens.killTweensOf(this.chuteGlow);
    this.chuteGlow.setAlpha(0.95);
    this.tweens.add({ targets: this.chuteGlow, alpha: 0.3, duration: 320 });
    // (scale only: CharacterPortrait owns the container's y/angle tweens)
    if (this.booker && !this.bookerToss?.isPlaying()) {
      this.booker.setScale(1);
      this.bookerToss = this.tweens.add({ targets: this.booker, scaleX: 1.05, scaleY: 0.95, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    }
    if (this.dropBtn && opts.quiet) {
      this.tweens.add({ targets: this.dropBtn, scaleX: 1.04, scaleY: 0.92, duration: 60, yoyo: true });
    }
    this.refreshUi();
    return true;
  }

  spawnBall({ bet, risk, steps, bin }) {
    const fx = this.fx;
    const pts = [];
    let rights = 0;
    for (let r = 0; r < ROWS; r++) {
      const dir = steps[r] ? 1 : -1;
      const off = pegOffset(r, rights);
      const pegX = C.CX + off * C.DX;
      pts.push({
        x: pegX + dir * (1.5 + fx.next() * 2.5),
        y: rowY(r) - CONTACT,
        row: r,
        col: off + (r + 2) / 2,
        dir,
      });
      rights += steps[r];
    }
    const segs = [];
    // chute -> first peg (straight fall)
    segs.push({ x0: C.CX + (fx.next() - 0.5) * 3, y0: C.CHUTE_Y, x1: pts[0].x, y1: pts[0].y, dur: C.T.CHUTE, hop: 0, hit: pts[0], dir: pts[0].dir, fall: true });
    for (let r = 0; r < ROWS; r++) {
      const from = pts[r];
      const to = r + 1 < ROWS ? pts[r + 1] : { x: binX(bin) + (fx.next() - 0.5) * 6, y: C.BIN_TOP + 10, land: true };
      segs.push({
        x0: from.x, y0: from.y, x1: to.x, y1: to.y,
        dur: to.land ? C.T.LAND : C.T.HOP + (fx.next() - 0.5) * C.T.HOP_JITTER,
        hop: to.land ? 8 : 9 + fx.next() * 5,
        hit: to.land ? null : to,
        dir: from.dir,
        land: !!to.land,
      });
    }
    const size = C.BALL_SIZE;
    const img = this.add.image(segs[0].x0, segs[0].y0, 'sym-ball').setDepth(DEPTH.GAME + 10 + (this.ballSeq % 10) * 0.01);
    const base = size / Math.max(img.width, img.height);
    img.setScale(base * 0.6).setAngle(fx.next() * 360);
    const ball = {
      id: ++this.ballSeq, bet, risk, bin, steps, segs, seg: 0, t: 0, img, base, sq: 0, grow: 0.6,
      trail: [], row: -1, x: segs[0].x0, y: segs[0].y0, spin: (fx.next() < 0.5 ? -1 : 1),
    };
    this.balls.push(ball);
    return ball;
  }

  // --- per frame -------------------------------------------------------------------------

  update(time, delta) {
    const dt = Math.min(delta, 50);
    this.updateBalls(dt);
    this.updatePegs(time, dt);
    this.updateTrails();
    this.updateSpace(time);
    this.updateAuto(time);
    this.updateMoods();
  }

  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      let landed = false;
      while (b.seg < b.segs.length && b.t >= b.segs[b.seg].dur) {
        const s = b.segs[b.seg];
        b.t -= s.dur;
        if (s.hit) this.hitPeg(b, s.hit);
        if (s.land) { landed = true; break; }
        b.seg += 1;
      }
      if (landed) {
        b.x = b.segs[b.seg].x1;
        b.y = b.segs[b.seg].y1;
        this.balls.splice(i, 1);
        this.land(b);
        continue;
      }
      const s = b.segs[b.seg];
      const u = Math.min(1, b.t / s.dur);
      // x linear, y = gravity-style fall plus an upward hop off the peg (0 at both ends)
      b.x = s.x0 + (s.x1 - s.x0) * u;
      b.y = s.y0 + (s.y1 - s.y0) * u * u - s.hop * 4 * u * (1 - u);
      b.row = s.hit ? s.hit.row : b.row;
      b.img.angle += s.dir * b.spin * dt * 0.55;
      b.sq *= Math.exp(-dt / 70);
      b.grow += (1 - b.grow) * Math.min(1, dt / 90);
      const k = b.base * b.grow;
      b.img.setPosition(b.x, b.y);
      b.img.setScale(k * (1 + 0.22 * b.sq), k * (1 - 0.22 * b.sq));
      b.trail.push(b.x, b.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);
    }
  }

  hitPeg(ball, hit) {
    const peg = this.pegs[hit.row]?.[hit.col];
    ball.sq = 1;
    ball.lastRow = hit.row;
    if (peg) {
      peg.heat = 1;
      this.pegFx.explode(3, peg.x, peg.y - 2);
    }
    playSfx('peg', { note: hit.row, gain: 0.45, pan: panOfX(hit.x) });
  }

  updatePegs(time, dt) {
    const decay = Math.exp(-dt / 160);
    for (let r = 0; r < this.pegs.length; r++) {
      const wave = 0.15 + 0.08 * Math.sin(time * 0.0022 - r * 0.5);
      for (const p of this.pegs[r]) {
        if (p.heat > 0.002) p.heat *= decay; else p.heat = 0;
        const h = p.heat;
        p.glow.setAlpha(Math.min(1, wave + h * 0.85));
        p.glow.setScale(0.26 + h * 0.22);
        p.dot.setScale(p.scale * (1 + h * 0.55));
        const hot = h > 0.25;
        if (hot !== p.hot) {
          p.hot = hot;
          p.glow.setTint(hot ? C.NEON_HOT : C.NEON);
          if (hot) p.dot.setTint(0xffffff); else p.dot.clearTint();
        }
      }
    }
  }

  updateTrails() {
    const g = this.trailG;
    g.clear();
    for (const b of this.balls) {
      const n = b.trail.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const f = (i + 1) / n;
        g.fillStyle(C.BALL_TRAIL, 0.32 * f);
        g.fillCircle(b.trail[i * 2], b.trail[i * 2 + 1], (C.BALL_SIZE / 2) * (0.35 + 0.55 * f));
      }
    }
  }

  onSpaceDown(e) {
    if (e?.repeat || modalOpen(this)) return;
    this.space.held = true;
    this.space.nextAt = this.time.now + C.T.SPACE_DELAY;
    if (!this.dropBtn.press()) this.drop(); // disabled at 10 in flight: say why
  }

  updateSpace(time) {
    if (!this.space.held) return;
    if (!this.spaceKey?.isDown || modalOpen(this)) {
      this.space.held = false;
      return;
    }
    if (time >= this.space.nextAt) {
      this.drop({ quiet: true });
      this.space.nextAt = time + C.T.SPACE_REPEAT;
    }
  }

  updateAuto(time) {
    if (this.auto.left <= 0 || time < this.auto.nextAt) return;
    if (modalOpen(this)) return;
    if (this.balls.length >= MAX_IN_FLIGHT) {
      this.auto.nextAt = time + 60; // wait for a free slot
      return;
    }
    if (!this.drop({ quiet: true, auto: true })) {
      this.stopAuto();
      return;
    }
    this.auto.left -= 1;
    this.auto.nextAt = time + AUTO_GAP_MS;
    if (this.auto.left > 0) this.autoBtn.setHint(`${this.auto.left} left`);
    else this.stopAuto();
  }

  updateMoods() {
    // Soba sweats while a High-risk ball runs along an edge low on the board
    let worried = false;
    for (const b of this.balls) {
      if (b.risk !== 'high' || b.row < 6) continue;
      const off = Math.abs(b.x - C.CX) / C.DX;
      if (off >= 3.2) { worried = true; break; }
    }
    if (worried !== this.sobaWorried) {
      this.sobaWorried = worried;
      this.soba.setMood(worried ? 'nervous' : 'neutral');
    }
  }

  // --- landing ---------------------------------------------------------------------------------

  land(ball) {
    const { bet, risk, bin } = ball;
    const mult = multiplier(risk, bin);
    const paid = payoutFor(bet, risk, bin);
    this.totals.paid += paid;
    const entry = { bin, mult, bet, paid, risk };
    this.pushHistory(entry);

    // ball sinks into the bin
    const img = ball.img;
    this.tweens.add({ targets: img, y: img.y + 10, scale: img.scale * 0.5, alpha: 0, duration: 160, ease: 'Quad.easeIn', onComplete: () => img.destroy() });

    this.settle(bet, paid, { react: false, banner: mult >= 10, keepRound: this.balls.length > 0 });
    this.binFx(bin, mult, paid, bet);
    this.reactTo(mult, bet, paid);
    this.refreshUi();
  }

  binFx(bin, mult, paid, bet) {
    const b = this.bins[bin];
    const x = b.x;
    const col = binColor(bin);
    // bounce down + flash + glow
    this.tweens.killTweensOf(b.box);
    b.box.setPosition(x, b.y).setScale(1);
    this.tweens.add({ targets: b.box, y: b.y + 9, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: b.box, scaleX: 1.08, scaleY: 0.9, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.killTweensOf(b.flash);
    b.flash.setAlpha(0.85);
    this.tweens.add({ targets: b.flash, alpha: 0, duration: 260 });
    this.tweens.killTweensOf(b.glow);
    b.glow.setAlpha(1).setScale(0.9, 0.6);
    this.tweens.add({ targets: b.glow, alpha: 0.22, scaleX: 0.62, scaleY: 0.42, duration: 520 });
    this.sparkFx.setParticleTint(col);
    this.sparkFx.explode(mult >= 1 ? 10 : 5, x, C.BIN_TOP + 4);

    // One float per bin: balls landing in the same bin within MERGE_MS merge
    // into the running float (+sum for wins, "0.5x (3)" for losses) instead of
    // piling identical labels on top of each other.
    const fy = C.BIN_TOP - 16;
    const now = this.time.now;
    const prev = this.binFloats[bin];
    const merge = prev && prev.t.active && now - prev.at < FLOAT_MERGE_MS && prev.win === (mult >= 1);
    const sum = (merge ? prev.sum : 0) + paid;
    const count = (merge ? prev.count : 0) + 1;
    if (merge) {
      this.tweens.killTweensOf(prev.t);
      prev.t.destroy();
    }
    let t;
    if (mult >= 1) {
      t = this.floatText(x, fy, `+${fmtK(sum)}`, { color: mult >= 2 ? COLORS.GOLD_LIGHT : COLORS.CREAM, size: mult >= 10 ? 34 : 26, rise: 80 });
    } else {
      t = this.floatText(x, fy, count > 1 ? `${fmtMult(mult)}x (${count})` : `${fmtMult(mult)}x`, { color: 0xff8a7a, size: 22, rise: 50, ms: 900 });
    }
    this.binFloats[bin] = { t, at: now, sum, count, win: mult >= 1 };
    if (mult >= 2) {
      this.coinFx.explode(Math.min(36, Math.round(6 + mult * 1.5)), x, C.BIN_TOP);
      playSfx('coin', { index: Math.min(7, Math.round(mult)), gain: 0.6, pan: panOfX(x) });
    }
    if (mult >= 33) this.cameras.main.shake(260, mult >= 100 ? 0.008 : 0.005);
    plinkoSfx('bin', { mult, gain: 0.8, pan: panOfX(x) });
  }

  /** Reactions, throttled so ten balls don't make the portraits flicker. */
  reactTo(mult, bet, paid) {
    const now = this.time.now;
    const can = (who, rank, gap) => {
      const s = this.react[who];
      if (rank > s.rank || now - s.at > gap) {
        s.at = now;
        s.rank = rank;
        this.time.delayedCall(gap, () => { if (s.at === now) s.rank = 0; });
        return true;
      }
      return false;
    };
    if (mult >= 10) {
      this.lastBigAt = now;
      if (can('booker', 3, 1400)) {
        this.booker?.react('happy', 1800);
        this.say('booker', mult >= 100 ? `WOOF! ${fmtMult(mult)}x! Right in the corner!` : `${fmtMult(mult)}x! Now that's a bounce!`, 2000);
      }
      if (can('soba', 3, 1400)) this.soba.react('happy', 1800);
    } else if (mult >= 2) {
      if (can('soba', 2, 900)) this.soba.react('happy', 1100);
      if (can('booker', 1, 1600)) this.booker?.react('nervous', 900);
    } else if (mult < 1) {
      const sly = can('booker', 1, 1300);
      if (sly) this.booker?.react('win', 1100); // sly
      if (can('soba', 1, 1500)) this.soba.react('sad', 900);
      if (sly && mult <= 0.3 && now - this.lastBigAt > 3000 && this.fx.next() < 0.12) {
        this.say('booker', 'The pegs giveth, the pegs taketh away.', 1800);
      }
    }
    if (mult < 1) playSfx('lose', { gain: 0.25 });
    else if (mult >= 2 && mult < 10) playSfx('win', { gain: 0.45 });
  }

  // --- leaving / test hooks ----------------------------------------------------------------------

  canLeave() {
    return this.balls.length === 0;
  }

  leaveRefusal() {
    return 'Wait for the balls to land';
  }

  onLeave() {
    this.stopAuto();
    super.onLeave();
  }

  installDebugHook() {
    const C_ = typeof window !== 'undefined' ? window.__CASINO__ : null;
    if (!C_?.debug?.enabled) return;
    C_.force = Object.assign(C_.force || {}, {
      /** Force the next ball(s) into these bins (0..12). Returns the queue. */
      plinko: (bins) => {
        for (const b of [].concat(bins)) {
          const n = Math.floor(Number(b));
          if (n >= 0 && n <= 12) this.forceQueue.push(n);
        }
        return this.forceQueue.slice();
      },
    });
  }

  snapshot() {
    return {
      ...super.snapshot(),
      risk: this.risk,
      bet: this.bet,
      inFlight: this.balls.length,
      auto: this.auto.left,
      lastResults: this.history.map(({ bin, mult, bet, paid }) => ({ bin, mult, bet, paid })),
      totals: { ...this.totals },
      multipliers: [...MULTIPLIERS[this.risk]],
      forced: this.forceQueue.length,
    };
  }
}
