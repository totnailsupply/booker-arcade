// =============================================================================
// Hitboxes.js — contact tests between Soba and hazards / treats. Pure functions
// (no Phaser) shared by the game (ClimbSim), the bot's flight planner and the
// level validator, so all three agree on what "touching" means.
//
// Soba's boxes are feet-anchored (s.y = feet y, x = centre). Hazard boxes are
// centred. x tests are wrap-aware (the strip wraps every 270 px).
// Every hazard hurtbox is smaller than its art (Constants: CROW / TILE / CHIMES),
// and Soba's hurtbox (SOBA.BODY_W x BODY_H) is smaller than hers: forgiving.
// `margin` inflates the hazard box (the bot plans with a safety margin).
// =============================================================================

import { SOBA, CROW, TREAT } from './Constants.js';
import { wrapDelta, FOOT_HALF } from './Kinematics.js';

/** Soba's hurtbox overlaps a centred box (hx, hy, hw x hh)? */
export function bodyOverlaps(sx, feetY, hx, hy, hw, hh, margin = 0) {
  const dx = Math.abs(wrapDelta(sx, hx));
  if (dx > SOBA.BODY_W / 2 + hw / 2 + margin) return false;
  const top = feetY - SOBA.BODY_H;
  return feetY >= hy - hh / 2 - margin && top <= hy + hh / 2 + margin;
}

/**
 * Crow contact for Soba state s ({x, y, vy}) with the crow centred at (cx, cy).
 *   'stomp' falling, feet came from above the crow's centre and reached its
 *           head (centre - STOMP_TOP), within the generous stomp width
 *   'hit'   any other overlap of the hurtboxes
 *   null    no contact
 */
export function crowContact(s, prevFeetY, cx, cy, margin = 0) {
  const dx = Math.abs(wrapDelta(s.x, cx));
  if (s.vy > 0 && prevFeetY <= cy + CROW.STOMP_SLOP && s.y >= cy - CROW.STOMP_TOP
      && dx <= CROW.STOMP_HALF_W + FOOT_HALF - Math.max(0, margin)) {
    return 'stomp';
  }
  if (bodyOverlaps(s.x, s.y, cx, cy, CROW.HURT_W, CROW.HURT_H, margin)) return 'hit';
  return null;
}

/** Soba's (generous) pickup box overlaps a treat centred at (tx, ty)? */
export function pickupOverlaps(sx, feetY, tx, ty) {
  const dx = Math.abs(wrapDelta(sx, tx));
  if (dx > SOBA.PICKUP_W / 2 + TREAT.HALF) return false;
  return feetY >= ty - TREAT.HALF && feetY - SOBA.PICKUP_H <= ty + TREAT.HALF;
}
