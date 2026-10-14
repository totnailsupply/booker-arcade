// =============================================================================
// BlackjackScene — Booker deals, Soba sits in your seat and knows the book.
//
// Rules live in logic.js (pure, node-tested); Soba's hints in strategy.js.
// Flow: betting (chip tray -> circle, Rebet / Rebet x2, Deal = Space)
//   -> deal (reshuffle first when the cut card is out) -> player decisions
//   (Hit H, Stand S, Double D, Split P, Hint ?) -> dealer -> settle -> clear.
// Money: the circle's chips are taken by BetSpot (wallet.bet); doubles and
// splits take more with wallet.bet; BaseGameScene.settle() pays the total.
//
// Debug (?debug=1): window.__CASINO__.force.blackjack(['AS','9D','KC','7H', ...])
// stacks the top of the shoe in deal order (player, dealer up, player, hole,
// then draws). Tests without ?debug can call scene.forceCards(list).
// =============================================================================

import { BaseGameScene } from '../BaseGameScene.js';
import { COLORS, DEPTH, FONT, GAME } from '../../core/Constants.js';
import { wallet } from '../../core/Casino.js';
import { text, fmt, fmtSigned, modalOpen } from '../../ui/theme.js';
import { playSfx } from '../../audio/sfx.js';
import { Shoe, Round, handValue, describeHand, isBlackjack, cardValue } from './logic.js';
import { basicStrategy, hintReason, upValue } from './strategy.js';
import { ensureCardTextures, CardSprite, BACK_KEY } from './cards.js';
import { Stake } from './stake.js';
import { CARD, LAYOUT as L, TIMING as T, RULE_LINES, RULE_PAYOUTS } from './config.js';

const ACTION_WORD = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' };
const RESULT_TAG = {
  win: { label: 'WIN', fill: 0x2f8f57 },
  lose: { label: 'LOSE', fill: 0xa8322a },
  push: { label: 'PUSH', fill: 0x6b604c },
  blackjack: { label: 'BLACKJACK', fill: 0xd9a227 },
};

export class BlackjackScene extends BaseGameScene {
  constructor() {
    super('Blackjack', {
      id: 'blackjack',
      booker: 'booker-dealer',
      bookerSlot: L.BOOKER,
      sobaSeat: L.SOBA,
      rules: { lines: RULE_LINES, payouts: RULE_PAYOUTS },
    });
    this.shoe = null;      // survives leaving and coming back (like a real table)
    this.agreed = 0;
    this.decisions = 0;
    this.hintsOn = false;
    this.lastBet = 0;
  }

  create() {
    super.create();
    ensureCardTextures(this);
    if (!this.shoe) this.shoe = new Shoe(this.rng);
    this.phase = 'betting';
    this.busy = false;
    this.round = null;
    this.forced = null;
    this.handViews = [];
    this.dealerCards = [];
    this.tableJunk = [];
    this.roundFollowed = true;
    this.roundDecisions = 0;
    this.alive = true;
    this.events.once('shutdown', () => { this.alive = false; });

    this.booker.bubbleSide = 'right';
    this.drawTable();
    this.buildControls();
    this.refreshInfo();
    this.setPhase('betting');

    // debug hook (?debug=1)
    const C = window.__CASINO__;
    if (C?.debug?.enabled) {
      C.force = Object.assign(C.force || {}, { blackjack: (cards) => this.forceCards(cards) });
    }
    this.time.delayedCall(450, () => this.say('booker', 'Welcome to my table! Chips on the circle.', 2400));
  }

  // --- table ------------------------------------------------------------------------------

