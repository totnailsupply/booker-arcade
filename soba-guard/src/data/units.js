// Defender data (PLAN §4). Times in seconds, speeds in px/s.
// role: 'producer' drops coins, 'shooter' fires dumplings along its row,
// 'wall' only blocks, 'area' hits every enemy in a strip of tiles ahead.
// tier2: the in-level upgrade (cost is added to what the unit has cost so
// far; Recall refunds TIER.RECALL_REFUND of the total). null = no tier 2.

export const UNITS = {
  luckycat: {
    key: 'luckycat',
    name: 'Lucky Cat',
    cost: 50,
    recharge: 7.5,
    hp: 300,
    role: 'producer',
    produce: { first: 5, every: 14, value: 25 },     // PLAN: 9 s (balance, progress.md)
    tier2: { cost: 75, every: 10, label: 'Coins every 10 s' },  // PLAN: 6.5 s
  },
  steamer: {
    key: 'steamer',
    name: 'Dumpling Steamer',
    cost: 100,
    recharge: 7.5,
    hp: 300,
    role: 'shooter',
    shoot: { first: 0.6, every: 1.4, damage: 20, speed: 160 },
    tier2: { cost: 125, burst: 2, label: 'Two-dumpling burst' },
  },
  onigiri: {
    key: 'onigiri',
    name: 'Onigiri Wall',
    cost: 50,
    recharge: 25,
    hp: 1200,
    role: 'wall',
    damageFrames: 3,         // full, bitten, crumbling
    tier2: { cost: 75, hp: 2000, label: 'Nori wrap: 2000 HP, full heal' },
  },
  chili: {
    key: 'chili',
    name: 'Chili Lantern',
    cost: 150,
    recharge: 15,
    hp: 300,
    role: 'area',            // unlocked by clearing Level 1, used from Level 2
    area: { first: 1, cols: 3, damage: 40, every: 2 },
    tier2: null,
  },
};
