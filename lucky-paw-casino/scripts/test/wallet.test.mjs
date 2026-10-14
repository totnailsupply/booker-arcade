import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, dateKey, tierForXp } from '../../src/core/Wallet.js';
import { Events } from '../../src/core/EventBus.js';
import { ECONOMY, VIP_TIERS } from '../../src/core/Constants.js';
import { Rng } from '../../src/core/Rng.js';

function make(opts = {}) {
  const events = [];
  let saves = 0;
  const w = new Wallet({ emit: (e, d) => events.push([e, d]), persist: () => { saves++; }, ...opts });
  return { w, events, saves: () => saves };
}
const balanced = (w) => assert.equal(w.conservationError(), 0, `books off by ${w.conservationError()}`);

test('starts at 1000, Puppy, max bet 100', () => {
  const { w } = make();
  assert.equal(w.balance, ECONOMY.START_BALANCE);
  assert.equal(w.vip().name, 'Puppy');
  assert.equal(w.maxBet(), 100);
  balanced(w);
});

test('bet / pay / settle move chips and stats', () => {
  const { w, events } = make();
  assert.equal(w.bet('roulette', 10), true);
  assert.equal(w.balance, 990);
  assert.equal(w.inPlay('roulette'), 10);
  assert.equal(w.xp, 10);
  w.pay('roulette', 20);
  const r = w.settleRound('roulette', { wagered: 10, paid: 20 });
  assert.equal(r.outcome, 'win');
  assert.equal(r.net, 10);
  assert.equal(w.balance, 1010);
  assert.equal(w.inPlay(), 0);
  const g = w.gameSummary('roulette');
  assert.deepEqual([g.rounds, g.wagered, g.won, g.net, g.biggestWin, g.streak], [1, 10, 20, 10, 10, 1]);
  assert.ok(events.some(([e]) => e === Events.ROUND_SETTLED));
  assert.ok(events.some(([e, d]) => e === Events.BALANCE_CHANGED && d.delta === -10 && d.reason === 'bet'));
  balanced(w);
});

test('bet refuses more than the balance and non-positive amounts', () => {
  const { w } = make();
  assert.equal(w.bet('slots', 0), false);
  assert.equal(w.bet('slots', -5), false);
  assert.equal(w.bet('slots', 1001), false);
  assert.equal(w.balance, 1000);
  balanced(w);
});

test('canBet / whyNot check balance and the VIP limit', () => {
  const { w } = make();
  assert.equal(w.canBet(100), true);
  assert.equal(w.canBet(101), false);
  assert.equal(w.whyNot(60, 50), 'Max bet is 100');
  assert.equal(w.whyNot(0), 'Pick a chip first');
  w.setBalance(5);
  assert.equal(w.whyNot(25), 'Not enough chips');
  balanced(w);
});

test('refund undoes bet, xp and in-play; clamps to what is in play', () => {
  const { w } = make();
  w.bet('craps', 25);
  w.bet('craps', 5);
  assert.equal(w.refund('craps', 100), 30);
  assert.equal(w.balance, 1000);
  assert.equal(w.xp, 0);
  assert.equal(w.inPlay(), 0);
  assert.equal(w.gameSummary('craps').wagered, 0);
  assert.equal(w.refund('craps', 5), 0);
  balanced(w);
});

test('win streak: win extends, push keeps, loss resets; big win event at 10x', () => {
  const { w, events } = make();
  const round = (bet, paid) => { w.bet('plinko', bet); w.pay('plinko', paid); return w.settleRound('plinko', { wagered: bet, paid }); };
  round(10, 20); round(10, 30); round(10, 10);
  assert.equal(w.gameSummary('plinko').streak, 2);
  round(10, 0);
  assert.equal(w.gameSummary('plinko').streak, 0);
  assert.equal(w.gameSummary('plinko').bestStreak, 2);
  const big = round(1, 10);
  assert.equal(big.big, true);
  assert.equal(big.mega, false);
  assert.ok(events.some(([e, d]) => e === Events.BIG_WIN && d.x === 10));
  const mega = round(1, 170);
  assert.equal(mega.mega, true);
  assert.equal(w.summary().biggestWin.amount, 169);
  balanced(w);
});

test('VIP tiers: thresholds, one-time gifts, max bet', () => {
  assert.equal(tierForXp(0), 0);
  assert.equal(tierForXp(2499), 0);
  assert.equal(tierForXp(2500), 1);
  assert.equal(tierForXp(150000), 4);
  const { w, events } = make();
  w.setBalance(1_000_000);
  // Wager 2,500 -> Good Boy (+250 gift, max 250)
  for (let i = 0; i < 25; i++) { w.bet('slots', 100); w.settleRound('slots', { wagered: 100, paid: 0 }); }
  assert.equal(w.vip().name, 'Good Boy');
  assert.equal(w.maxBet(), 250);
  const ups = events.filter(([e]) => e === Events.VIP_UP);
  assert.equal(ups.length, 1);
  assert.equal(ups[0][1].gift, 250);
  // Jump straight to Golden Paw: every skipped tier's gift paid once
  w.addXpDebug(200000);
  assert.equal(w.vip().name, 'Golden Paw');
  assert.equal(w.maxBet(), 2500);
  assert.equal(w.vip().next, null);
  assert.equal(w.vip().progress, 1);
  const gifts = w.log.filter(l => l.kind === 'gift').map(l => l.amount);
  assert.deepEqual(gifts, [250, 1000, 4000, 15000]);
  // No repeat gifts
  w.addXpDebug(10);
  assert.equal(w.log.filter(l => l.kind === 'gift').length, 4);
  assert.equal(w.summary().gifts, 4);
  balanced(w);
});

