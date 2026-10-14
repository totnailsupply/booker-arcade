import { SOBA, GRID, ENEMY } from '../core/Constants.js';
import { rowCenterY, cellAt } from './Grid.js';
import { damageEnemy, stunEnemy, removeLid } from './Enemies.js';
import { collectCoin } from './Coins.js';

// Soba, the hero on the porch (PLAN §4). She can't be hurt.
//   move     trots to another row at SOBA.MOVE_SPEED (abilities asked for on
//            the way fire when she arrives)
//   Fetch    landed coins in her row fly to her after SOBA.FETCH_DELAY
//   Bark     stuns every enemy in her row whose front is within
//            BARK_RANGE_TILES of the porch and pushes it back; knocks the lid
//            off every lid rat in the garden part of her row (BARK_LID_X)
//   Zoomies  needs ZOOMIES_KILLS kills; she dashes down her row and back,
//            ZOOMIES_DAMAGE to each enemy in the garden part of the row
//
// soba.state: 'idle' | 'run' (changing rows) | 'bark' | 'zoomies' | 'cheer' | 'sad'

export const BARK_RANGE_X = GRID.X + SOBA.BARK_RANGE_TILES * GRID.TILE;   // 272

export function createSoba(battle) {
  const row = Math.min(SOBA.START_ROW, battle.rows - 1);
  return {
    row,
    targetRow: row,
    x: SOBA.X,
    y: rowCenterY(row),
    state: 'idle',
    barkCooldown: 0,
    barkCooldownMax: Math.max(SOBA.BARK_MIN_COOLDOWN, SOBA.BARK_COOLDOWN - battle.mods.barkCooldownS),
    barkAnim: 0,
    zoomiesMeter: 0,
    zoomies: null,          // { t, hit: Set } while dashing
    pending: [],            // abilities waiting for her to arrive in her row
    lastBark: -Infinity,
    barks: 0,
    zoomiesUsed: 0,
  };
}

export function sobaMoving(s) {
  return Math.abs(s.y - rowCenterY(s.targetRow)) > 0.01;
}

export function sobaMove(battle, row) {
  const s = battle.soba;
  if (row < 0 || row >= battle.rows || battle.outcome) return false;
  if (s.targetRow === row) return false;
  s.targetRow = row;
  battle.emit('sobaMove', { from: s.row, to: row });
  return true;
}

export function barkReady(battle) {
  return battle.soba.barkCooldown <= 0;
}

export function zoomiesReady(battle) {
  return battle.soba.zoomiesMeter >= SOBA.ZOOMIES_KILLS && !battle.soba.zoomies;
}

/** Asks for a bark (now, or when she reaches her row). */
export function requestBark(battle) {
  const s = battle.soba;
  if (!barkReady(battle) || s.pending.includes('bark')) {
    battle.emit('abilityFail', { ability: 'bark', reason: 'cooldown', left: s.barkCooldown });
    return false;
  }
  if (sobaMoving(s) || s.zoomies) s.pending.push('bark');
  else doBark(battle);
  return true;
}

export function requestZoomies(battle) {
  const s = battle.soba;
  if (!zoomiesReady(battle) || s.pending.includes('zoomies')) {
    battle.emit('abilityFail', { ability: 'zoomies', reason: s.zoomies ? 'active' : 'meter', meter: s.zoomiesMeter });
    return false;
  }
  if (sobaMoving(s)) s.pending.push('zoomies');
  else startZoomies(battle);
  return true;
}

/** Enemies a bark from this row would stun right now. */
export function barkTargets(battle, row) {
  return battle.enemies.filter(e => e.alive && e.row === row && e.x - ENEMY.HALF_W <= BARK_RANGE_X);
}

/** Lid rats a bark from this row would knock the lid off right now. */
export function barkLidTargets(battle, row) {
  return battle.enemies.filter(e => e.alive && e.row === row && e.lid > 0 && e.state !== 'hop'
    && e.x - ENEMY.HALF_W <= SOBA.BARK_LID_X);
}

