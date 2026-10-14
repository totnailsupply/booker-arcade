// =============================================================================
// CharacterPortrait — a framed, breathing character that reacts and talks.
//
//   const soba = new CharacterPortrait(scene, 100, 610, { who: 'soba', size: 160 });
//   soba.react('happy', 1500);     // pop + swap expression, back to the base mood after ms
//   soba.setMood('nervous');       // change the resting expression
//   soba.say('Hit on 12 vs 7!', 2200, { side: 'right' });   // side: right | left | top | below
//   soba.react('booker-proud');    // any texture key works too
//
// who: 'soba' | 'booker-dealer' | 'booker-croupier' | 'booker-stick' |
//      'booker-plinko' | 'booker-cage' | 'booker' (plain mascot head)
// moods: 'neutral' | 'happy' | 'sad' | 'nervous' | 'smug' | 'win' | 'lose' (+ 'sleepy' for Booker)
//   'win' / 'lose' are from THAT character's point of view: when the player wins,
//   BaseGameScene.settle() does soba.react('win') and booker.react('lose').
//
// Options: size (box px, default 160), frame (true: wood plaque + brass edge +
//   name plate), name (plate text; default from who), flip (mirror), bubbleSide
//   ('right' | 'left' | 'top' | 'below'; default right for Soba, left for Booker),
//   bubbleWidth (max bubble width, default 260), depth. Games set bubbleSide /
//   bubbleWidth so bubbles land on empty background, never on table labels.
// Pixel textures stay crisp (NEAREST, set in Preload). The image is fitted
// inside the box keeping its aspect.
// =============================================================================

import Phaser from 'phaser';
import { COLORS, FONT, TIMING } from '../core/Constants.js';
import { text } from './theme.js';

export const PORTRAITS = {
  soba: {
    name: 'Soba',
    moods: { neutral: 'soba-neutral', happy: 'soba-happy', win: 'soba-happy', sad: 'soba-sad', lose: 'soba-sad', nervous: 'soba-nervous', smug: 'soba-smug', sleepy: 'soba-neutral' },
  },
  'booker-dealer': {
    name: 'Booker',
    moods: { neutral: 'dealer', happy: 'dealer-excited', win: 'dealer-sly', smug: 'dealer-sly', sad: 'dealer-sympathy', lose: 'dealer-wince', nervous: 'dealer-wince', sleepy: 'dealer-sleepy' },
  },
  // Croupier (39 px), stickman (28 px) and Plinko host (54 px) sources looked
  // blocky next to Soba's 256 px portrait, so every Booker role uses the
  // 256 px dealer masters (same visor and vest). The small textures stay
  // loaded for other uses. Each role keeps its own reading of win/lose:
  'booker-croupier': {
    name: 'Booker',
    moods: { neutral: 'dealer', happy: 'dealer-excited', win: 'dealer-sly', smug: 'dealer-sly', sad: 'dealer-sympathy', lose: 'dealer-wince', nervous: 'dealer-wince', sleepy: 'dealer-sleepy' },
  },
  'booker-stick': {
    // The stickman roots for the shooter: player wins ('lose' for the house) = cheering call
    name: 'Booker',
    moods: { neutral: 'dealer', happy: 'dealer-excited', win: 'dealer-sly', smug: 'dealer-sly', sad: 'dealer-sympathy', lose: 'dealer-excited', nervous: 'dealer-wince', sleepy: 'dealer-sleepy' },
  },
  'booker-plinko': {
    // The Plinko host is happy for the player too ('lose' = excited)
    name: 'Booker',
    moods: { neutral: 'dealer', happy: 'dealer-excited', win: 'dealer-sly', smug: 'dealer-sly', sad: 'dealer-sympathy', lose: 'dealer-excited', nervous: 'dealer-wince', sleepy: 'dealer-sleepy' },
  },
  'booker-cage': {
    name: 'Cashier',
    moods: { neutral: 'booker-cage' },
  },
  booker: {
    name: 'Booker',
    moods: { neutral: 'booker-head', happy: 'booker-excited', win: 'booker-sly', smug: 'booker-sly', sad: 'booker-sleepy', lose: 'booker-proud', nervous: 'booker-sleepy', sleepy: 'booker-sleepy' },
  },
};