  drawTable() {
    const g = this.add.graphics().setDepth(DEPTH.TABLE);
    // felt print: the betting circle
    const b = L.BET;
    g.lineStyle(3, COLORS.GOLD_LIGHT, 0.35);
    g.strokeCircle(b.x, b.y, b.r + 8);
    g.lineStyle(2, COLORS.GOLD_LIGHT, 0.25);
    g.strokeCircle(b.x, b.y, b.r + 14);
    const ft = text(this, 640, L.FELT_TEXT_Y, 'BLACKJACK PAYS 3 TO 2', { size: 22, display: true, color: COLORS.GOLD_LIGHT });
    ft.setAlpha(0.55).setDepth(DEPTH.TABLE);
    const ft2 = text(this, 640, L.FELT_TEXT_Y + 25, 'Booker stands on soft 17', { size: 20, color: COLORS.CREAM });
    ft2.setAlpha(0.42).setDepth(DEPTH.TABLE);

    // shoe
    const s = L.SHOE;
    const sg = this.add.graphics().setDepth(DEPTH.TABLE + 1);
    sg.fillStyle(0x000000, 0.35);
    sg.fillRoundedRect(s.x - 56, s.y - 62, 124, 132, 12);
    sg.fillStyle(0x3b2414, 1);
    sg.fillRoundedRect(s.x - 60, s.y - 68, 124, 132, 12);
    sg.fillStyle(0x5a3820, 1);
    sg.fillRoundedRect(s.x - 54, s.y - 62, 112, 120, 9);
    sg.lineStyle(3, COLORS.BRASS, 1);
    sg.strokeRoundedRect(s.x - 60, s.y - 68, 124, 132, 12);
    this.add.image(s.x - 6, s.y - 6, BACK_KEY).setScale(0.5 * 0.92).setDepth(DEPTH.TABLE + 2);
    const lip = this.add.graphics().setDepth(DEPTH.TABLE + 3);
    lip.fillStyle(COLORS.BRASS, 1);
    lip.fillRoundedRect(s.x - 64, s.y + 20, 132, 20, 6);
    lip.fillStyle(COLORS.GOLD_LIGHT, 0.5);
    lip.fillRect(s.x - 58, s.y + 22, 120, 4);
    text(this, s.x + 2, s.y + 30, 'SHOE', { size: 20, display: true, color: COLORS.INK }).setDepth(DEPTH.TABLE + 4);

    // shoe meter
    const si = L.SHOE_INFO;
    this.shoeBar = this.add.graphics().setDepth(DEPTH.TABLE + 1);
    this.shoeText = text(this, si.x, si.y + 46, '', { size: 20, color: COLORS.CREAM }).setDepth(DEPTH.TABLE + 1).setAlpha(0.85);

    // discard tray
    const d = L.DISCARD;
    const dg = this.add.graphics().setDepth(DEPTH.TABLE + 1);
    dg.fillStyle(0x000000, 0.3);
    dg.fillRoundedRect(d.x - 62, d.y - 72, 124, 144, 14);
    dg.lineStyle(3, COLORS.BRASS, 0.8);
    dg.strokeRoundedRect(d.x - 62, d.y - 72, 124, 144, 14);
    this.discardPile = this.add.container(d.x, d.y).setDepth(DEPTH.TABLE + 2);
    this.discardLabel = text(this, d.x, d.y + 92, 'DISCARDS', { size: 20, display: true, color: COLORS.GOLD_LIGHT }).setDepth(DEPTH.TABLE + 3).setAlpha(0.55);

    // Soba's book counter
    const bi = L.BOOK_INFO;
    this.bookText = text(this, bi.x, bi.y + 26, '', { size: 20, color: COLORS.CREAM }).setDepth(DEPTH.TABLE + 1).setAlpha(0.85);
    text(this, bi.x, bi.y, "SOBA'S BOOK", { size: 20, display: true, color: COLORS.GOLD_LIGHT }).setDepth(DEPTH.TABLE + 1).setAlpha(0.7);
    text(this, si.x, si.y - 2, 'CARDS LEFT', { size: 20, display: true, color: COLORS.GOLD_LIGHT }).setDepth(DEPTH.TABLE + 1).setAlpha(0.7);

    // main betting circle (the only BetSpot)
    this.addChipTray({ x: L.TRAY.x, y: L.TRAY.y, keys: true });
    this.spot = this.addBetSpot(b.x, b.y, {
      shape: 'circle', w: b.r * 2, h: b.r * 2, label: 'BET', color: COLORS.GOLD_LIGHT,
      stackY: 22, onChange: () => this.refreshBetButtons(),
    });
    this.spot.labelText?.setY(-40).setAlpha(0.8);

    this.activeGlow = this.add.graphics().setDepth(DEPTH.GAME - 2);
  }

  refreshInfo() {
    const si = L.SHOE_INFO;
    const shoe = this.shoe;
    const W = 150, H = 12;
    const x = si.x - W / 2, y = si.y + 38;
    const g = this.shoeBar;
    g.clear();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(x, y - 16, W, H, 6);
    const k = shoe.remaining / shoe.size;
    g.fillStyle(COLORS.CREAM, 0.9);
    g.fillRoundedRect(x, y - 16, Math.max(6, W * k), H, 6);
    // cut card at 25 % remaining
    g.fillStyle(COLORS.LOSE, 1);
    g.fillRect(x + W * (1 - shoe.penetration) - 2, y - 20, 4, H + 8);
    this.shoeText.setText(`${shoe.remaining} of ${shoe.size}`);
    this.bookText.setText(this.decisions ? `agreed ${this.agreed} of ${this.decisions}` : 'ask with ?');
    // discard pile thickness
    const onTable = this.handViews.reduce((n, h) => n + h.cards.length, 0) + this.dealerCards.length;
    const discards = Math.max(0, shoe.dealt - onTable);
    const layers = Math.min(14, Math.ceil(discards / 8));
    if (this.discardPile.length !== layers) {
      this.discardPile.removeAll(true);
      for (let i = 0; i < layers; i++) {
        const img = this.add.image(0, -i * 2.2, BACK_KEY).setScale(0.5 * 0.85).setAngle(((i * 37) % 7) - 3);
        this.discardPile.add(img);
      }
    }
  }

  // --- controls --------------------------------------------------------------------------

