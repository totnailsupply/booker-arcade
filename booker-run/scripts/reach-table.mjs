#!/usr/bin/env node
// Prints Booker's reach numbers, measured with the bot's frame-exact simulator
// (src/systems/BotSim.js runs the same PlayerController code as the game).
// Usage: node scripts/reach-table.mjs [--json]
// Heights are feet above the take-off surface; reach = horizontal distance
// from take-off to landing on flat ground.

import { buildLevelModel } from '../src/world/LevelModel.js';
import { BotSim } from '../src/systems/BotSim.js';
import { PlayerController } from '../src/entities/PlayerController.js';
import { WORLD, PLAYER, BOT, DASH } from '../src/core/Constants.js';

const SPEEDS = [150, 160, 175, 195, 200, 230, 240, 250, 260, 280];
const ALL = { double: true, glide: true, wallkick: true, pounce: true, dash: true };

function flatLevel(speed, extra = {}) {
  return {
    id: 'reach', name: 'reach', startX: 100, finishX: 9000, length: 9400,
    sections: [{ name: 'flat', startX: 0, speed }],
    obstacles: [], gaps: [], bones: [], platforms: [], walls: [], updrafts: [],
    enemies: [], breakables: [], hazards: [], ...extra,
  };
}

function startState(sim, speed, flags) {
  const bodyY = WORLD.GROUND_Y - PLAYER.BODY_H;
  return {
    bx: 100 - (PLAYER.FRAME_W / 2 - PLAYER.BODY_OFFSET_X), by: bodyY, vx: speed, vy: 0, gravityY: 0,
    allowGravity: true, onGround: true, speed, ctrl: new PlayerController(flags),
    movers: [], steams: [], breakables: [], dead: false, cause: null, finished: false, handover: false, maxX: 0,
  };
}

/**
 * Runs a press script: presses = [{ f, h }] frames. Returns peak height, airtime
 * (frames from the first press until feet are back on the ground) and reach.
 */
function measure(speed, flags, presses, { level = flatLevel(speed), settle = 20, maxFrames = 900 } = {}) {
  const model = buildLevelModel(level);
  const sim = new BotSim(model, flags);
  const s = startState(sim, speed, flags);
  // settle on the ground
  for (let i = 0; i < settle; i++) sim.step(s, { pressed: false, held: false });
  const groundY = s.by + PLAYER.BODY_H;
  const x0 = s.bx;
  let peak = 0;
  let takeoff = -1;
  let land = -1;
  let landX = null;
  let minVyGlide = null;
  for (let i = 0; i < maxFrames; i++) {
    const pressed = presses.some(p => p.f === i);
    const held = presses.some(p => i >= p.f && i < p.f + p.h);
    const wasGround = s.onGround;
    sim.step(s, { pressed, held });
    if (s.dead) return { dead: s.cause, frame: i };
    const h = groundY - (s.by + PLAYER.BODY_H);
    if (h > peak) peak = h;
    if (takeoff < 0 && wasGround && !s.onGround) takeoff = i;
    if (takeoff >= 0 && s.ctrl.gliding) minVyGlide = Math.max(minVyGlide ?? 0, s.vy);
    if (takeoff >= 0 && s.onGround && land < 0 && i > takeoff + 2) {
      land = i;
      landX = s.bx;
      break;
    }
  }
  return {
    peak: Math.round(peak * 10) / 10,
    airtimeS: land > 0 ? Math.round(((land - takeoff) * BOT.FRAME_MS) / 10) / 100 : null,
    reach: landX !== null ? Math.round(landX - x0 - speed * (takeoff + 1) * BOT.FRAME_MS / 1000) : null,
    glideVy: minVyGlide,
  };
}

// Apex frame of a full jump pressed at frame 0
function apexFrame(speed) {
  const model = buildLevelModel(flatLevel(speed));
  const sim = new BotSim(model, ALL);
  const s = startState(sim, speed, ALL);
  for (let i = 0; i < 20; i++) sim.step(s, { pressed: false, held: false });
  let prev = 0;
  for (let i = 0; i < 120; i++) {
    sim.step(s, { pressed: i === 0, held: i < 23 });
    if (i > 2 && prev < 0 && s.vy >= 0) return i;
    prev = s.vy;
  }
  return 21;
}

