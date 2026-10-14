// Level-up overlay over the (frozen) arena: 3 cards from world.choices.
// Keys 1/2/3 pick; Left/Right (or A/D) + Enter/Space pick the focused card;
// click/tap a card; R or the REROLL button rerolls (limited; the button is the
// touch path). With ?autoplay=1 the bot picks.
//
// Juice (Step 3A, FX tunables): the dim fades in, the title punches in, cards
// slide up and flip in with a stagger, the focused card hops and bobs, rare
// cards shimmer, and a pick pops the chosen card (the others drop away)
// before the overlay closes. The pick itself (world.choose) is immediate.

import Phaser from 'phaser';
import { GAME, UI, COLORS, DEPTH, ICON_FRAMES, FX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { Button } from '../ui/Button.js';

const INPUT_GUARD_MS = 180;
const REROLL_Y = 236;     // under the cards (they end at y 214), over the hint line

export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super('LevelUpScene');
  }

  init(data) {
    this.world = data.world;
    this.bot = data.bot || null;
  }

  create() {
    this.focus = 0;
    this.cards = [];
    this.openedAt = this.time.now;
    this.done = false;
    this.busy = false;

    const dim = this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, COLORS.OVERLAY, COLORS.OVERLAY_ALPHA).setOrigin(0, 0).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 140 });
    this.dim = dim;
    this.title = this.add.text(GAME.WIDTH / 2, 44, '', {
      fontFamily: UI.FONT, fontSize: `${UI.HEADING_SIZE + 2}px`, fontStyle: 'bold',
      color: COLORS.ACCENT_TEXT, stroke: COLORS.STROKE, strokeThickness: 5,
    }).setOrigin(0.5);
    this.hint = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 14, '', {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, color: COLORS.MUTED_TEXT,
      stroke: COLORS.STROKE, strokeThickness: 3,
    }).setOrigin(0.5);

    const kb = this.input.keyboard;
    const guard = (fn) => (e) => {
      if (e?.repeat || this.done || this.busy || this.time.now - this.openedAt < INPUT_GUARD_MS || this.bot) return;
      fn();
    };
    kb.on('keydown-ONE', guard(() => this.pick(0)));
    kb.on('keydown-TWO', guard(() => this.pick(1)));
    kb.on('keydown-THREE', guard(() => this.pick(2)));
    kb.on('keydown-LEFT', guard(() => this.move(-1)));
    kb.on('keydown-A', guard(() => this.move(-1)));
    kb.on('keydown-RIGHT', guard(() => this.move(1)));
    kb.on('keydown-D', guard(() => this.move(1)));
    kb.on('keydown-ENTER', guard(() => this.pick(this.focus)));
    kb.on('keydown-SPACE', guard(() => this.pick(this.focus)));
    kb.on('keydown-R', guard(() => this.reroll()));

    // REROLL button under the cards (touch players have no R key)
    this.touchUi = !!this.sys.game.device.input.touch;
    this.rerollBtn = new Button(this, GAME.WIDTH / 2, REROLL_Y, 104, 18, 'REROLL', () => {
      if (this.bot || this.done || this.busy || this.time.now - this.openedAt < INPUT_GUARD_MS) return;
      this.reroll();
    }, { fontSize: UI.BODY_SIZE, depth: DEPTH.HUD + 2 });

    this.build();
  }

  build() {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.busy = false;
    const choices = this.world.choices || [];
    this.title.setText(`LEVEL ${this.world.level}!`).setScale(2).setAlpha(0);
    this.tweens.killTweensOf(this.title);
    this.tweens.add({ targets: this.title, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
    const left = this.world.rerolls;
    if (this.touchUi) this.hint.setText('Tap a card to pick it');
    else this.hint.setText(left > 0 ? `1/2/3 or click to pick  ·  R reroll (${left})` : '1/2/3 or click to pick');
    this.rerollBtn.setLabel(`REROLL (${left})`);
    this.rerollBtn.setVisible(left > 0 && !this.bot);
    const n = choices.length;
    const total = n * UI.CARD_W + (n - 1) * UI.CARD_GAP;
    const x0 = (GAME.WIDTH - total) / 2 + UI.CARD_W / 2;
    const y = GAME.HEIGHT / 2 + 4;
    choices.forEach((card, i) => this.cards.push(this.makeCard(x0 + i * (UI.CARD_W + UI.CARD_GAP), y, card, i)));
    this.focus = Math.min(this.focus, Math.max(0, n - 1));
    this.drawFocus();
    // Entrance: slide up + flip in, staggered
    this.cards.forEach((c, i) => {
      c.setY(y + FX.CARD_RISE).setScale(0, 1).setAlpha(0);
      this.tweens.add({
        targets: c, y, scaleX: 1, alpha: 1,
        delay: i * FX.CARD_STAGGER_MS, duration: FX.CARD_IN_MS, ease: 'Back.Out',
      });
    });
    if (this.bot) {
      this.time.delayedCall(UI.LEVELUP_AUTOPICK_MS, () => this.pick(this.bot.pickCard(this.world)));
    }
  }

  makeCard(x, y, card, i) {
    const W = UI.CARD_W;
    const H = UI.CARD_H;
    const g = this.add.graphics();
    // Level line: "NEW!" for a new weapon, "Lv 3 → 4" for levels (stat cards too)
    const from = card.from ?? card.level - 1;
    let kindLabel;
    if (card.kind === 'newWeapon') kindLabel = 'NEW!';
    else if (card.kind === 'snack') kindLabel = 'SNACK';
    else kindLabel = `${card.rare ? 'RARE · ' : ''}Lv ${from} → ${card.level}`;
    const isNew = card.kind === 'newWeapon';
    const icon = this.add.image(0, -H / 2 + 34, 'icons', ICON_FRAMES[card.key] ?? 0).setScale(1.5);
    const name = this.add.text(0, -H / 2 + 62, card.name, {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE + 1}px`, fontStyle: 'bold', color: COLORS.DARK_TEXT,
      align: 'center', wordWrap: { width: W - 12 },
    }).setOrigin(0.5, 0);
    const kind = this.add.text(0, -H / 2 + 8, kindLabel, {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, fontStyle: 'bold',
      color: card.rare ? '#b07a00' : (isNew ? '#c0392b' : '#7a5a3a'),
    }).setOrigin(0.5, 0);
    const desc = this.add.text(0, -H / 2 + 84, card.desc, {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, color: COLORS.DARK_TEXT,
      align: 'center', wordWrap: { width: W - 14 },
    }).setOrigin(0.5, 0);
    const key = this.add.text(0, H / 2 - 14, `[${i + 1}]`, {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, fontStyle: 'bold', color: '#7a5a3a',
    }).setOrigin(0.5, 0);
    // Rare cards get a moving shine band (drawn in update, under the text)
    const shine = card.rare ? this.add.graphics() : null;
    const inner = this.add.container(0, 0, shine ? [g, shine, icon, kind, name, desc, key] : [g, icon, kind, name, desc, key]);
    const flash = this.add.rectangle(0, 0, W + 4, H + 4, 0xffffff, 1).setAlpha(0);
    inner.add(flash);
    const c = this.add.container(x, y, [inner]).setDepth(DEPTH.HUD);
    c.inner = inner;
    c.baseY = y;
    c.shine = shine;
    c.flash = flash;
    c.hop = 0;
    c.cardGfx = g;
    c.card = card;
    c.hovered = false;
    const zone = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true }).setDepth(DEPTH.HUD + 1);
    zone.on('pointerover', () => { this.focus = i; this.drawFocus(); });
    zone.on('pointerdown', () => {
      if (this.bot || this.time.now - this.openedAt < INPUT_GUARD_MS) return;
      this.pick(i);
    });
    const destroy = c.destroy.bind(c);
    c.destroy = () => { zone.destroy(); destroy(); };
    return c;
  }

  drawFocus() {
    this.cards.forEach((c, i) => {
      const g = c.cardGfx;
      const W = UI.CARD_W;
      const H = UI.CARD_H;
      const on = i === this.focus;
      g.clear();
      g.fillStyle(0x1a1208, 1).fillRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4);
      g.fillStyle(c.card.rare ? COLORS.CARD_RARE : COLORS.CARD_EDGE, 1).fillRect(-W / 2, -H / 2, W, H);
      g.fillStyle(on ? COLORS.CARD_HOVER : COLORS.CARD, 1).fillRect(-W / 2 + 3, -H / 2 + 3, W - 6, H - 6);
      if (on) {
        g.lineStyle(2, 0xffd44a, 1).strokeRect(-W / 2 - 4, -H / 2 - 4, W + 8, H + 8);
      }
      if (on && !c.focused) c.hop = 1; // newly focused: hop
      c.focused = on;
    });
  }

  update(time, delta) {
    const W = UI.CARD_W;
    const H = UI.CARD_H;
    for (const c of this.cards) {
      // focus lift + hop + idle bob (whole pixels)
      c.hop = Math.max(0, c.hop - delta / 160);
      const lift = c.focused ? 4 + Math.sin(time / 180) * FX.CARD_BOB + 5 * Math.sin(c.hop * Math.PI) : 0;
      c.inner.y = -Math.round(lift);
      if (c.shine) {
        const g = c.shine;
        g.clear();
        const u = (time % FX.SHIMMER_PERIOD_MS) / FX.SHIMMER_PERIOD_MS;
        const x0 = -W / 2 - 30 + (W + 60) * u;
        for (let yy = -H / 2 + 3; yy < H / 2 - 3; yy += 2) {
          const bx = Math.round(x0 + yy * 0.35);
          const l = Math.max(-W / 2 + 3, bx);
          const r = Math.min(W / 2 - 3, bx + 6);
          if (r > l) g.fillStyle(0xffffff, 0.45).fillRect(l, yy, r - l, 2);
          const l2 = Math.max(-W / 2 + 3, bx + 10);
          const r2 = Math.min(W / 2 - 3, bx + 12);
          if (r2 > l2) g.fillStyle(0xffffff, 0.3).fillRect(l2, yy, r2 - l2, 2);
        }
      }
    }
  }

  move(d) {
    const n = this.cards.length;
    if (!n) return;
    this.focus = (this.focus + d + n) % n;
    this.drawFocus();
    eventBus.emit(Events.MENU_MOVE);
  }

  reroll() {
    if (this.world.reroll()) {
      eventBus.emit(Events.MENU_SELECT, { action: 'reroll' });
      this.openedAt = this.time.now;
      this.build();
    }
  }

  pick(i) {
    if (this.done || this.busy) return;
    const card = this.world.choose(i);
    if (!card) return;
    eventBus.emit(Events.MENU_SELECT, { action: 'card', key: card.key });
    const pending = this.world.phase === 'levelup';
    if (!pending) this.done = true;
    this.busy = true;
    this.popCards(i, () => {
      if (pending) {
        // Another level is pending: fresh cards
        this.openedAt = this.time.now;
        this.build();
      } else {
        this.scene.stop();
      }
    });
  }

  /** Pick confirmation: the chosen card pops and flashes, the others drop away. */
  popCards(i, then) {
    const ms = FX.CARD_OUT_MS;
    this.cards.forEach((c, k) => {
      this.tweens.killTweensOf(c);
      c.setScale(1).setAlpha(1).setY(c.baseY);
      if (k === i) {
        c.flash.setAlpha(0.8);
        this.tweens.add({ targets: c, scale: 1.12, duration: ms * 0.45, yoyo: true, ease: 'Quad.Out' });
        this.tweens.add({ targets: c.flash, alpha: 0, duration: ms });
      } else {
        this.tweens.add({ targets: c, y: c.y + 24, alpha: 0, duration: ms, ease: 'Quad.In' });
      }
    });
    if (!this.world.choices) this.tweens.add({ targets: [this.dim, this.title, this.hint], alpha: 0, delay: ms * 0.4, duration: ms * 0.6 });
    this.time.delayedCall(ms, then);
  }
}
