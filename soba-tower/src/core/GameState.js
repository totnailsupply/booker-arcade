import { HighScore, loadMuted } from './HighScore.js';
import { LIVES } from './Constants.js';
import { getDebugOptions } from './Debug.js';

export const LEVEL_ID = 'level1';

// Modes reported by render_game_to_text()
export const MODES = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESPAWNING: 'respawning',
  GAME_OVER: 'game_over',
  COMPLETE: 'complete',
};

class GameState {
  constructor() {
    this.isMuted = loadMuted();
    this.attempts = 0;
    this.reset();
  }

  /** Back to the title: the attempt counter starts over too. */
  newSession() {
    this.attempts = 0;
    this.reset();
  }

  /**
   * Clean slate for one run of Level 1. Called by the title, by "retry" on the
   * Results screen and by ClimbScene.create (via beginRun). Everything a run
   * touches is reset here, so N restarts in a row behave identically.
   */
  reset() {
    this.levelId = LEVEL_ID;
    this.mode = MODES.TITLE;
    this.lives = getDebugOptions().lives ?? LIVES.START;
    this.livesStart = this.lives;  // reported in the result (e.g. 1 under ?lives=1)
    this.livesLost = 0;
    this.zone = 1;              // zone Soba is in (by height)
    this.checkpointZone = 1;    // respawn zone (highest gate reached)
    this.heightM = 0;           // current feet height
    this.maxHeightM = 0;        // highest surface landed on this run
    this.progress = 0;          // maxHeight / finish height, 0..1
    this.score = 0;
    this.treats = 0;
    this.treatsTotal = 0;
    this.stomps = 0;
    this.runTimeMs = 0;         // time in the climb (pauses excluded)
    this.result = null;         // set on game over / level complete
    const best = HighScore.get(LEVEL_ID);
    this.bestScore = best.score;
    this.bestHeightM = best.height;
  }

  /** Starts a run: reset + count the attempt. */
  beginRun() {
    this.reset();
    this.attempts += 1;
    this.mode = MODES.PLAYING;
  }
}

export const gameState = new GameState();
