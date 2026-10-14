// =============================================================================
// Level 4 — "The Factory". Factory interior at night. New ability: wall kick.
// Booker also has the double jump (L2) and the ear glide (L3).
// Format: docs/level-format.md. Design notes: docs/levels/level4.md.
//
// All x are absolute world px; heights are px above the ground.
// Wall x = left edge (the face Booker climbs); he clings when his sprite x
// reaches wall.x - 13. Walls and catwalks sit on the 32 px tile grid so the
// l4-wall / l4-platform art has no partial tile at the left edge.
//
// Measured with the game's own controller code (see docs/levels/level4.md):
//   full jump 68.7 px, double jump +56 (121.6 from the ground), a kick from a
//   sliding cling gains ~55 px, the cling slides at 45 px/s, and the soft
//   ceiling caps Booker's feet at ~190 px. So: gears only on tops <= 130 px,
//   lip steam columns stop near the ceiling, and every climb ends with room.
//
// Steam: a vent's clock starts when Booker is 480 px away. Ground vents with no
// wall in those 480 px meet Booker at a fixed phase, so their offsets are set
// to fire squarely on him (jump it) or stay squarely off (+/- 250-380 ms). Lip
// vents sit on a wall's top edge and are already firing when Booker first
// touches the face, so the move is cling, wait, climb (off windows 1.0-1.2 s).
// Boiler lip 2 fires across every arrival time that follows a wait at lip 1.
// =============================================================================

import { arc, row } from './_helpers.js';

/** Bones up a wall face (x = wall.x), at the given heights. */
function face(wallX, heights) {
  return heights.map(h => ({ x: wallX - 12, h }));
}

