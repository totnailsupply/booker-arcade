// =============================================================================
// Placeholders.js — canvas drawings for every texture key, used when the real
// art is missing from public/assets/manifest.json (or fails to load). Same key
// and size as the real asset, so code never cares which one it got.
// =============================================================================

import { COLORS } from './Constants.js';

// Booker spritesheet frame layout (shared by placeholder and real art)
export const BOOKER_FRAMES = {
  RUN_START: 0,
  RUN_END: 5,
  JUMP: 6,
  FALL: 7,
  HURT: 8,
  WIN: 9,
  DOUBLE_START: 10,   // 10-11 double-jump spin
  GLIDE_START: 12,    // 12-13 ear glide
  CLING: 14,
  POUNCE: 15,
  DASH_START: 16,     // 16-17 zoomies dash
  COUNT: 18,
  LEGACY_COUNT: 10,   // the Level 1 sheet before the ability frames
};

// --- drawing helpers ---

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function disc(ctx, color, x, y, r) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws fn at x and, if it crosses an edge, again one width over, so the image tiles. */
function wrapX(w, x, span, fn) {
  fn(x);
  if (x + span > w) fn(x - w);
  if (x < 0) fn(x + w);
}

// Booker placeholder: a tan side-view dog, 48x36 per frame, facing right,
// feet on row 35. Legs change per run frame; the rest are poses.
function drawBookerFrame(ctx, ox, frame) {
  const TAN = '#c98b4a';
  const TAN_DARK = '#9c6532';
  const CREAM = '#f1dcb4';
  const MASK = '#2a1d16';
  const EAR = '#5b3a22';
  const EYE = '#f2b233';
  const F = BOOKER_FRAMES;

  const isRun = frame <= F.RUN_END;
  const bob = isRun ? (frame % 3 === 1 ? -1 : 0) : 0;
  const by = 16 + bob;                // body top
  const isDash = frame >= F.DASH_START && frame < F.DASH_START + 2;
  const isGlide = frame >= F.GLIDE_START && frame < F.GLIDE_START + 2;
  const isSpin = frame >= F.DOUBLE_START && frame < F.DOUBLE_START + 2;

  // dash: motion lines behind
  if (isDash) {
    for (let i = 0; i < 4; i++) rect(ctx, '#ffffff', ox + (frame % 2) * 2, by + 1 + i * 3, 6 + (i % 2) * 3, 1);
  }

  // tail
  if (frame === F.WIN) rect(ctx, TAN_DARK, ox + 4, by - 6, 3, 8);
  else rect(ctx, TAN_DARK, ox + 3, by - 2 + (frame % 2), 7, 3);

  // legs
  const legY = by + 11;
  let legs;
  if (isRun) {
    const cycle = [[0, 4], [2, 2], [4, 0], [2, -2], [0, -4], [-2, -2]][frame];
    legs = [
      [10 + cycle[0], 8], [14 - cycle[0], 8],      // hind
      [30 + cycle[1], 8], [34 - cycle[1], 8],      // front
    ];
  } else if (frame === F.JUMP || isSpin) {
    legs = [[8, 6], [12, 6], [34, 5], [37, 5]];
  } else if (frame === F.FALL || isGlide) {
    legs = [[11, 7], [15, 7], [31, 8], [35, 8]];
  } else if (frame === F.POUNCE) {
    legs = [[12, 9], [16, 9], [29, 9], [33, 9]];
  } else if (frame === F.CLING) {
    legs = [[14, 7], [18, 7], [38, 4], [41, 4]];
  } else if (isDash) {
    legs = [[4, 4], [8, 4], [38, 4], [42, 4]];
  } else {
    legs = [[11, 8], [15, 8], [31, 8], [35, 8]];
  }
  legs.forEach(([lx, lh], i) => rect(ctx, i % 2 ? TAN : TAN_DARK, ox + lx, legY, 3, Math.min(lh, 35 - legY + 1)));

  // body (dash: stretched)
  const bodyX = isDash ? 6 : 8;
  const bodyW = isDash ? 32 : 28;
  rect(ctx, TAN, ox + bodyX, by, bodyW, 12);
  rect(ctx, TAN_DARK, ox + bodyX, by, bodyW, 2);
  rect(ctx, CREAM, ox + bodyX + bodyW - 8, by + 6, 8, 6);   // chest
  if (isSpin) rect(ctx, '#ffffff', ox + bodyX + 4 + (frame % 2) * 10, by + 4, 6, 1); // spin swoosh

  // head
  const hx = ox + (isDash ? 34 : 32);
  const hy = by - 9;
  rect(ctx, TAN, hx, hy, 11, 10);
  rect(ctx, MASK, hx + 8, hy + 4, 6, 5);      // black muzzle mask
  rect(ctx, '#111', hx + 12, hy + 4, 2, 2);   // nose
  if (isGlide) {
    // ears spread like wings
    const flap = frame % 2;
    rect(ctx, EAR, hx - 10, hy - 3 - flap, 12, 3);
    rect(ctx, '#2a1d16', hx - 12, hy - 3 - flap, 3, 3);
  } else {
    rect(ctx, EAR, hx + 1, hy - 1, 4, 7);       // floppy ear, dark tip
    rect(ctx, '#2a1d16', hx + 1, hy + 5, 4, 2);
  }

  if (frame === F.HURT) {
    rect(ctx, '#111', hx + 6, hy + 2, 1, 1);
    rect(ctx, '#111', hx + 8, hy + 2, 1, 1);
    rect(ctx, '#111', hx + 7, hy + 3, 1, 1);
    rect(ctx, '#111', hx + 6, hy + 4, 1, 1);
    rect(ctx, '#111', hx + 8, hy + 4, 1, 1);
  } else {
    rect(ctx, EYE, hx + 6, hy + 2, 2, 2);
    rect(ctx, '#111', hx + 7, hy + 2, 1, 1);
  }
  if (frame === F.WIN) rect(ctx, '#e5566b', hx + 10, hy + 9, 3, 3); // tongue
  if (frame === F.CLING) rect(ctx, '#d9d2c4', ox + 45, 4, 3, 30);  // wall edge at the frame's right
}

