// =============================================================================
// Level 6 — "Steakhouse Row". The finale. New ability: zoomies dash.
// Format: docs/level-format.md. Design notes and check results: docs/levels/level6.md.
//
// Booker has every ability: double jump, ear glide, wall kick, pounce, dash.
// Speeds 195 -> 225 -> 250 -> 280 px/s; ~90 s of game time.
//
// Dash rules this level is built on (Constants.js DASH, reach-table.mjs):
//   - A dash is the third press (jump, double, dash): 0.3 s at 2x speed, no
//     gravity, so it reaches 0.6 * speed px: 117 @195, 135 @225, 150 @250, 168 @280.
//   - Glide out-reaches a dash on any plain gap, so the dash is made necessary
//     with breakables, not distance: a 3-box stack (138 px) is taller than a
//     double jump (121.6), and a gate on a wall top of 140+ is locked under the
//     soft ceiling (feet never rise above ~190 px), so only a dash gets through.
//   - Only 3-stacks are used (a dash at any height smashes the top boxes, so
//     nothing is left floating), plus one gentle 2-stack that a double also clears.
//   - Every combo between two safe landings needs at most 3 presses (the bot
//     planner's depth), and wall tops are long enough to land on before the next
//     beat, so the planner never has to fall back.
// =============================================================================

import { arc, row } from './_helpers.js';

/** A stack of n boxes at x (46 px per box). n = 3 (138 px) is too tall for anything but a dash. */
const boxes = (x, n, y0 = 0) => Array.from({ length: n }, (_, i) => ({ x, type: 'boxes', y: y0 + i * 46 }));

/** Bones in a straight line from x0 to x1 at height h. */
const line = (x0, x1, h, step = 30) => {
  const out = [];
  for (let x = x0; x <= x1; x += step) out.push({ x, h });
  return out;
};

