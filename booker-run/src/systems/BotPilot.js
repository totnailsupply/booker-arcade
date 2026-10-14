import { BOT } from '../core/Constants.js';
import { makeRng } from '../core/Rng.js';
import { BotSim, SPRITE_DX } from './BotSim.js';

// =============================================================================
// BotPilot — the generic bot for Levels 2-6 and the sandbox (?autoplay=1).
//
// It plans with BotSim, a frame-exact model of the game that runs the same
// PlayerController code. Every few frames it simulates "do nothing"; when that
// dies, it searches press/hold timings (up to BOT.MAX_DEPTH presses: jump,
// double jump, dash, wall kicks, pounce bounces, glide holds) until one keeps
// Booker alive past the danger and back on his feet. Of all the frames the
// first press could happen on, it takes the middle of the widest working run,
// so input jitter has the most room either way. After each press it re-plans
// from the real state.
//
// botPlan (level data) = scripted input that overrides the planner:
//   { x, action: 'press', ms? }  press, hold ms (default 380 = full jump)
//   { x, action: 'tap' }         press, hold 100 ms
//   { x, action: 'hold' }        press and keep holding until a 'release'
//   { x, action: 'release' }
// x is Booker's sprite x. Entries closer than BOT.PLAN_CLUSTER_GAP_PX form one
// stretch; the planner stands down from PLAN_LEAD_PX before its first entry
// until its last press is released, and treats reaching a stretch as safe.
//
// ?botjitter=ms shifts every press (planned or scripted) by a random +/- ms and
// changes every hold by +/- ms (seeded by ?seed).
// =============================================================================

const FRAME = BOT.FRAME_MS;

function* spiral(anchor, lo, hi, stride) {
  if (hi < lo) return;
  const a = Math.max(lo, Math.min(hi, Math.round(anchor)));
  yield a;
  for (let d = stride; ; d += stride) {
    const up = a + d;
    const down = a - d;
    const okUp = up <= hi;
    const okDown = down >= lo;
    if (!okUp && !okDown) return;
    if (okDown) yield down;
    if (okUp) yield up;
  }
}

export class BotPilot {
  constructor(scene, input, { jitterMs = 0, seed = 1, botPlan = [] } = {}) {
    this.scene = scene;
    this.input = input;
    this.sim = new BotSim(scene.model, scene.flags);
    this.flags = scene.flags;
    this.jitterMs = jitterMs;
    this.rng = makeRng(seed);
    this.frame = 0;
    this.holding = false;
    this.releaseAt = -1;
    this.pending = null;
    this.nextPlanAt = 0;
    this.offsetF = this.jitterFrames();
    this.holdOffsetF = this.jitterFrames();
    // Follow-up presses are planned at least this many frames after the
    // previous release, so a hold that jitter makes longer never blocks them
    this.holdPad = Math.ceil(jitterMs / FRAME);
    this.stats = {
      plans: 0, searches: 0, presses: 0, scripted: 0, fallbacks: 0, budgetHits: 0, holdLimitHits: 0,
      warmStarts: 0, simFrames: 0, planMs: 0, maxPlanMs: 0, depthUsed: [0, 0, 0],
    };
    // Bumped on every press and scripted input: a search may reuse what the
    // previous one learnt only while Booker is on the same trajectory
    this.inputSeq = 0;
    this.warm = null;
    // Slack (frames) a plan needs before the search stops looking: the jitter
    // in frames, at least ROBUST_SLACK, at most ROBUST_K (the measured cap)
    this.targetSlack = Math.max(BOT.ROBUST_SLACK, Math.min(BOT.ROBUST_K, Math.round(jitterMs / FRAME)));
    this.lastPlan = null;

    const glide = this.flags.glide || this.flags.pounce;
    this.groundHolds = glide ? BOT.HOLDS_GROUND_GLIDE : BOT.HOLDS_GROUND;
    this.airHolds = this.flags.glide ? BOT.HOLDS_AIR_GLIDE : [...BOT.HOLDS_AIR, 23];

    this.setupScript(botPlan);
  }

