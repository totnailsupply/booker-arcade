// =============================================================================
// BaseGameScene — the shared shell every casino game scene extends.
//
// HOW TO SUBCLASS
//
//   import { BaseGameScene } from '../BaseGameScene.js';
//   import { COLORS } from '../../core/Constants.js';
//   import { playSfx } from '../../audio/sfx.js';
//
//   export class RouletteScene extends BaseGameScene {
//     constructor() {
//       super('Roulette', {
//         id: 'roulette',                      // wallet/stats id (also bg-<id>, music track)
//         title: 'Roulette',
//         booker: 'booker-croupier',           // CharacterPortrait who (null = no Booker)
//         bookerSlot: { x: 1180, y: 190, size: 170 },  // optional (default LAYOUT.BOOKER_SLOT)
//         sobaSeat:   { x: 100, y: 610, size: 160 },   // optional (default LAYOUT.SOBA_SEAT)
//         rules: { lines: ['...'], payouts: [['Straight', '35:1']] },
//       });
//     }
//     create() {
//       super.create();                        // FIRST: bg, top bar, portraits, music, fade-in
//       this.tray = this.addChipTray();        // bottom strip, left of centre
//       this.red = this.addBetSpot(x, y, { label: 'RED', payout: '1:1', w: 120, h: 70 });
//       this.spinBtn = this.addButton(1100, 660, { label: 'Spin', hint: 'Space', hotkey: 'SPACE', style: 'gold', onClick: () => this.spin() });
//     }
//     async spin() {
//       const wagered = this.totalBet();       // sum of registered BetSpots
//       if (!wagered) return this.toast('Place a bet first');
//       this.beginRound();                     // locks spots, blocks leaving
//       ... animate, compute paid (TOTAL return incl. stakes) ...
//       this.settle(wagered, paid);            // wallet.pay + settleRound + reactions + banner
//       // then animate spots: winners spot.win(paidForSpot), losers spot.lose()
//     }
//     snapshot() { return { ...super.snapshot(), phase: this.phase }; }
//   }
//
// WHAT create() SETS UP (all in game px, 1280x720)
//   this.bg          image 'bg-<id>' full screen (+ soft vignette)
//   this.topBar      TopBar (Lobby/Esc, title, balance, VIP, rules '?', mute) y 0..64
//   this.soba        CharacterPortrait 'soba' at sobaSeat   (default centre 100,610 size 160)
//   this.booker      CharacterPortrait at bookerSlot          (default centre 1180,190 size 170)
//   this.banner      WinBanner
//   this.playArea    LAYOUT.PLAY      { x: 200, y: 76, w: 880, h: 520 }  safe game area
//   this.controls    LAYOUT.CONTROLS  { x: 200, y: 604, w: 1070, h: 108 } bottom strip
//   this.bookerPos / this.balancePos   {x,y} targets for chip animations
//   this.wallet, this.rng (rng.stream(id): deterministic with ?seed=N), this.id
//   music: MUSIC_PLAY { track: id }
//
// OVERRIDE
//   canLeave()   default: !this.roundActive. Return false to block Lobby/Esc
//                (shows the toast from leaveRefusal()).
//   leaveRefusal()  the toast text when canLeave() is false
//                (default "Finish the round first").
//   onLeave()    default: refunds every registered BetSpot (un-played chips).
//   snapshot()   extend with your state for render_game_to_text().
//
// HELPERS
//   beginRound() / endRound()        roundActive flag (+ locks/unlocks registered spots)
//   settle(wagered, paid, opts)      pays `paid` (total return) via wallet.pay, books the round,
//                                    Soba/Booker react, WinBanner if worth it. Returns the wallet
//                                    result { outcome, net, x, big, mega, ... }. opts:
//                                      banner: 'auto' (>= 3x or big) | true | false
//                                      react: true | false
//                                      alreadyPaid: true if you called wallet.pay yourself
//                                      keepRound: true to leave roundActive on (multi-ball games)
//                                      bannerTitle: custom WinBanner title ('BLACKJACK!')
//   addChipTray(opts) / addBetSpot(x, y, opts) / addButton(x, y, opts)
//   betSpots, totalBet(), clearSpots()
//   toast(text, kind), floatText(x, y, text, opts), say(who, text, ms)  (who: 'soba' | 'booker')
//   leaveToLobby()
// =============================================================================

