#!/usr/bin/env node
// =============================================================================
// validate-level.mjs — static fairness checks for Level 1 (PLAN section 4).
// Uses the game's own Kinematics, Platform types, hazard classes and the bot's
// flight planner, so "reachable" here means reachable in the game.
//
// Checks (FAIL = exit 1):
//   route      every step of the intended route (non-alt platforms by height,
//              spring beams continue from their pad, ending on the roof):
//                - vertical gap <= 90 px (spring: <= 197) and below the apex,
//                - lateral distance (wrap-aware) coverable in the air time at
//                  190 px/s with acceleration, after a human reaction time and
//                  with a safety factor (LEVEL_RULES),
//                - moving platforms at their WORST-CASE positions (both ends).
//   graph      the roof is reachable from the street and from every zone's
//              respawn cushion; zone 3 is reachable without any crumble
//              (no crumble-only path before zone 3).
//   hazards    each route step near a crow / chimes has a dodge window: some
//              departure time (sampled over 8 s) and landing spot gives a
//              hazard-free flight (a crow stomp counts as safe). Every roof tile
//              leaves landing room on the route platforms around its trigger.
//   rules      platforms on screen at every position, widths multiple of 8,
//              each zone opens with 3 wide static beams, element types only in
//              their zones, no hazards before zone 3, first appearance of each
//              element alone, respawn cushions clear, 40 treats.
// WARN (exit 0): gaps / widths outside the zone's table range in PLAN 4.
//
// Usage: node scripts/validate-level.mjs [--verbose]
// =============================================================================

import { LEVEL1 } from '../src/levels/level1.js';
import { Platform, makeSpringPad } from '../src/entities/Platform.js';
import { makeHazard } from '../src/systems/HazardSystem.js';
import { AutoClimber } from '../src/systems/AutoClimber.js';
import {
  BOUNCE, SPRING, LEVEL_RULES as R, WORLD, SOBA, TILE, PLATFORM,
} from '../src/core/Constants.js';
import {
  wrapDelta, timeToDescendTo, lateralReach, apexHeight, FOOT_HALF, heightToY, yToHeight,
} from '../src/core/Kinematics.js';

const verbose = process.argv.includes('--verbose');
const L = LEVEL1;
const W = WORLD.WRAP_W;
const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

// PLAN 4 table
const ZONE_RULES = {
  1: { gap: [40, 60], w: [56, 64], types: ['beam'], hazards: [] },
  2: { gap: [52, 75], w: [44, 64], types: ['beam', 'slider', 'crumble'], hazards: [] },
  3: { gap: [52, 85], w: [40, 64], types: ['beam', 'slider', 'crumble', 'spring'], hazards: ['crow', 'tile'] },
  4: { gap: [52, 90], w: [32, 64], types: ['beam', 'slider', 'crumble', 'spring', 'lift'], hazards: ['crow', 'tile', 'chimes'] },
};

const zoneOf = (h) => {
  for (let i = L.zones.length - 1; i >= 0; i--) if (h >= L.zones[i].startY) return L.zones[i].id;
  return 1;
};

// --- nodes ------------------------------------------------------------------------

const nodes = [];
for (const def of L.platforms) {
  const p = new Platform(def);
  p.alt = !!def.alt;
  p.label = `${def.type}(${def.x},${def.y})`;
  nodes.push(p);
  if (p.type === 'spring') {
    p.pad = makeSpringPad(p);
    p.pad.alt = p.alt;
    p.pad.label = `pad(${p.pad.x},${def.y + SPRING.PAD_TOP})`;
    nodes.push(p.pad);
  }
}
const street = new Platform({ x: W / 2, y: 0, w: W * 2, type: 'street' });
street.label = 'street';
const roof = new Platform({ ...L.finish, type: 'roof' });
roof.label = `roof(${L.finish.y})`;
const cushions = L.zones.map((z) => {
  const c = new Platform({ x: z.respawn.x, y: z.respawn.y, w: PLATFORM.CUSHION_W, type: 'cushion' });
  c.label = `cushion z${z.id}`;
  c.zone = z.id;
  return c;
});
const hazards = (L.hazards || []).map((d) => {
  const h = makeHazard(d);
  h.def = d;
  return h;
});

