// =============================================================================
// Code-drawn playing cards for the Blackjack table.
//
//   ensureCardTextures(scene)       draws 'bj-card-<card>' x52 + 'bj-card-back' once
//   const c = new CardSprite(scene, x, y, 'AS', { faceUp: false });
//   await c.flip(true);             scaleX squash, texture swap, cardFlip sfx
//   await c.moveTo(x, y, { angle, ms, delay });
//
// Faces: cream card, rounded corners, big corner index, classic pip layouts,
// a large centre suit on aces, and a crown / tiara / paw motif on K / Q / J.
// The back is pixel art (a 42x60 grid scaled x4) in Booker's palette: a
// burgundy diamond lattice with a brass paw medallion.
// Textures are drawn at 2x (168x240) and shown at 84x120.
// =============================================================================

import Phaser from 'phaser';
import { RANKS, SUITS, rankOf, suitOf, isRed } from './logic.js';
import { CARD } from './config.js';
import { playSfx } from '../../audio/sfx.js';

const S = CARD.TEX_SCALE;
const TW = CARD.W * S;   // 168
const TH = CARD.H * S;   // 240
const RED = '#c0392b';
const BLACK = '#1d1b22';
const CREAM = '#fbf3df';
const CREAM_EDGE = '#d8c69c';

export const cardKey = (card) => `bj-card-${card}`;
export const BACK_KEY = 'bj-card-back';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Suit glyph centred on (0,0), about `s` px tall. */
function suitPath(ctx, suit, s) {
  const k = s / 2;
  ctx.beginPath();
  if (suit === 'D') {
    ctx.moveTo(0, -k);
    ctx.lineTo(k * 0.72, 0);
    ctx.lineTo(0, k);
    ctx.lineTo(-k * 0.72, 0);
    ctx.closePath();
    ctx.fill();
  } else if (suit === 'H') {
    ctx.moveTo(0, k * 0.95);
    ctx.bezierCurveTo(-k * 0.2, k * 0.6, -k, k * 0.15, -k, -k * 0.35);
    ctx.bezierCurveTo(-k, -k * 0.95, -k * 0.2, -k * 1.0, 0, -k * 0.45);
    ctx.bezierCurveTo(k * 0.2, -k * 1.0, k, -k * 0.95, k, -k * 0.35);
    ctx.bezierCurveTo(k, k * 0.15, k * 0.2, k * 0.6, 0, k * 0.95);
    ctx.closePath();
    ctx.fill();
  } else if (suit === 'S') {
    ctx.moveTo(0, -k);
    ctx.bezierCurveTo(k * 0.2, -k * 0.6, k, -k * 0.2, k, k * 0.25);
    ctx.bezierCurveTo(k, k * 0.75, k * 0.3, k * 0.8, k * 0.08, k * 0.42);
    ctx.lineTo(k * 0.3, k);
    ctx.lineTo(-k * 0.3, k);
    ctx.lineTo(-k * 0.08, k * 0.42);
    ctx.bezierCurveTo(-k * 0.3, k * 0.8, -k, k * 0.75, -k, k * 0.25);
    ctx.bezierCurveTo(-k, -k * 0.2, -k * 0.2, -k * 0.6, 0, -k);
    ctx.closePath();
    ctx.fill();
  } else {
    // clubs: three balls + stem
    const r = k * 0.42;
    ctx.arc(0, -k * 0.45, r, 0, Math.PI * 2);
    ctx.moveTo(-k * 0.46 + r, k * 0.12);
    ctx.arc(-k * 0.46, k * 0.12, r, 0, Math.PI * 2);
    ctx.moveTo(k * 0.46 + r, k * 0.12);
    ctx.arc(k * 0.46, k * 0.12, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-k * 0.1, 0);
    ctx.lineTo(k * 0.1, 0);
    ctx.lineTo(k * 0.32, k);
    ctx.lineTo(-k * 0.32, k);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSuit(ctx, suit, x, y, s, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.rotate(Math.PI);
  suitPath(ctx, suit, s);
  ctx.restore();
}

// Pip positions on the 168x240 face (x columns 52/84/116; y rows top..bottom)
const C1 = 54, C2 = 84, C3 = 114;
const R = [50, 84, 103, 120, 137, 156, 190];
const PIPS = {
  2: [[C2, R[0]], [C2, R[6]]],
  3: [[C2, R[0]], [C2, R[3]], [C2, R[6]]],
  4: [[C1, R[0]], [C3, R[0]], [C1, R[6]], [C3, R[6]]],
  5: [[C1, R[0]], [C3, R[0]], [C2, R[3]], [C1, R[6]], [C3, R[6]]],
  6: [[C1, R[0]], [C3, R[0]], [C1, R[3]], [C3, R[3]], [C1, R[6]], [C3, R[6]]],
  7: [[C1, R[0]], [C3, R[0]], [C2, 85], [C1, R[3]], [C3, R[3]], [C1, R[6]], [C3, R[6]]],
  8: [[C1, R[0]], [C3, R[0]], [C2, 85], [C1, R[3]], [C3, R[3]], [C2, 155], [C1, R[6]], [C3, R[6]]],
  9: [[C1, R[0]], [C3, R[0]], [C1, 97], [C3, 97], [C2, R[3]], [C1, 143], [C3, 143], [C1, R[6]], [C3, R[6]]],
  10: [[C1, R[0]], [C3, R[0]], [C2, 73], [C1, 97], [C3, 97], [C1, 143], [C3, 143], [C2, 167], [C1, R[6]], [C3, R[6]]],
};

function drawFaceBase(ctx) {
  ctx.clearRect(0, 0, TW, TH);
  roundRect(ctx, 1, 1, TW - 2, TH - 2, 14);
  const g = ctx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#f1e4c4');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = CREAM_EDGE;
  ctx.stroke();
}

// 5x7 pixel glyphs for the card ranks (crisper than any font at this size)
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
};

/** Pixel rank centred on (cx, cy); cell = size of one glyph pixel. Returns the width. */
function drawRank(ctx, rank, cx, cy, cell) {
  const chars = rank.split('');
  const widths = chars.map(ch => GLYPHS[ch][0].length);
  const total = widths.reduce((a, b) => a + b, 0) + (chars.length - 1);
  let x = Math.round(cx - (total * cell) / 2);
  const y = Math.round(cy - (7 * cell) / 2);
  chars.forEach((ch, k) => {
    GLYPHS[ch].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
    });
    x += (widths[k] + 1) * cell;
  });
  return total * cell;
}

