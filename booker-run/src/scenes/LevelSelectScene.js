import Phaser from 'phaser';
import { GAME, UI, TRANSITION, AUDIO, SELECT_UI as L, UI_COLORS as C, UI_KIT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { SaveData } from '../core/SaveData.js';
import { LEVELS } from '../levels/index.js';
import { ABILITIES, ABILITY_ORDER, UI_ICON } from '../core/Abilities.js';
import { MuteButton } from '../ui/MuteButton.js';
import { LevelCard } from '../ui/LevelCard.js';
import { text, setText } from '../ui/PixelFont.js';
import {
  ensureUiAssets, icon, brackets, bindMenuKeys, loadPref, savePref,
} from '../ui/UiKit.js';

// Level select: 6 cards in a 3x2 grid with a sliding, breathing focus frame.
//   Keys: arrows / WASD move, Space / Enter play, Esc / Backspace back to the title.
//   Mouse: hover focuses, click plays. Touch: first tap focuses, second tap plays.
//   Locked cards shake and emit MENU_LOCKED. The last selected level is remembered.
// Header: title + totals (stars x/18, levels cleared x/6, total score = sum of bests).
// Footer: the ability collection (unlocked icons lit) + bones/tries + key hints.
//
// Scene data: { selected?: levelId, music?: boolean, reveal?: levelId }
//   reveal = a level this visit should unlock on screen (arrival from a first clear).
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  init(data) {
    this.initial = data?.selected || null;
    this.startMusic = !!data?.music;
    this.reveal = data?.reveal || null;
  }

  create() {
    gameState.mode = MODES.LEVEL_SELECT;
    // Phaser reuses this object for every visit: reset all per-visit state
    this.leaving = false;
    this.revealing = false;
    this.touchArmed = null;
    this.hintTimer = null;
    ensureUiAssets(this);
    const sum = SaveData.summary();
    this.summary = sum;

    this.add.image(0, 0, 'menu-bg').setOrigin(0, 0);
    // Darken the sky band behind the header and the street behind the footer
    const shade = this.add.graphics();
    shade.fillStyle(C.DIM_OVERLAY, 0.5).fillRect(0, 0, GAME.WIDTH, 30);
    shade.fillStyle(C.DIM_OVERLAY, 0.7).fillRect(0, L.FOOTER_Y - 6, GAME.WIDTH, GAME.HEIGHT - L.FOOTER_Y + 6);

    this.buildHeader(sum);
    this.buildFooter(sum);
    new MuteButton(this, GAME.WIDTH - UI.HUD_MARGIN - AUDIO.MUTE_BTN_SIZE, UI.HUD_MARGIN, 10);

    // Cards
    const totalW = L.COLS * L.CARD_W + (L.COLS - 1) * L.GAP_X;
    const left = Math.round((GAME.WIDTH - totalW) / 2);
    this.cards = LEVELS.map((lv, i) => {
      const info = sum.levels[i];
      const x = left + (i % L.COLS) * (L.CARD_W + L.GAP_X);
      const y = L.TOP + Math.floor(i / L.COLS) * (L.CARD_H + L.GAP_Y);
      const isNew = info.unlocked && !info.completed && info.attempts === 0 && lv.number > 1;
      const revealPending = this.reveal === lv.id && info.unlocked;
      const card = new LevelCard(this, lv, info, x, y, { isNew, revealPending });
      this.wireCard(card, i);
      return card;
    });

    // Focus frame (slides between cards, brackets breathe)
    this.focusFrame = this.add.graphics().setDepth(5);
    this.focusPos = { x: 0, y: 0, pulse: 0 };
    this.tweens.add({
      targets: this.focusPos, pulse: 1, duration: UI_KIT.FOCUS_PULSE_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Initial selection: scene data > remembered (if open) > the furthest open level not yet cleared
    const remembered = loadPref(UI_KIT.LAST_LEVEL_KEY);
    const firstOpen = Math.max(0, sum.levels.findLastIndex(l => l.unlocked && !l.completed));
    const want = this.initial || remembered;
    let idx = want ? LEVELS.findIndex(l => l.id === want) : -1;
    if (idx < 0 || !sum.levels[idx]?.unlocked) idx = firstOpen;
    this.selected = -1;
    this.select(idx, false, true);

    bindMenuKeys(this, {
      left: () => this.move(-1),
      right: () => this.move(1),
      up: () => this.moveRow(-1),
      down: () => this.moveRow(1),
      confirm: () => this.activate(this.selected),
      back: () => this.back(),
    });

    if (this.startMusic) eventBus.emit(Events.MUSIC_MENU);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);

    // Arrival from a first clear: the new level unlocks on screen
    const revealCard = this.cards.find(c => c.level.id === this.reveal && c.locked && c.info.unlocked);
    if (revealCard) {
      this.revealing = true;
      this.time.delayedCall(L.REVEAL_DELAY_MS, () => {
        eventBus.emit(Events.UI_UNLOCK_REVEAL, {
          levelId: revealCard.level.id, ability: revealCard.level.ability, where: 'select',
        });
        if (!revealCard.locked) return;   // already finished by a press (activate)
        revealCard.playUnlockReveal(() => {
          this.revealing = false;
          this.drawFocus();
        });
      });
    }
  }

  // --- layout ------------------------------------------------------------------

  buildHeader(sum) {
    text(this, 10, L.HEADER_Y, 'SELECT LEVEL', { scale: 2, color: C.GOLD });
    const allClear = sum.levelsCleared >= sum.levelCount;
    // Chips, right to left, ending before the mute button
    let x = GAME.WIDTH - 30;
    const chip = (frame, str, color) => {
      const t = text(this, x, L.HEADER_Y + 4, str, { align: 'right', color });
      x -= t.width + 3;
      icon(this, x - 8, L.HEADER_Y + 7, frame, 16);
      x -= 26;
    };
    chip(UI_ICON.TROPHY, `${sum.levelsCleared}/${sum.levelCount}`, allClear ? C.GOLD : C.INK);
    chip(UI_ICON.STAR_ON, `${sum.totalStars}/${sum.maxStars}`, sum.totalStars >= sum.maxStars ? C.GOLD : C.INK);
    const total = text(this, x, L.HEADER_Y + 4, String(sum.totalScore), { align: 'right', color: C.INK });
    text(this, total.x - 4, L.HEADER_Y + 4, 'TOTAL', { align: 'right', color: C.DIM });
  }

  buildFooter(sum) {
    const y = L.FOOTER_Y;
    // Ability collection: lit when unlocked, dark silhouettes otherwise
    text(this, 10, y + 2, 'SKILLS', { color: C.DIM });
    ABILITY_ORDER.forEach((id, i) => {
      const owned = sum.abilitiesUnlocked.includes(id);
      const im = icon(this, 58 + i * 15, y + 5, ABILITIES[id].icon, 12);
      if (!owned) im.setTint(0x3d3358).setAlpha(0.85);
    });
    // Bones and tries across all levels
    let bones = 0;
    let bonesMax = 0;
    for (const lv of LEVELS) {
      bones += SaveData.getLevel(lv.id).bestBones || 0;
      bonesMax += (lv.data.bones || []).length;
    }
    const tries = sum.levels.reduce((n, l) => n + l.attempts, 0);
    this.add.image(146, y + 5, 'bone');
    text(this, 157, y + 2, `${bones}/${bonesMax}`, { color: C.MUTED });
    text(this, 212, y + 2, `TRIES ${tries}`, { color: C.DIM });
    this.hint = text(this, GAME.WIDTH - 8, y + 2, '<> MOVE  SPACE PLAY  ESC BACK', { align: 'right', color: C.DIM });
    this.footerTotals = { bones, bonesMax, tries };
  }

  wireCard(card, i) {
    const c = card.container;
    c.on('pointerover', (pointer) => {
      if (!pointer.wasTouch) this.select(i);
    });
    c.on('pointerup', (pointer) => {
      if (this.leaving) return;
      // Mouse: hover already focused it, so a click plays. Touch: first tap focuses.
      if (this.selected === i && (!pointer.wasTouch || this.touchArmed === i)) {
        this.activate(i);
      } else {
        this.select(i);
      }
      this.touchArmed = pointer.wasTouch ? i : null;
    });
  }

  // --- focus ---------------------------------------------------------------------

  select(i, emit = true, instant = false) {
    if (i === this.selected || !this.cards[i]) return;
    if (this.selected >= 0) this.cards[this.selected].setFocused(false);
    this.selected = i;
    const card = this.cards[i];
    card.setFocused(true);
    // Remember only open levels (hovering a locked card must not become the default)
    if (SaveData.isUnlocked(card.level.number)) savePref(UI_KIT.LAST_LEVEL_KEY, card.level.id);
    const tx = card.x;
    const ty = card.y - L.LIFT_PX;
    this.tweens.killTweensOf(this.focusPos, ['x', 'y']);
    if (instant) {
      this.focusPos.x = tx;
      this.focusPos.y = ty;
    } else {
      this.tweens.add({ targets: this.focusPos, x: tx, y: ty, duration: UI_KIT.FOCUS_SLIDE_MS, ease: 'Cubic.easeOut' });
    }
    if (emit) eventBus.emit(Events.MENU_MOVE, { scene: 'LevelSelectScene', index: i, levelId: card.level.id });
  }

  move(d) {
    const n = this.cards.length;
    this.select((this.selected + d + n) % n);
  }

  moveRow(d) {
    const n = this.cards.length;
    this.select((this.selected + d * L.COLS + n) % n);
  }

  update() {
    this.drawFocus();
  }

  drawFocus() {
    const g = this.focusFrame;
    if (!g) return;
    g.clear();
    const card = this.cards[this.selected];
    if (!card) return;
    const out = 3 + Math.round(this.focusPos.pulse * 2);
    const x = Math.round(this.focusPos.x) - out;
    const y = Math.round(this.focusPos.y) - out;
    const color = card.locked ? C.DIM : C.GOLD;
    brackets(g, x + 1, y + 1, L.CARD_W + out * 2, L.CARD_H + out * 2, 0x000000, 9, 2);
    brackets(g, x, y, L.CARD_W + out * 2, L.CARD_H + out * 2, color, 9, 2);
  }

  // --- actions -------------------------------------------------------------------

  activate(i) {
    const card = this.cards[i];
    if (!card || this.leaving) return;
    // A card that is unlocked in the save but still mid-reveal plays at once
    if (card.locked && SaveData.isUnlocked(card.level.number)) {
      card.finishReveal();
      this.revealing = false;
    }
    if (!SaveData.isUnlocked(card.level.number) || card.locked) {
      eventBus.emit(Events.MENU_LOCKED, { scene: 'LevelSelectScene', levelId: card.level.id });
      card.shake();
      this.flashHint(card.level.number > 1 ? `CLEAR LEVEL ${card.level.number - 1} TO UNLOCK` : 'LOCKED');
      return;
    }
    this.leaving = true;
    const levelId = card.level.id;
    eventBus.emit(Events.MENU_SELECT, { scene: 'LevelSelectScene', action: 'play', levelId });
    // Little "go" bounce on the chosen card before the fade
    this.tweens.add({ targets: card.container, y: card.y - L.LIFT_PX - 3, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
    gameState.reset(levelId);
    eventBus.emit(Events.GAME_START, { levelId });
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('RunScene', { levelId });
    });
  }

  /** Swaps the footer key hint for a short message. */
  flashHint(msg) {
    if (!this.hint) return;
    this.hintTimer?.remove();
    setText(this.hint, msg);
    this.hint.setTint(C.BAD);
    this.hintTimer = this.time.delayedCall(L.TOAST_MS, () => {
      setText(this.hint, '<> MOVE  SPACE PLAY  ESC BACK');
      this.hint.setTint(C.DIM);
    });
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK, { scene: 'LevelSelectScene' });
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('TitleScene');
    });
  }

  /** For render_game_to_text(). */
  snapshot() {
    const s = this.summary;
    return {
      screen: 'levelselect',
      selected: this.cards[this.selected]?.level.id || null,
      selectedIndex: this.selected,
      revealing: this.revealing,
      totals: {
        totalScore: s.totalScore, stars: s.totalStars, maxStars: s.maxStars,
        cleared: s.levelsCleared, levels: s.levelCount, ...this.footerTotals,
      },
      cards: this.cards.map(c => ({
        id: c.level.id,
        locked: c.locked,
        completed: c.info.completed,
        isNew: c.isNew && !c.locked,
        stars: c.info.bestStars,
        best: c.info.bestScore,
        bestProgress: c.info.bestProgress,
      })),
    };
  }
}
