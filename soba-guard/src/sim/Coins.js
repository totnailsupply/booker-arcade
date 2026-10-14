import { ECONOMY, GRID } from '../core/Constants.js';
import { cellAt } from './Grid.js';

// Coins on the field: lantern coins drift down from the sky, Lucky Cats drop
// coins next to themselves. A coin blinks, then vanishes, unless collected.

export function spawnLanternCoin(battle) {
  const r = battle.rng;
  const rowsBottom = GRID.Y + battle.rows * GRID.TILE;
  const coin = {
    id: battle.newId(),
    source: 'lantern',
    x: Math.round(r.range(GRID.X + ECONOMY.LANTERN_MARGIN_X, GRID.RIGHT - ECONOMY.LANTERN_MARGIN_X)),
    y: ECONOMY.LANTERN_START_Y,
    targetY: Math.round(r.range(GRID.Y + ECONOMY.LANTERN_MARGIN_Y, rowsBottom - ECONOMY.LANTERN_MARGIN_Y)),
    value: ECONOMY.LANTERN_VALUE,
    landed: false,
    fetch: null,
    age: 0,
    alive: true,
  };
  battle.coinsField.push(coin);
  battle.emit('coinDrop', { coin: coin.id, source: coin.source, x: coin.x, y: coin.y, value: coin.value });
  battle.hint('coin');
}

export function spawnCatCoin(battle, unit, value) {
  const r = battle.rng;
  const side = r.float() < 0.5 ? -1 : 1;
  const coin = {
    id: battle.newId(),
    source: 'cat',
    fromX: unit.x,
    fromY: unit.y,
    x: unit.x + side * Math.round(r.range(ECONOMY.CAT_COIN_SPREAD_MIN, ECONOMY.CAT_COIN_SPREAD_MAX)),
    y: unit.y + ECONOMY.CAT_COIN_DROP_Y,
    targetY: unit.y + ECONOMY.CAT_COIN_DROP_Y,
    value,
    landed: true,
    fetch: null,
    age: 0,
    alive: true,
  };
  battle.coinsField.push(coin);
  battle.emit('coinDrop', { coin: coin.id, source: coin.source, x: coin.x, y: coin.y, value, unit: unit.id });
  battle.hint('coin');
}

export function updateCoins(battle, dt) {
  battle.lanternTimer -= dt;
  if (battle.lanternTimer <= 0) {
    battle.lanternTimer += ECONOMY.LANTERN_INTERVAL;
    spawnLanternCoin(battle);
  }
  for (const c of battle.coinsField) {
    if (!c.alive || c.fetch) continue;   // Soba.js flies fetched coins
    if (!c.landed) {
      c.y += ECONOMY.LANTERN_FALL_SPEED * dt;
      if (c.y >= c.targetY) {
        c.y = c.targetY;
        c.landed = true;
      }
      continue;
    }
    c.age += dt;
    if (c.age >= ECONOMY.COIN_LIFETIME) {
      c.alive = false;
      battle.emit('coinExpire', { coin: c.id, x: c.x, y: c.y });
    }
  }
}

export function collectCoin(battle, coin, by) {
  if (!coin || !coin.alive) return false;
  coin.alive = false;
  battle.coins += coin.value;
  battle.coinsCollected += coin.value;
  battle.emit('coinCollect', { coin: coin.id, x: coin.x, y: coin.y, value: coin.value, by, coins: battle.coins });
  return true;
}

/** The live coin nearest (x, y) within the pick radius, or null. */
export function coinAt(battle, x, y, radius = ECONOMY.COIN_PICK_RADIUS) {
  let best = null;
  let bestD = radius * radius;
  for (const c of battle.coinsField) {
    if (!c.alive) continue;
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Collects every coin inside the keyboard cursor's tile. */
export function collectInTile(battle, row, col) {
  for (const c of battle.coinsField) {
    if (!c.alive) continue;
    const cell = cellAt(c.x, c.y, battle.rows);
    if (cell && cell.row === row && cell.col === col) collectCoin(battle, c, 'cursor');
  }
}
