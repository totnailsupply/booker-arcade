import Phaser from 'phaser';
import {
  GAME, UI, COLORS, TRANSITION, AUDIO, WORLD, BACKDROP, SCORE, RESULTS_LAYOUT as L, RESULTS_FX as RF,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { HighScore } from '../core/HighScore.js';
import { getDebugOptions } from '../core/Debug.js';
import { ANIMS } from '../core/Assets.js';
import { LEVEL1 } from '../levels/level1.js';
import { skyColor } from '../systems/Backdrop.js';
import { MuteButton } from '../ui/MuteButton.js';
import { FXK } from '../core/VisualBake.js';

// Results after a game over (0 lives) or a level complete. Shows height,
// score, bests, stars. ANY key (except M = mute, Esc = title) or a tap retries
// right away; a restart is well under a second (PLAN pillar 4).
// Step 4: each star has its reason icon under it (bell = rang it, paw = no paws
// lost, biscuit = 75% of the treats); earned stars pop in one by one with a
// sparkle (fx:resultsStar) and the score counts up (fx:scoreTally).
// The mode stays 'game_over' / 'complete' while this screen is up.

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  init(data) {
    this.result = data?.result || gameState.result || {
      outcome: 'game_over', score: gameState.score, heightM: Math.floor(gameState.maxHeightM),
      stars: 0, timeS: 0, treats: 0, treatsTotal: 0, livesLost: 0, finishPts: 0, timePts: 0, heightPts: 0,
    };
  }

  create() {
    const r = this.result;
    const complete = r.outcome === 'complete';
    gameState.mode = complete ? MODES.COMPLETE : MODES.GAME_OVER;
    gameState.result = r;
    this.leaving = false;

    // Debug starts (?autoplay, ?y, ?zone) show the result but never save it
    const debug = getDebugOptions();
    const debugRun = debug.autoplay || debug.startHeight !== null;
    const { isNewBest, best } = debugRun
      ? { isNewBest: {}, best: HighScore.get(LEVEL1.id) }
      : HighScore.submit(LEVEL1.id, {
        height: r.heightM, score: r.score, time: complete ? r.timeS : null, stars: r.stars,
      });
    r.saved = !debugRun;
    gameState.bestScore = best.score;
    gameState.bestHeightM = best.height;
    r.best = best;
    r.isNewBest = isNewBest;

    const cx = GAME.WIDTH / 2;
    this.drawBackground(r.heightM * WORLD.PX_PER_M);

    const text = (y, str, size, color, extra = {}) => this.add.text(cx, y, str, {
      fontFamily: UI.FONT, fontSize: `${size}px`, fontStyle: 'bold', color, align: 'center',
      stroke: '#1a1220', strokeThickness: 4, ...extra,
    }).setOrigin(0.5);

    text(L.TITLE_Y, complete ? 'BELL RUNG!' : 'GAME OVER', UI.HEADING_SIZE + 6, complete ? COLORS.SCORE_GOLD : COLORS.DANGER);
    text(L.SUB_Y, complete ? 'Level 1 complete' : 'Out of paws', UI.BODY_SIZE, COLORS.MUTED_TEXT, { strokeThickness: 3 });

    // Celebrating after the bell; sitting patiently (the 'sit' frame) after a game over
    const soba = this.add.sprite(cx, L.SOBA_Y, 'soba', 0).setOrigin(0.5, 1).setScale(L.SOBA_SCALE);
    soba.play(complete ? ANIMS.CELEBRATE : ANIMS.SIT);

    // Stars (only a completed climb earns stars), each over its reason icon
    const total = r.treatsTotal || 0;
    const earned = [
      complete,
      complete && r.livesLost === 0,
      complete && total > 0 && r.treats >= Math.ceil(total * SCORE.TREAT_STAR_RATIO),
    ];
    const icons = [['bell', 0.3], ['paw', 1], ['treat', 1]];
    const sparkle = this.add.particles(0, 0, FXK.SPARK, {
      emitting: false, speed: { min: 30, max: 80 }, angle: { min: 0, max: 360 }, lifespan: 420,
      scale: { start: 1, end: 0.3 }, alpha: { start: 1, end: 0 }, tint: [0xffe08a, 0xffffff],
    }).setDepth(5);
    let popIndex = 0;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * UI.STAR_GAP;
      const on = earned[i];
      const star = this.add.star(x, L.STARS_Y, 5, UI.STAR_RADIUS / 2, UI.STAR_RADIUS,
        on ? COLORS.STAR_ON : COLORS.STAR_OFF);
      star.setStrokeStyle(2, 0x1a1220);
      const [key, sc] = icons[i];
      this.add.image(x, L.STARS_Y + RF.ICON_DY, key).setScale(sc).setAlpha(on ? 1 : 0.35);
      if (on) {
        star.setScale(0);
        const delay = L.STAR_DELAY_MS + popIndex * L.STAR_STAGGER_MS;
        popIndex += 1;
        this.tweens.add({ targets: star, scale: 1, duration: L.STAR_POP_MS, delay, ease: 'Back.easeOut' });
        this.time.delayedCall(delay + L.STAR_POP_MS * 0.5, () => {
          sparkle.explode(8, x, L.STARS_Y);
          eventBus.emit(Events.FX_RESULTS_STAR, { index: i, earned: true });
        });
      }
    }

    text(L.HEIGHT_Y, `HEIGHT ${r.heightM}m`, UI.HEADING_SIZE, COLORS.UI_TEXT);
    // Score counts up
    const scoreText = text(L.SCORE_Y, 'SCORE 0', UI.HEADING_SIZE, COLORS.SCORE_GOLD);
    this.time.delayedCall(RF.TALLY_DELAY_MS, () => {
      eventBus.emit(Events.FX_SCORE_TALLY, { score: r.score, done: false });
      this.tweens.addCounter({
        from: 0, to: r.score, duration: RF.TALLY_MS, ease: 'Cubic.easeOut',
        onUpdate: tw => scoreText.setText(`SCORE ${Math.round(tw.getValue())}`),
        onComplete: () => {
          scoreText.setText(`SCORE ${r.score}`);
          this.tweens.add({ targets: scoreText, scale: { from: 1.15, to: 1 }, duration: 200, ease: 'Back.easeOut' });
          eventBus.emit(Events.FX_SCORE_TALLY, { score: r.score, done: true });
        },
      });
    });
    const lines = [`Height +${r.heightPts}`];
    if (r.treatsTotal) lines.push(`Treats ${r.treats}/${r.treatsTotal} +${r.treatPts}`);
    if (r.stomps) lines.push(`Crows ${r.stomps} +${r.stompPts}`);
    if (complete) lines.push(`Bell +${r.finishPts}   Time ${r.timeS}s +${r.timePts}`);
    lines.push(`Paws lost ${r.livesLost}   Try ${r.attempt ?? gameState.attempts}`);
    text(L.BREAKDOWN_Y, lines.join('\n'), UI.SMALL_SIZE, COLORS.MUTED_TEXT, { fontStyle: 'normal', strokeThickness: 3 }).setOrigin(0.5, 0);

    const bestTime = best.time !== null ? `   ${best.time}s` : '';
    text(L.BEST_Y, `BEST ${best.height}m   ${best.score} pts${bestTime}`, UI.BODY_SIZE, COLORS.UI_TEXT, { strokeThickness: 3 });
    if (debugRun) text(L.NEW_BEST_Y, 'debug run: not saved', UI.SMALL_SIZE, COLORS.MUTED_TEXT, { fontStyle: 'normal', strokeThickness: 3 });
    if (isNewBest.height || isNewBest.score) {
      const nb = text(L.NEW_BEST_Y, 'NEW BEST!', UI.BODY_SIZE + 2, COLORS.NEW_BEST);
      this.tweens.add({ targets: nb, scale: 1.15, duration: UI.BLINK_MS, yoyo: true, repeat: -1 });
    }

    this.createButton(cx, L.BUTTON_Y, 'RETRY', () => this.retry());
    text(L.HINT_Y, 'any key or tap to retry\nEsc: title', UI.SMALL_SIZE, COLORS.MUTED_TEXT, { fontStyle: 'normal', strokeThickness: 3 }).setOrigin(0.5, 0);

    new MuteButton(this, GAME.WIDTH - UI.HUD_MARGIN - AUDIO.MUTE_BTN_SIZE, UI.HUD_MARGIN, 10);

    // Keys held down during the climb only produce repeats (or keyups), never a
    // fresh keydown, so they can't skip this screen by accident.
    this.onKey = (event) => {
      if (event.repeat) return;
      if (event.code === 'KeyM') return;
      if (event.code === 'Escape') this.toTitle();
      else this.retry();
    };
    this.input.keyboard.on('keydown', this.onKey);
    this.input.on('pointerdown', () => this.retry());

    eventBus.emit(Events.MUSIC_GAMEOVER);
    this.cameras.main.fadeIn(TRANSITION.RETRY_FADE, 0, 0, 0);
  }

  drawBackground(heightPx) {
    const g = this.add.graphics();
    const span = LEVEL1.finish.y + BACKDROP.SKY_ABOVE_ROOF;
    const base = heightPx / span;
    for (let y = 0; y < GAME.HEIGHT; y += BACKDROP.SKY_BAND) {
      const t = Math.max(0, Math.min(1, base + (1 - y / GAME.HEIGHT) * 0.25));
      g.fillStyle(skyColor(t), 1);
      g.fillRect(0, y, GAME.WIDTH, BACKDROP.SKY_BAND);
    }
    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, COLORS.OVERLAY, COLORS.OVERLAY_ALPHA * 0.75).setOrigin(0, 0);
  }

  createButton(x, y, label, onClick) {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const draw = (color) => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-UI.BTN_W / 2, -UI.BTN_H / 2, UI.BTN_W, UI.BTN_H, UI.BTN_RADIUS);
      bg.lineStyle(2, 0x1a1220, 1);
      bg.strokeRoundedRect(-UI.BTN_W / 2, -UI.BTN_H / 2, UI.BTN_W, UI.BTN_H, UI.BTN_RADIUS);
    };
    draw(COLORS.BTN_PRIMARY);
    const txt = this.add.text(0, 0, label, {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE + 2}px`, fontStyle: 'bold', color: COLORS.UI_TEXT,
    }).setOrigin(0.5);
    container.add([bg, txt]);
    container.setSize(UI.BTN_W, UI.BTN_H);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => draw(COLORS.BTN_PRIMARY_HOVER));
    container.on('pointerout', () => draw(COLORS.BTN_PRIMARY));
    container.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      onClick();
    });
    return container;
  }

  leave(sceneKey, ms) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(ms, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      gameState.reset();
      this.scene.start(sceneKey);
    });
  }

  retry() {
    if (this.leaving) return;
    eventBus.emit(Events.GAME_RESTART);
    this.leave('ClimbScene', TRANSITION.RETRY_FADE);
  }

  toTitle() {
    this.leave('TitleScene', TRANSITION.FADE_DURATION);
  }
}
