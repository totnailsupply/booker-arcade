import { SCOOTER } from '../core/Constants.js';
import { killEnemy } from './Enemies.js';

// One Delivery Scooter per row. The first enemy to reach the porch starts it;
// it drives the garden row once, flattening every enemy it meets, and is gone.

export function createScooters(rows) {
  return Array.from({ length: rows }, (_, row) => ({ row, state: 'ready', x: SCOOTER.X }));
}

export function triggerScooter(battle, row) {
  const s = battle.scooters[row];
  if (!s || s.state !== 'ready') return false;
  s.state = 'active';
  battle.scootersUsed += 1;
  battle.emit('scooter', { row });
  return true;
}

export function updateScooters(battle, dt) {
  for (const s of battle.scooters) {
    if (s.state !== 'active') continue;
    s.x += SCOOTER.SPEED * dt;
    for (const e of battle.enemies) {
      if (e.alive && e.row === s.row && e.x <= s.x + SCOOTER.HIT_AHEAD) killEnemy(battle, e, 'scooter');
    }
    if (s.x >= SCOOTER.END_X) {
      s.state = 'used';
      battle.emit('scooterGone', { row: s.row });
    }
  }
}
