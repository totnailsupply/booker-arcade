import Phaser from 'phaser';
import { GAME, JUMP, COLORS } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { TitleScene } from '../scenes/TitleScene.js';
import { RunScene } from '../scenes/RunScene.js';
import { PauseScene } from '../scenes/PauseScene.js';
import { LevelCompleteScene } from '../scenes/LevelCompleteScene.js';
import { LevelSelectScene } from '../scenes/LevelSelectScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';

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
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: JUMP.RISE_GRAVITY },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, TitleScene, LevelSelectScene, RunScene, GameOverScene, PauseScene, LevelCompleteScene],
};
