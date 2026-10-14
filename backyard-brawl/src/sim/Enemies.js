// Enemies: spawn, behaviors (data in Constants.ENEMIES), soft separation,
// knockback, contact damage, damage + death (kibble drops, score, combo).
//
// Bosses live in world.enemies like everyone else (weapons target them the
// same way) and also in world.bosses. They are NOT in the SpatialHash (their
// big radius would blow up every query): queryEnemies() appends them.

import { ENEMIES, ENEMY, ARENA, XP, SCORE, CRIT_MULT, HOSTILE, BOSS } from '../core/Constants.js';
import { hurtPlayer } from './Player.js';
import { dropKibble, dropPickup } from './Pickups.js';
import { spawnHostile } from './Projectiles.js';
import { cos, exp, hypot, sin } from './DetMath.js'; // engine-independent math (see DetMath.js)

/** Largest hash-resident radius (elite raccoon). Bosses are handled separately. */
export const MAX_ENEMY_R = Math.max(...Object.values(ENEMIES).filter(d => !d.boss).map(d => d.r)) * ENEMY.ELITE_SIZE;

const TAU = Math.PI * 2;
const BX = ARENA.BORDER_X;
const BY = ARENA.BORDER_Y;

/**
 * Per-type movement: sets e.mvx / e.mvy (desired velocity, px/s).
 * (dx, dy) = unit vector to Booker, d = distance to Booker.
 */
