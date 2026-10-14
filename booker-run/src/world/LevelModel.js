import {
  GAME, WORLD, PLAYER, JUMP, GLIDE, OBSTACLE, BARREL, HAZARD, MOVER, STEAM, ENEMY, BREAKABLE, PLATFORM, UPDRAFT, WALL, STEAK, FINISH,
} from '../core/Constants.js';

// =============================================================================
// LevelModel — a level's geometry and moving parts as plain data (no Phaser).
//
// RunScene builds its Phaser objects from these rects, and the bot's simulator
// (systems/BotSim.js) collides against the very same rects, so both agree to
// the pixel. Moving parts (crabs, pigeons, vacuums, drones, steam clocks) are
// stepped by the shared functions below in both places.
//
// All rects: { x, y, w, h } in world px, y down, ground top = WORLD.GROUND_Y.
// =============================================================================

const G = WORLD.GROUND_Y;

/** Hitbox of a sprite whose bottom-centre is at (cx, bottomY). */
export function hitRect(spec, cx, bottomY) {
  return {
    x: cx - spec.W / 2 + spec.HIT_X,
    y: bottomY - spec.H + spec.HIT_Y,
    w: spec.HIT_W,
    h: spec.HIT_H,
  };
}

export function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || a.y + a.h <= b.y || a.x >= b.x + b.w || a.y >= b.y + b.h);
}

const byX = (a, b) => a.x - b.x;

export function buildLevelModel(level) {
  const gaps = [...(level.gaps || [])].sort(byX);

  // Ground = level length minus gaps
  const segments = [];
  let gx = 0;
  for (const g of gaps) {
    if (g.x > gx) segments.push([gx, g.x]);
    gx = g.x + g.width;
  }
  // The last segment runs a screen past the level end: a jump or glide over the
  // finish lands on solid ground (RunScene completes the level once Booker passes finishX)
  if (gx < level.length) segments.push([gx, level.length + GAME.WIDTH]);

  const ground = segments.map(([x0, x1]) => ({ kind: 'ground', x: x0, y: G, w: x1 - x0, h: WORLD.TILE }));
  const platforms = (level.platforms || []).map(p => ({
    kind: 'platform', oneWay: true, x: p.x, y: G - p.y, w: p.w, h: PLATFORM.BODY_H, def: p,
  })).sort(byX);
  const walls = (level.walls || []).map(w => ({
    kind: 'wall', x: w.x, y: G - w.h, w: w.w, h: w.h + WORLD.TILE, top: G - w.h, def: w,
  })).sort(byX);
  const updrafts = (level.updrafts || []).map(u => ({
    x: u.x, y: G - u.h, w: u.w, h: u.h, strength: u.strength ?? UPDRAFT.DEFAULT_STRENGTH, def: u,
  })).sort(byX);

  // Static deadly rects: Level 1 obstacles (except rolling barrels) + static hazards
  const statics = [];
  const movers = [];
  for (const o of level.obstacles || []) {
    const spec = OBSTACLE[o.type];
    if (!spec) continue;
    if (o.type === 'barrel') {
      movers.push({ kind: 'barrel', type: 'barrel', spec, x0: o.x, base: G, def: o });
    } else {
      statics.push({ type: o.type, rect: hitRect(spec, o.x, G), def: o });
    }
  }
  const steams = [];
  for (const h of level.hazards || []) {
    const spec = HAZARD[h.type];
    if (!spec) continue;
    const base = G - (h.y || 0);
    if (spec.timed) {
      const colH = h.h ?? STEAM.HEIGHT;
      steams.push({
        x: h.x,
        base,
        h: colH,
        rect: { x: h.x - STEAM.HIT_W / 2, y: base - colH, w: STEAM.HIT_W, h: colH - spec.H / 2 },
        period: h.period ?? STEAM.PERIOD_MS,
        on: h.on ?? STEAM.ON_MS,
        offset: h.offset ?? STEAM.OFFSET_MS,
        def: h,
      });
    } else if (spec.move) {
      movers.push({ kind: spec.move, type: h.type, spec, x0: h.x, base: spec.move === 'fly' ? G - (h.y ?? 40) : base, def: h });
    } else {
      statics.push({ type: h.type, rect: hitRect(spec, h.x, base), def: h });
    }
  }
  for (const e of level.enemies || []) {
    const spec = ENEMY[e.type];
    if (!spec) continue;
    movers.push({
      kind: 'enemy',
      type: e.type,
      spec,
      x0: e.x,
      base: spec.fly ? G - (e.y ?? 40) : G - (e.y || 0),
      patrol: e.patrol || 0,
      def: e,
    });
  }
  const breakables = (level.breakables || []).map(b => {
    const spec = BREAKABLE[b.type];
    return spec ? { type: b.type, rect: hitRect(spec, b.x, G - (b.y || 0)), def: b } : null;
  }).filter(Boolean);

  statics.sort((a, b) => a.rect.x - b.rect.x);
  breakables.sort((a, b) => a.rect.x - b.rect.x);
  movers.sort((a, b) => a.x0 - b.x0);
  steams.sort(byX);
  movers.forEach((m, i) => { m.index = i; });
  steams.forEach((s, i) => { s.index = i; });
  breakables.forEach((b, i) => { b.index = i; });

  const fin = FINISH[level.finish || 'steak'] || FINISH.steak;
  const finishRect = {
    x: level.finishX - fin.W / 2 - STEAK.HIT_PAD,
    y: G - fin.H - STEAK.HIT_PAD,
    w: fin.W + STEAK.HIT_PAD * 2,
    h: fin.H + STEAK.HIT_PAD * 2,
  };

  // Solids in Arcade collider order: ground, platforms, walls
  const solids = [...ground, ...platforms, ...walls];

  return {
    level,
    gaps,
    segments,
    ground,
    platforms,
    walls,
    updrafts,
    statics,
    movers,
    steams,
    breakables,
    solids,
    finish: { key: fin.key, W: fin.W, H: fin.H, rect: finishRect },
  };
}

