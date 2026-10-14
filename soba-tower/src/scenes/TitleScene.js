import Phaser from 'phaser';
import { GAME, UI, COLORS, TRANSITION, TITLE_LAYOUT, FX, AUDIO, WORLD, CAMERA, TIMING, DEPTH, TITLE_FX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { HighScore } from '../core/HighScore.js';
import { ANIMS } from '../core/Assets.js';
import { LEVEL1 } from '../levels/level1.js';
import { Backdrop } from '../systems/Backdrop.js';
import { Ambient } from '../systems/Ambient.js';
import { PlatformSpawner } from '../systems/PlatformSpawner.js';
import { MuteButton } from '../ui/MuteButton.js';

// Title: the camera eases down the tower to the street at dusk (the skyline
// parallax shows the height), Soba sits by the noodle-shop door, the logo bobs,
// leaves drift, the best height and a blinking prompt. All text sits above
// Soba (TITLE_LAYOUT) and draws on top. Any arrow / A / D / Space / Enter or a
// tap starts the climb (Soba hops up as the screen fades; M stays mute, the
// mute button never starts the game).

const START_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'Space', 'Enter']);

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data) {
    this.autoStart = !!data?.autoStart;
  }

  create() {
    gameState.newSession();
    gameState.mode = MODES.TITLE;
    this.starting = false;

    if (this.autoStart) {
      this.startGame(true);
      return;
    }

    const cx = GAME.WIDTH / 2;
    const camTop = WORLD.STREET_Y + CAMERA.STREET_MARGIN - GAME.HEIGHT;
    this.camTop = camTop;
    // Intro: start up the tower and ease down to the street (parallax reveal)
    this.view = { top: camTop - TITLE_FX.INTRO_PAN_PX };
    this.cameras.main.scrollY = Math.round(this.view.top);
    this.tweens.add({ targets: this.view, top: camTop, duration: TITLE_FX.INTRO_PAN_MS, ease: 'Sine.easeInOut' });

    // The real backdrop + the first beams, Soba sitting on the street
    this.backdrop = new Backdrop(this, LEVEL1, { gates: false });
    this.backdrop.update(this.view.top, 0);
    this.ambient = new Ambient(this, LEVEL1);
    this.spawner = new PlatformSpawner(this, LEVEL1);
    this.spawner.update(0, camTop);
    this.sobaSprite = this.add.sprite(TITLE_FX.SOBA_X, WORLD.STREET_Y, 'soba', 0).setOrigin(0.5, 1).setDepth(DEPTH.SOBA);
    this.sobaSprite.play(ANIMS.SIT);
    this.tweens.add({ targets: this.sobaSprite, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.spawner.release());

    const fixed = (o) => o.setScrollFactor(0).setDepth(DEPTH.TITLE_TEXT);
    const shadow = { offsetX: 2, offsetY: 2, color: '#1a1220', blur: 0, fill: true };

    const logo = [];
    if (this.textures.exists('title')) {
      logo.push(fixed(this.add.image(cx, TITLE_LAYOUT.LOGO_Y, 'title')));
    } else {
      logo.push(fixed(this.add.text(cx, TITLE_LAYOUT.LOGO_Y - 18, 'SOBA', {
        fontFamily: UI.FONT, fontSize: `${UI.TITLE_SIZE + 6}px`, fontStyle: 'bold',
        color: COLORS.SCORE_GOLD, stroke: '#3a1430', strokeThickness: 7, shadow,
      }).setOrigin(0.5)));
      logo.push(fixed(this.add.text(cx, TITLE_LAYOUT.LOGO_Y + 20, 'TOWER', {
        fontFamily: UI.FONT, fontSize: `${UI.TITLE_SIZE}px`, fontStyle: 'bold',
        color: '#ffe6b0', stroke: '#3a1430', strokeThickness: 7, shadow,
      }).setOrigin(0.5)));
    }
    // Logo: drops in, then bobs gently
    for (const o of logo) {
      const y = o.y;
      o.setY(y - 40).setAlpha(0);
      this.tweens.add({ targets: o, y, alpha: 1, duration: 520, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: o, y: y - TITLE_FX.LOGO_BOB_PX, delay: 520, duration: TITLE_FX.LOGO_BOB_MS,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // A soft panel behind the text block keeps it readable over the facade
    const panel = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.TITLE_TEXT - 1);
    panel.fillStyle(COLORS.HUD_PANEL, TITLE_LAYOUT.PANEL_ALPHA);
    panel.fillRoundedRect(TITLE_LAYOUT.PANEL_X, TITLE_LAYOUT.PANEL_TOP, GAME.WIDTH - TITLE_LAYOUT.PANEL_X * 2,
      TITLE_LAYOUT.PANEL_BOTTOM - TITLE_LAYOUT.PANEL_TOP, 6);

    const best = HighScore.get(LEVEL1.id);
    const stars = best.stars ? `  ${'*'.repeat(best.stars)}` : '';
    const bestLine = best.height > 0 ? `BEST ${best.height}m   ${best.score} pts${stars}` : 'Ring the bell on the roof!';
    fixed(this.add.text(cx, TITLE_LAYOUT.BEST_Y, `Level 1: ${LEVEL1.name}\n${bestLine}`, {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE}px`, fontStyle: 'bold', align: 'center',
      color: COLORS.UI_TEXT, stroke: '#1a1220', strokeThickness: 3,
    }).setOrigin(0.5, 0));

    // Readable blinking prompt
    const prompt = fixed(this.add.text(cx, TITLE_LAYOUT.PROMPT_Y, 'TAP OR PRESS\nANY ARROW TO START', {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE + 2}px`, fontStyle: 'bold', align: 'center',
      color: '#fff3c4', stroke: '#2a1206', strokeThickness: 4,
    }).setOrigin(0.5));
    let on = true;
    const blink = () => {
      on = !on;
      prompt.setAlpha(on ? 1 : TITLE_LAYOUT.PROMPT_MIN_ALPHA);
      this.time.delayedCall(on ? FX.PROMPT_ON_MS : FX.PROMPT_OFF_MS, blink);
    };
    this.time.delayedCall(FX.PROMPT_ON_MS, blink);

    fixed(this.add.text(cx, TITLE_LAYOUT.HINT_Y, 'Steer: arrows / A D / hold a screen side\nP / Esc pause    M mute', {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE}px`, align: 'center',
      color: COLORS.MUTED_TEXT, stroke: '#1a1220', strokeThickness: 3,
    }).setOrigin(0.5, 0));

    // Mute toggle (its pointerdown is stopped, so tapping it doesn't start the game)
    new MuteButton(this, GAME.WIDTH - UI.HUD_MARGIN - AUDIO.MUTE_BTN_SIZE, UI.HUD_MARGIN, 10);

    this.onKey = (event) => {
      if (event.repeat || !START_CODES.has(event.code)) return;
      this.startGame();
    };
    this.input.keyboard.on('keydown', this.onKey);
    this.input.on('pointerdown', () => this.startGame());

    eventBus.emit(Events.MUSIC_MENU);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
  }

  update(time, delta) {
    if (!this.backdrop) return;
    const dt = Math.min(delta, TIMING.MAX_DT_MS) / 1000;
    const top = Math.round(this.view.top);
    this.cameras.main.scrollY = top;
    this.backdrop.update(top, time / 1000);
    this.ambient.update(dt, top);
  }

  startGame(immediate = false) {
    if (this.starting) return;
    this.starting = true;
    gameState.reset();
    eventBus.emit(Events.GAME_START);
    if (this.sobaSprite) {
      // Soba springs up as the screen fades
      this.tweens.killTweensOf(this.sobaSprite);
      this.sobaSprite.setScale(1.15, 0.85).play(ANIMS.RISE);
      this.tweens.add({ targets: this.sobaSprite, scaleX: 1, scaleY: 1, y: WORLD.STREET_Y - 40, duration: TITLE_FX.HOP_MS, ease: 'Quad.easeOut' });
    }
    if (immediate) {
      this.scene.start('ClimbScene');
      return;
    }
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('ClimbScene');
    });
  }
}
