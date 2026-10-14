import Phaser from 'phaser';
import { GAME, COLORS } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { TitleScene } from '../scenes/TitleScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { LevelSelectScene } from '../scenes/LevelSelectScene.js';
import { ShopScene } from '../scenes/ShopScene.js';
import { PauseScene } from '../scenes/PauseScene.js';
import { prepareGL } from './GLGuard.js';

// 640x360 pixel art, scaled to fit. No physics: all rules live in src/sim.
export const GameConfig = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: COLORS.PAGE_BG,
  pixelArt: true,
  roundPixels: true,
  render: {
    preserveDrawingBuffer: true,  // iterate-client screenshots read the canvas
    // Software GL gets maxTextures 1 + a shader fix for Phaser's texture-id compare (GLGuard.js)
    ...prepareGL(),
  },
  // Sound will be our own Web Audio graph (src/audio, Step 3). Phaser's sound
  // manager would create a second AudioContext at boot.
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  // PauseScene comes after BattleScene so it draws on top of it.
  scene: [BootScene, PreloadScene, TitleScene, LevelSelectScene, ShopScene, BattleScene, PauseScene, ResultsScene],
};
