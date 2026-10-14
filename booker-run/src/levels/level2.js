// =============================================================================
// Level 2 — "The Docks". Harbor at dusk. New ability: double jump.
// Format: docs/level-format.md. Design notes: docs/levels/level2.md
//
// Rules used here (reach table: node scripts/reach-table.mjs):
//   - Gaps that need a double jump are wider than a full jump can clear
//     (full reach + 26 body) and leave 20+ px under the double-at-apex reach:
//     150-165 @160, 185 @210, 200-230 @240.
//   - Double-jump launch surfaces are <= 64 px high: 64 + 121.6 (double at the
//     apex) stays under the HUD ceiling (feet ~190), so a double is never clipped.
//   - Anything that needs a held jump starts >= 200 px after the previous
//     landing surface begins (gap end or container start), as in level1.js.
//   - Platform steps are +32..48 px (full jump 68.7 -> 20+ px margin).
//   - Crabs meet Booker ~100 px left of their x and never cross a pit on screen.
//   - Tire stacks (top 60) are easiest from an early take-off (~0.6 s of travel
//     before the stack) with the double at the apex; their bone trails show it.
//
// Timing: 2900/160 + 3900/185 + 4400/210 + 5200/240 = ~82 s (par is the default).
// =============================================================================

import { arc, row } from './_helpers.js';

const START_X = 100;
const FINISH_X = 16500;

