// =============================================================================
// Soba — the player. Movement is kinematic (core/Kinematics.js), not Arcade
// Physics: one-way landings, wrap and moving platforms are simpler and exact
// when the scene runs the landing test itself (see ClimbScene.update).
//
// The sprite's origin is the middle of the feet (0.5, 1): soba.y = feet y.
// The art frames have different heights on a shared baseline (feet on the
// bottom row of every 40x40 frame), so the feet stay anchored across poses.
// Because no physics body hangs off the sprite, it can be squashed and
// stretched freely (Effects.js). scene = null runs headless (node scripts).
// =============================================================================

import { SOBA, BOUNCE, DEPTH, WORLD } from '../core/Constants.js';
import { ANIMS } from '../core/Assets.js';
import { stepHorizontal, stepVertical } from '../core/Kinematics.js';

export const SOBA_STATE = {
  AIR: 'air',             // bouncing / falling (normal play)
  HIDDEN: 'hidden',       // fell out, waiting to respawn
  HURT: 'hurt',           // hit by a hazard: tumbles off-screen, waiting to respawn
  CELEBRATE: 'celebrate', // standing on the roof
};

export class Soba {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.state = SOBA_STATE.AIR;
    this.crouchMs = 0;
    this.lastBounceType = null;
    this.blinkHidden = false;

    this.sprite = scene ? scene.add.sprite(x, y, 'soba', 0).setOrigin(0.5, 1).setDepth(DEPTH.SOBA) : null;
    this.ghost = scene ? scene.add.sprite(x, y, 'soba', 0).setOrigin(0.5, 1).setDepth(DEPTH.SOBA).setVisible(false) : null;
    this.anim = null;
  }

  get centerY() {
    return this.y - SOBA.CENTER_DY;
  }

  /** Top of the visible art (the fail test uses this). */
  get top() {
    return this.y - SOBA.ART_H;
  }

  /** Advance one frame. dir: -1 left, 0 none, 1 right. */
  step(dt, dir) {
    if (this.state !== SOBA_STATE.AIR) return;
    if (dir !== 0) this.facing = dir;
    this.prevY = this.y;
    stepHorizontal(this, dir, dt);
    stepVertical(this, dt);
    if (this.crouchMs > 0) this.crouchMs -= dt * 1000;
  }

  /** Landed on platform p: snap the feet to its top and bounce. */
  bounceOff(p, velocityMult = 1) {
    this.y = p.y;
    this.prevY = p.y;
    this.vy = -BOUNCE.VELOCITY * velocityMult;
    this.crouchMs = SOBA.CROUCH_MS;
    this.lastBounceType = p.type;
  }

  /** Bounced off something that isn't a platform top (a crow's head). */
  bounceAt(y, velocityMult = 1) {
    this.y = y;
    this.prevY = y;
    this.vy = -BOUNCE.VELOCITY * velocityMult;
    this.crouchMs = SOBA.CROUCH_MS;
  }

  /** Hit by a hazard: a small pop, then a tumble off the screen (no landings). */
  knockOut() {
    this.state = SOBA_STATE.HURT;
    this.vy = SOBA.HURT_VY;
    this.vx = -this.facing * SOBA.HURT_VX;
    this.crouchMs = 0;
  }

  /** The tumble after a hit (no steering, no landing). */
  stepTumble(dt) {
    if (this.state !== SOBA_STATE.HURT) return;
    this.prevY = this.y;
    this.x += this.vx * dt;
    stepVertical(this, dt);
  }

  /** Landed on the finish: stop and celebrate. */
  standOn(p) {
    this.y = p.y;
    this.prevY = p.y;
    this.vx = 0;
    this.vy = 0;
    this.state = SOBA_STATE.CELEBRATE;
  }

  /** Teleport (respawn / debug start), at rest. */
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.crouchMs = 0;
    this.state = SOBA_STATE.AIR;
  }

  hide() {
    this.state = SOBA_STATE.HIDDEN;
    this.vx = 0;
    this.vy = 0;
  }

  pickAnim() {
    if (this.state === SOBA_STATE.CELEBRATE) return ANIMS.CELEBRATE;
    if (this.state === SOBA_STATE.HURT) return ANIMS.HURT;
    if (this.crouchMs > 0) return ANIMS.CROUCH;
    if (this.vy < -SOBA.APEX_VY) {
      return Math.abs(this.vx) > SOBA.STEER_FRAME_VX ? ANIMS.STEER : ANIMS.RISE;
    }
    if (this.vy <= SOBA.APEX_VY) return ANIMS.APEX;
    return ANIMS.FALL;
  }

  /** Sync sprites with the simulation (after the scene's update). */
  render() {
    const s = this.sprite;
    if (!s) return;
    const visible = this.state !== SOBA_STATE.HIDDEN && !this.blinkHidden;
    s.setVisible(visible);
    const key = this.pickAnim();
    if (key !== this.anim) {
      this.anim = key;
      s.play(key);
    }
    s.setPosition(Math.round(this.x), Math.round(this.y));
    s.setFlipX(this.facing < 0);

    // Wrap ghost: while Soba straddles an edge, draw her on the other side too
    const g = this.ghost;
    const m = SOBA.GHOST_MARGIN;
    let gx = null;
    if (this.x < m) gx = this.x + WORLD.WRAP_W;
    else if (this.x > WORLD.WRAP_W - m) gx = this.x - WORLD.WRAP_W;
    g.setVisible(visible && gx !== null);
    if (gx !== null) {
      g.setFrame(s.frame.name);
      g.setPosition(Math.round(gx), s.y);
      g.setFlipX(s.flipX);
      g.setScale(s.scaleX, s.scaleY);
      g.setAlpha(s.alpha);
    }
  }

  /** For render_game_to_text(). */
  snapshot() {
    return {
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
      facing: this.facing,
      state: this.state,
      phase: this.state !== SOBA_STATE.AIR ? this.state
        : this.crouchMs > 0 ? 'bounce' : this.vy < 0 ? 'rising' : 'falling',
      anim: this.anim,
      ghost: !!this.ghost?.visible,
    };
  }

  destroy() {
    this.sprite?.destroy();
    this.ghost?.destroy();
  }
}
