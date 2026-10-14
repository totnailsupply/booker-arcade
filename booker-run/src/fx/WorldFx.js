import Phaser from 'phaser';
import { DEPTH, FX, WORLD, GAME } from '../core/Constants.js';
import { FXT, outlineSheet } from './textures.js';

// =============================================================================
// WorldFx — idle life for level elements. Visual only.
//   - drones: rotor blur over both rotors, a soft ground shadow that shrinks
//     with height (so their height reads), and a 1 px dark outline so a low
//     drone reads against the busy (orange) market stalls behind it
//   - vacuums: the red light glows when the sprite's light frame shows
//   - steam vents / updrafts (views built by LevelWorld): culled when off
//     screen so their emitters never run behind the camera
//   - golden steak (Level 6 finish): rotating sunburst, bigger halo and beam,
//     twinkling glints
// =============================================================================

const G = WORLD.GROUND_Y;
const MARGIN = 64;

export class WorldFx {
  /** @param {import('../systems/Effects.js').Effects} fx */
  constructor(fx) {
    this.fx = fx;
    this.scene = fx.scene;
    this.world = fx.scene.world || null;
    this.decor = [];
    // Steam / updraft emitters too, so the death hit-stop and the win slow-mo reach them
    this.emitters = this.world ? [
      ...(this.world.steamViews || []).flatMap(v => v.emitters || []),
      ...(this.world.updraftViews || []).flatMap(v => v.emitters || []),
    ] : [];
    if (this.world) this.decorateEnemies();
  }

  decorateEnemies() {
    const w = this.world;
    const add = this.scene.add;
    w.model.movers.forEach((m, i) => {
      if (m.kind !== 'enemy') return;
      const o = w.moverSprites[i];
      if (!o) return;
      if (m.type === 'drone') {
        outlineSheet(this.scene, o.texture.key, FXT.DRONE_OUTLINE, FX.DRONE_OUTLINE_COLOR);
        const outline = this.scene.textures.exists(FXT.DRONE_OUTLINE)
          ? add.image(0, 0, FXT.DRONE_OUTLINE, o.frame.name).setAlpha(FX.DRONE_OUTLINE_ALPHA).setDepth(DEPTH.ENEMY - 0.5)
          : null;
        const rotors = [[-6, -7], [5, -7]].map(([dx, dy]) => ({
          img: add.image(0, 0, FXT.BLUR).setBlendMode(Phaser.BlendModes.ADD).setTint(FX.ROTOR_COLOR)
            .setDepth(DEPTH.ENEMY + 1),
          dx,
          dy,
        }));
        const shadow = add.image(0, G + 1, FXT.SOFT).setTint(0x000000).setDepth(DEPTH.PLATFORM + 1);
        this.decor.push({ type: 'drone', o, i, rotors, shadow, outline, t: Math.random() * 100 });
      } else if (m.type === 'vacuum') {
        const glow = add.image(0, 0, FXT.SOFT).setBlendMode(Phaser.BlendModes.ADD)
          .setTint(FX.VACUUM_LIGHT_COLOR).setScale(FX.VACUUM_LIGHT_SCALE).setDepth(DEPTH.ENEMY + 1);
        this.decor.push({ type: 'vacuum', o, i, glow });
      }
    });
  }

  /** Over a pit? (no shadow there) */
  overGap(x) {
    for (const g of this.world.model.gaps) if (x >= g.x && x <= g.x + g.width) return true;
    return false;
  }