  buildControls() {
    const y = L.BTN_Y;
    this.betUi = this.add.container(0, 0).setDepth(DEPTH.UI);
    this.rebetBtn = this.addButton(806, y, { label: 'Rebet', hint: 'R', hotkey: 'R', style: 'secondary', w: 150, h: 60, onClick: () => this.rebet() });
    this.x2Btn = this.addButton(962, y, { label: 'Bet x2', hint: 'X', hotkey: 'X', style: 'secondary', w: 140, h: 60, onClick: () => this.doubleBet() });
    this.dealBtn = this.addButton(1152, y, { label: 'Deal', hint: 'Space', hotkey: ['SPACE', 'ENTER'], style: 'gold', w: 210, h: 64, onClick: () => this.deal() });
    this.betUi.add([this.rebetBtn, this.x2Btn, this.dealBtn]);

    this.playUi = this.add.container(0, 0).setDepth(DEPTH.UI);
    const mk = (x, label, key, action, style = 'primary') => this.addButton(x, y, {
      label, hint: key, hotkey: key, style, w: 150, h: 60, onClick: () => this.onAction(action),
    });
    this.hitBtn = mk(318, 'Hit', 'H', 'hit');
    this.standBtn = mk(480, 'Stand', 'S', 'stand', 'danger');
    this.doubleBtn = mk(642, 'Double', 'D', 'double', 'gold');
    this.splitBtn = mk(804, 'Split', 'P', 'split', 'secondary');
    this.hintBtn = this.addButton(1100, y, {
      label: 'Hint: Off', hint: '?', style: 'ghost', w: 200, h: 60, onClick: () => this.toggleHint(),
    });
    this.playUi.add([this.hitBtn, this.standBtn, this.doubleBtn, this.splitBtn, this.hintBtn]);
    this.actionBtns = { hit: this.hitBtn, stand: this.standBtn, double: this.doubleBtn, split: this.splitBtn };
    // '?' (Shift+/) toggles Soba's hints in every phase (the Hint button only shows while playing)
    const onHintKey = (e) => {
      if (e?.repeat || modalOpen(this) || !this.alive) return;
      this.toggleHint();
    };
    this.input.keyboard?.on('keydown-FORWARD_SLASH', onHintKey);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown-FORWARD_SLASH', onHintKey));
  }

  setPhase(p) {
    this.phase = p;
    if (p !== 'settle') this.roundSettled = false;
    const betting = p === 'betting';
    this.betUi.setVisible(betting);
    this.chipTray.setVisible(betting);
    this.playUi.setVisible(!betting);
    if (betting) this.chipTray.setEnabled(true);
    if (this.spot.hit.input) this.spot.hit.input.enabled = betting;
    this.refreshButtons();
  }

  refreshButtons() {
    const legal = this.legalNow();
    for (const [k, b] of Object.entries(this.actionBtns)) b.setEnabled(!!legal[k]);
    this.hintBtn.setLabel(this.hintsOn ? 'Hint: On' : 'Hint: Off');
    this.hintBtn.setStyle(this.hintsOn ? 'primary' : 'ghost');
    this.refreshBetButtons();
  }

  refreshBetButtons() {
    if (!this.rebetBtn) return;
    const amt = this.spot.amount;
    if (amt > 0) {
      this.rebetBtn.setLabel('Clear');
      this.rebetBtn.setEnabled(this.phase === 'betting' && !this.busy);
    } else {
      this.rebetBtn.setLabel(this.lastBet ? `Rebet ${fmt(this.lastBet)}` : 'Rebet');
      this.rebetBtn.setEnabled(this.phase === 'betting' && !this.busy && this.lastBet > 0);
    }
    const base = amt || this.lastBet;
    this.x2Btn.setEnabled(this.phase === 'betting' && !this.busy && base > 0);
    this.dealBtn.setEnabled(this.phase === 'betting' && !this.busy && (amt > 0 || this.lastBet > 0));
  }

  placeBet(n) {
    if (this.phase !== 'betting' || this.busy) return false;
    const why = this.spot.whyNot(n);
    if (why) { this.toast(why, 'warn'); return false; }
    return this.spot.bet(n);
  }

  rebet() {
    if (this.spot.amount > 0) { this.spot.refund(); return; }
    if (this.lastBet) this.placeBet(this.lastBet);
  }

  doubleBet() {
    if (this.spot.amount > 0) this.placeBet(this.spot.amount);
    else if (this.lastBet) this.placeBet(this.lastBet * 2);
  }

  toggleHint() {
    this.hintsOn = !this.hintsOn;
    playSfx('click');
    this.refreshButtons();
    if (this.hintsOn) {
      if (this.phase === 'player' && !this.busy) this.showHint();
      else this.say('soba', "Hints on! I'll call every play.", 1600);
    } else this.say('soba', 'Hints off. You got this!', 1200);
  }

  /** Stack the next cards of the shoe (deal order: p, d-up, p, hole, then draws). */
  forceCards(cards) {
    this.forced = [...cards];
    return true;
  }

