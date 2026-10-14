import {
  WORLD, PLAYER, JUMP, SPEED, POUNCE, OBSTACLE, BOT,
} from '../core/Constants.js';
import { PlayerController, CTRL_EV } from '../entities/PlayerController.js';
import {
  wallFaceAt, updraftAt, landingInMs, stepMover, moverRect, stepSteam, steamPhase,
} from '../world/LevelModel.js';

// =============================================================================
// BotSim — a frame-exact model of RunScene for the planner bot (no Phaser).
//
// One sim step = what the game does between two snapshots:
//   1. RunScene.update (frame k): speed lerp, PlayerController.update (the
//      same code the game runs), movers and steam clocks, pit check.
//   2. Arcade world step (frame k+1) at exactly 1/60 s: gravity, clamp,
//      integrate, then colliders/overlaps in the game's creation order:
//      ground -> L1 obstacles -> finish -> platforms -> walls -> hazards ->
//      enemies (stomp or hit) -> breakables (smash or hit) -> steam.
// Separation follows Arcade (Y first, OVERLAP_BIAS 4, one-way platforms only
// stop a body moving down onto their top). Gameplay freezes (hit-stop) are not
// modelled: they pause the whole world, so they only shift time.
// =============================================================================

const DT = BOT.FRAME_MS;
const DTS = DT / 1000;
const G = WORLD.GROUND_Y;
const BW = PLAYER.BODY_W;
const BH = PLAYER.BODY_H;
const SPRITE_DX = PLAYER.FRAME_W / 2 - PLAYER.BODY_OFFSET_X;   // sprite.x = body.x + 13
const BIAS = 4;
const MAX_VY = JUMP.MAX_FALL_SPEED;

function maxWidth(list, w = (r) => r.w) {
  return list.reduce((m, r) => Math.max(m, w(r)), 0);
}

/** First index whose key >= x (list sorted by key). */
function lowerBound(list, x, key) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const keyX = (r) => r.x;
const keyRectX = (o) => o.rect.x;

function hits(bx, by, r) {
  return !(bx + BW <= r.x || by + BH <= r.y || bx >= r.x + r.w || by >= r.y + r.h);
}

export class BotSim {
  /**
   * @param {object} model  LevelModel (same object the scene built)
   * @param {object} flags  ability flags
   */
  constructor(model, flags) {
    this.model = model;
    this.level = model.level;
    this.flags = flags;
    this.sections = this.level.sections;
    this.ground = model.ground;
    this.platforms = model.platforms;
    this.walls = model.walls;
    this.l1Statics = model.statics.filter(s => OBSTACLE[s.type]);
    this.otherStatics = model.statics.filter(s => !OBSTACLE[s.type]);
    this.maxPlatformW = maxWidth(this.platforms);
    this.maxWallW = maxWidth(this.walls);
    this.maxStaticW = Math.max(maxWidth(this.l1Statics, s => s.rect.w), maxWidth(this.otherStatics, s => s.rect.w));
    this.breakables = model.breakables;
    this.maxBreakW = maxWidth(this.breakables, b => b.rect.w);
    this.movers = model.movers;
    this.steams = model.steams;
    this.finishRect = model.finish.rect;
    this.contact = { vy: 0, onGround: false, wallFace: false, updraft: 0, top: 0, landingInMs: null };
    // The controller's landing buffer: the same prediction the game makes (Player)
    this.cur = null;
    this.contact.landingInMs = (vx, maxMs, glide) => {
      const s = this.cur;
      return landingInMs(model, s.bx, s.by, BW, BH, s.vy, vx, maxMs, glide);
    };
    this.out = { vx: 0, vy: 0, gravityY: 0, allowGravity: true };
    this.ev = [];
    this.tmpRect = { x: 0, y: 0, w: 0, h: 0 };
    this.scriptZones = [];   // [{ start }] x where a botPlan stretch takes over (sim stops there: success)
  }

  sectionIndexAt(x) {
    const s = this.sections;
    for (let i = s.length - 1; i >= 0; i--) if (x >= s[i].startX) return i;
    return 0;
  }

