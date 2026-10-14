// KitScene — an empty table for testing the shared UI kit (scripts/checks/kit-check.mjs).
// Not reachable from the lobby; open it with window.__CASINO__.goto('Kit').
// Wallet/stat id is 'kit' (it never shows in the Stats table).

import { BaseGameScene } from '../games/BaseGameScene.js';
import { COLORS } from '../core/Constants.js';

export class KitScene extends BaseGameScene {
  constructor() {
    super('Kit', {
      id: 'kit', title: 'UI Kit', accent: COLORS.BRASS, music: 'lobby', booker: 'booker-dealer',
      rules: { lines: ['A sandbox for the shared UI kit.'], payouts: [['Test', '1:1']] },
    });
  }
}
