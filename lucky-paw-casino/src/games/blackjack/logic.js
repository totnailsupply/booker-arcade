// =============================================================================
// Blackjack rules — pure JS (no Phaser), shared by the scene, the node tests
// and the RTP simulation.
//
// Rules (PLAN.md section 3):
//   6 decks; the shoe is reshuffled before a round once 75 % has been dealt.
//   Dealer stands on all 17s (S17). Dealer peeks for blackjack when showing an
//   ace or a ten-value card; a dealer blackjack ends the round at once (the
//   player loses only the original bet, a player blackjack pushes).
//   Blackjack pays 3:2 (the total return is floored to whole chips:
//   a 5-chip blackjack returns 5 + 7 = 12).
//   Double on any first two cards (one card, stake doubled), double after split.
//   Split once, into two hands. SPLIT RULE: any two cards of equal VALUE may be
//   split (K-10 and J-Q count as a pair). Split aces get one card each and stop.
//   A 21 on a split hand is not a blackjack (pays 1:1).
//   No insurance, no surrender. A push returns the stake.
//
// Cards are strings: rank + suit, e.g. 'AS', '10H', 'KD', '7C'.
//
//   const shoe = new Shoe(rng);                  // rng: core/Rng.js (or anything with int(n))
//   const round = new Round(shoe, 10, { canAfford: (n) => wallet.balance >= n });
//   let events = round.start();                  // list of things to animate
//   while (round.phase === 'player') events = round.act(pick(round.legal()));
//   round.results    // [{ result: 'win'|'lose'|'push'|'blackjack', bet, payout }]
// =============================================================================

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];
export const DECKS = 6;
export const PENETRATION = 0.75;
export const DEALER_STANDS = 17;      // S17: stands on soft 17 too

export const rankOf = (card) => card.slice(0, -1);
export const suitOf = (card) => card.slice(-1);
export const isRed = (card) => { const s = suitOf(card); return s === 'H' || s === 'D'; };

/** Blackjack value of one card: A = 1 (handValue promotes one ace to 11), faces 10. */
export function cardValue(card) {
  const r = rankOf(card);
  if (r === 'A') return 1;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

/** { total, soft, bust } — soft = an ace is counted as 11. */
export function handValue(cards) {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    sum += v;
    if (v === 1) aces++;
  }
  const soft = aces > 0 && sum + 10 <= 21;
  const total = soft ? sum + 10 : sum;
  return { total, soft, bust: total > 21 };
}

/** A natural: two cards totalling 21, not on a split hand. */
export function isBlackjack(cards, split = false) {
  return !split && cards.length === 2 && handValue(cards).total === 21;
}

/** Equal value (the split rule above). */
export function isPair(cards) {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}

/** Dealer must peek with an ace or ten-value card showing. */
export function dealerPeeks(upcard) {
  const v = cardValue(upcard);
  return v === 1 || v === 10;
}

/** Player-facing label: 'Blackjack!', 'Bust', 'Soft 17', '20'. */
export function describeHand(cards, split = false) {
  if (!cards.length) return '';
  if (isBlackjack(cards, split)) return 'Blackjack!';
  const v = handValue(cards);
  if (v.bust) return 'Bust';
  if (v.soft && v.total < 21) return `Soft ${v.total}`;
  return String(v.total);
}

/** Total return (stake included) for a finished hand result. */
export function payoutFor(result, bet) {
  switch (result) {
    case 'blackjack': return bet + Math.floor((bet * 3) / 2);
    case 'win': return bet * 2;
    case 'push': return bet;
    default: return 0;
  }
}

/** Compare a finished player hand with the finished dealer hand. */
export function resolveHand(hand, dealerCards) {
  const p = handValue(hand.cards);
  const pBJ = isBlackjack(hand.cards, hand.split);
  const dBJ = isBlackjack(dealerCards);
  if (pBJ && dBJ) return 'push';
  if (dBJ) return 'lose';
  if (pBJ) return 'blackjack';
  if (p.bust) return 'lose';
  const d = handValue(dealerCards);
  if (d.bust) return 'win';
  if (p.total > d.total) return 'win';
  if (p.total < d.total) return 'lose';
  return 'push';
}

/** Dealer draws (S17): hits below 17, stands on every 17 (hard or soft). */
export function dealerShouldHit(cards) {
  return handValue(cards).total < DEALER_STANDS;
}

// --- shoe ----------------------------------------------------------------------------

