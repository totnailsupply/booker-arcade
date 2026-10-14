// =============================================================================
// Level registry. Full format guide: docs/level-format.md
//
// Level data (src/levels/levelN.js exports LEVELn). World px, y down; heights
// are px ABOVE the ground top (WORLD.GROUND_Y = 238). Booker starts at startX.
//   id, name, startX, finishX (finish centre), length (world width)
//   sections:   [{ name, startX, speed }]   startX = absolute world x (Booker's sprite x); speed px/s
//   obstacles:  [{ x, type }]               cone | crate | pallets | barrel   (x = sprite centre)
//   gaps:       [{ x, width }]              pits; x = left edge. The theme's pit tile shows inside
//   bones:      [{ x, h }]                  h = bone centre height
//   platforms:  [{ x, y, w }]               one-way; x = left edge, y = top surface height
//   walls:      [{ x, w, h }]               solid from the ground up; x = left edge; top is standable
//   updrafts:   [{ x, w, h, strength? }]    lift a GLIDING Booker; x = left edge, h = zone height
//   enemies:    [{ x, type, y?, patrol? }]  vacuum | drone. vacuum y = base height, drone y = centre height;
//                                           patrol px = walks x-patrol..x, starting left
//   breakables: [{ x, type, y? }]           boxes | gate. A dash smashes; any other touch is a hit
//   hazards:    [{ x, type, y?, ... }]      static: bollard tires acunit antenna gear l4crate cart
//                                           hydrant grill trashcan (y = base height);
//                                           moving: crab (scuttles left), pigeon (flies left, y = centre);
//                                           timed: steam { period?, on?, offset?, h? } (ms, px)
//   finish:     'steak' | 'golden-steak'    (default steak)
//   parallax:   { far, mid, near }          optional override of the background factors
//   parSeconds: number                      optional; default = section lengths / speeds
//   botPlan:    [{ x, action, ms? }]        optional scripted bot input (press | tap | hold | release)
//
// Registry entries add: number, ability (introduced here), abilities (all
// granted), theme (texture keys, plus an optional parallax override), music
// (variant id for the audio pass), bot.
// =============================================================================

import { LEVEL1 } from './level1.js';
import { LEVEL2 } from './level2.js';
import { LEVEL3 } from './level3.js';
import { LEVEL4 } from './level4.js';
import { LEVEL5 } from './level5.js';
import { LEVEL6 } from './level6.js';
import { buildSandbox } from './sandbox.js';
import { abilitiesForLevel, abilityIntroducedAt, ABILITY_ORDER } from '../core/Abilities.js';

/** Texture keys for one level. Missing art falls back to generated placeholders. */
function theme(n) {
  if (n === 1) {
    return {
      bgFar: 'bg-far', bgMid: 'bg-mid', bgNear: 'bg-near',
      ground: 'ground', pit: null, platform: 'l2-platform', wall: 'l4-wall', thumb: 'thumb-l1',
    };
  }
  return {
    bgFar: `l${n}-bg-far`, bgMid: `l${n}-bg-mid`, bgNear: `l${n}-bg-near`,
    ground: `l${n}-ground`, pit: `l${n}-pit`, platform: `l${n}-platform`,
    wall: 'l4-wall', thumb: `thumb-l${n}`,
  };
}

// parallax: a visual-only override of the background factors for a level whose
// data file is frozen (Level 1). The far art's sun (x 276-354) drifts 251 px and
// ends 25 px from the left edge, so it never splits across the screen edges.
const DEFS = [
  { data: LEVEL1, music: 'yard', bot: 'legacy', parallax: { far: 0.0162 } },
  { data: LEVEL2, music: 'docks' },
  { data: LEVEL3, music: 'rooftops' },
  { data: LEVEL4, music: 'factory' },
  { data: LEVEL5, music: 'market' },
  { data: LEVEL6, music: 'steakhouse' },
];

export const LEVELS = DEFS.map((d, i) => {
  const number = i + 1;
  return {
    id: d.data.id,
    number,
    name: d.data.name,
    ability: abilityIntroducedAt(number),
    abilities: abilitiesForLevel(number),
    theme: { ...theme(number), parallax: d.parallax || null },
    music: d.music,
    bot: d.bot || 'planner',
    data: d.data,
  };
});

export const LEVEL_COUNT = LEVELS.length;

/** The sandbox (?level=test&room=name). Not in LEVELS, never shown in the level select. */
export function getSandbox(room) {
  return {
    id: 'test',
    number: 0,
    name: 'Sandbox',
    ability: null,
    abilities: [...ABILITY_ORDER],
    theme: theme(4),
    music: 'factory',
    bot: 'planner',
    data: buildSandbox(room),
  };
}

/** Level entry by id ('level3', 'test'), number (3) or numeric string ('3'). */
export function getLevel(idOrNumber, room = null) {
  if (idOrNumber === 'test') return getSandbox(room);
  if (typeof idOrNumber === 'number') return LEVELS[idOrNumber - 1] || null;
  if (typeof idOrNumber === 'string' && /^\d+$/.test(idOrNumber)) return LEVELS[parseInt(idOrNumber, 10) - 1] || null;
  return LEVELS.find(l => l.id === idOrNumber) || null;
}

export function nextLevel(id) {
  const lv = getLevel(id);
  if (!lv || !lv.number) return null;
  return LEVELS[lv.number] || null;
}
