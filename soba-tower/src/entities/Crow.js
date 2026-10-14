// =============================================================================
// Crow — flies a horizontal patrol line (back and forth, constant speed, as a
// pure function of the world clock), 2-frame flap, faces its travel direction.
//   Land on its head while falling = stomp: Soba bounces, +50, the crow tumbles
//   off-screen (gone for this attempt). Any other contact hurts Soba.
// Level def: { type: 'crow', x (patrol centre), y (height of the body centre),
//              range (half-width of the patrol), speed (px/s), phase (0..1) }.
// Logic has no Phaser import (node scripts run it); the view is optional.
// =============================================================================

import { CROW, DEPTH } from '../core/Constants.js';
import { RIM, ANIMS } from '../core/Assets.js';
import { heightToY, pingPongPos, pingPongDir } from '../core/Kinematics.js';
import { crowContact } from '../core/Hitboxes.js';

const tmp = { x: 0, y: 0, dir: 1 };

export class Crow {
  constructor(def) {
    this.type = 'crow';
    this.def = def;
    this.cx = def.x;
    this.range = def.range || 0;
    this.speed = def.speed || 0;
    this.phase = def.phase || 0;
    this.baseY = heightToY(def.y);
    this.state = 'fly';
    this.time = 0;
    this.x = def.x;
    this.y = this.baseY;
    this.dir = 1;
    this.fallVy = 0;
    this.fallMs = 0;
    this.angle = 0;
    this.view = null;
    this.poseAt(0, this);
  }

  /** Patrol pose at world time T (written into `out`). */
  poseAt(T, out = {}) {
    const len = 2 * this.range;
    out.x = this.cx - this.range + pingPongPos(T, len, this.speed, this.phase);
    out.y = this.baseY;
    out.dir = pingPongDir(T, len, this.speed, this.phase);
    return out;
  }

  get live() {
    return this.state === 'fly';
  }

  update(dt, T) {
    this.time = T;
    if (this.state === 'fly') {
      this.poseAt(T, this);
    } else if (this.state === 'stomped') {
      this.fallVy += CROW.FALL_GRAVITY * dt;
      this.y += this.fallVy * dt;
      this.angle += CROW.FALL_SPIN_DEG * dt * this.dir;
      this.fallMs += dt * 1000;
      if (this.fallMs >= CROW.GONE_MS) this.state = 'gone';
    }
  }

  /** Contact with Soba now: 'stomp' | 'hit' | null. */
  contact(s, prevFeetY) {
    if (this.state !== 'fly') return null;
    return crowContact(s, prevFeetY, this.x, this.y);
  }

  /** Contact tau seconds from now (bot / validator planning). */
  contactIn(tau, s, prevFeetY, margin = 0) {
    if (this.state !== 'fly') return null;
    const p = this.poseAt(this.time + tau, tmp);
    return crowContact(s, prevFeetY, p.x, p.y, margin);
  }

  stomp() {
    this.state = 'stomped';
    this.fallVy = -120;
    this.fallMs = 0;
  }

  /** Respawn: stomped crows stay gone (the +50 was earned). */
  reset() {}

  /** Patrol extent, for the validator / debug. */
  get extent() {
    return { x0: this.cx - this.range, x1: this.cx + this.range, y: this.baseY };
  }

  // --- view ---------------------------------------------------------------------

  createView(scene) {
    // Rimmed art (Assets.buildRims): a 1 px light outline so it reads on dark walls
    this.view = scene.add.sprite(this.x, this.y, RIM.KEYS.crow, 0).setDepth(DEPTH.HAZARD).setVisible(false);
    if (scene.anims.exists(ANIMS.CROW_FLY)) this.view.play(ANIMS.CROW_FLY);
  }

  syncView(visible) {
    const v = this.view;
    if (!v) return;
    const show = visible && this.state !== 'gone';
    v.setVisible(show);
    if (!show) return;
    v.setPosition(Math.round(this.x), Math.round(this.y));
    v.setFlipX(this.dir < 0);       // art faces right
    v.setAngle(this.state === 'stomped' ? this.angle : 0);
    if (this.state === 'stomped' && v.anims?.isPlaying) v.anims.pause();
  }

  snapshot() {
    return { type: this.type, x: Math.round(this.x), y: Math.round(this.y), state: this.state, dir: this.dir };
  }
}
