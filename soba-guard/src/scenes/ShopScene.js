import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';
import { META_TEXT, META_COLORS, MENU, SHOP_MENU as S } from '../core/MetaConstants.js';
import { gameState, MODES } from '../core/GameState.js';
import { ITEM } from '../core/Assets.js';
import { SaveData } from '../core/SaveData.js';
import { eventBus, Events } from '../core/EventBus.js';
import { SHOP_ITEMS, SHOP_MAX_RANK, nextRankCost } from '../data/shop.js';
import { createButton } from '../ui/Button.js';
import { MenuNav } from '../ui/MenuNav.js';
import {
  menuText, menuButtonOpts, drawNightSky, drawPanel, addBoneBadge, drawMuteSlot, fadeIn, fadeTo, toast, shakeX,
} from '../ui/MenuKit.js';
import { addMenuAmbience } from '../fx/Ambient.js';

// Treat Shop: four permanent upgrades, three ranks each, paid in Golden Bones.
// Up/Down pick an item, Enter/Space buys, Esc goes back.

const ICON_SIZE = 32;

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  init(data) {
    this.from = data?.from || 'TitleScene';
  }

  create() {
    gameState.mode = MODES.TITLE;
    this.menuLeaving = false;
    this.lastPurchase = null;
    this.lastFail = null;
    drawNightSky(this, { moon: false });
    addMenuAmbience(this);

    const cx = GAME.WIDTH / 2;
    menuText(this, cx, S.TITLE_Y, 'Treat Shop', META_TEXT.TITLE - 4, META_COLORS.TEXT_GOLD, { strokeThickness: META_TEXT.STROKE_BIG }).setOrigin(0.5);

    this.nav = new MenuNav(this, { onBack: () => this.back() });
    const BB = MENU.BACK_BTN;
    const back = createButton(this, BB.X + BB.W / 2, BB.Y + BB.H / 2, BB.W, BB.H, '< BACK', () => this.back(),
      menuButtonOpts({ color: META_COLORS.BTN_ALT, hover: META_COLORS.BTN_ALT_HOVER, size: META_TEXT.BODY }));

    this.rows = SHOP_ITEMS.map((item, i) => this.makeRow(item, S.ROW_Y + i * (S.ROW_H + S.ROW_GAP)));
    this.rows.forEach(r => this.nav.add(r.item.key, r.buy));
    this.nav.add('back', back);
    this.nav.focus(this.rows[0].item.key);

    menuText(this, cx, GAME.HEIGHT - S.FOOTER_DY, 'Earn 5 Golden Bones for every new star. Upgrades last forever.', META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0.5);

    this.bones = addBoneBadge(this, MENU.MUTE_SLOT.X - MENU.BONE_BADGE.W - MENU.BONE_BADGE.X, MENU.BONE_BADGE.Y);
    drawMuteSlot(this);
    this.refresh();
    fadeIn(this);
  }

  makeRow(item, y) {
    const c = this.add.container(S.ROW_X, y);
    c.add(drawPanel(this, 0, 0, S.ROW_W, S.ROW_H));
    const cy = S.ROW_H / 2;
    const icon = this.add.image(S.ICON_X - S.ROW_X, cy, item.icon.key, item.icon.frame);
    icon.setScale(Math.max(1, Math.floor(ICON_SIZE / Math.max(icon.width, icon.height)))); // integer scale keeps pixels crisp
    c.add(icon);
    c.add(menuText(this, S.NAME_X - S.ROW_X, cy + S.NAME_DY, item.name, META_TEXT.LABEL, META_COLORS.TEXT).setOrigin(0, 0.5));
    c.add(menuText(this, S.NAME_X - S.ROW_X, cy + S.DESC_DY, item.desc, META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0, 0.5));
    const pips = this.add.graphics();
    c.add(pips);
    const boneIcon = this.add.image(S.COST_X - S.ROW_X, cy, 'items', ITEM.BONE).setScale(MENU.ICON_SCALE * 0.75);
    const cost = menuText(this, S.COST_X - S.ROW_X + S.COST_TEXT_DX, cy, '', META_TEXT.LABEL, META_COLORS.TEXT_GOLD).setOrigin(0, 0.5);
    c.add([boneIcon, cost]);
    const buy = createButton(this, S.BUY_X, y + cy, S.BUY_W, MENU.BTN_H, 'BUY', () => this.buy(row),
      menuButtonOpts({ color: META_COLORS.BTN_GOOD, hover: META_COLORS.BTN_GOOD_HOVER }));
    const row = { item, container: c, pips, cost, boneIcon, buy };
    return row;
  }

  refresh() {
    const bones = SaveData.bones();
    this.bones.set(bones);
    for (const row of this.rows) {
      const rank = SaveData.shopRank(row.item.key);
      const next = nextRankCost(rank);
      const g = row.pips;
      g.clear();
      for (let i = 0; i < SHOP_MAX_RANK; i++) {
        const x = S.PIPS_X - S.ROW_X + i * (S.PIP_W + S.PIP_GAP);
        const y = S.ROW_H / 2 - S.PIP_H / 2;
        g.fillStyle(META_COLORS.NODE_EDGE, 1).fillRect(x - 1, y - 1, S.PIP_W + 2, S.PIP_H + 2);
        g.fillStyle(i < rank ? META_COLORS.PIP_ON : META_COLORS.PIP_OFF, 1).fillRect(x, y, S.PIP_W, S.PIP_H);
      }
      if (next === null) {
        row.cost.setText('MAX');
        row.boneIcon.setVisible(false);
        row.cost.setX(S.COST_X - S.ROW_X + S.MAX_TEXT_DX);
        row.buy.setLabel('MAXED').setDimmed(true);
      } else {
        row.cost.setText(String(next));
        row.boneIcon.setVisible(true);
        row.cost.setX(S.COST_X - S.ROW_X + S.COST_TEXT_DX);
        row.cost.setColor(bones >= next ? META_COLORS.TEXT_GOLD : META_COLORS.TEXT_DANGER);
        row.buy.setLabel('BUY').setDimmed(bones < next);
      }
    }
  }

  buy(row) {
    const res = SaveData.buy(row.item.key);
    eventBus.emit(Events.UI_SHOP, { key: row.item.key, ok: !!res.ok, reason: res.reason || null }); // Step 3b sound
    if (res.ok) {
      this.refresh();
      this.tweens.add({ targets: row.pips, alpha: 0.3, duration: MENU.BTN_PRESS_MS, yoyo: true, repeat: 1, onComplete: () => row.pips.setAlpha(1) });
      toast(this, `${row.item.name} rank ${res.rank}!`, META_COLORS.TEXT_GOOD, S.TOAST_Y);
      this.lastPurchase = { key: row.item.key, rank: res.rank };
      return;
    }
    shakeX(this, row.container);
    if (res.reason === 'bones') {
      this.bones.shake();
      toast(this, `Not enough bones: you need ${res.cost - res.bones} more`, META_COLORS.TEXT_DANGER, S.TOAST_Y);
    } else if (res.reason === 'max') {
      toast(this, `${row.item.name} is maxed out`, META_COLORS.TEXT_MUTED, S.TOAST_Y);
    }
    this.lastFail = res.reason;
  }

  back() {
    fadeTo(this, this.from);
  }

  menuState() {
    return { lastPurchase: this.lastPurchase || null, lastFail: this.lastFail || null };
  }
}
