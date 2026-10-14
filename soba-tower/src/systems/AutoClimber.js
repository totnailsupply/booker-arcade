// =============================================================================
// AutoClimber — test bot for ?autoplay=1 (QA proof that the level is climbable)
// and, with { sloppy: true }, a rough model of a casual player that
// scripts/sim-climb.mjs uses to tune the difficulty curve.
//
// Pure logic, no Phaser: ClimbSim feeds it Soba's state, the active platforms
// and the hazards near the view each frame, and it returns a steer direction
// (-1, 0, 1). The same class runs inside node simulations.
//
// Plan: after every bounce (and whenever the plan goes stale) list every
// platform Soba can still land on:
//   - its top (at the predicted landing time; lifts move) must be below the
//     apex of the current arc and above the camera death line,
//   - the lateral distance to where it will BE at that time (sliders move,
//     wrap counts) must fit the reach left: |dx| - slack <= factor * reach(t),
// then take the highest one whose flight is safe. "Safe" = a forward
// simulation of this exact steering controller, with the hazards' predicted
// positions (crows patrol on the world clock, tiles fall on a known curve,
// chimes are static), touches no hurtbox (a crow stomp counts as safe), and
// the first part of the next bounce off the target is clear too. The current
// platform is always a candidate, so "wait for the crow to pass" falls out of
// the same rule. The plan is re-checked every few frames (new tile warnings).
//
// Steering is a stop-at-target controller: push toward the target until the
// remaining distance equals the release stopping distance (vx^2 / 2*DECEL),
// then let go.
//
// Sloppy mode (Constants.SLOPPY), seeded:
//   - ~150 ms reaction: after each new plan the hands keep doing what they did,
//   - aim error, late releases (overshoot),
//   - sometimes a random reachable target, sometimes an overconfident reach,
//   - sometimes no hazard check at all, a tighter margin otherwise, and tile
//     warnings are only noticed after the reaction time.
// =============================================================================

import { AUTOPLAY, SLOPPY, STEER, SOBA, BOUNCE, SPRING } from '../core/Constants.js';
import {
  wrapDelta, timeToDescendTo, timeToDescendToMoving, lateralReach, stepHorizontal, stepVertical, FOOT_HALF,
} from '../core/Kinematics.js';

