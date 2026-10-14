import { DEBUG } from './Constants.js';
import { getDebugOptions } from './Debug.js';

// =============================================================================
// BattleConfig — what a battle starts with.
//
// CONTRACT (menus / Treat Shop / save build on this; keep it stable):
//
//   makeBattleConfig({ levelNumber, modifiers, cards })  -> config
//   scene.start('BattleScene', { config })
//
//   levelNumber  1-based level (default: ?level= or 1)
//   modifiers    Treat Shop bonuses, every field optional, all default 0:
//                  startCoins         +N coins at the start
//                  barkCooldownS      -N s Bark cooldown (never below SOBA.BARK_MIN_COOLDOWN)
//                  dumplingDamagePct  +N % dumpling damage
//                  catRatePct         +N % faster Lucky Cats (interval / (1 + N/100))
//   cards        unit keys available at the start (default: the level's
//                `cards`). The level's mid-battle unlocks (e.g. Onigiri after
//                wave 3) still join later; duplicates are ignored.
//
// The returned config also carries seed, startWave, startCoins, god, bot and
// debugRun (URL debug flags, core/Debug.js). Debug starts (?skip, ?wave, ...)
// use a fixed seed so every run and every Retry is identical; normal play
// rolls a new seed. Battle.result().debug is true for debug runs: never save them.
//
// Old call style makeBattleConfig(levelNumber) still works.
// =============================================================================

export const DEFAULT_MODIFIERS = Object.freeze({
  startCoins: 0,
  barkCooldownS: 0,
  dumplingDamagePct: 0,
  catRatePct: 0,
});

function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function makeBattleConfig(overrides = {}) {
  const o = typeof overrides === 'number' ? { levelNumber: overrides } : (overrides || {});
  const d = getDebugOptions();
  const modifiers = { ...DEFAULT_MODIFIERS };
  for (const k of Object.keys(DEFAULT_MODIFIERS)) {
    const v = Number(o.modifiers?.[k]);
    if (Number.isFinite(v)) modifiers[k] = v;
  }
  return {
    levelNumber: o.levelNumber ?? d.level ?? 1,
    seed: o.seed ?? d.seed ?? (d.debugRun ? DEBUG.SEED : randomSeed()),
    startWave: d.wave ?? 1,
    startCoins: d.coins,
    god: d.god,
    bot: d.bot,
    debugRun: d.debugRun,
    modifiers,
    cards: Array.isArray(o.cards) && o.cards.length ? [...o.cards] : null,
  };
}

/** Config for Retry: same level, modifiers and cards; a new seed unless it's a debug run. */
export function retryConfig(prev) {
  if (!prev) return makeBattleConfig();
  return prev.debugRun ? { ...prev } : { ...prev, seed: randomSeed() };
}