// --- Level 2-6 palettes (placeholders only; the real art replaces these) ---

const PAL = {
  2: { sky: ['#232a55', '#b85a78', '#f0a35c'], disc: [120, 150, 26, '#ffd38a'], stars: false,
    mid: '#1a2140', lit: '#ffcf7a', midShape: 'cranes', near: '#11172b', nearShape: 'rail',
    ground: ['#4f4740', '#7d6e5f', '#3a332d'], pit: ['water', '#1d4466', '#3a77a3'], plat: ['#b5452f', '#7a2a1c', '#d8664a'] },
  3: { sky: ['#0c1533', '#253f7d', '#6b87c8'], disc: [380, 70, 16, '#e8eefc'], stars: true,
    mid: '#141d3a', lit: '#f5d36b', midShape: 'towers', near: '#0d1430', nearShape: 'parapet',
    ground: ['#3a4456', '#56617a', '#2b3242'], pit: ['dark', '#070a16', '#141a30'], plat: ['#6d7891', '#434b5f', '#8e9ab3'] },
  4: { sky: ['#100c12', '#241a1f', '#3a2622'], disc: null, stars: false,
    mid: '#1d1616', lit: '#ff8a3a', midShape: 'pipes', near: '#140f0f', nearShape: 'girders',
    ground: ['#45464e', '#65676f', '#2f3036'], pit: ['glow', '#3a0e06', '#d2541c'], plat: ['#8a8f99', '#565a63', '#b0b5bf'] },
  5: { sky: ['#0b061d', '#251040', '#4f1c66'], disc: [90, 60, 14, '#fdf3c8'], stars: true,
    mid: '#170b2b', lit: '#ff4fb0', lit2: '#3ff2ff', midShape: 'stalls', near: '#10081e', nearShape: 'lanterns',
    ground: ['#363042', '#544a63', '#272230'], pit: ['manhole', '#04030a', '#1b1726'], plat: ['#7c3f9e', '#4e2566', '#a35fc7'] },
  6: { sky: ['#170606', '#431212', '#8a361b'], disc: [400, 120, 22, '#ffb36b'], stars: false,
    mid: '#1f0b0b', lit: '#ffcf5a', midShape: 'restaurants', near: '#150707', nearShape: 'posts',
    ground: ['#463730', '#6d564a', '#33271f'], pit: ['glow', '#2d0c04', '#ef6a24'], plat: ['#9b6a3c', '#6a4423', '#c08a55'] },
};