  // --- round -----------------------------------------------------------------------------

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  legalNow() {
    if (!this.round || this.phase !== 'player' || this.busy) return { hit: false, stand: false, double: false, split: false };
    return this.round.legal();
  }

  currentHint() {
    if (!this.round || this.phase !== 'player' || this.busy) return null;
    const l = this.round.legal();
    if (!l.hit) return null;
    return basicStrategy(this.round.hand.cards, this.round.upcard, { canDouble: l.double, canSplit: l.split });
  }

  async deal() {
    if (this.phase !== 'betting' || this.busy) return;
    if (!this.spot.amount && this.lastBet) {
      if (!this.placeBet(this.lastBet)) return;
    }
    const bet = this.spot.amount;
    if (!bet) {
      this.toast('Place a bet first', 'warn');
      return;
    }
    this.busy = true;
    this.lastBet = bet;
    this.beginRound();
    this.setPhase('player');
    this.soba.bubble?.destroy();
    this.roundFollowed = true;
    this.roundDecisions = 0;

    if (this.shoe.needsShuffle()) await this.shuffleShoe();
    if (this.forced) { this.shoe.stack(this.forced); this.forced = null; }

    // the circle's chips become hand 0's stake
    this.spot.clear();
    this.handViews = [this.newHandView(0, bet)];
    this.layoutHands(false);
    const hv = this.handViews[0];
    hv.stake.setPosition(L.BET.x, L.BET.y + 22);
    this.tweens.add({ targets: hv.stake, x: hv.stakeX, y: hv.stakeY, duration: 320, ease: 'Cubic.easeOut' });

    this.round = new Round(this.shoe, bet, { canAfford: (n) => wallet.balance >= n });
    const ev = this.round.start();
    await this.playEvents(ev);
    if (!this.alive) return;
    this.busy = false;
    if (this.round.phase === 'player') this.enterDecision();
    else await this.finishRound();
  }

  enterDecision() {
    this.setPhase('player');
    const h = this.round.hand;
    const v = handValue(h.cards);
    const up = upValue(this.round.upcard);
    const scary = !v.soft && v.total >= 12 && v.total <= 16 && up >= 7;
    this.soba.setMood(scary ? 'nervous' : 'neutral');
    this.drawActive();
    if (this.hintsOn) this.showHint();
  }

  showHint() {
    const hint = this.currentHint();
    if (!hint) {
      if (this.phase === 'betting') this.say('soba', "I'll call the plays once the cards are out.", 2000);
      return;
    }
    const why = hintReason(this.round.hand.cards, this.round.upcard);
    this.soba.say(`Soba says: ${ACTION_WORD[hint]}!\n${why}`, 60000, { side: 'top', width: 176 });
    this.lastHint = hint;
  }

  async onAction(action) {
    if (this.phase !== 'player' || this.busy || !this.round) return;
    const legal = this.round.legal();
    if (!legal[action]) return;
    const i = this.round.active;
    const h = this.round.hand;
    const hint = this.currentHint();
    // extra stake for double / split
    if (action === 'double' || action === 'split') {
      if (!wallet.bet(this.id, h.bet)) {
        this.toast('Not enough chips', 'warn');
        return;
      }
    }
    this.decisions += 1;
    this.roundDecisions += 1;
    if (action === hint) this.agreed += 1;
    else this.roundFollowed = false;
    this.soba.bubble?.destroy();
    this.busy = true;
    this.refreshButtons();
    if (action === 'double') {
      this.say('soba', 'Double down!', 900);
      await this.handViews[i].stake.addChips(this.round.bet, this.balancePos);
    }
    const ev = this.round.act(action);
    await this.playEvents(ev);
    if (!this.alive) return;
    this.busy = false;
    this.refreshInfo();
    if (this.round.phase === 'player') this.enterDecision();
    else await this.finishRound();
  }

  // --- event playback --------------------------------------------------------------------

  async playEvents(events) {
    for (const e of events) {
      if (!this.alive) return;
      switch (e.type) {
        case 'card': await this.animCard(e); break;
        case 'peek': await this.animPeek(e); break;
        case 'reveal': await this.animReveal(); break;
        case 'split': await this.animSplit(); break;
        case 'active': this.drawActive(); break;
        case 'handDone': await this.onHandDone(e); break;
        case 'dealerTurn':
          this.activeGlow.clear();
          this.soba.setMood('neutral');
          await this.wait(240);
          break;
        default: break;
      }
    }
  }

  newHandView(i, bet) {
    const stake = new Stake(this, 0, 0, bet, { depth: DEPTH.GAME + 40 });
    const pill = this.makePill();
    return { i, cards: [], stake, pill, x: L.PLAYER.x, y: L.PLAYER.y, stakeX: 0, stakeY: 0, tag: null };
  }

  makePill() {
    const c = this.add.container(0, 0).setDepth(DEPTH.GAME + 50).setVisible(false);
    c.bg = this.add.graphics();
    c.label = text(this, 0, 0, '', { size: 24, color: COLORS.INK });
    c.add([c.bg, c.label]);
    return c;
  }