// --- debug spawn ---------------------------------------------------------------

/**
 * Debug starts (?x=, ?start=) can land inside a wall, over a pit or on a
 * hazard. Moves the spawn x (sprite centre) left until Booker's body, plus
 * PLAYER.SPAWN_CLEAR px of run-up ahead of it, stands fully on ground and
 * touches no wall, static hazard, L1 obstacle or breakable. Never below minX.
 */
export function safeSpawnX(model, x, minX) {
  const half = PLAYER.BODY_W / 2;
  const top = G - PLAYER.BODY_H;
  const blockers = [
    ...model.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
    ...model.statics.map(st => st.rect),
    ...model.breakables.map(b => b.rect),
  ];
  for (let guard = 0; guard < 100 && x > minX; guard++) {
    const left = x - half;
    const right = x + half + PLAYER.SPAWN_CLEAR;
    let back = Infinity;
    if (!model.segments.some(([a, b]) => left >= a && right <= b)) {
      for (const g of model.gaps) if (right > g.x && left < g.x + g.width) back = Math.min(back, g.x);
    }
    for (const r of blockers) {
      if (right > r.x && left < r.x + r.w && G > r.y && top < r.y + r.h) back = Math.min(back, r.x);
    }
    if (back === Infinity) break;
    x = back - half - PLAYER.SPAWN_CLEAR - 1;
  }
  return Math.max(minX, x);
}

// --- environment queries (game + sim) ----------------------------------------

/** True when a body's right edge touches a wall's left face with enough vertical overlap. */
export function wallFaceAt(model, bx, by, bw, bh) {
  const right = bx + bw;
  for (const w of model.walls) {
    if (w.x > right + WALL.FACE_TOLERANCE) break;
    if (Math.abs(w.x - right) > WALL.FACE_TOLERANCE) continue;
    const overlap = Math.min(by + bh, w.y + w.h) - Math.max(by, w.y);
    if (overlap >= WALL.MIN_FACE_OVERLAP) return true;
  }
  return false;
}

const LAND_STEP_MS = 1000 / 60;

function maxRectW(list) {
  let m = 0;
  for (const r of list) m = Math.max(m, r.w);
  return m;
}

/** First index in a list sorted by x whose x >= v. */
function firstAtOrAfter(list, v) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].x < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function topBetween(list, maxW, x, w, prevBottom, bottom) {
  for (let i = firstAtOrAfter(list, x - maxW); i < list.length && list[i].x < x + w; i++) {
    const r = list[i];
    if (r.x + r.w > x && r.y >= prevBottom - 0.001 && r.y <= bottom) return true;
  }
  return false;
}

/**
 * A falling body: ms until it lands on ground, a platform top or a wall top, or
 * Infinity if not within maxMs. Steps the same fixed 1/60 s integration as Arcade
 * and BotSim (fall gravity and max fall speed, or the glide's capped fall).
 * Enemies don't count: landing on one is a pounce, not a landing.
 * PlayerController's landing buffer (JUMP.LAND_BUFFER) uses it in the game and
 * in BotSim alike.
 */
