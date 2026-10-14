// =============================================================================
// CrapsScene — Soba shoots, Booker is the stickman.
//
// Bets: Pass, Don't Pass (bar 12), Pass Odds (true odds, up to 3x), Field,
// Any 7, Any Craps, Yo 11. Rules live in ./logic.js (pure, node-tested).
//
// Money / stats convention: chips leave the balance when placed (BetSpot ->
// wallet.bet). Every roll that resolves at least one bet settles EXACTLY those
// bets: settle(wagered = stakes resolved on this roll, paid = their total
// returns). Bets that don't resolve (a Pass bet while the point is on) stay in
// play for the next roll. So one wallet "round" = one roll that decided something.
//
// The roll outcome comes from this.rng (or the debug queue) BEFORE the dice
// animation; the dice land on it.
//
// Debug (?debug=1): window.__CASINO__.force.craps([[a, b], ...]) queues rolls.
// Tests can also call scene.queueRolls([[a, b], ...]) directly.
// =============================================================================

import { BaseGameScene } from '../BaseGameScene.js';
import { BetSpot } from '../../ui/BetSpot.js';
import { COLORS, DEPTH } from '../../core/Constants.js';
import { wallet } from '../../core/Casino.js';
import { fmt } from '../../ui/theme.js';
import { playSfx } from '../../audio/sfx.js';
import {
  BET_KEYS, LINE_BETS, PROP_BETS, freshState, resolveRoll, rollDice, whyNotPlace, canRemove,
  normalizeOdds, oddsUnit, maxOdds, ODDS_RATIO, callFor, stickCall, phaseLine,
} from './logic.js';
import { L } from './config.js';
import { makeDiceTextures, DiceRig } from './dice.js';
import { CrapsTable } from './table.js';

const RULES = {
  lines: [
    'Soba throws two dice. Place chips, then press Roll (Space).',
    'Come-out roll: 7 or 11 wins the Pass Line; 2, 3 or 12 loses. Any other total becomes the POINT (puck ON).',
    'Point on: roll the point again before a 7 and Pass wins. A 7 first is a "seven out".',
    "Don't Pass is the opposite (12 on the come-out pushes). Line bets go down on the come-out only.",
    'Odds: back your Pass bet with up to 3x once a point is set. True odds, no house edge. Take them down any time between rolls.',
    'Field, Any 7, Any Craps and Yo 11 are one-roll bets. Right-click a bet to take a chip back. R = rebet, C = clear, 1-5 pick a chip.',
  ],
  payouts: [
    ['Pass / Don\'t Pass', '1:1'],
    ['Odds on 4 or 10', '2:1'],
    ['Odds on 5 or 9', '3:2 (bet in 2s)'],
    ['Odds on 6 or 8', '6:5 (bet in 5s)'],
    ['Field 3 4 9 10 11', '1:1'],
    ['Field 2 or 12', '2:1'],
    ['Any 7', '4:1'],
    ['Any Craps (2, 3, 12)', '7:1'],
    ['Yo 11', '15:1'],
  ],
};

const wait = (scene, ms) => new Promise((r) => scene.time.delayedCall(ms, r));

export class CrapsScene extends BaseGameScene {
  constructor() {
    super('Craps', { id: 'craps', booker: 'booker-stick', rules: RULES });
  }

  init() {
    super.init();
    this.state = freshState();
    this.rolling = false;
    this.dice = null;
    this.lastTotal = null;
    this.lastRolls = [];
    this.queue = this.queue || [];
    this.session = (this.session || 0) + 1;
    this.toldOdds = false;
  }