const out = { jump: {}, double: {}, glide: {}, doubleGlide: {}, dash: {}, wallKick: {}, pounce: {} };
const apex = apexFrame(200);
for (const v of SPEEDS) {
  const full = measure(v, {}, [{ f: 0, h: 23 }]);
  const tap = measure(v, {}, [{ f: 0, h: 1 }]);
  out.jump[v] = { full, tap };
  // Double at the jump apex; also the best (max reach) press time
  const dblApex = measure(v, ALL, [{ f: 0, h: 23 }, { f: apex + 1, h: 1 }]);
  let best = null;
  for (let f = 24; f < 60; f++) {
    const r = measure(v, { double: true }, [{ f: 0, h: 23 }, { f, h: 1 }]);
    if (r.reach && (!best || r.reach > best.reach)) best = { ...r, pressFrame: f };
  }
  out.double[v] = { atApex: dblApex, maxReach: best };
  out.glide[v] = measure(v, { glide: true }, [{ f: 0, h: 400 }]);
  out.doubleGlide[v] = measure(v, { double: true, glide: true }, [{ f: 0, h: 23 }, { f: apex + 1, h: 400 }]);
  // Dash: jump, double at apex, dash at the double's apex
  const dashR = measure(v, { double: true, dash: true }, [{ f: 0, h: 23 }, { f: apex + 1, h: 1 }, { f: apex + 20, h: 1 }]);
  out.dash[v] = { distance: Math.round(DASH.DURATION_MS / 1000 * DASH.SPEED_MULT * v), jumpDoubleDashReach: dashR.reach, airtimeS: dashR.airtimeS };
}

// Wall kick: a 400 px wall at x=300; jump into it, cling, kick once at the top of the slide
{
  const level = flatLevel(200, { walls: [{ x: 260, w: 64, h: 200 }] });
  const model = buildLevelModel(level);
  const sim = new BotSim(model, ALL);
  const s = startState(sim, 200, ALL);
  let clingY = null;
  let kickPeak = null;
  let kicked = -1;
  for (let i = 0; i < 300; i++) {
    const pressed = i === 30 || (clingY !== null && kicked < 0 && s.ctrl.clinging && s.vy > 0);
    if (pressed && i !== 30) kicked = i;
    sim.step(s, { pressed, held: i >= 30 && i < 53 });
    if (s.ctrl.clinging && clingY === null) clingY = s.by;
    if (kicked >= 0) kickPeak = Math.min(kickPeak ?? s.by, s.by);
  }
  out.wallKick = { kickHeightPx: kickPeak !== null && clingY !== null ? Math.round(clingY - kickPeak) : null };
}

// Pounce: vy = -POUNCE.VELOCITY from ground level, held vs tapped (variable height)
{
  const run = (holdFrames) => {
    const model = buildLevelModel(flatLevel(200));
    const sim = new BotSim(model, ALL);
    const s = startState(sim, 200, ALL);
    for (let i = 0; i < 20; i++) sim.step(s, { pressed: false, held: false });
    const y0 = s.by;
    s.vy = s.ctrl.pounce(null);
    s.onGround = false;
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      sim.step(s, { pressed: false, held: i < holdFrames });
      peak = Math.max(peak, y0 - s.by);
      if (s.onGround) break;
    }
    return Math.round(peak);
  };
  out.pounce = { heldPx: run(60), tappedPx: run(0) };
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('speed | full jump h/air/reach | tap h/reach | double@apex h/reach | double max reach | glide air/reach | dbl+glide reach | jump+dbl+dash reach');
  for (const v of SPEEDS) {
    const j = out.jump[v];
    const d = out.double[v];
    console.log(`${v} | ${j.full.peak}/${j.full.airtimeS}s/${j.full.reach} | ${j.tap.peak}/${j.tap.reach} | ${d.atApex.peak}/${d.atApex.reach} | ${d.maxReach?.reach} (press f${d.maxReach?.pressFrame}) | ${out.glide[v].airtimeS}s/${out.glide[v].reach} | ${out.doubleGlide[v].reach} | ${out.dash[v].jumpDoubleDashReach}`);
  }
  console.log('wall kick:', out.wallKick, ' pounce:', out.pounce, ' glide vy cap:', out.glide[200].glideVy);
}
