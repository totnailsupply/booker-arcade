import Phaser from 'phaser';
import {
  UI, GAME, SAFE_ZONE, DEPTH, AUDIO, HUD_ABILITIES, TIPS_UI as TIP, UI_COLORS as C,
} from '../core/Constants.js';
import { ABILITIES } from '../core/Abilities.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MuteButton } from './MuteButton.js';
import { PauseButton } from './PauseButton.js';
import { text, setText } from './PixelFont.js';
import { ensureUiAssets, icon, panel, UI_TEX } from './UiKit.js';

// Top-of-screen HUD (pixel font, one 20 px bar):
//   SCORE 01234 | bone 12/40 | the level's ability icons | progress bar with a
//   best-percent tick and the finish (steak) | TRY 3 | pause | mute
// Below the bar, briefly: the level name (attempt 1) and level tips.
// Updated only through EventBus events (score, bones, distance).
//
// Tips: level data `tips: [{ x, text }]`. RunScene passes them with setTips();
// a tip toasts when Booker's x passes tip.x, only on the first TIPS_UI.MAX_ATTEMPT
// attempts of a session (gameState.attempts), never for tips behind a ?start/?x start.

const { BAR_X, BAR_W, BAR_H } = HUD_ABILITIES;

export class Hud {
  constructor(scene) {
    this.scene = scene;
    ensureUiAssets(scene);
    const m = UI.HUD_MARGIN;
    const top = SAFE_ZONE.TOP + m;
    const barY = top + 1;
    this.top = top;
    const items = [];

    const panelG = scene.add.graphics();
    const h = UI.HUD_HEIGHT + SAFE_ZONE.TOP + 2;
    panelG.fillStyle(C.DIM_OVERLAY, 0.55).fillRect(0, 0, GAME.WIDTH, h);
    panelG.fillStyle(0x000000, 0.35).fillRect(0, h, GAME.WIDTH, 1);
    items.push(panelG);

    // Score
    items.push(text(scene, m, top, 'SCORE', { color: C.DIM }));
    this.scoreText = text(scene, m + 34, top, '00000', { color: C.INK });
    // Bones
    this.boneIcon = scene.add.image(m + 84, top + 3, 'bone');
    this.boneText = text(scene, m + 94, top, '0/0', { color: C.INK });
    items.push(this.scoreText, this.boneIcon, this.boneText);

    // The level's abilities (12 px icons)
    this.abilityIcons = (scene.abilities || []).map((id, i) => icon(
      scene, m + HUD_ABILITIES.X + i * HUD_ABILITIES.STEP, top + 3, ABILITIES[id].icon, 12,
    ));
    items.push(...this.abilityIcons);

    // Progress bar (start -> finish) with the best percent reached so far
    this.barG = scene.add.graphics();
    this.best = Phaser.Math.Clamp(scene.bestProgress || 0, 0, 1);
    this.barY = barY;
    const finishKey = scene.model?.finish?.key === 'golden-steak' ? UI_TEX.GOLDEN_STEAK_SM : UI_TEX.STEAK_SM;
    this.barEnd = scene.add.image(BAR_X + BAR_W + 12, barY + 2, finishKey);
    items.push(this.barG, this.barEnd);

    // Mute button in the top-right corner, the pause button (mouse and touch) to its
    // left, then the attempt counter.
    const muteX = GAME.WIDTH - m - AUDIO.MUTE_BTN_SIZE;
    this.muteButton = new MuteButton(scene, muteX, top - 2, DEPTH.HUD + 1);
    const pauseX = muteX - AUDIO.MUTE_BTN_MARGIN - AUDIO.MUTE_BTN_SIZE;
    this.pauseButton = new PauseButton(scene, pauseX, top - 2, DEPTH.HUD + 1, () => scene.pauseGame?.());
    this.attemptText = text(scene, pauseX - AUDIO.MUTE_BTN_MARGIN - 2, top, '', { align: 'right', color: C.MUTED });
    items.push(this.attemptText);

    this.items = items;
    items.forEach(o => o.setScrollFactor(0).setDepth(DEPTH.HUD));

    this.progress = 0;
    this.onScore = ({ score }) => setText(this.scoreText, String(score).padStart(5, '0'));
    this.onBone = ({ bones, total }) => setText(this.boneText, `${bones}/${total}`);
    this.onDistance = ({ progress }) => {
      this.progress = progress;
      this.drawBar();
      this.checkTips(progress);
    };
    this.onDied = () => this.hideToast(true);
    eventBus.on(Events.SCORE_CHANGED, this.onScore);
    eventBus.on(Events.BONE_COLLECTED, this.onBone);
    eventBus.on(Events.DISTANCE_CHANGED, this.onDistance);
    eventBus.on(Events.PLAYER_DIED, this.onDied);

    // Tips + toast state
    this.tips = [];
    this.tipIndex = 0;
    this.tipsShown = 0;
    this.toast = null;
    this.toastText = null;
    this.queue = [];

    // Initial values
    this.onScore({ score: gameState.score });
    this.onBone({ bones: gameState.bones, total: gameState.bonesTotal });
    this.onDistance({ progress: gameState.progress });
    setText(this.attemptText, `TRY ${gameState.attempts}`);
  }

