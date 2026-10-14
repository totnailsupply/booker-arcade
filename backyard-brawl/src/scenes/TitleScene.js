// Title: title card, menu (Play / Kennel / High Scores), Golden Bones balance,
// best score, mute. Arrows/WASD + Enter/Space, mouse, touch. Play goes to
// WeaponSelect (Enter, Enter starts a run). Booker trots along the bottom.

import Phaser from 'phaser';
import { GAME, UI, AUDIO, MENU } from '../core/Constants.js';
import { ANIMS } from '../core/Assets.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { SaveData } from '../core/SaveData.js';
import { Button } from '../ui/Button.js';
import { MuteButton } from '../ui/MuteButton.js';
import { MenuNav, bindMenuKeys, menuText, addPanel, boneIcon, fmt } from '../ui/Menu.js';
import { fadeIn } from '../fx/Transitions.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data) {
    this.focusKey = data?.focus || 'play';
  }

  create() {
    fadeIn(this); // Step 3A: quick fade-in (never delays the scene change)
    gameState.mode = MODES.TITLE;
    this.leaving = false;
    const W = GAME.WIDTH;
    const H = GAME.HEIGHT;
    const save = SaveData.get();
    this.add.image(0, 0, 'title').setOrigin(0, 0);

    // Booker trots across the grass strip at the very bottom, behind the menu
    this.trot = this.add.sprite(-20, H + 6, 'booker', 2).setOrigin(0.5, 1).play(ANIMS.BOOKER_RUN);
    this.trotDir = 1;

    // Balance + best score (top-left corner, over the sky)
    addPanel(this, 4, 4, 92, 30, { alpha: 0.85 });
    boneIcon(this, 16, 13);
    menuText(this, 27, 13, fmt(save.bones), { size: UI.BODY_SIZE + 1, color: MENU.TEXT_GOLD, origin: [0, 0.5] });
    const best = SaveData.bestScore();
    menuText(this, 9, 26, best > 0 ? `BEST ${fmt(best)}` : 'NO SCORE YET', { size: UI.SMALL_SIZE, color: MENU.TEXT, origin: [0, 0.5], stroke: 2 });

    // Menu row along the bottom
    const y = H - 42;
    const items = [
      { key: 'play', label: 'PLAY', w: 104, fn: () => this.go('WeaponSelectScene', 'play'), primary: true },
      { key: 'kennel', label: 'KENNEL', w: 96, fn: () => this.go('KennelScene', 'kennel') },
      { key: 'scores', label: 'SCORES', w: 96, fn: () => this.go('ScoresScene', 'scores') },
    ];
    const gap = 10;
    const total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
    let x = W / 2 - total / 2;
    this.buttons = items.map((it) => {
      const b = new Button(this, x + it.w / 2, y, it.w, MENU.BTN_H, it.label, it.fn, {
        fontSize: UI.HEADING_SIZE - 2, primary: it.primary,
      });
      b.key = it.key;
      x += it.w + gap;
      return b;
    });
    const start = Math.max(0, items.findIndex(it => it.key === this.focusKey));
    this.nav = new MenuNav(this.buttons, { start });

    this.hint = menuText(this, W / 2, H - 17, 'PRESS ENTER', { size: UI.BODY_SIZE, color: MENU.TEXT_GOLD, origin: 0.5 });
    this.tweens.add({ targets: this.hint, alpha: 0.45, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    menuText(this, W - 4, H - 5, 'M mute', { size: UI.SMALL_SIZE, color: MENU.TEXT, origin: [1, 1], stroke: 2 });

    new MuteButton(this, W - AUDIO.MUTE_BTN_SIZE - AUDIO.MUTE_BTN_MARGIN, AUDIO.MUTE_BTN_MARGIN, 10);

    bindMenuKeys(this, this.nav, {
      extra: { K: () => this.go('KennelScene', 'kennel'), H: () => this.go('ScoresScene', 'scores') },
    });

    eventBus.emit(Events.MUSIC_MENU);
  }

  update(_t, delta) {
    const s = this.trot;
    s.x += this.trotDir * MENU.TROT_SPEED * (delta / 1000);
    if (s.x > GAME.WIDTH + 24) { this.trotDir = -1; s.setFlipX(true); }
    if (s.x < -24) { this.trotDir = 1; s.setFlipX(false); }
  }

  go(sceneKey, from) {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_SELECT, { action: from });
    this.scene.start(sceneKey, { from: 'title' });
  }

  textState() {
    return { screen: 'title', focus: this.nav.current?.key, bones: SaveData.get().bones };
  }
}