export function freshDecks(decks = DECKS) {
  const out = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

export class Shoe {
  /**
   * @param {{int:(n:number)=>number, shuffle?:(a:any[])=>any[]}} rng
   * @param {{decks?:number, penetration?:number}} [o]
   */
  constructor(rng, { decks = DECKS, penetration = PENETRATION } = {}) {
    this.rng = rng;
    this.decks = decks;
    this.penetration = penetration;
    this.shuffles = 0;
    this.shuffle();
  }

  get size() { return this.cards.length; }
  get remaining() { return this.cards.length - this.pos; }
  get dealt() { return this.pos; }

  /** Fresh, fully shuffled shoe (Fisher–Yates with the injected rng). */
  shuffle() {
    const a = freshDecks(this.decks);
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    this.cards = a;
    this.pos = 0;
    this.shuffles += 1;
    return this;
  }

  /** True when the cut card has come out (75 % dealt): reshuffle before the next round. */
  needsShuffle() {
    return this.pos >= Math.floor(this.cards.length * this.penetration);
  }

  draw() {
    if (this.pos >= this.cards.length) this.shuffle(); // never runs dry mid-round
    return this.cards[this.pos++];
  }

  peek(n = 1) {
    return this.cards.slice(this.pos, this.pos + n);
  }

  /**
   * Put these cards next, in order (debug / tests). Cards are swapped in from
   * later in the shoe, so the shoe keeps its exact composition. Returns how
   * many were placed.
   */
  stack(list) {
    let placed = 0;
    for (let i = 0; i < list.length; i++) {
      const at = this.pos + i;
      if (at >= this.cards.length) break;
      const want = list[i];
      const j = this.cards.indexOf(want, at);
      if (j < 0) continue;
      const t = this.cards[at]; this.cards[at] = this.cards[j]; this.cards[j] = t;
      placed++;
    }
    return placed;
  }
}

// --- one round -------------------------------------------------------------------------

/**
 * A single round for one seat. Every mutating call returns the list of events
 * that happened, in order, for the scene to animate:
 *   { type: 'card', to: 'player', hand, card }      a card lands on a player hand
 *   { type: 'card', to: 'dealer', card, hidden }    hidden = the hole card
 *   { type: 'peek', blackjack }                     dealer checks the hole card
 *   { type: 'reveal', card }                        hole card flips face up
 *   { type: 'split' }                               hand 0's second card moves to hand 1
 *   { type: 'double', hand }                        stake doubled
 *   { type: 'active', hand }                        this hand is up
 *   { type: 'handDone', hand, reason }              'bust' | '21' | 'stand' | 'double' | 'splitAces' | 'blackjack'
 *   { type: 'dealerTurn' }
 *   { type: 'settle', results }
 */
export class Round {
  /**
   * @param {Shoe} shoe
   * @param {number} bet  main stake (whole chips)
   * @param {{canAfford?: (n:number)=>boolean}} [o] extra stake check for double/split
   */
  constructor(shoe, bet, { canAfford = () => true } = {}) {
    this.shoe = shoe;
    this.bet = bet;
    this.canAfford = canAfford;
    this.hands = [this.newHand([], bet, false)];
    this.dealer = { cards: [], hidden: true };
    this.active = 0;
    this.phase = 'deal';
    this.results = null;
    this.peeked = false;
  }

  newHand(cards, bet, split) {
    return { cards, bet, doubled: false, split, splitAces: false, done: false, reason: null, result: null, payout: 0 };
  }

  get wagered() { return this.hands.reduce((n, h) => n + h.bet, 0); }
  get paid() { return this.results ? this.hands.reduce((n, h) => n + h.payout, 0) : 0; }
  get hand() { return this.hands[this.active]; }
  get upcard() { return this.dealer.cards[0]; }

  /** Deal p, d, p, d(hole), then peek / settle naturals. */
  start() {
    if (this.phase !== 'deal') throw new Error('round already started');
    const ev = [];
    this.dealTo(0, ev);
    this.dealDealer(ev, false);
    this.dealTo(0, ev);
    this.dealDealer(ev, true);
    const h = this.hands[0];
    const dBJ = isBlackjack(this.dealer.cards);
    const pBJ = isBlackjack(h.cards);
    if (dealerPeeks(this.upcard)) {
      this.peeked = true;
      ev.push({ type: 'peek', blackjack: dBJ });
    }
    if (dBJ || pBJ) {
      // dealer blackjack ends the round; a player blackjack is paid at once
      h.done = true;
      h.reason = pBJ ? 'blackjack' : 'dealerBlackjack';
      ev.push({ type: 'handDone', hand: 0, reason: h.reason });
      this.revealHole(ev);
      this.settle(ev);
      return ev;
    }
    this.phase = 'player';
    this.active = 0;
    ev.push({ type: 'active', hand: 0 });
    return ev;
  }

  /** Which actions are allowed right now. */
  legal() {
    const no = { hit: false, stand: false, double: false, split: false };
    if (this.phase !== 'player') return no;
    const h = this.hand;
    if (!h || h.done) return no;
    const two = h.cards.length === 2;
    return {
      hit: true,
      stand: true,
      double: two && !h.splitAces && this.canAfford(h.bet),
      split: two && this.hands.length === 1 && isPair(h.cards) && this.canAfford(h.bet),
    };
  }

  /** Apply 'hit' | 'stand' | 'double' | 'split'. Throws on an illegal action. */
  act(action) {
    const legal = this.legal();
    if (!legal[action]) throw new Error(`illegal action ${action}`);
    const ev = [];
    const i = this.active;
    const h = this.hands[i];
    if (action === 'hit') {
      this.dealTo(i, ev);
      const v = handValue(h.cards);
      if (v.bust) this.finish(i, 'bust', ev);
      else if (v.total === 21) this.finish(i, '21', ev);
    } else if (action === 'stand') {
      this.finish(i, 'stand', ev);
    } else if (action === 'double') {
      h.bet *= 2;
      h.doubled = true;
      ev.push({ type: 'double', hand: i });
      this.dealTo(i, ev);
      this.finish(i, handValue(h.cards).bust ? 'bust' : 'double', ev);
    } else if (action === 'split') {
      const aces = cardValue(h.cards[0]) === 1;
      const second = h.cards.pop();
      h.split = true;
      h.splitAces = aces;
      const h2 = this.newHand([second], h.bet, true);
      h2.splitAces = aces;
      this.hands.push(h2);
      ev.push({ type: 'split' });
      this.dealTo(0, ev);
      if (aces) {
        this.dealTo(1, ev);
        this.finish(0, 'splitAces', ev, false);
        this.finish(1, 'splitAces', ev, false);
        this.advance(ev);
      } else if (handValue(h.cards).total === 21) {
        this.finish(0, '21', ev);
      }
    }
    return ev;
  }

  // --- internals ---------------------------------------------------------------------

  dealTo(i, ev) {
    const card = this.shoe.draw();
    this.hands[i].cards.push(card);
    ev.push({ type: 'card', to: 'player', hand: i, card });
    return card;
  }

  dealDealer(ev, hidden) {
    const card = this.shoe.draw();
    this.dealer.cards.push(card);
    ev.push({ type: 'card', to: 'dealer', card, hidden });
    return card;
  }

  revealHole(ev) {
    if (!this.dealer.hidden) return;
    this.dealer.hidden = false;
    ev.push({ type: 'reveal', card: this.dealer.cards[1] });
  }

  finish(i, reason, ev, advance = true) {
    const h = this.hands[i];
    h.done = true;
    h.reason = reason;
    ev.push({ type: 'handDone', hand: i, reason });
    if (advance) this.advance(ev);
  }

  /** Move to the next unfinished hand (dealing its second card), or to the dealer. */
  advance(ev) {
    const next = this.hands.findIndex(h => !h.done);
    if (next < 0) {
      this.dealerPlay(ev);
      return;
    }
    this.active = next;
    const h = this.hands[next];
    ev.push({ type: 'active', hand: next });
    if (h.cards.length < 2) {
      this.dealTo(next, ev);
      if (handValue(h.cards).total === 21) this.finish(next, '21', ev);
    }
  }

  dealerPlay(ev) {
    this.phase = 'dealer';
    ev.push({ type: 'dealerTurn' });
    this.revealHole(ev);
    const live = this.hands.some(h => !handValue(h.cards).bust);
    if (live) {
      while (dealerShouldHit(this.dealer.cards)) this.dealDealer(ev, false);
    }
    this.settle(ev);
  }

  settle(ev) {
    this.phase = 'done';
    this.dealer.hidden = false;
    for (const h of this.hands) {
      h.result = resolveHand(h, this.dealer.cards);
      h.payout = payoutFor(h.result, h.bet);
    }
    this.results = this.hands.map(h => ({ result: h.result, bet: h.bet, payout: h.payout }));
    ev.push({ type: 'settle', results: this.results });
  }

  /** Plain-data view (snapshot / tests). hideHole: show the hole card as '??'. */
  view() {
    const dv = handValue(this.dealer.hidden ? this.dealer.cards.slice(0, 1) : this.dealer.cards);
    return {
      phase: this.phase,
      active: this.active,
      hands: this.hands.map(h => {
        const v = handValue(h.cards);
        return {
          cards: [...h.cards], total: v.total, soft: v.soft, bet: h.bet, doubled: h.doubled,
          done: h.done, result: h.result, payout: h.payout, label: describeHand(h.cards, h.split),
        };
      }),
      dealer: {
        cards: this.dealer.cards.map((c, i) => (i === 1 && this.dealer.hidden ? '??' : c)),
        total: this.dealer.cards.length ? dv.total : 0,
        soft: dv.soft,
      },
    };
  }
}