  /** Sim state from the live scene (call before player.update in RunScene.update). */
  snapshot(scene) {
    const body = scene.player.body;
    const ws = scene.world.simState();
    return {
      bx: body.x,
      by: body.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
      gravityY: body.gravity.y,
      allowGravity: body.allowGravity,
      onGround: scene.player.onGround,
      speed: scene.speed,
      ctrl: scene.player.ctrl.clone(),
      movers: ws.movers,
      steams: ws.steams,
      breakables: ws.breakables,
      dead: false,
      cause: null,
      finished: false,
      handover: false,
      maxX: body.x,
    };
  }

  clone(s) {
    return {
      bx: s.bx,
      by: s.by,
      vx: s.vx,
      vy: s.vy,
      gravityY: s.gravityY,
      allowGravity: s.allowGravity,
      onGround: s.onGround,
      speed: s.speed,
      ctrl: s.ctrl.clone(),
      movers: s.movers.map(m => ({ ...m })),
      steams: s.steams.map(t => ({ ...t })),
      breakables: s.breakables.slice(),
      dead: s.dead,
      cause: s.cause,
      finished: s.finished,
      handover: s.handover,
      maxX: s.maxX,
    };
  }

  kill(s, cause) {
    s.dead = true;
    s.cause = cause;
    return s;
  }

  /** One frame. input = { pressed, held }. */
  step(s, input) {
    if (s.dead || s.finished) return s;
    const model = this.model;

    // ---- 1. RunScene.update ----
    const spriteX = s.bx + SPRITE_DX;
    for (const z of this.scriptZones) {
      if (spriteX >= z.start && spriteX < z.end) {
        s.handover = true;
        return s;
      }
    }
    // RunScene completes the level once Booker passes finishX (over the steak)
    if (spriteX >= this.level.finishX) {
      s.finished = true;
      return s;
    }
    const idx = this.sectionIndexAt(spriteX);
    const target = this.sections[idx].speed;
    s.speed += (target - s.speed) * (1 - Math.exp(-SPEED.LERP_RATE * DT / 1000));

    const c = this.contact;
    c.vy = s.vy;
    c.onGround = s.onGround;
    c.top = s.by;
    c.wallFace = model.walls.length ? wallFaceAt(model, s.bx, s.by, BW, BH) : false;
    c.updraft = model.updrafts.length ? updraftAt(model, s.bx, s.by, BW, BH) : 0;
    const ev = this.ev;
    ev.length = 0;
    this.cur = s;
    s.ctrl.update(DT, s.speed, input, c, this.out, ev);
    if (ev.length && ev.includes(CTRL_EV.STUCK)) return this.kill(s, 'wall');
    s.vx = this.out.vx;
    s.vy = this.out.vy;
    s.gravityY = this.out.gravityY;
    s.allowGravity = this.out.allowGravity;

    for (let i = 0; i < this.movers.length; i++) stepMover(this.movers[i], s.movers[i], DT, spriteX);
    for (let i = 0; i < this.steams.length; i++) stepSteam(this.steams[i], s.steams[i], DT, spriteX);

    if (s.by > G + WORLD.PIT_DEATH_DEPTH) return this.kill(s, 'pit');

    // ---- 2. Arcade world step ----
    s.onGround = false;
    const prevX = s.bx;
    const prevY = s.by;
    let vy = s.vy;
    if (s.allowGravity) vy += (JUMP.RISE_GRAVITY + s.gravityY) * DTS;
    if (vy > MAX_VY) vy = MAX_VY;
    else if (vy < -MAX_VY) vy = -MAX_VY;
    s.vy = vy;
    s.bx += s.vx * DTS;
    s.by += vy * DTS;
    const dx = s.bx - prevX;
    const dy = s.by - prevY;
    if (s.bx > s.maxX) s.maxX = s.bx;

    // ground (segments are sorted and disjoint)
    const g = this.ground;
    let gi = lowerBound(g, s.bx + BW, keyX) - 1;
    for (let k = 0; k < 2 && gi >= 0; k++, gi--) this.separate(s, g[gi], dx, dy, false);

    // L1 obstacles (cone, crate, pallets) and barrels
    if (this.l1Statics.length && this.overlapStatics(s, this.l1Statics)) return this.kill(s, 'obstacle');
    for (let i = 0; i < this.movers.length; i++) {
      const m = this.movers[i];
      if (m.kind !== 'barrel') continue;
      const ms = s.movers[i];
      if (Math.abs(ms.x - s.bx) > 64) continue;
      if (hits(s.bx, s.by, moverRect(m, ms, this.tmpRect))) return this.kill(s, 'obstacle');
    }

    if (hits(s.bx, s.by, this.finishRect)) {
      s.finished = true;
      return s;
    }

    // platforms (one-way) then walls
    if (this.platforms.length) this.separateList(s, this.platforms, this.maxPlatformW, dx, dy, true);
    if (this.walls.length) this.separateList(s, this.walls, this.maxWallW, dx, dy, false);

    // hazards: static, then scuttling/flying movers
    if (this.otherStatics.length) {
      const hit = this.overlapStatics(s, this.otherStatics);
      if (hit) return this.kill(s, hit);
    }
    for (let i = 0; i < this.movers.length; i++) {
      const m = this.movers[i];
      if (m.kind !== 'scuttle' && m.kind !== 'fly') continue;
      const ms = s.movers[i];
      if (!ms.alive || Math.abs(ms.x - s.bx) > 64) continue;
      if (hits(s.bx, s.by, moverRect(m, ms, this.tmpRect))) return this.kill(s, m.type);
    }

    // enemies: stomp from above with pounce, otherwise a hit
    for (let i = 0; i < this.movers.length; i++) {
      const m = this.movers[i];
      if (m.kind !== 'enemy') continue;
      const ms = s.movers[i];
      if (!ms.alive || Math.abs(ms.x - s.bx) > 64) continue;
      const r = moverRect(m, ms, this.tmpRect);
      if (!hits(s.bx, s.by, r)) continue;
      const falling = s.vy > 0 || prevY < s.by;
      const fromAbove = prevY + BH <= r.y + r.h / 2 + POUNCE.STOMP_TOLERANCE;
      if (this.flags.pounce && falling && fromAbove) {
        ms.alive = false;
        s.vy = s.ctrl.pounce(null);
        s.allowGravity = true;
      } else {
        return this.kill(s, m.type);
      }
    }

    // breakables: a dash smashes them
    if (this.breakables.length) {
      const list = this.breakables;
      let i = lowerBound(list, s.bx - this.maxBreakW, keyRectX);
      for (; i < list.length && list[i].rect.x < s.bx + BW; i++) {
        if (!s.breakables[i] || !hits(s.bx, s.by, list[i].rect)) continue;
        if (s.ctrl.dashMs > 0) s.breakables[i] = false;
        else return this.kill(s, list[i].type);
      }
    }

    // steam columns
    for (let i = 0; i < this.steams.length; i++) {
      const st = this.steams[i];
      if (Math.abs(st.x - s.bx) > 64) continue;
      if (hits(s.bx, s.by, st.rect) && steamPhase(st, s.steams[i]) === 'on') return this.kill(s, 'steam');
    }
    return s;
  }

