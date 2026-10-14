// =============================================================================
// chunks.js — hand-placed level patterns, ~200-300 px tall, for Level 1.
// level1.js assembles them in a fixed order (deterministic: the same tower on
// every attempt). Coordinates are RELATIVE to the chunk base:
//   y = height above the chunk base (px, positive up), x = centre (0..270).
//
// Element helpers (all sizes in px, widths are multiples of 8):
//   beam(x, y, w)                         static plank
//   slider(x, y, w, range, speed, phase)  moves x-range..x+range at speed px/s
//   crumble(x, y, w)                      holds one bounce, then falls
//   spring(x, y, w, dx)                   beam with a spring pad at x+dx (2.2x bounce)
//   lift(x, y, w, rise, speed, phase)     moves between y and y+rise
//   crow(x, y, range, speed, phase)       patrol x-range..x+range at height y (body centre)
//   tile(x, y)                            roof tile column x, triggers when Soba's feet reach y
//   chimes(x, y)                          wind chimes hanging from y (top of the art)
//   treat(x, y)                           biscuit centre; treatOff() = off the natural path
// Options on platforms: { alt: true } = not on the intended route (a fallback,
// a risky side branch). The validator checks the intended route step by step
// and the whole graph for connectivity.
// =============================================================================

export const beam = (x, y, w, o = {}) => ({ type: 'beam', x, y, w, ...o });
export const slider = (x, y, w, range, speed, phase = 0, o = {}) => ({ type: 'slider', x, y, w, range, speed, phase, ...o });
export const crumble = (x, y, w, o = {}) => ({ type: 'crumble', x, y, w, ...o });
export const spring = (x, y, w, dx = 0, o = {}) => ({ type: 'spring', x, y, w, spring: dx, ...o });
export const lift = (x, y, w, rise, speed, phase = 0, o = {}) => ({ type: 'lift', x, y, w, rise, speed, phase, ...o });
export const crow = (x, y, range, speed, phase = 0) => ({ type: 'crow', x, y, range, speed, phase });
export const tile = (x, y) => ({ type: 'tile', x, y });
export const chimes = (x, y) => ({ type: 'chimes', x, y });
export const treat = (x, y) => ({ x, y });
export const treatOff = (x, y) => ({ x, y, off: true });

const alt = { alt: true };

// Lateral budget used here (validate-level.mjs, human reaction 0.12 s, 85% of
// the reach): centre-to-centre moves stay under ~120 px at gap 60 / w 56,
// ~110 at gap 70 / w 48, ~100 at gap 85 / w 40. Moving platforms count at
// their worst end, so sliders stack around one column and statics sit near it.