const BEHAVIORS = {
  cat(world, e, dx, dy) {
    e.mvx = dx * e.speed;
    e.mvy = dy * e.speed;
  },

  squirrel(world, e, dx, dy) {
    const d = e.def;
    const side = sin(e.age * TAU * d.zigFreq + e.phase) * d.zigAmp;
    e.mvx = (dx - dy * side) * e.speed;
    e.mvy = (dy + dx * side) * e.speed;
  },

  // Circles Booker at hoverDist, shivers (windup), then swoops in a straight line.
  crow(world, e, dx, dy, d, dt) {
    const def = e.def;
    const p = world.player;
    e.stateT += dt;
    if (e.state === 'swoop') {
      e.mvx = e.dirX * def.swoopSpeed;
      e.mvy = e.dirY * def.swoopSpeed;
      if (e.stateT >= def.swoopS) setState(e, 'hover');
      return;
    }
    if (e.state === 'windup') {
      e.mvx = 0;
      e.mvy = 0;
      if (e.stateT >= def.windupS) {
        e.dirX = dx;
        e.dirY = dy;
        setState(e, 'swoop');
        world.emit('swoop', { id: e.id, x: e.x, y: e.y });
      }
      return;
    }
    // hover: fly to a point on a slowly turning circle around Booker
    e.phase += 0.7 * dt;
    const tx = p.x + cos(e.phase) * def.hoverDist;
    const ty = p.y + sin(e.phase) * def.hoverDist * 0.7;
    let hx = tx - e.x;
    let hy = ty - e.y;
    const hd = hypot(hx, hy) || 1;
    const sp = Math.min(e.speed, hd * 4);
    e.mvx = (hx / hd) * sp;
    e.mvy = (hy / hd) * sp;
    if (e.stateT >= e.hoverLimit && d < def.hoverDist * def.swoopFrom) {
      setState(e, 'windup');
      e.hoverLimit = def.hoverS + world.rng.range(0, 1);
      e.facing = dx >= 0 ? 1 : -1;
    }
  },

  raccoon(world, e, dx, dy) {
    e.mvx = dx * e.speed;
    e.mvy = dy * e.speed;
  },

  // Keeps ~keepDist from Booker and lobs stink clouds at his spot.
  skunk(world, e, dx, dy, d, dt) {
    const def = e.def;
    if (d < def.keepDist) {
      e.mvx = -dx * e.speed * 0.85;
      e.mvy = -dy * e.speed * 0.85;
    } else if (d > def.keepDist + def.keepBand) {
      e.mvx = dx * e.speed;
      e.mvy = dy * e.speed;
    } else {
      const s = sin(e.phase) >= 0 ? 1 : -1; // strafe
      e.mvx = -dy * e.speed * 0.5 * s;
      e.mvy = dx * e.speed * 0.5 * s;
    }
    e.cdA -= dt;
    if (e.cdA <= 0 && d < def.fireRange) {
      e.cdA = def.fireCd;
      const p = world.player;
      const st = HOSTILE.STINK;
      const flight = Math.min(st.maxFlightS, d / st.speed);
      spawnHostile(world, 'stink', e.x, e.y, dx * st.speed, dy * st.speed, st.r, st.dmg * e.dmgScale, flight + st.lingerS, flight);
      world.emit('enemyShot', { kind: 'stink', id: e.id, x: e.x, y: e.y, tx: p.x, ty: p.y });
      e.facing = dx >= 0 ? 1 : -1;
    }
    if (Math.abs(e.mvx) > 1) e.facing = dx >= 0 ? 1 : -1; // always faces Booker
  },

  kitten(world, e, dx, dy) {
    e.mvx = dx * e.speed;
    e.mvy = dy * e.speed;
  },

  // Big Tom: walk -> windup (telegraph line) -> charge -> recover + summon kittens.
  'boss-cat'(world, e, dx, dy, d, dt) {
    const def = e.def;
    e.stateT += dt;
    switch (e.state) {
      case 'windup':
        e.mvx = 0;
        e.mvy = 0;
        if (e.stateT >= def.windupS) {
          setState(e, 'charge');
          world.emit('bossCharge', { id: e.id, x: e.x, y: e.y, dx: e.dirX, dy: e.dirY });
        }
        break;
      case 'charge': {
        e.mvx = e.dirX * def.chargeSpeed;
        e.mvy = e.dirY * def.chargeSpeed;
        const m = e.r + 1;
        const hitWall = e.x <= BX + m || e.x >= ARENA.W - BX - m || e.y <= BY + m || e.y >= ARENA.H - BY - m;
        if (e.stateT >= def.chargeS || (hitWall && e.stateT > 0.1)) {
          setState(e, 'recover');
          summonKittens(world, e);
        }
        break;
      }
      case 'recover':
        e.mvx = 0;
        e.mvy = 0;
        if (e.stateT >= def.recoverS) setState(e, 'walk');
        break;
      default: // walk
        e.mvx = dx * e.speed;
        e.mvy = dy * e.speed;
        if (e.stateT >= def.walkS) {
          e.dirX = dx;
          e.dirY = dy;
          setState(e, 'windup');
          e.facing = dx >= 0 ? 1 : -1;
          world.emit('bossWindup', { id: e.id, x: e.x, y: e.y, dx, dy });
        }
    }
  },

  // Robo-Vac: bounces around the yard, dust-ball rings; phase 2 pulls Booker in.
  'boss-vac'(world, e, dx, dy, d, dt) {
    const def = e.def;
    if (!e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true;
      e.speed = def.phase2Speed;
      e.cdA = Math.min(e.cdA, 0.6);
      world.emit('bossPhase2', { id: e.id, x: e.x, y: e.y });
    }
    if (e.dirX === 0 && e.dirY === 0) {
      e.dirX = dx;
      e.dirY = dy;
    }
    // Bounce off the fence, re-aiming halfway toward Booker
    const m = e.r + 1;
    let bounced = false;
    if ((e.x <= BX + m && e.dirX < 0) || (e.x >= ARENA.W - BX - m && e.dirX > 0)) { e.dirX = -e.dirX; bounced = true; }
    if ((e.y <= BY + m && e.dirY < 0) || (e.y >= ARENA.H - BY - m && e.dirY > 0)) { e.dirY = -e.dirY; bounced = true; }
    if (bounced) {
      let nx = e.dirX + dx;
      let ny = e.dirY + dy;
      const l = hypot(nx, ny) || 1;
      e.dirX = nx / l;
      e.dirY = ny / l;
      world.emit('bossBounce', { id: e.id, x: e.x, y: e.y });
    }
    e.mvx = e.dirX * e.speed;
    e.mvy = e.dirY * e.speed;
    if (e.phase2 && d < def.pullRange && d > e.r) {
      world.pullX -= dx * def.pull;
      world.pullY -= dy * def.pull;
    }
    e.cdA -= dt;
    if (e.cdA <= 0) {
      const n = e.phase2 ? def.ring2Count : def.ringCount;
      e.cdA = e.phase2 ? def.ring2Cd : def.ringCd;
      e.ringOff += 0.37;
      const st = HOSTILE.DUST;
      for (let i = 0; i < n; i++) {
        const a = e.ringOff + (i / n) * TAU;
        const cx = cos(a);
        const cy = sin(a);
        spawnHostile(world, 'dust', e.x + cx * e.r * 0.8, e.y + cy * e.r * 0.8, cx * st.speed, cy * st.speed, st.r, st.dmg * e.dmgScale, st.life, 0);
      }
      world.emit('bossRing', { id: e.id, x: e.x, y: e.y, count: n });
    }
  },
};

function setState(e, s) {
  e.state = s;
  e.stateT = 0;
}

function summonKittens(world, boss) {
  const def = boss.def;
  let alive = 0;
  for (const e of world.enemies) if (e.type === 'kitten' && !e.dead) alive += 1;
  const n = Math.min(def.kittens, def.maxKittens - alive);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * TAU + world.rng.range(0, 0.6);
    spawnEnemy(world, 'kitten', boss.x + cos(a) * (boss.r + 8), boss.y + sin(a) * (boss.r + 8));
  }
  if (n > 0) world.emit('bossSummon', { id: boss.id, x: boss.x, y: boss.y, count: n });
}

