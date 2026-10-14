import { BEST_FLAG, COLORS, DEPTH, UI, WORLD, GAME, PROGRESS_FX as PF } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { heightToY } from '../core/Kinematics.js';
import { FXK } from '../core/VisualBake.js';
import { facadeRangeAt } from '../systems/Backdrop.js';
import { LEVEL1 } from '../levels/level1.js';

// The in-world "BEST" flag (PLAN pillar 4): planted on the tower facade at the
// player's stored best height for this level, with a small "BEST" label and a
// faint gold line across the facade. The first time this run's max height
// passes it, "NEW BEST!" pops on screen (once per run). No flag before the
// first saved run. Passing it: the flag flutters, confetti bursts from it and
// rains from the top of the screen (fx:confetti), "NEW BEST!" pops.
export class BestFlag {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} bestHeightM stored best height (m) for this level
   */
  constructor(scene, bestHeightM) {
    this.scene = scene;
    this.bestM = bestHeightM || 0;
    this.passed = false;
    this.items = [];
    if (this.bestM <= 0) return;

    const y = heightToY(this.bestM * WORLD.PX_PER_M);
    // Stay on the facade (the spire in zone 4 is narrower)
    const [fx0, fx1] = facadeRangeAt(LEVEL1, this.bestM * WORLD.PX_PER_M);
    const flagX = Math.max(BEST_FLAG.X, fx0 + BEST_FLAG.X - BEST_FLAG.LINE_X0);
    const line = scene.add.graphics().setDepth(DEPTH.BEST_FLAG);
    line.fillStyle(COLORS.BEST_LINE, BEST_FLAG.LINE_ALPHA);
    for (let x = Math.max(BEST_FLAG.LINE_X0, fx0); x < Math.min(BEST_FLAG.LINE_X1, fx1); x += 6) line.fillRect(x, y, 3, 1);
    this.flag = scene.add.image(flagX, y, 'best-flag').setOrigin(0.5, 1).setDepth(DEPTH.BEST_FLAG);
    this.label = scene.add.text(flagX + BEST_FLAG.LABEL_DX, y - this.flag.height + 1, `BEST ${this.bestM}m`, {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE}px`, fontStyle: 'bold',
      color: COLORS.SCORE_GOLD, stroke: COLORS.UI_SHADOW, strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(DEPTH.BEST_FLAG);
    this.items.push(line, this.flag, this.label);

    this.onHeight = ({ maxHeightM }) => {
      if (this.passed || maxHeightM <= this.bestM) return;
      this.passed = true;
      eventBus.emit(Events.NEW_BEST, { heightM: maxHeightM, previousM: this.bestM });
      this.pop();
    };
    eventBus.on(Events.HEIGHT_CHANGED, this.onHeight);
  }

  pop() {
    const { scene } = this;
    // Flutter: the flag snaps back and forth a few times
    scene.tweens.add({ targets: this.flag, scaleY: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: this.flag, scaleX: { from: 1, to: -0.6 }, duration: PF.FLAG_FLUTTER_MS,
      yoyo: true, repeat: PF.FLAG_FLUTTERS, ease: 'Sine.easeInOut', onComplete: () => this.flag.setScale(1),
    });
    // The old record's label fades: it is no longer the best, and it would
    // scroll down through the "NEW BEST!" pop (fixed at PF.NEW_BEST_Y) ~0.7 s later
    scene.tweens.add({ targets: this.label, alpha: 0, duration: PF.OLD_BEST_FADE_MS, ease: 'Quad.easeIn' });
    // Confetti: a burst at the flag (world) + a shower from the top of the screen
    const conf = {
      emitting: false, maxAliveParticles: PF.CONFETTI * 2, tint: PF.CONFETTI_COLORS,
      rotate: { min: 0, max: 360 }, gravityY: 160, lifespan: { min: 1100, max: 1700 },
      alpha: { values: [1, 1, 0] },
    };
    const burst = scene.add.particles(0, 0, FXK.CONFETTI, {
      ...conf, speed: { min: 60, max: 150 }, angle: { min: 220, max: 320 },
    }).setDepth(DEPTH.FX);
    burst.explode(PF.CONFETTI, this.flag.x, this.flag.y - this.flag.height);
    const rain = scene.add.particles(0, 0, FXK.CONFETTI, {
      ...conf, speedX: { min: -30, max: 30 }, speedY: { min: 20, max: 70 },
    }).setScrollFactor(0).setDepth(DEPTH.HUD - 1);
    for (let i = 0; i < PF.CONFETTI; i++) rain.emitParticleAt(Math.random() * GAME.WIDTH, UI.HUD_PANEL_H - Math.random() * 30, 1);
    scene.time.delayedCall(2000, () => { burst.destroy(); rain.destroy(); });
    eventBus.emit(Events.FX_CONFETTI, { x: this.flag.x, y: Math.round(this.flag.y) });

    const t = scene.add.text(GAME.WIDTH / 2, PF.NEW_BEST_Y, 'NEW BEST!', {
      fontFamily: UI.FONT, fontSize: `${UI.HEADING_SIZE}px`, fontStyle: 'bold',
      color: COLORS.NEW_BEST, stroke: COLORS.UI_SHADOW, strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.HUD + 1).setScale(0.4);
    scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: t, angle: { from: -4, to: 4 }, duration: 180, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    scene.tweens.add({
      targets: t, alpha: 0, delay: UI.NEW_BEST_MS, duration: 300, onComplete: () => t.destroy(),
    });
  }

  destroy() {
    if (this.onHeight) eventBus.off(Events.HEIGHT_CHANGED, this.onHeight);
  }
}
