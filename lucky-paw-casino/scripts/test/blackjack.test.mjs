import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/Rng.js';
import {
  Shoe, Round, handValue, isBlackjack, isPair, cardValue, describeHand, payoutFor, resolveHand,
  dealerShouldHit, dealerPeeks, freshDecks,
} from '../../src/games/blackjack/logic.js';
import { basicStrategy, chartCode, hintReason } from '../../src/games/blackjack/strategy.js';

/** A round whose shoe deals `cards` first, in deal order: p1, d-up, p2, d-hole, then draws. */
function rigged(cards, bet = 10, o = {}) {
  const shoe = new Shoe(new Rng(1));
  shoe.stack(cards);
  const r = new Round(shoe, bet, o);
  const ev = r.start();
  return { r, ev, shoe };
}

// --- hand values -------------------------------------------------------------------------

test('hand totals: hard, soft aces, multiple aces, bust', () => {
  assert.deepEqual(handValue(['10H', '7S']), { total: 17, soft: false, bust: false });
  assert.deepEqual(handValue(['AH', '6S']), { total: 17, soft: true, bust: false });
  assert.deepEqual(handValue(['AH', '6S', '10C']), { total: 17, soft: false, bust: false });
  assert.deepEqual(handValue(['AH', 'AS']), { total: 12, soft: true, bust: false });
  assert.deepEqual(handValue(['AH', 'AS', 'AD', 'AC']), { total: 14, soft: true, bust: false });
  assert.deepEqual(handValue(['AH', 'AS', '9D']), { total: 21, soft: true, bust: false });
  assert.deepEqual(handValue(['KH', 'QS', '2D']), { total: 22, soft: false, bust: true });
  assert.equal(cardValue('JD'), 10);
  assert.equal(cardValue('AD'), 1);
  assert.equal(cardValue('10D'), 10);
});

test('blackjack detection and labels', () => {
  assert.equal(isBlackjack(['AS', 'KD']), true);
  assert.equal(isBlackjack(['10S', 'AD']), true);
  assert.equal(isBlackjack(['AS', 'KD'], true), false, 'split 21 is not a blackjack');
  assert.equal(isBlackjack(['7S', '7D', '7C']), false);
  assert.equal(describeHand(['AS', 'KD']), 'Blackjack!');
  assert.equal(describeHand(['AS', 'KD'], true), '21');
  assert.equal(describeHand(['AS', '6D']), 'Soft 17');
  assert.equal(describeHand(['KS', 'QD', '5C']), 'Bust');
  assert.equal(describeHand(['KS', '7D']), '17');
  assert.equal(isPair(['KS', '10D']), true, 'equal value splits');
  assert.equal(isPair(['8S', '8D']), true);
  assert.equal(isPair(['8S', '9D']), false);
});

test('dealer S17 play and peek rule', () => {
  assert.equal(dealerShouldHit(['10S', '6D']), true);
  assert.equal(dealerShouldHit(['AS', '6D']), false, 'stands on soft 17');
  assert.equal(dealerShouldHit(['10S', '7D']), false);
  assert.equal(dealerShouldHit(['AS', '5D']), true, 'hits soft 16');
  assert.equal(dealerPeeks('AS'), true);
  assert.equal(dealerPeeks('QS'), true);
  assert.equal(dealerPeeks('9S'), false);
  // dealer draws to 17+ in a round: 10-6 then 4 = 20
  const { r } = rigged(['10H', '10S', '8C', '6D', '4H']);
  r.act('stand');
  assert.deepEqual(r.dealer.cards, ['10S', '6D', '4H']);
  assert.equal(r.hands[0].result, 'lose');
  // dealer stands on soft 17 (A-6) without drawing
  const b = rigged(['10H', '6S', '8C', 'AD']).r;
  b.act('stand');
  assert.deepEqual(b.dealer.cards, ['6S', 'AD']);
  assert.equal(b.hands[0].result, 'win');
});

// --- settlement -----------------------------------------------------------------------------

test('payouts: 3:2 blackjack floors to whole chips, win, push, lose', () => {
  assert.equal(payoutFor('blackjack', 10), 25);
  assert.equal(payoutFor('blackjack', 5), 12);
  assert.equal(payoutFor('win', 10), 20);
  assert.equal(payoutFor('push', 10), 10);
  assert.equal(payoutFor('lose', 10), 0);
});

