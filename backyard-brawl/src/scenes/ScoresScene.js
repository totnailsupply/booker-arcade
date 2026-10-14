// High Scores: top-10 table (rank, score, wave, level, weapon icon, time,
// date), newest entry highlighted, lifetime stats line. Esc / Enter / Back.

import Phaser from 'phaser';
import { GAME, UI, MENU, MENU_META, ICON_FRAMES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { SaveData } from '../core/SaveData.js';
import { Button } from '../ui/Button.js';
import {
  MenuNav, bindMenuKeys, menuText, addBackdrop, addHeader, addPanel, fmt, fmtTime,
} from '../ui/Menu.js';
import { fadeIn } from '../fx/Transitions.js';

const ROW_H = 15;
const COLS = {
  rank: 40, score: 122, wave: 156, level: 190, weapon: 220, name: 230, time: 312, tag: 350, date: 452,
};

export class ScoresScene extends Phaser.Scene {
  constructor() {
    super('ScoresScene');
  }

  init(data) {
    this.returnTo = data?.returnTo || 'TitleScene';
  }

  create() {
    fadeIn(this); // Step 3A: quick fade-in (never delays the scene change)
    gameState.mode = MODES.MENU;
    this.leaving = false;
    const W = GAME.WIDTH;
    const save = SaveData.get();

    addBackdrop(this, 'title', 0.72);
    addHeader(this, 'HIGH SCORES', 15);

    const px = 14;
    const py = 30;
    const pw = W - 28;
    const ph = 176;
    addPanel(this, px, py, pw, ph);

    const head = (x, str, origin = 0.5) => menuText(this, x, py + 10, str, {
      size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: [origin, 0.5], stroke: 2,
    });
    head(COLS.rank, '#', 1);
    head(COLS.score, 'SCORE', 1);
    head(COLS.wave, 'WAVE');
    head(COLS.level, 'LV');
    head(COLS.weapon - 6, 'WEAPON', 0);
    head(COLS.time, 'TIME');
    head(COLS.date, 'DATE', 1);
    const g = this.add.graphics();
    g.fillStyle(MENU.WOOD, 1);
    g.fillRect(px + 6, py + 17, pw - 12, 1);

    const scores = save.scores;
    const y0 = py + 28;
    if (!scores.length) {
      menuText(this, W / 2, py + ph / 2, 'No scores yet. Go defend the yard!', {
        size: UI.BODY_SIZE + 1, color: MENU.TEXT, origin: 0.5,
      });
    }
    this.newestRow = -1;
    scores.forEach((s, i) => {
      const y = y0 + i * ROW_H;
      const isNew = s.id && s.id === save.lastScoreId;
      if (isNew) {
        this.newestRow = i;
        const hl = this.add.rectangle(px + 5, y - 7, pw - 10, ROW_H - 1, MENU.ROW_NEW, 1).setOrigin(0, 0);
        this.tweens.add({ targets: hl, alpha: 0.45, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (i % 2 === 1) {
        this.add.rectangle(px + 5, y - 7, pw - 10, ROW_H - 1, MENU.ROW_ALT, 0.8).setOrigin(0, 0);
      }
      const color = i === 0 ? MENU.TEXT_GOLD : MENU.TEXT;
      const t = (x, str, origin = 0.5, c = color) => menuText(this, x, y, str, {
        size: UI.BODY_SIZE, color: c, origin: [origin, 0.5], stroke: 2,
      });
      t(COLS.rank, `${i + 1}.`, 1);
      t(COLS.score, fmt(s.score), 1);
      t(COLS.wave, `${s.wave}`);
      t(COLS.level, `${s.level}`);
      this.add.image(COLS.weapon, y, 'icons', ICON_FRAMES[s.weapon] ?? 0).setScale(0.5);
      t(COLS.name, MENU_META.WEAPON_INFO[s.weapon]?.name || s.weapon, 0, MENU.TEXT_MUTED);
      t(COLS.time, fmtTime(s.time));
      let tag = '';
      if (s.victory) tag = 'WIN';
      if (s.endless) tag = 'ENDLESS';
      if (tag) {
        menuText(this, COLS.tag, y, tag, {
          size: UI.SMALL_SIZE, color: s.victory ? MENU.TEXT_GOOD : MENU.TEXT_GOLD, origin: [0, 0.5], stroke: 2,
        });
      }
      t(COLS.date, isNew ? 'NEW!' : fmtDate(s.date), 1, isNew ? MENU.TEXT_GOLD : MENU.TEXT_MUTED);
    });

    const st = save.stats;
    menuText(this, W / 2, py + ph + 9,
      `Runs ${fmt(st.runs)} · Kills ${fmt(st.kills)} · Best wave ${st.bestWave} · Wins ${st.wins} · Bones earned ${fmt(st.bones)}`, {
        size: UI.SMALL_SIZE, color: MENU.TEXT, origin: 0.5, stroke: 2,
      });

    this.backBtn = new Button(this, W / 2, GAME.HEIGHT - 26, 96, MENU.BTN_H, 'BACK', () => this.back());
    this.backBtn.key = 'back';
    this.nav = new MenuNav([this.backBtn]);
    bindMenuKeys(this, this.nav, { back: () => this.back() });
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK);
    this.scene.start(this.returnTo, { focus: 'scores' });
  }

  textState() {
    const d = SaveData.get();
    return {
      screen: 'scores',
      focus: 'back',
      rows: d.scores.length,
      newestRow: this.newestRow,
      top: d.scores[0]?.score || 0,
      stats: { ...d.stats },
    };
  }
}

/** "2026-10-14" -> "Oct 14" */
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1] || '?'} ${Number(m[3])}`;
}
