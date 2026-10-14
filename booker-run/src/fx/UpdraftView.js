import Phaser from 'phaser';
import { DEPTH, UPDRAFT, FX, WORLD, GAME } from '../core/Constants.js';
import { FXT } from './textures.js';

// =============================================================================
// UpdraftView — what an updraft looks like. Visual only (the lift zone itself
// lives in LevelModel). The column's width and height must read at a glance:
//   - a faint fill that is strongest at the vent,
//   - dashed side edges that scroll upward (the width),
//   - rising air streaks and a few leaves that die exactly at the zone's top
//     (the height), plus a faint lip line there.
// =============================================================================

const G = WORLD.GROUND_Y;

export class UpdraftView {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} u LevelModel updraft ({ x, y, w, h })
   * @param {Array<{x:number,width:number}>} gaps pits: a vent over one gets a pipe down into it
   */
  constructor(scene, u, gaps = []) {
    this.scene = scene;
    this.u = u;
    this.visible = true;
    const cx = u.x + u.w / 2;
    const zone = new Phaser.Geom.Rectangle(u.x, u.y, u.w, u.h);
    // Per-level colours (FX.UPDRAFT_THEMES, by level number): e.g. warm air on Steakhouse Row
    const th = FX.UPDRAFT_THEMES[scene.entry?.number] || {};
    const air = th.air ?? UPDRAFT.COLUMN_COLOR;

    this.fill = scene.add.image(u.x, G, FXT.UPCOL)
      .setOrigin(0, 1).setDisplaySize(u.w, u.h)
      .setTint(air).setAlpha(FX.UPDRAFT_FILL_ALPHA).setDepth(DEPTH.UPDRAFT);
    this.edges = [u.x, u.x + u.w - 1].map(x => scene.add.tileSprite(x, G, 1, u.h, FXT.DASHED)
      .setOrigin(0, 1).setTint(air).setAlpha(FX.UPDRAFT_EDGE_ALPHA).setDepth(DEPTH.UPDRAFT));
    this.lip = scene.add.tileSprite(u.x, u.y, u.w, 1, FXT.HDASH)
      .setOrigin(0, 0).setTint(air).setAlpha(FX.UPDRAFT_EDGE_ALPHA * 0.8)
      .setDepth(DEPTH.UPDRAFT);
    this.vent = scene.add.image(cx, G, UPDRAFT.VENT_KEY).setOrigin(0.5, 1).setDepth(DEPTH.UPDRAFT + 1);
    if (th.vent !== undefined) this.vent.setTint(th.vent);
    // Over a pit the vent would float on the pit's top edge: mount it on a pipe going down
    // into the pit (a flange under the vent, then the pipe to the bottom of the screen)
    this.pipe = null;
    if (gaps.some(g => cx > g.x && cx < g.x + g.width)) {
      this.pipe = scene.add.tileSprite(cx, G - 1, 12, GAME.HEIGHT - G + 1, FXT.PIPE)
        .setOrigin(0.5, 0).setDepth(DEPTH.UPDRAFT + 0.5);
      if (th.vent !== undefined) this.pipe.setTint(th.vent);
    }

    // Air streaks across the whole zone; they die on leaving it, so their
    // ends mark the top edge
    this.streaks = scene.add.particles(0, 0, FXT.LINE, {
      frequency: FX.UPDRAFT_STREAK_EVERY_MS,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(u.x + 3, u.y + 4, u.w - 6, u.h - 10) },
      deathZone: { type: 'onLeave', source: zone },
      speedY: { min: -UPDRAFT.STREAK_SPEED[1], max: -UPDRAFT.STREAK_SPEED[0] },
      lifespan: 900,
      rotate: 90,
      scaleX: { min: 0.8, max: 1.8 },
      alpha: { start: FX.UPDRAFT_STREAK_ALPHA, end: 0.1 },
      tint: air,
      maxAliveParticles: FX.UPDRAFT_STREAK_MAX,
    }).setDepth(DEPTH.UPDRAFT);

    // A few leaves / paper scraps tumbling up from the vent
    this.leaves = scene.add.particles(0, 0, FXT.LEAF, {
      frequency: FX.UPDRAFT_LEAF_EVERY_MS,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(u.x + 6, G - 14, u.w - 12, 6) },
      deathZone: { type: 'onLeave', source: zone },
      speedY: { min: -120, max: -70 },
      speedX: { min: -14, max: 14 },
      lifespan: 4000,
      rotate: { start: 0, end: 900 },
      tint: th.leaves || FX.UPDRAFT_LEAF_COLORS,
      maxAliveParticles: 4,
    }).setDepth(DEPTH.UPDRAFT + 1);

    this.emitters = [this.streaks, this.leaves];
    this.objects = [this.fill, ...this.edges, this.lip];
  }

  update(dt) {
    if (!this.visible) return;
    const dy = dt * FX.UPDRAFT_EDGE_SCROLL;
    for (const e of this.edges) e.tilePositionY += dy;
    this.lip.tilePositionX += dy * 0.25;
  }

  setOnScreen(on) {
    if (on === this.visible) return;
    this.visible = on;
    for (const e of this.emitters) {
      if (on) e.start();
      else e.stop();
    }
  }
}
