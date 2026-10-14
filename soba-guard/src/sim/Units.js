import { UNITS } from '../data/units.js';
import { ENEMY, PROJECTILE, GRID, TIER } from '../core/Constants.js';
import { tileCenterX, rowCenterY } from './Grid.js';
import { spawnCatCoin } from './Coins.js';
import { damageEnemy } from './Enemies.js';

// Defenders: creation and per-step behaviour (producers drop coins, shooters
// fire dumplings while an enemy is ahead in their row, walls just block, area
// units hit every enemy in a strip ahead), tier-2 upgrades and Recall.

export function createUnit(battle, key, row, col) {
  const def = UNITS[key];
  const unit = {
    id: battle.newId(),
    key,
    row,
    col,
    x: tileCenterX(col),
    y: rowCenterY(row),
    hp: def.hp,
    maxHp: def.hp,
    tier: 1,
    paid: def.cost,
    timer: 0,
    burstLeft: 0,
    burstTimer: 0,
    lastAction: -Infinity,   // battle.time of the last coin/shot (view: action frame)
    lastHit: -Infinity,
    alive: true,
  };
  if (def.role === 'producer') unit.timer = def.produce.first;
  if (def.role === 'shooter') unit.timer = def.shoot.first;
  if (def.role === 'area') unit.timer = def.area.first;
  return unit;
}

/** Seconds between a producer's coins (tier 2 and the Lucky Paws modifier). */
export function produceEvery(battle, u) {
  const def = UNITS[u.key];
  const base = u.tier >= 2 && def.tier2?.every ? def.tier2.every : def.produce.every;
  return base / (1 + battle.mods.catRatePct / 100);
}

export function dumplingDamage(battle, u) {
  return UNITS[u.key].shoot.damage * (1 + battle.mods.dumplingDamagePct / 100);
}

/** Is a live enemy in this row, in view, at or right of x? */
export function enemyAhead(battle, row, x, maxX = ENEMY.FIRE_RANGE_X) {
  for (const e of battle.enemies) {
    if (!e.alive || e.row !== row) continue;
    if (e.x >= x - ENEMY.BITE_BEHIND && e.x <= maxX) return true;
  }
  return false;
}

function fireDumpling(battle, u) {
  const def = UNITS[u.key];
  u.lastAction = battle.time;
  const p = {
    id: battle.newId(),
    row: u.row,
    x: u.x + PROJECTILE.SPAWN_DX,
    damage: dumplingDamage(battle, u),
    speed: def.shoot.speed,
    from: u.id,
    alive: true,
  };
  battle.projectiles.push(p);
  battle.emit('shoot', { unit: u.id, row: u.row, x: p.x, projectile: p.id, tier: u.tier });
}

function areaBurst(battle, u, def) {
  const maxX = Math.min(ENEMY.FIRE_RANGE_X, u.x + GRID.TILE / 2 + def.area.cols * GRID.TILE);
  const hits = [];
  for (const e of battle.enemies) {
    if (e.alive && e.row === u.row && e.x >= u.x - ENEMY.BITE_BEHIND && e.x <= maxX) hits.push(e);
  }
  if (!hits.length) return false;
  u.lastAction = battle.time;
  battle.emit('ember', { unit: u.id, row: u.row, x: u.x, toX: maxX, hits: hits.length });
  for (const e of hits) damageEnemy(battle, e, def.area.damage, 'ember');
  return true;
}

export function updateUnits(battle, dt) {
  for (const u of battle.units) {
    if (!u.alive) continue;
    const def = UNITS[u.key];
    if (def.role === 'producer') {
      u.timer -= dt;
      if (u.timer <= 0) {
        u.timer += produceEvery(battle, u);
        u.lastAction = battle.time;
        spawnCatCoin(battle, u, def.produce.value);
      }
    } else if (def.role === 'shooter') {
      if (u.burstLeft > 0) {
        u.burstTimer -= dt;
        if (u.burstTimer <= 0) {
          u.burstLeft -= 1;
          u.burstTimer = TIER.BURST_GAP;
          fireDumpling(battle, u);
        }
      }
      u.timer = Math.max(0, u.timer - dt);
      if (u.timer <= 0 && enemyAhead(battle, u.row, u.x)) {
        u.timer = def.shoot.every;
        fireDumpling(battle, u);
        if (u.tier >= 2 && def.tier2?.burst > 1) {
          u.burstLeft = def.tier2.burst - 1;
          u.burstTimer = TIER.BURST_GAP;
        }
      }
    } else if (def.role === 'area') {
      u.timer = Math.max(0, u.timer - dt);
      if (u.timer <= 0 && areaBurst(battle, u, def)) u.timer = def.area.every;
    }
  }
}

/** Why an upgrade would fail ('' if it would succeed). */
export function canUpgrade(battle, u) {
  if (!u || !u.alive) return 'no_unit';
  const t2 = UNITS[u.key].tier2;
  if (!t2) return 'no_tier';
  if (u.tier >= 2) return 'max_tier';
  if (battle.coins < t2.cost) return 'coins';
  return '';
}

export function upgradeUnit(battle, u) {
  const why = canUpgrade(battle, u);
  if (why) {
    battle.emit('upgradeFail', { unit: u?.id ?? 0, row: u?.row, col: u?.col, reason: why });
    return false;
  }
  const t2 = UNITS[u.key].tier2;
  battle.coins -= t2.cost;
  u.paid += t2.cost;
  u.tier = 2;
  if (t2.hp) {
    u.maxHp = t2.hp;
    u.hp = t2.hp;           // the nori wrap is a full heal
  }
  battle.emit('upgrade', { unit: u.id, key: u.key, row: u.row, col: u.col, cost: t2.cost, coins: battle.coins });
  return true;
}

export function recallRefund(u) {
  return Math.floor(u.paid * TIER.RECALL_REFUND);
}

export function recallUnit(battle, u) {
  if (!u || !u.alive) {
    battle.emit('recallFail', { reason: 'no_unit' });
    return false;
  }
  const refund = recallRefund(u);
  battle.coins += refund;
  destroyUnit(battle, u, 'recall');
  battle.emit('recall', { unit: u.id, key: u.key, row: u.row, col: u.col, refund, coins: battle.coins });
  return true;
}

/** A defender ran out of HP (eaten) or was removed. */
export function destroyUnit(battle, unit, cause) {
  if (!unit.alive) return;
  unit.alive = false;
  battle.grid.clear(unit.row, unit.col);
  battle.unitsLost += cause === 'eaten' ? 1 : 0;
  battle.emit('unitLost', { unit: unit.id, key: unit.key, row: unit.row, col: unit.col, cause });
}