test('player blackjack pays 3:2 at once (no peek needed vs 9)', () => {
  const { r, ev } = rigged(['AH', '9S', 'KC', '7D']);
  assert.equal(r.phase, 'done');
  assert.equal(r.hands[0].result, 'blackjack');
  assert.equal(r.paid, 25);
  assert.ok(ev.some(e => e.type === 'reveal'));
  assert.ok(!ev.some(e => e.type === 'peek'), 'no peek with a 9 up');
});

test('blackjack vs blackjack pushes', () => {
  const { r, ev } = rigged(['AH', 'AS', 'KC', 'QD']);
  assert.ok(ev.some(e => e.type === 'peek' && e.blackjack));
  assert.equal(r.hands[0].result, 'push');
  assert.equal(r.paid, 10);
});

test('dealer blackjack ends the round; player loses only the original bet', () => {
  const { r } = rigged(['10H', 'KS', '9C', 'AD']);
  assert.equal(r.phase, 'done');
  assert.equal(r.hands[0].result, 'lose');
  assert.equal(r.wagered, 10);
  assert.equal(r.paid, 0);
  assert.deepEqual(r.legal(), { hit: false, stand: false, double: false, split: false });
});

test('peek without blackjack continues the round', () => {
  const { r, ev } = rigged(['10H', 'AS', '9C', '7D']);
  assert.ok(ev.some(e => e.type === 'peek' && !e.blackjack));
  assert.equal(r.phase, 'player');
  assert.equal(r.view().dealer.cards[1], '??', 'hole card hidden');
  r.act('stand');
  assert.equal(r.hands[0].result, 'win', '19 beats soft 18');
});

test('player bust loses even if the dealer busts; dealer does not draw', () => {
  const { r } = rigged(['10H', '10S', '6C', '6D', 'KH']);
  r.act('hit');
  assert.equal(r.hands[0].result, 'lose');
  assert.equal(r.hands[0].reason, 'bust');
  assert.equal(r.dealer.cards.length, 2, 'dealer stops when every hand is bust');
});

test('dealer bust pays even money', () => {
  const { r } = rigged(['10H', '10S', '2C', '6D', 'KH']);
  r.act('stand');
  assert.equal(r.hands[0].result, 'win');
  assert.equal(r.paid, 20);
});

test('equal totals push', () => {
  const { r } = rigged(['10H', '10S', '8C', '8D']);
  r.act('stand');
  assert.equal(r.hands[0].result, 'push');
  assert.equal(r.paid, 10);
});

test('double: one card, stake doubled, paid on the doubled stake', () => {
  const { r } = rigged(['6H', '10S', '5C', '7D', 'KH']);
  assert.equal(r.legal().double, true);
  const ev = r.act('double');
  assert.equal(r.hands[0].cards.length, 3);
  assert.equal(r.hands[0].doubled, true);
  assert.equal(r.wagered, 20);
  assert.equal(r.hands[0].result, 'win', '21 vs 17');
  assert.equal(r.paid, 40);
  assert.ok(ev.some(e => e.type === 'double'));
});

test('double needs exactly two cards and enough chips', () => {
  const { r } = rigged(['2H', '10S', '3C', '7D', '2D']);
  r.act('hit');
  assert.equal(r.legal().double, false);
  const b = rigged(['6H', '10S', '5C', '7D'], 10, { canAfford: () => false }).r;
  assert.equal(b.legal().double, false);
  assert.equal(b.legal().split, false);
  assert.throws(() => b.act('double'));
});

test('split: two hands, each played, double after split, settled separately', () => {
  // p 8,8 vs dealer 6 (hole 10 -> 16, draws 9 -> bust)
  const { r } = rigged(['8H', '6S', '8C', '10D', '3H', '10C', 'KH', '9S']);
  assert.equal(r.legal().split, true);
  r.act('split');
  assert.equal(r.hands.length, 2);
  assert.deepEqual(r.hands[0].cards, ['8H', '3H']);
  assert.equal(r.active, 0);
  assert.equal(r.legal().split, false, 'split once');
  assert.equal(r.legal().double, true, 'double after split');
  r.act('double'); // 8,3 + 10 = 21
  assert.equal(r.active, 1);
  assert.deepEqual(r.hands[0].cards, ['8H', '3H', '10C']);
  assert.deepEqual(r.hands[1].cards, ['8C', 'KH']);
  r.act('stand');
  assert.deepEqual(r.dealer.cards, ['6S', '10D', '9S']);
  assert.equal(r.hands[0].result, 'win');
  assert.equal(r.hands[1].result, 'win');
  assert.equal(r.wagered, 30);
  assert.equal(r.paid, 60);
});