  setPill(pill, str, kind = 'normal') {
    pill.label.setText(str);
    const fill = kind === 'bust' ? COLORS.LOSE : kind === 'gold' ? COLORS.GOLD : kind === 'dim' ? 0x3a2a1c : COLORS.CREAM;
    const ink = kind === 'bust' || kind === 'dim' ? COLORS.CREAM : COLORS.INK;
    pill.label.setColor(`#${ink.toString(16).padStart(6, '0')}`);
    const w = Math.max(54, pill.label.width + 22);
    pill.bg.clear();
    pill.bg.fillStyle(0x000000, 0.35);
    pill.bg.fillRoundedRect(-w / 2 + 1, -15 + 3, w, 30, 15);
    pill.bg.fillStyle(fill, 1);
    pill.bg.fillRoundedRect(-w / 2, -15, w, 30, 15);
    pill.bg.lineStyle(2, kind === 'normal' ? COLORS.INK : COLORS.GOLD_LIGHT, 0.85);
    pill.bg.strokeRoundedRect(-w / 2, -15, w, 30, 15);
    pill.w = w;
    if (!pill.visible) {
      pill.setVisible(true).setScale(0.6);
      this.tweens.add({ targets: pill, scale: 1, duration: 180, ease: 'Back.easeOut' });
    }
  }

  /** Where card k of a hand sits. */
  slot(hv, k, n) {
    const span = (n - 1) * CARD.FAN;
    return { x: hv.x - span / 2 + k * CARD.FAN, y: hv.y - k * 2 };
  }

  dealerSlot(k, n) {
    const span = (n - 1) * (CARD.FAN + 18);
    return { x: L.DEALER.x - span / 2 + k * (CARD.FAN + 18), y: L.DEALER.y };
  }

  /** Recompute hand anchors (1 hand centred, 2 hands split) and slide everything there. */
  layoutHands(animate = true) {
    const n = this.handViews.length;
    this.handViews.forEach((hv, idx) => {
      hv.x = n === 1 ? L.PLAYER.x : L.SPLIT_X[idx];
      hv.y = L.PLAYER.y;
      const cnt = Math.max(2, hv.cards.length);
      const left = this.slot(hv, 0, cnt).x - CARD.W / 2;
      hv.stakeX = left - 44;
      hv.stakeY = hv.y + 44;
      hv.pillX = left - 44;
      hv.pillY = hv.y - 40;
      hv.cards.forEach((c, k) => {
        const p = this.slot(hv, k, hv.cards.length);
        const ang = c.sideways ? 90 : c.restAngle ?? 0;
        if (animate) c.moveTo(p.x, p.y, { angle: ang, ms: 220 });
        else c.setPosition(p.x, p.y);
        c.setDepth(DEPTH.GAME + k);
      });
      if (animate) {
        this.tweens.add({ targets: hv.stake, x: hv.stakeX, y: hv.stakeY, duration: 220, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: hv.pill, x: hv.pillX, y: hv.pillY, duration: 220, ease: 'Cubic.easeOut' });
      } else {
        hv.stake.setPosition(hv.stakeX, hv.stakeY);
        hv.pill.setPosition(hv.pillX, hv.pillY);
      }
    });
  }

  placeDealerPill() {
    const n = this.dealerCards.length;
    const left = this.dealerSlot(0, Math.max(2, n)).x - CARD.W / 2;
    if (!this.dealerPill) this.dealerPill = this.makePill();
    this.dealerPill.setPosition(left - 52, L.DEALER.y);
  }

  async animCard(e) {
    const s = L.SHOE;
    const hidden = e.to === 'dealer' && e.hidden;
    const c = new CardSprite(this, s.x - 40, s.y - 10, e.card, { faceUp: false, depth: DEPTH.GAME + 30 });
    c.setAngle(-30).setScale(0.9);
    playSfx('card');
    let target;
    let angle = (this.rng.next() - 0.5) * 4;
    c.restAngle = angle;
    if (e.to === 'dealer') {
      this.dealerCards.push(c);
      const n = this.dealerCards.length;
      // re-centre the dealer hand as it grows
      this.dealerCards.slice(0, -1).forEach((o, k) => {
        const p = this.dealerSlot(k, Math.max(2, n));
        o.moveTo(p.x, p.y, { angle: o.restAngle ?? 0, ms: 200 });
      });
      target = this.dealerSlot(n - 1, Math.max(2, n));
      c.setDepth(DEPTH.GAME + n);
      this.placeDealerPill();
    } else {
      const hv = this.handViews[e.hand];
      const doubled = this.round.hands[e.hand].doubled && this.round.hands[e.hand].cards.length === 3 && hv.cards.length === 2;
      c.sideways = doubled;
      hv.cards.push(c);
      this.layoutHands(true);
      target = this.slot(hv, hv.cards.length - 1, hv.cards.length);
      if (doubled) { angle = 90; target = { x: target.x + 10, y: target.y + 6 }; }
      c.setDepth(DEPTH.GAME + hv.cards.length);
    }
    await c.moveTo(target.x, target.y, { angle, ms: T.DEAL_MS });
    if (e.to === 'dealer' && e.hidden) {
      c.setDepth(DEPTH.GAME + 1);
    }
    if (!hidden) await c.flip(true, 90);
    this.updatePills();
    this.refreshInfo();
    // Booker's read of his upcard
    if (e.to === 'dealer' && this.dealerCards.length === 1) {
      const up = upValue(e.card);
      if (up >= 10) this.booker.react('smug', 1500);
    }
    await this.wait(T.DEAL_GAP);
  }

