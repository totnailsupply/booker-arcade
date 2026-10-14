// Dev-only URL flags. Any of them makes the run a "debug run": it never
// writes the save (high scores, stats, mute).
//   ?seed=N       fixed RNG seed (same run every time with the same input)
//   ?wave=N       start at wave N (1..10); skips the title
//   ?god=1        Booker takes no damage
//   ?hp=N         starting max HP (e.g. ?hp=3 for a quick game over)
//   ?autoplay=1   the smart bot drives Booker and picks cards; skips the title
//   ?bot=kite     which bot ?autoplay uses (idle | kite | smart, default smart)
//   ?debug=1      draw hit circles and pickup radius
//   ?weapons=a,b  starting weapons (Step 2)
//   ?speed=N      the Arena runs N fixed steps per 1/60 s of real time (1..16).
//                 Same steps, same bot inputs: outcomes don't change (realtime-check)

import { DEBUG, WAVES } from './Constants.js';

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
  const int = (k) => {
    const v = parseInt(params.get(k), 10);
    return Number.isFinite(v) ? v : null;
  };

  const seed = int('seed');
  const waveRaw = int('wave');
  const wave = waveRaw === null ? null : Math.max(1, Math.min(Math.min(DEBUG.MAX_WAVE, WAVES.COUNT), waveRaw));
  const hpRaw = int('hp');
  const hp = hpRaw === null || hpRaw < 1 ? null : Math.min(DEBUG.MAX_HP, hpRaw);
  const speedRaw = int('speed');
  const speed = speedRaw === null || speedRaw < 1 ? 1 : Math.min(DEBUG.MAX_SPEED, speedRaw);
  const weapons = params.get('weapons') ? params.get('weapons').split(',').map(s => s.trim()).filter(Boolean) : null;

  cached = {
    seed: seed === null ? null : seed >>> 0,
    wave,
    god: flag('god'),
    hp,
    autoplay: flag('autoplay'),
    bot: params.get('bot') || 'smart',
    hitboxes: flag('debug'),
    weapons,
    speed,
  };
  cached.isDebugRun = cached.seed !== null || wave !== null || cached.god || hp !== null
    || cached.autoplay || cached.hitboxes || !!weapons || speed !== 1;
  cached.skipTitle = cached.autoplay || wave !== null;
  return cached;
}