export function landingInMs(model, bx, by, bw, bh, vy, vx, maxMs, glide = false) {
  if (!(vy > 0)) return Infinity;
  if (!model.maxW) {
    model.maxW = { ground: maxRectW(model.ground), platforms: maxRectW(model.platforms), walls: maxRectW(model.walls) };
  }
  const dts = LAND_STEP_MS / 1000;
  const g = JUMP.RISE_GRAVITY * JUMP.FALL_MULT;
  let x = bx;
  let y = by;
  let v = vy;
  for (let t = LAND_STEP_MS; t <= maxMs; t += LAND_STEP_MS) {
    v = glide ? Math.min(v, GLIDE.MAX_FALL) : Math.min(v + g * dts, JUMP.MAX_FALL_SPEED);
    const prev = y + bh;
    y += v * dts;
    x += vx * dts;
    const bottom = y + bh;
    if (topBetween(model.ground, model.maxW.ground, x, bw, prev, bottom)
      || topBetween(model.platforms, model.maxW.platforms, x, bw, prev, bottom)
      || topBetween(model.walls, model.maxW.walls, x, bw, prev, bottom)) return t;
  }
  return Infinity;
}

/** Updraft strength (px/s) at the body, 0 when outside every updraft. */
export function updraftAt(model, bx, by, bw, bh) {
  for (const u of model.updrafts) {
    if (u.x > bx + bw) break;
    if (bx < u.x + u.w && bx + bw > u.x && by < u.y + u.h && by + bh > u.y) return u.strength;
  }
  return 0;
}

// --- moving parts --------------------------------------------------------------

/** Fresh runtime state for every mover (order = model.movers). */
export function createMoverStates(model) {
  return model.movers.map(m => ({ x: m.x0, y: m.base, active: false, alive: true, t: 0, dir: -1, bob: 0 }));
}

export function cloneMoverStates(states) {
  return states.map(s => ({ ...s }));
}

function activateAhead(m) {
  if (m.kind === 'barrel') return BARREL.ACTIVATE_AHEAD;
  if (m.kind === 'enemy') return ENEMY.ACTIVATE_AHEAD;
  return MOVER[m.type].ACTIVATE_AHEAD;
}

/**
 * Advances one mover by dt ms. playerX = Booker's centre x. Barrels are moved
 * by Arcade in the game (same math); everything else is kinematic.
 */
export function stepMover(m, s, dt, playerX) {
  if (!s.alive) return;
  if (!s.active) {
    if (s.x - playerX < activateAhead(m)) s.active = true;
    else return;
  }
  const dts = dt / 1000;
  s.t += dt;
  if (m.kind === 'barrel') {
    s.x -= BARREL.ROLL_SPEED * dts;
  } else if (m.kind === 'scuttle' || m.kind === 'fly') {
    s.x -= MOVER[m.type].SPEED * dts;
  } else if (m.kind === 'enemy') {
    const spec = m.spec;
    if (m.patrol > 0) {
      s.x += s.dir * spec.SPEED * dts;
      const min = m.x0 - m.patrol;
      if (s.x <= min) { s.x = min; s.dir = 1; }
      if (s.x >= m.x0) { s.x = m.x0; s.dir = -1; }
    }
    if (spec.fly) s.bob = Math.sin((s.t / spec.BOB_MS) * Math.PI * 2) * spec.BOB_PX;
  }
}

/** Hitbox of a mover in its current state (writes into `out`). */
export function moverRect(m, s, out = {}) {
  const spec = m.spec;
  if (m.kind === 'fly' || (m.kind === 'enemy' && spec.fly)) {
    // base = centre y
    out.x = s.x - spec.W / 2 + spec.HIT_X;
    out.y = s.y + s.bob - spec.H / 2 + spec.HIT_Y;
  } else {
    out.x = s.x - spec.W / 2 + spec.HIT_X;
    out.y = s.y - spec.H + spec.HIT_Y;
  }
  out.w = spec.HIT_W;
  out.h = spec.HIT_H;
  return out;
}

/** Fresh steam clocks (order = model.steams). */
export function createSteamStates(model) {
  return model.steams.map(() => ({ active: false, clock: 0 }));
}

export function stepSteam(st, s, dt, playerX) {
  if (!s.active) {
    if (st.x - playerX < STEAM.ACTIVATE_AHEAD) s.active = true;
    else return;
  }
  s.clock += dt;
}

/** 'off' | 'windup' | 'on' */
export function steamPhase(st, s) {
  if (!s.active) return 'off';
  const p = ((s.clock + st.offset) % st.period + st.period) % st.period;
  if (p < st.on) return 'on';
  if (p >= st.period - STEAM.WINDUP_MS) return 'windup';
  return 'off';
}
