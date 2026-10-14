// Slots RTP: exact base-game line math, exact full game (free spins via Wald's
// identity over the capped retrigger chain), and a Monte Carlo of the full game.
//   node scripts/rtp-check.mjs --only slots
//   SLOTS_SIM=500000 node scripts/rtp-check.mjs --only slots   (quicker)
import { Rng } from '../../src/core/Rng.js';
import {
  exactLineEV, scatterDistribution, playRound,
} from '../../src/games/slots/logic.js';
import { SCATTER_PAYS, FREE_SPINS_AWARD, FREE_SPINS_CAP, FREE_SPIN_MULT } from '../../src/games/slots/config.js';

/** Expected number of free spins played from one trigger (retriggers, capped awards). */
export function expectedFreeSpins(pTrigger) {
  const memo = new Map();
  const E = (left, aw) => {
    if (left <= 0) return 0;
    const key = `${left},${aw}`;
    if (memo.has(key)) return memo.get(key);
    const a = Math.max(0, Math.min(FREE_SPINS_AWARD, FREE_SPINS_CAP - aw));
    const v = 1 + pTrigger * E(left - 1 + a, aw + a) + (1 - pTrigger) * E(left - 1, aw);
    memo.set(key, v);
    return v;
  };
  return E(FREE_SPINS_AWARD, FREE_SPINS_AWARD);
}

export function exactSlots() {
  const { ev: lineRtp, pHit } = exactLineEV();
  const sd = scatterDistribution();
  const scatterRtp = [3, 4, 5].reduce((a, n) => a + (sd[n] || 0) * SCATTER_PAYS[n], 0);
  const pBonus = [3, 4, 5].reduce((a, n) => a + (sd[n] || 0), 0);
  const perSpin = lineRtp + scatterRtp;            // in total bets
  const nFree = expectedFreeSpins(pBonus);
  const bonusRtp = pBonus * nFree * FREE_SPIN_MULT * perSpin;
  return { lineRtp, pLineHit: pHit, scatterRtp, pBonus, nFree, bonusRtp, rtp: perSpin + bonusRtp };
}

export default async function slotsRtp() {
  const ex = exactSlots();
  const N = Number(process.env.SLOTS_SIM) || 8_000_000;
  const rng = new Rng('slots-rtp');
  let wagered = 0, paid = 0, hits = 0, bonuses = 0, fsPlayed = 0, sumSq = 0;
  for (let i = 0; i < N; i++) {
    const r = playRound(rng, 1);
    wagered += r.wagered;
    paid += r.win;
    sumSq += (r.win / r.wagered) ** 2;
    if (r.hit) hits++;
    if (r.triggered) { bonuses++; fsPlayed += r.freeSpinsPlayed; }
  }
  const rtp = paid / wagered;
  const se = Math.sqrt(Math.max(0, sumSq / N - rtp * rtp) / N);
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  return [
    {
      game: 'slots', label: 'base lines (exact)', rtp: ex.lineRtp, band: [0.8, 0.92], method: 'exact',
      note: `line hit ${pct(ex.pLineHit)}; scatter pays ${pct(ex.scatterRtp)}`,
    },
    {
      game: 'slots', label: 'full game (exact)', rtp: ex.rtp, band: [0.95, 0.97], method: 'exact',
      note: `bonus 1 in ${(1 / ex.pBonus).toFixed(1)}, ${ex.nFree.toFixed(3)} free spins per bonus, bonus adds ${pct(ex.bonusRtp)}`,
    },
    {
      game: 'slots', label: 'full game', rtp, band: [0.95, 0.97], method: `sim ${N}`,
      note: `±${pct(se)} (1 se); hit rate ${pct(hits / N)}; bonus 1 in ${(N / Math.max(1, bonuses)).toFixed(1)}; avg ${(fsPlayed / Math.max(1, bonuses)).toFixed(2)} free spins`,
    },
  ];
}
