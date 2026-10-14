import Phaser from 'phaser';
import {
  GAME, UI, WORLD, PLAYER, TRANSITION, FX, AUDIO, TITLE_UI as T, UI_COLORS as C,
} from '../core/Constants.js';
import { ANIMS } from '../core/Assets.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { getDebugOptions } from '../core/Debug.js';
import { SaveData } from '../core/SaveData.js';
import { UI_ICON } from '../core/Abilities.js';
import { MuteButton } from '../ui/MuteButton.js';
import { text, measure } from '../ui/PixelFont.js';
import { ensureUiAssets, icon, UI_TEX } from '../ui/UiKit.js';

// Title -> LevelSelect -> Run. Debug starts (?level, ?autoplay, ?start, ?x)
// go straight to RunScene.
// Layout: title art (logo, Booker, steak) with a dark band along the bottom:
// blinking "PRESS SPACE OR TAP TO START" (2x), a progress line once there is any
// progress (total score, stars x/18, levels cleared), and a controls hint.
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data) {
    this.autoStart = !!data?.autoStart;
  }

  create() {
    gameState.mode = MODES.TITLE;
    this.starting = false;

    if (this.autoStart) {
      const debug = getDebugOptions();
      const levelId = debug.level || 'level1';
      gameState.reset(levelId);
      eventBus.emit(Events.GAME_START, { levelId });
      this.scene.start('RunScene', { levelId });
      return;
    }

    ensureUiAssets(this);
    const cx = GAME.WIDTH / 2;
    const hasArt = this.textures.exists('title');

    if (hasArt) {
      this.add.image(cx, GAME.HEIGHT / 2, 'title');
      this.sparkles();
    } else {
      ['bg-far', 'bg-mid', 'bg-near'].forEach(k => this.add.image(0, 0, k).setOrigin(0, 0));
      this.add.tileSprite(0, WORLD.GROUND_Y, GAME.WIDTH, GAME.HEIGHT - WORLD.GROUND_Y, 'ground').setOrigin(0, 0);
      text(this, cx, 48, 'BOOKER RUN', { scale: 4, align: 'center', color: C.GOLD });
      this.add.sprite(PLAYER.SCREEN_X, WORLD.GROUND_Y - PLAYER.FRAME_H / 2, 'booker', 0).play(ANIMS.RUN);
    }

    // Bottom band
    const band = this.add.graphics();
    band.fillStyle(C.DIM_OVERLAY, 0.8).fillRect(0, T.PANEL_Y, GAME.WIDTH, GAME.HEIGHT - T.PANEL_Y);
    band.fillStyle(C.GOLD_DARK, 1).fillRect(0, T.PANEL_Y, GAME.WIDTH, 1);
    band.fillStyle(0x000000, 0.6).fillRect(0, T.PANEL_Y + 1, GAME.WIDTH, 1);

    const sum = SaveData.summary();
    this.hasProgress = sum.totalScore > 0 || sum.levelsCleared > 0 || sum.levels.some(l => l.attempts > 0);

    // Blinking prompt (hard on/off blink that never fades out fully)
    const promptY = this.hasProgress ? T.PROMPT_Y : T.PROMPT_Y + 6;
    const prompt = text(this, cx, promptY, 'PRESS SPACE OR TAP TO START', { scale: 2, align: 'center', color: 0xfff3c4 });
    let on = true;
    const blink = () => {
      on = !on;
      prompt.setAlpha(on ? 1 : 0.35);
      this.time.delayedCall(on ? FX.PROMPT_ON_MS : FX.PROMPT_OFF_MS, blink);
    };
    this.time.delayedCall(FX.PROMPT_ON_MS, blink);
    this.prompt = prompt;

    if (this.hasProgress) this.statsLine(sum);

    text(this, cx, T.HINT_Y, 'HOLD TO JUMP HIGHER  ·  P PAUSE  ·  M MUTE', { align: 'center', color: C.DIM });

    // Mute toggle (its pointerdown is stopped, so tapping it doesn't start the game)
    new MuteButton(this, GAME.WIDTH - UI.HUD_MARGIN - AUDIO.MUTE_BTN_SIZE, UI.HUD_MARGIN, 10);

    const go = () => this.toLevelSelect();
    ['keydown-SPACE', 'keydown-UP', 'keydown-ENTER'].forEach(ev => this.input.keyboard.once(ev, go));
    this.input.once('pointerdown', go);

    eventBus.emit(Events.MUSIC_MENU);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
  }

  /** "TOTAL 2945   ★ 3/18   🏆 1/6", centred, with 12 px icons. */
  statsLine(sum) {
    const parts = [
      { label: 'TOTAL', value: String(sum.totalScore) },
      { frame: UI_ICON.STAR_ON, value: `${sum.totalStars}/${sum.maxStars}` },
      { frame: UI_ICON.TROPHY, value: `${sum.levelsCleared}/${sum.levelCount}` },
    ];
    const gap = 14;
    const widthOf = (p) => (p.label ? measure(p.label) + 4 : 14) + measure(p.value);
    const total = parts.reduce((w, p) => w + widthOf(p), 0) + gap * (parts.length - 1);
    let x = Math.round(GAME.WIDTH / 2 - total / 2);
    for (const p of parts) {
      if (p.label) {
        const t = text(this, x, T.STATS_Y, p.label, { color: C.DIM });
        x += t.width + 4;
      } else {
        icon(this, x + 6, T.STATS_Y + 3, p.frame, 12);
        x += 14;
      }
      const v = text(this, x, T.STATS_Y, p.value, { color: C.GOLD });
      x += v.width + gap;
    }
  }

  /** Twinkles around the steak in the title art. */
  sparkles() {
    const em = this.add.particles(0, 0, UI_TEX.SPARK, {
      x: { min: T.STEAK_X - 50, max: T.STEAK_X + 50 },
      y: { min: T.STEAK_Y - 45, max: T.STEAK_Y + 35 },
      lifespan: 700,
      frequency: T.TWINKLE_EVERY_MS,
      quantity: 1,
      speed: 0,
      scale: { start: 0.2, end: 1, ease: 'Sine.easeOut' },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffe9a8],
    });
    em.setDepth(1);
  }

  toLevelSelect() {
    if (this.starting) return;
    this.starting = true;
    eventBus.emit(Events.MENU_SELECT, { scene: 'TitleScene', action: 'start' });
    this.prompt?.setAlpha(1);
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('LevelSelectScene');
    });
  }

  /** For render_game_to_text(). */
  snapshot() {
    return { screen: 'title', stats: !!this.hasProgress, starting: !!this.starting };
  }
}
