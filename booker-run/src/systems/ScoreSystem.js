import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { SCORE } from '../core/Constants.js';

// Score = floor(distance / 10) + 10 per bone during the run.
// On completion: + FINISH_BONUS + time bonus (faster = more, max 300).
export class ScoreSystem {
  constructor() {
    this.onDistance = this.onDistance.bind(this);
    this.onBone = this.onBone.bind(this);
    eventBus.on(Events.DISTANCE_CHANGED, this.onDistance);
    eventBus.on(Events.BONE_COLLECTED, this.onBone);
  }

  runningScore() {
    return Math.floor(gameState.distance / SCORE.DISTANCE_DIVISOR) + gameState.bones * SCORE.BONE;
  }

  recompute() {
    const score = this.runningScore();
    if (score !== gameState.score) {
      gameState.score = score;
      eventBus.emit(Events.SCORE_CHANGED, { score });
    }
  }

  onDistance() {
    this.recompute();
  }

  onBone() {
    this.recompute();
  }

  /**
   * Time bonus from total play time across all attempts (deaths cost time).
   * Full bonus up to par + grace, then linear down to 0 at ZERO_MULT * par.
   */
  static timeBonus(totalSeconds, parSeconds) {
    const full = parSeconds + SCORE.TIME_BONUS_GRACE_S;
    const zero = parSeconds * SCORE.TIME_BONUS_ZERO_MULT;
    if (totalSeconds <= full) return SCORE.TIME_BONUS_MAX;
    if (totalSeconds >= zero) return 0;
    return Math.round(SCORE.TIME_BONUS_MAX * (1 - (totalSeconds - full) / (zero - full)));
  }

  static stars(bones, total) {
    if (total > 0 && bones >= total) return 3;
    if (total > 0 && bones / total >= SCORE.STARS_TWO_RATIO) return 2;
    return 1;
  }

  /** Final breakdown on reaching the steak. */
  finalize(parSeconds) {
    const distancePts = Math.floor(gameState.distance / SCORE.DISTANCE_DIVISOR);
    const bonePts = gameState.bones * SCORE.BONE;
    const totalSeconds = gameState.totalTimeMs / 1000;
    const timePts = ScoreSystem.timeBonus(totalSeconds, parSeconds);
    const score = distancePts + bonePts + SCORE.FINISH_BONUS + timePts;
    gameState.score = score;
    eventBus.emit(Events.SCORE_CHANGED, { score });
    return {
      score,
      distancePts,
      bonePts,
      finishPts: SCORE.FINISH_BONUS,
      timePts,
      totalSeconds,
      parSeconds,
      bones: gameState.bones,
      bonesTotal: gameState.bonesTotal,
      stars: ScoreSystem.stars(gameState.bones, gameState.bonesTotal),
      attempts: gameState.attempts,
    };
  }

  destroy() {
    eventBus.off(Events.DISTANCE_CHANGED, this.onDistance);
    eventBus.off(Events.BONE_COLLECTED, this.onBone);
  }
}