function doBark(battle) {
  const s = battle.soba;
  if (!barkReady(battle)) return;
  s.barkCooldown = s.barkCooldownMax;
  s.barkAnim = SOBA.BARK_ANIM_S;
  s.lastBark = battle.time;
  s.barks += 1;
  let stunned = 0;
  let lids = 0;
  for (const e of barkLidTargets(battle, s.row)) if (removeLid(battle, e, 'bark')) lids += 1;
  for (const e of barkTargets(battle, s.row)) if (stunEnemy(battle, e, SOBA.BARK_STUN, SOBA.BARK_PUSH)) stunned += 1;
  battle.emit('bark', { row: s.row, x: s.x, toX: BARK_RANGE_X, stunned, lids });
}

function startZoomies(battle) {
  const s = battle.soba;
  s.zoomiesMeter = 0;
  s.zoomies = { t: 0, hit: new Set() };
  s.zoomiesUsed += 1;
  battle.emit('zoomies', { row: s.row });
}

/** +1 meter per kill (the scene shows a hint when it fills). */
export function sobaOnKill(battle) {
  const s = battle.soba;
  if (s.zoomiesMeter >= SOBA.ZOOMIES_KILLS) return;
  s.zoomiesMeter += 1;
  if (s.zoomiesMeter >= SOBA.ZOOMIES_KILLS) {
    battle.emit('zoomiesReady', {});
    battle.hint('zoomies');
  }
}

function updateZoomies(battle, dt) {
  const s = battle.soba;
  const z = s.zoomies;
  z.t += dt;
  const half = SOBA.ZOOMIES_S / 2;
  const span = SOBA.ZOOMIES_END_X - SOBA.X;
  if (z.t < half) {
    s.x = SOBA.X + span * (z.t / half);
    for (const e of battle.enemies) {
      if (!e.alive || e.row !== s.row || z.hit.has(e.id)) continue;
      if (e.x - ENEMY.HALF_W <= s.x && e.x - ENEMY.HALF_W <= SOBA.ZOOMIES_END_X) {
        z.hit.add(e.id);
        damageEnemy(battle, e, SOBA.ZOOMIES_DAMAGE, 'zoomies');
      }
    }
  } else {
    s.x = SOBA.ZOOMIES_END_X - span * Math.min(1, (z.t - half) / half);
  }
  if (z.t >= SOBA.ZOOMIES_S) {
    s.x = SOBA.X;
    s.zoomies = null;
    battle.emit('zoomiesEnd', { row: s.row, hits: z.hit.size });
  }
}

function updateFetch(battle, dt) {
  const s = battle.soba;
  for (const c of battle.coinsField) {
    if (!c.alive) continue;
    if (c.fetch) {
      c.fetch.t += dt;
      if (c.fetch.t >= SOBA.FETCH_FLIGHT_S) collectCoin(battle, c, 'fetch');
      continue;
    }
    if (!c.landed || c.age < SOBA.FETCH_DELAY || sobaMoving(s)) continue;
    const cell = cellAt(c.x, c.y, battle.rows);
    if (cell && cell.row === s.row) {
      c.fetch = { t: 0, x0: c.x, y0: c.y };
      battle.emit('fetch', { coin: c.id, row: s.row });
    }
  }
}

export function updateSoba(battle, dt) {
  const s = battle.soba;
  s.barkCooldown = Math.max(0, s.barkCooldown - dt);
  s.barkAnim = Math.max(0, s.barkAnim - dt);
  if (s.zoomies) {
    updateZoomies(battle, dt);
  } else {
    const ty = rowCenterY(s.targetRow);
    const d = ty - s.y;
    const stepPx = SOBA.MOVE_SPEED * dt;
    if (Math.abs(d) <= stepPx) {
      s.y = ty;
    } else {
      s.y += Math.sign(d) * stepPx;
    }
    s.row = Math.max(0, Math.min(battle.rows - 1, Math.floor((s.y - GRID.Y) / GRID.TILE)));
    if (!sobaMoving(s)) {
      s.row = s.targetRow;
      while (s.pending.length && !s.zoomies) {
        const a = s.pending.shift();
        if (a === 'bark') doBark(battle);
        else if (a === 'zoomies' && zoomiesReady(battle)) startZoomies(battle);
      }
    }
  }
  updateFetch(battle, dt);
  if (s.zoomies) s.state = 'zoomies';
  else if (sobaMoving(s)) s.state = 'run';
  else if (s.barkAnim > 0) s.state = 'bark';
  else s.state = 'idle';
}