  create() {
    super.create();
    makeDiceTextures(this);
    // Soba talks from above its seat into the empty left margin (a right-side
    // bubble covered the PASS LINE label)
    this.soba.bubbleSide = 'top';
    this.soba.bubbleWidth = 184;
    this.table = new CrapsTable(this);
    this.table.setPhaseLine(phaseLine(this.state));
    this.table.setPoint(null, false);

    this.tray = this.addChipTray({ x: L.tray.x, y: L.tray.y, keys: true });

    // Bet spots: invisible hit areas over the drawn layout (shape 'none'), stacks at the right end.
    this.spots = {};
    const mk = (key, o = {}) => {
      const r = this.table.spotRect(key);
      const spot = this.addBetSpot(r.x, r.y, {
        id: key, label: undefined, shape: 'none', w: r.w, h: r.h,
        stackX: r.w / 2 - 86, stackY: r.h / 2 - 18, pillSide: 'right',
        onChange: () => this.refreshUi(), ...o,
      });
      spot.o.label = key; // snapshot name (not drawn: the label option is only read at construction)
      // Legality gate in front of BetSpot's own checks (balance, table limit)
      spot.add_ = (n) => this.placeOn(key, n);
      spot.undo = () => this.takeBack(key);
      this.spots[key] = spot;
      return spot;
    };
    mk('pass', { stackY: 22 });
    mk('dontPass', { stackY: 8 });
    mk('field', { stackY: 14 });
    mk('odds', { stackX: L.odds.w / 2 - 34, stackY: 30, pillSide: 'above', maxBet: () => maxOdds(this.spots.pass?.amount || 0) });
    for (const p of L.propBoxes) mk(p.key, { stackX: L.props.w / 2 - 72, stackY: p.h / 2 - 14 });

    this.dicePair = new DiceRig(this, { depth: DEPTH.GAME + 150 });
    this.dust = this.add.particles(0, 0, 'particle-spark', {
      speed: { min: 50, max: 150 }, angle: { min: 200, max: 340 }, lifespan: 380,
      scale: { start: 0.55, end: 0 }, alpha: { start: 0.8, end: 0 }, gravityY: 300, emitting: false,
    }).setDepth(DEPTH.GAME + 160);

    // Controls
    this.clearBtn = this.addButton(L.clearBtn.x, L.clearBtn.y, {
      label: 'Clear', hint: 'C', hotkey: 'C', style: 'secondary', w: L.clearBtn.w, onClick: () => this.clearBets(),
    });
    this.rebetBtn = this.addButton(L.rebetBtn.x, L.rebetBtn.y, {
      label: 'Rebet', hint: 'R', hotkey: 'R', style: 'secondary', w: L.rebetBtn.w, onClick: () => this.rebet(),
    });
    this.rollBtn = this.addButton(L.rollBtn.x, L.rollBtn.y, {
      label: 'Roll', hint: 'Space', hotkey: 'SPACE', style: 'gold', w: L.rollBtn.w, h: 64, onClick: () => this.roll(),
    });

    // Debug hook (only with ?debug=1)
    const C = window.__CASINO__;
    if (C?.debug?.enabled) {
      C.force = Object.assign(C.force || {}, { craps: (rolls) => this.queueRolls(rolls) });
    }

    this.refreshUi();
    this.time.delayedCall(450, () => {
      if (this.session && this.scene.isActive()) this.say('booker', 'New shooter coming out! Bet the Pass Line.', 2400);
    });
  }

  // --- debug / test ------------------------------------------------------------------------

  /** Queue fixed rolls ([[a, b], ...]); the next rolls use them before the RNG. */
  queueRolls(rolls) {
    for (const d of rolls) {
      if (!Array.isArray(d) || d.length !== 2 || !d.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) {
        throw new Error(`craps: bad forced roll ${JSON.stringify(d)}`);
      }
      this.queue.push([d[0], d[1]]);
    }
    return this.queue.length;
  }

  // --- bets ------------------------------------------------------------------------------------

  bets() {
    const b = {};
    for (const k of BET_KEYS) b[k] = this.spots?.[k]?.amount || 0;
    return b;
  }

  /** Click / tap on a bet (n = chip value by default). */
  placeOn(key, n) {
    const spot = this.spots[key];
    if (this.rolling) { this.toast('Dice are rolling', 'warn'); return false; }
    const chip = n ?? this.tray.value ?? 0;
    if (key === 'odds') return this.placeOdds(chip);
    const why = whyNotPlace(this.state, this.bets(), key, chip);
    if (why) {
      this.toast(why, 'warn');
      playSfx('error', { gain: 0.4 });
      return false;
    }
    return BetSpot.prototype.add_.call(spot, chip);
  }

