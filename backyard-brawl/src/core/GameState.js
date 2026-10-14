// Small shared UI state (not game logic: that lives in src/sim/World).
import { SaveData } from './SaveData.js';

export const MODES = {
  TITLE: 'title',
  MENU: 'menu',          // WeaponSelect / Kennel / Scores
  PLAYING: 'playing',
  LEVELUP: 'levelup',
  PAUSED: 'paused',
  WAVE_BREAK: 'wave_break',
  GAME_OVER: 'game_over',
  VICTORY: 'victory',
};

/**
 * The run the Arena starts (shared contract with ArenaScene):
 *   { startWeapon: 'bark'|'ball'|'bone'|'frisbee'|'squeak'|'zoomies',
 *     meta: { hearty, jaws, paws, sniffer, lucky, learner },  // Kennel ranks 0-5
 *     endless: boolean }
 * WeaponSelect builds it; Results "Play again" and Pause "Restart" reuse it.
 */
export function makeRunConfig(startWeapon, endless = false) {
  const save = SaveData.get();
  const weapon = save.unlocks.weapons.includes(startWeapon) ? startWeapon : 'bark';
  return {
    startWeapon: weapon,
    meta: SaveData.kennelRanks(),
    endless: !!endless && save.unlocks.endless,
  };
}

export const gameState = {
  mode: MODES.TITLE,
  isMuted: SaveData.get().muted,
  result: null,        // last run's result (Results scene)
  runs: 0,             // runs started this session
  runConfig: makeRunConfig(SaveData.get().lastWeapon, SaveData.get().lastEndless),

  /** Step 1 name for runConfig.startWeapon (ArenaScene reads / writes it). */
  get lastWeapon() {
    return this.runConfig.startWeapon;
  },
  set lastWeapon(w) {
    if (w && w !== this.runConfig.startWeapon && SaveData.isUnlocked(w)) {
      this.runConfig = { ...this.runConfig, startWeapon: w };
    }
  },

  reset() {
    this.result = null;
  },
};