/** Sampled positions {x, h} over a platform's motion (worst-case analysis). */
function positions(p) {
  const n = R.POS_SAMPLES;
  if (p.type === 'slider') {
    return Array.from({ length: n }, (_, i) => ({ x: p.cx - p.range + (2 * p.range * i) / (n - 1), h: p.heightPx }));
  }
  if (p.type === 'lift') {
    const low = yToHeight(p.yLow);
    return Array.from({ length: n }, (_, i) => ({ x: p.x, h: low + (p.rise * i) / (n - 1) }));
  }
  if (p.type === 'springpad' && p.parent) {
    return positions(p.parent).map(q => ({ x: q.x + p.dx, h: q.h + SPRING.PAD_TOP }));
  }
  return [{ x: p.x, h: p.heightPx }];
}

const bounceMult = p => (p.type === 'springpad' ? SPRING.VELOCITY_MULT : 1);
const maxGapFrom = p => (p.type === 'springpad' ? R.SPRING_MAX_GAP : R.MAX_GAP);

/**
 * Worst-case reachability A -> B. Returns { ok, why, gap, need, reach }.
 * gap = worst vertical gap, need/reach = worst lateral need vs reach.
 */
function reach(A, B) {
  const mult = bounceMult(A);
  const apex = apexHeight(mult);
  const v0 = BOUNCE.VELOCITY * mult;
  let worst = { ok: true, gap: -Infinity, need: 0, reach: Infinity, margin: Infinity };
  const slack = Math.max(0, B.w / 2 + SOBA.FOOT_W / 2 - R.SAFETY_PX);
  for (const a of positions(A)) {
    for (const b of positions(B)) {
      const dh = b.h - a.h;
      if (dh > worst.gap) worst.gap = dh;
      if (dh > maxGapFrom(A)) return { ...worst, ok: false, why: `gap ${dh.toFixed(0)} > ${maxGapFrom(A)}` };
      if (dh > apex - 4) return { ...worst, ok: false, why: `gap ${dh.toFixed(0)} above apex ${apex.toFixed(0)}` };
      const t = timeToDescendTo(0, -v0, -dh);
      if (t === null) return { ...worst, ok: false, why: 'unreachable height' };
      const dx = Math.abs(wrapDelta(a.x, b.x));
      const need = Math.max(0, dx - slack);
      const r = lateralReach(t - R.REACTION_S) * R.REACH_FACTOR;
      if (r - need < worst.margin) worst = { ...worst, need, reach: r, margin: r - need };
      if (need > r) return { ...worst, ok: false, why: `lateral ${need.toFixed(0)} px > reach ${r.toFixed(0)} px (dx ${dx.toFixed(0)}, dh ${dh.toFixed(0)})` };
    }
  }
  return worst;
}

// --- rules: geometry ----------------------------------------------------------------

for (const p of nodes) {
  if (p.type === 'springpad') continue;
  const ps = positions(p);
  if (p.w % 8 !== 0) fail(`${p.label}: width ${p.w} is not a multiple of 8`);
  for (const q of ps) {
    if (q.x - p.w / 2 < 0 || q.x + p.w / 2 > W) fail(`${p.label}: off screen at x ${q.x.toFixed(0)} (w ${p.w})`);
  }
  const z = zoneOf(p.heightPx);
  const zr = ZONE_RULES[z];
  if (!zr.types.includes(p.type)) fail(`${p.label}: type ${p.type} not allowed in zone ${z}`);
  if (p.w < zr.w[0] || p.w > zr.w[1]) warn(`${p.label}: width ${p.w} outside zone ${z} range ${zr.w.join('-')}`);
  if (p.def.chunk && p.heightPx > L.zones[z - 1].endY) fail(`${p.label}: above its zone end`);
}
for (const h of hazards) {
  const hh = h.def.y;
  const z = zoneOf(hh);
  if (!ZONE_RULES[z].hazards.includes(h.type)) fail(`${h.type}(${h.def.x},${hh}): not allowed in zone ${z}`);
  if (h.type === 'crow' && (h.cx - h.range - 12 < 0 || h.cx + h.range + 12 > W)) fail(`crow(${h.def.x},${hh}): patrol leaves the screen`);
}

// --- route ----------------------------------------------------------------------------

