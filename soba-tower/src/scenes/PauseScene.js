import Phaser from 'phaser';
import { GAME, UI, COLORS } from '../core/Constants.js';

// Overlay launched on top of the paused ClimbScene.
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;
    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, COLORS.OVERLAY, COLORS.OVERLAY_ALPHA).setOrigin(0, 0);
    this.add.text(cx, cy - 16, 'PAUSED', {
      fontFamily: UI.FONT, fontSize: `${UI.HEADING_SIZE + 4}px`, fontStyle: 'bold',
      color: COLORS.UI_TEXT, stroke: '#1a1220', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(cx, cy + 14, 'P / Esc / Space / tap\nto resume', {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE}px`, align: 'center',
      color: COLORS.MUTED_TEXT, stroke: '#1a1220', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.resuming = false;
    const resume = () => this.resumeGame();
    ['keydown-P', 'keydown-ESC', 'keydown-SPACE'].forEach(ev => this.input.keyboard.on(ev, resume));
    this.input.on('pointerdown', resume);
  }

  resumeGame() {
    if (this.resuming) return;
    this.resuming = true;
    this.scene.resume('ClimbScene');
    this.scene.stop();
  }
}
