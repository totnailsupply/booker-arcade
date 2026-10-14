// =============================================================================
// Textures.js — code-drawn textures (Canvas 2D -> Phaser CanvasTexture).
//
//   generateCoreTextures(scene)   chips, mini chips, particles, glow, vignette
//   generatePlaceholders(scene)   any ART_CONTRACT key that didn't load
//
// Everything here is drawn at boot (PreloadScene) and stays LINEAR-filtered
// (smooth). Placeholders are readable stand-ins: the real art replaces them
// as soon as public/assets/manifest.json lists it.
// =============================================================================

import { CHIPS, CHIP_SIZE, CHIP_MINI, COLORS, FONT, GAMES, css } from './Constants.js';
import { ART_CONTRACT } from './Assets.js';

const FAMILY = FONT.FAMILY;

/** Create (or replace) a canvas texture and draw into it. */
export function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

const hex = (n, a = 1) => {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

function shade(n, f) {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, text, x, y, size, color, { weight = '700', stroke = null, strokeW = 0, align = 'center', family = FAMILY } = {}) {
  // Jersey 10 (the UI face) is small for its px size: scale like text() does.
  const px = family === FONT.DISPLAY ? size : Math.round(size * FONT.SCALE);
  ctx.font = `${family === FONT.DISPLAY ? weight : '400'} ${px}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// --- chips ----------------------------------------------------------------------------

function drawChip(ctx, s, chip) {
  const c = s / 2;
  const R = c - 2;
  // body
  ctx.fillStyle = hex(shade(chip.color, -0.35));
  ctx.beginPath(); ctx.arc(c, c + 1.5, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hex(chip.color);
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
  // edge stripes (6 inserts)
  ctx.fillStyle = hex(chip.edge);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(c, c, R, a - 0.17, a + 0.17);
    ctx.arc(c, c, R * 0.74, a + 0.17, a - 0.17, true);
    ctx.closePath();
    ctx.fill();
  }
  // inner ring
  ctx.strokeStyle = hex(chip.edge, 0.9);
  ctx.lineWidth = Math.max(1.5, s * 0.03);
  ctx.setLineDash([s * 0.05, s * 0.04]);
  ctx.beginPath(); ctx.arc(c, c, R * 0.66, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // inlay
  ctx.fillStyle = hex(shade(chip.color, chip.value === 1 ? -0.04 : 0.12));
  ctx.beginPath(); ctx.arc(c, c, R * 0.58, 0, Math.PI * 2); ctx.fill();
  // rim highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath(); ctx.arc(c, c, R - 1, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
  // outline
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  // value
  const txt = String(chip.value);
  const fs = txt.length >= 3 ? s * 0.4 : s * 0.5;
  label(ctx, txt, c, c + s * 0.01, Math.round(fs), hex(chip.text), {
    stroke: chip.value === 1 ? null : 'rgba(0,0,0,0.45)', strokeW: Math.max(2, s * 0.05), weight: '400', family: FONT.NUMBERS,
  });
}

function drawMiniChip(ctx, w, h, chip) {
  const cx = w / 2;
  const rx = w / 2 - 1;
  const ry = (h - 7) / 2;
  const top = ry + 1;
  // side (thickness)
  ctx.fillStyle = hex(shade(chip.color, -0.4));
  ctx.beginPath();
  ctx.ellipse(cx, top + 5, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, top);
  ctx.ellipse(cx, top, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  // side stripes
  ctx.fillStyle = hex(chip.edge);
  for (const fx of [-0.7, -0.15, 0.4]) {
    const x = cx + fx * rx;
    ctx.fillRect(x, top + ry * Math.sqrt(1 - fx * fx) - 1, rx * 0.22, 5);
  }
  // top face: rim, edge inserts, lighter inlay
  ctx.fillStyle = hex(chip.color);
  ctx.beginPath(); ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hex(chip.edge);
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.ellipse(cx, top, rx * 0.86, ry * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = hex(shade(chip.color, chip.value === 1 ? -0.06 : 0.2));
  ctx.beginPath(); ctx.ellipse(cx, top, rx * 0.55, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = chip.color < 0x444444 ? hex(chip.edge, 0.9) : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
}

export function generateCoreTextures(scene) {
  for (const chip of CHIPS) {
    canvasTexture(scene, chip.key, CHIP_SIZE, CHIP_SIZE, (ctx, w) => drawChip(ctx, w, chip));
    canvasTexture(scene, chip.mini, CHIP_MINI.W, CHIP_MINI.H, (ctx, w, h) => drawMiniChip(ctx, w, h, chip));
  }
  // Large chip for banners / lobby balance pill (128)
  canvasTexture(scene, 'chip-big', 128, 128, (ctx, w) => drawChip(ctx, w, { ...CHIPS[3], value: '$' }));

  canvasTexture(scene, 'particle-coin', 20, 20, (ctx) => {
    ctx.fillStyle = hex(COLORS.BRASS_DARK);
    ctx.beginPath(); ctx.arc(10, 10.8, 9, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(7, 7, 1, 10, 10, 9);
    g.addColorStop(0, hex(COLORS.GOLD_LIGHT));
    g.addColorStop(0.6, hex(COLORS.GOLD));
    g.addColorStop(1, hex(COLORS.BRASS));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(10, 10, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hex(COLORS.BRASS_DARK);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(10, 10, 5.5, 0, Math.PI * 2); ctx.stroke();
  });
  canvasTexture(scene, 'particle-spark', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,250,220,0.9)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });
  canvasTexture(scene, 'particle-confetti', 10, 14, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 10, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 10, 10, 4);
  });
  canvasTexture(scene, 'ui-glow', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTexture(scene, 'ui-vignette', 640, 360, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  canvasTexture(scene, 'ui-pixel', 4, 4, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
  });
}

// --- placeholders -----------------------------------------------------------------------

const ACCENT = Object.fromEntries(GAMES.map(g => [g.id, g.accent]));

/** Soba (tricolour Aussie: black, tan points, white blaze) — a readable stand-in. */
function drawSoba(ctx, s, mood) {
  const c = s / 2;
  ctx.save();
  ctx.scale(s / 256, s / 256);
  // backdrop disc
  ctx.fillStyle = 'rgba(0,0,0,0)';
  // ears
  ctx.fillStyle = '#17171b';
  ctx.beginPath(); ctx.moveTo(52, 110); ctx.lineTo(70, 22); ctx.lineTo(116, 74); ctx.fill();
  ctx.beginPath(); ctx.moveTo(204, 110); ctx.lineTo(186, 22); ctx.lineTo(140, 74); ctx.fill();
  ctx.fillStyle = '#d98a8a';
  ctx.beginPath(); ctx.moveTo(70, 92); ctx.lineTo(76, 46); ctx.lineTo(102, 76); ctx.fill();
  ctx.beginPath(); ctx.moveTo(186, 92); ctx.lineTo(180, 46); ctx.lineTo(154, 76); ctx.fill();
  // head
  ctx.fillStyle = '#1d1d22';
  ctx.beginPath(); ctx.ellipse(128, 132, 84, 78, 0, 0, Math.PI * 2); ctx.fill();
  // tan cheeks + brows
  ctx.fillStyle = '#c98a4b';
  ctx.beginPath(); ctx.ellipse(86, 160, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(170, 160, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(98, 102, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(158, 102, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  // white blaze + muzzle
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath(); ctx.moveTo(118, 60); ctx.lineTo(138, 60); ctx.lineTo(146, 140); ctx.lineTo(110, 140); ctx.fill();
  ctx.beginPath(); ctx.ellipse(128, 172, 40, 32, 0, 0, Math.PI * 2); ctx.fill();
  // chest
  ctx.beginPath(); ctx.ellipse(128, 236, 60, 30, 0, 0, Math.PI * 2); ctx.fill();
  // eyes
  ctx.fillStyle = '#2a1408';
  const eyeY = 122;
  if (mood === 'happy') {
    ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(98, eyeY + 4, 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(158, eyeY + 4, 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else if (mood === 'smug') {
    ctx.fillRect(86, eyeY - 2, 24, 8);
    ctx.fillRect(146, eyeY - 2, 24, 8);
  } else {
    const r = mood === 'nervous' ? 9 : 11;
    ctx.beginPath(); ctx.arc(98, eyeY, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(158, eyeY, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(102, eyeY - 4, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(162, eyeY - 4, 3.5, 0, Math.PI * 2); ctx.fill();
    if (mood === 'sad') {
      ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(84, 100); ctx.lineTo(108, 92); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(172, 100); ctx.lineTo(148, 92); ctx.stroke();
    }
  }
  // nose
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(128, 156, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'sad') { ctx.arc(128, 196, 14, Math.PI * 1.15, Math.PI * 1.85); }
  else if (mood === 'nervous') { ctx.moveTo(110, 186); ctx.lineTo(118, 182); ctx.lineTo(126, 188); ctx.lineTo(134, 182); ctx.lineTo(142, 186); }
  else if (mood === 'smug') { ctx.moveTo(114, 182); ctx.quadraticCurveTo(134, 192, 146, 176); }
  else { ctx.arc(128, 172, 16, Math.PI * 0.15, Math.PI * 0.85); }
  ctx.stroke();
  if (mood === 'happy' || mood === 'neutral') {
    ctx.fillStyle = '#e46a7a';
    ctx.beginPath(); ctx.ellipse(128, 194, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (mood === 'nervous') {
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.ellipse(196, 88, 7, 11, 0, 0, Math.PI * 2); ctx.fill();
  }
  // red bow tie
  ctx.fillStyle = '#c8352b';
  ctx.beginPath(); ctx.moveTo(128, 226); ctx.lineTo(96, 210); ctx.lineTo(96, 242); ctx.fill();
  ctx.beginPath(); ctx.moveTo(128, 226); ctx.lineTo(160, 210); ctx.lineTo(160, 242); ctx.fill();
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath(); ctx.arc(128, 226, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  void c;
}

function drawBackground(ctx, w, h, accent) {
  // wood wall
  const wall = ctx.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, hex(0x1c120b));
  wall.addColorStop(0.45, hex(0x2c1c11));
  wall.addColorStop(1, hex(0x140d08));
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  // vertical panelling
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < w; x += 80) ctx.fillRect(x, 0, 3, h * 0.45);
  // lamp glows
  for (const lx of [w * 0.2, w * 0.5, w * 0.8]) {
    const g = ctx.createRadialGradient(lx, 30, 4, lx, 60, 260);
    g.addColorStop(0, 'rgba(255,214,140,0.45)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 280, 0, 560, 360);
    ctx.fillStyle = hex(0x1f4a33);
    ctx.beginPath(); ctx.moveTo(lx - 34, 26); ctx.lineTo(lx + 34, 26); ctx.lineTo(lx + 20, 6); ctx.lineTo(lx - 20, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,170,0.95)';
    ctx.beginPath(); ctx.arc(lx, 28, 6, 0, Math.PI * 2); ctx.fill();
  }
  if (accent === null) {
    // lobby: floorboards
    const fy = h * 0.42;
    const floor = ctx.createLinearGradient(0, fy, 0, h);
    floor.addColorStop(0, hex(0x3a2516));
    floor.addColorStop(1, hex(0x1e130b));
    ctx.fillStyle = floor;
    ctx.fillRect(0, fy, w, h - fy);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let y = fy; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    return;
  }
  // table: wood rail + felt in the accent colour
  const tx = 40, ty = 70, tw = w - 80, th = h - 100;
  ctx.fillStyle = hex(0x3b2414);
  roundRect(ctx, tx - 16, ty - 16, tw + 32, th + 32, 70); ctx.fill();
  ctx.strokeStyle = hex(COLORS.BRASS);
  ctx.lineWidth = 3;
  roundRect(ctx, tx - 8, ty - 8, tw + 16, th + 16, 62); ctx.stroke();
  const felt = ctx.createRadialGradient(w / 2, h * 0.45, 40, w / 2, h * 0.5, w * 0.6);
  felt.addColorStop(0, hex(shade(accent, -0.15)));
  felt.addColorStop(1, hex(shade(accent, -0.62)));
  ctx.fillStyle = felt;
  roundRect(ctx, tx, ty, tw, th, 54); ctx.fill();
  // felt texture
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 2500; i++) ctx.fillRect(tx + ((i * 7919) % tw), ty + ((i * 104729) % th), 2, 2);
}

function drawIcon(ctx, s, id) {
  const accent = ACCENT[id] ?? COLORS.FELT;
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, hex(shade(accent, 0.15)));
  g.addColorStop(1, hex(shade(accent, -0.45)));
  ctx.fillStyle = g;
  roundRect(ctx, 6, 6, s - 12, s - 12, 28); ctx.fill();
  ctx.strokeStyle = hex(COLORS.GOLD);
  ctx.lineWidth = 5;
  roundRect(ctx, 6, 6, s - 12, s - 12, 28); ctx.stroke();
  const c = s / 2;
  ctx.fillStyle = hex(COLORS.CREAM);
  ctx.strokeStyle = hex(COLORS.INK);
  ctx.lineWidth = 3;
  if (id === 'plinko') {
    for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) {
      ctx.beginPath(); ctx.arc(c + (i - r / 2) * 26, 46 + r * 22, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#cfe84a';
    ctx.beginPath(); ctx.arc(c + 13, 128, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (id === 'blackjack') {
    for (const [dx, rot] of [[-16, -0.2], [16, 0.18]]) {
      ctx.save(); ctx.translate(c + dx, c + 4); ctx.rotate(rot);
      roundRect(ctx, -26, -38, 52, 76, 8); ctx.fillStyle = hex(COLORS.CREAM); ctx.fill(); ctx.stroke();
      label(ctx, dx < 0 ? 'A' : 'K', -10, -20, 22, dx < 0 ? '#1b1b1f' : '#c0392b');
      ctx.restore();
    }
  } else if (id === 'craps') {
    for (const [dx, dy, n] of [[-22, -8, 5], [24, 18, 3]]) {
      ctx.save(); ctx.translate(c + dx, c + dy); ctx.rotate(dx < 0 ? -0.25 : 0.2);
      roundRect(ctx, -26, -26, 52, 52, 10); ctx.fillStyle = hex(COLORS.CREAM); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0392b';
      const pips = n === 5 ? [[-12, -12], [12, -12], [0, 0], [-12, 12], [12, 12]] : [[-12, -12], [0, 0], [12, 12]];
      for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  } else if (id === 'roulette') {
    const R = 50;
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = i === 0 ? '#2e9e5b' : i % 2 ? '#c0392b' : '#1b1b1f';
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, (i / 18) * Math.PI * 2, ((i + 1) / 18) * Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = hex(COLORS.WOOD); ctx.beginPath(); ctx.arc(c, c, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex(COLORS.GOLD); ctx.beginPath(); ctx.arc(c, c, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c + 30, c - 30, 6, 0, Math.PI * 2); ctx.fill();
  } else {
    roundRect(ctx, 24, 40, s - 48, 80, 10); ctx.fillStyle = hex(COLORS.CREAM); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) label(ctx, '7', 48 + i * 32, 82, 36, '#c0392b');
  }
}

function drawSymbol(ctx, s, name) {
  const colors = {
    wild: COLORS.GOLD, scatter: 0xb487f0, booker: 0xc98a4b, soba: 0x2a2a30,
    bone: 0xf6ecd4, ball: 0xcfe84a, hydrant: 0xd8402f, bowl: 0x3a7bd5,
  };
  const c = s / 2;
  const col = colors[name] ?? COLORS.CREAM;
  ctx.fillStyle = hex(shade(col, -0.55), 0.9);
  roundRect(ctx, 6, 6, s - 12, s - 12, 22); ctx.fill();
  ctx.fillStyle = hex(col);
  ctx.beginPath(); ctx.arc(c, c - 6, s * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hex(COLORS.INK); ctx.lineWidth = 3; ctx.stroke();
  const text = { wild: 'WILD', scatter: 'BONUS', booker: 'B', soba: 'S', bone: 'BONE', ball: 'BALL', hydrant: 'H2O', bowl: 'BOWL' }[name] || name;
  label(ctx, text, c, s - 20, text.length > 3 ? 20 : 26, hex(COLORS.CREAM), { stroke: '#000', strokeW: 4 });
}

function drawLogo(ctx, w, h) {
  label(ctx, 'LUCKY PAW', w / 2, h * 0.36, 118, hex(COLORS.GOLD), { stroke: hex(COLORS.INK), strokeW: 14 });
  label(ctx, 'CASINO', w / 2, h * 0.76, 78, hex(COLORS.CREAM), { stroke: hex(COLORS.INK), strokeW: 12 });
}

function drawDuo(ctx, w, h) {
  // Booker (tan, green visor) on the left, Soba on the right
  ctx.save();
  ctx.translate(w * 0.28, h * 0.52);
  ctx.fillStyle = '#c98a4b';
  ctx.beginPath(); ctx.ellipse(0, 0, 130, 140, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath(); ctx.ellipse(-120, -40, 40, 80, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(120, -40, 40, 80, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f6a3f';
  ctx.fillRect(-110, -130, 220, 40);
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath(); ctx.ellipse(0, 50, 60, 46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(0, 30, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-46, -30, 12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(46, -30, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.62, h * 0.18);
  drawSoba(ctx, 300, 'happy');
  ctx.restore();
  label(ctx, 'BOOKER', w * 0.28, h * 0.92, 40, hex(COLORS.GOLD), { stroke: '#000', strokeW: 6 });
  label(ctx, 'SOBA', w * 0.78, h * 0.92, 40, hex(COLORS.GOLD), { stroke: '#000', strokeW: 6 });
}

/** Draw a placeholder for every ART_CONTRACT key that has no texture yet. Returns the keys made. */
export function generatePlaceholders(scene) {
  const made = [];
  for (const [key, { w, h }] of Object.entries(ART_CONTRACT)) {
    if (scene.textures.exists(key)) continue;
    made.push(key);
    if (key.startsWith('soba-')) canvasTexture(scene, key, w, h, (ctx) => drawSoba(ctx, w, key.slice(5)));
    else if (key === 'duo-hero') canvasTexture(scene, key, w, h, drawDuo);
    else if (key === 'title-logo') canvasTexture(scene, key, w, h, drawLogo);
    else if (key.startsWith('bg-')) {
      const id = key.slice(3);
      canvasTexture(scene, key, w, h, (ctx) => drawBackground(ctx, w, h, id === 'lobby' ? null : (ACCENT[id] ?? COLORS.FELT)));
    } else if (key.startsWith('icon-')) canvasTexture(scene, key, w, h, (ctx) => drawIcon(ctx, w, key.slice(5)));
    else if (key.startsWith('sym-')) canvasTexture(scene, key, w, h, (ctx) => drawSymbol(ctx, w, key.slice(4)));
  }
  return made;
}

export { css };
