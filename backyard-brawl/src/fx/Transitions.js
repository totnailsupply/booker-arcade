// Scene transitions: a quick fade-in when a scene opens. Fading IN (never
// out-then-start) means no transition ever delays a scene change, so the
// Results -> Arena instant replay stays a single frame.

import { FX } from '../core/Constants.js';

/** Fade the scene's main camera in from near-black (FX.SCENE_FADE_MS). */
export function fadeIn(scene, ms = FX.SCENE_FADE_MS) {
  try {
    scene.cameras.main.fadeIn(ms, 14, 10, 6);
  } catch { /* camera not ready: skip the fade */ }
}
