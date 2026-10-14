// =============================================================================
// HazardSystem — owns the level's hazards (Crow, RoofTile, Chimes), updates
// them on the world clock, and answers "did Soba touch one this frame?".
//
//   contact(soba, prevFeetY, invulnerable) -> { stomp: crow } | { hit: hazard } | null
//     A stomp wins over a hit (and works while invulnerable); hits are ignored
//     while Soba is invulnerable (respawn blink).
//   near(camTop) -> live hazards around the view (the bot plans against these)
//   resetForRespawn(height) -> re-arm roof tiles above the respawn point
//
// scene = null runs headless (node scripts): no views, same logic.
// =============================================================================

import { GAME, HAZARD } from '../core/Constants.js';
import { Crow } from '../entities/Crow.js';
import { RoofTile } from '../entities/RoofTile.js';
import { Chimes } from '../entities/Chimes.js';

const MAKERS = {
  crow: def => new Crow(def),
  tile: def => new RoofTile(def),
  chimes: def => new Chimes(def),
};

export function makeHazard(def) {
  const make = MAKERS[def.type];
  if (!make) throw new Error(`unknown hazard type "${def.type}"`);
  return make(def);
}

export class HazardSystem {
  constructor(scene, level) {
    this.scene = scene;
    this.list = (level.hazards || []).map(makeHazard);
    if (scene) for (const h of this.list) h.createView(scene);
  }

  /**
   * @param {number} dt seconds
   * @param {number} T world clock
   * @param {{sobaHeight:number, camTop:number, playing:boolean}} ctx
   */
  update(dt, T, ctx) {
    for (const h of this.list) h.update(dt, T, ctx);
  }

  contact(s, prevFeetY, invulnerable) {
    let hit = null;
    for (const h of this.list) {
      const c = h.contact(s, prevFeetY);
      if (c === 'stomp') return { stomp: h };
      if (c === 'hit' && !invulnerable && !hit) hit = h;
    }
    return hit ? { hit } : null;
  }

  /** Live hazards within a margin of the view (the bot's world model). */
  near(camTop) {
    const lo = camTop - HAZARD.CULL_MARGIN;
    const hi = camTop + GAME.HEIGHT + HAZARD.CULL_MARGIN;
    return this.list.filter(h => h.live && (h.type === 'tile' || (h.y >= lo && h.y <= hi)));
  }

  resetForRespawn(respawnHeight) {
    for (const h of this.list) h.reset(respawnHeight);
  }

  /** Views follow the logic; off-screen hazards are hidden. */
  syncViews(camTop) {
    const lo = camTop - HAZARD.CULL_MARGIN;
    const hi = camTop + GAME.HEIGHT + HAZARD.CULL_MARGIN;
    for (const h of this.list) h.syncView(h.y >= lo && h.y <= hi);
  }

  /** Hazards on screen (and tiles that are warning), for render_game_to_text(). */
  snapshot(camTop) {
    return this.list
      .filter(h => (h.state !== 'gone' && h.state !== 'armed' && h.y >= camTop - 20 && h.y <= camTop + GAME.HEIGHT + 20)
        || h.state === 'warning')
      .map(h => h.snapshot());
  }
}
