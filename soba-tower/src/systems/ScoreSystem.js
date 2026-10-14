import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { SCORE } from '../core/Constants.js';

// Running score = floor(maxHeightM) * 10 + treats * 25 + stomps * 50.
// On completion: + FINISH_BONUS + time bonus (full up to par, 0 at 2x par).
// Par: the level's parS (Level 1: tuned from bot runs, see level1.js), else
// finish height / PAR_PX_PER_S.
// Stars: 1 for finishing, 1 for finishing without losing a life, 1 for
// >= 75% of the treats (30 of 40 in Level 1).
export class ScoreSystem {
  constructor(level) {
    this.parSeconds = level.parS || level.finish.y / SCORE.PAR_PX_PER_S;
    this.onChange = () => this.recompute();
    eventBus.on(Events.HEIGHT_CHANGED, this.onChange);
    eventBus.on(Events.TREAT_COLLECTED, this.onChange);
    eventBus.on(Events.STOMP, this.onChange);
    this.recompute(true);
  }

  static running() {
    return Math.floor(gameState.maxHeightM) * SCORE.PER_METER
      + gameState.treats * SCORE.TREAT
      + gameState.stomps * SCORE.STOMP;
  }

  recompute(force = false) {
    const score = ScoreSystem.running();
    if (force || score !== gameState.score) {
      gameState.score = score;
      eventBus.emit(Events.SCORE_CHANGED, { score });
    }
  }

  static timeBonus(totalSeconds, parSeconds) {
    const zero = parSeconds * SCORE.TIME_BONUS_ZERO_MULT;
    if (totalSeconds <= parSeconds) return SCORE.TIME_BONUS_MAX;
    if (totalSeconds >= zero) return 0;
    return Math.round(SCORE.TIME_BONUS_MAX * (1 - (totalSeconds - parSeconds) / (zero - parSeconds)));
  }

  static stars({ complete, livesLost, treats, treatsTotal }) {
    if (!complete) return 0;
    let stars = 1;
    if (livesLost === 0) stars += 1;
    if (treatsTotal > 0 && treats >= Math.ceil(treatsTotal * SCORE.TREAT_STAR_RATIO)) stars += 1;
    return stars;
  }

  /** Final breakdown for the Results screen. */
  finalize(complete) {
    const heightPts = Math.floor(gameState.maxHeightM) * SCORE.PER_METER;
    const treatPts = gameState.treats * SCORE.TREAT;
    const stompPts = gameState.stomps * SCORE.STOMP;
    const timeS = gameState.runTimeMs / 1000;
    const finishPts = complete ? SCORE.FINISH_BONUS : 0;
    const timePts = complete ? ScoreSystem.timeBonus(timeS, this.parSeconds) : 0;
    const score = heightPts + treatPts + stompPts + finishPts + timePts;
    gameState.score = score;
    eventBus.emit(Events.SCORE_CHANGED, { score });
    return {
      outcome: complete ? 'complete' : 'game_over',
      score,
      heightM: Math.floor(gameState.maxHeightM),
      heightPts,
      treats: gameState.treats,
      treatsTotal: gameState.treatsTotal,
      treatPts,
      stomps: gameState.stomps,
      stompPts,
      finishPts,
      timePts,
      timeS: Math.round(timeS * 10) / 10,
      parS: Math.round(this.parSeconds * 10) / 10,
      livesLost: gameState.livesLost,
      livesLeft: gameState.lives,
      livesStart: gameState.livesStart,
      stars: ScoreSystem.stars({
        complete, livesLost: gameState.livesLost, treats: gameState.treats, treatsTotal: gameState.treatsTotal,
      }),
      attempt: gameState.attempts,
    };
  }

  destroy() {
    eventBus.off(Events.HEIGHT_CHANGED, this.onChange);
    eventBus.off(Events.TREAT_COLLECTED, this.onChange);
    eventBus.off(Events.STOMP, this.onChange);
  }
}