const routeNodes = nodes.filter(p => !p.alt).sort((a, b) => a.heightPx - b.heightPx || a.x - b.x);
const route = [street, ...routeNodes, roof];
const stepRows = [];
const gapsByZone = {};
for (let i = 1; i < route.length; i++) {
  let A = route[i - 1];
  const B = route[i];
  // A spring beam's route continues from its pad (the pad is the next node anyway)
  if (A.type === 'spring' && B !== A.pad && A.pad) A = A.pad;
  const r = reach(A, B);
  const z = zoneOf(B.heightPx);
  if (B.type !== 'springpad' && A.type !== 'street' && A.type !== 'springpad') {
    (gapsByZone[z] || (gapsByZone[z] = [])).push(r.gap);
  }
  stepRows.push({ A, B, r, z });
  if (!r.ok) fail(`route ${A.label} -> ${B.label}: ${r.why}`);
}

// zone gap ranges (warn)
for (const [z, gaps] of Object.entries(gapsByZone)) {
  const zr = ZONE_RULES[z];
  for (const row of stepRows.filter(s => String(s.z) === z && s.B.type !== 'springpad' && s.A.type !== 'street')) {
    if (row.A.type === 'springpad') continue;
    if (row.r.gap > zr.gap[1]) warn(`zone ${z} gap ${row.r.gap.toFixed(0)} > ${zr.gap[1]} (${row.A.label} -> ${row.B.label})`);
  }
}

// breathers: each zone (2+) opens with 3 wide static beams
for (const z of L.zones.slice(1)) {
  const first = routeNodes.filter(p => p.heightPx >= z.startY).slice(0, 3);
  const ok = first.length === 3 && first.every(p => p.type === 'beam' && p.w >= R.BREATHER_MIN_W);
  if (!ok) fail(`zone ${z.id}: does not open with 3 wide static beams (${first.map(p => p.label).join(', ')})`);
  const lastBelow = routeNodes.filter(p => p.heightPx < z.startY).pop();
  if (lastBelow && first[0] && first[0].heightPx - lastBelow.heightPx > R.MAX_GAP) {
    fail(`zone ${z.id} gate: gap ${first[0].heightPx - lastBelow.heightPx} into the breather`);
  }
}

// respawn cushions: clear of platforms, and they lead somewhere
for (const c of cushions) {
  for (const p of nodes) {
    for (const q of positions(p)) {
      if (Math.abs(q.h - c.heightPx) < 16 && Math.abs(wrapDelta(q.x, c.x)) < p.w / 2 + c.w / 2) {
        fail(`${c.label}: overlaps ${p.label}`);
      }
    }
  }
}

// --- graph ------------------------------------------------------------------------------

const all = [street, ...nodes, roof];
const edgeCache = new Map();
function canStep(A, B) {
  const key = `${A.id}>${B.id}`;
  if (!edgeCache.has(key)) {
    let ok = false;
    if (B !== A && B.heightPx - A.heightPx <= 260 && B.heightPx - A.heightPx >= -200) {
      const from = A.type === 'spring' && A.pad && B === A.pad ? A : A;
      ok = reach(from, B).ok;
    }
    edgeCache.set(key, ok);
  }
  return edgeCache.get(key);
}
function bfs(start, allow = () => true) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const a = q.shift();
    for (const b of all) {
      if (seen.has(b) || !allow(b)) continue;
      if (canStep(a, b)) {
        seen.add(b);
        q.push(b);
      }
    }
  }
  return seen;
}
if (!bfs(street).has(roof)) fail('graph: the roof is not reachable from the street');
for (const c of cushions) {
  all.push(c);
  const seen = bfs(c);
  all.pop();
  if (!seen.has(roof)) fail(`graph: the roof is not reachable from ${c.label}`);
}
const z3 = L.zones.find(z => z.id === 3);
if (z3) {
  const seen = bfs(street, p => p.type !== 'crumble');
  const reached = [...seen].some(p => p.heightPx >= z3.startY);
  if (!reached) fail('graph: zone 3 is not reachable without crumbles (crumble-only path before zone 3)');
}

// --- hazards: dodge windows ------------------------------------------------------------

