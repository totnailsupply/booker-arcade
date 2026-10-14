import Phaser from 'phaser';
import { GAME, GRID, COLORS, SCENERY } from '../core/Constants.js';
import { addMenuAmbience } from '../fx/Ambient.js';
import { META_TEXT, META_COLORS, MENU, TITLE_MENU as T } from '../core/MetaConstants.js';
import { gameState, MODES } from '../core/GameState.js';
import { createButton } from '../ui/Button.js';
import { MenuNav } from '../ui/MenuNav.js';
import {
  menuText, menuButtonOpts, ensureMenuAnims, drawNightSky, addLantern, addBoneBadge, drawMuteSlot, fadeIn, fadeTo,
} from '../ui/MenuKit.js';

// Title: logo, Soba on guard in the night garden, Play and Treat Shop.
// Keyboard: Up/Down + Enter/Space. Mouse and touch: the buttons.

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    gameState.reset();
    gameState.mode = MODES.TITLE;
    this.menuLeaving = false;
    ensureMenuAnims(this);
    const cx = GAME.WIDTH / 2;

    this.drawBackdrop();
    addMenuAmbience(this, {
      moon: T.MOON,
      glows: [
        { ox: T.HOUSE_X, oy: T.BACKDROP_Y, spots: SCENERY.HOUSE_GLOWS },
        { ox: T.ALLEY_X, oy: T.BACKDROP_Y, spots: SCENERY.ALLEY_GLOWS },
        { ox: 0, oy: 0, spots: T.LANTERNS.map(p => ({ x: p.x, y: p.y + T.LANTERN_RY + 1, s: SCENERY.LANTERN_GLOW_SCALE })) },
      ],
      fireflyRects: [{ x: T.HEDGE_LEFT, y: T.GROUND_Y - GRID.TILE * 2, w: T.ALLEY_X - T.HEDGE_LEFT, h: GRID.TILE * 2 },
        { x: T.ALLEY_X, y: T.BACKDROP_Y + GRID.TILE, w: GAME.WIDTH - T.ALLEY_X, h: GAME.HEIGHT - T.BACKDROP_Y - GRID.TILE }],
    });

    this.logo = this.add.image(cx, T.LOGO_Y, 'title');
    this.tweens.add({ targets: this.logo, y: T.LOGO_Y - T.LOGO_BOB_PX, duration: T.LOGO_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.nav = new MenuNav(this);
    this.nav.add('play', createButton(this, cx, T.PLAY_Y, MENU.BTN_W, MENU.BTN_H, 'PLAY', () => this.play(),
      menuButtonOpts({ size: META_TEXT.HEADING })));
    this.nav.add('shop', createButton(this, cx, T.SHOP_Y, MENU.BTN_W, MENU.BTN_H, 'TREAT SHOP', () => this.shop(),
      menuButtonOpts({ color: META_COLORS.BTN_ALT, hover: META_COLORS.BTN_ALT_HOVER })));
    this.nav.focus('play');

    menuText(this, cx, T.HINT_Y, 'Arrows + Enter, click or tap', META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0.5);

    this.bones = addBoneBadge(this, MENU.BONE_BADGE.X, MENU.BONE_BADGE.Y);
    drawMuteSlot(this);
    fadeIn(this);
  }

  drawBackdrop() {
    drawNightSky(this);
    // lanterns hanging from the top edge
    const g = this.add.graphics();
    g.fillStyle(META_COLORS.LANTERN_STRING, 1);
    T.LANTERNS.forEach((p, i) => {
      g.fillRect(p.x, 0, 1, p.y);
      addLantern(this, p.x, p.y, i);
    });

    // house on the left, alley on the right, garden strip between
    this.add.image(T.HOUSE_X, T.BACKDROP_Y, 'house').setOrigin(0, 0);
    this.add.image(T.ALLEY_X, T.BACKDROP_Y, 'alley').setOrigin(0, 0);
    const left = T.HEDGE_LEFT; // just under the house art's right edge
    const hedge = this.add.graphics();
    hedge.fillStyle(COLORS.HEDGE, 1).fillRect(left, T.GROUND_Y - GRID.TILE / 2, T.ALLEY_X - left, GRID.TILE / 2);
    for (let x = left; x < T.ALLEY_X; x += T.HEDGE_BUMP_STEP) hedge.fillCircle(x + T.HEDGE_BUMP_R, T.GROUND_Y - GRID.TILE / 2, T.HEDGE_BUMP_R);
    for (let i = 0; left + i * GRID.TILE < T.ALLEY_X; i++) {
      this.add.image(left + i * GRID.TILE, T.GROUND_Y, 'tiles', i % 2).setOrigin(0, 0);
    }

    // the cast: Soba on guard, a lucky cat, a steamer and a rat peeking in
    this.soba = this.add.sprite(T.SOBA_X, T.GROUND_Y + GRID.TILE / 4, 'soba', 0).setOrigin(0.5, 1).setScale(T.SOBA_SCALE);
    this.soba.play('menu-soba-idle');
    this.add.sprite(T.CAT_X, T.GROUND_Y + GRID.TILE / 4, 'luckycat', 0).setOrigin(0.5, 1);
    this.add.sprite(T.STEAMER_X - GRID.TILE * 2, T.GROUND_Y + GRID.TILE / 4, 'steamer', 0).setOrigin(0.5, 1);
    const rat = this.add.sprite(T.RAT_X, T.GROUND_Y + GRID.TILE / 4, 'rat', 0).setOrigin(0.5, 1);
    this.tweens.add({ targets: rat, x: T.RAT_X - T.RAT_PEEK_PX, duration: T.RAT_PEEK_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  play() {
    fadeTo(this, 'LevelSelectScene');
  }

  shop() {
    fadeTo(this, 'ShopScene', { from: 'TitleScene' });
  }
}
