// =============================================================================
// Backdrop — everything behind the platforms.
//
//   sky       screen-fixed Graphics redrawn every frame as flat 4 px bands. The
//             band colour is picked by the WORLD height that band shows
//             (+ a little extra toward the top of the screen), so the sky runs
//             sunset orange at the street -> rose -> violet -> night blue as the
//             camera climbs. Stars fade in high up; a banded sun sets behind
//             the skyline; a moon rises over the spire. Pure code, no image.
//   skyline   far rooftops at the street, vertical parallax 0.35.
//   wall      the tower facade: one baked image per zone (core/VisualBake.js:
//             own palette + details, dithered cross-fade at each gate, the
//             spire narrows in zone 4). Falls back to the plain wall tile.
//   gates     a pagoda eave band across the tower at each zone gate (composed
//             from the roof art) with a hanging zone sign.
//   lanterns  strings of paper lanterns that sway gently (street + zone 3).
//   street    270x48 at the street surface; roof art with its deck on the roof platform.
// All decoration sits behind the platforms (DEPTH.WALL .. DEPTH.ZONE_GATE).
// =============================================================================

import { GAME, COLORS, DEPTH, BACKDROP, CAMERA, WORLD, PLATFORM, UI, ZONE_LOOK as L } from '../core/Constants.js';
import { heightToY } from '../core/Kinematics.js';
import { FXK, wallKey } from '../core/VisualBake.js';

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Sky colour at height fraction t (0 street .. 1 above the roof). */
export function skyColor(t) {
  const stops = COLORS.SKY_STOPS;
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return lerpColor(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** World x range [x0, x1) of the facade column at a height (zone 4 is narrower). */
export function facadeRangeAt(level, heightPx) {
  const zones = level.zones;
  let k = 0;
  for (let i = zones.length - 1; i >= 0; i--) if (heightPx >= zones[i].startY) { k = i; break; }
  const r = L.X_RANGE[k] || [0, BACKDROP.WALL_W];
  return [BACKDROP.WALL_X + r[0], BACKDROP.WALL_X + r[1]];
}

export class Backdrop {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} level  LEVEL1 (zones, finish)
   * @param {{gates?: boolean}} [opts]
   */
  constructor(scene, level, opts = {}) {
    this.scene = scene;
    this.level = level;
    this.skySpan = level.finish.y + BACKDROP.SKY_ABOVE_ROOF;
    this.camTop0 = WORLD.STREET_Y + CAMERA.STREET_MARGIN - GAME.HEIGHT;
    this.roofY = heightToY(level.finish.y);
    this.moonRefTop = this.roofY - CAMERA.ROOF_SKY;   // view top at the roof

    this.sky = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.SKY);

    // Deterministic star field (one 270 x STAR_TILE_H tile, repeated)
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.stars = Array.from({ length: BACKDROP.STAR_COUNT }, () => ({
      x: Math.floor(rnd() * GAME.WIDTH),
      y: Math.floor(rnd() * BACKDROP.STAR_TILE_H),
      big: rnd() < 0.18,
      tw: rnd(),
    }));

    const sf = BACKDROP.SKYLINE_PARALLAX;
    const skylineBottom = GAME.HEIGHT - CAMERA.STREET_MARGIN + 6;
    this.skyline = scene.add.image(0, skylineBottom + this.camTop0 * sf, 'skyline')
      .setOrigin(0, 1).setScrollFactor(1, sf).setDepth(DEPTH.SKYLINE);

    this.buildWalls();

    this.street = scene.add.image(0, WORLD.STREET_Y, 'street').setOrigin(0, 0).setDepth(DEPTH.STREET);
    // Roof art: its drawn deck (row ROOF_DECK_ROW) is the roof platform's top.
    this.roofArt = scene.add.image(level.finish.x, this.roofY - PLATFORM.ROOF_DECK_ROW, 'roof')
      .setOrigin(0.5, 0).setDepth(DEPTH.ROOF_ART);

    this.buildLanterns();
    if (opts.gates !== false) this.drawGates();
  }

  /** Zone facades (baked); the plain tile if the bake is missing. */
  buildWalls() {
    const { scene } = this;
    this.walls = [];
    if (!scene.textures.exists(wallKey(0))) {
      this.walls.push(scene.add.tileSprite(BACKDROP.WALL_X, this.roofY, BACKDROP.WALL_W, WORLD.STREET_Y - this.roofY, 'wall')
        .setOrigin(0, 0).setDepth(DEPTH.WALL));
      return;
    }
    this.level.zones.forEach((_z, k) => {
      const tex = scene.textures.get(wallKey(k));
      this.walls.push(scene.add.image(BACKDROP.WALL_X, heightToY(tex.__hTop), wallKey(k))
        .setOrigin(0, 0).setDepth(DEPTH.WALL));
    });
  }

  /** Pagoda eave + hanging zone sign at each gate (zones 2-4). */
  drawGates() {
    const { scene } = this;
    this.gateItems = [];
    const hasEave = scene.textures.exists(FXK.EAVE);
    this.level.zones.forEach((zone, i) => {
      if (i === 0) return;
      const y = heightToY(zone.startY);
      if (hasEave) {
        const eave = scene.add.image(GAME.WIDTH / 2, y - L.EAVE_GATE_ROW, FXK.EAVE)
          .setOrigin(0.5, 0).setDepth(DEPTH.ZONE_GATE).setTint(L.EAVE_TINT[i] ?? 0xffffff);
        this.gateItems.push(eave);
      }
      // Hanging sign under the eave: dark lacquer board, gold edge, zone name
      const label = `${zone.id} · ${zone.name.toUpperCase()}`;
      const text = scene.add.text(L.SIGN_X, y + 26, label, {
        fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE}px`, fontStyle: 'bold', color: L.SIGN_TEXT,
      }).setOrigin(0.5).setDepth(DEPTH.ZONE_GATE);
      const w = Math.ceil(text.width) + 12;
      const h = 14;
      const signX = this.signX(zone.startY - 26, w, h);
      text.setX(signX);
      const g = scene.add.graphics().setDepth(DEPTH.ZONE_GATE);
      const x0 = Math.round(signX - w / 2);
      const y0 = Math.round(y + 26 - h / 2);
      g.fillStyle(0x1a1220, 1);
      g.fillRect(x0 + 8, y + 16, 1, y0 - y - 16);              // cords
      g.fillRect(x0 + w - 9, y + 16, 1, y0 - y - 16);
      g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
      g.fillStyle(L.SIGN_EDGE, 1);
      g.fillRect(x0, y0, w, h);
      g.fillStyle(L.SIGN_FILL, 1);
      g.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
      text.setDepth(DEPTH.ZONE_GATE + 0.1);
      this.gateItems.push(g, text);
    });
  }

  /**
   * Centre x for a gate sign (w x h, centred at height hc) that keeps it clear
   * of the platforms drawn over it: L.SIGN_X, nudged left past any platform
   * art in its rows, or mirrored to the right side if the left has no room.
   */
  signX(hc, w, h) {
    const art = PLATFORM.HEIGHT;
    const blocks = this.level.platforms
      .filter(p => p.type !== 'street' && p.y - art < hc + h / 2 + 1 && p.y + (p.rise || 0) > hc - h / 2 - 1)
      .map(p => {
        const reach = p.w / 2 + (p.range || 0) + L.SIGN_CLEAR;
        return [p.x - reach, p.x + reach];
      });
    const clear = cx => blocks.every(([a, b]) => cx + w / 2 <= a || cx - w / 2 >= b);
    const minX = L.SIGN_MIN_X + w / 2;
    for (let cx = L.SIGN_X; cx >= minX; cx--) if (clear(cx)) return cx;
    for (let cx = GAME.WIDTH - L.SIGN_X; cx <= GAME.WIDTH - minX; cx++) if (clear(cx)) return cx;
    return L.SIGN_X;
  }

  /** Paper lantern strings across the facade (static rope, swaying lanterns). */
  buildLanterns() {
    const { scene } = this;
    this.strings = [];
    if (!scene.textures.exists(FXK.LANTERN)) return;
    const n = L.LANTERNS_PER_STRING;
    for (const h of L.LANTERN_STRINGS) {
      if (h > this.level.finish.y) continue;
      const y = heightToY(h);
      const [x0, x1] = facadeRangeAt(this.level, h);
      const rope = scene.add.image(x0, y, FXK.ROPE).setOrigin(0, 0).setDepth(DEPTH.ZONE_GATE - 1)
        .setCrop(0, 0, x1 - x0, L.LANTERN_SAG + 2);
      const lanterns = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = Math.round(x0 + t * (x1 - x0));
        const sag = Math.round(L.LANTERN_SAG * Math.sin(t * Math.PI));
        const img = scene.add.image(x, y + sag, FXK.LANTERN).setOrigin(0.5, 0)
          .setDepth(DEPTH.ZONE_GATE - 1).setAlpha(L.LANTERN_ALPHA);
        lanterns.push({ img, phase: (i * 1.7 + h * 0.013) % (Math.PI * 2) });
      }
      this.strings.push({ y, rope, lanterns });
    }
  }

  /** Redraws the sky for the current camera position; sways visible lanterns. */
  update(camTop, time = 0) {
    const g = this.sky;
    const H = GAME.HEIGHT;
    const band = BACKDROP.SKY_BAND;
    g.clear();
    const tAt = (screenY) => {
      const h = WORLD.STREET_Y - (camTop + screenY);
      return Math.max(0, Math.min(1, h / this.skySpan + (1 - screenY / H) * BACKDROP.SKY_SPREAD));
    };
    for (let y = 0; y < H; y += band) {
      g.fillStyle(skyColor(tAt(y + band / 2)), 1);
      g.fillRect(0, y, GAME.WIDTH, band);
    }

    // Sun: sinks behind the skyline as the camera climbs
    const sunY = BACKDROP.SUN_SCREEN_Y + (this.camTop0 - camTop) * BACKDROP.SUN_PARALLAX;
    if (sunY - BACKDROP.SUN_R < H) {
      g.fillStyle(COLORS.SUN, 1);
      g.fillCircle(BACKDROP.SUN_X, sunY, BACKDROP.SUN_R);
      g.fillStyle(COLORS.SUN_BAND, 1);
      for (let i = 0; i < 4; i++) {
        const by = sunY + 6 + i * 7;
        g.fillRect(BACKDROP.SUN_X - BACKDROP.SUN_R, by, BACKDROP.SUN_R * 2, 2 + (i >> 1));
      }
    }

    // Stars: fade in with altitude, drift down slowly as the camera rises
    const tile = BACKDROP.STAR_TILE_H;
    const drift = (-camTop) * BACKDROP.STAR_PARALLAX;
    for (const s of this.stars) {
      const sy = ((s.y + drift) % tile + tile) % tile;
      if (sy >= H) continue;
      const tw = 0.55 + 0.45 * s.tw * (0.75 + 0.25 * Math.sin(time * 2.1 + s.x));
      const a = smooth(BACKDROP.STAR_FROM, BACKDROP.STAR_FULL, tAt(sy)) * tw;
      if (a <= 0.02) continue;
      g.fillStyle(COLORS.STAR, a);
      g.fillRect(s.x, Math.floor(sy), s.big ? 2 : 1, s.big ? 2 : 1);
    }

    this.drawMoon(g, camTop, tAt);
    this.swayLanterns(camTop, time);
  }

  /** A big moon over the spire: slow parallax, fades in with the night sky. */
  drawMoon(g, camTop, tAt) {
    const my = Math.round(L.MOON_Y_AT_ROOF + (this.moonRefTop - camTop) * L.MOON_PARALLAX);
    if (my + L.MOON_R + 8 < 0) return;
    const a = smooth(L.MOON_FROM, L.MOON_FULL, tAt(Math.max(0, my)));
    if (a <= 0.02) return;
    const [lit, mid, crater] = L.MOON;
    const x = L.MOON_X;
    const r = L.MOON_R;
    g.fillStyle(lit, 0.08 * a);
    g.fillCircle(x, my, r + 9);
    g.fillStyle(lit, 0.12 * a);
    g.fillCircle(x, my, r + 4);
    g.fillStyle(lit, a);
    g.fillCircle(x, my, r);
    g.fillStyle(mid, a);
    g.fillCircle(x + 4, my + 3, r - 4);
    g.fillStyle(lit, a);
    g.fillCircle(x - 2, my - 2, r - 5);
    g.fillStyle(crater, a);
    g.fillCircle(x - 6, my - 5, 3);
    g.fillCircle(x + 5, my + 6, 4);
    g.fillCircle(x + 7, my - 6, 2);
    g.fillCircle(x - 4, my + 8, 2);
  }

  swayLanterns(camTop, time) {
    const lo = camTop - 40;
    const hi = camTop + GAME.HEIGHT + 20;
    for (const s of this.strings) {
      const show = s.y >= lo && s.y <= hi;
      if (s.rope.visible !== show) {
        s.rope.setVisible(show);
        for (const l of s.lanterns) l.img.setVisible(show);
      }
      if (!show) continue;
      for (const l of s.lanterns) {
        l.img.setAngle(L.LANTERN_SWAY_DEG * Math.sin((2 * Math.PI * time) / L.LANTERN_SWAY_S + l.phase));
      }
    }
  }

  /** Sky colour at the street (Results/Title backgrounds reuse it). */
  static colorAt(t) {
    return skyColor(t);
  }
}