export const LEVEL6 = {
  id: 'level6',
  name: 'Steakhouse Row',
  startX: 100,
  finishX: 22200,           // a long, flat victory lap after the last stack
  length: 22500,
  finish: 'golden-steak',
  // Far layer: the moon (art x 333-362) drifts 307 px and ends 26 px from the left
  // edge, so it never splits across the screen edges (visual only)
  parallax: { far: 0.0139 },

  // startX is absolute world x (as in level1.js)
  sections: [
    { name: 'Back Alley', startX: 0, speed: 195 },
    { name: 'Kitchen Door', startX: 4100, speed: 225 },
    { name: 'Grill Line', startX: 8800, speed: 250 },
    { name: 'Golden Mile', startX: 15200, speed: 280 },
  ],

  tips: [
    { x: 760, text: 'Double jump, then tap again to DASH!' },
    { x: 2200, text: 'Too tall? DASH right through it!' },
    { x: 2850, text: 'Jump, double jump, DASH across!' },
  ],

  obstacles: [],

  gaps: [
    // S1
    { x: 3100, width: 260 },    // mega gap: a 3-stack waits on the far ledge
    { x: 3800, width: 110 },
    // S2
    { x: 4400, width: 170 },
    { x: 5000, width: 420 },    // stack at the edge, drones over the pit
    { x: 6188, width: 320 },    // off the wall top
    { x: 6860, width: 360 },    // grill ledge in the middle
    // S3
    { x: 9700, width: 650 },    // updraft pit
    { x: 10700, width: 560 },   // drone chain
    { x: 11500, width: 660 },   // grill ledge hop
    { x: 13176, width: 340 },   // off the stair-step walls
    // S4
    { x: 16650, width: 520 },   // drones
    // Finale
    { x: 18350, width: 240 },
    { x: 18900, width: 640 },   // updraft into the wall
    { x: 19988, width: 540 },   // after the gate: drones
  ],

  platforms: [
    { x: 6980, y: 48, w: 160 },
    { x: 11580, y: 40, w: 160 },
    { x: 11820, y: 80, w: 160 },
  ],

  walls: [
    { x: 5900, w: 288, h: 112 },
    { x: 12600, w: 288, h: 80 },
    { x: 12888, w: 288, h: 152 },
    { x: 19540, w: 448, h: 140 },
  ],

  updrafts: [
    { x: 9800, w: 128, h: 190 },
    { x: 10100, w: 128, h: 190 },
    { x: 19100, w: 160, h: 100 },
  ],

  enemies: [
    // S2
    { x: 5170, type: 'drone', y: 30 },
    { x: 5320, type: 'drone', y: 40 },
    { x: 7450, type: 'vacuum', patrol: 60 },
    // S3
    { x: 10860, type: 'drone', y: 30 },
    { x: 11020, type: 'drone', y: 60 },
    { x: 11180, type: 'drone', y: 40 },
    { x: 14040, type: 'vacuum' },
    { x: 14520, type: 'vacuum' },
    // S4
    { x: 15950, type: 'vacuum', patrol: 60 },
    { x: 16810, type: 'drone', y: 36 },
    { x: 17010, type: 'drone', y: 50 },
    // Finale
    { x: 20120, type: 'drone', y: 64 },   // a drone shelf under every fall line from the gate dash
    { x: 20165, type: 'drone', y: 64 },
    { x: 20210, type: 'drone', y: 64 },
  ],

  breakables: [
    // S1
    ...boxes(1300, 2),
    { x: 1800, type: 'gate' },
    ...boxes(2550, 3),          // too tall for a double jump: dash through
    ...boxes(3400, 3),          // on the mega gap's far ledge
    // S2
    ...boxes(4975, 3),
    ...boxes(7620, 3),
    // S3
    { x: 9250, type: 'gate' },
    { x: 13146, type: 'gate', y: 152 },   // on the wall top: the ceiling stops a jump over it
    ...boxes(13800, 3),
    ...boxes(14280, 3),
    ...boxes(14760, 3),
    // S4
    ...boxes(16300, 3),
    { x: 17450, type: 'gate' },
    // Finale
    { x: 19960, type: 'gate', y: 140 },
    ...boxes(20800, 3),
  ],

  hazards: [
    // S1
    { x: 650, type: 'trashcan' },
    { x: 2150, type: 'grill' },
    // S2
    { x: 4592, type: 'grill' },
    { x: 7000, type: 'grill', y: 48 },
    { x: 8000, type: 'grill' },
    { x: 8250, type: 'trashcan' },
    { x: 8500, type: 'grill' },
    // S3
    { x: 9000, type: 'trashcan' },
    { x: 9500, type: 'grill' },
    { x: 11600, type: 'grill', y: 40 },
    { x: 11840, type: 'grill', y: 80 },
    { x: 15050, type: 'trashcan' },
    // S4
    { x: 15600, type: 'grill' },
    { x: 17700, type: 'trashcan' },
    // Finale
    { x: 18050, type: 'trashcan' },
    { x: 18612, type: 'grill' },
  ],

  bones: [
    // --- S1 Back Alley (18) ---
    ...row(300),
    { x: 645, h: 78 },                                        // trash can
    { x: 1260, h: 96 }, { x: 1300, h: 120 }, { x: 1340, h: 104 },  // up and through the first stack
    ...arc(1800, 80, 26, 12),                                 // gate
    ...line(2530, 2610, 112, 40),                             // inside the 3-stack: dash line
    { x: 3170, h: 76 }, ...line(3340, 3420, 104, 40),         // mega gap: rise, then dash into the stack
    { x: 3855, h: 78 },
    // --- S2 Kitchen Door (18) ---
    { x: 4460, h: 78 }, { x: 4540, h: 66 }, { x: 4620, h: 46 },  // glide past the grill
    { x: 4990, h: 112 }, { x: 5050, h: 112 },                 // dash out of the stack
    { x: 5350, h: 92 },                                       // drone bounce
    { x: 5900, h: 131 }, { x: 6060, h: 123 },                 // wall corner, wall top
    { x: 6280, h: 186 }, { x: 6400, h: 164 },                 // glide off the wall
    { x: 7020, h: 124 }, { x: 7140, h: 100 },                 // over the ledge grill, hop off
    { x: 7450, h: 60 }, { x: 7590, h: 88 }, { x: 7650, h: 88 },  // vacuum bounce, dash through
    { x: 7980, h: 68 }, { x: 8240, h: 68 }, { x: 8480, h: 78 },
    // --- S3 Grill Line (21) ---
    { x: 9000, h: 102 }, { x: 9250, h: 102 }, { x: 9480, h: 102 },
    { x: 9900, h: 130 }, { x: 9980, h: 170 }, { x: 10180, h: 198 }, { x: 10280, h: 178 },  // ride the updrafts
    { x: 10940, h: 118 }, { x: 11240, h: 94 },                // drone bounces
    { x: 11600, h: 80 }, { x: 11840, h: 118 },                // over the ledge grills
    { x: 12620, h: 121 }, { x: 12800, h: 183 },               // up the stair-step walls
    { x: 13130, h: 200 }, { x: 13190, h: 200 },               // through the rooftop gate
    { x: 13840, h: 89 }, { x: 14050, h: 49 }, { x: 14320, h: 89 }, { x: 14530, h: 49 }, { x: 14740, h: 77 },  // box tunnel
    { x: 15050, h: 51 },
    // --- S4 Golden Mile (31) ---
    { x: 15580, h: 69 }, { x: 15890, h: 78 },
    { x: 16300, h: 111 }, { x: 16360, h: 111 },
    { x: 16810, h: 104 }, { x: 17080, h: 103 },
    { x: 17450, h: 80 }, { x: 17690, h: 52 },
    // Finale: jump, double, glide, kick, dash, pounce, dash
    { x: 18020, h: 79 },
    { x: 18440, h: 79 }, { x: 18580, h: 117 },
    { x: 19210, h: 110 }, { x: 19280, h: 136 }, { x: 19340, h: 138 },  // updraft
    { x: 19650, h: 151 },                                     // wall top
    { x: 19960, h: 200 }, { x: 20020, h: 200 }, { x: 20080, h: 200 },  // through the gate at the ceiling
    { x: 20180, h: 150 }, { x: 20280, h: 112 }, { x: 20420, h: 136 },  // drop, bounce, double
    { x: 20700, h: 80 }, { x: 20800, h: 112 }, { x: 20860, h: 112 },   // last stack
    // Victory lap to the Golden Steak
    ...arc(21300, 80, 30, 14),                                // jump for these
    ...row(21800, 4, 40),
  ],
};