export function spawnEnemy(world, type, x, y, elite = false) {
  const def = ENEMIES[type];
  const n = world.wave;
  let hpScale;
  if (def.boss) hpScale = 1 + BOSS.HP_PER_CYCLE * Math.max(0, Math.floor((n - def.homeWave) / 10));
  else hpScale = 1 + ENEMY.HP_PER_WAVE * (n - 1) + ENEMY.HP_QUAD * (n - 1) * (n - 1);
  const dmgScale = 1 + ENEMY.DMG_PER_WAVE * (n - 1);
  let hp = def.hp * hpScale;
  let r = def.r;
  let xp = def.xp;
  let points = def.points;
  if (elite) {
    hp *= ENEMY.ELITE_HP;
    r *= ENEMY.ELITE_SIZE;
    xp *= ENEMY.ELITE_XP;
    points *= ENEMY.ELITE_POINTS;
  }
  const e = {
    id: world.nextId++,
    type,
    def,
    x,
    y,
    r,
    hp,
    maxHp: hp,
    speed: def.speed,
    dmg: def.dmg * dmgScale,
    dmgScale,
    points,
    xp,
    elite,
    boss: !!def.boss,
    flying: !!def.flying,
    kbx: 0,
    kby: 0,
    mvx: 0,
    mvy: 0,
    phase: world.rng.range(0, TAU),
    age: 0,
    flash: 0,
    facing: x < world.player.x ? 1 : -1,
    state: def.boss ? 'walk' : 'hover',
    stateT: 0,
    hoverLimit: (def.hoverS || 0) + world.rng.range(0, 1),
    dirX: 0,
    dirY: 0,
    cdA: def.firstShot ? world.rng.range(def.firstShot[0], def.firstShot[1]) : (def.firstRing || 0),
    ringOff: 0,
    phase2: false,
    cdOrbit: 0,   // frisbee re-hit cooldown
    cdTrail: 0,   // zoomies re-hit cooldown
    dead: false,
  };
  world.enemies.push(e);
  if (e.boss) {
    world.bosses.push(e);
    world.emit('bossSpawn', { id: e.id, enemy: type, name: def.name, x, y, hp });
  }
  world.emit('spawn', { id: e.id, enemy: type, x, y, elite });
  return e;
}

/**
 * Enemies whose hit circle may touch the circle (x, y, r): hash cells + bosses.
 * Callers do the exact test with e.r. `out` is reused (no allocation).
 */
export function queryEnemies(world, x, y, r, out) {
  world.hash.query(x, y, r + MAX_ENEMY_R, out);
  const bs = world.bosses;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.dead) continue;
    const m = r + b.r;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < m * m) out.push(b);
  }
  return out;
}

export function updateEnemies(world, dt) {
  const p = world.player;
  const decay = exp(-ENEMY.KNOCKBACK_DECAY * dt);
  world.pullX = 0;
  world.pullY = 0;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    e.age += dt;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.cdOrbit > 0) e.cdOrbit -= dt;
    if (e.cdTrail > 0) e.cdTrail -= dt;
    let dx = p.x - e.x;
    let dy = p.y - e.y;
    const d = hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    (BEHAVIORS[e.type] || BEHAVIORS.cat)(world, e, dx, dy, d, dt);
    e.x += (e.mvx + e.kbx) * dt;
    e.y += (e.mvy + e.kby) * dt;
    e.kbx *= decay;
    e.kby *= decay;
    if (e.type !== 'skunk' && Math.abs(e.mvx) > 1) e.facing = e.mvx > 0 ? 1 : -1;
    const mx = BX + e.r;
    const my = BY + e.r;
    if (e.x < mx) e.x = mx; else if (e.x > ARENA.W - mx) e.x = ARENA.W - mx;
    if (e.y < my) e.y = my; else if (e.y > ARENA.H - my) e.y = ARENA.H - my;
  }

  // Soft separation: overlapping ground pairs push apart (each pair once, id order).
  // Crows fly over everyone.
  world.rebuildHash();
  const near = world.scratch;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.flying || e.boss) continue;
    world.hash.query(e.x, e.y, e.r + MAX_ENEMY_R, near);
    for (let j = 0; j < near.length; j++) {
      const o = near[j];
      if (o.id <= e.id || o.flying) continue;
      let ox = e.x - o.x;
      let oy = e.y - o.y;
      const min = e.r + o.r;
      const d2 = ox * ox + oy * oy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 0.001) {
        // Exactly stacked: split along a deterministic direction
        ox = cos(e.id);
        oy = sin(e.id);
        d = 1;
      } else {
        ox /= d;
        oy /= d;
      }
      const push = (min - d) * ENEMY.SEPARATION * 0.5;
      e.x += ox * push;
      e.y += oy * push;
      o.x -= ox * push;
      o.y -= oy * push;
    }
  }
  // Bosses shove small enemies out of the way (and are not moved themselves)
  const bs = world.bosses;
  for (let b = 0; b < bs.length; b++) {
    const boss = bs[b];
    if (boss.dead) continue;
    world.hash.query(boss.x, boss.y, boss.r + MAX_ENEMY_R, near);
    for (let j = 0; j < near.length; j++) {
      const o = near[j];
      if (o.flying) continue;
      const ox = o.x - boss.x;
      const oy = o.y - boss.y;
      const min = boss.r + o.r;
      const d2 = ox * ox + oy * oy;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * ENEMY.SEPARATION;
      o.x += (ox / d) * push;
      o.y += (oy / d) * push;
    }
  }
  world.rebuildHash();

  // Contact damage
  if (p.hp > 0) {
    queryEnemies(world, p.x, p.y, p.r, near);
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead) continue;
      const min = p.r + e.r;
      const ex = e.x - p.x;
      const ey = e.y - p.y;
      if (ex * ex + ey * ey < min * min) {
        if (hurtPlayer(world, e.dmg, e)) break;
      }
    }
  }
}

