// =============================================================================
// Sandbox (?level=test&room=name). Dev only: never in the level select.
// Each room is a short flat level with one element at x = 600-700, so
// scripts/ability-check.mjs can prove one ability at a time. Speed is a
// constant 170 px/s. Abilities default to all; override with ?abilities=.
// ?level=test with no room plays every room's element in a row.
// =============================================================================

const SPEED = 170;

const ROOMS = {
  flat: {},
  gap: { gaps: [{ x: 600, width: 150 }] },
  chasm: { gaps: [{ x: 600, width: 300 }] },
  updraft: {
    gaps: [{ x: 600, width: 480 }],
    updrafts: [{ x: 760, w: 64, h: 200, strength: 150 }],
  },
  wall: { walls: [{ x: 640, w: 96, h: 140 }] },
  vacuum: { enemies: [{ x: 700, type: 'vacuum' }] },
  drone: { enemies: [{ x: 700, type: 'drone', y: 30 }] },
  // Three-high stack (138 px): too tall to jump, only a dash gets through
  boxes: { breakables: [{ x: 700, type: 'boxes' }, { x: 700, type: 'boxes', y: 46 }, { x: 700, type: 'boxes', y: 92 }] },
  gate: { breakables: [{ x: 700, type: 'gate' }] },
  platform: { platforms: [{ x: 560, y: 60, w: 192 }] },
  // Booker reaches the column ~2.7 s after the vent's clock starts: off with offset 0, on with 600
  steam: { hazards: [{ x: 700, type: 'steam', period: 1600, on: 600, offset: 0 }] },
  'steam-hot': { hazards: [{ x: 700, type: 'steam', period: 1600, on: 600, offset: 600 }] },
  pigeon: { hazards: [{ x: 900, type: 'pigeon', y: 14 }] },
  // Planner repros (Level 4): a cling whose idle death is not the wall-stuck rule.
  // A gear at the foot of a 150 px wall (the slide ends on it), and a 150 px
  // pillar standing in a pit (the slide ends in the pit). The bot must chain kicks.
  'wall-gear': { walls: [{ x: 640, w: 64, h: 150 }], hazards: [{ x: 628, type: 'gear', y: 14 }] },
  'wall-pit': { gaps: [{ x: 560, width: 300 }], walls: [{ x: 640, w: 64, h: 150 }] },
  // A 170 px wall (L4 K): one low kick slides back to the floor and sits there
  // until the stuck rule; the planner must not call that safe at its horizon
  'wall-tall': { walls: [{ x: 640, w: 128, h: 170 }] },
  // botPlan: a scripted full jump + double jump over a wide pit (ability-check 'botplan')
  script: {
    gaps: [{ x: 600, width: 150 }],
    botPlan: [{ x: 570, action: 'press', ms: 380 }, { x: 642, action: 'tap' }],
  },
};

export const SANDBOX_ROOMS = Object.keys(ROOMS);

function room(name, extra) {
  return {
    id: 'test',
    name: `Sandbox: ${name}`,
    startX: 100,
    finishX: 1500,
    length: 1700,
    sections: [{ name: name.toUpperCase(), startX: 0, speed: SPEED }],
    obstacles: [],
    gaps: [],
    bones: [],
    platforms: [],
    walls: [],
    updrafts: [],
    enemies: [],
    breakables: [],
    hazards: [],
    finish: 'steak',
    ...extra,
  };
}

/** Every room's element in a row, 1200 px apart. */
function allRooms() {
  const lv = room('all', {});
  lv.finishX = 1200 * (SANDBOX_ROOMS.length - 1) + 1500;
  lv.length = lv.finishX + 200;
  SANDBOX_ROOMS.filter(n => n !== 'flat').forEach((name, i) => {
    const dx = i * 1200;
    for (const [key, list] of Object.entries(ROOMS[name])) {
      if (!lv[key]) lv[key] = [];
      for (const item of list) lv[key].push({ ...item, x: item.x + dx });
    }
  });
  return lv;
}

export function buildSandbox(name) {
  if (name && ROOMS[name]) return room(name, structuredClone(ROOMS[name]));
  return allRooms();
}
