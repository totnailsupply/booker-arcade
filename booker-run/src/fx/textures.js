// =============================================================================
// Generated FX textures (canvas, made once per game). Visual only.
// Small, hard-edged shapes so they match the pixel art at 1x.
// =============================================================================

export const FXT = {
  RING: 'fx2-ring',          // 32x32 ring (golden steak shockwave)
  RING_H: 'fx2-ring-h',      // 44x14 flat ellipse ring (ground shockwaves, double-jump ring)
  RING_V: 'fx2-ring-v',      // 14x40 tall ellipse ring (wall kick, dash, smash)
  ARC: 'fx2-arc',            // 32x32 270 deg arc with a fading tail (spin whoosh)
  SOFT: 'fx2-soft',          // 16x16 soft round dot (smoke, bokeh, glows)
  PUFF: 'fx2-puff',          // 5x5 rounded square (air puffs, dust)
  STAR: 'fx2-star',          // 7x7 four-point star (pounce stars, golden glints)
  LINE: 'fx2-line',          // 8x1 hard line (wind trail, speed lines)
  SPEED: 'fx2-speed',        // 40x1 line, bright right end fading left (dash streaks)
  LEAF: 'fx2-leaf',          // 3x2 scrap (updraft leaves / paper)
  EMBER: 'fx2-ember',        // 2x2 dot (embers, sparks, spray)
  STEAM: 'fx2-steamcol',     // 16x32 vertically tiling steam texture (deadly column)
  DASHED: 'fx2-dashed',      // 1x8 dashed line, tiles vertically (updraft edges)
  HDASH: 'fx2-hdash',        // 8x1 dashed line, tiles horizontally (updraft top lip)
  UPCOL: 'fx2-upcol',        // 8x64 updraft column fill (bottom-heavy)
  SUNBURST: 'fx2-sunburst',  // 128x128 rays (golden steak)
  CLOUD: 'fx2-cloud',        // 64x20 pixel cloud
  GULL: 'fx2-gull',          // 14x4, two 7x4 frames (far gulls)
  BLUR: 'fx2-blur',          // 12x3 soft ellipse (rotor blur, shadows)
  PIPE: 'fx2-pipe',          // 12x24 vertical pipe with a flange, tiles vertically (vent over a pit)
  DRONE_OUTLINE: 'fx2-drone-outline', // l5-drone frames grown by 1 px, as a dark silhouette (outlineSheet)
};

/**
 * A dark silhouette of every frame of a spritesheet, grown by 1 px on each side
 * (8-neighbour dilation), as a new texture with the same frame names. Drawn
 * just behind the sprite it reads as a crisp 1 px outline. Frame size grows by
 * 2 px: centre-origin sprites line up as they are.
 */
export function outlineSheet(scene, srcKey, dstKey, color = 0x000000) {
  if (scene.textures.exists(dstKey) || !scene.textures.exists(srcKey)) return;
  const src = scene.textures.get(srcKey);
  const names = src.getFrameNames();
  if (!names.length) return;
  const img = src.getSourceImage();
  const frames = names.map(n => src.get(n));
  const fw = frames[0].cutWidth + 2;
  const fh = frames[0].cutHeight + 2;
  const tex = scene.textures.createCanvas(dstKey, fw * frames.length, fh);
  const ctx = tex.getContext();
  const tmp = document.createElement('canvas');
  tmp.width = fw;
  tmp.height = fh;
  const tc = tmp.getContext('2d');
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  frames.forEach((f, i) => {
    tc.clearRect(0, 0, fw, fh);
    tc.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 1, 1, f.cutWidth, f.cutHeight);
    const a = tc.getImageData(0, 0, fw, fh).data;
    const out = tc.createImageData(fw, fh);
    const solid = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && a[(y * fw + x) * 4 + 3] > 64;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        let on = false;
        for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) on = solid(x + dx, y + dy);
        if (!on) continue;
        const k = (y * fw + x) * 4;
        out.data[k] = r;
        out.data[k + 1] = g;
        out.data[k + 2] = b;
        out.data[k + 3] = 255;
      }
    }
    ctx.putImageData(out, i * fw, 0);
    tex.add(names[i], 0, i * fw, 0, fw, fh);
  });
  tex.refresh();
}