  /** Golden steak extras (called by Effects.decorateSteak for the golden finish). */
  decorateGolden(steak, cx, cy) {
    const add = this.scene.add;
    this.sunburst = add.image(cx, cy, FXT.SUNBURST)
      .setTint(FX.GOLDEN_RAY_COLOR).setAlpha(FX.GOLDEN_RAY_ALPHA).setScale(FX.GOLDEN_RAY_SCALE)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.PICKUP - 3);
    this.sunburst2 = add.image(cx, cy, FXT.SUNBURST)
      .setTint(0xffffff).setAlpha(FX.GOLDEN_RAY_ALPHA * 0.5).setScale(FX.GOLDEN_RAY_SCALE * 0.7).setAngle(15)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.PICKUP - 3);
    const tw = this.scene.tweens;
    tw.add({ targets: this.sunburst, angle: 360, duration: FX.GOLDEN_RAY_SPIN_MS, repeat: -1 });
    tw.add({ targets: this.sunburst2, angle: -345, duration: FX.GOLDEN_RAY_SPIN_MS * 0.7, repeat: -1 });
    tw.add({
      targets: [this.sunburst, this.sunburst2],
      scale: `*=${1.12}`,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Twinkling glints around the steak
    this.glints = add.particles(cx, cy, FXT.STAR, {
      frequency: FX.GOLDEN_GLINT_EVERY_MS,
      x: { min: -40, max: 40 },
      y: { min: -36, max: 14 },
      lifespan: 600,
      // grow then shrink over the lifespan: a twinkle
      scale: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 1.4 },
      tint: [0xffffff, 0xffe9a0],
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 10,
    }).setDepth(DEPTH.PICKUP + 1);
    this.emitters.push(this.glints);
    return [this.sunburst, this.sunburst2];
  }

  /** Follows enemies (scene POST_UPDATE, after LevelWorld moved them). */
  postUpdate(delta) {
    if (!this.world) return;
    const cam = this.scene.cameras.main;
    const left = cam.scrollX - MARGIN;
    const right = cam.scrollX + GAME.WIDTH + MARGIN;
    for (const d of this.decor) {
      const o = d.o;
      const alive = this.world.moverStates[d.i]?.alive && o.visible;
      const on = alive && o.x > left && o.x < right;
      if (d.type === 'drone') {
        d.t += delta;
        if (d.outline) {
          d.outline.setVisible(on);
          if (on) {
            d.outline.setPosition(o.x, o.y).setFrame(o.frame.name).setScale(o.scaleX, o.scaleY)
              .setAngle(o.angle).setFlipX(o.flipX);
          }
        }
        for (const r of d.rotors) {
          r.img.setVisible(on);
          if (!on) continue;
          // fast flicker reads as spinning blades
          const ph = Math.floor(d.t / 33) % 3;
          r.img.setPosition(o.x + r.dx, o.y + r.dy).setScale(0.75 + 0.18 * ph, 1).setAlpha(0.35 + 0.2 * ph);
        }
        const showShadow = on && !this.overGap(o.x);
        d.shadow.setVisible(showShadow);
        if (showShadow) {
          const hgt = Math.max(0, G - o.y);
          const k = Phaser.Math.Clamp(1 - hgt / 160, 0.35, 1);
          d.shadow.setPosition(o.x, G + 1).setScale(1.5 * k, 0.35 * k).setAlpha(FX.DRONE_SHADOW_ALPHA * k);
        }
      } else if (d.type === 'vacuum') {
        // Frame 0 has the light on; the 2-frame loop makes it blink
        const lit = on && (o.frame.name === 0 || o.frame.name === '0');
        d.glow.setVisible(lit);
        if (lit) d.glow.setPosition(o.x - 0.5, o.y - 11.5);
      }
    }
  }

  /** Culls the steam and updraft views (scene UPDATE). */
  update(delta) {
    const w = this.world;
    if (!w) return;
    const cam = this.scene.cameras.main;
    const left = cam.scrollX - MARGIN;
    const right = cam.scrollX + GAME.WIDTH + MARGIN;
    for (const v of w.steamViews || []) {
      if (v.setOnScreen) v.setOnScreen(v.st.x > left && v.st.x < right);
    }
    for (const v of w.updraftViews || []) {
      if (!v.setOnScreen) continue;
      v.setOnScreen(v.u.x + v.u.w > left && v.u.x < right);
      v.update(delta);
    }
  }

  destroy() {}
}
