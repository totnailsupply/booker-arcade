import { SAVE, TEST_RESULT } from '../core/MetaConstants.js';
import { SaveData } from '../core/SaveData.js';
import { gameState } from '../core/GameState.js';
import { getLevel } from '../data/levels/index.js';
import { allLevelInfo, levelReward, battleConfigFor } from './MenuKit.js';

// Menu side of render_game_to_text, plus the ?test=1 finish hook.

const MENU_SCENES = ['PauseScene', 'ResultsScene', 'ShopScene', 'LevelSelectScene', 'TitleScene'];

/** { scene, focus, bones, levels, shop, unlocked, modifiers, ...scene extras } or null. */
export function menuSnapshot(game) {
  const key = MENU_SCENES.find(k => game.scene.isActive(k));
  if (!key) return null;
  const scene = game.scene.getScene(key);
  const out = {
    scene: key,
    focus: scene.nav?.focusedName ?? null,
    bones: SaveData.bones(),
    levels: allLevelInfo().map(l => ({
      n: l.n, name: l.name, playable: l.playable, exists: l.exists, cleared: l.cleared, stars: l.stars, bestScore: l.bestScore, reward: l.reward,
    })),
    shop: SaveData.shopRanks(),
    unlocked: SaveData.unlockedUnits(),
    modifiers: SaveData.getModifiers(),
    storage: SaveData.status().storageOk ? 'ok' : 'blocked',
  };
  if (typeof scene.menuState === 'function') Object.assign(out, scene.menuState());
  return out;
}

function testFlag() {
  try {
    const v = new URLSearchParams(window.location.search).get(SAVE.TEST_FLAG);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/**
 * ?test=1 only: window.__TEST_FINISH__(won, stars) ends the current battle (or
 * fakes one for the battle config's level) with a NON-debug result and opens
 * Results, so tests can check saving without playing a whole level.
 */
export function installMenuHooks(game) {
  if (!testFlag()) return;
  window.__TEST_FINISH__ = (won = true, stars = null) => {
    const cfg = gameState.battleConfig || battleConfigFor(1);
    gameState.battleConfig = cfg;
    const n = typeof cfg.levelNumber === 'number' ? cfg.levelNumber : 1;
    const level = getLevel(n);
    const s = Array.isArray(stars) ? stars.map(Boolean) : [!!won, !!won, !!won];
    if (!won) s.fill(false);
    const reward = levelReward(n);
    const result = {
      levelNumber: n,
      levelId: level.id,
      levelName: level.name,
      won: !!won,
      outcome: won ? 'won' : 'lost',
      score: won ? TEST_RESULT.WIN_SCORE : TEST_RESULT.LOSS_SCORE,
      wave: won ? level.waves.length : Math.ceil(level.waves.length / 2),
      wavesTotal: level.waves.length,
      kills: won ? TEST_RESULT.WIN_KILLS : TEST_RESULT.LOSS_KILLS,
      scootersUsed: s[1] ? 0 : 1,
      unitsLost: s[2] ? 0 : 1,
      timeS: 1,
      seed: cfg.seed ?? 0,
      debug: false,
      stars: s,
      unlocks: won && reward && !SaveData.isUnitUnlocked(reward) ? [reward] : [],
      test: true,
    };
    gameState.result = result;
    for (const k of ['PauseScene', 'BattleScene', 'ResultsScene', 'TitleScene', 'LevelSelectScene', 'ShopScene']) {
      if (game.scene.isActive(k) || game.scene.isPaused(k)) game.scene.stop(k);
    }
    game.scene.start('ResultsScene', { result });
    return result;
  };
}