  overlapStatics(s, list) {
    let i = lowerBound(list, s.bx - this.maxStaticW, keyRectX);
    for (; i < list.length && list[i].rect.x < s.bx + BW; i++) {
      if (hits(s.bx, s.by, list[i].rect)) return list[i].type;
    }
    return null;
  }

  separateList(s, list, maxW, dx, dy, oneWay) {
    let i = lowerBound(list, s.bx - maxW, keyX);
    for (; i < list.length && list[i].x < s.bx + BW; i++) this.separate(s, list[i], dx, dy, oneWay);
  }

  /** Arcade separation of the player body against one static rect. */
  separate(s, r, dx, dy, oneWay) {
    if (!hits(s.bx, s.by, r)) return;
    // Y first (gravity is vertical)
    if (dy > 0) {
      const ov = s.by + BH - r.y;
      if (ov <= Math.abs(dy) + BIAS) {
        s.by -= ov;
        s.vy = 0;
        s.onGround = true;
      }
    } else if (dy < 0 && !oneWay) {
      const ov = r.y + r.h - s.by;
      if (ov <= Math.abs(dy) + BIAS) {
        s.by += ov;
        s.vy = 0;
      }
    }
    if (oneWay || !hits(s.bx, s.by, r)) return;
    if (dx > 0) {
      const ov = s.bx + BW - r.x;
      if (ov <= Math.abs(dx) + BIAS) {
        s.bx -= ov;
        s.vx = 0;
      }
    } else if (dx < 0) {
      const ov = r.x + r.w - s.bx;
      if (ov <= Math.abs(dx) + BIAS) {
        s.bx += ov;
        s.vx = 0;
      }
    }
  }
}

export { SPRITE_DX };
