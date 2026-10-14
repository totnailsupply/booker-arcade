// =============================================================================
// RouletteScene — European single-zero roulette, Booker spins.
//
// Flow: pick a chip -> click layout cells (right-click / Undo removes the last
// chip, Clear refunds all, Rebet restores the last layout, Double doubles) ->
// Spin (Space) -> the result is drawn FIRST (this.rng.int(37) via logic.spinResult),
// then the wheel animation lands the ball in that pocket -> losing chips are
// swept to Booker, winners paid -> the layout is cleared and Rebet offered.
//
// Money: chips leave the balance when placed (wallet.bet), come back on
// Undo/Clear/leave (wallet.refund), and the round pays its TOTAL return once via
// BaseGameScene.settle(). Table limit: wallet.maxBet() applies to the TOTAL of
// all bets on one spin.
//
// Test hooks: snapshot() (render_game_to_text), scene.cellCenter(id) for clicks,
// ?debug=1: window.__CASINO__.force.roulette(n) forces the next result.
// =============================================================================

import { BaseGameScene } from '../BaseGameScene.js';
import { COLORS, DEPTH, FONT } from '../../core/Constants.js';
import { wallet, rng } from '../../core/Casino.js';
import { text, fmt, fmtSigned, drawPanel, modalOpen } from '../../ui/theme.js';
import { playSfx } from '../../audio/sfx.js';
import {
  betById, spinResult, settleBets, winningBets, describe, colorOf, totalOf,
} from './logic.js';
import { Wheel } from './Wheel.js';
import { Board } from './Board.js';
import { PANELS, SPIN, HISTORY_LEN, COLOR_OF } from './config.js';

const GAME_ID = 'roulette';

const RULES = {
  lines: [
    'European wheel: one zero, 37 pockets.',
    'Pick a chip, then click the table to bet. Right-click or Undo takes the last chip back.',
    'Space spins. Space or a click skips the ball.',
    'Zero loses every outside bet.',
    'Table limit: your VIP max bet covers all chips on one spin.',
    'Rebet repeats your last layout. Double doubles it.',
  ],
  payouts: [
    ['Straight up', '35:1'],
    ['Dozen', '2:1'],
    ['Column', '2:1'],
    ['Red / Black', '1:1'],
    ['Odd / Even', '1:1'],
    ['1-18 / 19-36', '1:1'],
  ],
};

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const COLOR_TEXT = { red: 0xff7a6b, black: 0xd9d4cc, green: 0x6fe0a0 };

export class RouletteScene extends BaseGameScene {
  constructor() {
    super('Roulette', { id: GAME_ID, booker: 'booker-croupier', rules: RULES });
  }

  init() {
    super.init();
    this.bets = {};          // { betId: amount } on the layout now
    this.cellHist = {};      // { betId: [chip, chip, ...] } for right-click undo
    this.actions = [];       // undo stack: each action = [{ id, v }, ...]
    this.lastBets = null;    // layout of the last spin (Rebet)
    this.history = [];       // last numbers, newest first
    this.allSpins = [];      // session numbers (hot number)
    this.phase = 'betting';
    this.lastNumber = null;
    this.lastResult = null;
    this.forced = null;
    this.hovered = null;
    this.token = (this.token || 0) + 1;
  }

