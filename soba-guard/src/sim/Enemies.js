import { ENEMIES } from '../data/enemies.js';
import { ENEMY, GRID, HOUSE, MECHANIC } from '../core/Constants.js';
import { destroyUnit } from './Units.js';
import { triggerScooter } from './Scooters.js';

// Enemies: walk left along their row, stop and bite the first defender they
// reach, trigger the row's scooter at the porch, reach the door (lose).
// Mechanics (data/enemies.js `mechanic`):
//   lid  — `lid` HP soaks frontal damage (dumplings, embers, zoomies) first;
//          it breaks at 0 or Soba's bark knocks it off at once ('lidOff').
//   hop  — the first time it reaches a defender it hops over it (MECHANIC.HOP_S,
//          state 'hop'), lands behind it and walks/bites normally from then on.
// Any enemy can be stunned (stunLeft > 0): it neither moves nor bites.

export function createEnemy(battle, key, row) {
  const def = ENEMIES[key];
  const speedScale = 1 + battle.rng.range(-ENEMY.SPEED_JITTER, ENEMY.SPEED_JITTER);
  return {
    id: battle.newId(),
    key,
    row,
    x: ENEMY.SPAWN_X + battle.rng.range(0, ENEMY.SPAWN_X_JITTER),
    hp: def.hp,
    maxHp: def.hp,
    lid: def.lid || 0,
    lidMax: def.lid || 0,
    mechanic: def.mechanic,
    entered: false,           // its front has crossed into the garden
    hopped: false,
    hop: null,                // { from, to, t } while hopping
    stunLeft: 0,
    speed: def.speed * speedScale,
    bite: def.bite,
    points: def.points,
    wave: battle.waves.current,
    state: 'walk',
    target: 0,
    lastHit: -Infinity,
    alive: true,
  };
}

/** The defender this enemy is in reach of (rightmost one in its row), or null. */
function biteTarget(battle, e) {
  let best = null;
  for (const u of battle.units) {
    if (!u.alive || u.row !== e.row) continue;
    const d = e.x - u.x;
    if (d <= ENEMY.BITE_REACH && d >= -ENEMY.BITE_BEHIND && (!best || u.x > best.x)) best = u;
  }
  return best;
}

/** Knocks the lid off (bark) or reports it broke. */
export function removeLid(battle, e, cause) {
  if (e.lid <= 0 && cause !== 'broken') return false;
  e.lid = 0;
  battle.emit('lidOff', { enemy: e.id, row: e.row, x: e.x, cause });
  return true;
}

/**
 * Damage from the front (every attack in Level 1 is) goes into the lid first;
 * what is left over hits the body.
 */
export function damageEnemy(battle, e, amount, cause) {
  if (!e.alive) return;
  e.lastHit = battle.time;
  let body = amount;
  if (e.lid > 0) {
    const soaked = Math.min(e.lid, amount);
    e.lid -= soaked;
    body -= soaked;
    battle.emit('hit', { enemy: e.id, row: e.row, x: e.x, damage: soaked, cause, lid: true });
    if (e.lid <= 0) removeLid(battle, e, 'broken');
    if (body <= 0) return;
  }
  e.hp -= body;
  battle.emit('hit', { enemy: e.id, row: e.row, x: e.x, damage: body, cause });
  if (e.hp <= 0) killEnemy(battle, e, cause);
}

export function killEnemy(battle, e, cause) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  e.state = 'dead';
  battle.score += e.points;
  battle.kills += 1;
  battle.emit('kill', { enemy: e.id, key: e.key, row: e.row, x: e.x, points: e.points, cause });
  if (cause === 'scooter') battle.waves.onScooterKill(e);
  battle.onKill(e, cause);
}

/** Stuns (and pushes back) an enemy. Airborne crows are out of reach. */
export function stunEnemy(battle, e, seconds, push) {
  if (!e.alive || e.state === 'hop') return false;
  e.stunLeft = Math.max(e.stunLeft, seconds);
  e.x = Math.min(ENEMY.SPAWN_X, e.x + push);
  e.state = 'walk';
  e.target = 0;
  return true;
}

function startHop(battle, e, unit) {
  e.state = 'hop';
  e.hop = { from: e.x, to: unit.x - MECHANIC.HOP_LAND_DX, t: 0 };
  battle.emit('hop', { enemy: e.id, unit: unit.id, row: e.row, from: e.x, to: e.hop.to });
}

function updateHop(e, dt) {
  e.hop.t += dt;
  const k = Math.min(1, e.hop.t / MECHANIC.HOP_S);
  e.x = e.hop.from + (e.hop.to - e.hop.from) * k;
  if (k >= 1) {
    e.hop = null;
    e.hopped = true;
    e.state = 'walk';
  }
}

export function updateEnemies(battle, dt) {
  for (const e of battle.enemies) {
    if (!e.alive) continue;
    if (e.stunLeft > 0) {
      e.stunLeft = Math.max(0, e.stunLeft - dt);
      continue;
    }
    if (e.state === 'hop') {
      updateHop(e, dt);
      if (e.state === 'hop') continue;
    }
    if (e.state === 'bite') {
      const u = battle.unitById(e.target);
      if (!u || !u.alive) {
        e.state = 'walk';
        e.target = 0;
      } else {
        u.hp -= e.bite * dt;
        u.lastHit = battle.time;
        if (u.hp <= 0) {
          u.hp = 0;
          destroyUnit(battle, u, 'eaten');
          e.state = 'walk';
          e.target = 0;
        }
        continue;
      }
    }
    // walking
    const t = biteTarget(battle, e);
    if (t) {
      if (e.mechanic === 'hop' && !e.hopped) {
        startHop(battle, e, t);
        continue;
      }
      e.state = 'bite';
      e.target = t.id;
      battle.emit('bite', { enemy: e.id, unit: t.id, row: e.row });
      continue;
    }
    e.x -= e.speed * dt;
    const front = e.x - ENEMY.HALF_W;
    if (!e.entered && front <= GRID.RIGHT) {
      e.entered = true;
      battle.emit('enter', { enemy: e.id, key: e.key, row: e.row });
      battle.hint(e.key);
    }
    if (front <= GRID.X) triggerScooter(battle, e.row);
    if (front <= HOUSE.EDGE_X) {
      battle.emit('houseHit', { enemy: e.id, row: e.row });
      if (battle.god) {
        e.alive = false;
        e.state = 'dead';
      } else {
        battle.lose(e);
        return;
      }
    }
  }
}