  jitterFrames() {
    return Math.round(this.rng.symmetric(this.jitterMs) / FRAME);
  }

  // --- scripted input (botPlan) ------------------------------------------------

  setupScript(botPlan) {
    const entries = (botPlan || [])
      .filter(e => e && Number.isFinite(e.x) && e.action)
      .map(e => ({ ...e, offsetMs: this.rng.symmetric(this.jitterMs), holdOffsetMs: this.rng.symmetric(this.jitterMs) }))
      .sort((a, b) => a.x - b.x);
    const zones = [];
    for (const e of entries) {
      const z = zones[zones.length - 1];
      if (z && e.x - z.lastX <= BOT.PLAN_CLUSTER_GAP_PX) {
        z.lastX = e.x;
        z.count += 1;
      } else {
        zones.push({ start: e.x - BOT.PLAN_LEAD_PX, firstX: e.x, lastX: e.x, count: 1, fired: 0 });
      }
      e.zone = zones.length - 1;
    }
    this.script = entries;
    this.scriptIdx = 0;
    this.zones = zones;
    this.sim.scriptZones = zones.map(z => ({ start: z.start, end: z.lastX }));
  }

  /** Fires due script entries. Returns true while a scripted stretch is in control. */
  runScript(spriteX, speed) {
    if (!this.script.length) return false;
    while (this.scriptIdx < this.script.length) {
      const e = this.script[this.scriptIdx];
      const trigger = e.x + speed * (e.offsetMs / 1000);
      if (spriteX < trigger) break;
      this.scriptIdx += 1;
      this.inputSeq += 1;
      this.zones[e.zone].fired += 1;
      this.pending = null;
      this.stats.scripted += 1;
      const holdFrames = (ms) => Math.max(1, Math.round((ms + e.holdOffsetMs) / FRAME));
      if (e.action === 'release') {
        this.release();
      } else if (e.action === 'hold') {
        this.press(Infinity);
      } else if (e.action === 'tap') {
        this.press(holdFrames(BOT.PLAN_TAP_MS));
      } else {
        this.press(holdFrames(e.ms ?? BOT.PLAN_DEFAULT_HOLD_MS));
      }
    }
    for (const z of this.zones) {
      if (spriteX < z.start) continue;
      if (z.fired < z.count || (this.holding && this.scriptHold)) return true;
    }
    return false;
  }

  // --- executor ------------------------------------------------------------------

  press(holdFrames, scripted = true) {
    this.input.botPress();
    this.holding = true;
    this.scriptHold = scripted;
    this.releaseAt = this.frame + holdFrames;
    this.stats.presses += 1;
    this.inputSeq += 1;
  }

  release() {
    if (!this.holding) return;
    this.input.botRelease();
    this.holding = false;
    this.scriptHold = false;
  }

  /** Called by RunScene each gameplay frame, before player.update. */
  update() {
    this.frame += 1;
    const f = this.frame;
    if (this.holding && f >= this.releaseAt) this.release();

    const spriteX = this.scene.player.sprite.x;
    if (this.runScript(spriteX, this.scene.speed)) return;

    if (this.pending) {
      if (f >= this.pending.at) {
        const hold = this.pending.hold;
        this.pending = null;
        this.press(hold, false);
        this.nextPlanAt = f + 1;
      }
      return;
    }
    if (f < this.nextPlanAt) return;
    this.plan();
  }