  create() {
    super.create();
    // Booker's calls go under his frame (left of him is the bet info panel)
    this.booker.bubbleSide = 'below';
    this.booker.bubbleWidth = 196;
    const token = this.token;
    this.anim = rng.stream('roulette-anim'); // cosmetic only (ball speed); results use this.rng

    this.wheel = new Wheel(this, { depth: DEPTH.TABLE + 5 });
    this.board = new Board(this, {
      depth: DEPTH.GAME,
      onBet: (id) => this.placeChip(id),
      onUndo: (id) => this.undoCell(id),
      onHover: (id) => this.hover(id),
    });
    this.buildPanels();

    this.tray = this.addChipTray({ x: 470, y: 664, keys: true });
    const bs = { style: 'secondary', w: 86, h: 60, size: FONT.SIZE.SMALL };
    this.undoBtn = this.addButton(730, 660, { ...bs, label: 'Undo', hint: 'Z', hotkey: ['Z', 'BACKSPACE'], onClick: () => this.undo() });
    this.clearBtn = this.addButton(822, 660, { ...bs, label: 'Clear', hint: 'C', hotkey: 'C', onClick: () => this.clearBets() });
    this.rebetBtn = this.addButton(914, 660, { ...bs, label: 'Rebet', hint: 'R', hotkey: 'R', onClick: () => this.rebet() });
    this.doubleBtn = this.addButton(1006, 660, { ...bs, label: 'Double', hint: 'D', hotkey: 'D', onClick: () => this.double() });
    this.spinBtn = this.addButton(1172, 660, {
      label: 'Spin', hint: 'Space', hotkey: 'SPACE', style: 'gold', w: 188, h: 64, onClick: () => this.onSpinButton(),
    });

    // A click anywhere while the ball runs skips to the result
    const onDown = () => { if (this.phase === 'spinning' && this.wheel.spinning && !modalOpen(this)) this.skipSpin(); };
    this.input.on('pointerdown', onDown);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', onDown);
      this.token += 1; // stale async steps stop
      this.board?.destroy();
    });

    // ?debug=1: force the next result
    const C = typeof window !== 'undefined' ? window.__CASINO__ : null;
    if (C?.debug?.enabled) {
      C.force = Object.assign(C.force || {}, {
        roulette: (n) => {
          if (n === null || n === undefined) { this.forced = null; return null; }
          const k = Math.floor(Number(n));
          if (!(k >= 0 && k <= 36)) throw new Error('roulette force: 0..36');
          this.forced = k;
          return k;
        },
      });
    }

    this.refreshUi();
    this.time.delayedCall(450, () => {
      if (this.token === token) this.say('booker', 'Welcome! Place your bets.', 2000);
    });
  }

  update(_t, dt) {
    this.wheel?.update(dt);
  }

  // --- panels ------------------------------------------------------------------------

  buildPanels() {
    const g = this.add.graphics().setDepth(DEPTH.TABLE);
    const M = PANELS.MARQUEE, I = PANELS.INFO, H = PANELS.HISTORY;
    drawPanel(g, M.x, M.y, M.w, M.h, { radius: 16, edge: COLORS.BRASS, inner: true, alpha: 0.92 });
    drawPanel(g, I.x, I.y, I.w, I.h, { radius: 16, edge: COLORS.BRASS, inner: true, alpha: 0.92 });
    drawPanel(g, H.x, H.y, H.w, H.h, { radius: 16, edge: COLORS.BRASS, inner: true, alpha: 0.92 });
    const D = DEPTH.TABLE + 1;

    // marquee: result disc + "17 RED" + tags + outcome
    this.discX = M.x + 76;
    this.discY = M.y + M.h / 2;
    this.disc = this.add.graphics().setDepth(D);
    this.discText = text(this, this.discX, this.discY + 1, '?', { size: 44, display: true, color: COLORS.CREAM, stroke: 0x000000, strokeW: 5 }).setDepth(D + 1);
    const tx = M.x + 148;
    this.mTitle = text(this, tx, M.y + 42, '', { size: 36, display: true, color: COLORS.GOLD_LIGHT, origin: [0, 0.5], stroke: 0x000000, strokeW: 5 }).setDepth(D);
    this.mSub = text(this, tx, M.y + 84, '', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(D);
    this.mResult = text(this, tx, M.y + 118, '', { size: 28, num: true, color: COLORS.WIN, origin: [0, 0.5], stroke: 0x000000, strokeW: 4 }).setDepth(D);

    // info: total bet, limit, hover hint
    const ix = I.x + I.w / 2;
    text(this, I.x + 18, I.y + 24, 'TOTAL BET', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(D);
    this.limitText = text(this, I.x + I.w - 18, I.y + 24, '', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [1, 0.5], num: true }).setDepth(D);
    this.totalText = text(this, ix, I.y + 60, '0', { size: 40, num: true, color: COLORS.GOLD, stroke: 0x000000, strokeW: 4 }).setDepth(D);
    this.hintText = text(this, ix, I.y + 114, '', { size: FONT.SIZE.SMALL, color: COLORS.CREAM, wrap: I.w - 24, lineSpacing: -2 }).setDepth(D);

    // history
    text(this, H.x + 20, H.y + 36, 'LAST 12', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(D);
    this.histRoot = this.add.container(0, 0).setDepth(D);
    this.statsText = text(this, H.x + 20, H.y + 76, '', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM, origin: [0, 0.5] }).setDepth(D);
    this.hotText = text(this, H.x + H.w - 20, H.y + 76, '', { size: FONT.SIZE.SMALL, color: COLORS.GOLD_LIGHT, origin: [1, 0.5] }).setDepth(D);
    this.drawDisc(null);
    this.renderHistory(false);
  }

  drawDisc(n) {
    const g = this.disc;
    g.clear();
    const x = this.discX, y = this.discY, r = 52;
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(x + 2, y + 4, r);
    g.fillStyle(n === null ? 0x3a2617 : COLOR_OF[colorOf(n)], 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.1);
    g.fillCircle(x - 8, y - 12, r * 0.6);
    g.lineStyle(4, COLORS.BRASS, 1);
    g.strokeCircle(x, y, r);
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeCircle(x, y, r - 6);
    this.discText.setText(n === null ? '?' : String(n));
  }

  setMarquee(title, sub = '', result = '', titleColor = COLORS.GOLD_LIGHT) {
    this.mTitle.setText(title).setColor(hex(titleColor));
    const maxW = PANELS.MARQUEE.w - 168;
    this.mTitle.setScale(Math.min(1, maxW / Math.max(1, this.mTitle.width)));
    this.mSub.setText(sub);
    this.setResultLine(result);
  }

  setResultLine(str, color = COLORS.WIN) {
    this.mResult.setText(str).setColor(hex(color));
  }

  renderHistory(animate) {
    this.histRoot.removeAll(true);
    const H = PANELS.HISTORY;
    const x0 = H.x + 140, y = H.y + 36, step = 46;
    for (let i = 0; i < HISTORY_LEN; i++) {
      const n = this.history[i];
      const x = x0 + i * step;
      const g = this.add.graphics();
      if (n === undefined) {
        g.lineStyle(2, COLORS.BRASS_DARK, 0.5);
        g.strokeCircle(x, y, 18);
        this.histRoot.add(g);
        continue;
      }
      const r = i === 0 ? 21 : 18;
      g.fillStyle(COLOR_OF[colorOf(n)], i === 0 ? 1 : 0.9);
      g.fillCircle(x, y, r);
      g.lineStyle(i === 0 ? 3 : 2, i === 0 ? COLORS.GOLD : COLORS.CREAM, i === 0 ? 1 : 0.6);
      g.strokeCircle(x, y, r);
      const t = text(this, x, y + 1, String(n), { size: i === 0 ? 22 : 20, num: true, color: COLORS.CREAM });
      const c = this.add.container(0, 0, [g, t]);
      this.histRoot.add(c);
      if (i === 0 && animate) {
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 260 });
        t.setScale(1.6);
        this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
      }
    }
    if (!this.history.length) {
      this.statsText.setText('No spins yet. Good luck!');
      this.hotText.setText('');
      return;
    }
    const cnt = { red: 0, black: 0, green: 0 };
    for (const n of this.history) cnt[colorOf(n)] += 1;
    this.statsText.setText(`RED ${cnt.red}   BLACK ${cnt.black}   ZERO ${cnt.green}`);
    const freq = {};
    let hot = null;
    for (const n of this.allSpins) {
      freq[n] = (freq[n] || 0) + 1;
      if (hot === null || freq[n] > freq[hot]) hot = n;
    }
    this.hotText.setText(hot !== null && freq[hot] >= 2 ? `HOT NUMBER ${hot} (x${freq[hot]})` : `SPINS ${this.allSpins.length}`);
  }

  // --- betting --------------------------------------------------------------------------

  totalBet() {
    return totalOf(this.bets);
  }

  cellCenter(id) {
    return this.board.center(id);
  }

  /** Reason n more chips can't go on the layout, or null. Limit = total per spin. */
  whyNot(n) {
    if (this.phase === 'spinning') return 'No more bets!';
    if (!(n > 0)) return 'Pick a chip first';
    if (n > wallet.balance) return 'Not enough chips';
    const max = wallet.maxBet();
    if (this.totalBet() + n > max) return `Table limit is ${fmt(max)} per spin`;
    return null;
  }

  /** Leave the result view (clear highlights) when the player starts a new layout. */
  openBetting() {
    if (this.phase !== 'result') return;
    this.phase = 'betting';
    this.board.clearWin();
    this.wheel.clearGlow();
  }

  placeChip(id) {
    if (this.phase === 'spinning') return false; // the scene-level click skips
    const v = this.tray.value;
    const why = this.whyNot(v);
    if (why) {
      this.toast(why, 'warn');
      return false;
    }
    if (!wallet.bet(GAME_ID, v)) return false;
    this.openBetting();
    this.bets[id] = (this.bets[id] || 0) + v;
    (this.cellHist[id] ||= []).push(v);
    this.actions.push([{ id, v }]);
    this.board.flyChip(id, v, this.tray.chipPos(v));
    this.board.setAmount(id, this.bets[id]);
    playSfx('chip');
    this.refreshUi();
    return true;
  }

  takeBack(id, v) {
    const back = wallet.refund(GAME_ID, v);
    this.bets[id] = (this.bets[id] || 0) - back;
    if (this.bets[id] <= 0) delete this.bets[id];
    const h = this.cellHist[id];
    if (h) {
      const i = h.lastIndexOf(v);
      if (i >= 0) h.splice(i, 1);
      if (!h.length) delete this.cellHist[id];
    }
    this.board.setAmount(id, this.bets[id] || 0, { pop: false });
    return back;
  }

  /** Right-click on a cell: take that cell's last chip back. */
  undoCell(id) {
    if (this.phase === 'spinning') return 0;
    const h = this.cellHist[id];
    if (!h?.length) return 0;
    const v = h[h.length - 1];
    // drop the matching entry from the undo stack
    for (let a = this.actions.length - 1; a >= 0; a--) {
      const i = this.actions[a].findIndex(e => e.id === id && e.v === v);
      if (i >= 0) {
        this.actions[a].splice(i, 1);
        if (!this.actions[a].length) this.actions.splice(a, 1);
        break;
      }
    }
    const back = this.takeBack(id, v);
    playSfx('chip', { gain: 0.7 });
    this.refreshUi();
    return back;
  }

  undo() {
    if (this.phase === 'spinning') return 0;
    const act = this.actions.pop();
    if (!act) return 0;
    let back = 0;
    for (const e of [...act].reverse()) back += this.takeBack(e.id, e.v);
    playSfx('chip', { gain: 0.7 });
    this.refreshUi();
    return back;
  }

  clearBets({ sfx = true } = {}) {
    if (this.phase === 'spinning') return 0;
    const total = this.totalBet();
    if (!total) return 0;
    const back = wallet.refund(GAME_ID, total);
    this.bets = {};
    this.cellHist = {};
    this.actions = [];
    this.board.clearMarkers();
    if (sfx) playSfx('chipStack', { count: 4 });
    this.refreshUi();
    return back;
  }

  /** Put a whole layout down as one undoable action (all or nothing). */
  placeLayout(layout) {
    const act = [];
    for (const [id, v] of Object.entries(layout)) {
      if (!(v > 0)) continue;
      if (!wallet.bet(GAME_ID, v)) break;
      this.bets[id] = (this.bets[id] || 0) + v;
      (this.cellHist[id] ||= []).push(v);
      act.push({ id, v });
      this.board.setAmount(id, this.bets[id]);
    }
    if (act.length) this.actions.push(act);
    playSfx('chipStack', { count: 5 });
    this.refreshUi();
  }

  rebet() {
    if (this.phase === 'spinning') return false;
    if (!this.lastBets) {
      this.toast('No last bet yet', 'warn');
      return false;
    }
    const need = totalOf(this.lastBets);
    const have = wallet.balance + this.totalBet();
    if (need > wallet.maxBet()) return this.toast(`Table limit is ${fmt(wallet.maxBet())} per spin`, 'warn') && false;
    if (need > have) return this.toast('Not enough chips to rebet', 'warn') && false;
    this.openBetting();
    this.clearBets({ sfx: false });
    this.placeLayout(this.lastBets);
    return true;
  }

  double() {
    if (this.phase === 'spinning') return false;
    const total = this.totalBet();
    if (!total) {
      this.toast('Place a bet first', 'warn');
      return false;
    }
    if (total * 2 > wallet.maxBet()) return this.toast(`Table limit is ${fmt(wallet.maxBet())} per spin`, 'warn') && false;
    if (total > wallet.balance) return this.toast('Not enough chips to double', 'warn') && false;
    this.placeLayout({ ...this.bets });
    return true;
  }

  hover(id) {
    this.hovered = id;
    if (this.phase === 'spinning' || !id) {
      this.board.showCover(null);
      this.refreshHint();
      return;
    }
    this.board.showCover(id);
    this.refreshHint();
  }

  refreshHint() {
    const b = this.hovered && this.phase !== 'spinning' ? betById(this.hovered) : null;
    if (!b) {
      this.hintText.setText(this.phase === 'spinning' ? 'Ball is rolling...' : 'Point at a bet to see what it covers').setColor('#b9a888');
      return;
    }
    const what = b.kind === 'straight' ? `Number ${b.id}` : b.name;
    const span = b.covers.length === 1 ? 'one number' : `${b.covers.length} numbers`;
    this.hintText.setText(`${what} pays ${b.payout}:1\n${span}`).setColor('#f6ecd4');
  }

  refreshUi() {
    const total = this.totalBet();
    const spinning = this.phase === 'spinning';
    this.totalText.setText(fmt(total));
    this.limitText.setText(`MAX ${fmt(wallet.maxBet())}`);
    this.undoBtn.setEnabled(!spinning && this.actions.length > 0);
    this.clearBtn.setEnabled(!spinning && total > 0);
    this.rebetBtn.setEnabled(!spinning && !!this.lastBets);
    this.doubleBtn.setEnabled(!spinning && total > 0);
    this.spinBtn.setLabel(spinning ? 'Skip' : 'Spin');
    this.spinBtn.setEnabled(spinning ? this.wheel.spinning : true);
    if (!spinning && this.phase === 'betting') {
      this.drawDisc(this.lastNumber);
      this.setMarquee('PLACE BETS', total ? `${fmt(total)} on the table. Space to spin.` : 'Pick a chip, then click the table.', '');
    }
    this.refreshHint();
  }

  // --- the spin ----------------------------------------------------------------------------

  onSpinButton() {
    if (this.phase === 'spinning') this.skipSpin();
    else this.spin();
  }

  skipSpin() {
    if (this.phase !== 'spinning') return false;
    return this.wheel.skip();
  }

  /** Run fn after ms on the scene clock, unless the scene restarted meanwhile. */
  later(ms, fn) {
    const token = this.token;
    if (ms <= 0) return fn();
    this.time.delayedCall(ms, () => { if (this.token === token) fn(); });
    return null;
  }

  spin() {
    if (this.phase === 'spinning') return false;
    const wagered = this.totalBet();
    if (!wagered) {
      this.toast(this.lastBets ? 'Place a bet first (R = rebet)' : 'Place a bet first', 'warn');
      return false;
    }
    const token = this.token;
    this.openBetting();
    this.phase = 'spinning';
    this.beginRound();
    this.board.setLocked(true);
    this.board.showCover(null);
    this.tray.setEnabled(false);
    const bets = { ...this.bets };
    this.lastBets = bets;

    // RESULT FIRST: one uniform draw from the game's seeded stream
    let n = spinResult(this.rng);
    if (this.forced !== null) {
      n = this.forced;
      this.forced = null;
    }

    this.drawDisc(null);
    this.setMarquee('NO MORE BETS', `${fmt(wagered)} riding. Good luck!`, '');
    this.say('booker', 'No more bets!', 1400);
    this.booker?.react('happy', 900);

    // The ball animation only lands the ball in n. Callbacks run inside the
    // scene update, so the fixed-step test clock sees the real timeline.
    this.wheel.spin(n, {
      rng: this.anim,
      onDrop: () => {
        if (this.token !== token) return;
        this.soba?.setMood('nervous');
        this.soba?.react('nervous', 500);
      },
      onSettle: () => {
        if (this.token !== token) return;
        this.refreshUi();
        this.reveal(n, bets);
      },
    });
    this.refreshUi();
    return true;
  }

  /** Result timeline: call -> sweep losers -> pay winners -> settle -> collect -> clear. */
  reveal(n, bets) {
    const res = settleBets(bets, n);
    const d = describe(n);
    this.lastNumber = n;
    this.history.unshift(n);
    if (this.history.length > HISTORY_LEN) this.history.length = HISTORY_LEN;
    this.allSpins.push(n);
    if (this.allSpins.length > 200) this.allSpins.shift();

    // the call
    this.wheel.showGlow(n);
    this.board.showWin(n, winningBets(n));
    this.drawDisc(n);
    this.setMarquee(d.label, d.tags.join(' · '), '', COLOR_TEXT[d.color]);
    this.tweens.add({ targets: this.discText, scale: { from: 1.8, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.mTitle, scale: { from: 1.3, to: this.mTitle.scaleX }, duration: 320, ease: 'Back.easeOut' });
    playSfx('cardFlip');
    this.renderHistory(true);
    this.soba?.setMood('neutral');
    this.say('booker', n === 0 ? 'Zero! Green zero!' : `${d.label}!`, 1500);

    let t = SPIN.REVEAL_MS;
    // losers slide to the croupier
    if (res.losses.length) {
      this.later(t, () => {
        res.losses.forEach((l, i) => this.board.sweep(l.id, this.bookerPos, i * 35));
        playSfx('chipStack', { count: Math.min(8, 2 + res.losses.length) });
      });
      t += SPIN.SWEEP_MS;
    }
    // winners: payout stacks slide in from Booker
    if (res.wins.length) {
      this.later(t, () => {
        res.wins.forEach((w, i) => {
          this.board.pay(w.id, w.paid - w.amount, this.bookerPos, i * 90);
          const c = this.board.center(w.id);
          this.floatText(c.x, c.y - 24, `+${fmt(w.paid)}`, { color: COLORS.WIN, size: 26, delay: 250 + i * 90 });
        });
        playSfx('chipStack', { count: 6 });
      });
      t += SPIN.PAY_MS;
    }
    // money: one payout for the whole layout, then the chips fly to the balance
    this.later(t, () => {
      const straightHit = res.wins.some(w => betById(w.id).kind === 'straight');
      const banner = res.paid > 0 && (straightHit || res.paid >= 10 * res.wagered);
      this.settle(res.wagered, res.paid, { banner, react: false, keepRound: true });
      this.reactTo(res, n, banner, straightHit);
      res.wins.forEach((w, i) => this.board.collect(w.id, this.balancePos, i * 60));
    });
    if (res.wins.length) t += SPIN.COLLECT_MS;
    this.later(t, () => this.finishRound());
  }

  /** Round over: clear the layout, offer Rebet. */
  finishRound() {
    this.bets = {};
    this.cellHist = {};
    this.actions = [];
    this.board.clearMarkers();
    this.phase = 'result';
    this.endRound();
    this.board.setLocked(false);
    this.tray.setEnabled(true);
    this.refreshUi();
    if (this.rebetBtn.enabled) {
      this.tweens.add({ targets: this.rebetBtn, scale: { from: 1.12, to: 1 }, duration: 420, ease: 'Back.easeOut' });
    }
    if (this.hovered) this.hover(this.hovered);
  }

  reactTo(res, n, banner, straightHit) {
    const net = res.net;
    if (net > 0) {
      this.setResultLine(`YOU WIN ${fmtSigned(net)}`, COLORS.WIN);
      this.soba?.react('happy', 2200);
      if (straightHit) {
        this.booker?.react('happy', 2000);
        this.say('booker', `Straight up on ${n}! 35 to 1!`, 2200);
      } else {
        this.booker?.react('sad', 1400);
        this.say('booker', 'Winner! Paying out.', 1600);
      }
      if (!banner) playSfx('win', { gain: 0.8 });
    } else if (net < 0) {
      this.setResultLine(`NO WIN ${fmtSigned(net)}`, COLORS.LOSE);
      this.soba?.react('sad', 1800);
      if (-net >= 50) {
        this.booker?.react('happy', 1800); // the house wins big
        this.say('booker', n === 0 ? 'Zero takes it all!' : 'The house thanks you!', 1800);
      } else {
        this.booker?.react('sad', 1600);
        this.say('booker', n === 0 ? 'Zero. Tough luck!' : 'So close! Next spin?', 1800);
      }
      playSfx('lose', { gain: 0.7 });
    } else {
      this.setResultLine('PUSH ±0', COLORS.PUSH);
      this.soba?.react('nervous', 1000);
      this.say('booker', 'Even. Your chips come back.', 1600);
      playSfx('push');
    }
  }

  // --- leaving / state ------------------------------------------------------------------------

  canLeave() {
    return !this.roundActive && this.phase !== 'spinning';
  }

  onLeave() {
    this.clearBets({ sfx: false });
  }

  snapshot() {
    return {
      ...super.snapshot(),
      phase: this.phase,
      bets: { ...this.bets },
      totalBet: this.totalBet(),
      lastNumber: this.lastNumber,
      lastColor: this.lastNumber === null ? null : colorOf(this.lastNumber),
      history: [...this.history],
      spinning: !!this.wheel?.spinning,
      canRebet: !!this.lastBets,
      undoSteps: this.actions.length,
      hovered: this.hovered,
      marquee: this.mTitle?.text ?? null,
    };
  }
}
