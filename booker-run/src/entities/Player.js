import { PLAYER, WORLD, DEATH, DEPTH, JUMP } from '../core/Constants.js';
import { ANIMS } from '../core/Assets.js';
import { eventBus, Events } from '../core/EventBus.js';
import { PlayerController, CTRL_EV } from './PlayerController.js';

// Booker. Runs right at the speed the scene gives him; one button.
// Movement rules live in PlayerController (shared with the bot's simulator);
// this class owns the Arcade sprite/body, animations and EventBus events.

const EVENT_MAP = {
  [CTRL_EV.JUMP]: Events.PLAYER_JUMP,
  [CTRL_EV.LAND]: Events.PLAYER_LAND,
  [CTRL_EV.DOUBLE]: Events.PLAYER_DOUBLE_JUMP,
  [CTRL_EV.GLIDE_START]: Events.PLAYER_GLIDE_START,
  [CTRL_EV.GLIDE_END]: Events.PLAYER_GLIDE_END,
  [CTRL_EV.CLING]: Events.PLAYER_WALL_CLING,
  [CTRL_EV.KICK]: Events.PLAYER_WALL_KICK,
  [CTRL_EV.DASH]: Events.PLAYER_DASH,
  [CTRL_EV.DASH_END]: Events.PLAYER_DASH_END,
  [CTRL_EV.POUNCE]: Events.PLAYER_POUNCE,
};

export class Player {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x       start x (sprite centre)
   * @param {object} flags   ability flags { double, glide, wallkick, pounce, dash }
   * @param {object} env     { wallFaceAt(bx,by,bw,bh), updraftAt(bx,by,bw,bh),
   *                          landingInMs(bx,by,bw,bh,vy,vx,maxMs,glide) }
   */
  constructor(scene, x, flags = {}, env = null) {
    this.scene = scene;
    this.env = env;
    // Sprite y so the body's bottom sits exactly on the ground
    const y = WORLD.GROUND_Y - (PLAYER.BODY_OFFSET_Y + PLAYER.BODY_H - PLAYER.FRAME_H / 2);
    this.sprite = scene.physics.add.sprite(x, y, 'booker', 0);
    this.sprite.setDepth(DEPTH.PLAYER);

    const body = this.sprite.body;
    body.setSize(PLAYER.BODY_W, PLAYER.BODY_H, false);
    body.setOffset(PLAYER.BODY_OFFSET_X, PLAYER.BODY_OFFSET_Y);
    body.setMaxVelocity(100000, JUMP.MAX_FALL_SPEED);

    this.ctrl = new PlayerController(flags);
    this.legacyGround = !Object.values(flags).some(Boolean);
    this.contact = { vy: 0, onGround: true, wallFace: false, updraft: 0, top: 0, landingInMs: null };
    if (env?.landingInMs) {
      // For the controller's landing buffer: where the body is now, after physics
      this.contact.landingInMs = (vx, maxMs, glide) => {
        const b = this.body;
        return env.landingInMs(b.x, b.y, b.width, b.height, b.velocity.y, vx, maxMs, glide);
      };
    }
    this.cmd = { vx: 0, vy: 0, gravityY: 0, allowGravity: true };
    this.events = [];
    this.dead = false;
    this.onStuck = null;     // set by the scene: called when a wall blocks Booker on the ground

    this.sprite.play(ANIMS.RUN);
  }

  get body() {
    return this.sprite.body;
  }

  /**
   * Standing on something solid. Level 1 also counts Arcade's touching.down,
   * which overlap-only checks set too (falling through a bone): kept so Level 1
   * plays exactly as before. Ability levels use blocked.down only, so a
   * mid-air pickup never refreshes the double jump.
   */
  get onGround() {
    return this.body.blocked.down || (this.legacyGround && this.body.touching.down);
  }

  /** Clinging to a wall face (for the display sprite offset). */
  get clinging() {
    return this.ctrl.clinging;
  }

