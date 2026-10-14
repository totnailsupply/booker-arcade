// Weapon Select: 6 weapon cards (locked ones greyed with the unlock condition),
// Endless toggle (once unlocked), Start. Keyboard focus starts on the last pick
// and selection follows focus, so Title -> here -> Arena is Enter, Enter.
// Mouse / touch: tap a card to select it, tap it again (or START) to play.

import Phaser from 'phaser';
import { GAME, UI, MENU, MENU_META, ICON_FRAMES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES, makeRunConfig } from '../core/GameState.js';
import { SaveData } from '../core/SaveData.js';
import { Button } from '../ui/Button.js';
import {
  MenuNav, Tile, bindMenuKeys, menuText, addBackdrop, addHeader, fmt,
} from '../ui/Menu.js';
import { fadeIn } from '../fx/Transitions.js';

const CARD_W = 148;
const CARD_H = 62;
const GAP = 6;

export class WeaponSelectScene extends Phaser.Scene {
  constructor() {
    super('WeaponSelectScene');
  }

  init(data) {
    this.from = data?.from || 'title';
  }

  create() {
    fadeIn(this); // Step 3A: quick fade-in (never delays the scene change)
    gameState.mode = MODES.MENU;
    this.leaving = false;
    const save = SaveData.get();
    const W = GAME.WIDTH;
    this.selected = save.unlocks.weapons.includes(gameState.runConfig.startWeapon)
      ? gameState.runConfig.startWeapon : save.lastWeapon;
    this.endless = save.unlocks.endless && (gameState.runConfig.endless || save.lastEndless);

    addBackdrop(this, 'title', 0.72);
    addHeader(this, 'PICK A WEAPON', 15);

    // 3 x 2 card grid
    const x0 = W / 2 - (3 * CARD_W + 2 * GAP) / 2 + CARD_W / 2;
    const y0 = 36 + CARD_H / 2;
    this.cards = MENU_META.WEAPON_ORDER.map((key, i) => {
      const cx = x0 + (i % 3) * (CARD_W + GAP);
      const cy = y0 + Math.floor(i / 3) * (CARD_H + GAP);
      return this.makeCard(key, cx, cy, save);
    });

    // Info line (focused card / messages)
    this.info = menuText(this, W / 2, 186, '', { size: UI.BODY_SIZE, color: MENU.TEXT, origin: 0.5 });

    const by = 216;
    this.backBtn = new Button(this, 52, by, 80, MENU.BTN_H, 'BACK', () => this.back());
    this.startBtn = new Button(this, W / 2, by, 132, MENU.BTN_H + 2, 'START', () => this.start(), {
      fontSize: UI.HEADING_SIZE, primary: true,
    });
    this.endlessBtn = new Button(this, W - 72, by, 128, MENU.BTN_H, '', () => this.toggleEndless(), { fontSize: UI.BODY_SIZE + 1 });
    this.endlessBtn.key = 'endless';
    // A locked Endless (click, Enter or E) buzzes: audio maps action 'denied'
    const denyEndless = this.endlessBtn.deny.bind(this.endlessBtn);
    this.endlessBtn.deny = () => {
      denyEndless();
      eventBus.emit(Events.MENU_SELECT, { action: 'denied' });
    };
    this.startBtn.key = 'start';
    this.backBtn.key = 'back';
    this.refreshEndless();

    menuText(this, W / 2, GAME.HEIGHT - 12, 'Arrows choose · Enter start · Esc back', {
      size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
    });

    const start = Math.max(0, MENU_META.WEAPON_ORDER.indexOf(this.selected));
    this.nav = new MenuNav([...this.cards, this.backBtn, this.startBtn, this.endlessBtn], {
      start,
      onFocus: (item, _i, source) => this.onFocus(item, source),
    });
    this.onFocus(this.nav.current);
    this.refreshSelection();

    bindMenuKeys(this, this.nav, {
      back: () => this.back(),
      extra: { E: () => this.toggleEndless() },
    });
  }

  makeCard(key, x, y, save) {
    const info = MENU_META.WEAPON_INFO[key];
    const unlocked = save.unlocks.weapons.includes(key);
    const left = -CARD_W / 2;
    const icon = this.add.image(left + 30, 0, 'icons', ICON_FRAMES[key]).setScale(2);
    const tx = left + 58;
    const name = menuText(this, tx, -CARD_H / 2 + 7, info.name.toUpperCase(), {
      size: UI.BODY_SIZE + 2, color: unlocked ? MENU.TEXT_GOLD : MENU.TEXT_MUTED,
    });
    const body = unlocked ? info.blurb : `LOCKED: ${info.unlockText}`;
    const blurb = menuText(this, tx, -CARD_H / 2 + 22, body, {
      size: UI.SMALL_SIZE, color: unlocked ? MENU.TEXT : MENU.TEXT_BAD, stroke: 2, wrap: CARD_W / 2 - tx - 6,
    });
    const children = [icon, name, blurb];
    if (!unlocked) {
      icon.setTint(MENU.LOCKED_TINT);
      children.push(this.lockGlyph(left + 30, 0));
      const prog = this.progressText(key, save);
      if (prog) {
        children.push(menuText(this, tx, CARD_H / 2 - 13, prog, { size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, stroke: 2 }));
      }
    }
    const card = new Tile(this, x, y, CARD_W, CARD_H, {
      children,
      label: key,
      onClick: (t, via) => this.pickCard(t, via),
    });
    card.key = key;
    card.unlocked = unlocked;
    card.setEnabled(unlocked);
    return card;
  }

