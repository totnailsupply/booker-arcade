// Enemy data (PLAN §4). hp, speed px/s, bite damage per second, points per kill.
// mechanic: 'walk' plain walker, 'lid' a pot lid (lid HP) soaks frontal damage
// until it breaks or Soba barks it off, 'hop' hops over the first defender it
// reaches (once), 'stone' / 'lane' are Level 2+ (data only, not in the sim yet).

export const ENEMIES = {
  rat: { key: 'rat', name: 'Alley Rat', hp: 200, speed: 12, bite: 25, points: 10, mechanic: 'walk' },
  lidrat: { key: 'lidrat', name: 'Pot-Lid Rat', hp: 200, lid: 300, speed: 12, bite: 25, points: 20, mechanic: 'lid' },
  crow: { key: 'crow', name: 'Crow', hp: 220, speed: 24, bite: 25, points: 15, mechanic: 'hop' },
  tanuki: { key: 'tanuki', name: 'Tanuki', hp: 500, speed: 9, bite: 40, points: 30, mechanic: 'stone' },
  fox: { key: 'fox', name: 'Fox', hp: 250, speed: 16, bite: 30, points: 25, mechanic: 'lane' },
};

/** Total HP an enemy brings (body + lid), for the wave-progress rule. */
export function enemyTotalHp(key) {
  const d = ENEMIES[key];
  return d.hp + (d.lid || 0);
}
