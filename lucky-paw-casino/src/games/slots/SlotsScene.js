// =============================================================================
// SlotsScene — "Golden Paw", 5 reels x 3 rows, 10 fixed lines.
//
// Outcome first: the stops come from this.rng (logic.spinOutcome), then the
// reels animate to land exactly on them. Rules and money math live in
// logic.js / config.js (pure, node-tested); this file is presentation + flow.
//
// MONEY / ROUND CONVENTION
//   A paid spin is one wallet round: wallet.bet(totalBet) when it starts.
//   - No bonus: settle(totalBet, win) as soon as the reels stop.
//   - Bonus (3+ Star Tags): the round stays open through every free spin.
//     The trigger spin's win and each free spin's win are credited with
//     wallet.pay() as they land (the balance climbs live), and when the bonus
//     ends the whole thing is booked ONCE: settle(totalBet, baseWin + all
//     free-spin wins, { alreadyPaid: true }). Free spins never call bet(), so
//     wagered stays the real stake and win ratios / stats stay honest.
//
// Controls: Space = spin / slam-stop / skip count; Up/Down = bet; A = auto;
// T = turbo. Auto: 10 spins, stops on a big win (>= 10x), a bonus, when chips
// run out, or on any click.
//
// Debug (?debug=1 only):
//   __CASINO__.force.slots(stopsOrGrid, ...more)  queue forced outcomes
//     stops = [5 numbers] (strip index of each reel's top row)
//     grid  = [[top, mid, bottom] x 5] symbol ids
// =============================================================================

import { BaseGameScene } from '../BaseGameScene.js';
import { COLORS, DEPTH, FONT, GAME, ECONOMY } from '../../core/Constants.js';
import { wallet, rng } from '../../core/Casino.js';
import { Events, listen } from '../../core/EventBus.js';
import { text, fmt, shade } from '../../ui/theme.js';
import { playSfx, panOfX } from '../../audio/sfx.js';
import {
  STRIPS, LINES, LINE_COLORS, PAYTABLE, SCATTER_PAYS, SYMBOL_NAMES, SYMBOL_SHORT, SYMBOLS,
  LINE_BETS, TIMING, FREE_SPINS_AWARD, FREE_SPINS_CAP, FREE_SPIN_MULT, SCATTER,
} from './config.js';
import { gridFromStops, evaluateGrid, spinOutcome, randomStops, allowedLineBets, totalBetFor } from './logic.js';
import { makeSlotTextures, CELL_W, CELL_H, SYM_SIZE } from './textures.js';
import { Reel } from './Reel.js';
import { Cabinet, CX, REEL_X, ROWS_TOP, rowY, METER, WIN } from './Cabinet.js';

// Remembered across visits (not saved)
let savedLineBet = 1;
let savedTurbo = false;

const mod = (a, n) => ((a % n) + n) % n;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function rulesConfig() {
  const p = (s) => `${PAYTABLE[s][3]} / ${PAYTABLE[s][4]} / ${PAYTABLE[s][5]}`;
  return {
    lines: [
      '10 lines (below) pay left to right. Bet = line bet × 10. Best win per line.',
      'Golden Paw is WILD for every symbol but the Star Tag, and pays on its own.',
      `Star Tags pay anywhere. 3+ = ${FREE_SPINS_AWARD} FREE SPINS, wins ×${FREE_SPIN_MULT} (retriggers, ${FREE_SPINS_CAP} max).`,
      'Space spins or slams. Up/Down bet, A auto, T turbo.',
    ],
    payouts: [
      ['3 / 4 / 5 in a row', '× line bet'],
      ['Golden Paw (wild)', p('wild')],
      ['Booker', p('booker')],
      ['Soba', p('soba')],
      ['Bone', p('bone')],
      ['Tennis Ball', p('ball')],
      ['Hydrant', p('hydrant')],
      ['Dog Bowl', p('bowl')],
      ['Star Tag × total bet', `${SCATTER_PAYS[3]} / ${SCATTER_PAYS[4]} / ${SCATTER_PAYS[5]}`],
    ],
  };
}

const SOBA_WIN = ['Good boy, reels!', 'Treats for me!', 'Ooh, shiny!', 'Again! Again!', 'Paws up!'];
const SOBA_BIG = ['WOOF! Look at that!', 'Booker! We\'re rich!', 'Best. Spin. Ever.'];
const SOBA_MISS = ['So close!', 'Two tags... sniff.', 'Next one, next one!'];

export class SlotsScene extends BaseGameScene {
  constructor() {
    super('Slots', { id: 'slots', booker: 'booker', rules: rulesConfig() });
  }

  init() {
    super.init();
    this.alive = true;
    this.phase = 'idle';
    this.spinning = false;
    this.busy = false;
    this.inBonus = false;
    this.autoLeft = 0;
    this.forceQueue = [];
    this.lastOutcome = null;
    this.lastWin = 0;
    this.roundWin = 0;
    this.freeSpinsLeft = 0;
    this.freeSpinsPlayed = 0;
    this.freeSpinTotal = 0;
    this.freeAwarded = 0;
    this.card = null;
    this.cycle = null;
    this.pulsing = [];
    this.lossStreak = 0;
  }

  create() {
    super.create();
    // Bubbles go to empty background: Soba above its seat (a right-side bubble
    // covered the win meter's WIN label), Booker under his frame (left of him
    // are the reels).
    this.soba.bubbleSide = 'top';
    this.soba.bubbleWidth = 184;
    this.booker.bubbleSide = 'below';
    this.booker.bubbleWidth = 196;
    makeSlotTextures(this);
    this.fx = rng.stream('slots-fx'); // cosmetic choices only (lines, idle reels)
    this.turbo = savedTurbo;

    // Free-spins room tint (between the background and the cabinet)
    this.roomTint = this.add.rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x3a0f5e, 0).setDepth(DEPTH.BG + 2);

