// =============================================================================
// PlatformSpawner — owns every platform of the level, keeps only the ones near
// the camera active, and pools their Images.
//
//   - All level platforms exist as cheap logical Platform objects (their state
//     survives being culled, e.g. a crumbled beam stays crumbled until a respawn).
//   - A platform is ACTIVE while its top is within PLATFORM.CULL_MARGIN (one
//     screen) above or below the view. Only active platforms update, take part
//     in landing tests and hold an Image from the pool. Moving platforms are pure
//     functions of the world clock, so culling never changes where they are.
//   - 'spring' beams get a 'springpad' platform on top (its own landing surface).
//   - Runtime platforms (the respawn cushion) are added with addDynamic() and
//     dropped once they die.
//   - scene = null runs headless (node scripts): no views, same logic.
//
// Frame order (ClimbSim.step): spawner.update() records prevY and moves
// platforms, THEN Soba steps, THEN the swept landing test.
// =============================================================================

import { GAME, PLATFORM, SLIDER, LIFT, DEPTH } from '../core/Constants.js';
import { Platform, makeStreet, makeSpringPad } from '../entities/Platform.js';

export class PlatformSpawner {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.platforms = [];
    for (const def of level.platforms) {
      const p = new Platform(def);
      this.platforms.push(p);
      if (p.type === 'spring') {
        p.pad = makeSpringPad(p);
        this.platforms.push(p.pad);
      }
    }
    this.street = makeStreet();
    this.platforms.push(this.street);
    this.roof = new Platform({ ...level.finish, type: 'roof' });
    this.platforms.push(this.roof);
    this.pool = [];
    this.active = [];
    this.viewsCreated = 0;
    this.rig = scene ? scene.add.graphics().setDepth(DEPTH.RIG) : null;
  }

  /** Adds a runtime platform (def.y is a height in px). */
  addDynamic(def) {
    const p = new Platform(def, { dynamic: true });
    this.platforms.push(p);
    return p;
  }

  acquireView() {
    let img = this.pool.pop();
    if (!img) {
      img = this.scene.add.image(0, 0, '__DEFAULT');
      this.viewsCreated += 1;
    }
    return img;
  }

  activate(p) {
    p.active = true;
    if (this.scene && p.textureKey()) p.attachView(this.acquireView(), this.scene);
  }

  deactivate(p) {
    p.active = false;
    const img = p.detachView();
    if (img) this.pool.push(img);
  }

  /**
   * @param {number} dt seconds
   * @param {number} camTop world y of the top of the view
   * @param {number} [time] world clock (s)
   */
  update(dt, camTop, time = 0) {
    const lo = camTop - PLATFORM.CULL_MARGIN;
    const hi = camTop + GAME.HEIGHT + PLATFORM.CULL_MARGIN;
    const list = this.platforms;
    this.active.length = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.prevY = p.y;
      const want = p.alive && p.y >= lo && p.y <= hi;
      if (want && !p.active) {
        p.update(0, time);      // catch up to the clock before the view appears
        p.prevY = p.y;
        this.activate(p);
      } else if (!want && p.active) {
        this.deactivate(p);
      }
      if (!p.alive && p.dynamic) {
        list.splice(i, 1);
        continue;
      }
      if (p.active) {
        p.update(dt, time);
        if (!p.alive) {
          this.deactivate(p);
          if (p.dynamic) list.splice(i, 1);
          continue;
        }
        p.syncView();
        this.active.push(p);
      }
    }
    if (this.rig) this.drawRig();
  }

  /** Slider rails and lift chains for the active moving platforms. */
  drawRig() {
    const g = this.rig;
    g.clear();
    g.fillStyle(PLATFORM.RIG_COLOR, PLATFORM.RIG_ALPHA);
    for (const p of this.active) {
      const rig = p.behavior.rig;
      if (rig === 'rail') {
        const x0 = Math.round(p.cx - p.range - p.w / 2);
        const x1 = Math.round(p.cx + p.range + p.w / 2);
        const y = Math.round(p.yAt(p.time)) + SLIDER.RAIL_DY;
        g.fillRect(x0, y, x1 - x0, 1);
        g.fillRect(x0, y - SLIDER.POST_H + 1, 1, SLIDER.POST_H);
        g.fillRect(x1 - 1, y - SLIDER.POST_H + 1, 1, SLIDER.POST_H);
      } else if (rig === 'chain') {
        const top = Math.round(p.yLow - p.rise - LIFT.CHAIN_ABOVE);
        const y = Math.round(p.y);
        for (const cx of [p.x - p.w / 2 + LIFT.CHAIN_INSET, p.x + p.w / 2 - LIFT.CHAIN_INSET - 1]) {
          const x = Math.round(cx);
          // links: 2 px dashes with an offset every other link
          for (let ly = top; ly < y; ly += 3) g.fillRect(x + ((ly - top) % 6 ? 1 : 0), ly, 1, 2);
        }
        g.fillRect(Math.round(p.x - p.w / 2 + 2), top - 1, p.w - 4, 2);   // anchor bar
      }
    }
  }

  /** Respawn: crumbled planks come back for the next try. */
  resetForRespawn() {
    for (const p of this.platforms) p.reset();
  }

  /** Active platforms whose top is inside the view (for render_game_to_text). */
  onScreen(camTop) {
    return this.active
      .filter(p => p.type !== 'street' && p.y >= camTop && p.y <= camTop + GAME.HEIGHT)
      .sort((a, b) => b.y - a.y);
  }

  /** Scene shutdown destroys the Images; just drop the references. */
  release() {
    this.pool = [];
    this.active = [];
    this.platforms = [];
    this.rig = null;
  }
}
