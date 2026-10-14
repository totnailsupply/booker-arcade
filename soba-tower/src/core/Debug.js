// Dev-only URL flags.
//   ?autoplay=1     the AutoClimber bot steers (QA proof that the level is climbable)
//   ?y=<px>         start at this height (px above the street) on a cushion
//   ?zone=N         start at zone N's respawn point (1-based)
//   ?lives=N        starting lives (e.g. ?lives=1 for a quick game over, ?lives=99)
//   ?debug=1        draw hitboxes (Soba body + landing box, platform tops)
// autoplay / y / zone skip the title screen; lives and debug don't.

import { LEVEL1 } from '../levels/level1.js';
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

  const autoplay = flag('autoplay');
  const hitboxes = flag('debug');

  let startHeight = null;
  let startZone = null;
  const z = parseInt(params.get('zone'), 10);
  if (Number.isFinite(z)) {
    startZone = Math.max(1, Math.min(LEVEL1.zones.length, z));
    startHeight = LEVEL1.zones[startZone - 1].respawn.y;
  }
  const y = parseFloat(params.get('y'));
  if (Number.isFinite(y)) {
    startHeight = Math.max(0, Math.min(y, LEVEL1.finish.y - DEBUG.MIN_ROOF_GAP));
    startZone = null;
  }

  const l = parseInt(params.get('lives'), 10);
  const lives = Number.isFinite(l) && l > 0 ? Math.min(l, DEBUG.MAX_LIVES) : null;

  cached = {
    autoplay,
    hitboxes,
    startHeight,
    startZone,
    lives,
    skipTitle: autoplay || startHeight !== null,
  };
  return cached;
}
