// Kennel: 6 permanent upgrades bought with Golden Bones (5 ranks, costs
// 10/20/35/55/80). Enter / click / tap buys the next rank; no funds = shake +
// red flash; full = MAX. Esc / Back returns to the title.

import Phaser from 'phaser';
import { GAME, UI, MENU, MENU_META } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { SaveData, kennelCost } from '../core/SaveData.js';
import { Button } from '../ui/Button.js';
import {
  MenuNav, Tile, bindMenuKeys, menuText, addBackdrop, addHeader, addPanel, boneIcon, fmt, shake,
} from '../ui/Menu.js';
import { fadeIn } from '../fx/Transitions.js';

const CARD_W = 148;
const CARD_H = 72;
const GAP = 6;
const PIP_W = 9;

/** Total effect at a rank, e.g. "+6 max HP", "+15% damage", "+2 rerolls". */
export function kennelEffect(key, rank) {
  const k = MENU_META.KENNEL[key];
  const v = k.per * rank;
  if (k.unit === 'pct') return `+${Math.round(v * 100)}% ${k.short}`;
  if (k.unit === 'count') return `+${v} reroll${v === 1 ? '' : 's'}`;
  return `+${v} ${k.short}`;
}

export class KennelScene extends Phaser.Scene {
  constructor() {
    super('KennelScene');
  }

  create() {
    fadeIn(this); // Step 3A: quick fade-in (never delays the scene change)
    gameState.mode = MODES.MENU;
    this.leaving = false;
    const W = GAME.WIDTH;

    addBackdrop(this, 'title', 0.72);
    addHeader(this, 'THE KENNEL', 15);

    // Balance (top-right)
    addPanel(this, W - 92, 4, 88, 22, { alpha: 0.9 });
    boneIcon(this, W - 79, 15);
    this.balanceText = menuText(this, W - 68, 15, '', { size: UI.BODY_SIZE + 2, color: MENU.TEXT_GOLD, origin: [0, 0.5] });
    this.shownBalance = SaveData.get().bones;
    this.balanceText.setText(fmt(this.shownBalance));

    const x0 = W / 2 - (3 * CARD_W + 2 * GAP) / 2 + CARD_W / 2;
    const y0 = 34 + CARD_H / 2;
    this.cards = MENU_META.KENNEL_ORDER.map((key, i) => this.makeCard(
      key, x0 + (i % 3) * (CARD_W + GAP), y0 + Math.floor(i / 3) * (CARD_H + GAP),
    ));

    this.info = menuText(this, W / 2, 196, '', { size: UI.BODY_SIZE, color: MENU.TEXT, origin: 0.5 });
    this.backBtn = new Button(this, W / 2, 222, 96, MENU.BTN_H, 'BACK', () => this.back());
    this.backBtn.key = 'back';
    menuText(this, W / 2, GAME.HEIGHT - 12, 'Arrows choose · Enter buy · Esc back', {
      size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
    });

    this.nav = new MenuNav([...this.cards, this.backBtn], { onFocus: (it) => this.onFocus(it) });
    this.onFocus(this.nav.current);
    bindMenuKeys(this, this.nav, { back: () => this.back() });
  }

  makeCard(key, x, y) {
    const k = MENU_META.KENNEL[key];
    const left = -CARD_W / 2;
    const top = -CARD_H / 2;
    const tx = left + 56;
    const icon = this.add.image(left + 28, -4, 'icons', k.icon).setScale(2);
    const name = menuText(this, tx, top + 7, k.name.toUpperCase(), { size: UI.BODY_SIZE + 1, color: MENU.TEXT_GOLD });
    const desc = menuText(this, tx, top + 21, `${kennelEffect(key, 1)} each`, { size: UI.SMALL_SIZE, color: MENU.TEXT, stroke: 2 });
    const now = menuText(this, tx, top + 32, '', { size: UI.SMALL_SIZE, color: MENU.TEXT_GOOD, stroke: 2 });
    const pips = this.add.graphics();
    const costIcon = this.add.image(left + 18, CARD_H / 2 - 13, 'items', 11);
    const cost = menuText(this, left + 27, CARD_H / 2 - 13, '', { size: UI.BODY_SIZE + 1, color: MENU.TEXT_GOLD, origin: [0, 0.5] });
    const card = new Tile(this, x, y, CARD_W, CARD_H, {
      children: [icon, name, desc, now, pips, costIcon, cost],
      label: key,
      onClick: (t) => this.buy(t),
    });
    Object.assign(card, { key, nowText: now, pips, cost, costIcon });
    this.refreshCard(card);
    return card;
  }

