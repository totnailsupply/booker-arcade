// =============================================================================
// LevelCard.js — one card on the level select (148x100 at 1x).
//
//   ┌──────────────────────────────┐   number badge, NEW! tag, ability icon on
//   │[2] NEW!   thumbnail      (ab)│   the thumbnail; best-progress strip along
//   │                     ✓/trophy │   its bottom edge; L6 shows the golden steak
//   ├──────────────────────────────┤
//   │ THE DOCKS              ★ ★ ☆ │   name + best stars
//   │ +DOUBLE JUMP                 │   the ability this level adds
//   │ BEST 2945            CLEARED │   best score / best % / unlock rule
//   └──────────────────────────────┘
// Locked: dark thumbnail, padlock and "CLEAR LEVEL N" on it, dim text.
// The container sits at the card's top-left; children use local pixels.
// =============================================================================

import Phaser from 'phaser';
import { SELECT_UI as L, UI_COLORS as C } from '../core/Constants.js';
import { ABILITIES, UI_ICON } from '../core/Abilities.js';
import { text, setText, setColor } from './PixelFont.js';
import { panel, pixelRect, ring, icon, burst, UI_TEX } from './UiKit.js';

const THUMB_X = Math.round((L.CARD_W - L.THUMB_W) / 2);
const CROP_Y = Math.round((72 - L.THUMB_H) / 2);
const LOCKED_TINT = 0x3b3550;
const DIM_TINT = 0xb4aac6;

