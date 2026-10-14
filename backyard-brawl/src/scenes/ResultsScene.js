// Results: "KNOCKED OUT!" / "BACKYARD DEFENDED!", score count-up, rank / NEW
// BEST, run stats, build summary, Golden Bones breakdown (count-up), unlock
// cards. Records the run once (SaveData.recordRun; debug runs never write).
// Space = instant replay (same runConfig), Enter = focused button, Esc = title.

import Phaser from 'phaser';
import { GAME, UI, MENU, MENU_META, ICON_FRAMES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { SaveData, normalizeResult } from '../core/SaveData.js';
import { Button } from '../ui/Button.js';
import {
  MenuNav, bindMenuKeys, menuText, addBackdrop, addPanel, boneIcon, fmt, fmtTime,
} from '../ui/Menu.js';
import { fadeIn } from '../fx/Transitions.js';

const PANEL_Y = 66;
const PANEL_H = 110;

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  init(data) {
    this.raw = data?.result || gameState.result || {};
  }

  create() {
    fadeIn(this); // Step 3A: quick fade-in (never delays the scene change)
    const raw = this.raw;
    const r = normalizeResult(raw);
    this.r = r;
    const win = r.victory;
    gameState.mode = win ? MODES.VICTORY : MODES.GAME_OVER;
    this.leaving = false;

    // Record once, even if this scene restarts
    if (!raw.record) raw.record = SaveData.recordRun(raw);
    const rec = raw.record;
    this.rec = rec;

    const W = GAME.WIDTH;
    const cx = W / 2;
    addBackdrop(this, 'arena', 0.62);

    menuText(this, cx, 17, win ? 'BACKYARD DEFENDED!' : 'KNOCKED OUT!', {
      size: UI.TITLE_SIZE, color: win ? MENU.TEXT_GOLD : MENU.TEXT, origin: 0.5, stroke: 4,
    });
    this.scoreText = menuText(this, cx, 41, 'SCORE 0', { size: UI.HEADING_SIZE + 2, color: MENU.TEXT_GOLD, origin: 0.5, stroke: 4 });
    let tag = '';
    if (rec.isNewBest) tag = 'NEW BEST!';
    else if (rec.rank > 0) tag = `#${rec.rank} IN THE TOP 10`;
    else tag = `BEST ${fmt(rec.best)}`;
    this.tag = menuText(this, cx, 58, tag, {
      size: UI.BODY_SIZE + 1, color: rec.isNewBest ? '#ff9a5a' : MENU.TEXT, origin: 0.5, stroke: 3,
    }).setAlpha(0);

    this.buildStats(10, PANEL_Y, 224, PANEL_H);
    this.buildBones(W - 10 - 224, PANEL_Y, 224, PANEL_H);
    this.buildUnlocks(PANEL_Y + PANEL_H + 4);

    // Buttons
    const by = 224;
    const defs = [
      { key: 'again', label: 'PLAY AGAIN', w: 132, fn: () => this.replay(), primary: true },
      { key: 'weapon', label: 'WEAPON', w: 100, fn: () => this.changeWeapon() },
      { key: 'title', label: 'TITLE', w: 88, fn: () => this.toTitle() },
    ];
    const gap = 10;
    let x = cx - (defs.reduce((s, d) => s + d.w, 0) + gap * (defs.length - 1)) / 2;
    const buttons = defs.map((d) => {
      const b = new Button(this, x + d.w / 2, by, d.w, MENU.BTN_H, d.label, d.fn, { primary: d.primary, fontSize: UI.BODY_SIZE + 2 });
      b.key = d.key;
      x += d.w + gap;
      return b;
    });
    this.nav = new MenuNav(buttons);
    const touchUi = !!this.sys.game.device.input.touch;
    menuText(this, cx, 249, touchUi ? 'Tap a button' : 'Space play again · Enter select · Esc title', {
      size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
    });
    if (!rec.saved) {
      menuText(this, cx, 262, SaveData.writable ? '(could not save)' : '(debug run: not saved)', {
        size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
      });
    }

    bindMenuKeys(this, this.nav, {
      back: () => this.toTitle(),
      guardMs: UI.REPLAY_GUARD_MS,
      confirmKeys: ['ENTER'],
      extra: { SPACE: () => this.replay() },
    });

    this.countUp();

    eventBus.emit(Events.GAME_OVER, { result: raw });
    eventBus.emit(Events.MUSIC_GAMEOVER, { win });
    eventBus.emit(Events.GAME_OVER_SHOWN, { isNewBest: rec.isNewBest, rank: rec.rank, win });
  }

  buildStats(x, y, w, h) {
    const r = this.r;
    addPanel(this, x, y, w, h);
    const rows = [
      ['WAVE', r.victory && !r.endless ? `${r.wave} (all clear)` : `${r.wave}${r.endless ? ' (endless)' : ''}`],
      ['LEVEL', `${r.level}`],
      ['KILLS', fmt(r.kills)],
      ['TIME', fmtTime(r.timeSec)],
      ['BEST COMBO', `${r.bestCombo}`],
    ];
    if (r.bossesBeaten.length) {
      rows.push(['BOSSES', r.bossesBeaten.length > 1 ? 'Tom + Robo-Vac' : (MENU_META.BOSS_NAMES[r.bossesBeaten[0]] || r.bossesBeaten[0])]);
    }
    const step = rows.length > 5 ? 10 : 11;
    rows.forEach(([k, v], i) => {
      const ry = y + 11 + i * step;
      menuText(this, x + 84, ry, k, { size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: [1, 0.5], stroke: 2 });
      menuText(this, x + 92, ry, v, { size: UI.BODY_SIZE, color: MENU.TEXT, origin: [0, 0.5], stroke: 2 });
    });
    // Build summary: weapon icons + levels
    const by = y + h - 24;
    menuText(this, x + 10, by, 'BUILD', { size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: [0, 0.5], stroke: 2 });
    r.weapons.slice(0, 4).forEach((wp, i) => {
      const ix = x + 58 + i * 40;
      this.add.image(ix, by, 'icons', ICON_FRAMES[wp.key] ?? 0);
      menuText(this, ix + 13, by + 6, `${wp.level}`, { size: UI.SMALL_SIZE + 1, color: MENU.TEXT_GOLD, origin: [0, 0.5], stroke: 2 });
    });
  }

  buildBones(x, y, w, h) {
    const b = this.rec.bones;
    const r = this.r;
    addPanel(this, x, y, w, h);
    boneIcon(this, x + 14, y + 12);
    menuText(this, x + 24, y + 12, 'GOLDEN BONES', { size: UI.BODY_SIZE + 1, color: MENU.TEXT_GOLD, origin: [0, 0.5], stroke: 2 });
    const rows = [
      [`Score ${fmt(r.score)} / ${fmt(MENU_META.BONES_SCORE_DIV)}`, b.fromScore],
      [`Waves cleared ${r.wavesCleared} x ${MENU_META.BONES_PER_WAVE}`, b.fromWaves],
      ['Found in the yard', b.drops],
    ];
    this.boneRows = rows.map(([label, v], i) => {
      const ry = y + 29 + i * 13;
      const l = menuText(this, x + 10, ry, label, { size: UI.SMALL_SIZE, color: MENU.TEXT, origin: [0, 0.5], stroke: 2 }).setAlpha(0);
      const t = menuText(this, x + w - 10, ry, `+${v}`, { size: UI.BODY_SIZE, color: MENU.TEXT_GOLD, origin: [1, 0.5], stroke: 2 }).setAlpha(0);
      return [l, t];
    });
    const g = this.add.graphics();
    g.fillStyle(MENU.WOOD, 1);
    g.fillRect(x + 8, y + 68, w - 16, 1);
    menuText(this, x + 10, y + 79, 'EARNED', { size: UI.BODY_SIZE, color: MENU.TEXT, origin: [0, 0.5], stroke: 2 });
    this.earnedText = menuText(this, x + w - 10, y + 79, '+0', { size: UI.BODY_SIZE + 2, color: MENU.TEXT_GOLD, origin: [1, 0.5], stroke: 3 });
    menuText(this, x + 10, y + 95, 'BALANCE', { size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: [0, 0.5], stroke: 2 });
    this.balanceText = menuText(this, x + w - 22, y + 95, fmt(this.rec.prevBalance), { size: UI.BODY_SIZE, color: MENU.TEXT, origin: [1, 0.5], stroke: 2 });
    boneIcon(this, x + w - 14, y + 95).setScale(0.75);
  }

  buildUnlocks(y) {
    const rec = this.rec;
    const W = GAME.WIDTH;
    const items = rec.newWeapons.map(k => ({ kind: 'weapon', key: k }));
    if (rec.endlessUnlocked) items.push({ kind: 'endless' });
    this.unlockCards = [];
    if (!items.length) {
      // Motivation: the next locked weapon and its condition
      const save = SaveData.get();
      const next = MENU_META.WEAPON_ORDER.find(k => !save.unlocks.weapons.includes(k));
      if (next) {
        const info = MENU_META.WEAPON_INFO[next];
        menuText(this, W / 2, y + 12, `Next unlock: ${info.name} (${info.unlockText})`, {
          size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
        });
      }
      return;
    }
    const n = items.length;
    const gap = 6;
    const cw = Math.min(170, Math.floor((W - 20 - gap * (n - 1)) / n));
    const ch = 26;
    let x = W / 2 - (cw * n + gap * (n - 1)) / 2;
    items.forEach((it) => {
      const c = this.add.container(x + cw / 2, y + ch / 2);
      const g = this.add.graphics();
      const parts = [g];
      // gold frame card
      g.fillStyle(MENU.OUTLINE, 1).fillRect(-cw / 2 - 1, -ch / 2 - 1, cw + 2, ch + 2);
      g.fillStyle(MENU.FOCUS, 1).fillRect(-cw / 2, -ch / 2, cw, ch);
      g.fillStyle(MENU.PANEL, 1).fillRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4);
      const big = n <= 2;
      const compact = n >= 4;
      let tx = -cw / 2 + 6;
      if (it.kind === 'weapon') {
        const ix = compact ? -cw / 2 + 12 : -cw / 2 + 15;
        parts.push(this.add.image(ix, 0, 'icons', ICON_FRAMES[it.key] ?? 0).setScale(big ? 1 : 0.75));
        tx = compact ? -cw / 2 + 23 : -cw / 2 + 29;
      }
      let line1 = big ? 'NEW WEAPON UNLOCKED:' : (compact ? 'NEW!' : 'NEW WEAPON');
      let line2 = it.kind === 'weapon' ? MENU_META.WEAPON_INFO[it.key].name.toUpperCase() : 'UNLOCKED!';
      if (it.kind === 'endless') line1 = big ? 'ENDLESS MODE' : 'ENDLESS';
      parts.push(menuText(this, tx, -6, line1, { size: UI.SMALL_SIZE, color: MENU.TEXT_GOLD, origin: [0, 0.5], stroke: 2 }));
      parts.push(menuText(this, tx, 5, line2, { size: compact ? UI.SMALL_SIZE + 1 : UI.BODY_SIZE, color: MENU.TEXT, origin: [0, 0.5], stroke: 2 }));
      c.add(parts);
      c.setScale(0).setAlpha(0);
      this.unlockCards.push(c);
      x += cw + gap;
    });
  }

  countUp() {
    const r = this.r;
    const rec = this.rec;
    const D = MENU.COUNT_MS;
    this.tweens.addCounter({
      from: 0, to: r.score, duration: D, ease: 'Cubic.easeOut',
      onUpdate: (tw) => this.scoreText.setText(`SCORE ${fmt(tw.getValue())}`),
      onComplete: () => {
        this.scoreText.setText(`SCORE ${fmt(r.score)}`);
        this.tweens.add({ targets: this.tag, alpha: 1, duration: 150 });
        if (rec.isNewBest) {
          this.tweens.add({ targets: this.tag, scale: 1.15, duration: 220, yoyo: true, repeat: 2 });
        }
      },
    });
    this.boneRows.forEach(([l, t], i) => {
      this.tweens.add({ targets: [l, t], alpha: 1, duration: 120, delay: 200 + i * 180 });
    });
    const bonesDelay = 200 + this.boneRows.length * 180;
    this.tweens.addCounter({
      from: 0, to: rec.bones.total, duration: Math.min(700, 120 + rec.bones.total * 12), delay: bonesDelay, ease: 'Quad.easeOut',
      onUpdate: (tw) => this.earnedText.setText(`+${fmt(tw.getValue())}`),
      onComplete: () => this.earnedText.setText(`+${fmt(rec.bones.total)}`),
    });
    this.tweens.addCounter({
      from: rec.prevBalance, to: rec.saved ? rec.balance : rec.prevBalance, duration: 600, delay: bonesDelay + 200,
      onUpdate: (tw) => this.balanceText.setText(fmt(tw.getValue())),
      onComplete: () => this.balanceText.setText(fmt(rec.saved ? rec.balance : rec.prevBalance)),
    });
    this.unlockCards.forEach((c, i) => {
      this.tweens.add({
        targets: c, scale: 1, alpha: 1, duration: 260, delay: MENU.UNLOCK_DELAY_MS + i * 160, ease: 'Back.easeOut',
        onStart: () => eventBus.emit(Events.MENU_SELECT, { action: 'unlock' }),
      });
    });
  }

  replay() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_SELECT, { action: 'retry' });
    eventBus.emit(Events.GAME_RESTART);
    this.scene.start('ArenaScene');
  }

  changeWeapon() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_SELECT, { action: 'weapon' });
    this.scene.start('WeaponSelectScene', { from: 'results' });
  }

  toTitle() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK);
    this.scene.start('TitleScene');
  }

  textState() {
    const rec = this.rec;
    return {
      screen: 'results',
      focus: this.nav.current?.key,
      rank: rec.rank,
      isNewBest: rec.isNewBest,
      saved: rec.saved,
      bones: rec.bones,
      balance: rec.balance,
      newWeapons: rec.newWeapons,
      endlessUnlocked: rec.endlessUnlocked,
    };
  }
}