function drawSky(ctx, w, h, p) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.sky[0]);
  g.addColorStop(0.6, p.sky[1]);
  g.addColorStop(1, p.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (p.stars) {
    for (let i = 0; i < 40; i++) rect(ctx, '#ffffff', (i * 97) % w, (i * 53) % 120, 1, 1);
  }
  if (p.disc) {
    const [x, y, r, c] = p.disc;
    disc(ctx, c, x, y, r);
  }
}

function drawMid(ctx, w, h, p, seed) {
  const base = 238;
  ctx.fillStyle = p.mid;
  const shapes = [[20, 70, 90], [130, 50, 120], [220, 90, 70], [330, 60, 140], [420, 70, 85]];
  for (const [x, sw, sh] of shapes) {
    wrapX(w, x, sw, (xx) => {
      ctx.fillStyle = p.mid;
      if (p.midShape === 'cranes' && sh > 100) {
        ctx.fillRect(xx + sw / 2 - 3, base - sh, 6, sh);
        ctx.fillRect(xx - 10, base - sh, sw + 20, 5);
        ctx.fillRect(xx + sw - 6, base - sh, 2, 40);
      } else if (p.midShape === 'pipes') {
        ctx.fillRect(xx, base - sh, sw, sh);
        ctx.fillRect(xx - 8, base - sh + 20, sw + 16, 6);
      } else {
        ctx.fillRect(xx, base - sh, sw, sh);
      }
      ctx.fillStyle = p.lit;
      for (let wy = base - sh + 10; wy < base - 12; wy += 14) {
        for (let wx = xx + 6; wx < xx + sw - 6; wx += 12) {
          if (((wx * 7 + wy * 3 + seed) % 5) < 2) ctx.fillRect(wx, wy, 4, 5);
        }
      }
      if (p.lit2) {
        ctx.fillStyle = p.lit2;
        ctx.fillRect(xx + 4, base - sh + 4, sw - 8, 2);
      }
    });
  }
  ctx.fillStyle = p.mid;
  ctx.fillRect(0, base - 6, w, h - base + 6);
}

function drawNear(ctx, w, h, p) {
  ctx.fillStyle = p.near;
  const top = 200;
  if (p.nearShape === 'rail' || p.nearShape === 'parapet' || p.nearShape === 'girders') {
    ctx.fillRect(0, top, w, 3);
    for (let x = 0; x < w; x += 40) ctx.fillRect(x, top, 3, 240 - top);
    if (p.nearShape === 'girders') {
      for (let x = 0; x < w; x += 40) {
        for (let i = 0; i < 40; i += 2) ctx.fillRect(x + i, top + i, 2, 2);
      }
    }
  } else if (p.nearShape === 'lanterns') {
    ctx.fillRect(0, 150, w, 1);
    for (let x = 12; x < w; x += 48) {
      ctx.fillStyle = (x / 48) % 2 < 1 ? p.lit : p.lit2;
      ctx.fillRect(x, 151, 6, 8);
    }
  } else {
    for (let x = 0; x < w; x += 60) ctx.fillRect(x, top - 20, 4, 240 - top + 20);
  }
}

function drawGround(ctx, p) {
  const [base, top, dark] = p.ground;
  rect(ctx, base, 0, 0, 32, 32);
  rect(ctx, top, 0, 0, 32, 4);
  rect(ctx, dark, 0, 4, 32, 2);
  rect(ctx, dark, 6, 14, 3, 2);
  rect(ctx, dark, 20, 22, 4, 2);
  rect(ctx, dark, 26, 10, 2, 2);
  rect(ctx, top, 13, 26, 3, 1);
}

function drawPit(ctx, p) {
  const [kind, base, light] = p.pit;
  rect(ctx, base, 0, 0, 32, 32);
  if (kind === 'water') {
    rect(ctx, light, 0, 6, 32, 2);
    rect(ctx, light, 4, 16, 10, 1);
    rect(ctx, light, 18, 24, 10, 1);
  } else if (kind === 'glow') {
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, base);
    g.addColorStop(1, light);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  } else if (kind === 'manhole') {
    rect(ctx, light, 0, 0, 32, 3);
    rect(ctx, light, 6, 12, 2, 2);
    rect(ctx, light, 22, 20, 2, 2);
  } else {
    rect(ctx, light, 0, 0, 32, 2);
    rect(ctx, light, 10, 18, 1, 1);
  }
}

