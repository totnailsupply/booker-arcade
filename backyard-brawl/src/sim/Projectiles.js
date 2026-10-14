// Projectiles.
//
// Player shots (world.projectiles): straight movers with lifetime and pierce
// (bark), ricochet balls (ball: on a hit, retarget the nearest unhit enemy
// near by), boomerang bones (bone: fly out, turn around, come back to Booker,
// pierce everything; hit list clears on the turn). Each shot hits a given
// enemy at most once per pass.
//
// Enemy shots (world.hostiles): stink clouds (fly to Booker's spot, then
// linger) and dust balls (straight). They only hurt Booker.

import { ARENA, WEAPONS, HOSTILE } from '../core/Constants.js';

const BONE = WEAPONS.bone;
import { damageEnemy, queryEnemies } from './Enemies.js';
import { hurtPlayer } from './Player.js';
import { hypot } from './DetMath.js'; // engine-independent math (see DetMath.js)

export function spawnProjectile(world, o) {
  const pr = {
    id: world.nextId++,
    kind: o.kind,
    x: o.x,
    y: o.y,
    vx: o.vx,
    vy: o.vy,
    speed: hypot(o.vx, o.vy),
    r: o.r,
    dmg: o.dmg,
    pierce: o.pierce || 0,
    bounces: o.bounces || 0,
    outT: o.outT || 0,          // bone: seconds before it turns around
    returning: false,
    life: o.life,
    age: 0,
    hits: [],
    dead: false,
  };
  world.projectiles.push(pr);
  return pr;
}

/** Nearest live enemy within `range` of (x, y) that `pr` hasn't hit yet. */
function nextBallTarget(world, pr, range) {
  let best = null;
  let bd = range * range;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr.hits.includes(e.id)) continue;
    const dx = e.x - pr.x;
    const dy = e.y - pr.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function updateProjectiles(world, dt) {
  const list = world.projectiles;
  const near = world.scratch;
  const p = world.player;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const pr = list[i];
    pr.age += dt;
    if (pr.kind === 'bone') {
      if (!pr.returning && pr.age >= pr.outT) {
        pr.returning = true;
        pr.hits.length = 0;
      }
      if (pr.returning) {
        const dx = p.x - pr.x;
        const dy = p.y - pr.y;
        const d = hypot(dx, dy);
        if (d < BONE.catchDist || pr.age > pr.outT * 4 + 1) continue; // caught (or lost: safety)
        const sp = pr.speed * BONE.returnSpeed;
        pr.vx = (dx / d) * sp;
        pr.vy = (dy / d) * sp;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
    } else {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.age >= pr.life || pr.x < -pr.r || pr.y < -pr.r || pr.x > ARENA.W + pr.r || pr.y > ARENA.H + pr.r) {
        continue;
      }
    }
    queryEnemies(world, pr.x, pr.y, pr.r, near);
    const sp = hypot(pr.vx, pr.vy) || 1;
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead || pr.hits.includes(e.id)) continue;
      const min = pr.r + e.r;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy >= min * min) continue;
      pr.hits.push(e.id);
      damageEnemy(world, e, pr.dmg, pr.vx / sp, pr.vy / sp, pr.kind);
      if (pr.kind === 'bone') continue; // pierces everything
      if (pr.kind === 'ball') {
        const next = pr.bounces > 0 ? nextBallTarget(world, pr, WEAPONS.ball.bounceRange) : null;
        if (!next) {
          pr.dead = true;
        } else {
          pr.bounces -= 1;
          const tx = next.x - pr.x;
          const ty = next.y - pr.y;
          const tl = hypot(tx, ty) || 1;
          pr.vx = (tx / tl) * pr.speed;
          pr.vy = (ty / tl) * pr.speed;
          pr.age = Math.min(pr.age, pr.life * 0.5); // a bounce refreshes the flight
          world.emit('bounce', { x: pr.x, y: pr.y });
        }
        break;
      }
      pr.pierce -= 1;
      if (pr.pierce < 0) {
        pr.dead = true;
        break;
      }
    }
    if (!pr.dead) list[w++] = pr;
  }
  list.length = w;
}

// --- Enemy projectiles ----------------------------------------------------------

/**
 * kind 'stink' | 'dust'. flight = seconds before it stops (stink lingers after);
 * 0 = never stops.
 */
export function spawnHostile(world, kind, x, y, vx, vy, r, dmg, life, flight) {
  const list = world.hostiles;
  if (list.length >= HOSTILE.MAX) return null;
  const h = { id: world.nextId++, kind, type: kind, x, y, vx, vy, r, dmg, life, flight, age: 0 };
  list.push(h);
  return h;
}

export function updateHostiles(world, dt) {
  const list = world.hostiles;
  const p = world.player;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    h.age += dt;
    if (h.age >= h.life) continue;
    if (h.flight === 0 || h.age < h.flight) {
      h.x += h.vx * dt;
      h.y += h.vy * dt;
    }
    if (h.x < -h.r || h.y < -h.r || h.x > ARENA.W + h.r || h.y > ARENA.H + h.r) continue;
    if (p.hp > 0) {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const min = p.r + h.r;
      if (dx * dx + dy * dy < min * min) {
        const landed = hurtPlayer(world, h.dmg, h);
        if (landed && h.kind === 'dust') continue; // dust balls pop on a hit
      }
    }
    list[w++] = h;
  }
  list.length = w;
}