/** Small seeded PRNG (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Predicted platform position t s from now. `moveErr` (sloppy) skews the
// timing of moving platforms, the way a player misjudges a slider's phase.
let moveErr = 0;
const px = (p, t) => (typeof p.predictX === 'function' ? p.predictX(t + (p.moving ? moveErr : 0)) : p.x);
const py = (p, t) => (typeof p.predictY === 'function' ? p.predictY(t + (p.moving ? moveErr : 0)) : p.y);
const isMovingY = p => p.type === 'lift';

export class AutoClimber {
  /**
   * @param {{sloppy?: boolean, seed?: number}} [opts]
   */
  constructor(opts = {}) {
    this.sloppy = !!opts.sloppy;
    this.rng = makeRng(opts.seed ?? 1);
    this.target = null;
    this.frame = 0;
    this.aimDx = 0;
    this.releaseK = 1;
    this.reachFactor = AUTOPLAY.REACH_FACTOR;
    this.reactS = 0;
    this.lastDir = 0;
    this.camTop = 0;
    this.stats = { plans: 0, unsafePlans: 0 };
    this.platforms = [];
    this.moveErr = 0;
  }

  reset() {
    this.target = null;
  }

  /** Called by the sim when Soba bounces (platform, crow or cushion). */
  onBounce() {
    this.target = null;
    this.fresh = true;
  }

  // --- prediction -----------------------------------------------------------------

  /** Seconds (from state s, at tau0 into the future) until the feet descend through p's top, or null. */
  static landTime(s, p, tau0 = 0) {
    if (isMovingY(p)) return timeToDescendToMoving(s.y, s.vy, t => py(p, tau0 + t));
    return timeToDescendTo(s.y, s.vy, p.y);
  }

  /** Can Soba (state s, tau0 s from now) still land on p? Returns { t, dx, need } or null. */
  evaluate(s, p, deathY, reachFactor = this.reachFactor, tau0 = 0) {
    if (!p.solid || p.vanishing || p.state === 'cracked' || p.state === 'falling') return null;
    const t = AutoClimber.landTime(s, p, tau0);
    if (t === null) return null;
    if (py(p, tau0 + t) > deathY - AUTOPLAY.DEATH_MARGIN) return null;
    const dx = wrapDelta(s.x, px(p, tau0 + t));
    const slack = Math.max(0, p.w / 2 + FOOT_HALF - AUTOPLAY.SAFETY_PX - SOBA.FOOT_FORGIVE);
    const need = Math.max(0, Math.abs(dx) - slack);
    const v0 = Math.sign(dx) === Math.sign(s.vx) ? Math.abs(s.vx) : 0;
    const reach = lateralReach(t - AUTOPLAY.REACTION_S, v0) * reachFactor;
    if (need > reach) return null;
    return { t, dx, need };
  }

  /** Steering for state s toward p (tau = seconds into a simulated future). */
  steer(s, p, tau = 0) {
    if (!p) return 0;
    const t = AutoClimber.landTime(s, p, tau) ?? 0;
    const dx = wrapDelta(s.x, px(p, tau + t) + this.aimDx);
    const dist = Math.abs(dx);
    const dir = Math.sign(dx);
    if (dist <= AUTOPLAY.ARRIVE_TOL) return 0;
    const movingToward = Math.sign(s.vx) === dir;
    const stopDist = ((s.vx * s.vx) / (2 * STEER.DECEL)) * this.releaseK;
    if (movingToward && stopDist >= dist - AUTOPLAY.ARRIVE_TOL) return 0;
    return dir;
  }

  /**
   * Forward-simulates the flight from state s (tau0 s from now) to p with this
   * controller and checks hazards. depth 1 also requires a safe continuation
   * after landing (some next target, staying included, has a safe flight);
   * depth 0 only checks the first AFTER_LAND_S of the next bounce.
   * Returns { safe, t } (t = time of the first hit when unsafe).
   */
  flight(s, p, hazards, deathY, margin, tau0 = 0, depth = 1) {
    const st = { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    const dt = AUTOPLAY.SIM_DT;
    let tau = 0;
    let prev = st.y;
    let landedAt = null;
    const mult = p.type === 'springpad' ? SPRING.VELOCITY_MULT : 1;
    while (tau < AUTOPLAY.SIM_MAX_S) {
      const dir = landedAt === null ? this.steer(st, p, tau0 + tau) : 0;
      stepHorizontal(st, dir, dt);
      prev = st.y;
      stepVertical(st, dt);
      tau += dt;
      for (const h of hazards) {
        const c = h.contactIn(tau0 + tau, st, prev, margin, this.camTop);
        if (c === 'stomp') return { safe: true, t: tau };
        if (c === 'hit') return { safe: false, t: tau };
      }
      if (landedAt === null) {
        const top = py(p, tau0 + tau);
        if (st.vy > 0 && prev <= py(p, tau0 + tau - dt) + 0.5 && st.y >= top
          && Math.abs(wrapDelta(st.x, px(p, tau0 + tau))) <= p.w / 2 + FOOT_HALF) {
          landedAt = tau;
          st.y = top;
          st.vy = -BOUNCE.VELOCITY * mult;
          if (depth > 0) {
            return this.continuation(st, p, hazards, deathY, margin, tau0 + tau)
              ? { safe: true, t: tau }
              : { safe: false, t: tau + AUTOPLAY.AFTER_LAND_S };
          }
        } else if (st.y > deathY) {
          return { safe: false, t: tau };
        }
      } else if (tau - landedAt >= AUTOPLAY.AFTER_LAND_S) {
        return { safe: true, t: tau };
      }
    }
    return { safe: true, t: tau };
  }

  /** After bouncing off `from` (state st, tau0 s from now): is any next flight safe? */
  continuation(st, from, hazards, deathY, margin, tau0) {
    const cands = [];
    for (const q of this.platforms) {
      if (q === from && q.type === 'crumble') continue;
      const e = this.evaluate(st, q, deathY, this.reachFactor, tau0);
      if (e) cands.push(q);
    }
    cands.sort((a, b) => a.y - b.y);
    for (let i = 0; i < Math.min(cands.length, AUTOPLAY.CONTINUATIONS); i++) {
      if (this.flight(st, cands[i], hazards, deathY, margin, tau0, 0).safe) return true;
    }
    return false;
  }

  choose(s, platforms, deathY, hazards) {
    const sl = this.sloppy ? SLOPPY : null;
    const r = this.rng;
    this.reachFactor = sl ? sl.REACH_FACTOR[0] + r() * (sl.REACH_FACTOR[1] - sl.REACH_FACTOR[0]) : AUTOPLAY.REACH_FACTOR;
    const cands = [];
    for (const p of platforms) {
      const e = this.evaluate(s, p, deathY);
      if (e) cands.push({ p, e });
    }
    cands.sort((a, b) => (a.p.y - b.p.y) || (Math.abs(a.e.dx) - Math.abs(b.e.dx)));
    if (sl && cands.length > 1 && r() < sl.MISPICK) {
      const i = 1 + Math.floor(r() * (cands.length - 1));
      const [c] = cands.splice(i, 1);
      cands.unshift(c);
    }
    this.aimDx = sl ? AutoClimber.gauss(r) * sl.AIM_SIGMA_PX : 0;
    this.releaseK = sl ? sl.LATE_RELEASE[0] + r() * (sl.LATE_RELEASE[1] - sl.LATE_RELEASE[0]) : 1;
    const check = hazards.length > 0 && !(sl && r() < sl.HAZARD_BLIND);
    const margin = sl ? sl.HAZARD_MARGIN : AUTOPLAY.HAZARD_MARGIN;
    let best = null;
    let fallback = null;
    this.stats.plans += 1;
    for (const c of cands) {
      if (!check) { best = c.p; break; }
      const f = this.flight(s, c.p, hazards, deathY, margin);
      if (f.safe) { best = c.p; break; }
      if (!fallback || f.t > fallback.t) fallback = { p: c.p, t: f.t };
    }
    if (!best && fallback) {
      best = fallback.p;
      this.stats.unsafePlans += 1;
    }
    this.target = best;
    this.checkHazards = check;
    if (sl) {
      // Every new plan costs a reaction (+ the odd hesitation after a bounce);
      // a mid-air re-plan never stacks on a reaction that is still pending.
      let react = sl.REACTION_S + (r() * 2 - 1) * sl.REACTION_JITTER_S;
      if (this.fresh && r() < sl.HESITATE) react += sl.HESITATE_S[0] + r() * (sl.HESITATE_S[1] - sl.HESITATE_S[0]);
      this.reactS = Math.max(this.reactS, react);
      this.moveErr = (r() * 2 - 1) * sl.MOVE_ERR_S;
    }
    this.fresh = false;
    return best;
  }

  static gauss(r) {
    const u = Math.max(1e-9, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  /**
   * @param {{soba:{x,y,vx,vy}, platforms:Array, deathY:number, hazards?:Array, camTop?:number, dt?:number}} w
   * @returns {-1|0|1}
   */
  decide(w) {
    const s = w.soba;
    const dt = w.dt ?? 1 / 60;
    this.frame += 1;
    this.platforms = w.platforms;
    this.camTop = w.camTop ?? 0;
    let hazards = w.hazards || [];
    if (this.sloppy) {
      // Tile warnings are only noticed after the reaction time
      hazards = hazards.filter(h => h.type !== 'tile' || h.state === 'falling' || h.warnAge >= SLOPPY.REACTION_S);
    }
    const margin = this.sloppy ? SLOPPY.HAZARD_MARGIN : AUTOPLAY.HAZARD_MARGIN;
    moveErr = this.moveErr;

    if (this.target && !this.evaluate(s, this.target, w.deathY)) this.target = null;
    if (this.target && this.checkHazards && hazards.length && this.frame % AUTOPLAY.REPLAN_FRAMES === 0
      && !this.flight(s, this.target, hazards, w.deathY, margin).safe) {
      this.target = null;
    }
    if (!this.target) this.choose(s, w.platforms, w.deathY, hazards);

    moveErr = this.moveErr;
    let dir = this.steer(s, this.target);
    moveErr = 0;
    if (this.reactS > 0) {
      this.reactS -= dt;
      dir = this.lastDir;
    }
    this.lastDir = dir;
    return dir;
  }
}
