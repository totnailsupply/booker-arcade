import Phaser from 'phaser';
import { GAME, COLORS, css } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { LobbyScene } from '../scenes/LobbyScene.js';
import { StatsScene } from '../scenes/StatsScene.js';
import { KitScene } from '../scenes/KitScene.js';
import { PlinkoScene } from '../games/plinko/PlinkoScene.js';
import { BlackjackScene } from '../games/blackjack/BlackjackScene.js';
import { CrapsScene } from '../games/craps/CrapsScene.js';
import { RouletteScene } from '../games/roulette/RouletteScene.js';
import { SlotsScene } from '../games/slots/SlotsScene.js';
import { prepareGL } from './GLGuard.js';

// 1280x720, scaled to fit and centred. Antialiased (smooth text, chips and
// tweens); pixel-art textures get NEAREST one by one (Assets.setPixelFilter).
// No physics plugin: games animate with tweens over RNG-decided outcomes
// (a game may enable Matter in its own scene config if it really needs it).
export const GameConfig = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: css(COLORS.PAGE_BG),
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  render: {
    preserveDrawingBuffer: true, // screenshots (iterate-client, ui-shots)
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
  disableContextMenu: true,
  scene: [BootScene, PreloadScene, LobbyScene, PlinkoScene, BlackjackScene, CrapsScene, RouletteScene, SlotsScene, KitScene, StatsScene],
};