  plan() {
    const t0 = performance.now();
    const base = this.sim.snapshot(this.scene);
    const relRelease = this.holding ? this.releaseAt - this.frame : -1;
    const res = this.search(base, relRelease);
    const ms = performance.now() - t0;
    this.stats.plans += 1;
    this.stats.planMs += ms;
    if (ms > this.stats.maxPlanMs) this.stats.maxPlanMs = Math.round(ms * 10) / 10;
    if (!res) {
      this.nextPlanAt = this.frame + BOT.IDLE_CHECK_EVERY;
      return;
    }
    this.lastPlan = { frame: this.frame, x: Math.round(base.bx + SPRITE_DX), ...res };
    const target = res.f + this.offsetF;
    if (target > BOT.COMMIT_FRAMES) {
      this.nextPlanAt = this.frame + Math.max(1, Math.min(BOT.REPLAN_EVERY, target - BOT.COMMIT_FRAMES));
      return;
    }
    const minAt = this.holding ? this.releaseAt + 1 : this.frame;
    const at = Math.max(minAt, this.frame + target);
    const hold = Math.max(1, res.h + this.holdOffsetF);
    this.offsetF = this.jitterFrames();
    this.holdOffsetF = this.jitterFrames();
    if (at <= this.frame) {
      this.press(hold, false);
      this.nextPlanAt = this.frame + 1;
    } else {
      this.pending = { at, hold };
    }
  }

  // --- planner ------------------------------------------------------------------------

  /**
   * Simulates from `base` with presses `actions` ([{ f, h }], frames from now)
   * on top of the current hold (held for frames < relRelease).
   */
  run(base, actions, relRelease, ctx) {
    const sim = this.sim;
    const s = sim.clone(base);
    let lastEnd = relRelease;
    let lastStart = -1;
    for (const a of actions) {
      lastEnd = Math.max(lastEnd, a.f + a.h);
      lastStart = Math.max(lastStart, a.f);
    }
    const lookEnd = Math.max(0, lastEnd) + BOT.LOOK_FRAMES;
    const hardEnd = lookEnd + BOT.LAND_EXTRA_FRAMES;
    const input = { pressed: false, held: false };
    let grounded = 0;
    let lastGround = s.onGround ? 0 : -1;
    let apex = -1;
    let firstBlocked = -1;
    let firstCling = -1;
    let prevVy = s.vy;
    for (let i = 0; ; i++) {
      let pressed = false;
      let held = i < relRelease;
      for (let k = 0; k < actions.length; k++) {
        const a = actions[k];
        if (i === a.f) pressed = true;
        if (i >= a.f && i < a.f + a.h) held = true;
      }
      input.pressed = pressed;
      input.held = held;
      sim.step(s, input);
      ctx.frames += 1;
      if (s.dead) return { ok: false, end: i, cause: s.cause, lastGround, apex, firstBlocked, firstCling, maxX: s.maxX };
      if (s.finished || s.handover) return { ok: true, end: i, apex };
      if (s.onGround) lastGround = i;
      if (firstBlocked < 0 && s.ctrl.stuckMs > 0) firstBlocked = i;
      if (firstCling < 0 && s.ctrl.clinging) firstCling = i;
      if (apex < 0 && i > lastStart && prevVy < 0 && s.vy >= 0) apex = i;
      prevVy = s.vy;
      if (i >= lookEnd) {
        if (s.onGround && s.ctrl.stuckMs === 0) {
          grounded += 1;
          if (grounded >= BOT.SETTLE_FRAMES) return { ok: true, end: i, apex };
        } else {
          grounded = 0;
        }
        // Out of look-ahead: safe only if nothing pins Booker. Clinging or
        // pressed against a face at the cut-off means the stuck rule is coming
        // (one low kick on a tall wall slides back down and would count as safe)
        if (i >= hardEnd) {
          if (s.ctrl.clinging || s.ctrl.stuckMs > 0) {
            return { ok: false, end: i, cause: 'wall', lastGround, apex, firstBlocked, firstCling, maxX: s.maxX };
          }
          return { ok: true, end: i, apex };
        }
      }
      if (ctx.frames > ctx.limit) return { ok: false, end: i, cause: 'budget', lastGround, apex, maxX: s.maxX };
    }
  }

