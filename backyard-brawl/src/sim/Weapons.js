// Weapons behind one interface. Numbers live in Constants.WEAPONS[key].levels
// (one row per level 1-5); behavior lives in WEAPON_BEHAVIORS[key]:
//
//   fire?(world, weapon, lv, mods) -> boolean
//     Called when the weapon's cooldown is up. Returns false when it had
//     nothing to do (no target in range): the weapon then retries next step
//     instead of starting its cooldown. Weapons without fire() have no cooldown.
//   update?(world, weapon, lv, mods, dt, active)
//     Optional per-step hook for persistent weapons (orbiting frisbees, paw
//     trail). Runs every step; active = false outside the 'playing' phase
//     (follow Booker, but deal no damage).
//
// mods = player stat modifiers already applied: { dmg, area, count }.
// Weapon state the renderer reads: weapon.discs (frisbee) and world.trail (zoomies).

import { WEAPONS, PLAYER } from '../core/Constants.js';
import { spawnProjectile } from './Projectiles.js';
import { damageEnemy, queryEnemies } from './Enemies.js';
import { atan2, cos, hypot, sin } from './DetMath.js'; // engine-independent math (see DetMath.js)

export const MAX_WEAPON_LEVEL = 5;
const TAU = Math.PI * 2;

/** Soft area scaling for radii that would get silly at +100 % area. */
const softArea = (area) => 1 + (area - 1) * 0.5;

function fan(count, spread, i) {
  return (i - (count - 1) / 2) * spread;
}

