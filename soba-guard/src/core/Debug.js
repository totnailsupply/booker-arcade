// Dev-only URL flags (read once).
//   ?skip=1      skip the title, start the level right away
//   ?level=N     level number (1-based); implies skip
//   ?wave=N      start at wave N (no setup phase); implies skip
//   ?coins=N     starting coins; implies skip
//   ?seed=N      RNG seed (default: DEBUG.SEED on debug starts, random otherwise)
//   ?god=1       enemies that reach the door vanish instead of ending the game
//   ?debug=1     draw the grid, hit boxes and bite reach
//   ?autoplay=1  the 'smart' bot plays (?bot=idle|steamers|cats-steamers|novice|smart
//                picks another); implies skip
// Debug starts never write to the save (Step 2).

import { DEBUG } from './Constants.js';

let cached = null;

export function getDebugOptions() {
  if (cached) return cached;
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = new URLSearchParams();
  }
  const flag = (k) => params.get(k) === '1' || params.get(k) === 'true';
  const int = (k, min, max) => {
    const n = parseInt(params.get(k), 10);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
  };

  const level = int('level', 1, DEBUG.MAX_WAVE);
  const wave = int('wave', 1, DEBUG.MAX_WAVE);
  const coins = int('coins', 0, DEBUG.MAX_COINS);
  const seedRaw = parseInt(params.get('seed'), 10);
  const seed = Number.isFinite(seedRaw) ? (seedRaw >>> 0) : null;
  const autoplay = flag('autoplay');
  const bot = params.get('bot') || (autoplay ? 'smart' : null);
  const god = flag('god');
  const skip = flag('skip') || level !== null || wave !== null || coins !== null || autoplay;

  cached = {
    skip,
    level,
    wave,
    coins,
    seed,
    god,
    hitboxes: flag('debug'),
    autoplay,
    bot,
    // Any of these makes it a debug run (fixed seed, never saved)
    debugRun: skip || god || seed !== null,
  };
  return cached;
}