    this.cabinet = new Cabinet(this);
    const stops = randomStops(this.fx);
    const grid = gridFromStops(stops);
    this.grid = grid;
    this.reels = REEL_X.map((x, i) => new Reel(this, i, {
      x, top: ROWS_TOP, strip: STRIPS[i], depth: DEPTH.GAME, stop: stops[i], grid: grid[i],
      onLand: (r) => this.onReelLand(r),
    }));

    this.coins = this.add.particles(CX, METER.y + 30, 'particle-coin', {
      speed: { min: 220, max: 480 }, angle: { min: 215, max: 325 }, gravityY: 900, lifespan: 1200,
      scale: { min: 0.8, max: 1.25 }, rotate: { min: 0, max: 360 }, emitting: false,
    }).setDepth(DEPTH.FLOAT - 5);
    this.sparks = this.add.particles(0, 0, 'particle-spark', {
      speed: { min: 80, max: 260 }, lifespan: 500, scale: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
      tint: [0xffe49a, 0xd27bff, 0xffffff],
    }).setDepth(DEPTH.GAME + 40);

    this.buildControls();
    this.decorateRules();
    this.setLineBet(savedLineBet);
    this.idleMessage();
    this.cabinet.setWin(0);

    // VIP limit can rise mid-session
    listen(this, Events.VIP_UP, () => this.time.delayedCall(50, () => this.setLineBet(this.lineBet)));