test('split tens of different rank is allowed (equal-value rule)', () => {
  const { r } = rigged(['KH', '6S', '10C', '10D']);
  assert.equal(r.legal().split, true);
});

test('split aces get one card each and a 21 is not a blackjack', () => {
  const { r } = rigged(['AH', '9S', 'AC', '8D', 'KH', '5C']);
  r.act('split');
  assert.equal(r.phase, 'done');
  assert.deepEqual(r.hands[0].cards, ['AH', 'KH']);
  assert.deepEqual(r.hands[1].cards, ['AC', '5C']);
  assert.equal(r.hands[0].result, 'win', '21 beats 17, at 1:1');
  assert.equal(r.hands[0].payout, 20);
  assert.equal(r.hands[1].result, 'lose', 'soft 16 vs 17');
  assert.equal(describeHand(r.hands[0].cards, true), '21');
});

test('21 on a split hand auto-stands and pays 1:1, not 3:2', () => {
  const { r } = rigged(['KH', '7S', 'KC', '10D', 'AH', '9C']);
  r.act('split');
  assert.equal(r.hands[0].done, true, '21 stands automatically');
  assert.equal(r.active, 1);
  r.act('stand'); // K,9 = 19 vs 17
  assert.equal(r.hands[0].result, 'win');
  assert.equal(r.hands[0].payout, 20);
});

test('legality: nothing before start or after the round; hit/stand while playing', () => {
  const shoe = new Shoe(new Rng(3));
  const r = new Round(shoe, 10);
  assert.deepEqual(r.legal(), { hit: false, stand: false, double: false, split: false });
  shoe.stack(['10H', '9S', '5C', '8D']);
  r.start();
  assert.deepEqual(r.legal(), { hit: true, stand: true, double: true, split: false });
  r.act('stand');
  assert.deepEqual(r.legal(), { hit: false, stand: false, double: false, split: false });
  assert.throws(() => r.act('hit'));
});

// --- shoe -------------------------------------------------------------------------------------

test('shoe: 312 cards, 6 of each card, reshuffle at 75 % penetration', () => {
  const shoe = new Shoe(new Rng(9));
  assert.equal(shoe.size, 312);
  const counts = {};
  for (const c of shoe.cards) counts[c] = (counts[c] || 0) + 1;
  assert.equal(Object.keys(counts).length, 52);
  assert.ok(Object.values(counts).every(n => n === 6));
  for (let i = 0; i < 233; i++) shoe.draw();
  assert.equal(shoe.needsShuffle(), false);
  shoe.draw(); // 234 = 75 % of 312
  assert.equal(shoe.needsShuffle(), true);
  assert.equal(shoe.remaining, 78);
  shoe.shuffle();
  assert.equal(shoe.remaining, 312);
  assert.equal(shoe.shuffles, 2);
  assert.equal(freshDecks().length, 312);
});

test('shoe.stack keeps the composition', () => {
  const shoe = new Shoe(new Rng(9));
  shoe.draw();
  shoe.stack(['AS', 'AS', 'KD']);
  assert.deepEqual(shoe.peek(3), ['AS', 'AS', 'KD']);
  const counts = {};
  for (const c of shoe.cards) counts[c] = (counts[c] || 0) + 1;
  assert.ok(Object.values(counts).every(n => n === 6));
});

test('deterministic per seed', () => {
  const a = new Shoe(new Rng(42));
  const b = new Shoe(new Rng(42));
  const c = new Shoe(new Rng(43));
  assert.deepEqual(a.cards, b.cards);
  assert.notDeepEqual(a.cards, c.cards);
  const play = (seed) => {
    const shoe = new Shoe(new Rng(seed));
    const out = [];
    for (let i = 0; i < 50; i++) {
      if (shoe.needsShuffle()) shoe.shuffle();
      const r = new Round(shoe, 10);
      r.start();
      while (r.phase === 'player') {
        const l = r.legal();
        r.act(basicStrategy(r.hand.cards, r.upcard, { canDouble: l.double, canSplit: l.split }));
      }
      out.push(r.paid);
    }
    return out;
  };
  assert.deepEqual(play(7), play(7));
});