export const LEVEL2 = {
  id: 'level2',
  name: 'The Docks',
  startX: START_X,
  finishX: FINISH_X,
  length: 16700,
  // Far layer: the sun (art x 276-354) drifts 251 px and ends 25 px from the left
  // edge, so it never splits across the screen edges (visual only)
  parallax: { far: 0.0153 },

  sections: [
    { name: 'Dock Edge',      startX: 0,     speed: 160 },
    { name: 'Container Yard', startX: 3000,  speed: 185 },
    { name: 'Crane Line',     startX: 6900,  speed: 210 },
    { name: 'Last Ship',      startX: 11300, speed: 240 },
  ],

  tips: [
    { x: 1250, text: 'Tap again in the air to double jump!' },
    { x: 2150, text: 'Double jump at the top of a jump to fly highest.' },
    { x: 3550, text: 'Containers are safe to land on.' },
    { x: 5550, text: 'Tall tire stack: double jump right at the top!' },
  ],

  obstacles: [],

  gaps: [
    // 1. Dock Edge
    { x: 850,   width: 56 },
    { x: 1650,  width: 150 },
    { x: 2350,  width: 165 },
    // 2. Container Yard
    { x: 3750,  width: 280 },
    { x: 4900,  width: 674 },
    { x: 6380,  width: 110 },
    // 3. Crane Line
    { x: 7450,  width: 185 },
    { x: 8300,  width: 1900 },
    { x: 11100, width: 100 },
    // 4. Last Ship
    { x: 11650, width: 200 },
    { x: 12200, width: 420 },
    { x: 13450, width: 130 },
    { x: 14150, width: 230 },
    { x: 14620, width: 56 },     // pier planks: tap, tap, tap
    { x: 15060, width: 64 },
    { x: 15650, width: 220 },
  ],

  platforms: [
    // 2. stepping stone, then stairs over the water
    { x: 3840, y: 24, w: 128 },
    { x: 4940, y: 32, w: 192 },
    { x: 5150, y: 64, w: 224 },
    // 3. the crane line
    { x: 8240, y: 16, w: 192 },
    { x: 8480, y: 48, w: 224 },
    { x: 8910, y: 56, w: 224 },
    { x: 9330, y: 24, w: 160 },
    { x: 9540, y: 64, w: 224 },
    { x: 9970, y: 40, w: 160 },
    // 4.
    { x: 12320, y: 40, w: 192 },
    { x: 12400, y: 88, w: 160 },   // upper container: a jump up for bones
  ],

  hazards: [
    // 1. Dock Edge
    { x: 560,   type: 'bollard' },
    { x: 1130,  type: 'tires' },
    { x: 2080,  type: 'bollard' },
    { x: 2740,  type: 'tires' },
    // 2. Container Yard
    { x: 3420,  type: 'crab' },
    { x: 4330,  type: 'tires' },
    { x: 4640,  type: 'crab' },
    { x: 5850,  type: 'tires' },
    { x: 5850,  type: 'tires', y: 30 },
    { x: 6150,  type: 'crab' },
    { x: 6680,  type: 'bollard' },
    // 3. Crane Line
    { x: 7150,  type: 'tires' },
    { x: 7900,  type: 'crab' },
    { x: 10560, type: 'crab' },
    { x: 10850, type: 'tires' },
    { x: 10850, type: 'tires', y: 30 },
    // 4. Last Ship
    { x: 12900, type: 'crab' },
    { x: 13150, type: 'tires' },
    { x: 13850, type: 'tires' },
    { x: 13850, type: 'tires', y: 30 },
    { x: 14840, type: 'bollard' },
    { x: 15350, type: 'crab' },
  ],

  bones: [
    // --- 1. Dock Edge ---
    ...row(300),
    { x: 880, h: 44 },                                  // hop the first puddle
    ...arc(1130, 82, 26, 10),                           // full jump over the tires
    // Double-jump trails: jump at the edge, press again at the top
    { x: 1682, h: 58 }, { x: 1715, h: 80 }, { x: 1745, h: 108 }, { x: 1775, h: 116 }, { x: 1805, h: 90 },
    { x: 2380, h: 58 }, { x: 2415, h: 82 }, { x: 2440, h: 108 }, { x: 2465, h: 125 }, { x: 2495, h: 100 },

    // --- 2. Container Yard ---
    { x: 3800, h: 70 }, { x: 3900, h: 36 }, { x: 3930, h: 36 }, { x: 4030, h: 84 },   // stepping stone
    { x: 4325, h: 82 },
    { x: 5040, h: 44 }, { x: 5070, h: 44 },                                   // container 1
    { x: 5240, h: 76 }, { x: 5270, h: 76 }, { x: 5300, h: 76 },               // container 2
    { x: 5420, h: 128 }, { x: 5500, h: 178 }, { x: 5570, h: 100 },            // leap (top bone: double at the apex)
    { x: 5780, h: 70 }, { x: 5820, h: 112 }, { x: 5880, h: 122 },             // tire stack: jump early
    { x: 6440, h: 60 },

    // --- 3. Crane Line ---
    { x: 7480, h: 58 }, { x: 7540, h: 82 }, { x: 7595, h: 118 }, { x: 7650, h: 75 },
    { x: 8560, h: 60 }, { x: 8600, h: 60 }, { x: 8640, h: 60 },               // B2
    { x: 8750, h: 112 }, { x: 8845, h: 168 }, { x: 8930, h: 80 },             // B2 -> B3 (crane hook bone)
    { x: 9020, h: 68 }, { x: 9060, h: 68 },                                   // B3
    { x: 9180, h: 112 }, { x: 9275, h: 175 }, { x: 9370, h: 60 },             // B3 -> B4 (crane hook bone)
    { x: 9640, h: 76 }, { x: 9680, h: 76 },                                   // B5
    { x: 9810, h: 126 }, { x: 10000, h: 90 },                                 // B5 -> B6
    { x: 10772, h: 70 }, { x: 10820, h: 112 }, { x: 10880, h: 122 },          // tire stack: jump early

    // --- 4. Last Ship ---
    { x: 11690, h: 58 }, { x: 11800, h: 116 }, { x: 11870, h: 92 },
    { x: 12450, h: 100 }, { x: 12480, h: 100 }, { x: 12510, h: 100 },         // upper container
    { x: 13760, h: 70 }, { x: 13820, h: 112 }, { x: 13880, h: 122 },          // tire stack: jump early
    { x: 14190, h: 58 }, { x: 14300, h: 116 }, { x: 14370, h: 92 },
    { x: 14648, h: 44 }, { x: 14840, h: 52 }, { x: 15092, h: 44 },           // pier planks
    { x: 15690, h: 58 }, { x: 15800, h: 116 }, { x: 15870, h: 92 },
    ...row(16100, 3, 30),
  ],
};
