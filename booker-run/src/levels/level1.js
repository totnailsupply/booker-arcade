// =============================================================================
// Level 1 — "The Yard". Authored, not random.
//
// Units: world pixels. Booker starts at x = START_X with his feet on the ground.
//   obstacles: { x, type }  x = centre of the sprite, sitting on the ground
//   gaps:      { x, width } x = left edge of the pit
//   bones:     { x, h }     h = height of the bone's centre above the ground
//   sections:  start x and target speed (px/s); speed lerps between them
//
// Reach numbers are derived in Constants.js (JUMP). Rules used here:
//   - single obstacles >= 200 px apart centre to centre (>= 220 at 230 px/s)
//   - pallets (need a held jump) sit >= 200 px after the end of a gap
//   - gaps <= 64 px at 200 px/s, <= 72 px at 230 px/s (full-jump reach 129 / 148)
//   - barrels activate ~400 px ahead and roll ~150 px left before passing
//     off-screen, so nothing else sits within 260 px to the left of a barrel
//
// Timing: 2700/150 + 3500/175 + 4400/200 + 5000/230 = 18 + 20 + 22 + 21.7
//   = ~82 s from start to steak.
// =============================================================================

// Three bones on an arc over an obstacle at x. The middle one sits at `top`.
function arc(x, top, spread = 28, drop = 12) {
  return [
    { x: x - spread, h: top - drop },
    { x, h: top },
    { x: x + spread, h: top - drop },
  ];
}

// A short row of bones at running height.
function row(x, count = 3, step = 22, h = 12) {
  return Array.from({ length: count }, (_, i) => ({ x: x + i * step, h }));
}

const START_X = 100;
const FINISH_X = 15600;

export const LEVEL1 = {
  id: 'level1',
  name: 'The Yard',
  startX: START_X,
  finishX: FINISH_X,        // steak centre
  length: 15800,            // world width; flat ground runs out past the steak

  sections: [
    { name: 'Warm-up',    startX: 0,     speed: 150 },
    { name: 'Stacks',     startX: 2700,  speed: 175 },
    { name: 'Gaps',       startX: 6200,  speed: 200 },
    { name: 'Final dash', startX: 10600, speed: 230 },
  ],

  obstacles: [
    // --- 1. Warm-up (150 px/s): single cones and crates, widely spaced ---
    { x: 600,  type: 'cone' },
    { x: 950,  type: 'crate' },
    { x: 1300, type: 'cone' },
    { x: 1600, type: 'cone' },
    { x: 1900, type: 'crate' },
    { x: 2150, type: 'cone' },
    { x: 2450, type: 'crate' },

    // --- 2. Stacks (175 px/s): pallet stacks need a held jump ---
    { x: 3000, type: 'pallets' },
    { x: 3350, type: 'cone' },
    { x: 3700, type: 'pallets' },
    { x: 4000, type: 'crate' },
    { x: 4250, type: 'crate' },
    { x: 4600, type: 'pallets' },
    { x: 4900, type: 'cone' },
    { x: 5200, type: 'pallets' },
    { x: 5500, type: 'crate' },
    { x: 5850, type: 'pallets' },

    // --- 3. Gaps (200 px/s): pits and rolling barrels ---
    { x: 6900,  type: 'barrel' },
    { x: 7250,  type: 'cone' },
    { x: 7900,  type: 'barrel' },
    { x: 8550,  type: 'crate' },
    { x: 8950,  type: 'barrel' },
    { x: 9600,  type: 'pallets' },
    { x: 10000, type: 'barrel' },

    // --- 4. Final dash (230 px/s): tight mixed patterns ---
    { x: 10900, type: 'crate' },
    { x: 11120, type: 'cone' },
    { x: 11450, type: 'pallets' },
    { x: 12050, type: 'crate' },
    { x: 12450, type: 'barrel' },
    { x: 12700, type: 'cone' },
    { x: 12920, type: 'crate' },
    { x: 13500, type: 'pallets' },
    { x: 13720, type: 'cone' },
    { x: 14100, type: 'barrel' },
    { x: 14400, type: 'crate' },
    { x: 14950, type: 'cone' },
    // 15000 -> 15600: flat run-out to the steak
  ],

  gaps: [
    // Section 3
    { x: 6500,  width: 48 },
    { x: 7500,  width: 56 },
    { x: 8250,  width: 64 },
    { x: 9300,  width: 64 },
    { x: 10300, width: 64 },
    // Section 4
    { x: 11750, width: 64 },
    { x: 13200, width: 72 },
    { x: 14650, width: 64 },
  ],

  bones: [
    // Section 1: rows on the ground, small arcs over crates
    ...row(420),
    ...arc(950, 44, 26, 8),
    ...row(1420),
    ...arc(1900, 44, 26, 8),
    ...row(2280),
    // Section 2: arcs over pallet stacks (full held jump peaks ~72 px)
    ...arc(3000, 82),
    ...arc(3700, 82),
    ...row(4400),
    ...arc(4600, 82),
    ...arc(5200, 82),
    ...arc(5850, 82),
    // Section 3: one bone over the middle of some pits, rows between
    { x: 6524, h: 44 },
    ...row(7050),
    { x: 7528, h: 44 },
    { x: 8282, h: 50 },
    ...row(9050),
    { x: 9332, h: 50 },
    ...arc(9600, 82),
    // Section 4
    ...arc(11450, 82),
    { x: 11782, h: 50 },
    ...row(12200),
    { x: 13236, h: 54 },
    ...arc(13500, 82),
    ...row(15100, 5, 30),
  ],
};
