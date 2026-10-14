// Level-up cards. Data-driven: the pool is built from Constants.WEAPONS (new
// weapon / weapon level cards) and Constants.STATS (stat cards). New-weapon
// cards only offer world.allowedWeapons (unlocked) while a slot is free (max 4);
// owned weapons' level cards weigh XP.OWNED_WEAPON_WEIGHT.
//
// card = { id, kind: 'weapon' | 'newWeapon' | 'stat' | 'snack', key, level
//          (the level after picking), from (level now, 0 = new), rare, name, desc }

import { WEAPONS, WEAPON_DESC, STATS, XP, PLAYER } from '../core/Constants.js';
import { WEAPON_BEHAVIORS, MAX_WEAPON_LEVEL, addWeapon } from './Weapons.js';

export function emptyStats() {
  return { damage: 0, firerate: 0, speed: 0, pickup: 0, armor: 0, crit: 0, area: 0, proj: 0, regen: 0 };
}

function weaponCards(world) {
  const out = [];
  for (const key of Object.keys(WEAPONS)) {
    if (!WEAPON_BEHAVIORS[key]) continue;
    const owned = world.weapons.find(w => w.key === key);
    if (owned) {
      if (owned.level < MAX_WEAPON_LEVEL) {
        out.push({ kind: 'weapon', key, level: owned.level + 1, weight: XP.OWNED_WEAPON_WEIGHT });
      }
    } else if (world.weapons.length < PLAYER.MAX_WEAPONS && world.allowedWeapons.includes(key)) {
      out.push({ kind: 'newWeapon', key, level: 1, weight: XP.NEW_WEAPON_WEIGHT });
    }
  }
  return out;
}

function statCards(world) {
  const out = [];
  for (const [key, s] of Object.entries(STATS)) {
    const have = world.statLevels[key] || 0;
    if (have < s.max) out.push({ kind: 'stat', key, level: have + 1, weight: XP.STAT_WEIGHT });
  }
  return out;
}

function describe(card) {
  if (card.kind === 'weapon' || card.kind === 'newWeapon') {
    const w = WEAPONS[card.key];
    const lines = WEAPON_DESC[card.key] || [];
    return { name: w.name, desc: lines[card.level - 1] || w.desc };
  }
  if (card.kind === 'stat') {
    const s = STATS[card.key];
    // Rare = double value: "+20% area" -> "+40% area", "heal 3" -> "heal 6"
    const desc = card.rare
      ? s.desc.replace(/(\+|heal )(\d+(?:\.\d+)?)/g, (_m, pre, num) => `${pre}${Math.round(Number(num) * 200) / 100}`)
      : s.desc;
    return { name: s.name, desc };
  }
  return { name: 'Snack Break', desc: `Heal ${XP.HEART_HEAL} HP` };
}

/** Rolls `n` distinct cards with the world's RNG. */
export function rollCards(world, n = XP.CHOICES) {
  const pool = [...weaponCards(world), ...statCards(world)];
  const picks = [];
  while (picks.length < n && pool.length) {
    const c = world.rng.weighted(pool);
    pool.splice(pool.indexOf(c), 1);
    const card = { kind: c.kind, key: c.key, level: c.level, from: c.level - 1, rare: false };
    if (card.kind === 'stat' && world.rng.chance(XP.RARE_CHANCE)) card.rare = true;
    picks.push(card);
  }
  if (!picks.length) picks.push({ kind: 'snack', key: 'snack', level: 1, from: 0, rare: false });
  return picks.map((c, i) => ({ id: i, ...c, ...describe(c) }));
}

export function applyCard(world, card) {
  const p = world.player;
  if (card.kind === 'newWeapon') {
    addWeapon(world, card.key);
  } else if (card.kind === 'weapon') {
    const w = world.weapons.find(x => x.key === card.key);
    if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
  } else if (card.kind === 'stat') {
    const s = STATS[card.key];
    const v = s.per * (card.rare ? 2 : 1);
    world.statLevels[card.key] = (world.statLevels[card.key] || 0) + 1;
    if (card.key === 'heart') {
      p.maxHp += v;
      p.hp = Math.min(p.maxHp, p.hp + v);
    } else {
      world.stats[card.key] += v;
    }
  } else {
    p.hp = Math.min(p.maxHp, p.hp + XP.HEART_HEAL);
  }
  world.emit('card', { kind: card.kind, key: card.key, level: card.level, rare: card.rare });
}