  /**
   * @param {number} dtMs  frame delta in ms
   * @param {number} speed horizontal speed in px/s
   * @param {{pressed:boolean, held:boolean}} input
   */
  update(dtMs, speed, input) {
    if (this.dead) return;
    const body = this.body;
    const c = this.contact;
    c.vy = body.velocity.y;
    c.onGround = this.onGround;
    c.top = body.y;
    if (this.env) {
      c.wallFace = this.env.wallFaceAt(body.x, body.y, body.width, body.height);
      c.updraft = this.env.updraftAt(body.x, body.y, body.width, body.height);
    }

    const ev = this.events;
    ev.length = 0;
    this.ctrl.update(dtMs, speed, input, c, this.cmd, ev);

    const cmd = this.cmd;
    body.setVelocityX(cmd.vx);
    if (cmd.vy !== c.vy) body.setVelocityY(cmd.vy);
    if (body.allowGravity !== cmd.allowGravity) body.setAllowGravity(cmd.allowGravity);
    body.setGravityY(cmd.gravityY);

    this.emit(ev);
    if (this.dead) return;   // stuck against a wall: die() already set the hurt frame
    this.updateAnimation(c.onGround);
  }

  emit(ev) {
    for (const e of ev) {
      if (e === CTRL_EV.STUCK) {
        // A wall hit ends the run: events after it in this frame (a jump pressed
        // in the same frame) must not play on the dead dog
        if (this.onStuck) this.onStuck();
        if (this.dead) return;
        continue;
      }
      const name = EVENT_MAP[e];
      if (name) eventBus.emit(name, { x: this.sprite.x, y: this.sprite.y });
    }
  }

  /** A stomp (from the scene's enemy overlap). Bounces Booker. */
  pounce(enemyType) {
    const ev = [];
    const vy = this.ctrl.pounce(ev);
    this.body.setVelocityY(vy);
    this.body.setAllowGravity(true);
    for (const e of ev) {
      const name = EVENT_MAP[e];
      if (name) eventBus.emit(name, { x: this.sprite.x, y: this.sprite.y, enemy: enemyType });
    }
  }

  updateAnimation(onGround) {
    const ctrl = this.ctrl;
    const vy = this.body.velocity.y;
    let key;
    if (onGround && !ctrl.jumping) key = ANIMS.RUN;
    else if (ctrl.dashing) key = ANIMS.DASH;
    else if (ctrl.clinging) key = ANIMS.CLING;
    else if (ctrl.poseMs > 0) key = ANIMS.POUNCE;
    else if (ctrl.spinMs > 0) key = ANIMS.DOUBLE;
    else if (ctrl.gliding) key = ANIMS.GLIDE;
    else key = vy < 0 ? ANIMS.JUMP : ANIMS.FALL;
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key);
  }

  /** Death beat: hurt frame, tumble up and back, then drop off screen. */
  die() {
    if (this.dead) return;
    this.dead = true;
    const s = this.sprite;
    this.body.setVelocity(0, 0);
    this.body.setGravityY(0);
    this.body.enable = false;
    s.play(ANIMS.HURT);
    this.scene.tweens.add({
      targets: s,
      y: s.y - DEATH.TUMBLE_RISE,
      x: s.x - DEATH.TUMBLE_DRIFT,
      angle: DEATH.TUMBLE_ANGLE,
      duration: DEATH.TUMBLE_UP_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: s,
          y: s.y + this.scene.scale.height,
          angle: DEATH.TUMBLE_ANGLE * 2,
          duration: DEATH.DURATION_MS - DEATH.TUMBLE_UP_MS,
          ease: 'Quad.easeIn',
        });
      },
    });
  }

  win() {
    this.body.setVelocity(0, this.body.velocity.y);
    this.body.setGravityY(0);
    this.body.setAllowGravity(true);
    this.dead = true; // stop driving
    this.sprite.play(ANIMS.WIN);
  }

  destroy() {
    this.sprite.destroy();
  }
}