// --- strategy -------------------------------------------------------------------------------

test('basic strategy spot checks (6D S17 DAS)', () => {
  const bs = (cards, up, o) => basicStrategy(cards, up, o);
  assert.equal(bs(['6H', '5S'], '10D'), 'double', '11 vs 10');
  assert.equal(bs(['6H', '5S'], 'AD'), 'hit', '11 vs A (S17)');
  assert.equal(bs(['AH', '7S'], '9D'), 'hit', 'A7 vs 9');
  assert.equal(bs(['AH', '7S'], '2D'), 'stand', 'A7 vs 2');
  assert.equal(bs(['AH', '7S'], '7D'), 'stand', 'A7 vs 7');
  assert.equal(bs(['AH', '7S'], '5D'), 'double', 'A7 vs 5');
  assert.equal(bs(['AH', '7S'], '5D', { canDouble: false }), 'stand', 'A7 vs 5, no double -> stand');
  assert.equal(bs(['8H', '8S'], 'AD'), 'split', '8-8 vs A');
  assert.equal(bs(['8H', '8S'], 'AD', { canSplit: false }), 'hit', '16 vs A when split not allowed');
  assert.equal(bs(['10H', '6S'], '10D'), 'hit', '16 vs 10');
  assert.equal(bs(['10H', '2S'], '4D'), 'stand', '12 vs 4');
  assert.equal(bs(['10H', '2S'], '3D'), 'hit', '12 vs 3');
  assert.equal(bs(['10H', '3S'], '2D'), 'stand', '13 vs 2');
  assert.equal(bs(['5H', '4S'], '3D'), 'double', '9 vs 3');
  assert.equal(bs(['5H', '4S'], '2D'), 'hit', '9 vs 2');
  assert.equal(bs(['5H', '5S'], '9D'), 'double', '5-5 is a hard 10');
  assert.equal(bs(['9H', '9S'], '7D'), 'stand', '9-9 vs 7');
  assert.equal(bs(['9H', '9S'], '9D'), 'split', '9-9 vs 9');
  assert.equal(bs(['KH', 'QS'], '6D'), 'stand', 'never split tens');
  assert.equal(bs(['AH', 'AS'], '10D'), 'split', 'always split aces');
  assert.equal(bs(['2H', '2S'], '8D'), 'hit', '2-2 vs 8');
  assert.equal(bs(['4H', '4S'], '5D'), 'split', '4-4 vs 5 (DAS)');
  assert.equal(bs(['AH', '2S'], '5D'), 'double', 'A2 vs 5');
  assert.equal(bs(['AH', '2S'], '4D'), 'hit', 'A2 vs 4');
  assert.equal(bs(['AH', '6S'], '3D'), 'double', 'A6 vs 3');
  assert.equal(bs(['AH', '8S'], '6D'), 'stand', 'A8 vs 6 (S17)');
  assert.equal(bs(['3H', '4S', '4D'], '6D'), 'hit', '11 with three cards: double -> hit');
  assert.equal(bs(['AH', '2S', '4D'], '9D'), 'hit', 'soft 17 three cards vs 9');
  assert.equal(chartCode(['AH', '7S'], '4D'), 'Ds');
  assert.equal(hintReason(['10H', '6S'], 'KD'), 'Hard 16 vs 10');
  assert.equal(hintReason(['8H', '8S'], 'AD'), 'Pair of 8s vs A');
  assert.equal(hintReason(['AH', '7S'], '9D'), 'Soft 18 vs 9');
});

test('hand-level result resolver', () => {
  const h = (cards, split = false) => ({ cards, split });
  assert.equal(resolveHand(h(['AS', 'KD']), ['10S', '9D']), 'blackjack');
  assert.equal(resolveHand(h(['AS', 'KD'], true), ['10S', '9D']), 'win');
  assert.equal(resolveHand(h(['AS', 'KD'], true), ['AS', '10D']), 'lose', 'split 21 loses to a dealer blackjack');
  assert.equal(resolveHand(h(['9S', '9D']), ['10S', '8D']), 'push');
});
