// Blackjack browser check: plays 12 rounds by keys and clicks, always following
// Soba's hint, with stacked shoes for a hit, a double, a split (+ double after
// split), a player blackjack and a dealer blackjack. Every round checks that the
// wallet moved exactly by the scene's settlement (paid - wagered), and that
// the per-hand payouts follow the rules. Also: leaving is refused mid-round,
// allowed between rounds, and an undealt bet is refunded on leave.

export const name = 'Blackjack';

const KEY = { hit: 'h', stand: 's', double: 'd', split: 'p' };
const BTN = { hit: [318, 664], stand: [480, 664], double: [642, 664], split: [804, 664] };
const DEAL = [1152, 664];
const SPOT = [640, 536];
const CHIP5 = [500 - 184 + 32 + 1 * 76, 664];

const payout = (result, bet) => (result === 'blackjack' ? bet + Math.floor(bet * 1.5)
  : result === 'win' ? bet * 2 : result === 'push' ? bet : 0);

export default async function blackjackCheck(page, h) {
  await h.openGame('Blackjack');
  let st = await h.waitFor(s => s.game && s.game.phase === 'betting', 3000);
  h.assert(st.game.shoeRemaining === 312, `fresh shoe has 312 cards (got ${st.game.shoeRemaining})`);
  // The machine running the QA may be loaded (several browsers at once), so the
  // scene's tween and timer clocks run 4x: same code path, a quarter of the frames.
  const speed = (k) => h.evaluate((v) => {
    const sc = window.__GAME__.scene.getScene('Blackjack');
    sc.tweens.timeScale = v;
    sc.time.timeScale = v;
  }, k);
  const force = (cards) => h.evaluate((c) => window.__GAME__.scene.getScene('Blackjack').forceCards(c), cards);

  // --- bet by clicking: 5 chip, two clicks on the circle = 10 ---
  await h.clickAt(...CHIP5);
  const b0 = (await h.readState()).balance;
  await h.clickAt(...SPOT);
  await h.clickAt(...SPOT);
  await h.step(300);
  st = await h.readState();
  h.assert(st.game.bet === 10 && st.balance === b0 - 10, `bet 10 by clicks (bet ${st.game.bet}, balance ${b0} -> ${st.balance})`);

  // --- an undealt bet is refunded when leaving ---
  h.assert(await h.backToLobby(), 'leaving between rounds is allowed');
  st = await h.readState();
  h.assert(st.balance === b0 && st.inPlay === 0, `undealt bet refunded on leave (${b0} -> ${st.balance})`);
  await h.openGame('Blackjack');
  await h.waitFor(s => s.game && s.game.phase === 'betting', 3000);
  await h.clickAt(...CHIP5);
  await h.clickAt(...SPOT);
  await h.clickAt(...SPOT);

  await speed(4);
  // hints on (the ? key)
  await h.pressKey('Slash');
  st = await h.readState();
  h.assert(st.game.hintsOn === true, 'hint toggle on');

  const plan = [
    { cards: ['10H', '9S', '6C', '7D', '4S'], expect: 'hit' },                                    // 16 vs 9: hit
    { cards: ['6H', '10S', '5C', '7D', '9S'], expect: 'double' },                                // 11 vs 10: double
    { cards: ['8H', '6S', '8C', '10D', '3H', '10C', 'KH', '9S'], expect: 'split' },              // 8-8 vs 6: split, DAS
    { cards: ['AH', '9S', 'KC', '7D'], expect: 'blackjack' },                                    // natural, 3:2
    { cards: ['10H', 'AS', '9C', 'KD'], expect: 'dealerBJ' },                                    // dealer peeks, blackjack
  ];
  let doubles = 0, splits = 0, rounds = 0, clicks = 0, sawHintBubble = false;
  let leaveRefused = false;

  for (let r = 0; r < 12; r++) {
    st = await h.waitFor(s => s.game && s.game.phase === 'betting' && !s.game.busy, 12000);
    const pre = st.balance + st.game.bet; // chips already on the circle count as ours
    const p = plan[r];
    if (p) await force(p.cards);
    // round 6: the cut card is out -> Booker reshuffles before dealing
    let shuffles0 = null;
    if (r === 6) {
      shuffles0 = await h.evaluate(() => {
        const sc = window.__GAME__.scene.getScene('Blackjack');
        sc.shoe.pos = 240;
        return sc.shoe.shuffles;
      });
    }
    // deal: Space on even rounds, click the Deal button on odd ones (empty circle = rebet)
    if (r % 2) await h.clickAt(...DEAL); else await h.pressKey('Space');
    st = await h.waitFor(s => s.game.phase !== 'betting' || s.game.busy, 3000);
    if (shuffles0 !== null) {
      st = await h.waitFor(s => s.game.shuffles === shuffles0 + 1, 8000);
      h.assert(st.game.shoeRemaining > 300, `fresh shoe after the reshuffle (${st.game.shoeRemaining} left)`);
    }

    while (true) {
      st = await h.waitFor(s => (s.game.phase === 'player' && !s.game.busy && s.game.legal.hit) || s.game.phase === 'settle', 15000);
      if (st.game.phase === 'settle') break;
      const hint = st.game.hint;
      h.assert(['hit', 'stand', 'double', 'split'].includes(hint), `hint present (${hint})`);
      if (st.game.hintBubble && /Soba says/.test(st.game.hintBubble)) sawHintBubble = true;
      h.assert(st.game.legal[hint], `hint ${hint} is legal`);
      if (p && p.expect && rounds === r && ['hit', 'double', 'split'].includes(p.expect) && !p.done) {
        h.assert(hint === p.expect, `round ${r}: Soba should say ${p.expect}, said ${hint}`);
        p.done = true;
      }
      // mid-round: Esc must be refused (once)
      if (!leaveRefused) {
        const left = await h.backToLobby();
        h.assert(!left, 'leaving mid-round is refused');
        st = await h.readState();
        h.assert(st.scene === 'Blackjack' && st.game.phase === 'player', 'still at the table after a refused leave');
        leaveRefused = true;
      }
      if (hint === 'double') doubles++;
      if (hint === 'split') splits++;
      if (r % 3 === 1) { await h.clickAt(...BTN[hint]); clicks++; } else await h.pressKey(KEY[hint]);
      await h.step(50);
    }
    // --- settlement: wallet delta == scene settlement == rules ---
    const g = st.game;
    const wagered = g.hands.reduce((n, x) => n + x.bet, 0);
    const paid = g.hands.reduce((n, x) => n + payout(x.result, x.bet), 0);
    h.assert(g.last && g.last.wagered === wagered && g.last.paid === paid,
      `round ${r}: booked ${JSON.stringify(g.last)} vs hands wagered ${wagered} paid ${paid}`);
    h.assert(st.balance === pre - wagered + paid, `round ${r}: balance ${st.balance} != ${pre} - ${wagered} + ${paid}`);
    h.assert(!g.dealer.cards.includes('??'), 'hole card revealed at settlement');
    if (p?.expect === 'blackjack') {
      h.assert(g.hands[0].result === 'blackjack' && paid === 25, `blackjack pays 3:2 (paid ${paid})`);
      st = await h.waitFor(s => s.game.banner !== null, 2000);
    }
    if (p?.expect === 'dealerBJ') h.assert(g.hands[0].result === 'lose' && wagered === 10, 'dealer blackjack takes only the original bet');
    if (p?.expect === 'split') {
      h.assert(g.hands.length === 2 && g.hands[0].doubled && wagered === 30 && paid === 60, `split + DAS settled (${wagered} -> ${paid})`);
    }
    if (p?.expect === 'double') h.assert(g.hands[0].doubled && wagered === 20, 'double stakes 20');
    // can't leave while the result is on the table, can between rounds
    rounds++;
    h.log(`round ${r}: ${g.hands.map(x => `${x.cards.join(' ')}=${x.total} ${x.result}`).join(' | ')} vs ${g.dealer.cards.join(' ')}=${g.dealer.total}; wagered ${wagered} paid ${paid}`);
  }
  st = await h.waitFor(s => s.game.phase === 'betting' && !s.game.busy, 12000);
  h.assert(rounds >= 10, `played ${rounds} rounds`);
  h.assert(doubles >= 2 && splits >= 1, `double (${doubles}) and split (${splits}) were played`);
  h.assert(clicks >= 2, 'some decisions were made by clicking buttons');
  h.assert(sawHintBubble, "Soba's hint bubble was shown");
  h.assert(st.game.agreed.agreed === st.game.agreed.decisions && st.game.agreed.decisions > 0,
    `Soba agreed with every decision (${st.game.agreed.agreed}/${st.game.agreed.decisions})`);
  h.assert(st.game.rounds >= 12, `scene booked ${st.game.rounds} rounds`);
  h.assert(st.inPlay === 0, 'nothing in play between rounds');
  await speed(1);
  h.assert(await h.backToLobby(), 'leaving between rounds is allowed');
}