function drawPlatform(ctx, p) {
  const [base, dark, light] = p.plat;
  rect(ctx, base, 0, 0, 32, 16);
  rect(ctx, light, 0, 0, 32, 3);
  rect(ctx, dark, 0, 13, 32, 3);
  rect(ctx, dark, 0, 3, 2, 10);
  rect(ctx, dark, 15, 3, 2, 10);
}

function themeDrawers(n) {
  const p = PAL[n];
  return {
    [`l${n}-bg-far`]: (ctx, spec) => drawSky(ctx, spec.w, spec.h, p),
    [`l${n}-bg-mid`]: (ctx, spec) => drawMid(ctx, spec.w, spec.h, p, n),
    [`l${n}-bg-near`]: (ctx, spec) => drawNear(ctx, spec.w, spec.h, p),
    [`l${n}-ground`]: (ctx) => drawGround(ctx, p),
    [`l${n}-pit`]: (ctx) => drawPit(ctx, p),
    [`l${n}-platform`]: (ctx) => drawPlatform(ctx, p),
    [`thumb-l${n}`]: (ctx, spec) => {
      drawSky(ctx, spec.w, spec.h, { ...p, disc: p.disc ? [p.disc[0] / 4, p.disc[1] / 4, p.disc[2] / 3, p.disc[3]] : null, stars: false });
      rect(ctx, p.mid, 0, 40, spec.w, 20);
      for (let x = 4; x < spec.w; x += 22) rect(ctx, p.mid, x, 30 - (x % 3) * 4, 14, 12);
      rect(ctx, p.ground[1], 0, 58, spec.w, 2);
      rect(ctx, p.ground[0], 0, 60, spec.w, 12);
    },
  };
}

// --- icons (24x24 frames) ---

function drawIcon(ctx, f, ox) {
  const C = (x, y, w, h, c) => rect(ctx, c, ox + x, y, w, h);
  C(1, 1, 22, 22, '#1d1a2a');
  C(2, 2, 20, 20, '#2f2a45');
  const W = '#fff3c4';
  const G = '#ffd34d';
  switch (f) {
    case 0: // double jump: two chevrons
      for (let i = 0; i < 6; i++) { C(6 + i, 12 - i, 2, 2, W); C(16 - i, 12 - i, 2, 2, W); }
      for (let i = 0; i < 6; i++) { C(6 + i, 18 - i, 2, 2, G); C(16 - i, 18 - i, 2, 2, G); }
      break;
    case 1: // glide: ears / wings
      C(4, 10, 16, 3, W); C(2, 12, 4, 3, W); C(18, 12, 4, 3, W); C(10, 13, 4, 6, G);
      break;
    case 2: // wall kick: wall + arrow up
      C(16, 4, 4, 16, '#9aa0ad'); C(8, 6, 3, 12, W); C(5, 8, 9, 2, W); C(6, 7, 7, 1, W);
      break;
    case 3: // pounce: paw + arrow down
      C(10, 4, 4, 8, W); C(7, 10, 10, 2, W); C(9, 12, 6, 2, W);
      C(7, 16, 10, 5, G); C(6, 15, 2, 2, G); C(16, 15, 2, 2, G);
      break;
    case 4: // zoomies: arrow with speed lines
      C(4, 8, 6, 1, W); C(3, 12, 8, 1, W); C(4, 16, 6, 1, W); C(12, 10, 6, 5, G); C(18, 11, 3, 3, G);
      break;
    case 5: // lock
      C(8, 5, 8, 2, '#c8c8d0'); C(7, 6, 2, 6, '#c8c8d0'); C(15, 6, 2, 6, '#c8c8d0');
      C(5, 11, 14, 10, '#c9a227'); C(11, 14, 2, 4, '#3a2a06');
      break;
    case 6: // star on
    case 7: { // star off
      const c = f === 6 ? G : '#4a4258';
      C(11, 3, 2, 4, c); C(4, 8, 16, 4, c); C(7, 12, 10, 4, c); C(6, 16, 4, 5, c); C(14, 16, 4, 5, c); C(10, 7, 4, 7, c);
      break;
    }
    case 8: // trophy
      C(7, 4, 10, 8, G); C(4, 5, 3, 4, G); C(17, 5, 3, 4, G); C(10, 12, 4, 4, G); C(7, 17, 10, 3, G);
      break;
    case 9: // bone
      C(7, 10, 10, 4, '#f4ecd8'); C(4, 8, 4, 3, '#f4ecd8'); C(4, 13, 4, 3, '#f4ecd8');
      C(16, 8, 4, 3, '#f4ecd8'); C(16, 13, 4, 3, '#f4ecd8');
      break;
    default:
      break;
  }
}

