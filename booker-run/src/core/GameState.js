import { loadMuted } from './HighScore.js';
import { SaveData } from './SaveData.js';

export const DEFAULT_LEVEL_ID = 'level1';

// Modes reported by render_game_to_text()
export const MODES = {
  TITLE: 'title',
  LEVEL_SELECT: 'levelselect',
  PLAYING: 'playing',
  DYING: 'dying',
  GAMEOVER: 'gameover',     // death overlay up; retries automatically
  PAUSED: 'paused',
  COMPLETE: 'complete',
  INTRO: 'intro',           // ability intro card up at the start of a run; the run waits
};

class GameState {
  constructor() {
    this.isMuted = loadMuted();
    this.reset();
    this.mode = MODES.TITLE;
  }

  /** Clean slate for a fresh session of a level (menu -> run, next level, replay). */
  reset(levelId = this.levelId || DEFAULT_LEVEL_ID) {
    this.levelId = levelId;
    this.mode = MODES.TITLE;
    this.attempts = 0;
    this.totalTimeMs = 0;        // time spent playing across all attempts (pauses excluded)
    this.result = null;          // set on level complete
    this.deathLog = [];          // [{ attempt, x, cause, progress }] this session
    this.lastDeath = null;
    this.botStats = null;        // ?autoplay bot stats at the finish (QA)
    this.bestScore = SaveData.getLevel(levelId).bestScore;
    this.resetAttempt();
  }

  /** Per-attempt values; called when Run starts (first time and after each death). */
  resetAttempt() {
    this.score = 0;
    this.bones = 0;
    this.bonesTotal = 0;
    this.distance = 0;
    this.progress = 0;
    this.runTimeMs = 0;
    this.speed = 0;
    this.section = 0;
  }

  beginAttempt() {
    this.attempts += 1;
    this.resetAttempt();
    this.mode = MODES.PLAYING;
  }
}

export const gameState = new GameState();