  async animPeek(e) {
    const hole = this.dealerCards[1];
    if (!hole) return;
    this.say('booker', 'Let me peek for blackjack...', 1100);
    await new Promise((resolve) => {
      this.tweens.add({ targets: hole, y: hole.y - 14, angle: -6, duration: 220, yoyo: true, hold: 260, ease: 'Quad.easeOut', onComplete: resolve });
    });
    if (!e.blackjack) {
      await this.wait(120);
    }
  }

  async animReveal() {
    const hole = this.dealerCards[1];
    if (!hole || hole.faceUp) return;
    hole.setDepth(DEPTH.GAME + 2);
    await hole.flip(true, T.FLIP_MS);
    this.updatePills();
    if (isBlackjack(this.round.dealer.cards)) {
      this.booker.react('happy', 1800);
      this.say('booker', 'Blackjack for the house!', 1600);
      this.cameras.main.shake(160, 0.003);
    }
    await this.wait(300);
  }

  async animSplit() {
    const hv0 = this.handViews[0];
    const moved = hv0.cards.pop();
    const hv1 = this.newHandView(1, this.round.hands[1].bet);
    hv1.cards.push(moved);
    this.handViews.push(hv1);
    hv1.stake.set(0);
    this.layoutHands(true);
    hv1.stake.setPosition(hv1.stakeX, hv1.stakeY);
    this.say('soba', 'Split them!', 900);
    await hv1.stake.addChips(this.round.hands[1].bet, this.balancePos);
    this.updatePills();
    await this.wait(160);
  }

  async onHandDone(e) {
    const hv = this.handViews[e.hand];
    this.updatePills();
    if (e.reason === 'bust') {
      playSfx('lose', { gain: 0.6 });
      this.booker.react('sad', 1500);
      this.soba.react('sad', 1300);
      hv.cards.forEach(c => this.tweens.add({ targets: c, alpha: 0.75, duration: 200 }));
      this.cameras.main.shake(120, 0.002);
      await this.wait(380);
    } else if (e.reason === 'blackjack') {
      this.booker.react('happy', 1800);
      this.soba.react('happy', 1800);
      this.say('booker', 'Blackjack! Nice paws.', 1600);
    } else if (e.reason === '21') {
      playSfx('coin', { gain: 0.6 });
      await this.wait(200);
    }
  }

  updatePills() {
    if (!this.round) return;
    const v = this.round.view();
    v.hands.forEach((h, i) => {
      const hv = this.handViews[i];
      if (!hv || !h.cards.length) return;
      // count only the cards already shown on the table
      const shown = this.round.hands[i].cards.slice(0, hv.cards.length);
      const label = describeHand(shown, this.round.hands[i].split);
      const val = handValue(shown);
      const kind = val.bust ? 'bust' : (val.total === 21 ? 'gold' : 'normal');
      this.setPill(hv.pill, label, kind);
      hv.pill.setPosition(hv.pillX, hv.pillY);
    });
    if (this.dealerCards.length) {
      const shownCards = this.round.dealer.cards.filter((c, k) => this.dealerCards[k] && this.dealerCards[k].faceUp);
      if (shownCards.length) {
        const label = describeHand(shownCards);
        const val = handValue(shownCards);
        this.placeDealerPill();
        this.setPill(this.dealerPill, label, val.bust ? 'bust' : (val.total === 21 ? 'gold' : 'dim'));
      }
    }
  }

  drawActive() {
    const g = this.activeGlow;
    g.clear();
    if (!this.round || this.phase !== 'player' || this.handViews.length < 2) {
      this.handViews.forEach(hv => hv.cards.forEach(c => c.setAlpha(c.alpha < 0.8 ? c.alpha : 1)));
      return;
    }
    this.handViews.forEach((hv, i) => {
      const on = i === this.round.active && !this.round.hands[i].done;
      const n = hv.cards.length;
      const a = this.slot(hv, 0, n);
      const b = this.slot(hv, n - 1, n);
      const x0 = a.x - CARD.W / 2 - 10, x1 = b.x + CARD.W / 2 + 10;
      const y0 = hv.y - CARD.H / 2 - 12, y1 = hv.y + CARD.H / 2 + 8;
      if (on) {
        g.fillStyle(COLORS.GOLD, 0.16);
        g.fillRoundedRect(x0, y0, x1 - x0, y1 - y0, 14);
        g.lineStyle(3, COLORS.GOLD, 0.95);
        g.strokeRoundedRect(x0, y0, x1 - x0, y1 - y0, 14);
        g.fillStyle(COLORS.GOLD, 1);
        g.fillTriangle((x0 + x1) / 2 - 10, y1 + 6, (x0 + x1) / 2 + 10, y1 + 6, (x0 + x1) / 2, y1 - 4);
      }
      if (!this.round.hands[i].done || this.round.hands[i].reason !== 'bust') {
        hv.cards.forEach(c => c.setAlpha(on || this.round.hands[i].done ? 1 : 0.8));
      }
    });
  }