// --- props ---

function box(ctx, x, y, w, h, fill, edge) {
  rect(ctx, edge, x, y, w, h);
  rect(ctx, fill, x + 1, y + 1, w - 2, h - 2);
}

export const PLACEHOLDER_DRAW = {
  booker(ctx, spec) {
    for (let f = 0; f < spec.frames; f++) drawBookerFrame(ctx, f * spec.w, f);
  },

  cone(ctx) {
    rect(ctx, '#2b2b2b', 1, 18, 14, 2);
    for (let y = 0; y < 18; y++) {
      const half = Math.round(1 + (y / 18) * 6);
      const stripe = y >= 7 && y < 11;
      rect(ctx, stripe ? '#f4f4f4' : '#ff7a1a', 8 - half, y, half * 2, 1);
    }
  },

  crate(ctx) {
    rect(ctx, '#7a5230', 0, 0, 24, 24);
    rect(ctx, '#a8763f', 2, 2, 20, 20);
    rect(ctx, '#7a5230', 2, 11, 20, 2);
    for (let i = 0; i < 20; i++) rect(ctx, '#7a5230', 2 + i, 2 + i, 2, 1);
  },

  pallets(ctx) {
    for (let i = 0; i < 4; i++) {
      const y = i * 12;
      rect(ctx, '#8d6a3f', 0, y, 24, 3);
      rect(ctx, '#6b4f2c', 1, y + 3, 4, 6);
      rect(ctx, '#6b4f2c', 10, y + 3, 4, 6);
      rect(ctx, '#6b4f2c', 19, y + 3, 4, 6);
      rect(ctx, '#8d6a3f', 0, y + 9, 24, 3);
    }
  },

  barrel(ctx) {
    ctx.fillStyle = '#3d6fa8';
    ctx.beginPath();
    ctx.arc(10, 10, 10, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, '#264a73', 0, 6, 20, 2);
    rect(ctx, '#264a73', 0, 12, 20, 2);
    rect(ctx, '#9cc3ee', 9, 2, 2, 16);
  },

  bone(ctx) {
    rect(ctx, '#f4ecd8', 3, 2, 10, 4);
    rect(ctx, '#f4ecd8', 0, 0, 4, 3);
    rect(ctx, '#f4ecd8', 0, 5, 4, 3);
    rect(ctx, '#f4ecd8', 12, 0, 4, 3);
    rect(ctx, '#f4ecd8', 12, 5, 4, 3);
    rect(ctx, '#c9bc9c', 3, 5, 10, 1);
  },

  steak(ctx) {
    rect(ctx, '#f1f1f1', 2, 22, 36, 5);         // plate
    ctx.fillStyle = '#8f2a1e';
    ctx.beginPath();
    ctx.ellipse(20, 14, 17, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0412c';
    ctx.beginPath();
    ctx.ellipse(19, 13, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, '#f3e3c5', 30, 10, 4, 6);         // bone
    rect(ctx, '#5a1a12', 10, 12, 18, 1);        // grill marks
    rect(ctx, '#5a1a12', 12, 16, 16, 1);
    rect(ctx, '#ffffff', 14, 9, 3, 1);          // shine
  },

  'golden-steak'(ctx) {
    rect(ctx, '#fff2b0', 2, 29, 44, 6);         // gold plate
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.ellipse(24, 18, 21, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.ellipse(23, 17, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, '#fff7d6', 37, 13, 5, 7);
    rect(ctx, '#a0700a', 12, 15, 22, 1);
    rect(ctx, '#a0700a', 14, 20, 20, 1);
    rect(ctx, '#ffffff', 16, 12, 4, 1);
    rect(ctx, '#ffffff', 40, 4, 2, 2);          // sparkles
    rect(ctx, '#ffffff', 6, 6, 2, 2);
  },

  ground(ctx) {
    rect(ctx, COLORS.GROUND, 0, 0, 32, 32);
    rect(ctx, COLORS.GROUND_TOP, 0, 0, 32, 4);
    rect(ctx, COLORS.GROUND_DARK, 0, 4, 32, 2);
    rect(ctx, COLORS.GROUND_DARK, 6, 14, 3, 2);
    rect(ctx, COLORS.GROUND_DARK, 20, 22, 4, 2);
    rect(ctx, COLORS.GROUND_DARK, 26, 10, 2, 2);
    rect(ctx, COLORS.GROUND_TOP, 13, 26, 3, 1);
  },

  'bg-far'(ctx, spec) {
    const g = ctx.createLinearGradient(0, 0, 0, spec.h);
    g.addColorStop(0, COLORS.SKY_TOP);
    g.addColorStop(0.55, COLORS.SKY_MID);
    g.addColorStop(1, COLORS.SKY_LOW);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, spec.w, spec.h);
    // Banded sun so the gradient reads as pixel art
    ctx.fillStyle = COLORS.SUN;
    ctx.beginPath();
    ctx.arc(330, 180, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.SKY_MID;
    for (let y = 186; y < 216; y += 7) ctx.fillRect(290, y, 80, 2);
  },

  'bg-mid'(ctx, spec) {
    // Dark hangar silhouettes, tiled every 480 px
    ctx.fillStyle = COLORS.HANGAR;
    const base = 238;
    const shapes = [[10, 120, 70], [150, 90, 60], [270, 150, 85], [420, 70, 50]];
    for (const [x, w, h] of shapes) {
      ctx.fillRect(x, base - h, w, h);
      ctx.beginPath();
      ctx.ellipse(x + w / 2, base - h, w / 2, h * 0.35, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(0, base - 10, spec.w, 40);
    ctx.fillStyle = COLORS.HANGAR_LIGHT;
    for (const [x, w, h] of shapes) {
      for (let wx = x + 8; wx < x + w - 8; wx += 14) ctx.fillRect(wx, base - h + 14, 6, 4);
    }
  },

  'bg-near'(ctx, spec) {
    // Chain-link fence
    ctx.fillStyle = COLORS.FENCE;
    const top = 196;
    const base = 240;
    ctx.fillRect(0, top, spec.w, 2);
    for (let x = 0; x < spec.w; x += 48) ctx.fillRect(x, top - 4, 3, base - top + 4);
    ctx.globalAlpha = 0.55;
    for (let x = -40; x < spec.w + 40; x += 8) {
      for (let i = 0; i < base - top; i += 2) {
        ctx.fillRect(x + i * 0.5, top + i, 1, 1);
        ctx.fillRect(x + 20 - i * 0.5, top + i, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  },

  'thumb-l1'(ctx, spec) {
    const g = ctx.createLinearGradient(0, 0, 0, spec.h);
    g.addColorStop(0, COLORS.SKY_TOP);
    g.addColorStop(0.6, COLORS.SKY_MID);
    g.addColorStop(1, COLORS.SKY_LOW);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, spec.w, spec.h);
    disc(ctx, COLORS.SUN, 88, 44, 10);
    rect(ctx, COLORS.HANGAR, 0, 44, spec.w, 16);
    rect(ctx, COLORS.HANGAR, 10, 34, 30, 12);
    rect(ctx, COLORS.HANGAR, 70, 38, 36, 8);
    rect(ctx, COLORS.GROUND_TOP, 0, 58, spec.w, 2);
    rect(ctx, COLORS.GROUND, 0, 60, spec.w, 12);
  },

  'menu-bg'(ctx, spec) {
    const g = ctx.createLinearGradient(0, 0, 0, spec.h);
    g.addColorStop(0, '#1b1530');
    g.addColorStop(1, '#3a2346');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, spec.w, spec.h);
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < spec.h; y += 24) {
      for (let x = (y / 24) % 2 ? 12 : 0; x < spec.w; x += 24) rect(ctx, '#ffffff', x, y, 12, 12);
    }
    ctx.globalAlpha = 1;
  },

  'ui-icons'(ctx, spec) {
    for (let f = 0; f < spec.frames; f++) drawIcon(ctx, f, f * spec.w);
  },

  // Level 2: docks
  'l2-bollard'(ctx) {
    rect(ctx, '#2d2d33', 2, 4, 12, 16);
    rect(ctx, '#45454e', 0, 2, 16, 4);
    rect(ctx, '#f2c230', 3, 10, 10, 2);
  },
  'l2-tires'(ctx) {
    for (let i = 0; i < 4; i++) {
      rect(ctx, '#1c1c1f', 0, i * 8, 24, 8);
      rect(ctx, '#3a3a40', 2, i * 8 + 2, 20, 2);
      rect(ctx, '#0d0d0f', 8, i * 8 + 3, 8, 3);
    }
  },
  'l2-crab'(ctx) {
    rect(ctx, '#d9452f', 4, 4, 12, 6);
    rect(ctx, '#ff7a5a', 6, 4, 8, 2);
    rect(ctx, '#d9452f', 0, 2, 4, 3);
    rect(ctx, '#d9452f', 16, 2, 4, 3);
    rect(ctx, '#111', 7, 2, 2, 2);
    rect(ctx, '#111', 11, 2, 2, 2);
    for (let i = 0; i < 3; i++) { rect(ctx, '#a32a1a', 3 + i * 2, 10, 1, 2); rect(ctx, '#a32a1a', 13 + i * 2, 10, 1, 2); }
  },
  // Level 3: rooftops
  'l3-acunit'(ctx) {
    box(ctx, 0, 4, 28, 20, '#9aa3ad', '#5b636d');
    disc(ctx, '#5b636d', 10, 14, 6);
    for (let i = 0; i < 4; i++) rect(ctx, '#5b636d', 19, 8 + i * 4, 6, 2);
  },
  'l3-antenna'(ctx) {
    rect(ctx, '#8c94a0', 5, 4, 2, 44);
    rect(ctx, '#8c94a0', 1, 10, 10, 2);
    rect(ctx, '#8c94a0', 2, 20, 8, 2);
    rect(ctx, '#ff4a4a', 4, 0, 4, 4);
  },
  'l3-pigeon'(ctx) {
    for (let f = 0; f < 2; f++) {
      const ox = f * 16;
      rect(ctx, '#8a8fa3', ox + 3, 5, 10, 5);
      rect(ctx, '#6c7086', ox + 1, 4, 4, 4);
      rect(ctx, '#f2b233', ox + 0, 6, 2, 1);
      rect(ctx, '#111', ox + 2, 5, 1, 1);
      if (f === 0) rect(ctx, '#b5b9c8', ox + 6, 0, 6, 5);
      else rect(ctx, '#b5b9c8', ox + 6, 9, 6, 3);
    }
  },
  'l3-vent'(ctx) {
    box(ctx, 0, 4, 32, 12, '#5e6878', '#323946');
    for (let i = 0; i < 6; i++) rect(ctx, '#1d222b', 3 + i * 5, 6, 3, 8);
  },
  // Level 4: factory
  'l4-wall'(ctx) {
    rect(ctx, '#3c3f47', 0, 0, 32, 32);
    rect(ctx, '#565a64', 0, 0, 32, 2);
    rect(ctx, '#2a2c32', 0, 15, 32, 2);
    rect(ctx, '#2a2c32', 15, 0, 2, 15);
    rect(ctx, '#2a2c32', 7, 17, 2, 15);
    rect(ctx, '#6c707b', 3, 4, 2, 2);
    rect(ctx, '#6c707b', 25, 21, 2, 2);
  },
  'l4-gear'(ctx) {
    disc(ctx, '#7d828c', 12, 12, 9);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rect(ctx, '#7d828c', Math.round(12 + Math.cos(a) * 10) - 2, Math.round(12 + Math.sin(a) * 10) - 2, 4, 4);
    }
    disc(ctx, '#3a3d44', 12, 12, 3);
  },
  'l4-crate'(ctx) {
    box(ctx, 0, 0, 24, 24, '#6f7a52', '#434b30');
    rect(ctx, '#f2c230', 2, 10, 20, 4);
    rect(ctx, '#111', 4, 11, 3, 2);
    rect(ctx, '#111', 10, 11, 3, 2);
    rect(ctx, '#111', 16, 11, 3, 2);
  },
  'l4-steam-vent'(ctx) {
    box(ctx, 0, 2, 16, 6, '#5a5d66', '#2f3137');
    rect(ctx, '#1a1b1f', 3, 3, 10, 2);
  },
  // Level 5: night market
  'l5-vacuum'(ctx) {
    for (let f = 0; f < 2; f++) {
      const ox = f * 24;
      ctx.fillStyle = '#2c2c34';
      ctx.beginPath();
      ctx.ellipse(ox + 12, 11, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      rect(ctx, '#55556a', ox + 4, 5, 16, 3);
      rect(ctx, f ? '#ff4a4a' : '#7a1a1a', ox + 15, 6, 3, 1);
      rect(ctx, '#111', ox + 5 + f * 2, 14, 3, 2);
      rect(ctx, '#111', ox + 15 + f * 2, 14, 3, 2);
    }
  },
  'l5-drone'(ctx) {
    for (let f = 0; f < 2; f++) {
      const ox = f * 24;
      box(ctx, ox + 7, 5, 10, 7, '#c9ccd6', '#6a6e7a');
      rect(ctx, '#6a6e7a', ox + 2, 3, 20, 2);
      rect(ctx, '#ffffff', ox + (f ? 0 : 2), 1, 6, 1);
      rect(ctx, '#ffffff', ox + (f ? 18 : 16), 1, 6, 1);
      rect(ctx, '#3ff2ff', ox + 11, 8, 2, 2);
      rect(ctx, '#8a6a3a', ox + 9, 12, 6, 4);   // parcel
    }
  },
  'l5-cart'(ctx) {
    rect(ctx, '#ff4fb0', 0, 0, 32, 6);
    rect(ctx, '#ffffff', 4, 2, 4, 2);
    rect(ctx, '#ffffff', 14, 2, 4, 2);
    rect(ctx, '#ffffff', 24, 2, 4, 2);
    box(ctx, 2, 8, 28, 14, '#8a5a2e', '#5a3a1c');
    disc(ctx, '#222', 8, 24, 4);
    disc(ctx, '#222', 24, 24, 4);
  },
  'l5-hydrant'(ctx) {
    rect(ctx, '#d43a2a', 3, 4, 8, 16);
    rect(ctx, '#d43a2a', 0, 9, 14, 4);
    rect(ctx, '#ff6a5a', 4, 0, 6, 4);
    rect(ctx, '#ff8a7a', 4, 6, 2, 10);
  },
  // Level 6: steakhouse row
  'l6-boxes'(ctx) {
    box(ctx, 0, 0, 24, 24, '#b08350', '#6e4e2a');
    box(ctx, 0, 24, 24, 24, '#a0743f', '#6e4e2a');
    rect(ctx, '#d9b27a', 4, 10, 16, 3);
    rect(ctx, '#d9b27a', 4, 34, 16, 3);
  },
  'l6-gate'(ctx) {
    rect(ctx, '#4a4f58', 0, 0, 16, 56);
    for (let y = 2; y < 56; y += 6) rect(ctx, '#6d737e', 1, y, 14, 3);
    rect(ctx, '#f2c230', 6, 26, 4, 4);
  },
  'l6-grill'(ctx) {
    rect(ctx, '#2a2a2e', 2, 8, 28, 10);
    rect(ctx, '#ff6a24', 4, 6, 24, 3);
    rect(ctx, '#ffb347', 6, 4, 4, 2);
    rect(ctx, '#ffb347', 16, 3, 4, 3);
    rect(ctx, '#1a1a1d', 4, 18, 3, 6);
    rect(ctx, '#1a1a1d', 25, 18, 3, 6);
  },
  'l6-trashcan'(ctx) {
    rect(ctx, '#5f6a73', 2, 6, 16, 22);
    rect(ctx, '#7c8892', 0, 2, 20, 5);
    rect(ctx, '#7c8892', 8, 0, 4, 2);
    for (let i = 0; i < 3; i++) rect(ctx, '#47525a', 5 + i * 5, 9, 2, 16);
  },

  ...themeDrawers(2),
  ...themeDrawers(3),
  ...themeDrawers(4),
  ...themeDrawers(5),
  ...themeDrawers(6),
};
