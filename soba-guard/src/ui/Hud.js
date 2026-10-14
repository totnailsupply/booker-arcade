import Phaser from 'phaser';
import { UI, COLORS, LAYOUT, DEPTH, GAME, SOBA, FX } from '../core/Constants.js';
import { ITEM, SOBA_FRAMES } from '../core/Assets.js';
import { Card } from './Card.js';
import { ToolButton } from './ToolButton.js';
import { AbilityButton } from './AbilityButton.js';
import { HintToast } from './HintToast.js';
import { createButton, textStyle } from './Button.js';
import { MuteButton } from './MuteButton.js';
import { AUDIO } from '../audio/AudioConstants.js';

// Battle HUD.
//   Top bar: coin counter, unit cards, Upgrade (U) and Recall (X) tools, pause.
//   Bottom bar: level name, Bark (B) and Zoomies (Z) buttons, "Wave n/N" and
//   the wave progress bar with a flag icon at each flag wave, START during
//   the setup.
//   Toasts: big event text mid-field; hints in the strip under the top bar.
// Reads the Battle each frame (cheap: a few rects and texts).

export class Hud {
  constructor(scene, battle, { onCard, onStart, onPause, onTool, onBark, onZoomies }) {
    this.scene = scene;
    this.battle = battle;
    this.onCard = onCard;
    this.layer = scene.add.container(0, 0).setDepth(DEPTH.HUD);

    const top = LAYOUT.TOP_BAR;
    const bot = LAYOUT.BOTTOM_BAR;
    const g = scene.add.graphics();
    g.fillStyle(COLORS.TOP_BAR, 1).fillRect(top.X, top.Y, top.W, top.H);
    g.fillStyle(COLORS.TOP_BAR_EDGE, 1).fillRect(top.X, top.H - 2, top.W, 2);
    g.fillStyle(COLORS.BOTTOM_BAR, 1).fillRect(bot.X, bot.Y, bot.W, bot.H);
    g.fillStyle(COLORS.TOP_BAR_EDGE, 1).fillRect(bot.X, bot.Y, bot.W, 2);
    const cb = UI.COIN_BOX;
    g.fillStyle(COLORS.OUTLINE, 0.6).fillRoundedRect(cb.X, cb.Y, cb.W, cb.H, cb.R);
    this.layer.add(g);

    this.coinIcon = scene.add.image(UI.COIN_TEXT_X, UI.COIN_ICON_Y, 'items', ITEM.COIN).setScale(UI.COIN_ICON_SCALE);
    this.coinText = scene.add.text(UI.COIN_TEXT_X, UI.COIN_TEXT_Y, '0', textStyle(UI.HEADING_SIZE - 4, COLORS.TEXT_GOLD)).setOrigin(0.5);
    this.layer.add([this.coinIcon, this.coinText]);

    this.cards = [];
    this.cardKeys = '';

    this.upgradeBtn = new ToolButton(scene, UI.UPGRADE_X, {
      texture: 'items', frame: ITEM.STAR, keyLetter: 'U', caption: 'UPGRADE', color: COLORS.TOOL_UPGRADE, onClick: () => onTool('upgrade'),
    });
    this.recallBtn = new ToolButton(scene, UI.RECALL_X, {
      texture: 'items', frame: ITEM.COIN, keyLetter: 'X', caption: 'RECALL', color: COLORS.TOOL_RECALL, onClick: () => onTool('recall'),
    });
    this.layer.add([this.upgradeBtn.container, this.recallBtn.container]);

    const pb = UI.PAUSE_BTN;
    this.pauseBtn = createButton(scene, pb.X + pb.W / 2, pb.Y + pb.H / 2, pb.W, pb.H, 'II', onPause, { size: UI.BODY_SIZE });
    this.layer.add(this.pauseBtn);
    this.muteBtn = new MuteButton(scene, AUDIO.MUTE_BTN_HUD.X, AUDIO.MUTE_BTN_HUD.Y, { size: AUDIO.MUTE_BTN_HUD.SIZE, depth: DEPTH.HUD }); // left of Pause

    // bottom bar
    this.levelText = scene.add.text(UI.LEVEL_NAME.X, UI.LEVEL_NAME.Y, `${battle.level.number}. ${battle.level.name}`, textStyle(UI.BODY_SIZE));
    this.subText = scene.add.text(UI.LEVEL_NAME.X, UI.LEVEL_SUB_Y, 'Soba: B bark  Z zoomies', textStyle(UI.SMALL_SIZE - 2, COLORS.TEXT_MUTED, { strokeThickness: 2 }));
    this.barkBtn = new AbilityButton(scene, UI.BARK_X, UI.ABILITY_Y, { texture: 'soba', frame: SOBA_FRAMES.BARK[1], keyLetter: 'B', onClick: onBark });
    this.zoomiesBtn = new AbilityButton(scene, UI.ZOOMIES_X, UI.ABILITY_Y, { texture: 'soba', frame: SOBA_FRAMES.RUN[1], keyLetter: 'Z', onClick: onZoomies });
    this.waveText = scene.add.text(UI.WAVE_TEXT.X, UI.WAVE_TEXT.Y, '', textStyle(UI.SMALL_SIZE, COLORS.TEXT)).setOrigin(1, 0.5);
    this.waveBar = scene.add.graphics();
    this.layer.add([this.levelText, this.subText, this.barkBtn.container, this.zoomiesBtn.container, this.waveText, this.waveBar]);
    const sb = UI.START_BTN;
    this.startBtn = createButton(scene, sb.X, sb.Y, sb.W, sb.H, 'START', onStart, { size: UI.BODY_SIZE });
    this.layer.add(this.startBtn);

    this.toastText = scene.add.text(GAME.WIDTH / 2, UI.TOAST_Y, '', textStyle(UI.HEADING_SIZE, COLORS.TEXT_GOLD, { strokeThickness: 5 }))
      .setOrigin(0.5).setDepth(DEPTH.OVERLAY).setVisible(false);
    this.toastLeft = 0;
    this.toastAge = 0;
    this.coinBump = 0;
    this.hints = new HintToast(scene);
    this.time = 0;
    this.flagSig = '';
  }

