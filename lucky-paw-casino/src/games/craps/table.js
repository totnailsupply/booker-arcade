// =============================================================================
// craps/table.js — the code-drawn layout on the blue felt, the puck, the info
// strip (phase line + roll history) and the big roll call.
//
//   const t = new CrapsTable(scene);
//   t.spotRect('pass')            {x, y, w, h} centre-based rect for a BetSpot
//   t.setPoint(6) / t.setPoint(null)   puck slides ON / OFF, point box glows
//   t.setPhaseLine(str)
//   t.setOdds({ open, point, max })    odds box text
//   t.pushHistory(total, kind)    kind: 'seven' | 'point' | 'craps' | 'yo' | ''
//   t.call(str, color)            big text on the felt
// =============================================================================

import { COLORS, DEPTH } from '../../core/Constants.js';
import { text, drawPanel } from '../../ui/theme.js';
import { playSfx } from '../../audio/sfx.js';
import { POINTS, ODDS_RATIO } from './logic.js';
import { L, COL, DICE, HISTORY_MAX } from './config.js';

const D = DEPTH.TABLE;
const NAMES = { 4: '4', 5: '5', 6: 'SIX', 8: '8', 9: 'NINE', 10: '10' };

export class CrapsTable {
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(D);
    this.hiG = scene.add.graphics().setDepth(D + 1);
    this.point = null;
    this.history = [];
    this.drawInfo();
    this.drawPointBoxes();
    this.drawField();
    this.drawDontPass();
    this.drawPass();
    this.drawOdds();
    this.drawProps();
    this.makePuck();
  }

  // --- geometry for BetSpots ---------------------------------------------------------

  /** Centre-based rect for a bet spot. */
  spotRect(key) {
    const r = key === 'pass' ? L.pass : key === 'dontPass' ? L.dontPass : key === 'field' ? L.field : key === 'odds' ? L.odds : null;
    if (r) return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
    const p = L.propBoxes.find(b => b.key === key);
    return { x: L.props.x + L.props.w / 2, y: p.y + p.h / 2, w: L.props.w, h: p.h };
  }

  // --- drawing ------------------------------------------------------------------------

  box(x, y, w, h, { fill = COL.BOX, alpha = 0.35, line = COL.LINE, lineA = 0.85, r = 10, lw = 3 } = {}) {
    const g = this.g;
    g.fillStyle(fill, alpha);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(lw, line, lineA);
    g.strokeRoundedRect(x, y, w, h, r);
  }

  t(x, y, str, o = {}) {
    return text(this.scene, x, y, str, { size: 20, color: COLORS.CREAM, ...o }).setDepth(D + 2);
  }

  miniDie(x, y, face, scale = DICE.MINI) {
    return this.scene.add.image(x, y, `craps-die-${face}`).setScale(scale).setDepth(D + 2);
  }

  drawInfo() {
    const s = this.scene;
    const { x, y, w, h } = L.info;
    const g = s.add.graphics().setDepth(D);
    drawPanel(g, x, y, w, h, { radius: 14, alpha: 0.9, edge: COLORS.BRASS_DARK, inner: true });
    this.phaseText = text(s, x + w / 2, y + 26, '', { size: 24, color: COLORS.GOLD_LIGHT }).setDepth(D + 2);
    this.t(x + 16, y + 72, 'LAST', { color: COLORS.TEXT_DIM, origin: [0, 0.5] });
    this.histX0 = x + 84;
    this.histY = y + 72;
    this.histItems = [];
    this.histEmpty = this.t(this.histX0 - 18, this.histY, 'no rolls yet · 7s show red, points green', { color: COLORS.TEXT_DIM, origin: [0, 0.5] });
  }

  drawPointBoxes() {
    const { x, y, w, h, gap } = L.pointBoxes;
    this.pointBoxRects = {};
    POINTS.forEach((p, i) => {
      const bx = x + i * (w + gap);
      this.box(bx, y, w, h, { alpha: 0.28 });
      const big = p === 6 || p === 9;
      this.t(bx + w / 2, y + h / 2 - 7, NAMES[p], { size: big ? 26 : 32, display: true, color: COLORS.CREAM });
      const r = ODDS_RATIO[p];
      this.t(bx + w / 2, y + h - 14, `odds ${r[0]}:${r[1]}`, { size: 20, color: COLORS.GOLD_LIGHT });
      this.pointBoxRects[p] = { x: bx, y, w, h };
    });
  }

  drawField() {
    const { x, y, w, h } = L.field;
    this.box(x, y, w, h, { alpha: 0.3 });
    this.t(x + 64, y + h / 2, 'FIELD', { size: 30, display: true, color: COLORS.GOLD });
    // number row: 2 and 12 circled (pay double)
    const nums = [2, 3, 4, 9, 10, 11, 12];
    const x0 = x + 160;
    const step = 52;
    nums.forEach((n, i) => {
      const cx = x0 + i * step;
      const dbl = n === 2 || n === 12;
      if (dbl) {
        this.g.lineStyle(3, COL.GOLD, 1);
        this.g.strokeCircle(cx, y + 26, 18);
      }
      this.t(cx, y + 26, String(n), { size: 28, color: dbl ? COLORS.GOLD : COLORS.CREAM });
      if (i < nums.length - 1) this.t(cx + step / 2, y + 26, '·', { size: 28, color: COLORS.TEXT_DIM });
    });
    this.t(x0 + 3 * step, y + h - 15, '2 and 12 pay double · others 1:1', { size: 20, color: COLORS.GOLD_LIGHT });
  }

  drawDontPass() {
    const { x, y, w, h } = L.dontPass;
    this.box(x, y, w, h, { alpha: 0.3 });
    const title = this.t(x + 22, y + h / 2, "DON'T PASS BAR", { size: 22, display: true, origin: [0, 0.5] });
    const dx = x + 22 + title.width + 22;
    this.miniDie(dx, y + h / 2, 6);
    this.miniDie(dx + 28, y + h / 2, 6);
    this.t(dx + 48, y + h / 2, '12 pushes · 1:1', { size: 20, color: COLORS.GOLD_LIGHT, origin: [0, 0.5] });
  }

  drawPass() {
    const { x, y, w, h } = L.pass;
    this.box(x, y, w, h, { alpha: 0.32, lw: 4 });
    this.t(x + 26, y + 30, 'PASS LINE', { size: 40, display: true, color: COLORS.CREAM, origin: [0, 0.5] });
    this.t(x + 28, y + h - 18, '7 or 11 wins the come-out · pays 1:1', { size: 20, color: COLORS.GOLD_LIGHT, origin: [0, 0.5] });
  }

  drawOdds() {
    const { x, y, w, h } = L.odds;
    this.oddsG = this.scene.add.graphics().setDepth(D);
    this.oddsTitle = this.t(x + 14, y + 20, 'ODDS', { size: 24, display: true, origin: [0, 0.5] });
    this.oddsLine1 = this.t(x + 14, y + 46, '', { size: 20, color: COLORS.GOLD_LIGHT, origin: [0, 0.5] });
    this.oddsLine2 = this.t(x + 14, y + 68, '', { size: 20, color: COLORS.TEXT_DIM, origin: [0, 0.5] });
    this.setOdds({ open: false });
  }

  /** Odds box text: open = a point is on and a Pass bet exists. */
  setOdds({ open, point = null, max = 0 }) {
    const { x, y, w, h } = L.odds;
    const g = this.oddsG;
    g.clear();
    g.fillStyle(COL.BOX, open ? 0.45 : 0.2);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(open ? 3 : 2, open ? COL.GOLD : COL.LINE, open ? 1 : 0.4);
    g.strokeRoundedRect(x, y, w, h, 10);
    this.oddsTitle.setAlpha(open ? 1 : 0.5);
    if (open) {
      const r = ODDS_RATIO[point];
      this.oddsLine1.setText(`pays ${r[0]}:${r[1]}`).setColor('#ffe49a').setAlpha(1);
      this.oddsLine2.setText(`max ${max}`).setAlpha(1);
    } else {
      this.oddsLine1.setText('after a').setColor('#b9a888').setAlpha(0.8);
      this.oddsLine2.setText('point is set').setAlpha(0.8);
    }
  }

  drawProps() {
    const { x, y, w, header } = L.props;
    const last = L.propBoxes[L.propBoxes.length - 1];
    const g = this.g;
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(x - 4, y - 2, w + 8, last.y + last.h - y + 6, 12);
    this.t(x + w / 2, y + header / 2 + 2, 'ONE-ROLL BETS', { size: 20, color: COLORS.GOLD });
    for (const b of L.propBoxes) {
      this.box(x, b.y, w, b.h, { fill: COL.PROP, alpha: 0.55, line: COL.LINE, lineA: 0.8 });
      this.t(x + 12, b.y + 20, b.name, { size: 22, display: true, origin: [0, 0.5] });
      this.t(x + 12, b.y + 46, b.pays, { size: 22, color: COLORS.GOLD, origin: [0, 0.5] });
      this.t(x + 12, b.y + 70, b.note, { size: 20, color: COLORS.TEXT_DIM, origin: [0, 0.5] });
    }
  }

  // --- puck ----------------------------------------------------------------------------

  makePuck() {
    const s = this.scene;
    const c = s.add.container(L.puckOff.x, L.puckOff.y).setDepth(D + 5);
    this.puckG = s.add.graphics();
    this.puckText = text(s, 0, 1, 'OFF', { size: 20, color: COLORS.CREAM });
    c.add([this.puckG, this.puckText]);
    this.puck = c;
    this.drawPuck(false);
  }

  drawPuck(on) {
    const g = this.puckG;
    g.clear();
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(2, 5, 24);
    g.fillStyle(on ? 0xffffff : 0x15151a, 1);
    g.fillCircle(0, 0, 24);
    g.lineStyle(3, on ? 0x15151a : 0xffffff, 0.9);
    g.strokeCircle(0, 0, 20);
    this.puckText.setText(on ? 'ON' : 'OFF').setColor(on ? '#15151a' : '#ffffff');
  }

  /** Puck ON over the point box, or OFF at its rest. */
  setPoint(p, animate = true) {
    this.point = p;
    const s = this.scene;
    const target = p ? { x: this.pointBoxRects[p].x + L.pointBoxes.w / 2, y: L.pointBoxes.y - 4 } : L.puckOff;
    s.tweens.killTweensOf(this.puck);
    this.hiG.clear();
    if (p) {
      const r = this.pointBoxRects[p];
      this.hiG.fillStyle(COL.GOLD, 0.16);
      this.hiG.fillRoundedRect(r.x, r.y, r.w, r.h, 10);
      this.hiG.lineStyle(4, COL.GOLD, 1);
      this.hiG.strokeRoundedRect(r.x, r.y, r.w, r.h, 10);
    }
    if (!animate) {
      this.puck.setPosition(target.x, target.y);
      this.drawPuck(!!p);
      return;
    }
    // lift, flip colour mid-flight, slide, drop
    s.tweens.add({
      targets: this.puck, x: target.x, y: target.y, duration: 420, ease: 'Cubic.easeInOut',
      onStart: () => playSfx('chip', { gain: 0.8 }),
      onUpdate: (tw) => { if (tw.progress > 0.5 && this.puckText.text !== (p ? 'ON' : 'OFF')) this.drawPuck(!!p); },
      onComplete: () => { this.drawPuck(!!p); playSfx('chip', { gain: 0.6 }); },
    });
    s.tweens.add({ targets: this.puck, scale: { from: 1, to: 1.25 }, duration: 210, yoyo: true, ease: 'Quad.easeOut' });
  }

  setPhaseLine(str) {
    if (this.phaseText.text === str) return;
    this.phaseText.setText(str);
    this.scene.tweens.add({ targets: this.phaseText, scale: { from: 1.12, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  // --- history -----------------------------------------------------------------------------

  pushHistory(total, kind = '') {
    this.history.unshift({ total, kind });
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
    this.drawHistory(true);
  }

  drawHistory(pop = false) {
    const s = this.scene;
    for (const it of this.histItems) it.destroy();
    this.histItems = [];
    this.histEmpty.setVisible(this.history.length === 0);
    const fills = { seven: 0xc0392b, point: 0x2e9e5b, craps: 0x3a2a20, yo: 0xc9a24a, '': 0x24324f };
    this.history.forEach((h, i) => {
      const cx = this.histX0 + i * 42;
      const c = s.add.container(cx, this.histY).setDepth(D + 3);
      const g = s.add.graphics();
      g.fillStyle(fills[h.kind] ?? fills[''], 1);
      g.fillRoundedRect(-18, -16, 36, 32, 8);
      g.lineStyle(2, i === 0 ? COLORS.GOLD : 0xffffff, i === 0 ? 1 : 0.25);
      g.strokeRoundedRect(-18, -16, 36, 32, 8);
      const tx = text(s, 0, 1, String(h.total), { size: 20, color: h.kind === 'yo' ? COLORS.INK : COLORS.CREAM });
      c.add([g, tx]);
      c.setAlpha(1 - i * 0.045);
      this.histItems.push(c);
      if (pop && i === 0) s.tweens.add({ targets: c, scale: { from: 1.6, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    });
  }

  // --- big call ------------------------------------------------------------------------------

  call(str, color = COLORS.GOLD, { x = 540, y = 352, ms = 1300 } = {}) {
    const s = this.scene;
    this.callText?.destroy();
    const c = s.add.container(x, y).setDepth(DEPTH.CHARACTERS - 10);
    const label = text(s, 0, 0, str, { size: 46, display: true, color, stroke: 0x0b1020, strokeW: 6 });
    const w = label.width + 48;
    const h = label.height + 18;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, 18);
    g.fillStyle(0x0b1020, 0.88);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, color, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    c.add([g, label]);
    const t = c;
    this.callText = t;
    t.setScale(0.3).setAlpha(0);
    s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    s.tweens.add({
      targets: t, alpha: 0, y: y - 24, delay: ms, duration: 320, ease: 'Quad.easeIn',
      onComplete: () => { if (this.callText === t) this.callText = null; t.destroy(); },
    });
    return t;
  }
}