  drawBar() {
    const g = this.barG;
    const y = this.barY;
    g.clear();
    panel(g, BAR_X - 2, y - 2, BAR_W + 4, BAR_H + 4, { fill: C.PANEL_DARK, hi: 0x3a2d57, shadow: 0, sheen: false });
    const fw = Math.round(Phaser.Math.Clamp(this.progress, 0, 1) * BAR_W);
    if (fw > 0) {
      g.fillStyle(C.ORANGE, 1).fillRect(BAR_X, y, fw, BAR_H);
      g.fillStyle(0xffffff, 0.35).fillRect(BAR_X, y, fw, 1);
      g.fillStyle(0xffe2b0, 1).fillRect(BAR_X + fw - 1, y, 1, BAR_H);
    }
    if (this.best > 0 && this.best < 1) {
      const bx = BAR_X + Math.round(this.best * BAR_W);
      g.fillStyle(0x000000, 0.6).fillRect(bx, y - 2, 1, BAR_H + 4);
      g.fillStyle(HUD_ABILITIES.BEST_MARK_COLOR, 1).fillRect(bx - 1, y - 2, 1, BAR_H + 4);
    }
  }

  // --- level name + tips ----------------------------------------------------------

  /** Attempt 1: "2 · THE DOCKS" under the bar for a moment. */
  showLevelName(entry) {
    if (!entry || !entry.number) return;
    const s = this.scene;
    const label = `${entry.number} · ${entry.name.toUpperCase()}`;
    const c = this.makeToast(label, { x: UI.HUD_MARGIN, align: 'left', tag: 'LEVEL', tagColor: C.DIM });
    this.nameToast = c;
    c.y = TIP.Y - 14;
    s.tweens.add({ targets: c, y: TIP.Y, alpha: 1, duration: TIP.IN_MS, ease: 'Quad.easeOut' });
    s.time.delayedCall(TIP.NAME_HOLD_MS, () => {
      if (!c.scene) return;
      s.tweens.add({
        targets: c, alpha: 0, y: TIP.Y - 6, duration: TIP.OUT_MS, ease: 'Quad.easeIn', onComplete: () => c.destroy(),
      });
    });
  }

  /** RunScene hands over level.tips (sorted here); tips only show on early attempts. */
  setTips(tips, attempt = gameState.attempts, startX = 0) {
    const list = Array.isArray(tips) ? tips.filter(t => t && Number.isFinite(t.x) && t.text) : [];
    this.tips = attempt <= TIP.MAX_ATTEMPT
      ? list.filter(t => t.x > startX + TIP.AHEAD_MIN_PX).sort((a, b) => a.x - b.x)
      : [];
    this.tipIndex = 0;
  }

  checkTips(progress) {
    if (this.tipIndex >= this.tips.length) return;
    const lvl = this.scene.level;
    if (!lvl) return;
    const x = lvl.startX + progress * (lvl.finishX - lvl.startX);
    while (this.tipIndex < this.tips.length && x >= this.tips[this.tipIndex].x) {
      const tip = this.tips[this.tipIndex++];
      this.showTip(tip);
    }
  }

  showTip(tip) {
    this.tipsShown += 1;
    eventBus.emit(Events.TIP_SHOWN, { levelId: this.scene.levelId, x: tip.x, text: tip.text });
    if (this.toast) this.queue.push(tip);
    else this.displayTip(tip);
  }

  displayTip(tip) {
    const s = this.scene;
    const c = this.makeToast(tip.text, { x: GAME.WIDTH / 2, align: 'center', tag: 'TIP', tagColor: C.GOLD });
    this.toast = c;
    this.toastText = tip.text;
    c.y = TIP.Y - 16;
    s.tweens.add({ targets: c, y: TIP.Y, alpha: 1, duration: TIP.IN_MS, ease: 'Back.easeOut' });
    this.toastTimer = s.time.delayedCall(TIP.HOLD_MS, () => this.hideToast());
  }

  hideToast(now = false) {
    const c = this.toast;
    if (!c) return;
    this.toast = null;
    this.toastText = null;
    this.toastTimer?.remove();
    if (now || !c.scene) {
      c.destroy();
      this.queue = [];
      return;
    }
    this.scene.tweens.add({
      targets: c, alpha: 0, y: TIP.Y - 10, duration: TIP.OUT_MS, ease: 'Quad.easeIn',
      onComplete: () => {
        c.destroy();
        const next = this.queue.shift();
        if (next && this.scene?.sys?.isActive()) this.displayTip(next);
      },
    });
  }

  /** Small panel with a coloured tag ("TIP") and wrapped text. */
  makeToast(str, { x, align, tag, tagColor }) {
    const s = this.scene;
    const c = s.add.container(0, TIP.Y).setScrollFactor(0).setDepth(DEPTH.HUD).setAlpha(0);
    const tagT = text(s, 6, 4, tag, { color: tagColor });
    const body = text(s, 6 + tagT.width + 6, 4, str.toUpperCase(), { color: C.INK, maxWidth: TIP.MAX_W });
    const w = Math.round(body.x + body.width + 6);
    const lines = Math.max(1, Math.round(body.height / 11));
    const h = 7 + lines * 11;
    const g = s.add.graphics();
    panel(g, 0, 0, w, h, { fill: C.PANEL_DARK, hi: tag === 'TIP' ? C.GOLD_DARK : C.PANEL_HI, alpha: 0.92, shadow: 1 });
    c.add([g, tagT, body]);
    c.x = align === 'center' ? Math.round(x - w / 2) : Math.round(x);
    return c;
  }

  /** For render_game_to_text() (via RunScene.snapshot). */
  snapshot() {
    return {
      tip: this.toastText,
      tipsShown: this.tipsShown,
      tipsPending: this.tips.length - this.tipIndex,
    };
  }

  destroy() {
    this.muteButton?.destroy();
    eventBus.off(Events.SCORE_CHANGED, this.onScore);
    eventBus.off(Events.BONE_COLLECTED, this.onBone);
    eventBus.off(Events.DISTANCE_CHANGED, this.onDistance);
    eventBus.off(Events.PLAYER_DIED, this.onDied);
  }
}