  refreshCard(card, popRank = 0) {
    const rank = SaveData.get().kennel[card.key] || 0;
    const price = kennelCost(rank);
    card.rank = rank;
    card.nowText.setText(rank > 0 ? `Now ${kennelEffect(card.key, rank)}` : 'Not bought yet');
    card.nowText.setColor(rank > 0 ? MENU.TEXT_GOOD : MENU.TEXT_MUTED);
    // rank pips, right-aligned along the bottom
    const g = card.pips;
    g.clear();
    const px0 = CARD_W / 2 - 8 - MENU_META.KENNEL_MAX * (PIP_W + 2) + 2;
    const py = CARD_H / 2 - 17;
    for (let i = 0; i < MENU_META.KENNEL_MAX; i++) {
      const x = px0 + i * (PIP_W + 2);
      g.fillStyle(MENU.OUTLINE, 1);
      g.fillRect(x - 1, py - 1, PIP_W + 2, 9);
      g.fillStyle(i < rank ? MENU.FOCUS : 0x4a3a2a, 1);
      g.fillRect(x, py, PIP_W, 7);
      if (i < rank) {
        g.fillStyle(0xffffff, 0.45);
        g.fillRect(x, py, PIP_W, 1);
      }
    }
    if (popRank > 0) {
      const x = px0 + (popRank - 1) * (PIP_W + 2) + PIP_W / 2;
      const spark = this.add.rectangle(card.x + x, card.y + py + 3, PIP_W + 4, 11, 0xffffff, 0.9);
      this.tweens.add({ targets: spark, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 260, onComplete: () => spark.destroy() });
    }
    if (price === null) {
      card.cost.setText('MAX').setColor(MENU.TEXT_GOOD);
      card.costIcon.setVisible(false);
      card.cost.setX(-CARD_W / 2 + 10);
    } else {
      const afford = SaveData.get().bones >= price;
      card.cost.setText(`${price}`).setColor(afford ? MENU.TEXT_GOLD : MENU.TEXT_BAD);
    }
  }

  onFocus(item) {
    if (!item || !this.info) return;
    if (item === this.backBtn) {
      this.setInfo('Back to the title', MENU.TEXT_MUTED);
      return;
    }
    const rank = SaveData.get().kennel[item.key] || 0;
    const price = kennelCost(rank);
    const k = MENU_META.KENNEL[item.key];
    if (price === null) this.setInfo(`${k.name} is maxed: ${kennelEffect(item.key, rank)}`, MENU.TEXT_GOOD);
    else this.setInfo(`Rank ${rank + 1}: ${kennelEffect(item.key, rank + 1)} for ${price} Golden Bones`, MENU.TEXT);
  }

  setInfo(str, color) {
    this.info.setText(str).setColor(color);
  }

  buy(card) {
    const res = SaveData.buyKennel(card.key);
    const k = MENU_META.KENNEL[card.key];
    if (!res.ok) {
      card.deny();
      if (res.reason === 'funds') {
        this.setInfo(`Need ${res.need} more Golden Bone${res.need === 1 ? '' : 's'}`, MENU.TEXT_BAD);
        this.balanceText.setColor(MENU.TEXT_BAD);
        shake(this, this.balanceText, this.balanceText.x);
        this.time.delayedCall(MENU.SHAKE_MS, () => this.balanceText.setColor(MENU.TEXT_GOLD));
      } else {
        this.setInfo(`${k.name} is already MAX`, MENU.TEXT_GOOD);
      }
      eventBus.emit(Events.MENU_SELECT, { action: 'denied' });
      return;
    }
    eventBus.emit(Events.MENU_SELECT, { action: 'buy' });
    this.refreshCard(card, res.rank);
    for (const c of this.cards) if (c !== card) this.refreshCard(c);
    this.setInfo(`${k.name} rank ${res.rank}! ${kennelEffect(card.key, res.rank)}`, MENU.TEXT_GOOD);
    this.countBalance(res.balance);
  }

  countBalance(to) {
    const from = this.shownBalance;
    this.shownBalance = to;
    this.tweens.addCounter({
      from, to, duration: 350, ease: 'Quad.easeOut',
      onUpdate: (tw) => this.balanceText.setText(fmt(tw.getValue())),
      onComplete: () => this.balanceText.setText(fmt(to)),
    });
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK);
    this.scene.start('TitleScene', { focus: 'kennel' });
  }

  textState() {
    const d = SaveData.get();
    return { screen: 'kennel', focus: this.nav.current?.key, bones: d.bones, kennel: { ...d.kennel } };
  }
}
