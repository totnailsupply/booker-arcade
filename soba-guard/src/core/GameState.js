// Small cross-scene state: the mode render_game_to_text reports, the current
// battle config (so Retry restarts the same thing) and the last result.

export const MODES = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WON: 'won',
  GAME_OVER: 'game_over',
};

class GameState {
  constructor() {
    this.reset();
  }

  /** Clean slate (title screen, before a new battle). */
  reset() {
    this.mode = MODES.TITLE;
    this.battleConfig = null;   // { levelNumber, seed, startWave, startCoins, god, bot }
    this.result = null;         // Battle.result() of the last finished battle
    this.attempts = 0;
  }
}

export const gameState = new GameState();
