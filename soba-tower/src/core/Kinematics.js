// =============================================================================
// Kinematics.js — Soba's movement math as pure functions (no Phaser).
//
// Used by entities/Soba.js (the real step), systems/AutoClimber.js (planning)
// and node scripts (level validator / sims), so all three agree exactly.
//
// Conventions: world px, y DOWN, feet y is the reference point. Horizontal
// positions wrap with period WORLD.WRAP_W; platform x is the platform centre.
// =============================================================================

import { BOUNCE, STEER, SOBA, WORLD, PLATFORM } from './Constants.js';

const W = WORLD.WRAP_W;

/** Wraps x into [0, W). */
export function wrapX(x) {
  return ((x % W) + W) % W;
}

/** Shortest signed horizontal distance from a to b on the wrapping strip. */
export function wrapDelta(a, b) {
  let d = wrapX(b) - wrapX(a);
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

/**
 * Horizontal step. Instant reversal: when the input direction is opposite to
 * the current velocity, velocity is zeroed before accelerating.
 * Mutates and returns state {x, vx}.
 */
export function stepHorizontal(state, dir, dt) {
  let vx = state.vx;
  if (dir !== 0) {
    if (vx !== 0 && Math.sign(vx) !== dir) vx = 0;
    vx += dir * STEER.ACCEL * dt;
    if (Math.abs(vx) > STEER.MAX_SPEED) vx = dir * STEER.MAX_SPEED;
  } else if (vx !== 0) {
    const dec = STEER.DECEL * dt;
    vx = Math.abs(vx) <= dec ? 0 : vx - Math.sign(vx) * dec;
  }
  state.vx = vx;
  state.x = wrapX(state.x + vx * dt);
  return state;
}

/**
 * Vertical step with exact constant-gravity integration per frame.
 * Rising uses GRAVITY, falling uses FALL_GRAVITY (split at the apex).
 * Mutates and returns state {y, vy}.
 */
export function stepVertical(state, dt) {
  let { y, vy } = state;
  let t = dt;
  if (vy < 0) {
    const g = BOUNCE.GRAVITY;
    const tApex = -vy / g;
    if (tApex >= t) {
      y += vy * t + 0.5 * g * t * t;
      vy += g * t;
      t = 0;
    } else {
      y += vy * tApex + 0.5 * g * tApex * tApex;
      vy = 0;
      t -= tApex;
    }
  }
  if (t > 0) {
    const g = BOUNCE.FALL_GRAVITY;
    y += vy * t + 0.5 * g * t * t;
    vy = Math.min(BOUNCE.MAX_FALL_SPEED, vy + g * t);
  }
  state.y = y;
  state.vy = vy;
  return state;
}

/** Half-width of the landing box: half the paws plus the forgiveness margin. */
export const FOOT_HALF = SOBA.FOOT_W / 2 + SOBA.FOOT_FORGIVE;

/** True when Soba's landing box (centre x) overlaps a platform (with wrap). */
export function overlapsPlatform(x, platform) {
  return Math.abs(wrapDelta(x, platform.x)) <= platform.w / 2 + FOOT_HALF;
}

/**
 * Swept one-way landing test. Returns the platform Soba lands on this frame,
 * or null. A platform qualifies when:
 *   - Soba is falling (vy > 0),
 *   - her feet were at or above the platform top last frame (prevTop for
 *     platforms that move vertically) and are at or below it now,
 *   - her landing box overlaps it horizontally (wrap-aware, so the ghost on
 *     the far edge counts).
 * When several qualify the highest top wins (it was crossed first).
 */
export function findLanding(prevFeetY, feetY, vy, x, platforms) {
  if (vy <= 0) return null;
  let best = null;
  for (const p of platforms) {
    if (!p.solid) continue;
    const prevTop = p.prevY ?? p.y;
    if (prevFeetY > prevTop + PLATFORM.LAND_EPS) continue;
    if (feetY < p.y) continue;
    if (!overlapsPlatform(x, p)) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

/**
 * Time until the feet descend through targetY (y down), given feet y and vy
 * now. Returns null when the target is above the apex or already passed.
 */
export function timeToDescendTo(feetY, vy, targetY) {
  let t = 0;
  let apexY = feetY;
  if (vy < 0) {
    t = -vy / BOUNCE.GRAVITY;
    apexY = feetY - (vy * vy) / (2 * BOUNCE.GRAVITY);
    if (targetY < apexY) return null;
    return t + Math.sqrt((2 * (targetY - apexY)) / BOUNCE.FALL_GRAVITY);
  }
  const d = targetY - feetY;
  if (d < 0) return null;
  const g = BOUNCE.FALL_GRAVITY;
  return (-vy + Math.sqrt(vy * vy + 2 * g * d)) / g;
}

/**
 * Max horizontal distance coverable in time t, starting at signed speed v0
 * relative to the direction of travel (negative = moving the wrong way,
 * which the instant reversal zeroes).
 */
export function lateralReach(t, v0 = 0) {
  if (t <= 0) return 0;
  const v = Math.max(0, v0);
  const tAcc = Math.max(0, (STEER.MAX_SPEED - v) / STEER.ACCEL);
  if (t <= tAcc) return v * t + 0.5 * STEER.ACCEL * t * t;
  return v * tAcc + 0.5 * STEER.ACCEL * tAcc * tAcc + STEER.MAX_SPEED * (t - tAcc);
}

/** Converts a level height (px above the street) to world y, and back. */
export function heightToY(h) {
  return WORLD.STREET_Y - h;
}

export function yToHeight(y) {
  return WORLD.STREET_Y - y;
}

/**
 * Time until the feet descend through a MOVING top, yAt(tau) = its world y tau
 * seconds from now (lifts). Fixed-point iteration on timeToDescendTo; converges
 * fast because lifts move far slower than Soba falls. Null when unreachable.
 */
export function timeToDescendToMoving(feetY, vy, yAt, iterations = 4) {
  let t = timeToDescendTo(feetY, vy, yAt(0));
  for (let i = 0; i < iterations && t !== null; i++) {
    t = timeToDescendTo(feetY, vy, yAt(t));
  }
  return t;
}

/** Apex height (px above the take-off surface) of a bounce with velocity multiplier m. */
export function apexHeight(mult = 1) {
  return BOUNCE.HEIGHT * mult * mult;
}

/**
 * Ping-pong (back and forth at constant speed) over [0, length]. phase in 0..1
 * shifts the start (0 = at 0 moving up, 0.5 = at `length` moving back).
 * Pure function of time, so every system agrees on moving things.
 */
export function pingPongPos(time, length, speed, phase = 0) {
  if (length <= 0 || speed <= 0) return 0;
  const period = (2 * length) / speed;
  let u = (time / period + phase) % 1;
  if (u < 0) u += 1;
  return u < 0.5 ? 2 * u * length : (2 - 2 * u) * length;
}

/** Direction of travel (+1 / -1) of pingPongPos at that time. */
export function pingPongDir(time, length, speed, phase = 0) {
  if (length <= 0 || speed <= 0) return 1;
  const period = (2 * length) / speed;
  let u = (time / period + phase) % 1;
  if (u < 0) u += 1;
  return u < 0.5 ? 1 : -1;
}

/**
 * Distance fallen after time t from speed v0 with gravity g, capped at vmax
 * (falling roof tiles).
 */
export function cappedFall(t, v0, g, vmax) {
  if (t <= 0) return 0;
  const tCap = Math.max(0, (vmax - v0) / g);
  if (t <= tCap) return v0 * t + 0.5 * g * t * t;
  return v0 * tCap + 0.5 * g * tCap * tCap + vmax * (t - tCap);
}
