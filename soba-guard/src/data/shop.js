// Treat Shop (PLAN §5): permanent upgrades bought with Golden Bones.
// Each item has 3 ranks; rank r costs costs[r] (5, 10, 15 bones).
// `stat` is the getModifiers() field it feeds and `perRank` how much each
// rank adds to it (BattleConfig's modifiers contract; all default 0):
//   startCoins        +coins at the start of a battle
//   barkCooldownS     seconds taken off Bark's cooldown
//   dumplingDamagePct +% dumpling damage
//   catRatePct        +% faster Lucky Cats (interval / (1 + N/100))
// icon: texture key + frame shown in the shop.

export const SHOP_MAX_RANK = 3;
export const SHOP_COSTS = [5, 10, 15];

export const SHOP_ITEMS = [
  {
    key: 'piggy',
    name: 'Piggy Bank',
    desc: '+25 starting coins per rank',
    stat: 'startCoins',
    perRank: 25,
    icon: { key: 'items', frame: 0 },
  },
  {
    key: 'bark',
    name: 'Loud Bark',
    desc: "Soba's Bark recharges 2 s faster per rank",
    stat: 'barkCooldownS',
    perRank: 2,
    icon: { key: 'soba', frame: 2 },
  },
  {
    key: 'steam',
    name: 'Hot Steam',
    desc: '+10% dumpling damage per rank',
    stat: 'dumplingDamagePct',
    perRank: 10,
    icon: { key: 'steamer', frame: 2 },
  },
  {
    key: 'paws',
    name: 'Lucky Paws',
    desc: 'Lucky Cats drop coins 8% faster per rank',
    stat: 'catRatePct',
    perRank: 8,
    icon: { key: 'luckycat', frame: 2 },
  },
];

export function getShopItem(key) {
  return SHOP_ITEMS.find(i => i.key === key) || null;
}

/** Bones for the next rank, or null when maxed. */
export function nextRankCost(rank) {
  return rank >= SHOP_MAX_RANK ? null : SHOP_COSTS[rank];
}