export const CHUNKS = {
  // ===========================================================================
  // Zone 1 — Street & Garden (0-1400): gaps 40-60, widths 64 -> 56, no hazards.
  // Teaches steering and the wrap. Kept from Step 1 (QA actions rely on the
  // trellis at x=72 and the empty drop zone x 114-148, heights 100-400).
  // ===========================================================================

  // Garden trellis: a stacked column that climbs itself once Soba is on it.
  // The first beam is NOT above the spawn (x 135), so an idle Soba stays on the street.
  'garden-trellis': {
    h: 300,
    platforms: [beam(72, 48, 64), beam(72, 96, 64), beam(72, 144, 64), beam(72, 192, 64), beam(72, 240, 64), beam(72, 288, 64)],
    treats: [treat(72, 200), treat(72, 330)],
  },

  // First wrap: left off the trellis top, through the left edge to x 236.
  'first-wrap': {
    h: 240,
    platforms: [beam(236, 40, 64), beam(190, 84, 64), beam(100, 134, 64), beam(190, 186, 64), beam(238, 232, 64)],
    treats: [treat(236, 100), treat(100, 190)],
  },

  // Zigzag with a wrap right (36) and a wrap left (232).
  'garden-zigzag': {
    h: 260,
    platforms: [beam(36, 48, 64), beam(120, 96, 64), beam(60, 150, 64), beam(232, 200, 64), beam(150, 250, 56)],
    treats: [treat(36, 100), treat(60, 205), treat(150, 305)],
  },

  'garden-wraps': {
    h: 300,
    platforms: [beam(210, 46, 56), beam(104, 92, 56), beam(40, 146, 56), beam(136, 200, 56), beam(196, 246, 56)],
    treats: [treat(40, 200)],
  },

  // Run to the gate, with a wrap right at the start. Off-path treat out at the
  // left edge (a small detour on the wrap).
  'garden-gate-run': {
    h: 300,
    platforms: [beam(34, 4, 56), beam(96, 56, 56), beam(176, 110, 56), beam(114, 158, 56), beam(214, 218, 56), beam(150, 272, 56)],
    treats: [treatOff(6, 50), treat(176, 165)],
  },

  // ===========================================================================
  // Breather: opens zones 2-4. Three wide static beams, gaps 52 (the banner
  // shows when Soba lands on the first one: the zone gate / checkpoint).
  // The zone's respawn cushion floats at (135, base), right under the first.
  // ===========================================================================
  breather: {
    h: 144,
    platforms: [beam(135, 40, 64), beam(88, 92, 64), beam(168, 144, 64)],
    treats: [treat(168, 200)],
  },

  // ===========================================================================
  // Zone 2 — Balconies (1400-3000): gaps 60 -> 72, widths 56 -> 48.
  // Sliders first (speed 40 -> 75), then crumbles late, always beside a
  // static beam at the same height (no crumble-only path before zone 3).
  // ===========================================================================

  // The first slider, alone and slow; missing it drops Soba back to the beam below.
  'slider-intro': {
    h: 182,
    platforms: [beam(220, 60, 56), slider(150, 120, 56, 30, 40), beam(110, 182, 56)],
    treats: [treat(110, 238)],
  },

  'slider-pair': {
    h: 254,
    platforms: [slider(130, 62, 56, 36, 45, 0.25), beam(196, 124, 48), slider(135, 188, 48, 40, 50, 0.6), beam(70, 254, 48)],
    treats: [treat(196, 180), treat(70, 310)],
  },

  // Two sliders in a row (stacked on one column, out of phase).
  'slider-run': {
    h: 274,
    platforms: [slider(130, 68, 48, 44, 55, 0.1), slider(135, 136, 48, 46, 60, 0.55), beam(200, 204, 48), slider(140, 274, 48, 44, 65, 0.3)],
    treats: [treat(200, 260)],
  },

  // Crumbles appear: the first one beside a static beam at the same height,
  // with a treat over it (risk/reward). Every crumble in zone 2 is a side branch.
  'crumble-intro': {
    h: 208,
    platforms: [beam(80, 68, 48), beam(160, 138, 48), crumble(40, 142, 48, alt), beam(110, 208, 48)],
    treats: [treat(80, 124), treatOff(40, 202)],
  },

  'balcony-mix': {
    h: 212,
    platforms: [beam(180, 70, 48), crumble(60, 74, 48, alt), slider(120, 142, 48, 44, 75, 0.2), beam(185, 214, 48), crumble(70, 218, 48, alt)],
    treats: [treatOff(60, 128), treat(185, 268)],
  },

  // Finale: two crumbles in a row up the middle (the quick line) with a static
  // path beside them (the safe line). Miss after the second crumble and both
  // are gone. Then a fast slider to the gate.
  'balcony-finale': {
    h: 294,
    platforms: [
      crumble(120, 74, 48), beam(220, 68, 48, alt),
      crumble(60, 148, 48), beam(170, 142, 48, alt),
      slider(120, 222, 48, 44, 82, 0.4), beam(180, 294, 48),
    ],
    treats: [treat(60, 212)],
  },

  // ===========================================================================
  // Zone 3 — Lantern Roofs (3000-4800): gaps 68 -> 78, widths 56 -> 40.
  // Springs, crows, roof tiles. Each one first alone and safe.
  // ===========================================================================

  // A spring with nothing above it: the only way up is the 2.2x boost.
  'spring-intro': {
    h: 256,
    platforms: [spring(135, 68, 56), beam(150, 256, 56)],
    treats: [treat(135, 156), treat(135, 226)],
  },

  // The first crow patrols the left side, away from the route; a treat just
  // above its line pays for a stomp detour.
  'crow-intro': {
    h: 280,
    platforms: [beam(205, 70, 48), beam(120, 140, 48), beam(200, 210, 48), beam(125, 280, 48)],
    hazards: [crow(50, 190, 28, 40)],
    treats: [treatOff(50, 225)],
  },

  // The first roof tile falls on an empty column (x 60) when Soba reaches the
  // wide beam; the second one on the route (x 110) with room to dodge.
  'tile-intro': {
    h: 288,
    platforms: [beam(200, 72, 56), beam(110, 144, 48), beam(190, 216, 48), beam(110, 288, 48)],
    hazards: [tile(60, 72), tile(110, 144)],
    treats: [treat(190, 272)],
  },

  // Spring under a crow's patrol: wait for it to pass (or stomp it). The
  // spring lands on a crumble: keep moving.
  'roof-crows': {
    h: 332,
    platforms: [spring(190, 72, 48, -8), crumble(110, 258, 56), beam(56, 332, 40)],
    hazards: [crow(130, 162, 50, 55, 0.3)],
    treats: [treat(182, 212), treat(110, 314)],
  },

  'lantern-steps': {
    h: 308,
    platforms: [beam(115, 76, 40), slider(180, 152, 40, 36, 78, 0.15), beam(120, 230, 40), beam(200, 308, 40)],
    hazards: [crow(55, 152, 30, 70, 0.6), tile(120, 230)],
    treats: [treatOff(55, 190), treat(120, 290)],
  },

  'lantern-top': {
    h: 154,
    platforms: [beam(120, 78, 40), beam(190, 154, 40)],
    hazards: [crow(190, 144, 40, 70, 0.1), tile(190, 154)],
    treats: [treat(120, 134)],
  },

  // ===========================================================================
  // Zone 4 — The Spire (4800-6400): gaps 76 -> 86, widths 48 -> 32.
  // Lifts, crows, tiles, chimes; a spring launches Soba onto the roof.
  // ===========================================================================

  // The first lift, alone and slow, right above the breather.
  'lift-intro': {
    h: 132,
    platforms: [lift(135, 46, 48, 40, 30), beam(70, 132, 40)],
    treats: [treat(135, 140)],
  },

  // The first chimes hang off the route (right side); a treat right under them.
  'chimes-intro': {
    h: 234,
    platforms: [beam(150, 78, 40), beam(70, 156, 40), beam(150, 234, 40)],
    hazards: [chimes(232, 174)],
    treats: [treatOff(232, 124), treat(70, 212)],
  },

  'spire-lifts': {
    h: 284,
    platforms: [lift(220, 60, 40, 30, 40, 0.3), beam(130, 140, 40), lift(50, 198, 40, 30, 45, 0.7), beam(140, 284, 40)],
    hazards: [tile(130, 140), crow(90, 210, 26, 45, 0.2)],
    treats: [treat(130, 196)],
  },

  // Chimes hang right above two beams, at the apex: keep bouncing in place
  // and you bump them; move on (or bounce off the beam's edge) and you're fine.
  'spire-chimes': {
    h: 320,
    platforms: [beam(60, 80, 40), beam(140, 160, 40), beam(210, 240, 40), beam(130, 320, 40)],
    hazards: [chimes(60, 232), chimes(210, 392)],
    treats: [treat(60, 136), treat(130, 376)],
  },

  'spire-mix': {
    h: 160,
    platforms: [slider(150, 80, 40, 30, 85, 0.5), beam(90, 160, 32)],
    hazards: [crow(70, 120, 40, 75, 0.45)],
    treats: [treatOff(30, 136)],
  },

  // Last steps: a lift under a crow, then a spring onto the roof deck.
  'spire-top': {
    h: 202,
    platforms: [lift(170, 46, 40, 30, 50, 0.1), beam(100, 126, 32), spring(170, 202, 40)],
    hazards: [crow(200, 96, 40, 75, 0.8)],
    treats: [treatOff(230, 131), treat(170, 266)],
  },
};

/** A chunk mirrored left-right (x -> 270 - x), e.g. to reuse a pattern. */
export function mirrored(chunk) {
  const mx = o => ({ ...o, x: 270 - o.x, ...(o.spring !== undefined ? { spring: -o.spring } : {}) });
  return {
    h: chunk.h,
    platforms: (chunk.platforms || []).map(mx),
    hazards: (chunk.hazards || []).map(mx),
    treats: (chunk.treats || []).map(mx),
  };
}
