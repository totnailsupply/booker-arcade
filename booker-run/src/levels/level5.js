// =============================================================================
// Level 5 — "Night Market". New ability: POUNCE (land on a robot from above:
// it pops, Booker bounces 77 px when the button is held, 41 px when not, and
// gets his double jump back). Booker also has double jump, glide and wall kick.
// Format guide: docs/level-format.md. Design notes: docs/levels/level5.md.
//
// Reach numbers used below (measured with the bot's frame-exact simulator):
//   tapped bounce off a vacuum lands ~86 / 98 / 109 / 121 px past the stomp
//   at 185 / 210 / 235 / 260 px/s, so vacuum "trains" are spaced a little
//   shorter than that (90 @210, 112 @260) and chain on their own.
//   Held bounce = glide into the robot while holding: 77 px up, then the
//   glide carries ~600-800 px. Drone ladders and chains are laid out on that
//   "keep holding" line (one drone every ~320 px @235, rising 25). The ladder
//   works for a held jump taken anywhere from x 10290 to 10370 (sewer edge 10350).
//   The soft ceiling (feet ~190) clips the last bounce by a few px; that's fine.
//   Double jump + glide reach (no pounce): 540 @185, 612 @210, 685 @235,
//   758 @260 — the S2 chain (640 px), the S3 sewer (1260 px) and the S4
//   chain (880 px) are wider, so they need at least one pounce.
// Drones hover with y = centre height and bob +-4 px: y = 22 always blocks
// the street (jump over or stomp), y >= 34 always lets Booker run underneath.
// =============================================================================

import { row } from './_helpers.js';

