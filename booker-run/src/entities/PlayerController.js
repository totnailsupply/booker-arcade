import { JUMP, DOUBLE, GLIDE, UPDRAFT, WALL, POUNCE, DASH, PLAYER } from '../core/Constants.js';

// =============================================================================
// PlayerController — Booker's movement rules as pure logic (no Phaser).
//
// The game (Player.js) and the bot's simulator (systems/BotSim.js) both run
// this exact code, so the bot predicts the game frame for frame. Each frame:
//   contact (read from the body after physics) -> update() -> commands
//   (vx, vy, gravityY, allowGravity) written back to the body.
//
// Level 1 (no abilities) runs the original rules unchanged: coyote time, jump
// buffer, variable height (cut on release after MIN_HOLD_MS), heavier fall.
// Abilities and the press priority are described in Constants.js.
// =============================================================================

export const CTRL_EV = {
  JUMP: 'jump',
  LAND: 'land',
  DOUBLE: 'double',
  GLIDE_START: 'glideStart',
  GLIDE_END: 'glideEnd',
  CLING: 'cling',
  KICK: 'kick',
  DASH: 'dash',
  DASH_END: 'dashEnd',
  POUNCE: 'pounce',
  STUCK: 'stuck',
};

const FALL_EXTRA_GRAVITY = JUMP.RISE_GRAVITY * (JUMP.FALL_MULT - 1);

export class PlayerController {
  /** @param {{double?:boolean, glide?:boolean, wallkick?:boolean, pounce?:boolean, dash?:boolean}} flags */
  constructor(flags = {}) {
    this.ab = {
      double: !!flags.double,
      glide: !!flags.glide,
      wallkick: !!flags.wallkick,
      pounce: !!flags.pounce,
      dash: !!flags.dash,
    };
    this.reset();
  }

  reset() {
    this.coyoteMs = 0;
    this.bufferMs = 0;
    this.jumping = false;       // true from a ground jump / pounce until landing (variable height)
    this.jumpHeldMs = 0;
    this.cutDone = false;
    this.wasOnGround = true;
    this.airJumps = this.maxAirJumps;
    this.dashes = this.maxDashes;
    this.dashMs = 0;
    this.gliding = false;
    this.clinging = false;
    this.kickCooldownMs = 0;
    this.stuckMs = 0;
    this.stuck = false;
    this.spinMs = 0;            // double-jump spin pose timer (animation only)
    this.poseMs = 0;            // pounce pose timer (animation only)
  }

  get maxAirJumps() {
    return this.ab.double ? DOUBLE.AIR_JUMPS : 0;
  }

  get maxDashes() {
    return this.ab.dash ? DASH.DASHES : 0;
  }

  get dashing() {
    return this.dashMs > 0;
  }

  copyFrom(o) {
    this.ab = o.ab;             // shared, read-only
    this.coyoteMs = o.coyoteMs;
    this.bufferMs = o.bufferMs;
    this.jumping = o.jumping;
    this.jumpHeldMs = o.jumpHeldMs;
    this.cutDone = o.cutDone;
    this.wasOnGround = o.wasOnGround;
    this.airJumps = o.airJumps;
    this.dashes = o.dashes;
    this.dashMs = o.dashMs;
    this.gliding = o.gliding;
    this.clinging = o.clinging;
    this.kickCooldownMs = o.kickCooldownMs;
    this.stuckMs = o.stuckMs;
    this.stuck = o.stuck;
    this.spinMs = o.spinMs;
    this.poseMs = o.poseMs;
    return this;
  }

  clone() {
    return new PlayerController(this.ab).copyFrom(this);
  }

  refreshAir() {
    this.airJumps = this.maxAirJumps;
    this.dashes = this.maxDashes;
  }

  endGlide(ev) {
    if (!this.gliding) return;
    this.gliding = false;
    if (ev) ev.push(CTRL_EV.GLIDE_END);
  }

