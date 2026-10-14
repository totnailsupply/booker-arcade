// Roulette RTP: exact, by enumerating all 37 pockets through the rules module.
// Every bet type should return 36/37 = 97.297 %.
import { BETS, POCKETS, settleBets } from '../../src/games/roulette/logic.js';

const BAND = [0.9729, 0.9730];
const GROUPS = [
  ['Straight up (x37)', b => b.kind === 'straight'],
  ['Red', b => b.id === 'red'],
  ['Black', b => b.id === 'black'],
  ['Odd', b => b.id === 'odd'],
  ['Even', b => b.id === 'even'],
  ['1-18', b => b.id === 'low'],
  ['19-36', b => b.id === 'high'],
  ['Dozens (x3)', b => b.kind === 'dozen'],
  ['Columns (x3)', b => b.kind === 'column'],
  ['All 49 bets at once', () => true],
];

export default function rouletteRtp() {
  const out = [];
  for (const [label, pick] of GROUPS) {
    const bets = Object.fromEntries(BETS.filter(pick).map(b => [b.id, 1]));
    let wagered = 0, paid = 0;
    for (let n = 0; n < POCKETS; n++) {
      const r = settleBets(bets, n);
      wagered += r.wagered;
      paid += r.paid;
    }
    out.push({ game: 'roulette', label, rtp: paid / wagered, band: BAND, method: 'exact' });
  }
  return out;
}
