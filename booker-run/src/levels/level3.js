// =============================================================================
// Level 3 — "The Rooftops". City rooftops at blue twilight.
// New ability: ear glide (hold while falling: fall speed caps at 55 px/s;
// updraft vents lift a gliding Booker). Double jump carries over from Level 2.
// Format: docs/level-format.md. Design notes: docs/levels/level3.md.
// =============================================================================

import { row } from './_helpers.js';

/** n bones on a straight line from (x0, h0) to (x1, h1). A glide falls 55 px/s. */
function line(x0, h0, x1, h1, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return { x: Math.round(x0 + (x1 - x0) * t), h: Math.round(h0 + (h1 - h0) * t) };
  });
}

/**
 * A flock: pigeons stacked at the given centre heights, flying left together.
 * x = where Booker meets them (they start ~520*90/(speed+90) px further right).
 */
function flock(x, speed, heights) {
  const ax = Math.round(x + (520 * 90) / (speed + 90));
  return heights.map(y => ({ x: ax, type: 'pigeon', y }));
}

export const LEVEL3 = {
  id: 'level3',
  name: 'The Rooftops',
  startX: 100,
  finishX: 19000,
  length: 19200,
  // The far layer (sky, moon) drifts slowly, so the moon stays in view all
  // level and sits right behind Booker as he climbs the Moon Bridge (x ~14600).
  parallax: { far: 0.0057 },

  sections: [
    { name: 'Rooftops',     startX: 0,     speed: 170 },
    { name: 'Vents',        startX: 4200,  speed: 195 },
    { name: 'Pigeon Alley', startX: 9300,  speed: 220 },
    { name: 'Moonlight',    startX: 13500, speed: 250 },
  ],

  tips: [
    { x: 800,  text: 'Hold while falling to glide!' },
    { x: 2215, text: 'Glide into a vent to ride the updraft!' },
    { x: 4280, text: 'Double jump, then hold to glide!' },
    { x: 9480, text: 'Let go to drop under pigeons!' },
  ],

  obstacles: [],

  gaps: [
    // --- 1. Rooftops (170) ---
    { x: 650,   width: 90 },    // warm-up hop
    { x: 1150,  width: 240 },   // first glide: wider than a double jump
    { x: 1750,  width: 260 },   // second glide, AC unit on the landing
    { x: 2450,  width: 420 },   // first vent, in the chasm
    { x: 3350,  width: 650 },   // vent at the lip lifts Booker onto a raised deck
    // --- 2. Vents (195) ---
    { x: 4600,  width: 460 },   // jump, double, glide
    { x: 5600,  width: 700 },   // two-vent chain, antenna past the landing
    { x: 7000,  width: 920 },   // plank stepping stone
    { x: 8400,  width: 700 },   // vent onto a deck with an AC unit
    // --- 3. Pigeon Alley (220) ---
    { x: 9600,  width: 300 },   // vent, then a flock over the far roof: drop under it
    { x: 11200, width: 1000 },  // vent, flock, vent: ride the first vent high over the flock
    { x: 12600, width: 360 },   // antenna punishes an over-glide
    // --- 4. Moonlight (250) ---
    { x: 13800, width: 400 },
    { x: 14500, width: 1600 },  // the Moon Bridge: five vents
    { x: 16800, width: 600 },   // plank under a flock: stay low
    { x: 17900, width: 480 },   // double + glide; antenna on the landing
  ],

  platforms: [
    { x: 3520,  y: 140, w: 288 },   // raised deck (a double jump peaks at 122)
    { x: 7130,  y: 40,  w: 256 },   // stepping plank
    { x: 8580,  y: 140, w: 384 },   // deck with an AC unit
    { x: 16900, y: 56,  w: 192 },
  ],

  updrafts: [
    { x: 2510,  w: 80,  h: 120 },
    { x: 3360,  w: 112, h: 150 },
    { x: 5610,  w: 96,  h: 120 },
    { x: 5960,  w: 96,  h: 130 },
    { x: 8410,  w: 112, h: 150 },
    { x: 9650,  w: 112, h: 120 },
    { x: 11240, w: 144, h: 160 },
    { x: 11720, w: 112, h: 150 },
    // Moon Bridge
    { x: 14540, w: 112, h: 110 },
    { x: 14840, w: 112, h: 140 },
    { x: 15140, w: 112, h: 170 },
    { x: 15440, w: 112, h: 140 },
    { x: 15740, w: 112, h: 110 },
  ],

  hazards: [
    { x: 2170,  type: 'acunit' },
    { x: 5504,  type: 'pigeon', y: 16 },
    { x: 6660,  type: 'antenna' },
    { x: 8880,  type: 'acunit', y: 140 },
    ...flock(10060, 220, [44, 62, 80, 98]),
    { x: 10601, type: 'pigeon', y: 16 },   // hop it...
    { x: 10871, type: 'pigeon', y: 40 },   // ...but run under this one
    ...flock(11530, 220, [76, 94]),        // in the dip between the vents: ride high
    { x: 13160, type: 'antenna' },
    ...flock(17000, 250, [110, 128]),
    { x: 18560, type: 'antenna' },
  ],

  // Bones follow one route a player can fly in a single run (3 stars): the
  // path of a held glide from the lip, landing early before antennas, under the
  // first flock, high over the vent flock and along the Moon Bridge.
  bones: [
    // --- 1. Rooftops (22) ---
    ...row(300),
    { x: 680, h: 72 }, { x: 705, h: 79 }, { x: 730, h: 55 },                       // warm-up hop
    ...line(1200, 77, 1350, 29, 4),                                                 // first glide
    { x: 1800, h: 80 }, { x: 1900, h: 50 },
    { x: 2190, h: 79 },                                                             // over the AC unit
    { x: 2565, h: 122 }, { x: 2610, h: 153 }, { x: 2660, h: 155 },                  // up the first vent
    { x: 3480, h: 152 },                                                            // up onto the deck
    ...row(3700, 3, 36, 152),
    { x: 3880, h: 126 }, { x: 3990, h: 90 },                                        // glide off it
    // --- 2. Vents (18) ---
    { x: 4690, h: 126 }, { x: 4800, h: 110 }, { x: 4920, h: 76 }, { x: 5040, h: 42 },  // jump, double, glide
    { x: 5370, h: 80 },                                                             // over the pigeon
    { x: 5760, h: 135 }, { x: 5845, h: 127 }, { x: 6120, h: 168 },                  // two-vent chain
    ...row(6420, 2, 30),                                                            // drop before the antenna...
    { x: 6670, h: 80 },                                                             // ...and hop it
    ...row(7230, 2, 40, 52),                                                        // the stepping plank
    { x: 7480, h: 173 }, { x: 7600, h: 142 },
    { x: 8565, h: 157 },                                                            // vent to the deck
    { x: 8885, h: 192 },                                                            // high over the AC unit
    { x: 9060, h: 142 },
    // --- 3. Pigeon Alley (16) ---
    { x: 9750, h: 122 }, { x: 9840, h: 159 },
    ...row(10010, 3, 30),                                                           // under the flock
    { x: 10470, h: 78 },                                                            // over the low pigeon
    ...row(10700, 2, 30),                                                           // under the high one
    { x: 11400, h: 175 }, { x: 11480, h: 199 }, { x: 11560, h: 182 },               // top of the vent (an early jump)
    { x: 11780, h: 172 }, { x: 11950, h: 168 },
    { x: 12700, h: 129 }, { x: 12850, h: 101 },
    { x: 13180, h: 79 },                                                            // over the antenna
    // --- 4. Moonlight (22) ---
    { x: 13880, h: 80 }, { x: 14000, h: 56 },
    // the Moon Bridge: the arc of a held glide, up to the moon and down
    { x: 14600, h: 90 }, { x: 14700, h: 142 }, { x: 14850, h: 135 }, { x: 14960, h: 177 },
    { x: 15060, h: 164 }, { x: 15200, h: 173 }, { x: 15255, h: 201 }, { x: 15320, h: 193 },
    { x: 15450, h: 164 }, { x: 15600, h: 156 }, { x: 15760, h: 122 },
    ...row(16960, 2, 35, 68),                                                       // the plank under the flock
    { x: 17150, h: 134 },
    { x: 17980, h: 102 }, { x: 18100, h: 119 },
    { x: 18580, h: 77 },                                                            // over the last antenna
    ...row(18750, 3, 30),                                                           // run-out to the steak
  ],
};
