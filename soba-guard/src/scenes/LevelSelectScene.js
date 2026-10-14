import Phaser from 'phaser';
import { GAME } from '../core/Constants.js';
import { META_TEXT, META_COLORS, MENU, LEVEL_NODES, SELECT_MENU as S } from '../core/MetaConstants.js';
import { gameState, MODES } from '../core/GameState.js';
import { ITEM } from '../core/Assets.js';
import { SaveData } from '../core/SaveData.js';
import { createButton } from '../ui/Button.js';
import { MenuNav } from '../ui/MenuNav.js';
import {
  menuText, menuButtonOpts, ensureMenuAnims, drawNightSky, drawPanel, addBoneBadge, drawMuteSlot,
  fadeIn, fadeTo, toast, shakeX, allLevelInfo, nextUnlock, unitName, startBattle,
} from '../ui/MenuKit.js';
import { addMenuAmbience } from '../fx/Ambient.js';

// Five gardens on a path. A node is playable when its level data exists and the
// level before it is cleared; otherwise it shows a lock ("Coming soon" when the
// level isn't built yet). Arrows move between nodes, Enter plays, Esc goes back.

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  init(data) {
    this.wantFocus = data?.focus ?? null;
  }

  create() {
    gameState.mode = MODES.TITLE;
    this.menuLeaving = false;
    // scene instances are reused: clear last visit's (destroyed) objects
    this.selected = null;
    this.soba = null;
    this.infoName = null;
    this.nodes = null;
    ensureMenuAnims(this);
    this.levels = allLevelInfo();

    drawNightSky(this, { moon: false });
    addMenuAmbience(this);
    this.drawHills();
    this.drawPath();

    const cx = GAME.WIDTH / 2;
    menuText(this, cx, S.TITLE_Y, 'Choose a garden', META_TEXT.SUBTITLE, META_COLORS.TEXT_GOLD, { strokeThickness: META_TEXT.STROKE_BIG }).setOrigin(0.5);
    const next = nextUnlock();
    const nextLine = next ? `Next crew member: ${unitName(next.unit)} (clear ${next.levelName})` : 'Every crew member unlocked!';
    menuText(this, cx, S.TITLE_Y + S.SUBTITLE_DY, nextLine, META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0.5);

    this.nav = new MenuNav(this, { onBack: () => this.back(), onFocus: (name) => this.onFocus(name) });
    const BB = MENU.BACK_BTN;
    this.backBtn = createButton(this, BB.X + BB.W / 2, BB.Y + BB.H / 2, BB.W, BB.H, '< BACK', () => this.back(),
      menuButtonOpts({ color: META_COLORS.BTN_ALT, hover: META_COLORS.BTN_ALT_HOVER, size: META_TEXT.BODY }));

    this.nodes = this.levels.map((info, i) => this.makeNode(info, LEVEL_NODES[i]));
    // Left/Right walk the path in order; Up goes to Back, Down to Play
    const count = this.nodes.length;
    this.nodes.forEach((node, i) => this.nav.add(`level${node.info.n}`, node, {
      left: i > 0 ? `level${i}` : null,
      right: i < count - 1 ? `level${i + 2}` : null,
      up: 'back',
      down: 'play',
    }));
    this.nav.add('back', this.backBtn);

    this.soba = this.add.sprite(0, 0, 'soba', 0).setOrigin(0.5, 1);
    this.soba.play('menu-soba-idle');

    this.drawInfoPanel();

    const first = this.wantFocus && this.levels[this.wantFocus - 1] ? this.wantFocus : this.defaultFocus();
    this.nav.focus(`level${first}`);
    this.placeSoba(this.nodes[first - 1], false);
    this.selected = this.nodes[first - 1]; // already standing there: no run
    this.onFocus(`level${first}`);

    const badge = addBoneBadge(this, MENU.MUTE_SLOT.X - MENU.BONE_BADGE.W - MENU.BONE_BADGE.X, MENU.BONE_BADGE.Y);
    this.bones = badge;
    drawMuteSlot(this);
    fadeIn(this);
  }

  /** The newest playable level that isn't cleared, else the last playable one. */
  defaultFocus() {
    const playable = this.levels.filter(l => l.playable);
    const open = playable.find(l => !l.cleared);
    return (open || playable[playable.length - 1] || this.levels[0]).n;
  }

  drawHills() {
    const g = this.add.graphics();
    const colors = [META_COLORS.SKY_TOP, META_COLORS.PANEL];
    S.HILLS.forEach((h, i) => {
      g.fillStyle(colors[i], h.alpha);
      for (let x = h.x0; x < GAME.WIDTH + h.r; x += h.step) g.fillCircle(x, GAME.HEIGHT + h.dy, h.r);
    });
  }

  drawPath() {
    const g = this.add.graphics();
    for (let i = 0; i < LEVEL_NODES.length - 1; i++) {
      const a = LEVEL_NODES[i];
      const b = LEVEL_NODES[i + 1];
      const open = this.levels[i + 1].playable;
      g.fillStyle(open ? META_COLORS.PATH : META_COLORS.PATH_LOCKED, 1);
      const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      const steps = Math.floor(len / S.PATH_STEP);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const bend = Math.sin(t * Math.PI) * (i % 2 ? S.PATH_BEND : -S.PATH_BEND);
        g.fillRect(Math.round(a.x + (b.x - a.x) * t) - 1, Math.round(a.y + (b.y - a.y) * t + bend) - 1, S.PATH_DOT, S.PATH_DOT);
      }
    }
  }

  makeNode(info, pos) {
    const c = this.add.container(pos.x, pos.y);
    const g = this.add.graphics();
    const state = { focused: false };
    const R = S.NODE_R;
    const fill = !info.playable ? META_COLORS.NODE_LOCKED : (info.cleared ? META_COLORS.NODE_CLEARED : META_COLORS.NODE);
    const draw = () => {
      g.clear();
      if (state.focused) {
        g.lineStyle(MENU.FOCUS_WIDTH, META_COLORS.FOCUS, 1).strokeCircle(0, 0, R + MENU.FOCUS_PAD + 1);
      }
      g.fillStyle(META_COLORS.NODE_EDGE, 1).fillCircle(0, 2, R);
      g.fillStyle(fill, 1).fillCircle(0, 0, R - 1);
      g.lineStyle(2, META_COLORS.NODE_EDGE, 1).strokeCircle(0, 0, R - 1);
    };
    draw();
    c.add(g);
    if (info.playable) {
      c.add(menuText(this, 0, S.NODE_ICON_DY, String(info.n), META_TEXT.TITLE - 4, META_COLORS.TEXT_DARK, { stroke: '#fff6e0', strokeThickness: 2 }).setOrigin(0.5));
    } else {
      // padlock
      const L = this.add.graphics();
      L.lineStyle(3, META_COLORS.PATH_LOCKED, 1).strokeCircle(0, -S.LOCK_H / 2, S.LOCK_W / 2 - 1);
      L.fillStyle(META_COLORS.PATH, 1).fillRect(-S.LOCK_W / 2, -S.LOCK_H / 2 + 1, S.LOCK_W, S.LOCK_H);
      L.fillStyle(META_COLORS.NODE_EDGE, 1).fillRect(-1, 0, 2, 3);
      c.add(L);
    }
    const label = menuText(this, 0, S.LABEL_DY, info.name, META_TEXT.SMALL, info.playable ? META_COLORS.TEXT : META_COLORS.TEXT_MUTED).setOrigin(0.5);
    c.add(label);
    if (info.exists) {
      info.stars.forEach((on, i) => {
        const star = this.add.image((i - 1) * S.STAR_GAP, S.STARS_DY, 'items', ITEM.STAR).setScale(S.STAR_SCALE);
        if (!on) star.setTint(META_COLORS.STAR_EMPTY).setAlpha(0.8);
        c.add(star);
      });
    } else {
      c.add(menuText(this, 0, S.STARS_DY, 'Coming soon', META_TEXT.SMALL - 1, META_COLORS.TEXT_MUTED).setOrigin(0.5));
    }
    const pad = S.HIT_PAD;
    const hit = this.add.zone(-R - pad, -R - pad, (R + pad) * 2, (R + pad) * 2 + S.STARS_DY - R).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerover', () => c.emit('hover'));
    hit.on('pointerdown', (_p, _x, _y, event) => {
      event?.stopPropagation?.();
      c.emit('hover');
      c.activate();
    });

    c.info = info;
    c.setFocused = (on) => { state.focused = !!on; draw(); return c; };
    c.getBounds2 = () => ({ x: c.x - R, y: c.y - R, w: R * 2, h: R * 2 });
    c.activate = () => this.playLevel(c);
    return c;
  }

  drawInfoPanel() {
    const P = S.INFO;
    drawPanel(this, P.X, P.Y, P.W, P.H);
    const cy = P.Y + P.H / 2;
    this.infoName = menuText(this, P.X + S.INFO_PAD, cy - S.INFO_LINE_DY, '', META_TEXT.LABEL, META_COLORS.TEXT).setOrigin(0, 0.5);
    this.infoSub = menuText(this, P.X + S.INFO_PAD, cy + S.INFO_LINE_DY, '', META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0, 0.5);
    this.rewardIcon = this.add.image(S.REWARD_ICON_X, cy, 'chili', 0).setVisible(false);
    this.rewardTitle = menuText(this, S.REWARD_ICON_X + S.REWARD_TEXT_DX, cy - S.INFO_LINE_DY, '', META_TEXT.SMALL, META_COLORS.TEXT_MUTED).setOrigin(0, 0.5);
    this.rewardName = menuText(this, S.REWARD_ICON_X + S.REWARD_TEXT_DX, cy + S.INFO_LINE_DY, '', META_TEXT.BODY, META_COLORS.TEXT_GOLD).setOrigin(0, 0.5);
    this.playBtn = createButton(this, P.X + P.W - S.INFO_PLAY_W / 2 - S.INFO_PAD / 2, cy, S.INFO_PLAY_W, MENU.BTN_H, 'PLAY', () => {
      if (this.selected) this.playLevel(this.selected);
    }, menuButtonOpts({ color: META_COLORS.BTN_GOOD, hover: META_COLORS.BTN_GOOD_HOVER }));
    this.nav.add('play', this.playBtn);
  }

  onFocus(name) {
    const node = this.nodes?.find(n => `level${n.info.n}` === name);
    if (!node || !this.soba || !this.infoName) return; // still building the screen
    if (this.selected !== node) this.placeSoba(node, true);
    this.selected = node;
    const info = node.info;
    this.infoName.setText(`${info.n}. ${info.name}`);
    if (!info.exists) this.infoSub.setText('Coming soon: this garden is still being planted');
    else if (!info.playable) this.infoSub.setText(info.lockReason);
    else if (info.cleared) this.infoSub.setText(`Best score ${info.bestScore}   Stars ${info.stars.filter(Boolean).length}/3`);
    else this.infoSub.setText('Not cleared yet');

    const reward = info.reward;
    if (reward) {
      const owned = SaveData.isUnitUnlocked(reward);
      this.rewardIcon.setTexture(reward, 0).setVisible(true).setAlpha(owned ? 1 : 0.9);
      this.rewardTitle.setText(owned ? 'Crew member earned' : 'Clear it to unlock');
      this.rewardName.setText(unitName(reward));
    } else {
      this.rewardIcon.setVisible(false);
      this.rewardTitle.setText(info.exists ? '' : 'Reward');
      this.rewardName.setText(info.exists ? '' : '???');
    }
    this.playBtn.setDimmed(!info.playable);
    this.playBtn.setLabel(info.playable ? `PLAY ${info.n}` : 'LOCKED');
  }

  placeSoba(node, animate) {
    if (!node) return;
    const x = node.x;
    const y = node.y + S.SOBA_DY;
    this.tweens.killTweensOf(this.soba);
    if (!animate) {
      this.soba.setPosition(x, y);
      return;
    }
    this.soba.setFlipX(x < this.soba.x);
    this.soba.play('menu-soba-run');
    this.tweens.add({
      targets: this.soba,
      x,
      y,
      duration: S.SOBA_HOP_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => this.soba.play('menu-soba-idle'),
    });
  }

  playLevel(node) {
    const info = node.info;
    if (!info.playable) {
      shakeX(this, node);
      toast(this, info.lockReason || 'Locked', META_COLORS.TEXT_DANGER, S.INFO.Y - S.TOAST_DY);
      return;
    }
    startBattle(this, info.n);
  }

  back() {
    fadeTo(this, 'TitleScene');
  }

  /** For render_game_to_text. */
  menuState() {
    return { selected: this.selected?.info.n ?? null };
  }
}
