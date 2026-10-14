import Phaser from 'phaser';
import { GAME, FX, FX_COLORS, FX_PARTICLES } from '../core/Constants.js';
import { FXK, ensureFxTextures } from '../fx/FxTextures.js';
import { META_TEXT, META_COLORS, MENU, STAR_LABELS, LOSS_TIPS, RESULTS_MENU as L } from '../core/MetaConstants.js';
import { gameState, MODES } from '../core/GameState.js';
import { retryConfig } from '../core/BattleConfig.js';
import { ITEM, SOBA_FRAMES } from '../core/Assets.js';
import { SaveData, isWin, resultStars } from '../core/SaveData.js';
import { createButton } from '../ui/Button.js';
import { MenuNav } from '../ui/MenuNav.js';
import {
  menuText, menuButtonOpts, drawNightSky, drawPanel, fadeIn, fadeTo, levelInfo, levelReward, unitName, battleConfigFor, startBattle,
} from '../ui/MenuKit.js';
import { addMenuAmbience, addConfetti } from '../fx/Ambient.js';

// Results after a battle. The save is written here (never on debug runs).
// Win: "Garden saved!", stars fill one by one, score, bones earned, unlock card.
// Loss: "The rats got in!", a tip. Retry (R / Space / Enter) is a fresh battle
// in ~0.1 s; Esc goes to Level Select; Next level when it exists and is open.

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  init(data) {
    this.result = data?.result || gameState.result;
  }

  create() {
    const r = normalise(this.result);
    const won = r.won;
    gameState.mode = won ? MODES.WON : MODES.GAME_OVER;
    gameState.result = r;
    this.menuLeaving = false;
    this.starsShown = 0;
    this.unlockShown = null;

    const debug = r.debug === true || (r.debug === undefined && !!gameState.battleConfig?.debugRun);
    this.summary = SaveData.recordResult(r, { debug });
    this.r = r;

    drawNightSky(this, { moon: false });
    addMenuAmbience(this);
    const P = L.PANEL;
    drawPanel(this, P.X, P.Y, P.W, P.H);
    const cx = GAME.WIDTH / 2;
    menuText(this, cx, L.TITLE_Y, won ? 'Garden saved!' : 'The rats got in!', META_TEXT.TITLE, won ? META_COLORS.TEXT_GOLD : META_COLORS.TEXT_DANGER,
      { strokeThickness: META_TEXT.STROKE_BIG }).setOrigin(0.5);
    menuText(this, cx, L.LEVEL_Y, `${r.levelNumber}. ${r.levelName}`, META_TEXT.BODY, META_COLORS.TEXT_MUTED).setOrigin(0.5);

    this.soba = this.add.sprite(L.SOBA_X, L.SOBA_Y, 'soba', won ? SOBA_FRAMES.CHEER : SOBA_FRAMES.SAD).setOrigin(0.5, 1).setScale(L.SOBA_SCALE);
    if (won) this.tweens.add({ targets: this.soba, y: L.SOBA_Y - L.SOBA_HOP_PX, duration: L.SOBA_HOP_MS, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });

    ensureFxTextures(this);
    this.sparks = this.add.particles(0, 0, FXK.SPARK, {
      ...FX_PARTICLES.RESULT_SPARKS, emitting: false, maxAliveParticles: FX.CAP_SPARKS,
      tint: FX_COLORS.COIN_SPARK, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(FX.RESULTS_SPARK_DEPTH);
    if (won) addConfetti(this, FX.RESULTS_CONFETTI_DEPTH).explode(FX.WIN_CONFETTI_2, 0, 0);

    if (won) this.drawStars();
    else this.drawLoss();

    this.drawNumbers();
    if (won && this.summary.unlocked.length) this.drawUnlock(this.summary.unlocked[0]);
    else if (won && this.summary.debug && r.unlocks.length && !SaveData.isUnitUnlocked(r.unlocks[0])) this.drawUnlock(r.unlocks[0]);
    this.drawButtons();
    fadeIn(this);
  }

  drawStars() {
    const stars = this.summary.stars;
    this.starImgs = stars.map((on, i) => {
      const x = L.STARS_X + (i - 1) * L.STAR_GAP;
      const slot = this.add.image(x, L.STARS_Y, 'items', ITEM.STAR).setScale(L.STAR_SCALE).setTint(META_COLORS.PIP_OFF);
      const label = menuText(this, x, L.STARS_Y + L.STAR_LABEL_DY, STAR_LABELS[i], META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0.5);
      const star = this.add.image(x, L.STARS_Y, 'items', ITEM.STAR).setScale(0);
      if (on) {
        this.time.delayedCall(L.STAR_DELAY_MS * (i + 1), () => {
          // pops past full size with a bounce, sparkles, a tiny thump
          this.tweens.add({
            targets: star, scale: L.STAR_SCALE, duration: L.STAR_POP_MS * FX.STAR_POP_TIME, ease: 'Back.easeOut', easeParams: [FX.STAR_POP_OVERSHOOT],
          });
          this.sparks.explode(FX.STAR_POP_SPARKS, x, L.STARS_Y);
          this.cameras.main.shake(FX.STAR_SHAKE_MS, FX.STAR_SHAKE);
          label.setColor(META_COLORS.TEXT_GOLD);
          this.starsShown += 1;
        });
      }
      return { slot, star, label };
    });
  }

  drawLoss() {
    const r = this.r;
    menuText(this, L.STARS_X, L.LOSS.WAVE_Y, `Reached wave ${r.wave}/${r.wavesTotal}`, META_TEXT.HEADING + 2, META_COLORS.TEXT).setOrigin(0.5);
    const tip = LOSS_TIPS[(r.seed >>> 0) % LOSS_TIPS.length];
    menuText(this, L.STARS_X, L.LOSS.TIP_Y, tip, META_TEXT.BODY, META_COLORS.TEXT_MUTED).setOrigin(0.5);
  }

  drawNumbers() {
    const r = this.r;
    const s = this.summary;
    const won = r.won;
    menuText(this, L.STARS_X, won ? L.SCORE_Y : L.LOSS.SCORE_Y, `Score ${r.score}`, META_TEXT.HEADING + 2, META_COLORS.TEXT_GOLD).setOrigin(0.5);
    let bonesLine;
    if (s.debug) bonesLine = 'Debug run: progress not saved';
    else if (s.bonesEarned > 0) bonesLine = `+${s.bonesEarned} Golden Bones`;
    else if (s.won) bonesLine = 'No new stars this time';
    else bonesLine = '';
    if (bonesLine) {
      const paid = s.bonesEarned > 0 && !s.debug;
      const y = won ? L.BONES_Y : L.LOSS.NOTE_Y;
      const t = menuText(this, L.STARS_X + (paid ? L.BONE_ICON_GAP / 2 : 0), y, bonesLine, META_TEXT.BODY,
        paid ? META_COLORS.TEXT_GOLD : META_COLORS.TEXT_MUTED).setOrigin(0.5);
      if (paid) this.add.image(t.x - t.width / 2 - L.BONE_ICON_GAP, y, 'items', ITEM.BONE).setScale(MENU.ICON_SCALE * 0.75);
    }
    const stats = `Critters ${r.kills}   Scooters used ${r.scootersUsed}   Crew lost ${r.unitsLost}`;
    menuText(this, L.STARS_X, won ? L.STATS_Y : L.LOSS.STATS_Y, stats, META_TEXT.SMALL, META_COLORS.TEXT).setOrigin(0.5);
  }

  drawUnlock(unit) {
    const U = L.UNLOCK;
    const c = this.add.container(U.X + U.W / 2, U.Y + U.H / 2).setScale(0);
    const g = this.add.graphics();
    g.fillStyle(META_COLORS.CARD_EDGE, 1).fillRoundedRect(-U.W / 2, -U.H / 2, U.W, U.H, MENU.BTN_RADIUS);
    const b = MENU.PANEL_BORDER;
    g.fillStyle(META_COLORS.CARD, 1).fillRoundedRect(-U.W / 2 + b, -U.H / 2 + b, U.W - b * 2, U.H - b * 2, MENU.BTN_RADIUS);
    g.lineStyle(2, META_COLORS.NODE_EDGE, 1).strokeRoundedRect(-U.W / 2, -U.H / 2, U.W, U.H, MENU.BTN_RADIUS);
    const head = menuText(this, 0, -U.H / 2 + L.UNLOCK_HEAD_DY, 'New crew member!', META_TEXT.SMALL, META_COLORS.TEXT_GOLD).setOrigin(0.5);
    const portrait = this.add.image(0, 0, this.textures.exists(unit) ? unit : 'items', this.textures.exists(unit) ? 0 : ITEM.STAR)
      .setScale(L.UNLOCK_ICON_SCALE);
    const name = menuText(this, 0, U.H / 2 - 16, unitName(unit), META_TEXT.BODY, META_COLORS.TEXT).setOrigin(0.5);
    const shine = this.add.graphics();
    c.add([g, head, portrait, name, shine]);
    this.unlockShown = unit;
    this.tweens.add({
      targets: c, scale: 1, delay: L.STAR_DELAY_MS * 4, duration: L.STAR_POP_MS * 2, ease: 'Back.easeOut',
      onComplete: () => this.sparks.explode(FX.STAR_POP_SPARKS, c.x, c.y),
    });
    // a diagonal shine sweeps across the card now and then (clipped to the card row by row)
    let t = 0;
    const inset = b + 1;
    const tick = (_time, delta) => {
      t += delta / 1000;
      shine.clear();
      const k = (t % FX.SHINE_EVERY_S) / FX.SHINE_S;
      if (k >= 1) return;
      const span = U.W + U.H * FX.SHINE_SLANT + FX.SHINE_W;
      const x0 = -U.W / 2 - U.H * FX.SHINE_SLANT - FX.SHINE_W + span * k;
      shine.fillStyle(0xffffff, FX.SHINE_ALPHA);
      for (let yy = -U.H / 2 + inset; yy < U.H / 2 - inset; yy++) {
        const a = Math.max(-U.W / 2 + inset, Math.round(x0 + (U.H / 2 - yy) * FX.SHINE_SLANT));
        const bnd = Math.min(U.W / 2 - inset, Math.round(x0 + (U.H / 2 - yy) * FX.SHINE_SLANT + FX.SHINE_W));
        if (bnd > a) shine.fillRect(a, yy, bnd - a, 1);
      }
    };
    this.events.on('update', tick);
    this.events.once('shutdown', () => this.events.off('update', tick));
  }

  drawButtons() {
    const r = this.r;
    const next = r.won ? levelInfo(r.levelNumber + 1) : null;
    this.nextLevel = next && next.playable ? next.n : null;
    const defs = [
      ['retry', 'RETRY (R)', () => this.retry(), { color: META_COLORS.BTN, hover: META_COLORS.BTN_HOVER }],
      ['select', 'LEVELS (Esc)', () => this.toLevelSelect(), { color: META_COLORS.BTN_ALT, hover: META_COLORS.BTN_ALT_HOVER }],
    ];
    if (this.nextLevel) defs.push(['next', 'NEXT LEVEL', () => this.next(), { color: META_COLORS.BTN_GOOD, hover: META_COLORS.BTN_GOOD_HOVER }]);
    const total = defs.length * L.BTN_W + (defs.length - 1) * L.BTN_GAP;
    const x0 = GAME.WIDTH / 2 - total / 2 + L.BTN_W / 2;
    this.nav = new MenuNav(this, {
      onBack: () => this.toLevelSelect(),
      inputDelayMs: L.INPUT_DELAY_MS,
      keys: { KeyR: () => this.retry(), KeyN: () => this.nextLevel && this.next() },
    });
    defs.forEach(([name, label, fn, colors], i) => {
      this.nav.add(name, createButton(this, x0 + i * (L.BTN_W + L.BTN_GAP), L.BUTTONS_Y, L.BTN_W, MENU.BTN_H, label, fn, menuButtonOpts(colors)));
    });
    this.nav.focus('retry');
  }

  retry() {
    const prev = gameState.battleConfig;
    const config = prev && prev.levelNumber === this.r.levelNumber ? retryConfig(prev) : battleConfigFor(this.r.levelNumber);
    gameState.battleConfig = config;
    fadeTo(this, 'BattleScene', { config }, MENU.BTN_PRESS_MS * 2);
  }

  toLevelSelect() {
    fadeTo(this, 'LevelSelectScene', { focus: this.nextLevel || this.r.levelNumber });
  }

  next() {
    startBattle(this, this.nextLevel);
  }

  menuState() {
    return {
      won: this.r.won,
      stars: this.summary.stars,
      starsShown: this.starsShown,
      bonesEarned: this.summary.bonesEarned,
      saved: this.summary.saved,
      debug: this.summary.debug,
      unlockShown: this.unlockShown || null,
      nextLevel: this.nextLevel,
    };
  }
}

/** Fills in fields the battle may not report yet (Step 2a adds them). */
function normalise(raw) {
  const r = { ...(raw || {}) };
  r.won = isWin(r);
  r.outcome = r.outcome || (r.won ? 'won' : 'lost');
  r.levelNumber = Math.max(1, Math.floor(r.levelNumber) || gameState.battleConfig?.levelNumber || 1);
  r.levelName = r.levelName || levelInfo(r.levelNumber).name;
  r.score = Number.isFinite(r.score) ? r.score : 0;
  r.wave = r.wave ?? 0;
  r.wavesTotal = r.wavesTotal ?? 0;
  r.kills = r.kills ?? 0;
  r.scootersUsed = r.scootersUsed ?? 0;
  r.unitsLost = r.unitsLost ?? 0;
  r.seed = r.seed ?? 0;
  r.stars = resultStars(r);
  // No unlocks field: a first-time win unlocks the level's reward unit
  const reward = levelReward(r.levelNumber);
  r.unlocks = Array.isArray(r.unlocks) ? r.unlocks : (r.won && reward ? [reward] : []);
  return r;
}
