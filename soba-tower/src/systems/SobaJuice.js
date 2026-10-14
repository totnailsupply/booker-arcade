// =============================================================================
// SobaJuice — Soba's sprite deformation, computed every frame AFTER
// soba.render() (which places the sprite and its wrap ghost). Purely visual:
// Soba has no physics body, so scaling/rotating the sprite never touches the sim.
//
//   landing     squash (JUICE.LAND_*) that blends into ...
//   rising      a stretch proportional to the upward speed, back to 1 at the apex
//   falling     a slight stretch at speed
//   spring      a big tall stretch, settling over SPRING_MS
//   steering    a lean into the direction of travel
//   hurt        a tumble spin around her centre
//   night rim   a 1 px light outline sprite behind her (and her ghost) that fades
//               in on the way to zone 3, so the black fur reads on the dark facade
// The wrap ghost always copies the same scale / angle / origin / rim.
// =============================================================================

import { JUICE, BOUNCE, STEER, SOBA, DEPTH } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { yToHeight } from '../core/Kinematics.js';
import { SOBA_STATE } from '../entities/Soba.js';
import { FXK } from '../core/VisualBake.js';

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOut = t => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;

// Soba frames are 40x40 with the feet on the bottom row; the rim frames have 1 px padding.
const FEET_ORIGIN_Y = 1;
const RIM_FEET_ORIGIN_Y = 41 / 42;

export class SobaJuice {
  constructor(scene, soba, level) {
    this.scene = scene;
    this.soba = soba;
    this.landT = Infinity;
    this.springT = Infinity;
    this.lean = 0;
    this.spin = 0;
    const rimFrom = level.zones[JUICE.RIM_FROM_ZONE - 1]?.startY ?? Infinity;
    this.rimFrom = rimFrom - JUICE.RIM_FADE_PX;
    this.rimTo = rimFrom;
    const hasRim = scene.textures.exists(FXK.SOBA_RIM);
    const mk = () => (hasRim
      ? scene.add.sprite(0, 0, FXK.SOBA_RIM, 0).setOrigin(0.5, RIM_FEET_ORIGIN_Y).setDepth(DEPTH.SOBA - 0.5).setVisible(false)
      : null);
    this.rim = mk();
    this.ghostRim = mk();

    this.onBounce = (e) => {
      if (e.spring) this.springT = 0;
      else this.landT = 0;
    };
    eventBus.on(Events.SOBA_BOUNCE, this.onBounce);
  }

  /** Per frame, after soba.render(). dt = real seconds (keeps juice alive in slow-mo / hit-stop). */
  update(dt) {
    const s = this.soba;
    const spr = s.sprite;
    if (!spr) return;
    this.landT += dt * 1000;
    this.springT += dt * 1000;

    let sx = 1;
    let sy = 1;
    let angle = 0;
    let centred = false;

    if (s.state === SOBA_STATE.HURT) {
      this.spin += JUICE.TUMBLE_DEG_S * dt * (s.vx >= 0 ? 1 : -1);
      angle = this.spin;
      centred = true;
    } else if (s.state === SOBA_STATE.AIR) {
      this.spin = 0;
      // Speed stretch (rise / fall)
      let st = 0;
      if (s.vy < 0) st = clamp01(-s.vy / BOUNCE.VELOCITY) * JUICE.RISE_STRETCH;
      else st = clamp01(s.vy / JUICE.FALL_REF) * JUICE.FALL_STRETCH;
      const tx = 1 - st * JUICE.THIN;
      const ty = 1 + st;
      if (this.springT < JUICE.SPRING_MS) {
        const k = easeOut(this.springT / JUICE.SPRING_MS);
        sx = lerp(JUICE.SPRING_X, tx, k);
        sy = lerp(JUICE.SPRING_Y, ty, k);
      } else if (this.landT < JUICE.LAND_MS) {
        const k = easeOut(this.landT / JUICE.LAND_MS);
        sx = lerp(JUICE.LAND_X, tx, k);
        sy = lerp(JUICE.LAND_Y, ty, k);
      } else {
        sx = tx;
        sy = ty;
      }
      // Lean into the steering direction
      const target = (s.vx / STEER.MAX_SPEED) * JUICE.LEAN_DEG;
      this.lean += (target - this.lean) * (1 - Math.exp(-JUICE.LEAN_RATE * dt));
      angle = this.lean;
    } else {
      this.lean = 0;
      this.spin = 0;
    }

    const apply = (o, x, y) => {
      if (!o) return;
      if (centred) o.setOrigin(0.5, 0.5).setPosition(x, y - SOBA.CENTER_DY);
      else o.setOrigin(0.5, FEET_ORIGIN_Y).setPosition(x, y);
      o.setScale(sx, sy).setAngle(angle);
    };
    const feetX = Math.round(s.x);
    const feetY = Math.round(s.y);
    apply(spr, feetX, feetY);
    const g = s.ghost;
    if (g && g.visible) apply(g, Math.round(g.x), feetY);

    // Night rim
    const h = yToHeight(s.y);
    const rimA = JUICE.RIM_MAX * clamp01((h - this.rimFrom) / (this.rimTo - this.rimFrom));
    this.syncRim(this.rim, spr, rimA, centred);
    this.syncRim(this.ghostRim, g, rimA, centred);
  }

  syncRim(rim, src, alpha, centred) {
    if (!rim) return;
    const show = !!src && src.visible && alpha > 0.01;
    rim.setVisible(show);
    if (!show) return;
    rim.setFrame(src.frame.name);
    rim.setOrigin(0.5, centred ? 0.5 : RIM_FEET_ORIGIN_Y);
    rim.setPosition(src.x, src.y).setScale(src.scaleX, src.scaleY).setAngle(src.angle);
    rim.setFlipX(src.flipX).setAlpha(alpha * src.alpha);
  }

  destroy() {
    eventBus.off(Events.SOBA_BOUNCE, this.onBounce);
  }
}

