// Kibble (XP), hearts, magnets and Golden Bones: drops, pickup-radius magnet,
// collection, XP curve (x world.xpMult from the Fast Learner kennel rank) and level-ups.

import { XP, PLAYER } from '../core/Constants.js';
import { hypot, pow15 } from './DetMath.js'; // engine-independent math (see DetMath.js)

export function xpForLevel(level) {
  return XP.BASE + XP.PER_LEVEL * (level - 1) + Math.floor(pow15(level)); // XP.POW = 1.5 (DetMath, engine-independent)
}

function kibbleSize(value) {
  if (value >= XP.KIBBLE_L) return 'L';
  if (value >= XP.KIBBLE_M) return 'M';
  return 'S';
}

export function dropKibble(world, x, y, value) {
  if (value <= 0) return;
  const list = world.pickups;
  if (list.length >= XP.MAX_PICKUPS) {
    // Too many on the lawn: fold the value into an existing kibble
    for (let tries = 0; tries < XP.MERGE_TRIES; tries++) {
      const k = list[world.rng.int(list.length)];
      if (k.kind === 'kibble') {
        k.value += value;
        k.size = kibbleSize(k.value);
        return;
      }
    }
  }
  list.push({
    id: world.nextId++, kind: 'kibble', x, y, value, size: kibbleSize(value),
    pulled: false, speed: 0, age: 0,
  });
}

export function dropPickup(world, kind, x, y) {
  world.pickups.push({ id: world.nextId++, kind, x, y, value: 0, size: null, pulled: false, speed: 0, age: 0 });
}

/** Every kibble (and Golden Bone) flies to Booker (wave end, magnet pickup, boss death). */
export function vacuumKibble(world) {
  for (const k of world.pickups) {
    if (k.kind !== 'kibble' && k.kind !== 'goldenBone') continue;
    k.pulled = true;
    k.speed = Math.max(k.speed, XP.KIBBLE_SPEED);
  }
}

export function addXp(world, value) {
  world.xp += value * world.xpMult;
  while (world.xp >= world.xpNext) {
    world.xp -= world.xpNext;
    world.level += 1;
    world.xpNext = xpForLevel(world.level);
    world.pendingLevels += 1;
    world.emit('levelUp', { level: world.level });
  }
}

export function updatePickups(world, dt) {
  const p = world.player;
  const radius = PLAYER.PICKUP_RADIUS * (1 + world.stats.pickup);
  const collect = PLAYER.COLLECT_RADIUS + p.r;
  const list = world.pickups;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    k.age += dt;
    let dx = p.x - k.x;
    let dy = p.y - k.y;
    const d = hypot(dx, dy);
    if (!k.pulled && d < radius) {
      k.pulled = true;
      k.speed = XP.KIBBLE_SPEED;
    }
    if (d < collect) {
      collectPickup(world, k);
      continue;
    }
    if (k.pulled && d > 0) {
      k.speed = Math.min(XP.KIBBLE_MAX_SPEED, k.speed + XP.KIBBLE_ACCEL * dt);
      const step = Math.min(d, k.speed * dt);
      k.x += (dx / d) * step;
      k.y += (dy / d) * step;
    }
    list[w++] = k;
  }
  list.length = w;
}

export function collectPickup(world, k) {
  const p = world.player;
  if (k.kind === 'kibble') {
    world.emit('pickup', { kind: 'kibble', size: k.size, value: k.value, x: k.x, y: k.y });
    addXp(world, k.value);
  } else if (k.kind === 'heart') {
    p.hp = Math.min(p.maxHp, p.hp + XP.HEART_HEAL);
    world.emit('pickup', { kind: 'heart', x: k.x, y: k.y });
  } else if (k.kind === 'magnet') {
    vacuumKibble(world);
    world.emit('pickup', { kind: 'magnet', x: k.x, y: k.y });
  } else if (k.kind === 'goldenBone') {
    world.goldenBones += 1;
    world.emit('pickup', { kind: 'goldenBone', x: k.x, y: k.y, total: world.goldenBones });
  }
}