  /** Is there a continuation (up to depthLeft more presses) after `actions`? */
  tryPlan(base, actions, relRelease, depthLeft, ctx) {
    const r = this.run(base, actions, relRelease, ctx);
    if (r.ok) return { ok: true, cont: [] };
    if (!ctx.best || r.maxX > ctx.best.maxX) ctx.best = { action: actions[0], maxX: r.maxX };
    if (depthLeft <= 0 || r.cause === 'budget') return { ok: false };
    const last = actions[actions.length - 1];
    const minF = last.f + last.h + 1 + this.holdPad;
    const maxF = r.end;
    if (maxF < minF) return { ok: false };
    // Where the follow-up press is most likely: kick at the first cling, or as
    // soon as allowed when Booker already clings (chained kicks up a tall wall);
    // jump at the edge Booker ran off (a plank chain); else at the apex (double
    // jump height, dash reach) or right after the release
    let anchor;
    if (r.firstCling >= 0) anchor = Math.max(minF, r.firstCling);
    else if (r.cause === 'pit' && r.lastGround >= minF) anchor = r.lastGround;
    else if (r.cause === 'wall' && r.firstBlocked >= minF) anchor = Math.max(minF, r.firstBlocked - 10);
    else anchor = Math.max(minF, r.apex >= 0 ? r.apex : r.end - 12);
    for (const f of spiral(anchor, minF, maxF, 2)) {
      for (const h of this.airHolds) {
        const rr = this.tryPlan(base, [...actions, { f, h }], relRelease, depthLeft - 1, ctx);
        if (rr.ok) return { ok: true, cont: [{ f, h }, ...rr.cont] };
        if (ctx.frames > ctx.limit) return { ok: false };
      }
    }
    return { ok: false };
  }