  /** Odds: rounded to whole-chip multiples and capped at 3x the Pass bet. */
  placeOdds(chip) {
    const spot = this.spots.odds;
    const pass = this.spots.pass.amount;
    const why = this.state.phase !== 'point' ? 'Odds open once a point is set' : !pass ? 'Odds back a Pass Line bet' : null;
    if (why) { this.toast(why, 'warn'); playSfx('error', { gain: 0.4 }); return false; }
    const p = this.state.point;
    const cur = spot.amount;
    const n = normalizeOdds(p, cur + chip, pass);
    const delta = n.amount - cur;
    const max = maxOdds(pass);
    if (delta <= 0) {
      this.toast(`Max odds is 3x your pass bet (${fmt(Math.floor(max / oddsUnit(p)) * oddsUnit(p))})`, 'warn');
      playSfx('error', { gain: 0.4 });
      return false;
    }
    if (delta > wallet.balance) { this.toast('Not enough chips', 'warn'); return false; }
    const ok = BetSpot.prototype.add_.call(spot, delta);
    if (ok && (n.rounded || n.capped || delta !== chip)) {
      const r = ODDS_RATIO[p];
      const unit = oddsUnit(p);
      const why2 = n.capped || n.rounded === 'down' ? `max is 3x your pass bet` : `odds on ${p} go in ${unit}s so ${r[0]}:${r[1]} pays whole chips`;
      this.toast(`Odds ${fmt(n.amount)}: ${why2}`);
    }
    return ok;
  }

  /** Right-click: take the last chip back, if this bet can come down. */
  takeBack(key) {
    const spot = this.spots[key];
    if (this.rolling || !spot.amount) return 0;
    if (!canRemove(this.state, key)) {
      this.toast(key === 'pass' ? 'Your pass line bet is working' : 'Line bets stay up until they resolve', 'warn');
      return 0;
    }
    if (key === 'pass' && this.spots.odds.amount) return 0;
    return BetSpot.prototype.undo.call(spot);
  }

  clearBets() {
    if (this.rolling) return;
    let n = 0;
    for (const k of BET_KEYS) {
      const s = this.spots[k];
      if (s.amount && canRemove(this.state, k)) n += s.refund();
    }
    if (!n) {
      const working = this.spots.pass.amount || this.spots.dontPass.amount;
      this.toast(working ? 'Line bets stay up until the point resolves' : 'No bets to clear', 'info');
    }
    this.refreshUi();
  }

  rebetKeys() {
    return [...LINE_BETS, ...PROP_BETS].filter((k) => {
      const s = this.spots[k];
      return !s.amount && s.lastAmount > 0 && !whyNotPlace(this.state, this.bets(), k, s.lastAmount);
    });
  }

  rebet() {
    if (this.rolling) return;
    const keys = this.rebetKeys();
    if (!keys.length) { this.toast('Nothing to rebet', 'info'); return; }
    for (const k of keys) {
      const s = this.spots[k];
      if (!BetSpot.prototype.add_.call(s, s.lastAmount)) break;
    }
    this.refreshUi();
  }

  passWorking() {
    return this.state.phase === 'point' && this.spots?.pass?.amount > 0;
  }

  // --- UI state ---------------------------------------------------------------------------------

  refreshUi() {
    if (!this.spots || !this.rollBtn) return;
    const b = this.bets();
    const any = BET_KEYS.some(k => b[k] > 0);
    this.rollBtn.setEnabled(any && !this.rolling);
    const removable = BET_KEYS.some(k => b[k] > 0 && canRemove(this.state, k));
    this.clearBtn.setEnabled(removable && !this.rolling);
    this.rebetBtn.setEnabled(!this.rolling && this.rebetKeys().length > 0);
    const oddsOpen = this.state.phase === 'point' && b.pass > 0;
    this.table.setOdds({ open: oddsOpen, point: this.state.point, max: oddsOpen ? normalizeOdds(this.state.point, 1e9, b.pass).amount : 0 });
  }

  // --- the roll ---------------------------------------------------------------------------------

