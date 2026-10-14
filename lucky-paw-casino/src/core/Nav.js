// =============================================================================
// Nav.js — scene changes with a fade.
//
//   goto(this, 'Lobby');           // fade out, then this.scene.start('Lobby')
//   fadeIn(this);                  // call at the end of create()
//   jump(game, 'Roulette');        // immediate (tests / __CASINO__.goto): stops
//                                  // every other casino scene and starts the target
// =============================================================================

import { TIMING } from './Constants.js';
import { eventBus, Events } from './EventBus.js';

export const CASINO_SCENES = ['Lobby', 'Stats', 'Plinko', 'Blackjack', 'Craps', 'Roulette', 'Slots', 'Kit'];

export function fadeIn(scene, ms = TIMING.FADE_MS) {
  scene.cameras.main.fadeIn(ms, 13, 20, 16);
}

export function goto(scene, key, data = {}, ms = TIMING.FADE_MS) {
  if (scene.__leaving) return false;
  scene.__leaving = true;
  scene.input.enabled = false;
  const cam = scene.cameras.main;
  cam.once('camerafadeoutcomplete', () => {
    eventBus.emit(Events.SCENE_CHANGED, { key, from: scene.scene.key });
    scene.scene.start(key, data);
  });
  cam.fadeOut(ms, 13, 20, 16);
  return true;
}

export function jump(game, key, data = {}) {
  for (const k of CASINO_SCENES) {
    if (k !== key && (game.scene.isActive(k) || game.scene.isPaused(k) || game.scene.isSleeping(k))) game.scene.stop(k);
  }
  eventBus.emit(Events.SCENE_CHANGED, { key, from: null });
  if (game.scene.isActive(key)) game.scene.getScene(key).scene.restart(data);
  else game.scene.start(key, data);
}