test('tier never drops after a refund across a threshold', () => {
  const { w } = make();
  w.setBalance(10000);
  w.addXpDebug(2490);
  w.bet('roulette', 20);
  assert.equal(w.vip().name, 'Good Boy');
  w.refund('roulette', 20);
  assert.equal(w.vip().name, 'Good Boy');
  balanced(w);
});

test('bailout: only under 10 chips with nothing in play', () => {
  const { w, events } = make();
  assert.equal(w.bailoutAvailable(), false);
  assert.equal(w.takeBailout(), 0);
  w.setBalance(9);
  w.bet('slots', 5);
  assert.equal(w.bailoutAvailable(), false);
  w.settleRound('slots', { wagered: 5, paid: 0 });
  assert.equal(w.bailoutAvailable(), true);
  assert.equal(w.takeBailout(), 500);
  assert.equal(w.balance, 504);
  assert.equal(w.summary().bailouts, 1);
  assert.ok(events.some(([e]) => e === Events.BAILOUT));
  assert.equal(w.bailoutAvailable(), false);
  balanced(w);
});

test('daily: once per calendar day', () => {
  let now = new Date(2026, 9, 14, 9, 0).getTime();
  const { w } = make({ now: () => now });
  assert.equal(w.dailyAvailable(), true);
  assert.equal(w.claimDaily(), 250);
  assert.equal(w.dailyAvailable(), false);
  now += 10 * 3600e3; // 19:00 same day
  assert.equal(w.claimDaily(), 0);
  now += 6 * 3600e3;  // 01:00 next day
  assert.equal(dateKey(now), '2026-10-15');
  assert.equal(w.claimDaily(), 250);
  assert.equal(w.summary().dailies, 2);
  balanced(w);
});

test('save round-trip keeps everything; in-play chips are refunded on load', () => {
  const { w } = make();
  w.bet('blackjack', 50); w.pay('blackjack', 100); w.settleRound('blackjack', { wagered: 50, paid: 100 });
  w.claimDaily(Date.now());
  w.bet('roulette', 30); // left on the table when the tab closed
  const data = JSON.parse(JSON.stringify(w.toJSON()));
  const { w: w2 } = make({ state: data });
  assert.equal(w2.balance, w.balance + 30);
  assert.equal(w2.inPlay(), 0);
  assert.equal(w2.xp, 50);
  assert.equal(w2.gameSummary('blackjack').won, 100);
  assert.equal(w2.dailyAvailable(Date.now()), false);
  balanced(w2);
});

test('load tolerates garbage', () => {
  for (const junk of [null, 42, 'x', { balance: 'abc' }, { stats: 5 }, { balance: 77 }]) {
    const { w } = make({ state: junk });
    assert.ok(Number.isFinite(w.balance));
    balanced(w);
  }
});

test('reset returns to a new player', () => {
  const { w, events } = make();
  w.bet('slots', 100); w.settleRound('slots', { wagered: 100, paid: 0 });
  w.reset();
  assert.equal(w.balance, 1000);
  assert.equal(w.xp, 0);
  assert.equal(w.summary().rounds, 0);
  assert.ok(events.some(([e]) => e === Events.WALLET_RESET));
  balanced(w);
});

test('conservation holds through 5,000 random operations', () => {
  const r = new Rng(123);
  const { w } = make({ now: () => 0 });
  const games = ['plinko', 'blackjack', 'craps', 'roulette', 'slots'];
  let now = 0;
  for (let i = 0; i < 5000; i++) {
    const g = r.pick(games);
    const op = r.int(10);
    if (op < 5) {
      const n = 1 + r.int(Math.max(1, Math.min(w.balance, 200)));
      if (w.bet(g, n)) {
        const paid = r.pick([0, 0, n, 2 * n, 3 * n, Math.floor(n * 1.5), 36 * n]);
        w.pay(g, paid);
        w.settleRound(g, { wagered: n, paid });
      }
    } else if (op < 7) {
      if (w.bet(g, 1 + r.int(20))) w.refund(g, r.int(25));
    } else if (op === 7) {
      w.takeBailout();
    } else if (op === 8) {
      now += 86400e3;
      w.claimDaily(now);
    } else {
      w.forfeit(g);
    }
    assert.ok(w.balance >= 0);
  }
  balanced(w);
  const s = w.summary();
  assert.equal(s.net, s.won - s.wagered);
});
