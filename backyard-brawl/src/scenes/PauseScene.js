// Pause overlay over the paused ArenaScene: Resume / Restart / Quit to title,
// plus the current build (weapons + stat cards) read from ArenaScene.snapshot().
// Esc or P resumes; arrows/WASD + Enter/Space; R restart; Q quit; click/tap.
// Restart reuses gameState.runConfig (ArenaScene reads it).

import Phaser from 'phaser';
import { GAME, UI, MENU, STATS, ICON_FRAMES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { Button } from '../ui/Button.js';
import { MenuNav, bindMenuKeys, menuText, addPanel, fmt } from '../ui/Menu.js';

/** Stat total -> short text, e.g. damage 0.3 -> "+30%". */
function statValue(key, v) {
  if (['speed', 'damage', 'firerate', 'pickup', 'crit', 'area'].includes(key)) return `+${Math.round(v * 100)}%`;
  if (key === 'regen') return `+${Math.round(v * 100) / 100}/s`;
  if (key === 'heart') return `+${Math.round(v)} HP`;
  return `+${Math.round(v * 10) / 10}`;
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const W = GAME.WIDTH;
    const H = GAME.HEIGHT;
    this.leaving = false;
    this.add.rectangle(0, 0, W, H, MENU.DIM, 0.7).setOrigin(0, 0);

    const snap = this.readBuild();
    const hasBuild = !!snap;
    const lx = hasBuild ? 118 : W / 2;

    menuText(this, lx, 38, 'PAUSED', { size: UI.TITLE_SIZE, color: MENU.TEXT, origin: 0.5, stroke: 5 });
    if (snap) {
      menuText(this, lx, 60, `Wave ${snap.wave} · Lv ${snap.level} · ${fmt(snap.score)} pts`, {
        size: UI.SMALL_SIZE + 1, color: MENU.TEXT_GOLD, origin: 0.5, stroke: 2,
      });
    }
    const bw = 132;
    const defs = [
      ['resume', 'RESUME', () => this.resume(), true],
      ['restart', 'RESTART', () => this.restart(), false],
      ['quit', 'QUIT TO TITLE', () => this.quit(), false],
    ];
    const buttons = defs.map(([key, label, fn, primary], i) => {
      const b = new Button(this, lx, 92 + i * 32, bw, MENU.BTN_H, label, fn, { primary });
      b.key = key;
      return b;
    });
    this.nav = new MenuNav(buttons);

    if (hasBuild) {
      const n = Object.entries(snap.stats || {}).filter(([k, v]) => STATS[k] && v > 0).length;
      const h = 78 + Math.max(1, Math.ceil(Math.min(n, 10) / 2)) * 26;
      this.drawBuild(snap, 236, Math.max(18, 118 - h / 2), 232, h);
    }

    const touchUi = !!this.sys.game.device.input.touch;
    menuText(this, W / 2, H - 14, touchUi ? 'Tap a button' : 'Esc/P resume · R restart · Q quit · M mute', {
      size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2,
    });

    bindMenuKeys(this, this.nav, {
      back: () => this.resume(),
      guardMs: 0,
      extra: { P: () => this.resume(), R: () => this.restart(), Q: () => this.quit() },
    });
  }

  readBuild() {
    try {
      const arena = this.scene.get('ArenaScene');
      const s = arena?.snapshot?.();
      return s && Array.isArray(s.weapons) ? s : null;
    } catch {
      return null;
    }
  }

  drawBuild(snap, x, y, w, h) {
    addPanel(this, x, y, w, h);
    menuText(this, x + w / 2, y + 12, 'YOUR BUILD', { size: UI.BODY_SIZE + 2, color: MENU.TEXT_GOLD, origin: 0.5, stroke: 3 });
    // Weapons: icon + level pips
    snap.weapons.slice(0, 4).forEach((wp, i) => {
      const ix = x + 32 + i * 56;
      const iy = y + 40;
      this.add.image(ix, iy, 'icons', ICON_FRAMES[wp.key] ?? 0);
      menuText(this, ix + 14, iy + 7, `L${wp.level}`, { size: UI.SMALL_SIZE + 1, color: MENU.TEXT_GOLD, origin: [0, 0.5], stroke: 2 });
    });
    if (!snap.weapons.length) {
      menuText(this, x + w / 2, y + 40, 'No weapons', { size: UI.SMALL_SIZE, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2 });
    }
    // Stat cards taken so far
    const stats = Object.entries(snap.stats || {}).filter(([k, v]) => STATS[k] && v > 0);
    const sy = y + 62;
    if (!stats.length) {
      menuText(this, x + w / 2, sy + 10, 'No stat cards yet', { size: UI.SMALL_SIZE + 1, color: MENU.TEXT_MUTED, origin: 0.5, stroke: 2 });
      return;
    }
    stats.slice(0, 10).forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = x + 10 + col * (w / 2 - 4);
      const ry = sy + row * 26;
      this.add.image(sx + 6, ry + 6, 'icons', ICON_FRAMES[k] ?? 6).setScale(0.5);
      menuText(this, sx + 15, ry + 1, STATS[k].name, { size: UI.SMALL_SIZE, color: MENU.TEXT, stroke: 2 });
      menuText(this, sx + 15, ry + 11, statValue(k, v), { size: UI.SMALL_SIZE, color: MENU.TEXT_GOOD, stroke: 2 });
    });
  }

  resume() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.GAME_RESUME);
    this.scene.resume('ArenaScene');
    this.scene.stop();
  }

  restart() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.GAME_RESTART);
    this.scene.stop('LevelUpScene');
    this.scene.stop('ArenaScene');
    this.scene.start('ArenaScene');
  }

  quit() {
    if (this.leaving) return;
    this.leaving = true;
    eventBus.emit(Events.MENU_BACK);
    gameState.mode = MODES.TITLE;
    this.scene.stop('LevelUpScene');
    this.scene.stop('ArenaScene');
    this.scene.start('TitleScene');
  }

  textState() {
    return { screen: 'pause', focus: this.nav.current?.key };
  }
}