  // --- settlement ---------------------------------------------------------------------------

  async finishRound() {
    if (!this.alive) return;
    this.setPhase('settle');
    this.activeGlow.clear();
    this.soba.setMood('neutral');
    const r = this.round;
    const wagered = r.wagered;
    const paid = r.paid;
    const results = r.hands.map(h => h.result);
    const anyBJ = results.includes('blackjack');
    const dealerBust = handValue(r.dealer.cards).bust;
    const allBust = r.hands.every(h => handValue(h.cards).bust);

    const res = this.settle(wagered, paid, { react: false, banner: anyBJ ? true : 'auto', bannerTitle: anyBJ ? 'BLACKJACK!' : null });
    this.roundSettled = true; // money is booked: the player may leave while the results linger

    // reactions
    if (anyBJ) {
      this.booker.react('happy', 2000);
      this.soba.react('happy', 2000);
      this.coinBurst(this.handViews[0]);
    } else if (dealerBust && !allBust) {
      this.booker.react('lose', 1800);
      this.say('booker', 'Ruff... I busted.', 1500);
    } else if (allBust) {
      this.booker.react('sad', 1600);
    } else if (res.outcome === 'lose') {
      this.booker.react('win', 1600);
    }
    if (res.outcome === 'win') {
      if (this.roundDecisions > 0 && this.roundFollowed) {
        this.soba.react('smug', 2200);
        this.time.delayedCall(250, () => this.say('soba', 'Told you. Right by the book!', 1800));
      } else if (!anyBJ) this.soba.react('happy', 1800);
      if (!anyBJ) playSfx('win', { gain: 0.8 });
    } else if (res.outcome === 'lose') {
      this.soba.react('sad', 1600);
      playSfx('lose', { gain: 0.6 });
    } else {
      this.soba.react('nervous', 1000);
      playSfx('push');
    }

    // tags + chips, hand by hand
    const anims = [];
    r.hands.forEach((h, i) => {
      const hv = this.handViews[i];
      this.showTag(hv, h);
      const d = 220 + i * 260;
      if (h.result === 'lose') anims.push(hv.stake.lose({ delay: d }));
      else if (h.result === 'push') anims.push(hv.stake.push({ delay: d }));
      else anims.push(hv.stake.win(h.payout, { delay: d }));
      if (h.payout > h.bet) this.floatText(hv.x, hv.y - 30, fmtSigned(h.payout - h.bet), { color: COLORS.GOLD_LIGHT, delay: d + 200, rise: 50 });
    });
    this.refreshInfo();
    await Promise.all(anims);
    await this.wait(T.RESULT_HOLD - 600);
    if (this.banner.active) await new Promise((resolve) => {
      const check = () => (!this.banner.active || !this.alive ? resolve() : this.time.delayedCall(100, check));
      check();
    });
    await this.clearTable();
    if (!this.alive) return;
    this.round = null;
    this.setPhase('betting');
    this.refreshInfo();
    if (this.shoe.needsShuffle()) this.say('booker', 'Cut card is out. Fresh shoe next hand!', 2000);
  }

  showTag(hv, h) {
    const t = RESULT_TAG[h.result];
    if (!t) return;
    const label = h.result === 'blackjack' ? 'BLACKJACK!' : t.label;
    const c = this.add.container(hv.x, hv.y + 34).setDepth(DEPTH.GAME + 60);
    const tx = text(this, 0, 0, label, { size: h.result === 'blackjack' ? 26 : 30, display: true, color: COLORS.CREAM, stroke: COLORS.INK, strokeW: 4 });
    const w = tx.width + 28;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(-w / 2 + 2, -24 + 4, w, 48, 12);
    g.fillStyle(t.fill, 1);
    g.fillRoundedRect(-w / 2, -24, w, 48, 12);
    g.lineStyle(3, COLORS.GOLD_LIGHT, 1);
    g.strokeRoundedRect(-w / 2, -24, w, 48, 12);
    c.add([g, tx]);
    c.setAngle(-7).setScale(1.8).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    hv.tag = c;
  }

  coinBurst(hv) {
    const em = this.add.particles(hv.x, hv.y, 'particle-coin', {
      speed: { min: 180, max: 420 }, angle: { min: 200, max: 340 }, gravityY: 700,
      lifespan: 1300, scale: { min: 0.9, max: 1.4 }, rotate: { min: 0, max: 360 }, emitting: false,
    }).setDepth(DEPTH.FLOAT);
    em.explode(36);
    this.time.delayedCall(1600, () => em.destroy());
  }

