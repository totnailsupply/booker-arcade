// Plinko RTP: exact binomial expectation per risk level (no simulation needed).
import { RISKS, RISK_LABELS, exactRtp } from '../../src/games/plinko/logic.js';

export default function plinkoRtp() {
  return RISKS.map((risk) => {
    const { num, den, rtp } = exactRtp(risk);
    return {
      game: 'plinko',
      label: RISK_LABELS[risk],
      rtp,
      band: [0.985, 0.995],
      method: 'exact',
      note: `${num}/${den}`,
    };
  });
}