/**
 * Damage from a weapon. (kx, ky) = unit knockback direction. Rolls crits.
 * Returns the damage dealt.
 */
export function damageEnemy(world, e, baseDmg, kx = 0, ky = 0, weapon = null, kbMult = 1) {
  if (e.dead) return 0;
  let dmg = baseDmg;
  const crit = world.stats.crit > 0 && world.rng.chance(world.stats.crit);
  if (crit) dmg *= CRIT_MULT;
  e.hp -= dmg;
  e.flash = ENEMY.FLASH_S;
  const kb = ENEMY.KNOCKBACK * kbMult * (1 - (e.def.kbResist || 0));
  if (kb > 0) {
    e.kbx += kx * kb;
    e.kby += ky * kb;
  }
  world.emit('hit', { id: e.id, enemy: e.type, x: e.x, y: e.y, dmg: Math.round(dmg * 10) / 10, crit, weapon });
  if (e.hp <= 0) killEnemy(world, e, true);
  return dmg;
}

/** byPlayer = false for wave-end pops (XP only, no score / combo / kill count). */
export function killEnemy(world, e, byPlayer) {
  if (e.dead) return;
  e.dead = true;
  if (e.boss) {
    // Big XP shower + a guaranteed Golden Bone
    const chunks = Math.max(1, Math.round(e.xp / XP.KIBBLE_L));
    for (let i = 0; i < chunks; i++) {
      const a = (i / chunks) * TAU;
      dropKibble(world, e.x + cos(a) * 18, e.y + sin(a) * 14, e.xp / chunks);
    }
    dropPickup(world, 'goldenBone', e.x, e.y);
    world.bossesBeaten.push(e.type);
    world.bossDeadT = BOSS.DEATH_BEAT_S;
    world.emit('bossDeath', { id: e.id, enemy: e.type, name: e.def.name, x: e.x, y: e.y });
  } else {
    dropKibble(world, e.x, e.y, e.xp);
  }
  if (!byPlayer) {
    world.emit('pop', { id: e.id, enemy: e.type, x: e.x, y: e.y });
    return;
  }
  if (!e.boss) {
    if (world.rng.chance(ENEMY.GOLDEN_BONE_CHANCE)) dropPickup(world, 'goldenBone', e.x, e.y);
    else if (world.rng.chance(XP.HEART_CHANCE)) dropPickup(world, 'heart', e.x, e.y);
    else if (world.rng.chance(XP.MAGNET_CHANCE)) dropPickup(world, 'magnet', e.x, e.y);
  }
  world.kills += 1;
  const c = world.combo;
  c.count = c.timer > 0 ? c.count + 1 : 1;
  c.timer = SCORE.COMBO_WINDOW_S;
  c.mult = Math.min(SCORE.COMBO_CAP, 1 + SCORE.COMBO_STEP * (c.count - 1));
  c.best = Math.max(c.best, c.count);
  const pts = Math.round(e.points * c.mult);
  world.score += pts;
  world.emit('kill', { id: e.id, enemy: e.type, x: e.x, y: e.y, points: pts, combo: c.count, mult: c.mult, elite: e.elite, boss: e.boss });
}

/** Removes dead enemies in place (order kept, so the run stays deterministic). */
export function sweepDead(world) {
  const list = world.enemies;
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
  list.length = w;
  const bs = world.bosses;
  if (bs.length) {
    let k = 0;
    for (let i = 0; i < bs.length; i++) if (!bs[i].dead) bs[k++] = bs[i];
    bs.length = k;
  }
}
