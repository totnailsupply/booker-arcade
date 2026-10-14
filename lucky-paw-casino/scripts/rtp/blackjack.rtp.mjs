// Blackjack RTP: a basic-strategy bot plays flat bets through the SAME logic
// module the scene uses (src/games/blackjack/logic.js + strategy.js).
// RTP = total returned / total staked (doubles and split stakes included),
// which is how the wallet books it. The note also gives the house edge per
// initial bet (the figure usually quoted, ~0.5 % for these rules).
//
//   node scripts/rtp-check.mjs --only blackjack
//   node scripts/rtp/blackjack.rtp.mjs [rounds]
import { Rng } from '../../src/core/Rng.js';
import { Shoe, Round } from '../../src/games/blackjack/logic.js';
import { basicStrategy } from '../../src/games/blackjack/strategy.js';

export function simulate(rounds = 400000, seed = 'bj-rtp') {
  const rng = new Rng(seed);
  const shoe = new Shoe(rng);
  const BET = 2; // even, so a 3:2 blackjack pays a whole 5
  let wagered = 0;
  let paid = 0;
  let initial = 0;
  let sumSq = 0;
  for (let i = 0; i < rounds; i++) {
    if (shoe.needsShuffle()) shoe.shuffle();
    const r = new Round(shoe, BET);
    r.start();
    while (r.phase === 'player') {
      const legal = r.legal();
      const move = basicStrategy(r.hand.cards, r.upcard, { canDouble: legal.double, canSplit: legal.split });
      r.act(move);
    }
    wagered += r.wagered;
    paid += r.paid;
    initial += BET;
    const net = (r.paid - r.wagered) / BET;
    sumSq += net * net;
  }
  const edge = (wagered - paid) / initial;
  const sd = Math.sqrt(sumSq / rounds);
  return { rounds, wagered, paid, rtp: paid / wagered, edge, se: sd / Math.sqrt(rounds) };
}

export default async function () {
  const N = 2000000;
  const s = simulate(N);
  return {
    game: 'blackjack',
    label: 'basic strategy',
    rtp: s.rtp,
    band: [0.985, 1.005],
    method: `sim ${N}`,
    note: `edge ${(s.edge * 100).toFixed(2)}% of initial bet (±${(s.se * 100).toFixed(2)}%)`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2]) || 400000;
  const t0 = Date.now();
  console.log(simulate(n), `${Date.now() - t0} ms`);
}