function drawIndex(ctx, rank, suit, color) {
  const draw = () => {
    ctx.fillStyle = color;
    drawRank(ctx, rank, 26, 32, rank === '10' ? 4 : 6);
    drawSuit(ctx, suit, 26, 70, 26);
  };
  draw();
  ctx.save();
  ctx.translate(TW, TH);
  ctx.rotate(Math.PI);
  draw();
  ctx.restore();
}

function drawCrown(ctx, cx, cy, w, color, tiara = false) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const h = w * 0.55;
  ctx.moveTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy - h / 2 + (tiara ? h * 0.35 : 0));
  ctx.lineTo(cx - w / 4, cy);
  ctx.lineTo(cx, cy - h / 2 - (tiara ? 0 : h * 0.15));
  ctx.lineTo(cx + w / 4, cy);
  ctx.lineTo(cx + w / 2, cy - h / 2 + (tiara ? h * 0.35 : 0));
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2c94c';
  for (const dx of [-w / 2, 0, w / 2]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy - h / 2 + (dx === 0 ? -(tiara ? 0 : h * 0.15) : (tiara ? h * 0.35 : 0)) - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(cx - w / 2, cy + h / 2 - 6, w, 6);
}

function drawPaw(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.18, s * 0.34, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes = [[-0.36, -0.2], [-0.13, -0.38], [0.13, -0.38], [0.36, -0.2]];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(cx + tx * s, cy + ty * s, s * 0.12, s * 0.15, tx * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCourt(ctx, rank, suit, color) {
  // inner frame
  const x = 42, y = 30, w = TW - 84, h = TH - 60;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = isRedSuit(suit) ? 'rgba(192,57,43,0.08)' : 'rgba(29,27,34,0.07)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#c9a24a';
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 5);
  ctx.stroke();
  // motif
  if (rank === 'K') drawCrown(ctx, TW / 2, 82, 54, color);
  else if (rank === 'Q') drawCrown(ctx, TW / 2, 84, 46, color, true);
  else drawPaw(ctx, TW / 2, 82, 50, color);
  // big letter
  ctx.fillStyle = color;
  drawRank(ctx, rank, TW / 2, 146, 8);
  drawSuit(ctx, suit, TW / 2, 194, 24);
}

const isRedSuit = (s) => s === 'H' || s === 'D';

function drawFace(ctx, card) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  const color = isRed(card) ? RED : BLACK;
  drawFaceBase(ctx);
  drawIndex(ctx, rank, suit, color);
  ctx.fillStyle = color;
  if (rank === 'A') {
    drawSuit(ctx, suit, TW / 2, TH / 2, suit === 'D' ? 84 : 76);
    if (suit === 'S') {
      // Booker's ace of spades: a tiny paw on the big spade
      drawPaw(ctx, TW / 2, TH / 2 - 2, 26, '#f2c94c');
    }
  } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
    drawCourt(ctx, rank, suit, color);
  } else {
    const n = Number(rank);
    for (const [px, py] of PIPS[n]) drawSuit(ctx, suit, px, py, 28, py > TH / 2 + 1);
  }
}

