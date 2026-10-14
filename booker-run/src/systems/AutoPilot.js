import { JUMP, AUTOPLAY, OBSTACLE, BARREL } from '../core/Constants.js';
import { makeRng } from '../core/Rng.js';

// Dev-only Level 1 bot (?autoplay=1). Always does a full held jump and times it
// so the part of the arc above the obstacle's hitbox is centred on the overlap.
// For pits it jumps just before the edge. It proves the level is beatable.
// Levels 2-6 use BotPilot (a planner); Level 1 keeps this bot so its proof run
// (score 2945) stays exactly as it was.
//
// ?botjitter=ms: each press fires up to +/- ms off its ideal time (evaluated as
// if Booker were speed * offset px further back / ahead), and each hold is
// +/- ms. With jitter 0 the behaviour is unchanged.

const G = JUMP.RISE_GRAVITY;
const GF = JUMP.RISE_GRAVITY * JUMP.FALL_MULT;
const V = JUMP.VELOCITY;
const H = JUMP.HEIGHT;
const T = JUMP.TIME_TO_APEX;

/** Time window [t1, t2] (s after take-off) during which the feet are above h px. */
function aboveWindow(h) {
  const disc = V * V - 2 * G * h;
  if (disc <= 0) return null;
  const t1 = (V - Math.sqrt(disc)) / G;
  const t2 = T + Math.sqrt((2 * (H - h)) / GF);
  return [t1, t2];
}

export class AutoPilot {
  constructor(scene, input, { jitterMs = 0, seed = 1 } = {}) {
    this.scene = scene;
    this.input = input;
    this.holdMs = 0;
    this.jitterMs = jitterMs;
    this.rng = makeRng(seed);
    this.offsetMs = this.rng.symmetric(jitterMs);
    this.presses = 0;
  }

  update(dtMs, player, obstacles, gaps, speed) {
    if (this.holdMs > 0) {
      this.holdMs -= dtMs;
      if (this.holdMs <= 0) this.input.botRelease();
      return;
    }
    if (!player.onGround) return;

    const pb = player.body;
    // Jitter: evaluate as if the press were offsetMs late (positive) or early (negative)
    const shift = -speed * (this.offsetMs / 1000);
    const pLeft = pb.x + shift;
    const pRight = pb.x + pb.width + shift;

    let jump = false;

    for (const o of obstacles) {
      if (!o.active) continue;
      const ob = o.body;
      if (ob.x + ob.width < pLeft) continue;           // already passed
      const dx = ob.x - pRight;
      if (dx > speed * 1.2) break;                     // sorted by x; too far to matter yet
      const type = o.getData('type');
      const spec = OBSTACLE[type];
      const topAboveGround = spec.H - spec.HIT_Y;
      const win = aboveWindow(topAboveGround + AUTOPLAY.OBSTACLE_MARGIN_PX);
      if (!win) continue;
      const vrel = speed + (o.getData('rolling') ? BARREL.ROLL_SPEED : 0);
      const ta = dx / vrel;
      const tb = (dx + ob.width + pb.width) / vrel;
      if ((ta + tb) / 2 <= (win[0] + win[1]) / 2) jump = true;
      break;
    }

    if (!jump) {
      for (const g of gaps) {
        if (g.x + g.width < pLeft) continue;
        if (pRight >= g.x - AUTOPLAY.GAP_LEAD_PX && pLeft < g.x) jump = true;
        break;
      }
    }

    if (jump) {
      this.input.botPress();
      this.holdMs = Math.max(JUMP.MIN_HOLD_MS, AUTOPLAY.HOLD_MS + this.rng.symmetric(this.jitterMs));
      this.offsetMs = this.rng.symmetric(this.jitterMs);
      this.presses += 1;
    }
  }

  debugState() {
    return { kind: 'legacy', presses: this.presses, jitterMs: this.jitterMs };
  }
}
