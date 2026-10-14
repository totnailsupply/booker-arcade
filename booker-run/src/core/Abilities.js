// =============================================================================
// Abilities.js — Booker's one-button abilities (Levels 2-6).
//
// Level N grants every ability whose `level` <= N (Level 1 has none). Tunables
// live in Constants.js (DOUBLE, GLIDE, WALL, POUNCE, DASH) with the reach math.
// `icon` is a frame index into the `ui-icons` spritesheet (24x24 frames).
// =============================================================================

export const ABILITIES = {
  double:   { id: 'double',   name: 'Double Jump',  hint: 'Tap again in the air',               icon: 0, level: 2 },
  glide:    { id: 'glide',    name: 'Ear Glide',    hint: 'Hold while falling to glide',        icon: 1, level: 3 },
  wallkick: { id: 'wallkick', name: 'Wall Kick',    hint: 'Hit a wall mid-air, then tap',       icon: 2, level: 4 },
  pounce:   { id: 'pounce',   name: 'Pounce',       hint: 'Land on enemies to bounce',          icon: 3, level: 5 },
  dash:     { id: 'dash',     name: 'Zoomies Dash', hint: 'Tap in the air after a double jump', icon: 4, level: 6 },
};

export const ABILITY_ORDER = ['double', 'glide', 'wallkick', 'pounce', 'dash'];

// Other ui-icons frames
export const UI_ICON = {
  LOCK: 5,
  STAR_ON: 6,
  STAR_OFF: 7,
  TROPHY: 8,
  BONE: 9,
};

/** Every ability introduced at or before level number n (n = 1 -> []). */
export function abilitiesForLevel(n) {
  return ABILITY_ORDER.filter(id => ABILITIES[id].level <= n);
}

/** The ability a level introduces (null for Level 1). */
export function abilityIntroducedAt(n) {
  return ABILITY_ORDER.find(id => ABILITIES[id].level === n) || null;
}

/** Parses "double,glide" / "none" / "all" into a list of known ids (null = not given). */
export function parseAbilityList(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim().toLowerCase();
  if (s === '' || s === 'none') return [];
  if (s === 'all') return [...ABILITY_ORDER];
  return s.split(',').map(t => t.trim()).filter(id => ABILITIES[id]);
}

/** { double: bool, glide: bool, ... } from a list of ids. */
export function abilityFlags(list) {
  const flags = {};
  for (const id of ABILITY_ORDER) flags[id] = list.includes(id);
  return flags;
}
