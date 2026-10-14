// Level 1: "Back Garden" (PLAN §4). 5 rows, 10 waves, flags at 5 and 10.
//
// Wave fields: enemies { key: count }, flag (big wave, warning first),
// spread (s the spawns are spread over; default WAVE.SPREAD / FLAG_SPREAD),
// rows (fixed rows for the first spawns of the wave, in spawn order; the rest
// are random), or groups: [{ at, enemies, spread }] for a wave that arrives in
// pushes (each push after the first emits a 'push' event).
//
// cards: the cards at the start (BattleConfig `cards` overrides them).
// unlocks: cards that join mid-level when wave afterWave + 1 starts.
// clearUnlocks: unit keys unlocked for later levels by clearing this one.
// hints: one-time toasts (id -> text); the sim decides when each one fires.

export const LEVEL1 = {
  id: 'level1',
  number: 1,
  name: 'Back Garden',
  rows: 5,
  startCoins: 100,
  cards: ['luckycat', 'steamer'],
  unlocks: [{ afterWave: 3, card: 'onigiri' }],
  clearUnlocks: ['chili'],
  hints: {
    cat: 'Place a Lucky Cat (1): cats make coins!',
    coin: 'Click coins to collect them. Soba fetches coins in her row.',
    soba: 'Tap the porch (or press F) to move Soba to a row.',
    steamer: 'A rat! Steamers (2) shoot dumplings down their row.',
    onigiri: 'New: Onigiri Wall (3) blocks critters for a long time.',
    lidrat: 'Pot-lid rat! Move Soba to its row and press B to bark the lid off!',
    crow: 'Crow! It hops over the first defender in its row.',
    zoomies: 'Zoomies ready! Press Z: Soba dashes down her row.',
    upgrade: 'Rich? Upgrade (U) a defender, or Recall (X) one for coins.',
  },
  waves: [
    // The first rat of waves 1 and 3 takes the middle row (Soba's row), so a
    // garden left empty loses that row's scooter and then the door by wave 4.
    { enemies: { rat: 1 }, rows: [2] },
    { enemies: { rat: 2 } },
    { enemies: { rat: 2 }, rows: [2] },
    { enemies: { rat: 2, lidrat: 1 } },
    { enemies: { rat: 5, lidrat: 1 }, flag: true },
    { enemies: { rat: 2, crow: 1 } },
    { enemies: { rat: 3, lidrat: 1 } },
    // Waves 8-10 are heavier than the PLAN table (balance: see progress.md)
    { enemies: { rat: 2, lidrat: 2, crow: 2 } },
    { enemies: { rat: 3, lidrat: 2, crow: 1 } },
    // Final wave: a big rush, then a last push once the first critters reach
    // the porch (so the scooters alone can't save an unguarded row)
    {
      flag: true,
      groups: [
        { at: 0, enemies: { rat: 6, lidrat: 3, crow: 2 }, spread: 8 },
        { at: 30, enemies: { rat: 5, lidrat: 2, crow: 2 }, spread: 6 },
      ],
    },
  ],
};