    // Any click stops Auto (except on the Auto button, which toggles it)
    this.onAnyPointer = (pointer, over) => {
      if (this.autoLeft > 0 && !(over || []).includes(this.autoBtn.zone)) this.stopAuto(true);
    };
    this.input.on('pointerdown', this.onAnyPointer);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.input.off('pointerdown', this.onAnyPointer);
      this.cabinet?.destroy();
      this.stopCycle();
    });

    this.installDebug();
    this.time.delayedCall(500, () => this.say('soba', 'Spin it, spin it! Golden Paws are wild!', 2400));
  }

  // --- controls ------------------------------------------------------------------------

  buildControls() {
    const y = 654;
    this.minusBtn = this.addButton(262, y, { label: '-', w: 64, h: 60, style: 'secondary', size: 40, hotkey: 'DOWN', onClick: () => this.stepBet(-1) });
    this.plusBtn = this.addButton(498, y, { label: '+', w: 64, h: 60, style: 'secondary', size: 40, hotkey: 'UP', onClick: () => this.stepBet(1) });
    const g = this.add.graphics().setDepth(DEPTH.UI);
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(300 + 2, y - 34 + 5, 160, 68, 14);
    g.fillStyle(0x120c07, 0.96);
    g.fillRoundedRect(300, y - 34, 160, 68, 14);
    g.lineStyle(2, COLORS.SLOTS, 0.95);
    g.strokeRoundedRect(300, y - 34, 160, 68, 14);
    this.betLabel = text(this, 380, y - 16, '', { size: 20, color: COLORS.TEXT_DIM, num: true }).setDepth(DEPTH.UI);
    this.betText = text(this, 380, y + 12, '', { size: 32, color: COLORS.GOLD_LIGHT, num: true }).setDepth(DEPTH.UI);

    this.spinBtn = this.addButton(660, y, {
      label: 'SPIN', hint: 'Space', hotkey: 'SPACE', style: 'gold', w: 220, h: 72, size: 34, sfx: null,
      onClick: () => this.onSpinPressed(),
    });
    this.autoBtn = this.addButton(866, y, { label: 'AUTO', hint: '10 spins', w: 160, h: 64, style: 'secondary', hotkey: 'A', onClick: () => this.toggleAuto() });
    this.turboBtn = this.addButton(1046, y, { label: 'TURBO', hint: 'off', w: 160, h: 64, style: 'secondary', hotkey: 'T', onClick: () => this.toggleTurbo() });
    this.refreshTurbo();
    // gentle idle pulse on the spin button
    this.spinGlow = this.add.image(660, y, 'ui-glow').setDepth(DEPTH.UI - 1).setTint(COLORS.GOLD).setAlpha(0.25).setScale(2.6, 1.2).setBlendMode('ADD');
    this.tweens.add({ targets: this.spinGlow, alpha: 0.5, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  maxTotal() {
    return Math.max(LINE_BETS[0] * 10, wallet.maxBet());
  }

  setLineBet(lb) {
    const allowed = allowedLineBets(this.maxTotal());
    let pick = allowed[0];
    for (const b of allowed) if (b <= lb) pick = b;
    this.lineBet = pick;
    savedLineBet = pick;
    this.betLabel.setText(`${pick} × 10 LINES`);
    this.betText.setText(fmt(totalBetFor(pick)));
    this.refreshControls();
  }

  stepBet(dir) {
    if (this.locked()) return;
    const allowed = allowedLineBets(this.maxTotal());
    const i = allowed.indexOf(this.lineBet);
    const j = Math.max(0, Math.min(allowed.length - 1, i + dir));
    if (j === i) {
      if (dir > 0 && LINE_BETS.indexOf(this.lineBet) < LINE_BETS.length - 1) this.toast(`Max bet is ${fmt(wallet.maxBet())} (VIP limit)`, 'warn');
      return;
    }
    this.setLineBet(allowed[j]);
    playSfx('chip');
    this.tweens.add({ targets: this.betText, scale: 1.18, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  locked() {
    return this.spinning || this.inBonus || this.roundActive || this.autoLeft > 0;
  }

  refreshControls() {
    if (!this.minusBtn) return;
    const lock = this.locked();
    const allowed = allowedLineBets(this.maxTotal());
    this.minusBtn.setEnabled(!lock && this.lineBet > allowed[0]);
    this.plusBtn.setEnabled(!lock && this.lineBet < allowed[allowed.length - 1]);
    this.spinBtn.setLabel(this.spinning ? 'STOP' : this.inBonus ? 'FREE' : 'SPIN');
    this.autoBtn.setEnabled(!this.inBonus || this.autoLeft > 0);
    this.autoBtn.setLabel(this.autoLeft > 0 ? `STOP ${this.autoLeft}` : 'AUTO');
    this.autoBtn.setHint(this.autoLeft > 0 ? 'click' : '10 spins');
    this.spinGlow?.setVisible(!this.spinning && !this.inBonus);
  }

  toggleTurbo() {
    this.turbo = !this.turbo;
    savedTurbo = this.turbo;
    this.refreshTurbo();
  }

  refreshTurbo() {
    this.turboBtn.setStyle(this.turbo ? 'primary' : 'secondary');
    this.turboBtn.setHint(this.turbo ? 'on' : 'off');
  }

  toggleAuto() {
    if (this.autoLeft > 0) return this.stopAuto(false);
    if (this.inBonus) return;
    const why = this.whyNotSpin();
    if (why) return this.toast(why, 'warn');
    this.autoLeft = 10;
    this.refreshControls();
    if (!this.busy && !this.spinning) this.autoNext();
  }

  stopAuto(byClick) {
    if (this.autoLeft <= 0) return;
    this.autoLeft = 0;
    this.refreshControls();
    if (byClick) this.toast('Auto stopped');
  }

  autoNext() {
    if (!this.alive || this.autoLeft <= 0 || this.busy || this.spinning) return;
    const why = this.whyNotSpin();
    if (why) {
      this.stopAuto(false);
      this.toast(why === 'Not enough chips' ? 'Out of chips - auto stopped' : why, 'warn');
      return;
    }
    this.autoLeft -= 1;
    this.spin(true);
  }

  whyNotSpin() {
    return wallet.whyNot(totalBetFor(this.lineBet));
  }

  // --- input -----------------------------------------------------------------------------------

  onSpinPressed() {
    if (this.card) return this.card.dismiss();
    if (this.banner.active) return this.banner.skip();
    if (this.spinning) return this.slam();
    if (this.cabinet.counting) return this.cabinet.finishCount();
    if (this.busy || this.inBonus || this.autoLeft > 0) return;
    this.spin(false);
  }

  // --- the round ----------------------------------------------------------------------------------

  async spin(fromAuto = false) {
    if (this.busy || this.spinning || this.inBonus) return;
    const total = totalBetFor(this.lineBet);
    const why = wallet.whyNot(total);
    if (why) {
      // Can a smaller bet still play? Offer it instead of a dead button.
      const fits = allowedLineBets(Math.min(this.maxTotal(), wallet.balance));
      if (why === 'Not enough chips' && totalBetFor(fits[fits.length - 1]) <= wallet.balance) {
        this.setLineBet(fits[fits.length - 1]);
        this.toast(`Not enough chips - bet lowered to ${fmt(totalBetFor(this.lineBet))}`, 'warn');
      } else {
        this.toast(why === 'Not enough chips' ? 'Not enough chips - visit the cashier in the lobby' : why, 'warn');
      }
      this.soba.react('nervous', 900);
      return;
    }
    playSfx('click');
    this.busy = true;
    this.clearWinShow();
    wallet.bet(this.id, total);
    this.beginRound();
    this.roundLineBet = this.lineBet;
    this.roundWager = total;
    this.roundWin = 0;
    this.lastWin = 0;
    this.cabinet.setWin(0);
    this.cabinet.setMessage('GOOD LUCK!', COLORS.CREAM);
    this.refreshControls();

    const out = this.nextOutcome({ free: false, awardedSoFar: 0 });
    await this.runReels(out);
    if (!this.alive) return;
    this.applyOutcome(out);

    if (out.freeSpins > 0) {
      if (this.autoLeft > 0) this.stopAuto(false);
      await this.bonusRound(out);
      if (!this.alive) return;
    } else {
      const r = this.settle(total, out.win, { react: false, banner: false });
      this.roundWin = out.win;
      this.reactToSpin(out, total);
      if (r.x >= ECONOMY.BIG_WIN_X && this.autoLeft > 0) this.stopAuto(false);
      await this.presentWin(out);
      if (!this.alive) return;
      if (r.x >= ECONOMY.BIG_WIN_X) {
        this.cabinet.setChase('win');
        await this.banner.show({ amount: out.win, wagered: total });
        if (!this.alive) return;
        this.cabinet.setChase('idle');
      }
    }
    this.busy = false;
    this.refreshControls();
    if (this.lastOutcome?.win > 0) this.startCycle(this.lastOutcome);
    if (this.autoLeft > 0) this.time.delayedCall(TIMING.AUTO_GAP * (this.turbo ? 0.5 : 1), () => this.autoNext());
    else if (fromAuto) this.refreshControls();
  }

  nextOutcome({ free, awardedSoFar }) {
    const lineBet = this.roundLineBet;
    const f = this.forceQueue.shift();
    if (f) {
      let stops = null;
      let grid;
      if (Array.isArray(f) && f.length === 5 && f.every(n => typeof n === 'number')) {
        stops = f.map((n, i) => mod(Math.floor(n), STRIPS[i].length));
        grid = gridFromStops(stops);
      } else {
        grid = f.map(col => col.map(s => (SYMBOLS.includes(s) ? s : 'bowl')));
      }
      return { stops, grid, forced: true, ...evaluateGrid(grid, { lineBet, free, awardedSoFar }) };
    }
    return spinOutcome(this.rng, { lineBet, free, awardedSoFar });
  }

  applyOutcome(out) {
    this.lastOutcome = out;
    this.grid = out.grid;
    this.lastWin = out.win;
  }

  // --- reels ------------------------------------------------------------------------------------

  runReels(out) {
    return new Promise((resolve) => {
      const T = this.turbo ? TIMING.TURBO : TIMING;
      this.T = T;
      this.spinning = true;
      this.slammed = false;
      this.spinClock = 0;
      this.landedCount = 0;
      this.scattersLanded = 0;
      this.anticipating = false;
      this.landedAt = [0, 0, 0, 0, 0];
      this.spinOut = out;
      this.reelsResolve = resolve;
      this.stopAt = [0, 1, 2, 3, 4].map(i => (T.FIRST_STOP + i * T.STAGGER) / 1000);
      this.reels.forEach((r, i) => r.start(i * 0.035, T.KICK / 1000));
      this.sfxClock = 0;
      this.tickClock = 0;
      playSfx('reelSpin', { gain: 0.8 });
      this.cabinet.setChase(this.inBonus ? 'free' : 'spin');
      this.refreshControls();
    });
  }

  update(time, delta) {
    if (!this.reels) return;
    const dt = Math.min(delta, 50) / 1000;
    for (const r of this.reels) r.update(dt);
    if (!this.spinning) return;
    this.spinClock += dt;
    const out = this.spinOut;
    for (let i = 0; i < 5; i++) {
      const r = this.reels[i];
      if (r.stopRequested) continue;
      if (this.spinClock < this.stopAt[i] || (i > 0 && !this.reels[i - 1].stopRequested)) continue;
      // Anticipation: 2+ Star Tags already decided on the reels to the left ->
      // wait for the previous reel to land, then spin slowly a moment longer.
      if (!this.slammed && this.scattersBefore(out, i) >= 2) {
        const prev = this.reels[i - 1];
        if (prev.spinning || this.spinClock < this.landedAt[i - 1] + this.T.ANTICIPATE / 1000) continue;
      }
      r.requestStop(out.grid[i], out.stops ? out.stops[i] : null, this.slammed);
    }
    // spinning hum + anticipation ticks
    this.sfxClock += dt;
    if (this.sfxClock > 0.42 && this.reels.some(r => r.state === 'spin')) {
      this.sfxClock = 0;
      playSfx('reelSpin', { gain: 0.45 });
    }
    if (this.anticipating) {
      this.tickClock += dt;
      if (this.tickClock > 0.075) {
        this.tickClock = 0;
        playSfx('wheelTick', { speed: 1, gain: 0.8 });
      }
    }
  }

  scattersBefore(out, i) {
    let n = 0;
    for (let r = 0; r < i; r++) if (out.grid[r].includes(SCATTER)) n++;
    return n;
  }

  slam() {
    if (!this.spinning || this.slammed) return;
    this.slammed = true;
    this.anticipating = false;
    this.cabinet.setGlow([]);
    for (let i = 0; i < 5; i++) {
      const r = this.reels[i];
      r.setAnticipation(false);
      if (!r.stopRequested) this.stopAt[i] = Math.min(this.stopAt[i], this.spinClock + i * 0.045);
    }
  }

  onReelLand(reel) {
    const i = reel.index;
    playSfx('reelStop', { index: i, pan: panOfX(reel.x) });
    // squash-settle on the landed symbols
    for (let row = 0; row < 3; row++) {
      const c = reel.cellAt(row);
      if (!c) continue;
      const k = SYM_SIZE / 128;
      c.sym.setScale(k * 1.06, k * 0.9);
      this.tweens.add({ targets: c.sym, scaleX: k, scaleY: k, duration: 220, ease: 'Back.easeOut' });
    }
    const col = this.spinOut.grid[i];
    const sRow = col.indexOf(SCATTER);
    if (sRow >= 0) {
      this.scattersLanded += 1;
      const c = reel.cellAt(sRow);
      if (c) {
        const k = SYM_SIZE / 128;
        this.tweens.add({ targets: c.sym, scaleX: k * 1.3, scaleY: k * 1.3, duration: 140, yoyo: true, ease: 'Quad.easeOut', delay: 60 });
      }
      this.sparks.explode(14, reel.x, rowY(sRow));
      playSfx('coin', { index: this.scattersLanded * 4, gain: 0.9 });
    }
    this.landedCount += 1;

    this.landedAt[i] = this.spinClock;
    // Anticipation: 2+ Star Tags down and reels still spinning -> they slow and glow
    if (!this.slammed && this.scattersLanded >= 2 && i < 4) {
      if (!this.anticipating) {
        this.anticipating = true;
        this.soba.setMood('nervous');
        this.soba.react('nervous', 1400);
        this.say('soba', this.inBonus ? 'More tags... more tags...' : 'One more tag... please!', 1600);
      }
      const left = [];
      for (let j = i + 1; j < 5; j++) {
        if (this.reels[j].stopRequested) continue;
        this.reels[j].setAnticipation(true);
        left.push(j);
      }
      this.cabinet.setGlow(left);
      if (!left.length) this.anticipating = false;
    } else if (this.anticipating) {
      this.cabinet.setGlow([]);
    }

    if (this.landedCount >= 5) {
      this.spinning = false;
      this.anticipating = false;
      this.cabinet.setGlow([]);
      this.soba.setMood('neutral');
      for (const r of this.reels) r.setAnticipation(false);
      this.cabinet.setChase(this.inBonus ? 'free' : 'idle');
      this.refreshControls();
      const res = this.reelsResolve;
      this.reelsResolve = null;
      res?.();
    }
  }

  // --- wins --------------------------------------------------------------------------------------

  lineMessage(l) {
    return `LINE ${l.line} · ${l.count}× ${SYMBOL_SHORT[l.symbol]} · ${fmt(l.pay)}`;
  }

  scatterMessage(out) {
    return `${out.scatters}× STAR TAG · ${fmt(out.scatterPay)}`;
  }

  /** Cells that win in an outcome: [[reel,row], ...] (deduped). */
  winCells(out) {
    const set = new Map();
    for (const l of out.lines) for (const [r, row] of l.cells) set.set(`${r},${row}`, [r, row]);
    if (out.scatterPay > 0) for (const c of out.scatterCells) set.set(`${c[0]},${c[1]}`, c);
    return [...set.values()];
  }

  /** Count up, draw every winning line, coins. In the bonus the meter shows the bonus total. */
  async presentWin(out) {
    if (out.win <= 0) {
      if (!this.inBonus) this.idleMessage(true);
      return;
    }
    const total = this.roundWager;
    const x = out.win / total;
    this.cabinet.clearLines();
    out.lines.forEach(l => this.cabinet.drawLine(l.line - 1, l.count));
    if (out.scatterPay > 0) this.cabinet.frameCells(out.scatterCells);
    this.highlightCells(this.winCells(out));
    for (const l of out.lines) this.cabinet.flashMarker(l.line - 1);
    if (out.lines.length === 1 && !out.scatterPay) this.cabinet.setMessage(this.lineMessage(out.lines[0]), LINE_COLORS[out.lines[0].line - 1]);
    else if (!out.lines.length) this.cabinet.setMessage(this.scatterMessage(out), 0xe3a8ff);
    else this.cabinet.setMessage(`${out.lines.length + (out.scatterPay ? 1 : 0)} WINS${this.inBonus ? ` · ×${FREE_SPIN_MULT}` : ''}`, COLORS.GOLD_LIGHT);
    this.coins.explode(Math.min(40, 8 + Math.round(x * 3)));
    playSfx(x >= 5 ? 'bigWin' : 'win', { gain: x >= 5 ? 0.6 : 0.8 });
    if (!this.inBonus) this.cabinet.setChase('win');
    const from = this.inBonus ? this.freeSpinTotal - out.win : 0;
    const to = this.inBonus ? this.freeSpinTotal : out.win;
    this.cabinet.meterValue = from;
    const ms = this.turbo ? 450 : Math.min(2200, 600 + x * 70);
    await this.cabinet.countTo(to, ms, (k) => playSfx('coin', { index: k, gain: 0.45 }));
    if (!this.inBonus) this.cabinet.setChase('idle');
  }

  highlightCells(cells) {
    this.unpulse();
    const k = SYM_SIZE / 128;
    const key = new Set(cells.map(([r, row]) => `${r},${row}`));
    for (let r = 0; r < 5; r++) {
      for (let row = 0; row < 3; row++) {
        const c = this.reels[r].cellAt(row);
        if (!c) continue;
        if (key.has(`${r},${row}`)) {
          c.sym.setAlpha(1);
          c.panel.setAlpha(1);
          this.tweens.add({ targets: c.sym, scaleX: k * 1.14, scaleY: k * 1.14, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.pulsing.push(c.sym);
        } else {
          c.sym.setAlpha(0.4);
          c.panel.setAlpha(0.55);
        }
      }
    }
  }

  unpulse() {
    const k = SYM_SIZE / 128;
    for (const s of this.pulsing) {
      this.tweens.killTweensOf(s);
      if (s.active) s.setScale(k);
    }
    this.pulsing = [];
    for (const r of this.reels) for (const c of r.cells) { c.sym.setAlpha(1); c.panel.setAlpha(1); }
  }

  /** Cycle through each winning line (and the scatter pay) until the next spin. */
  startCycle(out) {
    this.stopCycle();
    const entries = out.lines.map(l => ({ kind: 'line', l }));
    if (out.scatterPay > 0) entries.push({ kind: 'scatter' });
    if (!entries.length) return;
    let k = 0;
    const show = () => {
      if (!this.alive) return;
      const e = entries[k % entries.length];
      this.cabinet.clearLines();
      if (e.kind === 'line') {
        this.cabinet.drawLine(e.l.line - 1, e.l.count);
        this.cabinet.flashMarker(e.l.line - 1);
        this.highlightCells(e.l.cells);
        this.cabinet.setMessage(this.lineMessage(e.l), LINE_COLORS[e.l.line - 1]);
        if (k < entries.length) playSfx('peg', { note: 4 + k * 2, gain: 0.7 });
      } else {
        this.cabinet.frameCells(out.scatterCells);
        this.highlightCells(out.scatterCells);
        this.cabinet.setMessage(this.scatterMessage(out), 0xe3a8ff);
      }
      k += 1;
    };
    show();
    this.cycle = this.time.addEvent({ delay: TIMING.LINE_SHOW, loop: true, callback: show });
  }

  stopCycle() {
    this.cycle?.remove(false);
    this.cycle = null;
  }

  clearWinShow() {
    this.stopCycle();
    this.unpulse();
    this.cabinet?.clearLines();
  }

  idleMessage(lost = false) {
    if (lost) this.cabinet.setMessage(this.lastOutcome?.scatters === 2 ? 'SO CLOSE! 2 STAR TAGS' : 'NO WIN · SPIN AGAIN', COLORS.TEXT_DIM);
    else this.cabinet.setMessage('10 LINES · WILD PAWS · FREE SPINS', COLORS.GOLD_LIGHT);
  }

  pickLine(arr) {
    return arr[this.fx.int(arr.length)];
  }

  reactToSpin(out, total) {
    const x = out.win / total;
    if (x >= ECONOMY.BIG_WIN_X) {
      this.lossStreak = 0;
      this.soba.react('happy', 2600);
      this.booker.react('happy', 2600);
      this.say('soba', this.pickLine(SOBA_BIG), 2400);
      this.time.delayedCall(700, () => this.alive && this.say('booker', x >= ECONOMY.MEGA_WIN_X ? 'MEGA PAWS! Woof woof!' : 'Big win! Good boy!', 2200));
      playSfx('woof', { delay: 0.25 });
    } else if (out.win > 0) {
      this.lossStreak = 0;
      this.soba.react('happy', 1200);
      if (x >= 3) this.say('soba', this.pickLine(SOBA_WIN), 1600);
    } else {
      this.lossStreak += 1;
      if (out.scatters === 2) {
        this.soba.react('sad', 1300);
        this.say('soba', this.pickLine(SOBA_MISS), 1500);
      } else {
        this.soba.react('sad', 700);
        if (this.lossStreak % 4 === 0) this.booker.react('smug', 1200);
      }
    }
  }

  // --- free spins ---------------------------------------------------------------------------------

  async bonusRound(out) {
    this.inBonus = true;
    this.refreshControls();
    // Trigger spin: its own wins (lines + scatter pay) are paid now, booked at the end
    this.cabinet.clearLines();
    this.cabinet.frameCells(out.scatterCells);
    this.highlightCells(out.scatterCells);
    this.cabinet.setMessage(`${out.scatters} STAR TAGS!`, 0xe3a8ff);
    this.cabinet.setChase('win');
    playSfx('bonus');
    this.soba.react('happy', 2400);
    this.booker.react('happy', 2400);
    this.say('soba', 'STAR TAGS! Free spins!!', 2000);
    if (out.win > 0) {
      wallet.pay(this.id, out.win);
      this.roundWin = out.win;
      this.coins.explode(16);
      this.cabinet.meterValue = 0;
      await this.cabinet.countTo(out.win, this.turbo ? 400 : 900, (k) => playSfx('coin', { index: k, gain: 0.45 }));
    }
    await this.wait(this.turbo ? 300 : 700);
    if (!this.alive) return;

    this.freeSpinsLeft = out.freeSpins;
    this.freeAwarded = out.freeSpins;
    this.freeSpinsPlayed = 0;
    this.freeSpinTotal = 0;
    await this.showCard('intro', { spins: out.freeSpins });
    if (!this.alive) return;
    this.clearWinShow();
    this.setFreeLook(true);
    this.cabinet.setWin(0);
    this.cabinet.winLabel.setText('BONUS');

    while (this.freeSpinsLeft > 0) {
      this.freeSpinsLeft -= 1;
      this.freeSpinsPlayed += 1;
      this.updateFreeSub();
      this.clearWinShow();
      this.cabinet.setMessage(`FREE SPIN ${this.freeSpinsPlayed} · WINS ×${FREE_SPIN_MULT}`, 0xe3a8ff);
      const fo = this.nextOutcome({ free: true, awardedSoFar: this.freeAwarded });
      await this.runReels(fo);
      if (!this.alive) return;
      this.applyOutcome(fo);
      if (fo.win > 0) {
        wallet.pay(this.id, fo.win);
        this.freeSpinTotal += fo.win;
        this.roundWin += fo.win;
        this.soba.react('happy', 900);
      }
      await this.presentWin(fo);
      if (!this.alive) return;
      if (fo.freeSpins > 0) {
        this.freeSpinsLeft += fo.freeSpins;
        this.freeAwarded += fo.freeSpins;
        this.updateFreeSub();
        playSfx('bonus');
        await this.showCard('retrigger', { spins: fo.freeSpins });
        if (!this.alive) return;
      }
      await this.wait(fo.win > 0 ? (this.turbo ? 350 : 800) : (this.turbo ? 120 : 320));
      if (!this.alive) return;
    }

    this.clearWinShow();
    await this.showCard('summary', { total: this.freeSpinTotal, spins: this.freeSpinsPlayed });
    if (!this.alive) return;
    this.setFreeLook(false);
    this.cabinet.winLabel.setText('WIN');
    this.inBonus = false;
    this.freeSpinsLeft = 0;
    // The whole bonus belongs to the triggering spin's round (already paid live)
    const r = this.settle(this.roundWager, this.roundWin, { alreadyPaid: true, react: false, banner: false });
    this.cabinet.setWin(this.roundWin, { color: COLORS.GOLD_LIGHT });
    this.cabinet.setMessage(`BONUS ROUND PAID ${fmt(this.roundWin)}`, COLORS.GOLD_LIGHT);
    this.idleSub();
    this.lastOutcome = { ...this.lastOutcome, win: 0 }; // no line cycle for the last free spin
    if (r.x >= ECONOMY.BIG_WIN_X) {
      this.soba.react('happy', 2600);
      this.booker.react('happy', 2600);
      this.say('booker', 'What a bonus! Woof!', 2200);
      this.cabinet.setChase('win');
      await this.banner.show({ amount: this.roundWin, wagered: this.roundWager });
      if (!this.alive) return;
      this.cabinet.setChase('idle');
    } else if (this.roundWin > 0) {
      this.soba.react('happy', 1500);
    } else {
      this.soba.react('sad', 1200);
    }
  }

  updateFreeSub() {
    const n = this.freeSpinsPlayed + this.freeSpinsLeft;
    this.cabinet.setSub(`FREE SPINS ${this.freeSpinsPlayed} OF ${n}  ·  ALL WINS ×${FREE_SPIN_MULT}`, 0xffb8f6);
    this.tweens.add({ targets: this.cabinet.sub, scale: 1.12, duration: 100, yoyo: true });
  }

  idleSub() {
    this.cabinet.setSub('WILD PAWS  ·  3 STAR TAGS = FREE SPINS');
  }

  setFreeLook(on) {
    this.cabinet.setFreeMode(on);
    this.tweens.add({ targets: this.roomTint, fillAlpha: on ? 0.42 : 0, duration: 500 });
    for (const r of this.reels) r.setPanelTint(on ? 0xe6d6ff : null);
    if (on) this.updateFreeSub();
    else this.idleSub();
  }

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  /** Intro / retrigger / summary card. Resolves on click, Space, or after a few seconds. */
  showCard(kind, data) {
    return new Promise((resolve) => {
      const cx = GAME.WIDTH / 2;
      const cy = 330;
      const root = this.add.container(0, 0).setDepth(DEPTH.BANNER - 5);
      const dim = this.add.rectangle(cx, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x0a0312, 0.62).setInteractive();
      root.add(dim);
      const rays = this.add.graphics({ x: cx, y: cy });
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = a0 + Math.PI / 16;
        rays.fillStyle(i % 2 ? 0xb388ff : COLORS.GOLD, 0.13);
        rays.fillTriangle(0, 0, Math.cos(a0) * 620, Math.sin(a0) * 620, Math.cos(a1) * 620, Math.sin(a1) * 620);
      }
      root.add(rays);
      this.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });

      const W = 600;
      const H = kind === 'summary' ? 360 : 330;
      const panel = this.add.container(cx, cy);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.5);
      g.fillRoundedRect(-W / 2 + 4, -H / 2 + 10, W, H, 28);
      g.fillStyle(0x7a5414, 1);
      g.fillRoundedRect(-W / 2, -H / 2, W, H, 28);
      g.fillStyle(0xe0a526, 1);
      g.fillRoundedRect(-W / 2 + 4, -H / 2 + 3, W - 8, H - 8, 25);
      g.fillStyle(0x3d1660, 1);
      g.fillRoundedRect(-W / 2 + 14, -H / 2 + 12, W - 28, H - 26, 18);
      g.fillStyle(0xffffff, 0.06);
      g.fillRoundedRect(-W / 2 + 18, -H / 2 + 16, W - 36, 50, 14);
      panel.add(g);

      const tags = [];
      let countTween = null;
      if (kind !== 'summary') {
        for (let i = -1; i <= 1; i++) {
          const t = this.add.image(i * 96, -H / 2 + 72 + (i === 0 ? -6 : 6), 'sym-scatter').setDisplaySize(i === 0 ? 108 : 84, i === 0 ? 108 : 84);
          tags.push(t);
          panel.add(t);
        }
      } else {
        const p = this.add.image(0, -H / 2 + 62, 'sym-wild').setDisplaySize(96, 96);
        tags.push(p);
        panel.add(p);
      }
      let title, sub, big = null;
      if (kind === 'intro') {
        title = `${data.spins} FREE SPINS!`;
        sub = `ALL WINS ×${FREE_SPIN_MULT}`;
      } else if (kind === 'retrigger') {
        title = `+${data.spins} FREE SPINS!`;
        sub = 'STAR TAGS AGAIN!';
      } else {
        title = 'BONUS TOTAL';
        sub = `${data.spins} FREE SPINS PLAYED`;
      }
      const tt = text(this, 0, kind === 'summary' ? 0 : 22, title, {
        display: true, size: kind === 'summary' ? 40 : 48, color: COLORS.GOLD_LIGHT, stroke: 0x1a0626, strokeW: 9, shadow: true,
      });
      panel.add(tt);
      if (kind === 'summary') {
        big = text(this, 0, 62, '0', { size: 60, num: true, color: COLORS.CREAM, stroke: 0x1a0626, strokeW: 9 });
        panel.add(big);
      }
      const st = text(this, 0, kind === 'summary' ? 112 : 78, sub, { size: 30, color: 0xffb8f6, stroke: 0x1a0626, strokeW: 5 });
      panel.add(st);
      panel.add(text(this, 0, H / 2 - 32, 'Click or Space', { size: 20, color: COLORS.TEXT_DIM }));
      root.add(panel);

      panel.setScale(0.3);
      root.setAlpha(0);
      this.tweens.add({ targets: root, alpha: 1, duration: 160 });
      this.tweens.add({ targets: panel, scale: 1, duration: 420, ease: 'Back.easeOut' });
      this.tweens.add({ targets: tt, scale: { from: 1, to: 1.06 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      tags.forEach((t, i) => this.tweens.add({ targets: t, y: t.y - 8, angle: { from: -6, to: 6 }, duration: 600 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      const conf = this.add.particles(cx, cy - 40, 'particle-confetti', {
        speed: { min: 260, max: 620 }, angle: { min: 200, max: 340 }, gravityY: 700, lifespan: 1800, rotate: { min: 0, max: 360 },
        scale: { min: 0.8, max: 1.3 }, tint: [0xffe49a, 0xd27bff, 0xff7bf0, 0x7ee0ff, 0xffffff], emitting: false,
      });
      root.add(conf);
      conf.explode(kind === 'summary' ? 40 : 70);
      if (kind === 'summary') {
        const o = { v: 0 };
        countTween = this.tweens.add({
          targets: o, v: data.total, duration: this.turbo ? 500 : 1200, ease: 'Cubic.easeOut',
          onUpdate: () => big.setText(fmt(o.v)),
          onComplete: () => { big.setText(fmt(data.total)); this.tweens.add({ targets: big, scale: 1.15, duration: 120, yoyo: true }); },
        });
        playSfx(data.total > 0 ? 'win' : 'push');
      } else {
        playSfx('bonus');
        playSfx('woof', { small: true, delay: 0.3 });
      }

      let done = false;
      const dismiss = () => {
        if (done) return;
        done = true;
        timer.remove(false);
        countTween?.stop();
        this.tweens.killTweensOf([rays, panel, tt, st, ...tags, ...(big ? [big] : [])]);
        if (this.card === card) this.card = null;
        this.tweens.add({
          targets: root, alpha: 0, duration: 180,
          onComplete: () => root.destroy(),
        });
        resolve();
      };
      const card = { kind, dismiss };
      this.card = card;
      dim.on('pointerdown', dismiss);
      const ms = kind === 'summary' ? 2800 : 2400;
      const timer = this.time.delayedCall(this.turbo ? ms * 0.6 : ms, dismiss);
    });
  }

  // --- rules panel: draw the 10 paylines --------------------------------------------------------

  decorateRules() {
    const rules = this.topBar?.rules;
    if (!rules) return;
    const open = rules.open.bind(rules);
    rules.open = () => {
      open();
      const root = rules.root;
      if (!root) return rules;
      // bottom of the left-column bullet text
      let bottom = 0;
      let left = 9999;
      for (const c of root.list) {
        if (c.type === 'Text' && c.originX === 0 && c.x < 640) {
          bottom = Math.max(bottom, c.y + c.height);
          left = Math.min(left, c.x);
        }
      }
      const x0 = left - 20;
      const y0 = bottom + 14;
      // two rows of 5 if they fit above the close button, else one compact row of 10
      const limit = (rules.closeBtn ? rules.closeBtn.y - 34 : 9999);
      const twoRows = y0 + 56 + 40 <= limit;
      const cw = twoRows ? 12 : 7, ch = twoRows ? 10 : 7;
      const pitchX = twoRows ? 92 : 47;
      const mini = this.add.graphics();
      root.add(mini);
      LINES.forEach((rows, i) => {
        const gx = x0 + (twoRows ? (i % 5) : i) * pitchX + 26;
        const gy = y0 + (twoRows ? Math.floor(i / 5) * 56 : 4);
        mini.fillStyle(0x000000, 0.35);
        mini.fillRoundedRect(gx - 4, gy - 4, cw * 5 + 8, ch * 3 + 8, 4);
        for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) {
          mini.fillStyle(rows[r] === row ? LINE_COLORS[i] : 0xf6ecd4, rows[r] === row ? 1 : 0.18);
          mini.fillRect(gx + r * cw + 1, gy + row * ch + 1, cw - 2, ch - 2);
        }
        root.add(text(this, gx - (i >= 9 ? 16 : 13), gy + ch * 1.5, String(i + 1), { size: 20, color: LINE_COLORS[i] }));
      });
      return rules;
    };
  }

  // --- debug hook -------------------------------------------------------------------------------------

  installDebug() {
    const C = typeof window !== 'undefined' ? window.__CASINO__ : null;
    if (!C?.debug?.enabled) return;
    const game = this.game;
    C.force = Object.assign(C.force || {}, {
      /** Queue forced outcomes for the next spins: stops [5] or grid [[top,mid,bot] x5]. */
      slots: (...outcomes) => {
        const s = game.scene.getScene('Slots');
        if (!s) return 0;
        s.forceQueue = s.forceQueue || [];
        for (const o of outcomes) s.forceQueue.push(o);
        return s.forceQueue.length;
      },
    });
  }

  // --- leaving / state ----------------------------------------------------------------------------------

  canLeave() {
    return !this.spinning && !this.inBonus && !this.roundActive;
  }

  onLeave() {
    this.autoLeft = 0;
    super.onLeave();
  }

  snapshot() {
    const out = this.lastOutcome;
    const grid = this.reels ? this.reels.map(r => r.column()) : this.grid;
    return {
      ...super.snapshot(),
      phase: this.inBonus ? 'freespins' : this.spinning ? 'spinning' : this.busy ? 'paying' : 'idle',
      spinning: this.spinning,
      lineBet: this.lineBet,
      totalBet: totalBetFor(this.lineBet),
      grid,
      stops: out?.stops ?? null,
      lastWin: this.lastWin,
      roundWin: this.roundWin,
      lines: out ? out.lines.map(l => ({ line: l.line, symbol: l.symbol, count: l.count, pay: l.pay })) : [],
      scatters: out ? out.scatters : 0,
      scatterPay: out ? out.scatterPay : 0,
      freeSpinsLeft: this.freeSpinsLeft,
      freeSpinsPlayed: this.freeSpinsPlayed,
      freeSpinTotal: this.freeSpinTotal,
      auto: this.autoLeft,
      turbo: this.turbo,
      card: this.card ? this.card.kind : null,
      counting: !!this.cabinet?.counting,
      forced: this.forceQueue.length,
    };
  }
}