export const WEAPON_BEHAVIORS = {
  bark: {
    fire(world, w, lv, mods) {
      const def = WEAPONS.bark;
      const p = world.player;
      const target = world.nearestEnemy(p.x, p.y, def.range);
      if (!target) return false;
      const base = atan2(target.y - p.y, target.x - p.x);
      const count = mods.count;
      for (let i = 0; i < count; i++) {
        const a = base + fan(count, lv.spread, i);
        spawnProjectile(world, {
          kind: 'bark',
          x: p.x,
          y: p.y,
          vx: cos(a) * lv.speed,
          vy: sin(a) * lv.speed,
          r: lv.r * mods.area,
          dmg: lv.dmg * mods.dmg,
          pierce: lv.pierce,
          life: lv.life,
        });
      }
      world.emit('shot', { weapon: 'bark', x: p.x, y: p.y, angle: base, count });
      return true;
    },
  },

  ball: {
    fire(world, w, lv, mods) {
      const def = WEAPONS.ball;
      const p = world.player;
      const target = world.nearestEnemy(p.x, p.y, def.range);
      if (!target) return false;
      const base = atan2(target.y - p.y, target.x - p.x);
      const count = mods.count;
      for (let i = 0; i < count; i++) {
        const a = base + fan(count, 0.35, i);
        spawnProjectile(world, {
          kind: 'ball',
          x: p.x,
          y: p.y,
          vx: cos(a) * lv.speed,
          vy: sin(a) * lv.speed,
          r: lv.r * mods.area,
          dmg: lv.dmg * mods.dmg,
          bounces: lv.bounces,
          life: lv.life,
        });
      }
      world.emit('shot', { weapon: 'ball', x: p.x, y: p.y, angle: base, count });
      return true;
    },
  },

  bone: {
    fire(world, w, lv, mods) {
      const def = WEAPONS.bone;
      const p = world.player;
      const target = world.nearestEnemy(p.x, p.y, def.range);
      if (!target) return false;
      const base = atan2(target.y - p.y, target.x - p.x);
      const count = mods.count;
      for (let i = 0; i < count; i++) {
        const a = base + fan(count, 0.6, i);
        spawnProjectile(world, {
          kind: 'bone',
          x: p.x,
          y: p.y,
          vx: cos(a) * lv.speed,
          vy: sin(a) * lv.speed,
          r: lv.r * mods.area,
          dmg: lv.dmg * mods.dmg,
          outT: lv.dist / lv.speed,
          life: 99,
        });
      }
      world.emit('shot', { weapon: 'bone', x: p.x, y: p.y, angle: base, count });
      return true;
    },
  },

  frisbee: {
    update(world, w, lv, mods, dt, active) {
      const def = WEAPONS.frisbee;
      const p = world.player;
      const count = mods.count;
      if (!w.discs) w.discs = [];
      while (w.discs.length < count) w.discs.push({ x: p.x, y: p.y, r: lv.r, angle: 0 });
      w.discs.length = count;
      w.angle = ((w.angle || 0) + lv.spin * dt) % TAU;
      const orbit = lv.orbit * softArea(mods.area);
      const r = lv.r * mods.area;
      const dmg = lv.dmg * mods.dmg;
      const near = world.scratch;
      for (let i = 0; i < count; i++) {
        const d = w.discs[i];
        const a = w.angle + (i / count) * TAU;
        const cx = cos(a);
        const cy = sin(a);
        d.x = p.x + cx * orbit;
        d.y = p.y + cy * orbit;
        d.r = r;
        d.angle = a;
        if (!active) continue;
        queryEnemies(world, d.x, d.y, r, near);
        for (let j = 0; j < near.length; j++) {
          const e = near[j];
          if (e.dead || e.cdOrbit > 0) continue;
          const min = r + e.r;
          const ex = e.x - d.x;
          const ey = e.y - d.y;
          if (ex * ex + ey * ey >= min * min) continue;
          e.cdOrbit = def.hitCd;
          damageEnemy(world, e, dmg, cx, cy, 'frisbee');
        }
      }
    },
  },

  squeak: {
    fire(world, w, lv, mods) {
      const def = WEAPONS.squeak;
      const p = world.player;
      const R = lv.radius * softArea(mods.area);
      const near = queryEnemies(world, p.x, p.y, R, world.scratch);
      let any = false;
      for (let j = 0; j < near.length; j++) {
        const e = near[j];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const m = R + e.r;
        if (!e.dead && dx * dx + dy * dy < m * m) {
          any = true;
          break;
        }
      }
      if (!any) return false;
      // Extra Treats: +25 % damage per extra projectile
      const dmg = lv.dmg * mods.dmg * (1 + 0.25 * (mods.count - 1));
      // Copy: damageEnemy may kill (no hash changes), but keep the scan independent
      const hits = w.hitBuf || (w.hitBuf = []);
      hits.length = 0;
      for (let j = 0; j < near.length; j++) hits.push(near[j]);
      for (let j = 0; j < hits.length; j++) {
        const e = hits[j];
        if (e.dead) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const m = R + e.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 1;
        damageEnemy(world, e, dmg, dx / d, dy / d, 'squeak', def.knockback);
      }
      hits.length = 0;
      world.emit('squeak', { x: p.x, y: p.y, r: R });
      world.emit('shot', { weapon: 'squeak', x: p.x, y: p.y, angle: 0, count: 1 });
      return true;
    },
  },

  zoomies: {
    update(world, w, lv, mods, dt, active) {
      const def = WEAPONS.zoomies;
      const p = world.player;
      const trail = world.trail;
      // Age prints (they fade even during a break)
      let k = 0;
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        t.age += dt;
        if (t.age < t.life) trail[k++] = t;
        else world.trailPool.push(t);
      }
      trail.length = k;
      if (w.lastX === undefined) {
        w.lastX = p.x;
        w.lastY = p.y;
        w.dist = 0;
        w.side = 1;
      }
      const mx = p.x - w.lastX;
      const my = p.y - w.lastY;
      w.dist += hypot(mx, my);
      w.lastX = p.x;
      w.lastY = p.y;
      if (!active) return;
      const r = lv.r * mods.area * (1 + 0.15 * (mods.count - 1));
      if (w.dist >= def.gap) {
        w.dist = 0;
        w.side = -w.side;
        if (trail.length >= def.maxPrints) world.trailPool.push(trail.shift());
        const t = world.trailPool.pop() || {};
        const ang = atan2(my, mx);
        // Alternate left / right paws
        t.x = p.x - sin(ang) * 3 * w.side;
        t.y = p.y + 5 + cos(ang) * 3 * w.side;
        t.angle = ang;
        t.age = 0;
        t.life = lv.life;
        t.r = r;
        trail.push(t);
      }
      const dmg = lv.dmg * mods.dmg;
      const near = world.scratch;
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        queryEnemies(world, t.x, t.y, t.r, near);
        for (let j = 0; j < near.length; j++) {
          const e = near[j];
          if (e.dead || e.cdTrail > 0) continue; // crows swoop low enough to get stomped
          const min = t.r + e.r;
          const ex = e.x - t.x;
          const ey = e.y - t.y;
          if (ex * ex + ey * ey >= min * min) continue;
          e.cdTrail = def.tick;
          damageEnemy(world, e, dmg, 0, 0, 'zoomies', 0);
        }
      }
    },
  },
};

export function createWeapon(key) {
  return { key, level: 1, timer: 0.25 };
}

export function weaponLevelData(w) {
  const levels = WEAPONS[w.key].levels;
  return levels[Math.min(w.level, levels.length) - 1];
}

export function addWeapon(world, key) {
  if (!WEAPONS[key] || !WEAPON_BEHAVIORS[key]) return null;
  if (world.weapons.some(w => w.key === key)) return null;
  if (world.weapons.length >= PLAYER.MAX_WEAPONS) return null;
  const w = createWeapon(key);
  world.weapons.push(w);
  return w;
}

const MODS = { dmg: 1, area: 1, count: 1 };

export function updateWeapons(world, dt, active = true) {
  const s = world.stats;
  const rate = 1 + s.firerate;
  for (const w of world.weapons) {
    const beh = WEAPON_BEHAVIORS[w.key];
    const lv = weaponLevelData(w);
    MODS.dmg = 1 + s.damage;
    MODS.area = 1 + s.area;
    MODS.count = (lv.count || 1) + s.proj;
    if (beh.update) beh.update(world, w, lv, MODS, dt, active);
    if (!active || !beh.fire) continue;
    w.timer -= dt * rate;
    if (w.timer > 0) continue;
    if (beh.fire(world, w, lv, MODS)) w.timer += lv.cd;
    if (w.timer < 0) w.timer = 0;
  }
}