// --- pixel-art back (42x60 grid, x4) ---------------------------------------------------

function drawBack(ctx) {
  const GW = 42, GH = 60, P = 4;
  ctx.clearRect(0, 0, TW, TH);
  const OUT = '#2a170c', CR = '#f6ecd4', BR = '#c9a24a', BRD = '#8a6a2a';
  const F1 = '#6e1d2a', F2 = '#8e2a38', DOT = '#e7b956', PAW = '#f6ecd4';
  const cx = 20.5, cy = 29.5;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      // rounded corners (radius 3 cells)
      const dx = Math.min(x, GW - 1 - x), dy = Math.min(y, GH - 1 - y);
      if (dx + dy < 2 || (dx === 0 && dy < 3) || (dy === 0 && dx < 3)) continue;
      const d = Math.min(dx, dy);
      let c;
      if (d === 0 || (dx + dy === 2)) c = OUT;
      else if (d <= 2) c = CR;
      else if (d === 3) c = BR;
      else if (d === 4) c = BRD;
      else {
        const lx = (x + y) % 6, ly = (x - y + 600) % 6;
        c = (lx === 0 || ly === 0) ? F2 : F1;
        if (lx === 0 && ly === 0) c = DOT;
        const rr = Math.hypot(x - cx, (y - cy) * 0.95);
        if (rr < 10.5) c = rr > 9.3 ? BR : rr > 8.3 ? BRD : '#5a1621';
      }
      ctx.fillStyle = c;
      ctx.fillRect(x * P, y * P, P, P);
    }
  }
  // paw in the medallion (pixel blocks)
  const paw = [
    '..##..##..',
    '..##..##..',
    '#........#',
    '##.####.##',
    '..######..',
    '.########.',
    '.########.',
    '..######..',
  ];
  const ox = Math.round(cx - 4.5), oy = Math.round(cy - 4);
  ctx.fillStyle = PAW;
  paw.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect((ox + i) * P, (oy + j) * P, P, P);
  });
}

/** Create every card texture once per game (they live in the global texture manager). */
export function ensureCardTextures(scene) {
  const tm = scene.textures;
  const make = (key, draw) => {
    if (tm.exists(key)) return;
    const tex = tm.createCanvas(key, TW, TH);
    draw(tex.getContext());
    tex.refresh();
  };
  make(BACK_KEY, drawBack);
  for (const s of SUITS) for (const r of RANKS) make(cardKey(r + s), (ctx) => drawFace(ctx, r + s));
}

// --- sprite -------------------------------------------------------------------------------

export class CardSprite extends Phaser.GameObjects.Container {
  constructor(scene, x, y, card, { faceUp = true, depth = 0 } = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.card = card;
    this.faceUp = faceUp;
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.32);
    this.shadow.fillRoundedRect(-CARD.W / 2 + 3, -CARD.H / 2 + 5, CARD.W, CARD.H, 8);
    this.img = scene.add.image(0, 0, faceUp ? cardKey(card) : BACK_KEY).setScale(1 / S);
    this.add([this.shadow, this.img]);
    this.setDepth(depth);
  }

  setFace(up) {
    this.faceUp = up;
    this.img.setTexture(up ? cardKey(this.card) : BACK_KEY);
    return this;
  }

  /** scaleX squash -> swap -> unsquash. */
  flip(up = !this.faceUp, ms = 130) {
    const s = this.scene;
    return new Promise((resolve) => {
      playSfx('cardFlip');
      s.tweens.add({
        targets: this, scaleX: 0, y: this.y - 6, duration: ms, ease: 'Quad.easeIn',
        onComplete: () => {
          this.setFace(up);
          s.tweens.add({ targets: this, scaleX: 1, y: this.y + 6, duration: ms, ease: 'Quad.easeOut', onComplete: () => resolve() });
        },
      });
    });
  }

  moveTo(x, y, { angle = 0, ms = 260, delay = 0, ease = 'Cubic.easeOut', scale = 1 } = {}) {
    const s = this.scene;
    return new Promise((resolve) => {
      s.tweens.add({ targets: this, x, y, angle, scaleY: scale, scaleX: scale, duration: ms, delay, ease, onComplete: () => resolve() });
    });
  }
}