import Phaser from 'phaser';
import { COLORS, DEPTH, GAME, LAYOUT, gameById } from '../core/Constants.js';
import { eventBus, Events, listen } from '../core/EventBus.js';
import { wallet, rng } from '../core/Casino.js';
import { goto, fadeIn } from '../core/Nav.js';
import { TopBar } from '../ui/TopBar.js';
import { CharacterPortrait } from '../ui/CharacterPortrait.js';
import { WinBanner } from '../ui/WinBanner.js';
import { ChipTray } from '../ui/ChipTray.js';
import { BetSpot } from '../ui/BetSpot.js';
import { Button } from '../ui/Button.js';
import { toast, floatText } from '../ui/FloatText.js';
import { fmt } from '../ui/theme.js';
import { playSfx } from '../audio/sfx.js';

export class BaseGameScene extends Phaser.Scene {
  /**
   * @param {string} key  Phaser scene key ('Plinko', 'Blackjack', 'Craps', 'Roulette', 'Slots')
   * @param {object} cfg  { id, title, booker, bookerSlot, sobaSeat, rules, accent, music }
   */
  constructor(key, cfg = {}) {
    super(key);
    const g = gameById(cfg.id || key) || {};
    this.cfg = {
      id: g.id || String(key).toLowerCase(),
      title: g.name || key,
      accent: g.accent ?? COLORS.BRASS,
      music: g.music || 'lobby',
      booker: 'booker-dealer',
      bookerSlot: LAYOUT.BOOKER_SLOT,
      sobaSeat: LAYOUT.SOBA_SEAT,
      rules: null,
      ...cfg,
    };
    this.id = this.cfg.id;
  }

  init() {
    this.__leaving = false;
    this.__modals = 0;
    this.roundActive = false;
    this.betSpots = [];
    this.rounds = 0;
    this.lastResult = null;
  }

