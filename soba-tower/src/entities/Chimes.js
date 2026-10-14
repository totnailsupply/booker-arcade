// =============================================================================
// Chimes — wind chimes hung between platforms (zone 4). A static hazard: the
// art sways gently, but the hurtbox stays put, inside the tubes at every sway
// angle, so what you see is what hurts. Contact hurts.
// Level def: { type: 'chimes', x (centre), y (height of the hook, top of the art) }.
// Logic has no Phaser import (node scripts run it); the view is optional.
// =============================================================================

import { CHIMES, DEPTH } from '../core/Constants.js';
import { heightToY } from '../core/Kinematics.js';
import { bodyOverlaps } from '../core/Hitboxes.js';
import { RIM } from '../core/Assets.js';

export class Chimes {
  constructor(def) {
    this.type = 'chimes';
    this.def = def;
    this.x = def.x;
    this.topY = heightToY(def.y);
    this.y = this.topY + CHIMES.HURT_TOP + CHIMES.HURT_H / 2;   // hurtbox centre
    this.state = 'idle';
    this.time = 0;
    this.angle = 0;
    this.swayPhase = (def.x * 0.37) % (Math.PI * 2);
    this.view = null;
  }

  get live() {
    return true;
  }

  update(dt, T) {
    this.time = T;
    this.angle = CHIMES.SWAY_DEG * Math.sin((2 * Math.PI * T) / CHIMES.SWAY_S + this.swayPhase);
  }

  contact(s) {
    return bodyOverlaps(s.x, s.y, this.x, this.y, CHIMES.HURT_W, CHIMES.HURT_H) ? 'hit' : null;
  }

  contactIn(_tau, s, _prevFeetY, margin = 0) {
    return bodyOverlaps(s.x, s.y, this.x, this.y, CHIMES.HURT_W, CHIMES.HURT_H, margin) ? 'hit' : null;
  }

  reset() {}

  createView(scene) {
    // Rimmed art (1 px padding): the hook's top row sits at topY
    const h = CHIMES.H + RIM.PAD * 2;
    this.view = scene.add.image(this.x, this.topY, RIM.KEYS.chimes, 0).setOrigin(0.5, RIM.PAD / h)
      .setDepth(DEPTH.HAZARD).setVisible(false);
  }

  syncView(visible) {
    const v = this.view;
    if (!v) return;
    v.setVisible(visible);
    if (visible) v.setPosition(Math.round(this.x), Math.round(this.topY)).setAngle(this.angle);
  }

  snapshot() {
    return { type: this.type, x: Math.round(this.x), y: Math.round(this.y), state: this.state };
  }
}