  rebuildCards() {
    for (const c of this.cards) c.destroy();
    this.cards = this.battle.cards.slice(0, UI.MAX_CARDS).map((card, i) => {
      const x = UI.CARD_X + i * (UI.CARD_W + UI.CARD_GAP);
      const view = new Card(this.scene, x, UI.CARD_Y, card.key, card.cost, i, this.onCard);
      this.layer.add(view.container);
      return view;
    });
    this.cardKeys = this.battle.cards.map(c => c.key).join(',');
  }

  toast(text, seconds = UI.TOAST_S) {
    this.toastText.setText(text).setVisible(true).setAlpha(1).setScale(FX.TOAST_POP_SCALE);
    this.toastLeft = seconds;
    this.toastAge = 0;
  }

  /** A coin arrived at the counter (Effects): the icon and number bump. */
  bumpCoins() {
    this.coinBump = FX.COIN_BUMP_S;
  }

  hint(id, text) {
    this.hints.push(id, text);
  }

  drawWaveBar() {
    const w = this.battle.waves;
    const p = w.progress();
    const sig = `${Math.round(p * 400)}|${w.current}`;
    if (sig === this.flagSig) return;
    this.flagSig = sig;
    const bar = UI.WAVE_BAR;
    const g = this.waveBar;
    g.clear();
    g.fillStyle(COLORS.WAVE_BAR_BG, 1).fillRect(bar.X, bar.Y, bar.W, bar.H);
    // fills right to left, like the critters' march
    g.fillStyle(COLORS.WAVE_BAR_FILL, 1).fillRect(bar.X + bar.W - bar.W * p, bar.Y, bar.W * p, bar.H);
    g.lineStyle(1, COLORS.OUTLINE, 1).strokeRect(bar.X, bar.Y, bar.W, bar.H);
    // a flag icon (pole + pennant) above the bar at each flag wave
    w.defs.forEach((def, i) => {
      if (!def.flag) return;
      const fx = Math.round(bar.X + bar.W - bar.W * ((i + 1) / w.total)) + 1;
      const done = w.current > i + 1 || (w.current === i + 1 && p >= (i + 1) / w.total);
      const top = bar.Y - UI.FLAG_POLE_H;
      g.fillStyle(COLORS.OUTLINE, 1).fillRect(fx - 1, top - 1, 3, UI.FLAG_POLE_H + bar.H + 1);
      g.fillStyle(COLORS.FLAG_POLE, 1).fillRect(fx, top, 1, UI.FLAG_POLE_H + bar.H - 1);
      g.fillStyle(COLORS.OUTLINE, 1).fillTriangle(fx + 1, top - 1, fx + UI.FLAG_W + 2, top + UI.FLAG_H / 2, fx + 1, top + UI.FLAG_H + 1);
      g.fillStyle(done ? COLORS.FLAG_DONE : COLORS.FLAG, 1).fillTriangle(fx + 1, top, fx + UI.FLAG_W, top + UI.FLAG_H / 2, fx + 1, top + UI.FLAG_H);
    });
  }

