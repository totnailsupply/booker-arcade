import Phaser from 'phaser';
import { GAME, COLORS } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { TitleScene } from '../scenes/TitleScene.js';
import { ClimbScene } from '../scenes/ClimbScene.js';
import { PauseScene } from '../scenes/PauseScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { prepareGL } from './GLGuard.js';

// Portrait 270x480, pixel art, scaled to fit. No physics plugin: Soba's
// movement and the one-way landings are kinematic (core/Kinematics.js).
export const GameConfig = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: COLORS.PAGE_BG,
  pixelArt: true,
  roundPixels: true,
  render: {
    preserveDrawingBuffer: true,  // Needed for iterate-client screenshots
    // Software GL gets maxTextures 1 + a shader fix for Phaser's texture-id compare (GLGuard.js)
    ...prepareGL(),
  },
  // All sound is our own Web Audio graph (src/audio). Phaser's sound manager
  // would create a second, unused AudioContext at boot, and a throwing
  // AudioContext constructor would crash the boot before our code runs.
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  scene: [BootScene, PreloadScene, TitleScene, ClimbScene, PauseScene, ResultsScene],
};