  lockGlyph(x, y) {
    const g = this.add.graphics();
    g.fillStyle(MENU.OUTLINE, 1);
    g.fillRect(x - 7, y - 3, 14, 12);
    g.fillRect(x - 5, y - 10, 10, 8);
    g.fillStyle(0xc8b49a, 1);
    g.fillRect(x - 6, y - 2, 12, 10);
    g.fillStyle(MENU.OUTLINE, 1);
    g.fillRect(x - 4, y - 9, 8, 7);
    g.fillStyle(0xc8b49a, 1);
    g.fillRect(x - 3, y - 8, 6, 6);
    g.fillStyle(MENU.OUTLINE, 1);
    g.fillRect(x - 2, y - 7, 4, 5);
    g.fillRect(x - 1, y + 1, 2, 4);
    return g;
  }

  progressText(key, save) {
    const u = MENU_META.WEAPON_INFO[key].unlock || {};
    const st = save.stats;
    if (u.wave) return `Best: wave ${st.bestWave}`;
    if (u.kills) return `Kills: ${fmt(st.kills)}/${fmt(u.kills)}`;
    if (u.boss) return 'Boss of wave 5';
    if (u.wins) return `Wins: ${st.wins}`;
    return '';
  }

  /** Keyboard focus on an unlocked card selects it; pointer hover only shows info. */
  onFocus(item, source = 'key') {
    if (!item || !this.info) return;
    if (item instanceof Tile) {
      const info = MENU_META.WEAPON_INFO[item.key];
      if (item.unlocked) {
        if (source === 'key') {
          this.selected = item.key;
          this.refreshSelection();
        }
        this.setInfo(`${info.name}: ${info.blurb}`, MENU.TEXT);
      } else {
        this.setInfo(`${info.name} is locked. ${info.unlockText} to unlock.`, MENU.TEXT_BAD);
      }
    } else if (item === this.endlessBtn) {
      this.setInfo(SaveData.get().unlocks.endless
        ? 'Endless: the waves keep coming after wave 10' : MENU_META.ENDLESS_UNLOCK_TEXT, MENU.TEXT);
    } else if (item === this.startBtn) {
      this.setInfo(`Start with ${MENU_META.WEAPON_INFO[this.selected].name}${this.endless ? ' (Endless)' : ''}`, MENU.TEXT_GOLD);
    } else {
      this.setInfo('Back to the title', MENU.TEXT_MUTED);
    }
  }

  setInfo(str, color) {
    this.info.setText(str).setColor(color);
  }

  refreshSelection() {
    for (const c of this.cards) c.setSelected(c.key === this.selected);
  }

  refreshEndless() {
    const unlocked = SaveData.get().unlocks.endless;
    this.endlessBtn.setLabel(unlocked ? `ENDLESS: ${this.endless ? 'ON' : 'OFF'}` : 'ENDLESS: LOCKED');
    this.endlessBtn.setEnabled(unlocked);
    this.endlessBtn.text.setColor(this.endless ? MENU.TEXT_GOOD : MENU.TEXT);
  }

  pickCard(card, via) {
    if (!card.unlocked) {
      card.deny();
      eventBus.emit(Events.MENU_SELECT, { action: 'denied' });
      this.nav.focusItem(card);
      this.onFocus(card);
      return;
    }
    // Keyboard: focus already selected it -> start. Pointer: first tap selects, second starts.
    if (via === 'pointer' && this.selected !== card.key) {
      this.selected = card.key;
      this.refreshSelection();
      this.onFocus(card);
      eventBus.emit(Events.MENU_MOVE);
      return;
    }
    this.selected = card.key;
    this.start();
  }

  toggleEndless() {
    if (!SaveData.get().unlocks.endless) {
      this.endlessBtn.deny();
      this.setInfo(MENU_META.ENDLESS_UNLOCK_TEXT, MENU.TEXT_BAD);
      return;
    }
    this.endless = !this.endless;
    this.refreshEndless();
    this.onFocus(this.nav.current);
    eventBus.emit(Events.MENU_MOVE);
  }

  start() {
    if (this.leaving) return;
    this.leaving = true;
    SaveData.setLastPick(this.selected, this.endless);
    gameState.runConfig = makeRunConfig(this.selected, this.endless);
    eventBus.emit(Events.MENU_SELECT, { action: 'play' });
    this.scene.start('ArenaScene');
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK);
    this.scene.start('TitleScene', { focus: 'play' });
  }

  textState() {
    return {
      screen: 'weaponSelect',
      focus: this.nav.current?.key,
      selected: this.selected,
      endless: this.endless,
      unlocked: [...SaveData.get().unlocks.weapons],
    };
  }
}
