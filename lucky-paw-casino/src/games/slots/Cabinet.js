// =============================================================================
// Cabinet — the code-drawn Golden Paw machine: gold bevelled body, marquee
// with chasing bulbs, dark reel window, line-number markers on both sides,
// the win meter, and the payline overlay used by the win presentation.
// All positions in game px (1280x720). The reels themselves live in Reel.js.
// =============================================================================

import { COLORS, DEPTH, FONT } from '../../core/Constants.js';
import { text, fmt, shade } from '../../ui/theme.js';
import { LINES, LINE_COLORS, ROWS } from './config.js';
import { CELL_W, CELL_H } from './textures.js';

export const CX = 640;
export const REEL_GAP = 6;
export const REEL_X = [0, 1, 2, 3, 4].map(i => CX + (i - 2) * (CELL_W + REEL_GAP));
export const ROWS_TOP = 184;
export const rowY = (row) => ROWS_TOP + row * CELL_H + CELL_H / 2;
export const WIN = { x: CX - 294, y: ROWS_TOP - 8, w: 588, h: CELL_H * 3 + 16 };
const BODY = { x: CX - 352, y: 156, w: 704, h: 440 };
const MARQ = { x: CX - 300, y: 72, w: 600, h: 90 };
export const METER = { x: CX - 230, y: WIN.y + WIN.h + 10, w: 460, h: 74 };
const GOLD = 0xe0a526;
const GOLD_DARK = 0x7a5414;
const GOLD_LIGHT = 0xffe49a;
const PURPLE = 0x2b1240;
const PURPLE_DARK = 0x160822;

const D_BODY = DEPTH.GAME - 20;
const D_WINDOW = DEPTH.GAME - 10;
const D_FRONT = DEPTH.GAME + 20;
const D_LINES = DEPTH.GAME + 30;

export class Cabinet {
  constructor(scene) {
    this.scene = scene;
    this.drawBody();
    this.drawMarquee();
    this.drawMarkers();
    this.drawMeter();
    this.lineGfx = scene.add.graphics().setDepth(D_LINES);
    this.glowGfx = scene.add.graphics().setDepth(DEPTH.GAME + 15);
    this.chaseMode = 'idle';
    this.chaseStep = 0;
    this.chaseTimer = scene.time.addEvent({ delay: 140, loop: true, callback: () => this.tickBulbs() });
  }

  // --- static art ----------------------------------------------------------------------

