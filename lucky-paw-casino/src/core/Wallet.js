// =============================================================================
// Wallet.js — the ONLY place chips change. Pure JS (no Phaser), node-tested.
//
// Money flow for one round (all games):
//   wallet.bet(game, n)        chips leave the balance when they hit the table
//                              (XP += n, per-game wagered += n, inPlay += n)
//   wallet.refund(game, n)     chips come back un-played (bet undone: XP, wagered
//                              and inPlay go back down)
//   wallet.pay(game, n)        TOTAL return credited (stake + winnings). An even-
//                              money win on 10 pays 20; a push pays 10; a loss pays 0.
//   wallet.settleRound(game, { wagered, paid })
//                              books the round (does NOT move chips): rounds, net,
//                              biggest win, win streak; emits ROUND_SETTLED (and
//                              BIG_WIN when paid >= 10x wagered); saves.
//   BaseGameScene.settle(wagered, paid) does pay() + settleRound() for you.
//
// Limits: bet() only checks the balance. The VIP table limit (maxBet) is a UI
// rule: canBet(n, already) / whyNot(n, already) check balance AND limit, and
// ChipTray/BetSpot use them. (A blackjack double may exceed maxBet; that's
// the game's call.)
//
// Conservation (tests): totals.start - totals.bet + totals.paid + totals.bonus === balance
// where totals.bet is net of refunds and bonus covers daily, bailout, VIP gifts
// and debug adjustments.
//
// Construct with injected callbacks so node tests need no EventBus:
//   new Wallet({ emit(event, data), persist(wallet), state, now: () => ms })
// =============================================================================

import { ECONOMY, VIP_TIERS, GAME_IDS } from './Constants.js';
import { Events } from './EventBus.js';

const int = (n) => Math.floor(Number(n) || 0);