  create() {
    const c = this.cfg;
    this.input.enabled = true;
    this.wallet = wallet;
    this.rng = rng.stream(this.id);
    this.playArea = { ...LAYOUT.PLAY };
    this.controls = { ...LAYOUT.CONTROLS };

    const bgKey = this.textures.exists(`bg-${this.id}`) ? `bg-${this.id}` : 'bg-lobby';
    this.bg = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, bgKey).setDepth(DEPTH.BG);
    this.bg.setDisplaySize(GAME.WIDTH, GAME.HEIGHT);
    this.vignette = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'ui-vignette')
      .setDisplaySize(GAME.WIDTH, GAME.HEIGHT).setDepth(DEPTH.BG + 1).setAlpha(0.7);

    this.topBar = new TopBar(this, {
      title: c.title, accent: c.accent, onLobby: () => this.leaveToLobby(),
      rules: c.rules ? { title: c.title, ...c.rules } : null,
    });
    this.balancePos = this.topBar.balancePos;

    const ss = c.sobaSeat;
    this.soba = new CharacterPortrait(this, ss.x, ss.y, { who: 'soba', size: ss.size ?? 160, depth: DEPTH.CHARACTERS });
    if (c.booker) {
      const bs = c.bookerSlot;
      this.booker = new CharacterPortrait(this, bs.x, bs.y, { who: c.booker, size: bs.size ?? 170, depth: DEPTH.CHARACTERS });
      this.bookerPos = { x: bs.x, y: bs.y };
    } else {
      this.booker = null;
      this.bookerPos = { x: GAME.WIDTH / 2, y: 40 };
    }
    this.banner = new WinBanner(this);

    // VIP level-ups and TOAST events show here while a game is open
    listen(this, Events.VIP_UP, (d) => {
      this.toast(`VIP ${d.name}! +${fmt(d.gift)} chips, max bet ${fmt(d.maxBet)}`);
      this.soba?.react('happy', 1800);
      this.booker?.react('happy', 1800);
    });
    listen(this, Events.TOAST, (d) => this.toast(d.text, d.kind || 'info'));

    eventBus.emit(Events.MUSIC_PLAY, { track: c.music });
    eventBus.emit(Events.GAME_ENTER, { game: this.id });
    this.events.once('shutdown', () => {
      // Safety net: chips still marked in play when the scene closes (forced
      // jump, or a game that forgot to settle) go back to the player, the same
      // as a reload would do. A warning tells the game author.
      const left = wallet.inPlay(this.id);
      if (left > 0) {
        console.warn(`[${this.id}] ${left} chips still in play at shutdown; refunded`);
        wallet.refund(this.id, left);
      }
      eventBus.emit(Events.GAME_LEAVE, { game: this.id });
      this.betSpots = [];
    });
    fadeIn(this);
  }

  // --- leaving -------------------------------------------------------------------------

  canLeave() {
    return !this.roundActive;
  }

  /** Toast shown when canLeave() refuses. Override for game-specific wording. */
  leaveRefusal() {
    return 'Finish the round first';
  }

  onLeave() {
    for (const s of this.betSpots) if (s.active && s.amount && !s.locked) s.refund();
  }

  leaveToLobby() {
    if (this.__leaving) return false;
    if (this.banner?.active) this.banner.hide(true);
    if (!this.canLeave()) {
      this.toast(this.leaveRefusal() || 'Finish the round first', 'warn');
      this.soba?.react('nervous', 900);
      return false;
    }
    this.onLeave();
    return goto(this, 'Lobby');
  }

  // --- rounds ----------------------------------------------------------------------------

  beginRound() {
    this.roundActive = true;
    for (const s of this.betSpots) s.setLocked(true);
  }

  endRound() {
    this.roundActive = false;
    for (const s of this.betSpots) if (s.active) s.setLocked(false);
  }

  /**
   * Pay and book a finished round, then react. `paid` is the TOTAL return
   * (stakes included): a lost 10 = 0, a push = 10, an even-money win = 20.
   */
  settle(wagered, paid, opts = {}) {
    const { banner = 'auto', react = true, alreadyPaid = false, keepRound = false, bannerTitle = null } = opts;
    if (paid > 0 && !alreadyPaid) wallet.pay(this.id, paid);
    const r = wallet.settleRound(this.id, { wagered, paid });
    this.rounds += 1;
    this.lastResult = r;
    if (!keepRound) this.endRound();
    if (react) {
      if (r.outcome === 'win') {
        this.soba?.react('win');
        this.booker?.react('lose');
        if (!(banner === true || (banner === 'auto' && (r.x >= 3 || r.big)))) playSfx('win', { gain: 0.8 });
      } else if (r.outcome === 'lose') {
        this.soba?.react('lose');
        this.booker?.react('win');
        playSfx('lose', { gain: 0.7 });
      } else {
        this.soba?.react('nervous', 900);
        playSfx('push');
      }
    }
    if (r.outcome === 'win' && (banner === true || (banner === 'auto' && (r.x >= 3 || r.big)))) {
      this.banner.show({ amount: paid, wagered, title: bannerTitle });
    }
    return r;
  }

  // --- building blocks ---------------------------------------------------------------------

  /** Chip tray in the control strip (default centre x 500, y 664). */
  addChipTray(opts = {}) {
    const x = opts.x ?? 500;
    const y = opts.y ?? 664;
    this.chipTray = new ChipTray(this, x, y, { depth: DEPTH.UI, ...opts });
    return this.chipTray;
  }

  /** A BetSpot wired to this game, the wallet and the chip tray; refunded on leave. */
  addBetSpot(x, y, opts = {}) {
    const spot = new BetSpot(this, x, y, {
      game: this.id,
      getChip: () => this.chipTray?.value ?? 1,
      tray: this.chipTray,
      depth: DEPTH.GAME,
      ...opts,
    });
    this.betSpots.push(spot);
    return spot;
  }

  addButton(x, y, opts = {}) {
    return new Button(this, x, y, { depth: DEPTH.UI, ...opts });
  }

  totalBet() {
    return this.betSpots.reduce((n, s) => n + (s.active ? s.amount : 0), 0);
  }

  clearSpots() {
    for (const s of this.betSpots) s.clear();
  }

  toast(str, kind = 'info') {
    return toast(this, str, { kind });
  }

  floatText(x, y, str, opts) {
    return floatText(this, x, y, str, opts);
  }

  say(who, str, ms) {
    const p = who === 'booker' ? this.booker : this.soba;
    return p?.say(str, ms);
  }

  // --- test hook -----------------------------------------------------------------------------

  /** State for render_game_to_text(). Extend: ({ ...super.snapshot(), myField }). */
  snapshot() {
    return {
      game: this.id,
      roundActive: this.roundActive,
      rounds: this.rounds,
      inPlay: wallet.inPlay(this.id),
      chip: this.chipTray?.value ?? null,
      bets: this.betSpots.filter(s => s.active).map(s => ({ label: s.o.label ?? s.o.id ?? null, amount: s.amount })),
      soba: this.soba?.mood ?? null,
      booker: this.booker?.mood ?? null,
      banner: this.banner?.active ? this.banner.tier : null,
      rules: !!this.topBar?.rules?.isOpen,
      last: this.lastResult ? { outcome: this.lastResult.outcome, wagered: this.lastResult.wagered, paid: this.lastResult.paid } : null,
    };
  }
}