  /**
   * @param {number} dt      frame delta in ms
   * @param {number} speed   run speed in px/s
   * @param {{pressed:boolean, held:boolean}} input
   * @param {{vy:number, onGround:boolean, wallFace:boolean, updraft:number, top:number,
   *          landingInMs?:Function}} c
   *        contact after physics: vertical velocity, ground contact, touching a
   *        wall face on the right, updraft strength at Booker (0 = none), body top y,
   *        and landingInMs(vx, maxMs, glide) for the landing buffer
   * @param {{vx:number, vy:number, gravityY:number, allowGravity:boolean}} out  commands (written)
   * @param {string[]|null} ev  controller events are pushed here (CTRL_EV)
   */
  update(dt, speed, input, c, out, ev) {
    const ab = this.ab;
    const onGround = c.onGround;
    let vy = c.vy;
    let vx = speed;

    // Landing / coyote time
    if (onGround) {
      this.coyoteMs = JUMP.COYOTE_MS;
      if (!this.wasOnGround && vy >= 0) {
        this.jumping = false;
        if (ev) ev.push(CTRL_EV.LAND);
      }
      this.refreshAir();
      this.endGlide(ev);
    } else {
      this.coyoteMs = Math.max(0, this.coyoteMs - dt);
    }

    // Dash timer (ends early against a wall face)
    if (this.dashMs > 0) {
      this.dashMs -= dt;
      if (this.dashMs <= 0 || c.wallFace || onGround) {
        this.dashMs = 0;
        if (ev) ev.push(CTRL_EV.DASH_END);
      }
    }

    // Wall cling: in the air against a wall face
    const wasClinging = this.clinging;
    this.clinging = ab.wallkick && !onGround && c.wallFace && this.dashMs <= 0;
    if (this.clinging && !wasClinging) {
      this.endGlide(ev);
      if (ev) ev.push(CTRL_EV.CLING);
    }
    this.kickCooldownMs = Math.max(0, this.kickCooldownMs - dt);

    // Blocked by a wall face on the ground: a hit (at once without wallkick)
    if (onGround && c.wallFace) {
      this.stuckMs += dt;
      if (!this.stuck && (!ab.wallkick || this.stuckMs >= WALL.STUCK_MS)) {
        this.stuck = true;
        if (ev) ev.push(CTRL_EV.STUCK);
      }
    } else {
      this.stuckMs = 0;
    }

    // Jump buffer: remember a press for BUFFER_MS
    if (input.pressed) this.bufferMs = JUMP.BUFFER_MS;
    else this.bufferMs = Math.max(0, this.bufferMs - dt);

    // One button, by priority
    if (this.bufferMs > 0 && this.dashMs <= 0) {
      if (this.coyoteMs > 0) {
        vy = -JUMP.VELOCITY;
        this.bufferMs = 0;
        this.coyoteMs = 0;
        this.jumping = true;
        this.jumpHeldMs = 0;
        this.cutDone = false;
        if (ev) ev.push(CTRL_EV.JUMP);
      } else if (this.clinging) {
        if (this.kickCooldownMs <= 0) {
          vy = -WALL.KICK_VELOCITY;
          this.bufferMs = 0;
          this.kickCooldownMs = WALL.KICK_COOLDOWN_MS;
          this.refreshAir();
          this.jumping = false;
          this.cutDone = true;
          if (ev) ev.push(CTRL_EV.KICK);
        }
      } else if (this.landingSoon(c, speed)) {
        // Falling onto ground, a platform or a wall top before the buffer runs out:
        // keep the press for a full jump on landing (not a low double jump or a dash)
      } else if (this.airJumps > 0) {
        vy = -DOUBLE.VELOCITY;
        this.airJumps -= 1;
        this.bufferMs = 0;
        this.jumping = false;
        this.cutDone = true;
        this.spinMs = DOUBLE.SPIN_MS;
        this.endGlide(ev);
        if (ev) ev.push(CTRL_EV.DOUBLE);
      } else if (this.dashes > 0) {
        this.dashMs = DASH.DURATION_MS;
        this.dashes -= 1;
        this.bufferMs = 0;
        this.jumping = false;
        this.cutDone = true;
        this.endGlide(ev);
        if (ev) ev.push(CTRL_EV.DASH);
      }
    }

    // Variable height: releasing while rising cuts the arc (after a minimum hold)
    if (this.jumping && !this.cutDone) {
      this.jumpHeldMs += dt;
      if (!input.held && this.jumpHeldMs >= JUMP.MIN_HOLD_MS && vy < 0) {
        vy *= JUMP.JUMP_CUT;
        this.cutDone = true;
      }
      if (vy >= 0) this.cutDone = true;
    }

    // Ear glide: hold while falling; continues while held (updrafts may lift)
    const glide = ab.glide && !onGround && !this.clinging && this.dashMs <= 0 && input.held
      && (this.gliding || vy > GLIDE.START_VY);
    if (glide !== this.gliding) {
      this.gliding = glide;
      if (ev) ev.push(glide ? CTRL_EV.GLIDE_START : CTRL_EV.GLIDE_END);
    }

    // Vertical motion for the next physics step
    let gravityY = 0;
    let allowGravity = true;
    const dts = dt / 1000;
    if (this.dashMs > 0) {
      vx = speed * DASH.SPEED_MULT;
      vy = 0;
      allowGravity = false;
    } else if (this.gliding) {
      allowGravity = false;
      if (c.updraft > 0) vy = Math.max(-c.updraft, vy - UPDRAFT.ACCEL * dts);
      else if (vy > GLIDE.MAX_FALL) vy = Math.max(GLIDE.MAX_FALL, vy - GLIDE.BRAKE * dts);
      else vy = Math.min(GLIDE.MAX_FALL, vy + GLIDE.GRAVITY * dts);
    } else if (this.clinging && vy >= 0) {
      allowGravity = false;
      vy = WALL.SLIDE_SPEED;
    } else {
      // Heavier gravity on the way down (world gravity is the rise gravity)
      gravityY = vy > 0 ? FALL_EXTRA_GRAVITY : 0;
    }

    // Soft ceiling just under the HUD
    if (vy < 0 && c.top <= PLAYER.CEILING_Y) vy = 0;

    this.spinMs = Math.max(0, this.spinMs - dt);
    this.poseMs = Math.max(0, this.poseMs - dt);
    this.wasOnGround = onGround;

    out.vx = vx;
    out.vy = vy;
    out.gravityY = gravityY;
    out.allowGravity = allowGravity;
  }