const planner = new AutoClimber();
const flyers = hazards.filter(h => h.type !== 'tile');
function dodgeWindow(A, B) {
  const lo = Math.min(A.heightPx, B.heightPx) - 40;
  const hi = Math.max(B.heightPx, A.heightPx + apexHeight(bounceMult(A))) + 48;
  const near = flyers.filter(h => yToHeight(h.y) >= lo && yToHeight(h.y) <= hi);
  if (!near.length) return { needed: false };
  const aims = [0, -B.w / 3, B.w / 3];
  let safe = 0;
  let tries = 0;
  for (let k = 0; k < R.DODGE_SAMPLES; k++) {
    const T0 = (k / R.DODGE_SAMPLES) * R.DODGE_SPAN_S;
    for (const p of [A, B, A.parent, B.parent]) if (p) p.time = T0;
    for (const h of near) h.time = T0;
    const s = { x: A.xAt(T0), y: A.yAt(T0), vx: 0, vy: -BOUNCE.VELOCITY * bounceMult(A) };
    for (const aim of aims) {
      planner.aimDx = aim;
      tries += 1;
      if (planner.flight(s, B, near, A.yAt(T0) + 400, 0, 0, 0).safe) safe += 1;
    }
  }
  return { needed: true, safe, tries, near };
}
const dodgeRows = [];
for (const row of stepRows) {
  const d = dodgeWindow(row.A, row.B);
  if (!d.needed) continue;
  dodgeRows.push({ ...row, d });
  if (d.safe === 0) fail(`hazard: no dodge window for ${row.A.label} -> ${row.B.label} (${d.near.map(h => h.type).join(', ')})`);
}

// waiting spots: on every static route platform under a crow / chimes there is
// a spot where bouncing in place never touches a hazard (no forced hits)
const waitRows = [];
for (const P of routeNodes) {
  if (P.type === 'slider' || P.type === 'springpad') continue;
  const lo = P.heightPx - 10;
  const hi = P.heightPx + apexHeight(1) + SOBA.BODY_H + 12;
  const near = flyers.filter(h => yToHeight(h.y) >= lo && yToHeight(h.y) <= hi);
  if (!near.length) continue;
  const reachHalf = P.w / 2 + SOBA.FOOT_W / 2 - 2;
  const safeSpots = [];
  for (let off = -reachHalf; off <= reachHalf; off += 3) {
    let clean = true;
    for (let k = 0; k < 40 && clean; k++) {
      const T0 = k * 0.2;
      for (const h of near) h.time = T0;
      P.time = T0;
      const s = { x: P.x + off, y: P.yAt(T0), vx: 0, vy: -BOUNCE.VELOCITY };
      planner.aimDx = off;
      if (!planner.flight(s, P, near, P.yAt(T0) + 400, 0, 0, 0).safe) clean = false;
    }
    if (clean) safeSpots.push(off);
  }
  waitRows.push({ P, near, safeSpots });
  if (!safeSpots.length) fail(`hazard: no safe spot to bounce in place on ${P.label} (${near.map(h => h.type).join(', ')})`);
}

// roof tiles: room to dodge on the route platforms around the trigger
for (const t of hazards.filter(h => h.type === 'tile')) {
  const band = SOBA.BODY_W / 2 + TILE.HURT_W / 2 + 2;
  for (const p of routeNodes) {
    if (p.heightPx < t.trigger - 60 || p.heightPx > t.trigger + 260 || p.type === 'springpad') continue;
    for (const q of positions(p)) {
      const lo = q.x - p.w / 2 - SOBA.FOOT_W / 2;
      const hi = q.x + p.w / 2 + SOBA.FOOT_W / 2;
      const d0 = wrapDelta(q.x, t.x);
      const blo = q.x + d0 - band;
      const bhi = q.x + d0 + band;
      const free = Math.max(0, blo - lo) + Math.max(0, hi - bhi);
      if (free < R.TILE_FREE_PX) fail(`tile(${t.x},${t.trigger}): covers ${p.label} (free ${free.toFixed(0)} px)`);
    }
  }
}

// --- first appearances ---------------------------------------------------------------

const firstOf = {};
for (const p of [...nodes].sort((a, b) => a.heightPx - b.heightPx)) {
  if (p.type !== 'beam' && p.type !== 'springpad' && !firstOf[p.type]) firstOf[p.type] = { h: p.heightPx, label: p.label };
}
for (const h of [...hazards].sort((a, b) => a.def.y - b.def.y)) {
  if (!firstOf[h.type]) firstOf[h.type] = { h: h.def.y, label: `${h.type}(${h.def.x},${h.def.y})` };
}
for (const [type, f] of Object.entries(firstOf)) {
  const others = [
    ...nodes.filter(p => p.type !== 'beam' && p.type !== 'springpad' && p.type !== type && Math.abs(p.heightPx - f.h) < 90),
    ...hazards.filter(h => h.type !== type && Math.abs(h.def.y - f.h) < 120),
  ];
  if (others.length) fail(`first ${type} at ${f.label} is not alone (${others.map(o => o.label || o.type).join(', ')})`);
}

