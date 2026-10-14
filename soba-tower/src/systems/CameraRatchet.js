// =============================================================================
// CameraRatchet — the camera only ever moves UP during play.
//
//   target = min(target, sobaCentreY - ANCHOR * H)   (y down: min = higher)
//   view  += (target - view) * (1 - exp(-FOLLOW_RATE * dt))   (frame-rate independent)
//
// Soba is kept about 42% from the top of the screen while climbing. Falling
// never pulls the view down, so falling below the bottom edge is the fail
// line. Clamps: the view never shows more than STREET_MARGIN px below the
// street, and never rises more than ROOF_SKY px above the roof.
//
// Respawn: panTo(top, ms) eases the view (down) to the cushion over 0.6 s and
// then resets the ratchet target there.
// =============================================================================

import { GAME, CAMERA, WORLD } from '../core/Constants.js';
import { heightToY } from '../core/Kinematics.js';

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export class CameraRatchet {
  constructor(scene, level) {
    // Headless (node scripts): a stand-in camera with just scrollY.
    this.cam = scene ? scene.cameras.main : { scrollY: 0 };
    this.maxTop = WORLD.STREET_Y + CAMERA.STREET_MARGIN - GAME.HEIGHT;   // lowest view (start)
    this.minTop = heightToY(level.finish.y) - CAMERA.ROOF_SKY;           // highest view
    this.top = this.maxTop;
    this.target = this.maxTop;
    this.pan = null;
    this.apply();
  }

  clamp(top) {
    return Math.min(this.maxTop, Math.max(this.minTop, top));
  }

  /** View top that puts a feet position at the anchor line (used for starts). */
  topFor(feetY, frac = CAMERA.ANCHOR) {
    return this.clamp(feetY - frac * GAME.HEIGHT);
  }

  /** Jump straight to a view top (scene start / debug start). */
  snapTo(top) {
    this.top = this.target = this.clamp(top);
    this.pan = null;
    this.apply();
  }

  /** Smoothly move the view to `top` over `ms`, then resume ratcheting from there. */
  panTo(top, ms, onDone) {
    this.pan = { from: this.top, to: this.clamp(top), t: 0, ms, onDone };
  }

  get panning() {
    return !!this.pan;
  }

  /** Bottom edge of the view in world y (the fail line). */
  get bottom() {
    return this.cam.scrollY + GAME.HEIGHT;
  }

  /**
   * @param {number} dt seconds
   * @param {number|null} centerY Soba's body centre (null = don't follow)
   */
  update(dt, centerY) {
    if (this.pan) {
      const p = this.pan;
      p.t += dt * 1000;
      const k = Math.min(1, p.t / p.ms);
      this.top = p.from + (p.to - p.from) * easeInOutSine(k);
      if (k >= 1) {
        this.pan = null;
        this.target = this.top;
        if (p.onDone) p.onDone();
      }
    } else if (centerY !== null) {
      this.target = this.clamp(Math.min(this.target, centerY - CAMERA.ANCHOR * GAME.HEIGHT));
      this.top += (this.target - this.top) * (1 - Math.exp(-CAMERA.FOLLOW_RATE * dt));
    }
    this.apply();
  }

  apply() {
    this.cam.scrollY = Math.round(this.top);
  }
}
