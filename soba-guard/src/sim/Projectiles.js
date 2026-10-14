import { PROJECTILE } from '../core/Constants.js';
import { damageEnemy } from './Enemies.js';

// Dumplings fly right along their row and hit the first live enemy they touch.

export function updateProjectiles(battle, dt) {
  for (const p of battle.projectiles) {
    if (!p.alive) continue;
    p.x += p.speed * dt;
    let hit = null;
    for (const e of battle.enemies) {
      if (!e.alive || e.row !== p.row) continue;
      if (Math.abs(e.x - p.x) <= PROJECTILE.HIT_HALF_W && (!hit || e.x < hit.x)) hit = e;
    }
    if (hit) {
      p.alive = false;
      damageEnemy(battle, hit, p.damage, 'dumpling');
    } else if (p.x > PROJECTILE.DESPAWN_X) {
      p.alive = false;
    }
  }
}