  bevel(g, x, y, w, h, r, o = {}) {
    const face = o.face ?? GOLD;
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x + 3, y + 8, w, h, r);
    g.fillStyle(GOLD_DARK, 1);
    g.fillRoundedRect(x, y, w, h, r);
    g.fillStyle(face, 1);
    g.fillRoundedRect(x + 3, y + 2, w - 6, h - 6, r - 2);
    g.fillStyle(GOLD_LIGHT, 0.55);
    g.fillRoundedRect(x + 6, y + 4, w - 12, 6, 3);
    g.fillStyle(shade(face, -0.25), 1);
    g.fillRoundedRect(x + 8, y + h - 16, w - 16, 8, 4);
  }

  drawBody() {
    const s = this.scene;
    const g = s.add.graphics().setDepth(D_BODY);
    const b = BODY;
    // floor shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(CX, b.y + b.h + 4, b.w + 60, 36);
    this.bevel(g, b.x, b.y, b.w, b.h, 26);
    // purple inner body
    g.fillStyle(PURPLE, 1);
    g.fillRoundedRect(b.x + 14, b.y + 12, b.w - 28, b.h - 28, 18);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(b.x + 18, b.y + 16, b.w - 36, 40, 14);
    // rivets
    g.fillStyle(GOLD_LIGHT, 1);
    for (const [x, y] of [[b.x + 12, b.y + 12], [b.x + b.w - 12, b.y + 12], [b.x + 12, b.y + b.h - 18], [b.x + b.w - 12, b.y + b.h - 18]]) {
      g.fillCircle(x, y, 4);
    }
    // reel window recess (gold lip, dark well)
    const w = WIN;
    const wg = s.add.graphics().setDepth(D_WINDOW);
    wg.fillStyle(GOLD_DARK, 1);
    wg.fillRoundedRect(w.x - 8, w.y - 8, w.w + 16, w.h + 16, 16);
    wg.fillStyle(GOLD, 1);
    wg.fillRoundedRect(w.x - 5, w.y - 5, w.w + 10, w.h + 10, 14);
    wg.fillStyle(PURPLE_DARK, 1);
    wg.fillRoundedRect(w.x, w.y, w.w, w.h, 10);
    // reel gutters
    for (let i = 0; i < 5; i++) {
      wg.fillStyle(0x000000, 0.35);
      wg.fillRect(REEL_X[i] - CELL_W / 2, ROWS_TOP, CELL_W, CELL_H * 3);
    }
    this.windowGfx = wg;
    // glass glare + inner shadow on top of the reels
    const fg = s.add.graphics().setDepth(D_FRONT);
    fg.fillStyle(0x000000, 0.28);
    fg.fillRect(w.x, w.y, w.w, 10);
    fg.fillStyle(0x000000, 0.18);
    fg.fillRect(w.x, w.y + w.h - 8, w.w, 8);
    fg.fillStyle(0xffffff, 0.06);
    fg.fillTriangle(w.x + 20, w.y, w.x + 150, w.y, w.x + 20, w.y + 150);
    fg.lineStyle(2, GOLD_LIGHT, 0.5);
    fg.strokeRoundedRect(w.x - 1, w.y - 1, w.w + 2, w.h + 2, 11);
    this.frontGfx = fg;
    // free-spins tint over the reels (purple wash)
    this.fsWash = s.add.rectangle(w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, 0x7b3fc4, 0).setDepth(D_FRONT - 1);
  }

  drawMarquee() {
    const s = this.scene;
    const m = MARQ;
    const g = s.add.graphics().setDepth(D_BODY + 1);
    this.bevel(g, m.x, m.y, m.w, m.h, 24);
    g.fillStyle(0x3d1660, 1);
    g.fillRoundedRect(m.x + 14, m.y + 12, m.w - 28, m.h - 26, 14);
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(m.x + 18, m.y + 15, m.w - 36, 18, 8);
    this.marqueeGfx = g;

    // bulbs around the inner edge
    this.bulbs = [];
    const add = (x, y) => {
      const b = s.add.image(x, y, 'slot-bulb').setDepth(D_BODY + 2).setTint(GOLD_LIGHT);
      this.bulbs.push(b);
    };
    const x0 = m.x + 10, x1 = m.x + m.w - 10, y0 = m.y + 7, y1 = m.y + m.h - 14;
    const nTop = 22;
    for (let i = 0; i <= nTop; i++) add(x0 + ((x1 - x0) * i) / nTop, y0);
    for (let i = 1; i <= 2; i++) add(x1, y0 + ((y1 - y0) * i) / 3);
    for (let i = nTop; i >= 0; i--) add(x0 + ((x1 - x0) * i) / nTop, y1);
    for (let i = 2; i >= 1; i--) add(x0, y0 + ((y1 - y0) * i) / 3);

    // paws + title
    this.pawL = s.add.image(m.x + 62, m.y + 38, 'sym-wild').setDisplaySize(48, 48).setDepth(D_BODY + 3);
    this.pawR = s.add.image(m.x + m.w - 62, m.y + 38, 'sym-wild').setDisplaySize(48, 48).setDepth(D_BODY + 3);
    this.title = text(s, CX, m.y + 33, 'GOLDEN PAW', {
      display: true, size: 40, color: COLORS.GOLD_LIGHT, stroke: 0x2a0d3d, strokeW: 8, shadow: true,
    }).setDepth(D_BODY + 3);
    this.sub = text(s, CX, m.y + 63, '', { size: 20, color: COLORS.CREAM }).setDepth(D_BODY + 3);
    this.setSub('WILD PAWS  -  3 STAR TAGS = FREE SPINS');
    s.tweens.add({ targets: [this.pawL, this.pawR], angle: { from: -8, to: 8 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  setSub(str, color = COLORS.CREAM) {
    this.sub.setText(str).setColor(`#${color.toString(16).padStart(6, '0')}`);
  }

  /** Marker y positions per side: markers stacked inside each row band. */
  markerLayout() {
    const out = { left: {}, right: {} };
    for (const side of ['left', 'right']) {
      const byRow = [[], [], []];
      LINES.forEach((rows, i) => byRow[side === 'left' ? rows[0] : rows[4]].push(i));
      byRow.forEach((ids, row) => {
        const n = ids.length;
        const pitch = 25;
        ids.forEach((id, k) => { out[side][id] = rowY(row) + (k - (n - 1) / 2) * pitch; });
      });
    }
    return out;
  }

  drawMarkers() {
    const s = this.scene;
    this.markerPos = this.markerLayout();
    this.markers = { left: [], right: [] };
    const xs = { left: WIN.x - 30, right: WIN.x + WIN.w + 30 };
    for (const side of ['left', 'right']) {
      LINES.forEach((_, i) => {
        const x = xs[side];
        const y = this.markerPos[side][i];
        const c = s.add.container(x, y).setDepth(D_FRONT + 2);
        const g = s.add.graphics();
        const col = LINE_COLORS[i];
        g.fillStyle(0x000000, 0.45);
        g.fillRoundedRect(-17, -10, 34, 23, 7);
        g.fillStyle(shade(col, -0.35), 1);
        g.fillRoundedRect(-17, -12, 34, 23, 7);
        g.fillStyle(col, 1);
        g.fillRoundedRect(-16, -12, 32, 20, 6);
        const t = text(s, 0, -2, String(i + 1), { size: 20, color: COLORS.INK });
        c.add([g, t]);
        c.lineColor = col;
        this.markers[side].push(c);
      });
    }
  }

  markerXY(line, side) {
    const m = this.markers[side][line];
    return { x: m.x, y: m.y };
  }

  /** Pop the two markers of a line (index 0-based). */
  flashMarker(line) {
    for (const side of ['left', 'right']) {
      const m = this.markers[side][line];
      this.scene.tweens.killTweensOf(m);
      m.setScale(1);
      this.scene.tweens.add({ targets: m, scale: 1.35, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  drawMeter() {
    const s = this.scene;
    const m = METER;
    const g = s.add.graphics().setDepth(D_BODY + 1);
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(m.x + 2, m.y + 5, m.w, m.h, 14);
    g.fillStyle(GOLD_DARK, 1);
    g.fillRoundedRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6, 16);
    g.fillStyle(0x0c0612, 1);
    g.fillRoundedRect(m.x, m.y, m.w, m.h, 13);
    g.lineStyle(1, GOLD, 0.6);
    g.strokeRoundedRect(m.x + 4, m.y + 4, m.w - 8, m.h - 8, 10);
    this.msg = text(s, CX, m.y + 22, '', { size: 20, color: COLORS.GOLD_LIGHT }).setDepth(D_BODY + 2);
    this.winLabel = text(s, m.x + 22, m.y + 52, 'WIN', { size: 20, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(D_BODY + 2);
    this.winText = text(s, CX, m.y + 51, '0', { size: 34, num: true, color: COLORS.CREAM }).setDepth(D_BODY + 2);
    this.meterValue = 0;
  }

  setMessage(str, color = COLORS.GOLD_LIGHT) {
    this.msg.setText(str).setColor(`#${color.toString(16).padStart(6, '0')}`);
  }

  setWin(v, { color = COLORS.CREAM } = {}) {
    this.meterValue = v;
    this.winText.setText(v > 0 ? fmt(v) : '0').setColor(`#${color.toString(16).padStart(6, '0')}`);
  }

  /** Count the meter from its value to `to` over ms; resolves when done (or skipped). */
  countTo(to, ms, onTick) {
    const s = this.scene;
    this.countTween?.stop();
    const o = { v: this.meterValue };
    return new Promise((resolve) => {
      this.countResolve = resolve;
      let ticks = 0;
      this.countTween = s.tweens.add({
        targets: o, v: to, duration: ms, ease: 'Cubic.easeOut',
        onUpdate: () => {
          this.setWin(Math.round(o.v), { color: COLORS.GOLD_LIGHT });
          if (++ticks % 4 === 0) onTick?.(ticks / 4);
        },
        onComplete: () => this.finishCount(to),
      });
      this.countTarget = to;
    });
  }

  get counting() { return !!this.countResolve; }

  finishCount(to = this.countTarget) {
    this.countTween?.stop();
    this.countTween = null;
    this.setWin(to, { color: COLORS.GOLD_LIGHT });
    this.scene.tweens.add({ targets: this.winText, scale: 1.2, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    const r = this.countResolve;
    this.countResolve = null;
    r?.();
  }

  // --- bulbs ---------------------------------------------------------------------------------

  /** 'idle' slow chase | 'spin' fast chase | 'win' all flash | 'free' purple/gold alternate */
  setChase(mode) {
    this.chaseMode = mode;
    this.chaseTimer.delay = mode === 'spin' ? 60 : mode === 'win' ? 110 : mode === 'free' ? 90 : 160;
  }

  tickBulbs() {
    const k = ++this.chaseStep;
    const n = this.bulbs.length;
    this.bulbs.forEach((b, i) => {
      let on;
      if (this.chaseMode === 'win') on = (k % 2) === (i % 2);
      else on = ((i + k) % 4) < 2;
      const free = this.chaseMode === 'free';
      b.setTint(free ? (on ? 0xff7bf0 : 0xb388ff) : (on ? GOLD_LIGHT : 0xb07020));
      b.setAlpha(on ? 1 : 0.45);
      b.setScale(on ? 1.1 : 0.85);
    });
    if (n === 0) return;
  }

  // --- free spins look ----------------------------------------------------------------------

  setFreeMode(on) {
    const s = this.scene;
    s.tweens.add({ targets: this.fsWash, fillAlpha: on ? 0.16 : 0, duration: 400 });
    this.setChase(on ? 'free' : 'idle');
  }

  // --- paylines --------------------------------------------------------------------------------

  clearLines() {
    this.lineGfx.clear();
    this.scene.tweens.killTweensOf(this.lineGfx);
    this.lineGfx.setAlpha(1);
  }

  /** Draw one payline (0-based index); frame its first `count` cells. */
  drawLine(i, count, { frames = true, width = 8 } = {}) {
    const g = this.lineGfx;
    const col = LINE_COLORS[i];
    const L = this.markerXY(i, 'left');
    const R = this.markerXY(i, 'right');
    const pts = [{ x: L.x + 17, y: L.y }, ...LINES[i].map((row, r) => ({ x: REEL_X[r], y: rowY(row) })), { x: R.x - 17, y: R.y }];
    const stroke = (w, c, a) => {
      g.lineStyle(w, c, a);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
      g.strokePath();
    };
    stroke(width + 6, 0x000000, 0.55);
    stroke(width, col, 0.95);
    stroke(3, 0xffffff, 0.55);
    for (const p of pts.slice(1, -1)) {
      g.fillStyle(col, 1);
      g.fillCircle(p.x, p.y, width - 1);
    }
    if (frames) {
      for (let r = 0; r < count; r++) {
        const x = REEL_X[r] - CELL_W / 2 + 2;
        const y = rowY(LINES[i][r]) - CELL_H / 2 + 2;
        g.lineStyle(9, 0x000000, 0.5);
        g.strokeRoundedRect(x + 1, y + 1, CELL_W - 4, CELL_H - 4, 12);
        g.lineStyle(5, col, 1);
        g.strokeRoundedRect(x + 1, y + 1, CELL_W - 4, CELL_H - 4, 12);
      }
    }
  }

  /** Frame arbitrary cells (scatters) in a colour. */
  frameCells(cells, col = 0xd27bff) {
    const g = this.lineGfx;
    for (const [r, row] of cells) {
      const x = REEL_X[r] - CELL_W / 2 + 2;
      const y = rowY(row) - CELL_H / 2 + 2;
      g.lineStyle(9, 0x000000, 0.5);
      g.strokeRoundedRect(x + 1, y + 1, CELL_W - 4, CELL_H - 4, 12);
      g.lineStyle(5, col, 1);
      g.strokeRoundedRect(x + 1, y + 1, CELL_W - 4, CELL_H - 4, 12);
    }
  }

  /** Anticipation glow around reels (indexes) or none. */
  setGlow(reels) {
    const g = this.glowGfx;
    g.clear();
    this.scene.tweens.killTweensOf(g);
    g.setAlpha(1);
    if (!reels.length) return;
    for (const r of reels) {
      const x = REEL_X[r] - CELL_W / 2 - 3;
      g.fillStyle(0xd27bff, 0.22);
      g.fillRoundedRect(x, ROWS_TOP - 3, CELL_W + 6, CELL_H * ROWS + 6, 12);
      g.lineStyle(12, 0xd27bff, 0.45);
      g.strokeRoundedRect(x, ROWS_TOP - 3, CELL_W + 6, CELL_H * ROWS + 6, 12);
      g.lineStyle(4, 0xffe49a, 0.95);
      g.strokeRoundedRect(x, ROWS_TOP - 3, CELL_W + 6, CELL_H * ROWS + 6, 12);
    }
    this.scene.tweens.add({ targets: g, alpha: 0.45, duration: 200, yoyo: true, repeat: -1 });
  }

  destroy() {
    this.chaseTimer?.remove(false);
  }
}