  /**
   * JUMP.LAND_BUFFER: an air move is available, Booker is falling, and he lands
   * while the buffered press is still alive (the landing frame's buffer > 0).
   * c.landingInMs(vx, maxMs, glide) comes from the game (Player) or BotSim; both
   * call LevelModel.landingInMs, so the bot predicts this exactly.
   */
  landingSoon(c, speed) {
    if (!JUMP.LAND_BUFFER || !c.landingInMs || !(c.vy > 0)) return false;
    if (this.airJumps <= 0 && this.dashes <= 0) return false;
    const horizon = this.bufferMs - 0.5;   // margin for float noise in the buffer countdown
    return c.landingInMs(speed, horizon, this.gliding) < horizon;
  }

  /**
   * A stomp landed (called from the physics step). Returns the bounce vy; the
   * jump's variable-height rule applies to it (hold for the full bounce).
   */
  pounce(ev) {
    this.jumping = true;
    this.jumpHeldMs = 0;
    this.cutDone = false;
    this.dashMs = 0;
    this.refreshAir();
    this.endGlide(ev);
    this.poseMs = POUNCE.POSE_MS;
    if (ev) ev.push(CTRL_EV.POUNCE);
    return -POUNCE.VELOCITY;
  }

  /** For render_game_to_text() */
  debugState() {
    return {
      airJumpsLeft: this.airJumps,
      dashesLeft: this.dashes,
      gliding: this.gliding,
      clinging: this.clinging,
      dashing: this.dashMs > 0,
      jumping: this.jumping,
    };
  }
}