export const LEVEL4 = {
  id: 'level4',
  name: 'The Factory',
  startX: 100,
  finishX: 16600,
  length: 16800,
  // Far layer: the moon in the window (art x 203-225) drifts 178 px and ends 25 px
  // from the left edge, so it never splits across the screen edges (visual only)
  parallax: { far: 0.0108 },
  // The bot runs it in ~85.5 s; humans climb a little slower than the bot.
  parSeconds: 88,

  sections: [
    { name: 'Loading Bay', startX: 0,     speed: 175 },
    { name: 'Catwalks',    startX: 3400,  speed: 200 },
    { name: 'Boiler Room', startX: 7600,  speed: 225 },
    { name: 'Furnace',     startX: 11500, speed: 250 },
  ],

  tips: [
    { x: 640,  text: 'Hit a wall in the air, then tap to wall kick!' },
    { x: 1220, text: 'Keep tapping to climb tall walls!' },
    { x: 4760, text: 'Steam on top? Cling to the wall and wait!' },
    { x: 8450, text: 'Climb the boiler, then hold to glide!' },
  ],

  obstacles: [],

  walls: [
    // --- 1. Loading Bay (175): learn the kick ---
    { x: 896,  w: 96,  h: 84 },    // A: low; a double jump also clears it
    { x: 1408, w: 128, h: 140 },   // B: too tall for a double jump; bones up the face
    { x: 2400, w: 96,  h: 90 },    // C1: short climb, step 1
    { x: 2496, w: 128, h: 165 },   // C2: step 2

    // --- 2. Catwalks (200) ---
    { x: 3904, w: 64,  h: 130 },   // D: a catwalk runs on from its top
    { x: 5056, w: 128, h: 120 },   // E: steam at the lip
    { x: 6240, w: 96,  h: 160 },   // F: tall climb
    { x: 6688, w: 64,  h: 100 },   // G: jump up to the catwalk overhead (or glide under it)

    // --- 3. Boiler Room (225): the boiler tower ---
    { x: 8704,  w: 96,  h: 90 },   // boiler step 1
    { x: 8800,  w: 224, h: 170 },  // boiler step 2, top of the tower
    { x: 10112, w: 96,  h: 150 },  // H: saw gear at its foot
    { x: 10624, w: 64,  h: 80 },   // pillar 1 in the lava
    { x: 10816, w: 64,  h: 120 },  // pillar 2

    // --- 4. Furnace (250) ---
    { x: 11840, w: 64,  h: 120 },  // I: catwalk with a gear, then glide
    { x: 14240, w: 128, h: 110 },  // J: steam lip
    { x: 15616, w: 128, h: 170 },  // K: last climb, then the final glide
  ],

  platforms: [
    { x: 3968,  y: 130, w: 320 },  // catwalk off wall D
    { x: 5536,  y: 48,  w: 128 },  // stepping catwalk over a pit
    { x: 6784,  y: 140, w: 256 },  // catwalk overhead wall G
    { x: 8032,  y: 40,  w: 96 },   // staircase over lava
    { x: 8192,  y: 80,  w: 96 },
    { x: 11904, y: 120, w: 320 },  // catwalk off wall I
  ],

  gaps: [
    { x: 1820,  width: 64 },
    { x: 2900,  width: 140 },      // double jump
    { x: 3968,  width: 320 },      // under catwalk D
    { x: 5440,  width: 288 },      // stepping catwalk
    { x: 6752,  width: 352 },      // under catwalk G
    { x: 7350,  width: 190 },      // double jump
    { x: 7936,  width: 416 },      // staircase
    { x: 9024,  width: 576 },      // the furnace: glide off the tower
    { x: 10496, width: 448 },      // lava pillars
    { x: 11904, width: 512 },      // under catwalk I, then glide (or jump + double)
    { x: 15000, width: 220 },      // double jump
    { x: 15744, width: 416 },      // final glide off wall K
  ],

  hazards: [
    // 1
    { x: 560,  type: 'l4crate' },
    { x: 2120, type: 'l4crate' },
    // 2
    { x: 3620, type: 'l4crate' },
    { x: 4184, type: 'gear', y: 130 },                                            // on catwalk D
    { x: 4700, type: 'steam', h: 40, period: 1600, on: 900, offset: 1243 },      // first vent: fires as Booker arrives
    { x: 5072, type: 'steam', y: 120, h: 50, period: 2000, on: 800, offset: 0 }, // lip of wall E
    { x: 5900, type: 'l4crate' },
    // 3
    { x: 8718, type: 'steam', y: 90,  h: 48, period: 1800, on: 650, offset: 0 },   // boiler lip 1
    { x: 8814, type: 'steam', y: 170, h: 36, period: 1800, on: 800, offset: 1200 }, // boiler lip 2: fires as lip 1 stops
    { x: 10100, type: 'gear', y: 14 },                                            // saw at wall H's foot
    { x: 11200, type: 'l4crate' },
    // 4
    { x: 12112, type: 'gear', y: 120 },                                           // on catwalk I
    { x: 13450, type: 'steam', h: 44, period: 1500, on: 600, offset: 1378 },     // trio: on, off, on as Booker arrives
    { x: 13650, type: 'steam', h: 44, period: 1500, on: 600, offset: 628 },
    { x: 13850, type: 'steam', h: 44, period: 1500, on: 600, offset: 1378 },
    { x: 14254, type: 'steam', y: 110, h: 50, period: 1800, on: 700, offset: 190 }, // lip of wall J
    { x: 14700, type: 'l4crate' },
    { x: 15630, type: 'steam', y: 170, h: 36, period: 1600, on: 600, offset: 0 }, // lip of wall K
  ],

  bones: [
    // 1. Loading Bay (18)
    ...row(300),
    ...arc(560, 44, 26, 8),
    ...row(926, 2, 30, 96),                       // wall A top
    ...face(1408, [70, 105, 140]),                // trail up wall B
    ...row(1468, 2, 30, 152),
    { x: 1852, h: 52 },
    ...row(2440, 2, 30, 102),                     // step C1
    ...row(2550, 2, 30, 177),                     // step C2
    // 2. Catwalks (17)
    { x: 3620, h: 44 },
    ...row(3994, 3, 30, 142),                     // catwalk D
    ...arc(4184, 180, 26, 8),                     // over the catwalk gear
    ...arc(4700, 62, 26, 8),                      // over the first vent
    ...row(5126, 2, 30, 132),                     // wall E top
    { x: 5490, h: 70 }, { x: 5600, h: 62 }, { x: 5700, h: 70 },
    ...row(6850, 2, 40, 152),                     // catwalk G (the high road)
    // 3. Boiler Room (16)
    { x: 8080, h: 60 }, { x: 8240, h: 100 },      // staircase
    ...row(8742, 2, 30, 102),                     // boiler step 1
    ...row(8880, 3, 40, 182),                     // boiler top
    { x: 9140, h: 164 }, { x: 9260, h: 135 }, { x: 9380, h: 106 }, { x: 9500, h: 76 },   // glide line
    ...face(10112, [100, 135]),                   // above the saw
    { x: 10656, h: 92 }, { x: 10752, h: 140 }, { x: 10848, h: 132 },                     // pillars
    // 4. Furnace (22)
    ...row(11950, 2, 30, 132),                    // catwalk I
    { x: 12112, h: 160 },                         // over the catwalk gear
    { x: 12310, h: 112 }, { x: 12410, h: 92 },    // glide line (walk off the catwalk)
    { x: 13450, h: 64 }, { x: 13850, h: 64 },     // over the vents that fire
    ...row(14290, 2, 30, 122),                    // wall J top
    { x: 14700, h: 44 },
    ...arc(15110, 120, 40, 16),                   // double-jump pit
    ...face(15616, [90, 130, 170]),               // last climb
    { x: 15866, h: 165 }, { x: 15986, h: 139 }, { x: 16106, h: 113 },   // final glide line
    ...row(16300, 3, 40),
  ],
};
