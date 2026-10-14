import Phaser from 'phaser';
import { GAME } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { TitleScene } from '../scenes/TitleScene.js';
import { ArenaScene } from '../scenes/ArenaScene.js';
import { LevelUpScene } from '../scenes/LevelUpScene.js';
import { PauseScene } from '../scenes/PauseScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { WeaponSelectScene } from '../scenes/WeaponSelectScene.js';
import { KennelScene } from '../scenes/KennelScene.js';
import { ScoresScene } from '../scenes/ScoresScene.js';
import { prepareGL } from './GLGuard.js';

// Landscape 480x270, pixel art, scaled to fit. No physics plugin: all game
// logic is the pure-JS sim in src/sim/ (stepped by ArenaScene).
export const GameConfig = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: GAME.BG,
  pixelArt: true,
  roundPixels: true,
  render: {
    preserveDrawingBuffer: true,  // iterate-client screenshots
    ...prepareGL(),
  },
  // All sound is our own Web Audio graph (src/audio)
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  scene: [
    BootScene, PreloadScene, TitleScene, WeaponSelectScene, KennelScene, ScoresScene,
    ArenaScene, LevelUpScene, PauseScene, ResultsScene,
  ],
};