  /**
   * Returns null (nothing to do) or { f, h, window: [lo, hi], score } for the next press.
   *
   * Iterative deepening: every hold is tried with ONE press first, then with
   * one follow-up press, then two. Each depth gets a share of the budget
   * (BOT.DEPTH_SHARE of what is left), split evenly across the holds still to
   * try, so one hold's deep tree can't starve the others (a single long glide
   * hold is often the simple answer). It stops at the first plan whose slack
   * reaches the jitter target; otherwise it keeps the plan with the most slack
   * (ties: fewer presses, then the wider window). Per hold, up to
   * BOT.MAX_WINDOWS windows of working first presses are measured while none
   * reaches the target. A re-plan on the same trajectory starts at the depth
   * the last search needed (warm start, BOT.WARM_FRAMES).
   */
  search(base, relRelease) {
    const ctx = { frames: 0, budget: BOT.BUDGET_FRAMES, limit: BOT.BUDGET_FRAMES, best: null };
    const idle = this.run(base, [], relRelease, ctx);
    if (idle.ok) {
      this.stats.simFrames += ctx.frames;
      return null;
    }
    this.stats.searches += 1;
    const minF = relRelease >= 0 ? relRelease + 1 : 0;
    const maxF = idle.end;
    const onGround = base.onGround || base.ctrl.coyoteMs > 0;
    let holds = onGround ? this.groundHolds : this.airHolds;
    // Warm start. Approaching a tall wall the bot replans every REPLAN_EVERY
    // frames until the jump is due, and each search used to burn most of its
    // budget proving again that one or two presses can't climb it. If the
    // last search was on this same trajectory (no input since, a few frames
    // ago) and found no plan at all below depth d, the presses left now are a
    // subset of the ones it tried, so start at d with its hold first.
    let startDepth = 0;
    const w = this.warm;
    this.warm = null;
    if (w && w.inputSeq === this.inputSeq && w.onGround === onGround && this.frame - w.frame <= BOT.WARM_FRAMES) {
      startDepth = w.depth;
      holds = [w.h, ...holds.filter(h => h !== w.h)];
      this.stats.warmStarts += 1;
    }
    // Where to look first: kick at once when clinging (whatever would kill an
    // idle Booker: the stuck rule, a gear at the wall's foot, the pit under a
    // pillar), else at the first cling of an airborne approach, the edge for
    // pits, just before the face for walls, ~0.27 s before impact otherwise.
    // Anchoring a cling at the death made the bot kick once low, slide back and
    // re-plan the same way forever.
    let anchor = idle.end - 16;
    if (!onGround && base.ctrl.clinging) anchor = minF;
    else if (!onGround && idle.firstCling >= 0) anchor = Math.max(minF, idle.firstCling);
    else if (idle.cause === 'pit' && idle.lastGround >= 0) anchor = idle.lastGround;
    else if (idle.cause === 'wall') {
      // Airborne at a wall (clinging or about to): kick as soon as possible, or
      // the planner would keep deferring the climb until the slide bottoms out
      if (!onGround) anchor = minF;
      else if (idle.firstBlocked >= 0) anchor = idle.firstBlocked - 10;
    }

    const target = this.targetSlack;

    // Continuation for a first press at f (null = infeasible). A known
    // continuation from a neighbouring f, shifted along, is tried first.
    const contFor = (f, h, hint, depth) => {
      if (hint) {
        const shifted = hint.list.map(a => ({ f: a.f + (f - hint.base), h: a.h }));
        if (shifted[0].f > f + h + this.holdPad && this.run(base, [{ f, h }, ...shifted], relRelease, ctx).ok) return shifted;
      }
      const r = this.tryPlan(base, [{ f, h }], relRelease, depth, ctx);
      return r.ok ? r.cont : null;
    };

    // Slack of the follow-up presses: for each one, the half-width of its
    // working window when it and every later press shift together. The planner
    // re-centres each press when it gets there, so the smallest half-width is
    // how much jitter the rest of the sequence can absorb.
    const contSlack = (f, h, cont) => {
      const K = BOT.ROBUST_K;
      let score = K;
      for (let k = 0; k < cont.length && score > 0; k++) {
        const prevEnd = (k === 0 ? f + h : cont[k - 1].f + cont[k - 1].h) + this.holdPad;
        const tryShift = (d) => {
          if (cont[k].f + d <= prevEnd) return false;
          const acts = [{ f, h }];
          for (let j = 0; j < cont.length; j++) acts.push(j < k ? cont[j] : { f: cont[j].f + d, h: cont[j].h });
          return this.run(base, acts, relRelease, ctx).ok;
        };
        let lo = 0;
        let hi = 0;
        while (lo > -2 * K && tryShift(lo - 1)) lo -= 1;
        while (hi < 2 * K && tryShift(hi + 1)) hi += 1;
        score = Math.min(score, Math.floor((hi - lo) / 2));
      }
      return score;
    };

    // Window of working first-press frames around one that works, and its most
    // robust press
    const measure = (h, depth, found) => {
      const conts = new Map([[found.f, found.cont]]);
      const hint = found.cont.length ? { base: found.f, list: found.cont } : null;
      const reach = BOT.WINDOW_REACH;
      let lo = found.f;
      let hi = found.f;
      for (let f = found.f - 1; f >= minF && found.f - f <= reach && ctx.frames <= ctx.limit; f--) {
        const c = contFor(f, h, hint, depth);
        if (!c) break;
        conts.set(f, c);
        lo = f;
      }
      for (let f = found.f + 1; f <= maxF && f - found.f <= reach && ctx.frames <= ctx.limit; f++) {
        const c = contFor(f, h, hint, depth);
        if (!c) break;
        conts.set(f, c);
        hi = f;
      }
      // Most robust first press: slack of its own window and of the follow-ups
      const center = (lo + hi) / 2;
      let pick = null;
      for (let f = lo; f <= hi; f++) {
        const own = Math.min(f - lo, hi - f);
        if (pick && own < pick.score) continue;
        const score = Math.min(own, contSlack(f, h, conts.get(f)));
        if (!pick || score > pick.score || (score === pick.score && Math.abs(f - center) < Math.abs(pick.f - center))) {
          pick = { f, score };
        }
        if (ctx.frames > ctx.limit) break;
      }
      return { f: pick.f, h, window: [lo, hi], width: hi - lo + 1, score: pick.score, cont: conts.get(pick.f).length, depth };
    };

    // Best first press for one hold with up to `depth` follow-up presses. The
    // spiral goes on past a window whose slack is under the target: the frame
    // nearest the anchor can be an isolated one (a kick the moment a cling
    // starts) with a wide window further on, and jitter misses isolated frames.
    const evalHold = (h, depth) => {
      let bestW = null;
      const covered = [];   // measured windows plus the failing frame at each end
      for (const f of spiral(anchor, minF, maxF, 1)) {
        if (covered.some(([a, b]) => f >= a && f <= b)) continue;
        const r = this.tryPlan(base, [{ f, h }], relRelease, depth, ctx);
        if (r.ok) {
          const w = measure(h, depth, { f, cont: r.cont });
          covered.push([w.window[0] - 1, w.window[1] + 1]);
          if (!bestW || w.score > bestW.score || (w.score === bestW.score && w.width > bestW.width)) bestW = w;
          if (bestW.score >= target || covered.length >= BOT.MAX_WINDOWS) break;
        }
        if (ctx.frames > ctx.limit) break;
      }
      return bestW;
    };

    const better = (a, b) => !b || a.score > b.score
      || (a.score === b.score && (a.cont < b.cont || (a.cont === b.cont && a.width > b.width)));
    let best = null;
    let firstCand = -1;  // depth of the first plan of any slack
    let extra = false;   // one deeper look after the target is met (BOT.EXTRA_DEPTH)
    for (let depth = startDepth; depth < BOT.MAX_DEPTH && ctx.frames < ctx.budget; depth++) {
      const share = depth === BOT.MAX_DEPTH - 1 ? 1 : BOT.DEPTH_SHARE[depth];
      const depthEnd = ctx.frames + (ctx.budget - ctx.frames) * (extra ? BOT.EXTRA_DEPTH_SHARE : share);
      for (let i = 0; i < holds.length; i++) {
        ctx.limit = Math.min(ctx.budget, ctx.frames + Math.max(0, depthEnd - ctx.frames) / (holds.length - i));
        const cand = evalHold(holds[i], depth);
        if (ctx.frames > ctx.limit) this.stats.holdLimitHits += 1;
        if (cand && firstCand < 0) firstCand = depth;
        if (cand && better(cand, best)) best = cand;
        if (best && best.score >= BOT.ROBUST_K) break;
        if (best && best.score >= target && !BOT.EXTRA_DEPTH) break;
        if (ctx.frames >= ctx.budget) break;
      }
      if (!best || best.score < target) continue;
      if (best.score >= BOT.ROBUST_K || !BOT.EXTRA_DEPTH || extra) break;
      extra = true;   // target met below the cap: one cheap deeper look for more slack
    }
    this.stats.simFrames += ctx.frames;
    if (ctx.frames >= ctx.budget) this.stats.budgetHits += 1;
    if (best) {
      this.stats.depthUsed[best.depth] += 1;
      if (best.depth > 0 && firstCand === best.depth) {
        this.warm = { frame: this.frame, inputSeq: this.inputSeq, onGround, depth: best.depth, h: best.h };
      }
      return best;
    }
    if (ctx.best?.action) {
      this.stats.fallbacks += 1;
      return { ...ctx.best.action, window: null, fallback: true };
    }
    return null;
  }

  debugState() {
    return {
      kind: 'planner',
      frame: this.frame,
      holding: this.holding,
      pending: this.pending,
      lastPlan: this.lastPlan,
      jitterMs: this.jitterMs,
      ...this.stats,
    };
  }

  destroy() {
    this.input.botRelease();
  }
}