// --- treats ------------------------------------------------------------------------------

const treats = L.treats || [];
if (treats.length !== 40) fail(`treats: ${treats.length} (want 40)`);
const off = treats.filter(t => t.off).length;
if (off < 6 || off > 10) warn(`treats: ${off} off-path (want ~8)`);
for (const t of treats) if (t.x < 4 || t.x > W - 4) warn(`treat (${t.x},${t.y}) at the very edge`);

// --- report ----------------------------------------------------------------------------------

if (verbose) {
  console.log('route steps (worst case):');
  for (const { A, B, r, z } of stepRows) {
    const m = Number.isFinite(r.margin) ? r.margin.toFixed(0) : '-';
    console.log(`  z${z} ${A.label.padEnd(22)} -> ${B.label.padEnd(22)} gap ${r.gap.toFixed(0).padStart(4)}  lateral need ${r.need.toFixed(0).padStart(3)} / reach ${Number.isFinite(r.reach) ? r.reach.toFixed(0) : '-'}  margin ${m}${r.ok ? '' : '  FAIL'}`);
  }
  console.log('waiting spots (safe x offsets on the platform):');
  const ranges = (xs) => {
    const out = [];
    for (const x of xs) {
      const last = out[out.length - 1];
      if (last && x - last[1] <= 3) last[1] = x;
      else out.push([x, x]);
    }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}..${b}`)).join(', ');
  };
  for (const { P, near, safeSpots } of waitRows) console.log(`  ${P.label}: ${safeSpots.length ? ranges(safeSpots) : 'NONE'} (${near.map(h => h.type).join(', ')})`);
  console.log('dodge windows (safe departures / tries):');
  for (const { A, B, d } of dodgeRows) console.log(`  ${A.label} -> ${B.label}: ${d.safe}/${d.tries} (${d.near.map(h => h.type).join(', ')})`);
}

console.log('Level 1 "Noodle House" summary');
for (const z of L.zones) {
  const inZone = nodes.filter(p => p.type !== 'springpad' && zoneOf(p.heightPx) === z.id);
  const counts = {};
  for (const p of inZone) counts[p.type] = (counts[p.type] || 0) + 1;
  const hz = {};
  for (const h of hazards.filter(h => zoneOf(h.def.y) === z.id)) hz[h.type] = (hz[h.type] || 0) + 1;
  const tr = treats.filter(t => zoneOf(t.y) === z.id);
  const gaps = gapsByZone[z.id] || [];
  const widths = inZone.map(p => p.w);
  const springGaps = stepRows.filter(r => r.A.type === 'springpad' && zoneOf(r.B.heightPx) === z.id).map(r => r.r.gap.toFixed(0));
  console.log(`  zone ${z.id} ${z.name.padEnd(16)} ${z.startY}-${z.endY}: platforms ${inZone.length} ${JSON.stringify(counts)}`
    + `  hazards ${JSON.stringify(hz)}  treats ${tr.length} (${tr.filter(t => t.off).length} off)`
    + `  gaps ${Math.min(...gaps).toFixed(0)}-${Math.max(...gaps).toFixed(0)}${springGaps.length ? ` (spring ${springGaps.join(',')})` : ''}  widths ${Math.min(...widths)}-${Math.max(...widths)}`);
}
console.log(`  total: ${nodes.filter(p => p.type !== 'springpad').length} platforms, ${hazards.length} hazards, ${treats.length} treats (${off} off-path), roof at ${L.finish.y} px (${L.finish.y / WORLD.PX_PER_M} m)`);
console.log(`  first appearances: ${Object.entries(firstOf).map(([t, f]) => `${t}@${f.h.toFixed(0)}`).join(' ')}`);
for (const w of warns) console.log(`WARN ${w}`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(fails.length ? `validate-level: FAILED (${fails.length})` : `validate-level: OK (${stepRows.length} route steps, ${dodgeRows.length} hazard steps checked)`);
process.exit(fails.length ? 1 : 0);
