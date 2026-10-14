// =============================================================================
// RoofTile — a falling roof tile. Triggered when Soba's feet reach the trigger
// height: a red mark flashes at the top edge of the screen in the tile's column
// for TILE.WARN_S (0.6 s), then the tile drops from just above the screen, fast.
// Contact hurts. Fires once per attempt; a respawn below the trigger re-arms it,
// so every try plays the same.
// Level def: { type: 'tile', x (column centre), y (trigger height) }.
// Logic has no Phaser import (node scripts run it); the view is optional.
// =============================================================================

import { TILE, GAME, DEPTH, COLORS, UI, DANGER } from '../core/Constants.js';
import { cappedFall } from '../core/Kinematics.js';
import { bodyOverlaps } from '../core/Hitboxes.js';
import { RIM } from '../core/Assets.js';

export class RoofTile {
  constructor(def) {
    this.type = 'tile';
    this.def = def;
    this.x = def.x;
    this.trigger = def.y;
    this.state = 'armed';
    this.warnS = 0;
    this.warnAge = 0;
    this.fallS = 0;
    this.y0 = 0;
    this.y = 0;
    this.vy = 0;
    this.angle = 0;
    this.time = 0;
    this.view = null;
  }

  get live() {
    return this.state === 'warning' || this.state === 'falling';
  }

  /**
   * @param {number} dt seconds
   * @param {number} T world clock
   * @param {{sobaHeight:number, camTop:number, playing:boolean}} ctx
   */
  update(dt, T, ctx) {
    this.time = T;
    if (this.state === 'armed') {
      // Fires when Soba's feet reach the trigger height from below (a start or
      // respawn far above it never sets it off)
      if (ctx.playing && ctx.sobaHeight >= this.trigger && ctx.sobaHeight <= this.trigger + TILE.TRIGGER_WINDOW) {
        this.state = 'warning';
        this.warnS = TILE.WARN_S;
        this.warnAge = 0;
        this.justWarned = true;
      }
    } else if (this.state === 'warning') {
      this.warnS -= dt;
      this.warnAge += dt;
      if (this.warnS <= 0) {
        this.state = 'falling';
        this.y0 = ctx.camTop - TILE.H;
        this.fallS = 0;
        this.y = this.y0;
        this.vy = TILE.FALL_V0;
      }
    } else if (this.state === 'falling') {
      this.fallS += dt;
      this.y = this.y0 + cappedFall(this.fallS, TILE.FALL_V0, TILE.FALL_GRAVITY, TILE.FALL_MAX);
      this.vy = Math.min(TILE.FALL_MAX, TILE.FALL_V0 + TILE.FALL_GRAVITY * this.fallS);
      this.angle = TILE.WOBBLE_DEG * Math.sin(2 * Math.PI * TILE.WOBBLE_HZ * this.fallS);
      if (this.y > ctx.camTop + GAME.HEIGHT + TILE.H * 4) this.state = 'gone';
    }
  }

  /** Tile centre y tau seconds from now, or null when it isn't falling then. */
  predictY(tau, camTop) {
    if (this.state === 'warning') {
      const f = tau - this.warnS;
      if (f < 0) return null;
      return camTop - TILE.H + cappedFall(f, TILE.FALL_V0, TILE.FALL_GRAVITY, TILE.FALL_MAX);
    }
    if (this.state === 'falling') {
      return this.y0 + cappedFall(this.fallS + tau, TILE.FALL_V0, TILE.FALL_GRAVITY, TILE.FALL_MAX);
    }
    return null;
  }

  contact(s) {
    if (this.state !== 'falling') return null;
    return bodyOverlaps(s.x, s.y, this.x, this.y, TILE.HURT_W, TILE.HURT_H) ? 'hit' : null;
  }

  contactIn(tau, s, _prevFeetY, margin = 0, camTop = 0) {
    const y = this.predictY(tau, camTop);
    if (y === null) return null;
    return bodyOverlaps(s.x, s.y, this.x, y, TILE.HURT_W, TILE.HURT_H, margin) ? 'hit' : null;
  }

  /** Respawn (or a debug start) at respawnHeight: tiles above it fire again on
   * the next try; tiles below it are spent. */
  reset(respawnHeight) {
    if (this.trigger > respawnHeight) {
      this.state = 'armed';
      this.warnS = 0;
      this.fallS = 0;
    } else if (this.state === 'armed') {
      this.state = 'gone';
    }
  }

  // --- view ---------------------------------------------------------------------

  createView(scene) {
    this.view = scene.add.image(this.x, 0, RIM.KEYS['roof-tile'], 0).setDepth(DEPTH.HAZARD).setVisible(false);
    // Warning: a screen-fixed red mark under the HUD panel + a faint column guide
    this.marker = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD + 2).setVisible(false);
    this.markerText = scene.add.text(this.x, TILE.MARKER_Y + 1, '!', {
      fontFamily: UI.FONT, fontSize: `${UI.BODY_SIZE}px`, fontStyle: 'bold', color: COLORS.TILE_WARN_TEXT,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.HUD + 3).setVisible(false);
  }

  syncView(visible) {
    const warn = this.state === 'warning';
    if (this.marker) {
      const on = warn && Math.floor(this.warnAge * 1000 / TILE.BLINK_MS) % 2 === 0;
      this.marker.setVisible(warn);
      this.markerText.setVisible(warn);
      if (warn) {
        const g = this.marker;
        const x = Math.round(this.x);
        const y = TILE.MARKER_Y;
        g.clear();
        // dark outline, then the red mark (bright / dim blink), then the column guide
        g.fillStyle(COLORS.UI_SHADOW_HEX, 1);
        g.fillTriangle(x - 11, y - 1, x + 11, y - 1, x, y + 17);
        g.fillStyle(COLORS.TILE_WARN, on ? 1 : 0.6);
        g.fillTriangle(x - 9, y, x + 9, y, x, y + 15);
        const cw = DANGER.WARN_COL_W;
        g.fillStyle(COLORS.TILE_WARN, on ? DANGER.WARN_COL_ALPHA[0] : DANGER.WARN_COL_ALPHA[1]);
        for (let ly = y + 20; ly < GAME.HEIGHT; ly += 8) g.fillRect(x - Math.floor(cw / 2), ly, cw, 4);
      }
    }
    const v = this.view;
    if (!v) return;
    const show = visible && this.state === 'falling';
    v.setVisible(show);
    if (show) v.setPosition(Math.round(this.x), Math.round(this.y)).setAngle(this.angle);
  }

  snapshot() {
    return {
      type: this.type, x: Math.round(this.x), y: Math.round(this.y), state: this.state,
      trigger: this.trigger, warnLeft: this.state === 'warning' ? Math.round(this.warnS * 100) / 100 : undefined,
    };
  }
}
