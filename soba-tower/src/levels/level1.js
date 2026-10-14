// =============================================================================
// Level 1 — "Noodle House". Authored, not random: the layout is the same on
// every attempt so players improve through practice (PLAN pillar 3).
// Built from the chunks in chunks.js, assembled in a fixed order: each zone's
// chunks stack upward from the zone's start height.
//
// FORMAT (all numbers in px; heights grow UPWARD from the street):
//   zones[i]      { id, name, startY, endY, respawn: { x, y } }
//                 Landing on any platform at or above startY of a zone passes
//                 its gate (= checkpoint, lives restored to >= 1, banner).
//                 respawn = where the cushion floats after a fall (cushion top
//                 surface; x is the centre). It's clear of other platforms.
//   platforms[i]  { x, y, w, type, ...per-type fields, alt?, chunk }
//                 x = centre (the platform sits fully on screen at every
//                 position), y = height of the TOP surface (lifts: lowest top),
//                 w = multiple of 8 (32..64). Types: beam, slider {range, speed,
//                 phase}, crumble, spring {spring: pad dx}, lift {rise, speed, phase}.
//   hazards[i]    crow {x, y, range, speed, phase} | tile {x, y = trigger height}
//                 | chimes {x, y = hook height}
//   treats[i]     { x, y, off? }   40 biscuits, ~8 off the natural path
//   finish        { x, y, w }  the roof deck; landing on it rings the bell.
//   spawn         { x, y }     Soba's start (feet), y = 0 is the street.
//   parS          par time (s) for the time bonus.
//
// Reach (Constants.js BOUNCE): bounce apex 112 px; a platform dh px higher is
// landed on t(dh) = 0.44 + sqrt(2 (112 - dh) / 1446) s after the bounce, so the
// max lateral reach is ~190 (t - 0.04) px: dh 50 -> ~130, dh 90 -> ~109.
// Spring apex 246 px (2.2x). scripts/validate-level.mjs checks every step.
// =============================================================================

import { CHUNKS, mirrored } from './chunks.js';

const ZONES = [
  {
    id: 1, name: 'Street & Garden', startY: 0, endY: 1400, respawn: { x: 135, y: 24 },
    chunks: ['garden-trellis', 'first-wrap', 'garden-zigzag', 'garden-wraps', 'garden-gate-run'],
  },
  {
    id: 2, name: 'Balconies', startY: 1400, endY: 3000, respawn: { x: 135, y: 1400 },
    chunks: ['breather', 'slider-intro', 'slider-pair', 'slider-run', 'crumble-intro', 'balcony-mix', 'balcony-finale'],
  },
  {
    id: 3, name: 'Lantern Roofs', startY: 3000, endY: 4800, respawn: { x: 135, y: 3000 },
    chunks: ['breather', 'spring-intro', 'crow-intro', 'tile-intro', 'roof-crows', 'lantern-steps', 'lantern-top'],
  },
  {
    id: 4, name: 'The Spire', startY: 4800, endY: 6400, respawn: { x: 135, y: 4800 },
    chunks: ['breather', 'lift-intro', 'chimes-intro', 'spire-lifts', 'spire-chimes', 'spire-mix', 'spire-top'],
  },
];

const FINISH = { x: 135, y: 6400, w: 208 };

/** Stacks each zone's chunks from its start height. Pure and deterministic. */
export function assemble(zones) {
  const platforms = [];
  const hazards = [];
  const treats = [];
  const placed = [];
  for (const zone of zones) {
    let base = zone.startY;
    for (const entry of zone.chunks) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const src = CHUNKS[name];
      if (!src) throw new Error(`level1: unknown chunk "${name}"`);
      const chunk = entry.mirror ? mirrored(src) : src;
      const tag = `${zone.id}:${name}${entry.mirror ? '(m)' : ''}`;
      for (const p of chunk.platforms || []) platforms.push({ ...p, y: base + p.y, chunk: tag });
      for (const h of chunk.hazards || []) hazards.push({ ...h, y: base + h.y, chunk: tag });
      for (const t of chunk.treats || []) treats.push({ ...t, y: base + t.y, chunk: tag });
      placed.push({ zone: zone.id, chunk: tag, base, top: base + chunk.h });
      base += chunk.h;
    }
  }
  return { platforms, hazards, treats, placed };
}

const built = assemble(ZONES);

export const LEVEL1 = {
  id: 'level1',
  name: 'Noodle House',
  spawn: { x: 135, y: 0 },
  zones: ZONES.map(({ chunks, ...z }) => z),
  platforms: built.platforms,
  hazards: built.hazards,
  treats: built.treats,
  chunks: built.placed,
  finish: FINISH,
  parS: 80,
};

/** Height (px) of the finish, i.e. the top of the climb. */
export const LEVEL_TOP = LEVEL1.finish.y;