  update(dt, selectedKey, tool) {
    const b = this.battle;
    this.time += dt;
    if (this.cardKeys !== b.cards.map(c => c.key).join(',')) this.rebuildCards();
    this.coinText.setText(String(b.coins));
    this.cards.forEach((view, i) => {
      view.update(b.cards[i], b.coins, dt);
      view.setSelected(view.key === selectedKey);
    });
    this.upgradeBtn.setActive(tool === 'upgrade');
    this.recallBtn.setActive(tool === 'recall');

    const s = b.soba;
    const barkFrac = s.barkCooldownMax > 0 ? 1 - s.barkCooldown / s.barkCooldownMax : 1;
    const barkReady = s.barkCooldown <= 0;
    this.barkBtn.update(barkFrac, barkReady && !b.outcome, barkReady ? '' : String(Math.ceil(s.barkCooldown)), this.time);
    const zFrac = s.zoomiesMeter / SOBA.ZOOMIES_KILLS;
    const zReady = zFrac >= 1 && !s.zoomies;
    this.zoomiesBtn.update(zFrac, zReady && !b.outcome, zReady || s.zoomies ? '' : String(SOBA.ZOOMIES_KILLS - s.zoomiesMeter), this.time);

    const w = b.waves;
    const setup = w.inSetup;
    this.startBtn.setVisible(setup);
    if (setup) this.startBtn.label.setText(`START ${Math.ceil(Math.max(0, w.setupLeft))}`);
    this.waveText.setText(setup ? 'Get ready!' : `Wave ${w.current}/${w.total}`);
    this.drawWaveBar();

    if (this.toastLeft > 0) {
      this.toastLeft -= dt;
      this.toastAge += dt;
      // pops in big, settles, fades out at the end
      const pin = Math.min(1, this.toastAge / FX.TOAST_IN_S);
      this.toastText.setScale(FX.TOAST_POP_SCALE + (1 - FX.TOAST_POP_SCALE) * Phaser.Math.Easing.Back.Out(pin));
      this.toastText.setAlpha(Math.min(1, this.toastLeft / FX.TOAST_OUT_S));
      if (this.toastLeft <= 0) this.toastText.setVisible(false);
    }
    if (this.coinBump > 0) this.coinBump = Math.max(0, this.coinBump - dt);
    const bump = 1 + FX.COIN_BUMP_SCALE * Math.sin((this.coinBump / FX.COIN_BUMP_S) * Math.PI);
    this.coinIcon.setScale(UI.COIN_ICON_SCALE * bump);
    this.coinText.setScale(bump);
    this.hints.update(dt);
  }
}
