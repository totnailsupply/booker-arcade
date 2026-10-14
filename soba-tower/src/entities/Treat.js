// =============================================================================
// Treats — the 40 dog biscuits of a level (+25 each). TreatField owns them all:
// pickup test against Soba's generous pickup box, views (gentle bob), and the
// on-screen list for render_game_to_text(). Collected treats stay collected for
// the whole attempt (respawns included).
// Level def: { x, y (height of the biscuit centre), off?: true (off the natural path) }.
// Logic has no Phaser import (node scripts run it); views are optional.
// =============================================================================

import { TREAT, DEPTH, GAME } from '../core/Constants.js';
import { heightToY } from '../core/Kinematics.js';
import { pickupOverlaps } from '../core/Hitboxes.js';

export class TreatField {
  constructor(scene, level) {
    this.scene = scene;
    this.list = (level.treats || []).map((t, i) => ({
      id: i, x: t.x, y: heightToY(t.y), off: !!t.off, collected: false, view: null,
    }));
    this.total = this.list.length;
    if (scene) {
      for (const t of this.list) {
        t.view = scene.add.image(t.x, t.y, 'treat').setDepth(DEPTH.TREAT).setVisible(false);
      }
    }
  }

  /** Treats Soba picks up this frame (marked collected). */
  collect(s) {
    let out = null;
    for (const t of this.list) {
      if (t.collected) continue;
      if (pickupOverlaps(s.x, s.y, t.x, t.y)) {
        t.collected = true;
        (out || (out = [])).push(t);
      }
    }
    return out;
  }

  get collectedCount() {
    let n = 0;
    for (const t of this.list) if (t.collected) n += 1;
    return n;
  }

  syncViews(camTop, T) {
    const lo = camTop - 20;
    const hi = camTop + GAME.HEIGHT + 20;
    for (const t of this.list) {
      if (!t.view) continue;
      const show = !t.collected && t.y >= lo && t.y <= hi;
      if (t.view.visible !== show && !t.popping) t.view.setVisible(show);
      if (show) {
        const bob = Math.round(Math.sin((2 * Math.PI * T) / TREAT.BOB_S + t.id) * TREAT.BOB_PX);
        t.view.setPosition(t.x, t.y + bob);
      }
    }
  }

  onScreen(camTop) {
    return this.list
      .filter(t => !t.collected && t.y >= camTop && t.y <= camTop + GAME.HEIGHT)
      .map(t => ({ x: t.x, y: Math.round(t.y), off: t.off || undefined }));
  }
}