  async roll() {
    if (this.rolling) return;
    const before = this.bets();
    if (!BET_KEYS.some(k => before[k] > 0)) {
      this.toast('Place a bet first');
      return;
    }
    const token = this.session;
    const alive = () => token === this.session && this.scene.isActive();
    this.rolling = true;
    this.roundActive = true;
    for (const s of this.betSpots) s.setLocked(true);
    this.refreshUi();

    // Outcome first (debug queue, else the game's RNG stream), then the show.
    const dice = this.queue.length ? this.queue.shift() : rollDice(this.rng);
    const stateBefore = { ...this.state };
    const res = resolveRoll(stateBefore, before, dice);

    // Soba winds up and throws
    this.soba.react('smug', 1200);
    this.tweens.add({ targets: this.soba, x: this.soba.x + 16, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    await this.dicePair.fetch();
    if (!alive()) return;
    await this.dicePair.throw(dice, {
      onWall: (x, y) => {
        this.cameras.main.shake(140, 0.004);
        this.dust.explode(10, x, y + 10);
      },
    });
    if (!alive()) return;
    this.dice = [...dice];
    this.lastTotal = res.total;

    // The call
    const t = res.total;
    const ev = res.event;
    const color = ev === 'seven-out' || (t === 7 && ev !== 'natural') ? COLORS.LOSE
      : ev === 'point-made' || ev === 'natural' ? COLORS.WIN
        : ev === 'craps' || ev === 'bar12' ? COLORS.WARN : COLORS.GOLD;
    this.table.call(callFor(stateBefore, t, ev), color);
    this.say('booker', stickCall(stateBefore, t, ev), 2200);
    const kind = t === 7 ? 'seven' : (ev === 'point-set' || ev === 'point-made') ? 'point' : t === 11 ? 'yo' : [2, 3, 12].includes(t) ? 'craps' : '';
    this.table.pushHistory(t, kind);
    this.lastRolls = this.table.history.map(h => h.total);

    // Money: settle exactly the bets this roll decided
    const visuals = [];
    if (res.resolved.length) {
      const r = this.settle(res.wagered, res.paid, { keepRound: true, banner: false });
      let delay = 0;
      for (const x of res.resolved) {
        const spot = this.spots[x.bet];
        const pos = { x: spot.x + spot.stack.x, y: spot.y + spot.stack.y - 30 };
        if (x.outcome === 'win') {
          visuals.push(spot.win(x.paid, { delay }));
          this.floatText(pos.x - 10, pos.y, `+${fmt(x.paid - x.stake)}`, { color: COLORS.WIN, size: 30, delay: delay + 200 });
        } else if (x.outcome === 'push') {
          visuals.push(spot.push({ delay }));
          this.floatText(pos.x - 10, pos.y, 'PUSH', { color: COLORS.PUSH, size: 24, delay });
        } else {
          visuals.push(spot.lose({ delay: delay + 250 }));
        }
        delay += 90;
      }
      const yo = res.resolved.some(x => x.outcome === 'win' && x.paid >= x.stake * 10);
      if (yo || r.big) {
        this.banner.show({ amount: res.paid, wagered: res.wagered, tier: r.mega ? 'mega' : 'big' });
      }
    } else if (ev === 'point-set') {
      this.booker?.react('happy', 1200);
    }

    // State: puck and phase line
    this.state = res.next;
    if (ev === 'point-set') this.table.setPoint(res.next.point);
    else if (ev === 'point-made' || ev === 'seven-out') this.table.setPoint(null);
    this.table.setPhaseLine(phaseLine(this.state));

    await Promise.all(visuals);
    if (!alive()) return;
    if (visuals.length) await wait(this, 120);
    if (!alive()) return;

    this.rolling = false;
    this.roundActive = false;
    for (const s of this.betSpots) if (s.active) s.setLocked(false);
    this.refreshUi();

    // Teach odds once, when the point is first set with a Pass bet up
    if (ev === 'point-set' && this.spots.pass.amount && !this.toldOdds) {
      this.toldOdds = true;
      this.say('soba', `Point ${t}! Back the Pass Line with odds. They pay true odds.`, 2600);
    }
    // The stick brings the dice back
    this.time.delayedCall(900, () => {
      if (alive() && !this.rolling) this.dicePair.home();
    });
  }

  // --- leaving ---------------------------------------------------------------------------------

  canLeave() {
    return !this.rolling && !this.passWorking();
  }

  leaveRefusal() {
    if (!this.rolling && this.passWorking()) return 'Your pass line bet is working. Roll until it wins or sevens out.';
    return 'Wait for the dice';
  }

  onLeave() {
    // Props, odds and come-out line bets come back (Don't Pass with a point on too: it's taken down).
    for (const s of this.betSpots) {
      if (s.active && s.amount) {
        s.setLocked(false);
        s.refund();
      }
    }
  }

  snapshot() {
    return {
      ...super.snapshot(),
      phase: this.state.phase,
      point: this.state.point,
      dice: this.dice ? [...this.dice] : null,
      total: this.lastTotal,
      bets: this.bets(),
      lastRolls: [...this.lastRolls],
      rolling: this.rolling,
      queued: this.queue.length,
      puck: this.table?.point ? 'on' : 'off',
      phaseLine: this.table?.phaseText?.text ?? null,
    };
  }
}