  async clearTable() {
    const d = L.DISCARD;
    const all = [...this.dealerCards, ...this.handViews.flatMap(hv => hv.cards)];
    const fades = [];
    this.handViews.forEach(hv => {
      for (const o of [hv.tag, hv.pill]) if (o) fades.push(o);
    });
    if (this.dealerPill) fades.push(this.dealerPill);
    this.tweens.add({ targets: fades, alpha: 0, duration: 180 });
    if (all.length) playSfx('card', { gain: 0.7 });
    await Promise.all(all.map((c, k) => c.moveTo(d.x, d.y, { angle: 90 + ((k * 13) % 9) - 4, ms: T.CLEAR_MS, delay: k * 45, ease: 'Cubic.easeIn', scale: 0.85 })));
    all.forEach(c => c.destroy());
    this.handViews.forEach(hv => { hv.stake.destroy(); hv.pill.destroy(); hv.tag?.destroy(); });
    this.dealerPill?.destroy();
    this.dealerPill = null;
    this.handViews = [];
    this.dealerCards = [];
    this.activeGlow.clear();
    this.refreshInfo();
  }

  async shuffleShoe() {
    this.say('booker', 'Fresh shoe! Shuffling up...', 1600);
    playSfx('shuffle');
    const cx = 640, cy = 440;
    const left = [], right = [];
    for (let i = 0; i < 8; i++) {
      const a = this.add.image(L.DISCARD.x, L.DISCARD.y, BACK_KEY).setScale(0.5).setDepth(DEPTH.GAME + 20 + i);
      const b = this.add.image(L.SHOE.x, L.SHOE.y, BACK_KEY).setScale(0.5).setDepth(DEPTH.GAME + 20 + i);
      left.push(a); right.push(b);
    }
    this.discardPile.removeAll(true);
    const go = (objs, x, y, extra = {}) => new Promise((resolve) => this.tweens.add({
      targets: objs, x, y: (t, k, v, idx) => y - idx * 2, duration: 300, delay: this.tweens.stagger(25), ease: 'Cubic.easeOut', ...extra, onComplete: resolve,
    }));
    await Promise.all([go(left, cx - 70, cy, { angle: -8 }), go(right, cx + 70, cy, { angle: 8 })]);
    // riffle: interleave into the middle twice
    for (let pass = 0; pass < 2; pass++) {
      playSfx('shuffle', { gain: 0.8 });
      await Promise.all([go(left, cx - 4, cy, { angle: 0, duration: 260 }), go(right, cx + 4, cy, { angle: 0, duration: 260 })]);
      if (pass === 0) await Promise.all([go(left, cx - 70, cy, { angle: -8, duration: 200 }), go(right, cx + 70, cy, { angle: 8, duration: 200 })]);
    }
    await Promise.all([go([...left, ...right], L.SHOE.x - 6, L.SHOE.y - 6, { duration: 320, ease: 'Cubic.easeIn' })]);
    [...left, ...right].forEach(o => o.destroy());
    this.shoe.shuffle();
    this.refreshInfo();
    await this.wait(150);
  }

  /** Soba talks from above its seat (the right side is the player's hand). */
  say(who, str, ms) {
    if (who === 'booker') return this.booker?.say(str, ms);
    return this.soba?.say(str, ms, { side: 'top', width: 176 });
  }

  // --- leaving / state -----------------------------------------------------------------------

  canLeave() {
    if (this.phase === 'settle' && this.roundSettled) return true;
    return this.phase === 'betting' && !this.busy && !this.roundActive;
  }

  leaveRefusal() {
    return 'Finish the hand first';
  }

  snapshot() {
    const base = super.snapshot();
    const v = this.round ? this.round.view() : null;
    const phase = this.phase === 'settle' ? 'settle' : this.phase === 'betting' ? 'betting'
      : (this.round && this.round.phase === 'dealer') ? 'dealer' : 'player';
    return {
      ...base,
      phase,
      busy: this.busy,
      bet: this.round ? this.round.bet : this.spot.amount,
      lastBet: this.lastBet,
      hands: v ? v.hands.map(h => ({ cards: h.cards, total: h.total, soft: h.soft, bet: h.bet, doubled: h.doubled, done: h.done, result: h.result, payout: h.payout })) : [],
      activeHand: v ? v.active : 0,
      dealer: v ? { cards: v.dealer.cards, total: v.dealer.total } : { cards: [], total: 0 },
      wagered: this.round ? this.round.wagered : 0,
      shoeRemaining: this.shoe.remaining,
      shuffles: this.shoe.shuffles,
      hint: this.currentHint(),
      hintsOn: this.hintsOn,
      hintBubble: this.soba.bubble?.active ? this.soba.lastSaid : null,
      agreed: { agreed: this.agreed, decisions: this.decisions },
      legal: this.legalNow(),
    };
  }
}