/** Linear blend of two 0xRRGGBB colours (t = 0..1). */
export function lerpColor(a, b, t) {
  const ch = (sh) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function ensureFxTextures(scene) {
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return scene.textures.get(key);
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx, w, h);
    tex.refresh();
    return tex;
  };

  make(FXT.RING, 32, 32, (c) => {
    // Pixel ring: every pixel whose distance from the centre is within the band
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
        if (d <= 15.5 && d >= 13.2) {
          c.fillStyle = `rgba(255,255,255,${d >= 14.2 ? 1 : 0.55})`;
          c.fillRect(x, y, 1, 1);
        }
      }
    }
  });

  // Ellipse rings drawn at native size (a scaled-down pixel ring loses its lines)
  const ellipseRing = (c, w, h) => {
    const rx = w / 2 - 0.5;
    const ry = h / 2 - 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - w / 2) / rx;
        const ny = (y + 0.5 - h / 2) / ry;
        const d = Math.hypot(nx, ny);
        const inner = 1 - 2.2 / Math.min(rx, ry) * 0.9;
        if (d <= 1 && d >= inner) {
          c.fillStyle = '#fff';
          c.fillRect(x, y, 1, 1);
        }
      }
    }
  };
  make(FXT.RING_H, 44, 14, ellipseRing);
  make(FXT.RING_V, 14, 40, ellipseRing);

  make(FXT.ARC, 32, 32, (c) => {
    // A 270 degree arc whose alpha fades along its length (a spin whoosh)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - 16;
        const dy = y + 0.5 - 16;
        const d = Math.hypot(dx, dy);
        if (d > 15.5 || d < 12.5) continue;
        let a = Math.atan2(dy, dx) / (Math.PI * 2);
        if (a < 0) a += 1;
        if (a > 0.75) continue;
        const k = 1 - a / 0.75;           // head at angle 0, tail fades
        c.fillStyle = `rgba(255,255,255,${(0.2 + 0.8 * k).toFixed(2)})`;
        c.fillRect(x, y, 1, 1);
      }
    }
  });

  make(FXT.SOFT, 16, 16, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  make(FXT.PUFF, 5, 5, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(1, 0, 3, 5);
    c.fillRect(0, 1, 5, 3);
  });

  make(FXT.STAR, 7, 7, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(3, 0, 1, 7);
    c.fillRect(0, 3, 7, 1);
    c.fillRect(2, 2, 3, 3);
  });

  make(FXT.LINE, 8, 1, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 8, 1);
  });

  make(FXT.SPEED, 40, 1, (c) => {
    for (let x = 0; x < 40; x++) {
      c.fillStyle = `rgba(255,255,255,${((x + 1) / 40).toFixed(2)})`;
      c.fillRect(x, 0, 1, 1);
    }
  });

  make(FXT.LEAF, 3, 2, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 2, 1);
    c.fillRect(1, 1, 2, 1);
  });

  make(FXT.EMBER, 2, 2, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 2, 2);
  });

  make(FXT.STEAM, 16, 32, (c, w, h) => {
    // Billowing blobs that wrap vertically, densest in the middle columns
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const cx = 8 + (r() - 0.5) * 7;
      const cy = r() * h;
      const rad = 2.5 + r() * 3.5;
      const a = 0.35 + r() * 0.45;
      for (const oy of [-h, 0, h]) {
        const g = c.createRadialGradient(cx, cy + oy, 0, cx, cy + oy, rad);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, cy + oy - rad, w, rad * 2);
      }
    }
    // Solid-ish core so the deadly width always reads
    const core = c.createLinearGradient(0, 0, w, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    core.addColorStop(0.78, 'rgba(255,255,255,0.55)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = core;
    c.fillRect(0, 0, w, h);
  });

  make(FXT.DASHED, 1, 8, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 1, 4);
  });

  make(FXT.HDASH, 8, 1, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 4, 1);
  });

  make(FXT.UPCOL, 8, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0.3)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  make(FXT.SUNBURST, 128, 128, (c, w, h) => {
    const n = 12;
    c.translate(w / 2, h / 2);
    for (let i = 0; i < n; i++) {
      c.save();
      c.rotate((i / n) * Math.PI * 2);
      const g = c.createLinearGradient(0, 0, 0, -h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      const half = i % 2 ? 4 : 7;
      c.beginPath();
      c.moveTo(-1, 0);
      c.lineTo(-half, -h / 2);
      c.lineTo(half, -h / 2);
      c.lineTo(1, 0);
      c.closePath();
      c.fill();
      c.restore();
    }
  });

  make(FXT.CLOUD, 64, 20, (c) => {
    c.fillStyle = '#fff';
    const blobs = [[10, 12, 7], [22, 9, 9], [36, 8, 10], [49, 11, 8], [30, 14, 10], [56, 14, 5]];
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 64; x++) {
        if (blobs.some(([bx, by, br]) => Math.hypot(x - bx, (y - by) * 1.3) < br) && y < 19) c.fillRect(x, y, 1, 1);
      }
    }
  });

  const gull = make(FXT.GULL, 14, 4, (c) => {
    c.fillStyle = '#fff';
    // frame 0: wings up "v"
    c.fillRect(0, 0, 1, 1); c.fillRect(1, 1, 2, 1); c.fillRect(3, 2, 1, 1);
    c.fillRect(6, 0, 1, 1); c.fillRect(4, 1, 2, 1);
    // frame 1: wings level
    c.fillRect(7, 2, 2, 1); c.fillRect(9, 1, 3, 1); c.fillRect(12, 2, 2, 1);
  });
  if (gull && !gull.has('up')) {
    gull.add('up', 0, 0, 0, 7, 4);
    gull.add('flat', 0, 7, 0, 7, 4);
  }

  make(FXT.PIPE, 12, 24, (c) => {
    // Metal pipe in the l3-vent palette: outline, highlight, body, shade; a flange every tile
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const cols = ['#0b0914', '#9d9eae', '#7982a5', '#7982a5', '#646c8c', '#646c8c', '#494e70', '#0b0914'];
    cols.forEach((col, i) => px(2 + i, 0, 1, 24, col));
    px(1, 0, 10, 1, '#292b4e');
    px(0, 1, 12, 1, '#9d9eae');
    px(0, 2, 12, 1, '#494e70');
    px(0, 1, 1, 2, '#0b0914');
    px(11, 1, 1, 2, '#0b0914');
    px(1, 3, 10, 1, '#0b0914');
  });

  make(FXT.BLUR, 12, 3, (c) => {
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(0, 1, 12, 1);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(2, 0, 8, 3);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(1, 0, 1, 3);
    c.fillRect(10, 0, 1, 3);
  });
}

/**
 * Adds chunk frames to a breakable's texture so the smashed pieces can fly
 * off as real sprites. boxes 24x48 -> three 24x16 boxes; gate 16x56 -> two halves.
 * Returns the frame names (cached on the texture).
 */
export function breakableChunks(scene, key, type) {
  if (!scene.textures.exists(key)) return [];
  const tex = scene.textures.get(key);
  const src = tex.source[0];
  const W = src.width;
  const H = src.height;
  const names = [];
  const rows = type === 'boxes' ? 3 : 2;
  const h = Math.floor(H / rows);
  for (let i = 0; i < rows; i++) {
    const name = `fx-chunk-${i}`;
    if (!tex.has(name)) tex.add(name, 0, 0, i * h, W, h);
    names.push(name);
  }
  return names;
}
