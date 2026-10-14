import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';
import { META_TEXT, META_COLORS, MENU, PAUSE_MENU as L } from '../core/MetaConstants.js';
import { gameState, MODES } from '../core/GameState.js';
import { retryConfig } from '../core/BattleConfig.js';
import { createButton } from '../ui/Button.js';
import { MenuNav } from '../ui/MenuNav.js';
import { menuText, menuButtonOpts, drawPanel, battleConfigFor, drawMuteSlot } from '../ui/MenuKit.js';

// Pause overlay. BattleScene pauses itself and launches this scene; we resume
// it with scene.resume('BattleScene') and stop ourselves. That's the whole
// contract between the two. Resume: P / Esc / the button. Retry and Quit too.

const BATTLE = 'BattleScene';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    this.done = false;
    gameState.mode = MODES.PAUSED;
    this.scene.bringToTop();

    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, META_COLORS.SHADE, META_COLORS.SHADE_ALPHA).setOrigin(0, 0)
      .setInteractive(); // swallow clicks so the battle underneath never sees them
    const P = L.PANEL;
    drawPanel(this, P.X, P.Y, P.W, P.H);
    const cx = GAME.WIDTH / 2;
    menuText(this, cx, L.TITLE_Y, 'Paused', META_TEXT.TITLE, META_COLORS.TEXT, { strokeThickness: META_TEXT.STROKE_BIG }).setOrigin(0.5);

    this.nav = new MenuNav(this, {
      onBack: () => this.resume(),
      keys: { KeyP: () => this.resume() },
    });
    const defs = [
      ['resume', 'RESUME (P)', () => this.resume(), { color: META_COLORS.BTN_GOOD, hover: META_COLORS.BTN_GOOD_HOVER }],
      ['retry', 'RETRY', () => this.retry(), { color: META_COLORS.BTN, hover: META_COLORS.BTN_HOVER }],
      ['quit', 'QUIT TO LEVELS', () => this.quit(), { color: META_COLORS.BTN_ALT, hover: META_COLORS.BTN_ALT_HOVER }],
    ];
    defs.forEach(([name, label, fn, colors], i) => {
      this.nav.add(name, createButton(this, cx, L.FIRST_BTN_Y + i * L.BTN_STEP, MENU.BTN_W, MENU.BTN_H, label, fn, menuButtonOpts(colors)));
    });
    this.nav.focus('resume');
    menuText(this, cx, L.HINT_Y, 'P or Esc to resume', META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0.5);
    drawMuteSlot(this); // Step 3b: speaker button top-right
  }

  resume() {
    if (this.done) return;
    this.done = true;
    gameState.mode = MODES.PLAYING;
    this.scene.resume(BATTLE);
    this.scene.stop();
  }

  retry() {
    if (this.done) return;
    this.done = true;
    const prev = gameState.battleConfig;
    const config = prev ? retryConfig(prev) : battleConfigFor(1);
    gameState.battleConfig = config;
    this.scene.stop(BATTLE);
    this.scene.start(BATTLE, { config });
  }

  quit() {
    if (this.done) return;
    this.done = true;
    this.scene.stop(BATTLE);
    this.scene.start('LevelSelectScene', { focus: gameState.battleConfig?.levelNumber ?? 1 });
  }
}