/** Local calendar date 'YYYY-MM-DD' for a ms timestamp. */
export function dateKey(ms) {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** VIP tier index for an XP amount. */
export function tierForXp(xp) {
  let t = 0;
  for (const v of VIP_TIERS) if (xp >= v.xp) t = v.tier;
  return t;
}

function emptyGameStats() {
  return { rounds: 0, wagered: 0, won: 0, biggestWin: 0, streak: 0, bestStreak: 0, wins: 0, losses: 0, pushes: 0 };
}

function freshState(start = ECONOMY.START_BALANCE) {
  const games = {};
  for (const id of GAME_IDS) games[id] = emptyGameStats();
  return {
    balance: start,
    xp: 0,
    tierReached: 0,
    giftsClaimed: [],
    lastDaily: null,
    stats: { games, bailouts: 0, dailies: 0, gifts: 0, biggestWin: { game: null, amount: 0 } },
    totals: { start, bet: 0, paid: 0, bonus: 0, refunded: 0 },
    inPlay: {},
    log: [],
  };
}

export class Wallet {
  /**
   * @param {object} [o]
   * @param {(event: string, data: object) => void} [o.emit]   event sink (EventBus.emit in the game)
   * @param {(wallet: Wallet) => void} [o.persist]            called after every change worth saving
   * @param {object} [o.state]                                 saved toJSON() data to restore
   * @param {() => number} [o.now]                             clock (ms)
   */
  constructor({ emit = () => {}, persist = () => {}, state = null, now = () => Date.now() } = {}) {
    this.emit = emit;
    this.persist = persist;
    this.now = now;
    this.s = freshState();
    if (state) this.load(state);
  }

  // --- read --------------------------------------------------------------------

  get balance() { return this.s.balance; }
  get xp() { return this.s.xp; }
  get totals() { return { ...this.s.totals }; }
  get log() { return this.s.log; }

  /** Chips currently on the table (bet, not yet settled or refunded). Per game or total. */
  inPlay(game = null) {
    if (game) return this.s.inPlay[game] || 0;
    return Object.values(this.s.inPlay).reduce((a, b) => a + b, 0);
  }

  get tier() { return Math.max(this.s.tierReached, tierForXp(this.s.xp)); }

  /** { tier, name, xp, next, prev, progress (0..1), maxBet, color, nextName } */
  vip() {
    const t = this.tier;
    const cur = VIP_TIERS[t];
    const nxt = VIP_TIERS[t + 1] || null;
    const progress = nxt ? Math.max(0, Math.min(1, (this.s.xp - cur.xp) / (nxt.xp - cur.xp))) : 1;
    return {
      tier: t, name: cur.name, xp: this.s.xp, prev: cur.xp, next: nxt ? nxt.xp : null,
      nextName: nxt ? nxt.name : null, progress, maxBet: cur.maxBet, color: cur.color,
    };
  }

  /** VIP table limit (per bet spot / per round stake, as each game defines it). */
  maxBet() { return VIP_TIERS[this.tier].maxBet; }

  /** True if n more chips can go on a spot that already holds `already`. */
  canBet(n, already = 0) { return this.whyNot(n, already) === null; }

  /** null if OK, else a short player-facing reason ('Not enough chips', 'Max bet is 250'). */
  whyNot(n, already = 0) {
    n = int(n);
    if (n <= 0) return 'Pick a chip first';
    if (n > this.s.balance) return 'Not enough chips';
    if (n + int(already) > this.maxBet()) return `Max bet is ${this.maxBet().toLocaleString('en-US')}`;
    return null;
  }

  // --- money ---------------------------------------------------------------------

  /** Take n chips for a bet. Only checks the balance. Returns false (no change) if it can't. */
  bet(game, n) {
    n = int(n);
    if (n <= 0 || n > this.s.balance) return false;
    const g = this.gameStats(game);
    this.s.balance -= n;
    this.s.totals.bet += n;
    g.wagered += n;
    this.s.inPlay[game] = (this.s.inPlay[game] || 0) + n;
    this.record(game, 'bet', -n);
    this.emitBalance(-n, 'bet', game);
    this.addXp(n * ECONOMY.XP_PER_CHIP);
    return true;
  }

  /** Return un-played chips (undo/clear before the round). Clamped to what's in play. */
  refund(game, n) {
    n = Math.min(int(n), this.inPlay(game));
    if (n <= 0) return 0;
    const g = this.gameStats(game);
    this.s.balance += n;
    this.s.totals.bet -= n;
    this.s.totals.refunded += n;
    g.wagered = Math.max(0, g.wagered - n);
    this.s.inPlay[game] -= n;
    this.s.xp = Math.max(0, this.s.xp - n * ECONOMY.XP_PER_CHIP);
    this.record(game, 'refund', n);
    this.emitBalance(n, 'refund', game);
    this.emitXp();
    this.persist(this);
    return n;
  }

  /** Credit a payout (total return, stake included). */
  pay(game, n) {
    n = int(n);
    if (n <= 0) return 0;
    const g = this.gameStats(game);
    this.s.balance += n;
    this.s.totals.paid += n;
    g.won += n;
    this.record(game, 'pay', n);
    this.emitBalance(n, 'pay', game);
    return n;
  }

  /**
   * Book a finished round (no chips move here; call pay() first).
   * @returns {{game, wagered, paid, net, outcome, streak, x, big, mega, balance}}
   */
  settleRound(game, { wagered = 0, paid = 0 } = {}) {
    wagered = int(wagered);
    paid = int(paid);
    const g = this.gameStats(game);
    const net = paid - wagered;
    const outcome = net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
    g.rounds += 1;
    if (outcome === 'win') {
      g.wins += 1;
      g.streak += 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      g.biggestWin = Math.max(g.biggestWin, net);
      // Only the five lobby games count toward the casino-wide record (not the 'kit' sandbox)
      if (GAME_IDS.includes(game) && net > this.s.stats.biggestWin.amount) this.s.stats.biggestWin = { game, amount: net };
    } else if (outcome === 'lose') {
      g.losses += 1;
      g.streak = 0;
    } else {
      g.pushes += 1; // a push neither extends nor breaks the streak
    }
    this.s.inPlay[game] = Math.max(0, (this.s.inPlay[game] || 0) - wagered);
    const x = wagered > 0 ? paid / wagered : 0;
    const result = {
      game, wagered, paid, net, outcome, streak: g.streak, x,
      big: wagered > 0 && x >= ECONOMY.BIG_WIN_X,
      mega: wagered > 0 && x >= ECONOMY.MEGA_WIN_X,
      balance: this.s.balance,
    };
    this.emit(Events.ROUND_SETTLED, result);
    if (result.big) this.emit(Events.BIG_WIN, { game, wagered, paid, x });
    this.persist(this);
    return result;
  }

  /** Forget chips still marked in play for a game WITHOUT refunding (they were lost). */
  forfeit(game) {
    const n = this.inPlay(game);
    this.s.inPlay[game] = 0;
    if (n) this.persist(this);
    return n;
  }

  // --- bonuses ------------------------------------------------------------------------

  bailoutAvailable() {
    return this.s.balance < ECONOMY.BAILOUT_BELOW && this.inPlay() === 0;
  }

  /** Booker's cashier cage: +500 when broke. Returns the amount (0 if not available). */
  takeBailout() {
    if (!this.bailoutAvailable()) return 0;
    const n = ECONOMY.BAILOUT_AMOUNT;
    this.s.stats.bailouts += 1;
    this.bonus(n, 'bailout');
    this.emit(Events.BAILOUT, { amount: n, balance: this.s.balance, count: this.s.stats.bailouts });
    this.persist(this);
    return n;
  }

  dailyAvailable(now = this.now()) {
    return this.s.lastDaily !== dateKey(now);
  }

  /** +250 once per calendar day. Returns the amount (0 if already claimed today). */
  claimDaily(now = this.now()) {
    if (!this.dailyAvailable(now)) return 0;
    const n = ECONOMY.DAILY_AMOUNT;
    this.s.lastDaily = dateKey(now);
    this.s.stats.dailies += 1;
    this.bonus(n, 'daily');
    this.emit(Events.DAILY_CLAIMED, { amount: n, balance: this.s.balance, date: this.s.lastDaily });
    this.persist(this);
    return n;
  }

  /** Debug/test: set the balance exactly (booked as a 'debug' bonus so conservation holds). */
  setBalance(n) {
    const delta = int(n) - this.s.balance;
    if (delta) this.bonus(delta, 'debug');
    this.persist(this);
  }

  /** Debug/test: add XP without betting (may trigger VIP gifts). */
  addXpDebug(n) {
    this.addXp(int(n));
    this.persist(this);
  }

  /** Back to a brand-new player. */
  reset() {
    this.s = freshState();
    this.emit(Events.WALLET_RESET, {});
    this.emitBalance(0, 'reset', null);
    this.emitXp();
    this.persist(this);
  }

  // --- stats ----------------------------------------------------------------------------

  /** Per-game stats with net computed: { rounds, wagered, won, net, biggestWin, streak, bestStreak, wins, losses, pushes } */
  gameSummary(game) {
    const g = this.gameStats(game);
    return { ...g, net: g.won - g.wagered };
  }

  /** Everything the Stats screen and render_game_to_text need. Totals cover the
   *  five lobby games only (GAME_IDS): the internal 'kit' sandbox never counts. */
  summary() {
    const games = {};
    let rounds = 0, wagered = 0, won = 0;
    for (const id of GAME_IDS) {
      const g = this.gameSummary(id);
      games[id] = g;
      rounds += g.rounds;
      wagered += g.wagered;
      won += g.won;
    }
    return {
      rounds, wagered, won, net: won - wagered,
      biggestWin: { ...this.s.stats.biggestWin },
      bailouts: this.s.stats.bailouts,
      dailies: this.s.stats.dailies,
      gifts: this.s.stats.gifts,
      inPlay: this.inPlay(),
      games,
    };
  }

  /** start - bet + paid + bonus - balance (0 when the books balance). */
  conservationError() {
    const t = this.s.totals;
    return t.start - t.bet + t.paid + t.bonus - this.s.balance;
  }

  // --- persistence ----------------------------------------------------------------------------

  toJSON() {
    const s = this.s;
    return {
      balance: s.balance, xp: s.xp, tierReached: s.tierReached, giftsClaimed: [...s.giftsClaimed],
      lastDaily: s.lastDaily, stats: JSON.parse(JSON.stringify(s.stats)), totals: { ...s.totals },
      inPlay: { ...s.inPlay }, log: s.log.slice(-50),
    };
  }

  /** Restore from toJSON() data (tolerates missing/old fields). Chips that were
   *  "in play" when the page closed are refunded so nothing is lost. */
  load(data) {
    if (!data || typeof data !== 'object') return;
    const f = freshState();
    const s = f;
    if (Number.isFinite(data.balance)) s.balance = int(data.balance);
    if (Number.isFinite(data.xp)) s.xp = Math.max(0, int(data.xp));
    if (Number.isFinite(data.tierReached)) s.tierReached = int(data.tierReached);
    if (Array.isArray(data.giftsClaimed)) s.giftsClaimed = data.giftsClaimed.map(int);
    if (typeof data.lastDaily === 'string') s.lastDaily = data.lastDaily;
    if (data.stats && typeof data.stats === 'object') {
      for (const k of ['bailouts', 'dailies', 'gifts']) if (Number.isFinite(data.stats[k])) s.stats[k] = int(data.stats[k]);
      const bw = data.stats.biggestWin;
      if (bw && GAME_IDS.includes(bw.game)) s.stats.biggestWin = { game: bw.game, amount: int(bw.amount) };
      for (const [id, g] of Object.entries(data.stats.games || {})) {
        s.stats.games[id] = { ...emptyGameStats(), ...g };
      }
      // A record set in the 'kit' sandbox (older saves): rebuild it from the five games
      if (!s.stats.biggestWin.game) {
        for (const id of GAME_IDS) {
          const b = int(s.stats.games[id]?.biggestWin);
          if (b > s.stats.biggestWin.amount) s.stats.biggestWin = { game: id, amount: b };
        }
      }
    }
    if (data.totals && typeof data.totals === 'object') {
      for (const k of ['start', 'bet', 'paid', 'bonus', 'refunded']) if (Number.isFinite(data.totals[k])) s.totals[k] = int(data.totals[k]);
    } else {
      // Old/partial save: make the books match the saved balance
      s.totals.start = s.balance;
    }
    if (Array.isArray(data.log)) s.log = data.log.slice(-ECONOMY.LOG_SIZE);
    this.s = s;
    // Unsettled bets from a closed tab go back to the player
    for (const [game, n] of Object.entries(data.inPlay || {})) {
      if (int(n) > 0) {
        this.s.inPlay[game] = int(n);
        this.refund(game, int(n));
      }
    }
  }

  // --- internals -----------------------------------------------------------------------------

  gameStats(game) {
    const id = game || 'other';
    return (this.s.stats.games[id] ||= emptyGameStats());
  }

  bonus(n, kind) {
    this.s.balance += n;
    this.s.totals.bonus += n;
    this.record(null, kind, n);
    this.emitBalance(n, kind, null);
  }

  addXp(n) {
    if (n <= 0) return;
    const before = this.tier;
    this.s.xp += n;
    const now = tierForXp(this.s.xp);
    if (now > this.s.tierReached) this.s.tierReached = now;
    for (let t = before + 1; t <= this.tier; t++) {
      const v = VIP_TIERS[t];
      if (this.s.giftsClaimed.includes(t)) continue;
      this.s.giftsClaimed.push(t);
      this.s.stats.gifts += 1;
      if (v.gift > 0) this.bonus(v.gift, 'gift');
      this.emit(Events.VIP_UP, { tier: t, name: v.name, gift: v.gift, maxBet: v.maxBet });
    }
    this.emitXp();
  }

  record(game, kind, amount) {
    this.s.log.push({ game, kind, amount, balance: this.s.balance });
    if (this.s.log.length > ECONOMY.LOG_SIZE) this.s.log.splice(0, this.s.log.length - ECONOMY.LOG_SIZE);
  }

  emitBalance(delta, reason, game) {
    this.emit(Events.BALANCE_CHANGED, { balance: this.s.balance, delta, reason, game });
  }

  emitXp() {
    const v = this.vip();
    this.emit(Events.XP_CHANGED, { xp: v.xp, tier: v.tier, progress: v.progress });
  }
}