export class LevelCard {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} lv     registry entry (LEVELS[i])
   * @param {object} info   SaveData.summary().levels[i]
   * @param {number} x,y    top-left
   * @param {object} opts   { isNew, revealPending }
   */
  constructor(scene, lv, info, x, y, opts = {}) {
    this.scene = scene;
    this.level = lv;
    this.info = info;
    this.x = x;
    this.y = y;
    this.isNew = !!opts.isNew;
    this.locked = !info.unlocked || !!opts.revealPending;   // drawn locked until the reveal plays
    this.focused = false;

    const c = scene.add.container(x, y);
    this.container = c;
    this.bg = scene.add.graphics();
    c.add(this.bg);

    // Thumbnail (cropped) + frame
    this.thumb = scene.add.image(THUMB_X, L.THUMB_Y - CROP_Y, lv.theme.thumb).setOrigin(0, 0)
      .setCrop(0, CROP_Y, L.THUMB_W, L.THUMB_H);
    this.frame = scene.add.graphics();
    ring(this.frame, THUMB_X - 1, L.THUMB_Y - 1, L.THUMB_W + 2, L.THUMB_H + 2, C.OUTLINE, 1, 0);
    c.add([this.thumb, this.frame]);

    // Best-progress strip along the thumbnail's bottom edge (attempted, not cleared)
    this.strip = scene.add.graphics();
    c.add(this.strip);

    // Number badge
    this.badge = scene.add.graphics();
    panel(this.badge, 3, 1, 18, 20, { fill: C.PANEL_DARK, hi: C.PANEL_HI, shadow: 1 });
    this.num = text(scene, 12, 4, String(lv.number), { scale: 2, align: 'center', color: C.GOLD });
    c.add([this.badge, this.num]);

    // Ability icon (top-right of the thumbnail)
    this.ability = lv.ability ? ABILITIES[lv.ability] : null;
    if (this.ability) {
      this.abBack = scene.add.graphics();
      pixelRect(this.abBack, L.CARD_W - 33, 3, 28, 28, C.OUTLINE, 0.55, 3);
      this.abIcon = icon(scene, L.CARD_W - 19, 17, this.ability.icon, 24);
      c.add([this.abBack, this.abIcon]);
    }

    // Level 6 flourish: the golden steak on the thumbnail
    if (lv.data?.finish === 'golden-steak') {
      this.steak = scene.add.image(L.CARD_W - 26, L.THUMB_Y + L.THUMB_H - 12, UI_TEX.GOLDEN_STEAK_SM);
      c.add(this.steak);
      scene.tweens.add({ targets: this.steak, y: this.steak.y - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // Padlock + unlock rule on the thumbnail (locked)
    const lockY = L.THUMB_Y + 20;
    this.lock = icon(scene, L.CARD_W / 2, lockY, UI_ICON.LOCK, 24);
    this.lockText = text(scene, L.CARD_W / 2, lockY + 17, `CLEAR LEVEL ${lv.number - 1}`, { align: 'center', color: C.MUTED });
    c.add([this.lock, this.lockText]);

    // Text rows under the thumbnail
    const rowY = L.THUMB_Y + L.THUMB_H + 5;
    this.name = text(scene, 8, rowY, lv.name.toUpperCase(), { color: C.INK });
    const abLabel = this.ability ? `+${this.ability.name.toUpperCase()}` : 'JUMP: TAP / HOLD';
    this.abText = text(scene, 8, rowY + 11, abLabel, { color: this.ability ? C.ORANGE : C.DIM });
    this.status = text(scene, 8, rowY + 22, '', { color: C.MUTED });
    this.statusRight = text(scene, L.CARD_W - 8, rowY + 22, '', { align: 'right', color: C.GOOD });
    c.add([this.name, this.abText, this.status, this.statusRight]);

    // Stars (12 px)
    this.stars = [0, 1, 2].map(i => icon(scene, L.CARD_W - 13 - (2 - i) * 13, rowY + 3, UI_ICON.STAR_OFF, 12));
    c.add(this.stars);

    // Cleared badge on the thumbnail (check, or a trophy for 3 stars)
    this.clearBadge = scene.add.graphics();
    this.clearIcon = icon(scene, THUMB_X + 9, L.THUMB_Y + L.THUMB_H - 9, UI_ICON.TROPHY, 12);
    this.clearCheck = text(scene, THUMB_X + 9, L.THUMB_Y + L.THUMB_H - 9, '✓', { align: 'center', valign: 'middle', color: C.GOOD });
    c.add([this.clearBadge, this.clearIcon, this.clearCheck]);

    // NEW! tag
    this.newTag = scene.add.container(25, 3);
    const ng = scene.add.graphics();
    panel(ng, 0, 0, 28, 13, { fill: C.NEW_TAG, hi: 0xff9aa4, shadow: 1 });
    this.newTag.add([ng, text(scene, 14, 3, 'NEW!', { align: 'center', color: C.INK, flat: true })]);
    c.add(this.newTag);
    this.newBlink = scene.tweens.add({ targets: this.newTag, alpha: 0.55, duration: 450, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });

    // "PLAY >" pill on the focused, unlocked card (tap target cue)
    this.play = scene.add.container(L.CARD_W - 34, L.THUMB_Y + L.THUMB_H - 9);
    const pg = scene.add.graphics();
    panel(pg, -24, -7, 48, 14, { fill: C.BTN, hi: 0xffc27a, shadow: 1 });
    this.play.add([pg, text(scene, 0, -3, 'PLAY >', { align: 'center', color: C.INK, flat: true })]);
    c.add(this.play);

    // Container hit tests add half the size (they assume a centred origin), so the
    // rect is shifted by half to cover the card's local 0..W x 0..H.
    c.setSize(L.CARD_W, L.CARD_H);
    c.setInteractive(new Phaser.Geom.Rectangle(L.CARD_W / 2, L.CARD_H / 2, L.CARD_W, L.CARD_H),
      Phaser.Geom.Rectangle.Contains);
    if (c.input) c.input.cursor = 'pointer';
    this.refresh();
  }

  /** Re-applies every state-dependent visual. */
  refresh() {
    const info = this.info;
    const locked = this.locked;
    const cleared = !locked && info.completed;
    const played = !locked && !info.completed && info.bestProgress > 0;

    this.draw();
    this.thumb.setTint(locked ? LOCKED_TINT : (this.focused ? 0xffffff : DIM_TINT));
    this.lock.setVisible(locked);
    this.lockText.setVisible(locked && this.level.number > 1);
    this.newTag.setVisible(!locked && this.isNew);
    this.play.setVisible(!locked && this.focused);
    if (this.abIcon) this.abIcon.setTint(locked ? 0x6a6280 : 0xffffff).setAlpha(locked ? 0.8 : 1);
    if (this.steak) {
      // Locked: a dark teaser in the corner. Open: centre-bottom, clear of the PLAY pill.
      this.steak.setTint(locked ? 0x2a2236 : 0xffffff);
      this.steak.x = locked ? L.CARD_W - 26 : Math.round(L.CARD_W / 2);
    }

    setColor(this.name, locked ? C.DIM : C.INK);
    setColor(this.abText, locked ? C.DISABLED : (this.ability ? C.ORANGE : C.DIM));
    this.stars.forEach((s, i) => {
      s.setFrame(!locked && i < info.bestStars ? UI_ICON.STAR_ON : UI_ICON.STAR_OFF);
      s.setAlpha(locked ? 0.35 : 1);
    });

    if (locked) {
      setText(this.status, 'LOCKED');
      setColor(this.status, C.DISABLED);
      setText(this.statusRight, '');
    } else if (cleared) {
      setText(this.status, `BEST ${info.bestScore}`);
      setColor(this.status, C.GOLD);
      setText(this.statusRight, 'CLEARED');
      setColor(this.statusRight, C.GOOD);
    } else if (played) {
      setText(this.status, `BEST ${Math.round(info.bestProgress * 100)}%`);
      setColor(this.status, C.MUTED);
      setText(this.statusRight, `TRIES ${info.attempts}`);
      setColor(this.statusRight, C.DIM);
    } else if (info.attempts === 0 && this.level.number === 1) {
      setText(this.status, 'START HERE!');
      setColor(this.status, C.GOLD);
      setText(this.statusRight, '');
    } else {
      setText(this.status, info.attempts > 0 ? `TRIES ${info.attempts}` : 'NOT PLAYED');
      setColor(this.status, C.DIM);
      setText(this.statusRight, '');
    }

    // Cleared badge
    const perfect = cleared && info.bestStars >= 3;
    this.clearBadge.clear();
    if (cleared) {
      panel(this.clearBadge, THUMB_X + 1, L.THUMB_Y + L.THUMB_H - 17, 16, 16, { fill: C.PANEL_DARK, hi: perfect ? C.GOLD_DARK : 0x2f8a4a, shadow: 0 });
    }
    this.clearIcon.setVisible(perfect);
    this.clearCheck.setVisible(cleared && !perfect);

    // Progress strip
    this.strip.clear();
    if (played) {
      const w = Math.round(L.THUMB_W * info.bestProgress);
      this.strip.fillStyle(0x000000, 0.6).fillRect(THUMB_X, L.THUMB_Y + L.THUMB_H - 3, L.THUMB_W, 3);
      this.strip.fillStyle(C.ORANGE, 1).fillRect(THUMB_X, L.THUMB_Y + L.THUMB_H - 3, w, 3);
    }
  }

  draw() {
    const g = this.bg;
    g.clear();
    if (this.locked) {
      panel(g, 0, 0, L.CARD_W, L.CARD_H, { fill: C.PANEL_LOCKED, hi: C.PANEL_LOCKED_HI, alpha: 0.94 });
    } else if (this.focused) {
      panel(g, 0, 0, L.CARD_W, L.CARD_H, { fill: 0x33265a, hi: C.GOLD, alpha: 0.97, shadow: 3 });
    } else {
      panel(g, 0, 0, L.CARD_W, L.CARD_H, { fill: C.PANEL, hi: C.PANEL_HI, alpha: 0.94 });
    }
  }

  setFocused(on) {
    if (this.focused === on) return;
    this.focused = on;
    this.refresh();
    this.scene.tweens.killTweensOf(this.container);
    this.container.setX(this.x);
    this.scene.tweens.add({
      targets: this.container, y: this.y - (on ? L.LIFT_PX : 0), duration: 90, ease: 'Quad.easeOut',
    });
  }

  /** Locked refusal: shake + padlock bounce. */
  shake() {
    const s = this.scene;
    s.tweens.killTweensOf(this.container);
    this.container.setPosition(this.x, this.y - (this.focused ? L.LIFT_PX : 0));
    s.tweens.add({
      targets: this.container,
      x: this.x + L.LOCKED_SHAKE_PX,
      duration: 40,
      yoyo: true,
      repeat: 3,
      ease: 'Stepped',
      onComplete: () => this.container.setX(this.x),
    });
    s.tweens.add({ targets: this.lock, y: this.lock.y - 3, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Ends a pending or running unlock reveal at once (the player picked the card). */
  finishReveal() {
    if (!this.locked) return;
    this.revealTimer?.remove();
    this.locked = false;
    this.refresh();
    this.lock.setVisible(false);
  }

  /** Padlock pops, the thumbnail lights up, NEW! drops in. */
  playUnlockReveal(onDone) {
    const s = this.scene;
    const lock = this.lock;
    s.tweens.add({ targets: lock, y: lock.y - 4, duration: 120, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
    this.revealTimer = s.time.delayedCall(260, () => {
      if (!this.locked) return;
      this.locked = false;
      this.refresh();
      // keep the padlock visible while it flies off
      lock.setVisible(true);
      s.tweens.add({
        targets: lock, y: lock.y - 18, alpha: 0, angle: 25, duration: 380, ease: 'Quad.easeIn',
        onComplete: () => { lock.setVisible(false).setAlpha(1).setAngle(0); },
      });
      const wx = this.x + L.CARD_W / 2;
      const wy = this.y + L.THUMB_Y + 20;
      burst(s, wx, wy, { count: 28, speed: [50, 150], gravity: 160, lifespan: 800 });
      burst(s, wx, wy, { count: 10, texture: UI_TEX.SPARK, colors: [0xffffff, C.GOLD], speed: [20, 70], gravity: 0, rotate: false, lifespan: 600 });
      this.newTag.setScale(0);
      s.tweens.add({ targets: this.newTag, scale: 1, duration: 260, ease: 'Back.easeOut' });
      onDone?.();
    });
  }
}