export const LEVEL5 = {
  id: 'level5',
  name: 'Night Market',
  startX: 100,
  finishX: 19300,
  length: 19500,
  // Section lengths / speeds = 86.8 s; each stomp adds a 40 ms hit-stop and the
  // shutters can cost a wall cling, so par allows ~1 s more.
  parSeconds: 88,

  sections: [
    { name: 'Stalls',         startX: 0,     speed: 185 },
    { name: 'Crowds',         startX: 4300,  speed: 210 },
    { name: 'Lantern Ladder', startX: 9000,  speed: 235 },
    { name: 'Neon Rush',      startX: 14100, speed: 260 },
  ],

  tips: [
    { x: 560,  text: 'Land on robots to pounce! Hold to bounce higher.' },
    { x: 1950, text: 'Drones too! A pounce gives back your double jump.' },
    { x: 5560, text: 'Too far to glide? Bounce off the drones!' },
    { x: 9950, text: 'Keep holding to chain pounces up the drones!' },
  ],

  obstacles: [],

  // Open manholes. x = left edge.
  gaps: [
    // S1 Stalls
    { x: 1494,  width: 48 },     // B: the vacuum on the lip bounces you over
    { x: 2200,  width: 160 },    // C: a drone hovers over it
    { x: 3880,  width: 80 },     // jump it and land on the vacuum beyond
    // S2 Crowds
    { x: 5300,  width: 150 },    // under the awning
    { x: 5800,  width: 640 },    // first must-pounce: two drone stepping stones
    { x: 8014,  width: 64 },     // vacuum on the lip
    { x: 8700,  width: 200 },    // drone in the middle
    // S3 Lantern Ladder
    { x: 10350, width: 1260 },   // the open sewer under the ladder
    { x: 13400, width: 120 },    // land on the vacuum beyond it
    { x: 13750, width: 200 },    // a patrolling drone hovers over it
    // S4 Neon Rush
    { x: 14588, width: 90 },     // the vacuum train's last bounce carries over it
    { x: 15520, width: 880 },    // two-drone chain
    { x: 16940, width: 180 },    // under the awning
    { x: 17650, width: 500 },    // drone stairs down
  ],

  // Striped stall awnings (one-way). Never directly above a cart.
  platforms: [
    { x: 2600,  y: 52,  w: 128 },
    { x: 5250,  y: 56,  w: 256 },
    { x: 11700, y: 150, w: 224 },   // the high awnings after the ladder...
    { x: 12120, y: 100, w: 160 },   // ...step down...
    { x: 12460, y: 52,  w: 160 },   // ...to the street
    { x: 16880, y: 60,  w: 288 },
  ],

  // Shutters (solid; wall kick climbs them)
  walls: [
    { x: 7290,  w: 64, h: 88 },
    { x: 15090, w: 64, h: 100 },
  ],

  enemies: [
    // --- S1 Stalls (185 px/s): teach the pounce ---
    { x: 820,   type: 'vacuum' },                 // A: lone vacuum, hop it or land on it
    { x: 1480,  type: 'vacuum' },                 // B: on the manhole lip
    { x: 2275,  type: 'drone', y: 40 },           // C: over the manhole
    { x: 2690,  type: 'vacuum' },                 // under the first awning
    { x: 3080,  type: 'vacuum', patrol: 70 },     // first patroller
    { x: 3650,  type: 'drone', y: 22 },           // low drone blocks the street
    { x: 4005,  type: 'vacuum' },                 // past the manhole
    // --- S2 Crowds (210) ---
    { x: 4800,  type: 'vacuum', patrol: 90 },     // between two carts
    { x: 5490,  type: 'vacuum', y: 56, patrol: 110 },   // on the awning
    { x: 5986,  type: 'drone', y: 34 },           // chain over the 640 px manhole
    { x: 6294,  type: 'drone', y: 54 },
    { x: 7150,  type: 'drone', y: 22 },           // bounce up onto the shutter
    { x: 7700,  type: 'vacuum', patrol: 80 },
    { x: 8000,  type: 'vacuum' },                 // on the lip
    { x: 8300,  type: 'vacuum' },                 // vacuum train
    { x: 8390,  type: 'vacuum' },
    { x: 8480,  type: 'vacuum' },
    { x: 8790,  type: 'drone', y: 40 },
    // --- S3 Lantern Ladder (235) ---
    { x: 9500,  type: 'vacuum', patrol: 120 },
    { x: 10498, type: 'drone', y: 50 },           // the ladder: keep holding
    { x: 10819, type: 'drone', y: 75 },
    { x: 11140, type: 'drone', y: 100 },
    { x: 11504, type: 'drone', y: 115 },
    { x: 12280, type: 'vacuum', patrol: 100 },    // on the street under the awnings
    { x: 12950, type: 'drone', y: 56 },           // hovers over a cart: stomp it or clear both
    { x: 13250, type: 'drone', y: 22 },
    { x: 13560, type: 'vacuum' },                 // land on it after the manhole
    { x: 13860, type: 'drone', y: 36, patrol: 60 },   // moving stepping stone
    // --- S4 Neon Rush (260) ---
    { x: 14350, type: 'vacuum' },                 // vacuum train
    { x: 14462, type: 'vacuum' },
    { x: 14574, type: 'vacuum' },
    { x: 14950, type: 'drone', y: 22 },           // bounce onto the shutter
    { x: 15727, type: 'drone', y: 40 },           // chain over the 880 px manhole
    { x: 16199, type: 'drone', y: 40 },
    { x: 17140, type: 'vacuum', y: 60, patrol: 120 },   // on the awning
    { x: 17400, type: 'drone', y: 56 },           // over a cart
    { x: 17750, type: 'drone', y: 80 },           // stairs down
    { x: 18000, type: 'drone', y: 50 },
    { x: 18620, type: 'vacuum', patrol: 100 },
  ],

  hazards: [
    // S1
    { x: 1150,  type: 'hydrant' },
    { x: 1800,  type: 'cart' },
    { x: 3380,  type: 'hydrant' },
    // S2
    { x: 4500,  type: 'cart' },
    { x: 5050,  type: 'cart' },
    // S3
    { x: 9250,  type: 'hydrant' },
    { x: 9750,  type: 'cart' },
    { x: 11880, type: 'hydrant' },               // street under the high awning
    { x: 12950, type: 'cart' },                  // under the drone
    // S4
    { x: 17400, type: 'cart' },                  // under the drone
    { x: 18400, type: 'hydrant' },
    { x: 18850, type: 'cart' },
  ],

  bones: [
    // S1 (19)
    ...row(300),
    { x: 764, h: 46 }, { x: 792, h: 34 }, { x: 852, h: 46 }, { x: 878, h: 52 },
    { x: 1520, h: 44 }, { x: 1548, h: 48 },
    { x: 2310, h: 130 }, { x: 2340, h: 136 },
    ...row(2620, 4, 28, 66),
    { x: 3650, h: 64 },
    { x: 4005, h: 30 }, ...row(4120, 2),
    // S2 (16)
    { x: 4500, h: 64 }, { x: 5050, h: 64 },
    ...row(5276, 3, 26, 70),
    { x: 6030, h: 112 }, { x: 6340, h: 128 },
    ...row(7306, 3, 20, 100),
    { x: 8345, h: 48 }, { x: 8435, h: 48 }, { x: 8525, h: 40 },
    { x: 8830, h: 128 },
    ...row(8940, 2),
    // S3 (20)
    { x: 9750, h: 64 },
    { x: 10572, h: 140 }, { x: 10898, h: 165 }, { x: 11220, h: 188 }, { x: 11570, h: 196 },
    ...row(11760, 4, 40, 162),
    ...row(12160, 2, 40, 112),
    ...row(12500, 2, 40, 64),
    { x: 13000, h: 104 },
    { x: 13250, h: 64 },
    { x: 13460, h: 80 },
    { x: 13850, h: 100 },
    ...row(14020),
    // S4 (20)
    { x: 14406, h: 50 }, { x: 14518, h: 50 }, { x: 14630, h: 44 },
    { x: 14650, h: 56 },
    ...row(15104, 3, 20, 112),
    { x: 15780, h: 130 }, { x: 16250, h: 130 },
    ...row(16910, 3, 40, 74),
    { x: 17450, h: 104 },
    { x: 17800, h: 150 }, { x: 18050, h: 120 },
    ...row(19000, 5, 30),
  ],
};