export class CharacterPortrait extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.o = o;
    this.who = PORTRAITS[o.who] ? o.who : 'soba';
    this.def = PORTRAITS[this.who];
    this.size = o.size ?? 160;
    this.baseMood = 'neutral';
    this.mood = 'neutral';
    this.bubbleSide = o.bubbleSide ?? (this.who === 'soba' ? 'right' : 'left');
    this.bubbleWidth = o.bubbleWidth ?? 260;

    const S = this.size;
    if (o.frame !== false) {
      const g = scene.add.graphics();
      g.fillStyle(0x000000, 0.4);
      g.fillRoundedRect(-S / 2 + 2, -S / 2 + 6, S, S, 18);
      g.fillStyle(0x2a1a0f, 1);
      g.fillRoundedRect(-S / 2, -S / 2, S, S, 18);
      g.fillStyle(0x163a28, 1);
      g.fillRoundedRect(-S / 2 + 6, -S / 2 + 6, S - 12, S - 12, 13);
      g.fillStyle(0xffffff, 0.06);
      g.fillCircle(0, -S * 0.12, S * 0.36);
      g.lineStyle(3, COLORS.BRASS, 1);
      g.strokeRoundedRect(-S / 2, -S / 2, S, S, 18);
      this.add(g);
    }
    // Clip the art to the frame window with a mask-free trick: art is fitted inside the box.
    this.img = scene.add.image(0, 0, this.keyFor('neutral'));
    this.add(this.img);
    this.fit();

    if (o.frame !== false) {
      const plateW = Math.min(S - 20, 120);
      const plate = scene.add.graphics();
      plate.fillStyle(0x120c07, 0.95);
      plate.fillRoundedRect(-plateW / 2, S / 2 - 16, plateW, 28, 10);
      plate.lineStyle(2, COLORS.BRASS, 1);
      plate.strokeRoundedRect(-plateW / 2, S / 2 - 16, plateW, 28, 10);
      this.nameText = text(scene, 0, S / 2 - 2, o.name ?? this.def.name, { size: 18, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD_LIGHT });
      this.add([plate, this.nameText]);
    }

    // Idle breathing (scale on the image, phase-shifted per character)
    this.breath = { k: 0 };
    this.breathTween = scene.tweens.add({
      targets: this.breath, k: 1, duration: 1700 + (this.who === 'soba' ? 0 : 400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => this.applyBreath(),
    });
    this.revertTimer = null;
    this.bubble = null;
    if (o.depth !== undefined) this.setDepth(o.depth);
  }

  keyFor(mood) {
    const scene = this.scene;
    if (scene.textures.exists(mood) && !this.def.moods[mood]) return mood; // raw texture key
    const k = this.def.moods[mood] ?? this.def.moods.neutral;
    return scene.textures.exists(k) ? k : this.def.moods.neutral;
  }

  fit() {
    const pad = this.o.frame === false ? 0 : 12;
    const box = this.size - pad * 2;
    const k = box / Math.max(this.img.width, this.img.height);
    this.fitScale = k;
    this.img.setScale(k * (this.o.flip ? -1 : 1), k);
    // sit the art on the bottom of the frame (portraits are chest-up)
    this.imgBaseY = (box - this.img.height * k) / 2 + (this.o.frame === false ? 0 : -2);
    this.img.y = this.imgBaseY;
  }

  applyBreath() {
    if (!this.img.active) return;
    const b = this.breath.k;
    const pop = this.popK ?? 1;
    this.img.scaleY = this.fitScale * (1 + 0.018 * b) * pop;
    this.img.scaleX = this.fitScale * (this.o.flip ? -1 : 1) * (1 - 0.006 * b) * pop;
    this.img.y = this.imgBaseY - 2 * b;
  }

  /** Show an expression now (no timer). */
  show(mood) {
    this.mood = mood;
    const key = this.keyFor(mood);
    if (this.img.texture.key !== key) {
      this.img.setTexture(key);
      this.fit();
    }
    return this;
  }

  /** Change the resting expression. */
  setMood(mood) {
    this.baseMood = mood;
    if (!this.revertTimer) this.show(mood);
    return this;
  }

  /** Pop into a mood for ms, then return to the resting mood. */
  react(mood, ms = TIMING.REACT_MS) {
    const s = this.scene;
    this.show(mood);
    this.revertTimer?.remove(false);
    this.revertTimer = s.time.delayedCall(ms, () => {
      this.revertTimer = null;
      this.show(this.baseMood);
    });
    const p = { k: 1.14 };
    this.popK = 1.14;
    s.tweens.add({
      targets: p, k: 1, duration: 320, ease: 'Back.easeOut',
      onUpdate: () => { this.popK = p.k; this.applyBreath(); },
    });
    if (mood === 'lose' || mood === 'sad' || mood === 'nervous') {
      s.tweens.add({ targets: this, angle: { from: -3, to: 3 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => { this.angle = 0; } });
    } else if (mood === 'win' || mood === 'happy') {
      s.tweens.add({ targets: this, y: this.y - 10, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    }
    return this;
  }

  /** Speech bubble beside the portrait for ms. side: 'right' | 'left' | 'top' | 'below'. */
  say(str, ms = TIMING.SAY_MS, { side = this.bubbleSide, width = this.bubbleWidth } = {}) {
    const s = this.scene;
    this.bubble?.destroy();
    const b = s.add.container(0, 0).setDepth((this.depth || 0) + 5);
    const t = text(s, 0, 0, str, { size: FONT.SIZE.SMALL, color: COLORS.INK, weight: FONT.WEIGHT.SEMI, wrap: width - 28, align: 'left' });
    const w = Math.min(width, t.width + 28);
    const h = t.height + 20;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 14);
    g.fillStyle(COLORS.CREAM, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, COLORS.INK, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const S = this.size;
    let bx, by;
    if (side === 'top') {
      bx = this.x; by = this.y - S / 2 - h / 2 - 16;
      g.fillStyle(COLORS.CREAM, 1);
      g.fillTriangle(-10, h / 2 - 1, 10, h / 2 - 1, 0, h / 2 + 14);
    } else if (side === 'below') {
      // under the name plate (it hangs 12 px below the frame)
      bx = this.x; by = this.y + S / 2 + h / 2 + 30;
      g.fillStyle(COLORS.CREAM, 1);
      g.fillTriangle(-10, -h / 2 + 1, 10, -h / 2 + 1, 0, -h / 2 - 14);
    } else {
      const dir = side === 'left' ? -1 : 1;
      bx = this.x + dir * (S / 2 + w / 2 + 16);
      by = this.y - S * 0.22;
      g.fillStyle(COLORS.CREAM, 1);
      g.fillTriangle(-dir * w / 2 + dir * 1, -8, -dir * w / 2 + dir * 1, 10, -dir * (w / 2 + 14), 4);
    }
    // keep inside the screen
    bx = Math.max(w / 2 + 8, Math.min(1280 - w / 2 - 8, bx));
    by = Math.max(h / 2 + 72, by);
    b.setPosition(bx, by);
    b.add([g, t]);
    b.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.bubble = b;
    this.lastSaid = str;
    s.time.delayedCall(ms, () => {
      if (this.bubble !== b || !b.active) return;
      s.tweens.add({ targets: b, alpha: 0, duration: 180, onComplete: () => b.destroy() });
      this.bubble = null;
    });
    return this;
  }

  preDestroy() {
    this.bubble?.destroy();
    this.revertTimer?.remove(false);
    this.breathTween?.remove();
    super.preDestroy?.();
  }
}
