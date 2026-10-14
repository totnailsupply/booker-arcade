import { LEVEL1 } from './level1.js';

// Level list, in play order. Level numbers are 1-based.
export const LEVELS = [LEVEL1];

export function getLevel(n) {
  const i = Math.max(1, Math.min(LEVELS.length, Math.floor(n) || 1)) - 1;
  return LEVELS[i];
}
