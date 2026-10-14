#!/usr/bin/env node
// Proves each ability (and each new element) in isolation, in the sandbox
// rooms (?level=test&room=..., src/levels/sandbox.js), with scripted input in
// deterministic mode. Each test also runs WITHOUT the ability (?abilities=...)
// and checks that the same input then fails or kills Booker.
//
// Usage: node scripts/ability-check.mjs [--url http://localhost:3000] [--only name] [--out output/ability]
// Exit 0 when every check passes. Screenshots of key moments go to --out.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { openDetPage } from './lib/det.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const only = opt('--only', null);
const outDir = opt('--out', 'output/ability');
fs.mkdirSync(outDir, { recursive: true });

const G = 238;            // WORLD.GROUND_Y
const BODY_H = 22;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await launchBrowser();
const errors = [];

/**
 * Opens a room and runs a policy in the page, one fixed frame at a time.
 * policy(s, mem) -> 'press' | 'release' | 'shot' | 'stop' | null, evaluated
 * before each frame. s = { i, x (sprite), bx, by, feet (height of feet above
 * ground), vy, onGround, clinging, gliding, dashing, airJumps, dashes, mode,
 * deaths, cause, stomped, smashed }.
 */
async function runRoom(room, abilities, policySrc, { frames = 360, shots = [] } = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(`${room}: ${String(e)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${room}: ${m.text()}`); });
  const q = `level=test&room=${room}&abilities=${abilities || 'none'}&det=1`;
  await openDetPage(page, `${base}/?${q}`);
  const out = await page.evaluate(({ policySrc, frames }) => {
    const policy = new Function('s', 'mem', policySrc);
    const bus = window.__EVENT_BUS__;
    const E = window.__EVENTS__;
    const counts = { stomped: 0, smashed: 0, kicks: 0, doubles: 0, dashes: 0, clings: 0 };
    const on = (ev, k) => bus.on(ev, () => { counts[k] += 1; });
    on(E.ENEMY_STOMPED, 'stomped');
    on(E.BREAKABLE_SMASHED, 'smashed');
    on(E.PLAYER_WALL_KICK, 'kicks');
    on(E.PLAYER_DOUBLE_JUMP, 'doubles');
    on(E.PLAYER_DASH, 'dashes');
    on(E.PLAYER_WALL_CLING, 'clings');
    const gs = window.__GAME_STATE__;
    const mem = {};
    const trace = [];
    const shotFrames = [];
    for (let i = 0; i < frames; i++) {
      const run = window.__GAME__.scene.getScene('RunScene');
      const p = run.player;
      if (!p) break;
      const b = p.body;
      const c = p.ctrl;
      const s = {
        i, x: p.sprite.x, bx: b.x, by: b.y, feet: 238 - (b.y + b.height), vy: b.velocity.y,
        onGround: p.onGround, clinging: c.clinging, gliding: c.gliding, dashing: c.dashing,
        airJumps: c.airJumps, dashes: c.dashes, mode: gs.mode, deaths: gs.deathLog.length,
        cause: gs.deathLog[0]?.cause || null, ...counts,
      };
      trace.push(s);
      if (s.deaths > 0 || s.mode === 'complete') break;
      const act = policy(s, mem);
      if (act === 'stop') break;
      if (act === 'press') window.__RUN__.press();
      if (act === 'release') window.__RUN__.release();
      if (act === 'shot') shotFrames.push(i);
      window.__DET__.step(1);
    }
    return { trace, shotFrames };
  }, { policySrc, frames });
  for (const name of shots) {
    await page.screenshot({ path: path.join(outDir, `${room}-${abilities || 'none'}-${name}.png`) });
  }
  await page.close();
  const t = out.trace;
  const last = t[t.length - 1] || {};
  return {
    trace: t,
    last,
    died: last.deaths > 0,
    cause: last.cause,
    peak: Math.max(...t.map(s => s.feet)),
    maxX: Math.max(...t.map(s => s.x)),
  };
}

// Shared policy pieces (strings run in the page)
const JUMP_AT = (x, hold = 23) => `
  if (mem.t0 === undefined && s.x >= ${x}) { mem.t0 = s.i; return 'press'; }
  if (mem.t0 !== undefined && s.i === mem.t0 + ${hold}) return 'release';
`;

const tests = {
  async double() {
    // Full jump, then a second press at the apex
    const pol = `${JUMP_AT(300)}
      if (mem.t0 !== undefined && mem.t1 === undefined && s.i > mem.t0 + ${23} && s.vy >= 0) { mem.t1 = s.i; return 'press'; }
      if (mem.t1 !== undefined && s.i === mem.t1 + 6) return 'release';
      if (mem.t1 !== undefined && s.onGround && s.i > mem.t1 + 10) return 'stop';`;
    const yes = await runRoom('flat', 'double', pol);
    const no = await runRoom('flat', 'none', pol);
    check('double jump: reaches ~122 px (jump 69 + double 53)', yes.peak >= 115 && yes.peak <= 128 && yes.last.doubles === 1, `peak ${yes.peak.toFixed(1)} px`);
    check('double jump: without it the second press does nothing', no.peak < 75 && no.last.doubles === 0, `peak ${no.peak.toFixed(1)} px`);
  },

  async glide() {
    const pol = `${JUMP_AT(300, 200)}
      if (mem.t0 !== undefined && s.onGround && s.i > mem.t0 + 10) return 'stop';`;
    const yes = await runRoom('flat', 'glide', pol, { frames: 400 });
    const no = await runRoom('flat', 'none', pol, { frames: 400 });
    // fastest fall once Booker has been falling for 8+ frames (the glide brakes over the first few)
    const fall = (r) => {
      const apex = r.trace.findIndex(t => t.i > 0 && !t.onGround && t.vy > 0);
      return Math.max(0, ...r.trace.filter(s => apex >= 0 && s.i >= r.trace[apex].i + 8 && !s.onGround).map(s => s.vy));
    };
    const air = (r) => r.trace.filter(s => !s.onGround && s.i > 0).length / 60;
    check('glide: holding caps the fall speed at 55 px/s', fall(yes) <= 56 && yes.trace.some(s => s.gliding), `max fall ${fall(yes).toFixed(0)} px/s, airtime ${air(yes).toFixed(2)} s`);
    check('glide: without it Booker falls fast', fall(no) > 200 && air(no) < air(yes) - 0.5, `max fall ${fall(no).toFixed(0)} px/s, airtime ${air(no).toFixed(2)} s`);
  },

  async updraft() {
    // Jump at the chasm edge and hold: glide into the updraft at x 760-824
    const pol = `${JUMP_AT(588, 600)}
      if (s.x > 1120 && s.onGround) return 'stop';`;
    const yes = await runRoom('updraft', 'glide', pol, { frames: 500, shots: [] });
    const no = await runRoom('updraft', 'double', pol, { frames: 500 });
    const inDraft = yes.trace.filter(s => s.bx + 26 > 760 && s.bx < 824);
    const rise = inDraft.length ? Math.max(...inDraft.map(s => s.feet)) - inDraft[0].feet : 0;
    check('updraft: lifts a gliding Booker', rise > 20 && !yes.died && yes.maxX > 1100, `rose ${rise.toFixed(0)} px in the updraft, reached x ${yes.maxX.toFixed(0)}`);
    check('updraft: without glide no lift, he falls in the chasm', no.died && no.cause === 'pit', `cause ${no.cause}`);
  },

  async wallkick() {
    // Jump into the 140 px wall at x 640, then tap whenever clinging
    const pol = `${JUMP_AT(600)}
      if (s.clinging && (mem.last === undefined || s.i - mem.last > 12)) { mem.last = s.i; mem.rel = s.i + 5; return 'press'; }
      if (mem.rel === s.i) return 'release';
      if (s.x > 800 && s.onGround) return 'stop';`;
    const yes = await runRoom('wall', 'wallkick', pol, { frames: 400 });
    const no = await runRoom('wall', 'double', pol, { frames: 400 });
    const onTop = yes.trace.some(s => s.onGround && Math.abs(s.feet - 140) < 1);
    check('wall kick: clings and kicks up a 140 px wall', onTop && !yes.died && yes.last.kicks >= 1 && yes.maxX > 780, `kicks ${yes.last.kicks}, stood on top ${onTop}`);
    check('wall kick: without it the wall stops Booker (a hit)', no.died && no.cause === 'wall', `cause ${no.cause}`);
  },

  async pounce() {
    // Find a jump x that lands on the vacuum at x 700, then repeat it without pounce
    let hit = null;
    for (let x = 560; x <= 660 && !hit; x += 6) {
      const r = await runRoom('vacuum', 'pounce', `${JUMP_AT(x, 60)} if (s.x > 820) return 'stop';`, { frames: 260 });
      if (r.last.stomped >= 1) hit = { x, r };
    }
    const bounce = hit ? Math.min(...hit.r.trace.slice(hit.r.trace.findIndex(s => s.stomped >= 1)).slice(0, 6).map(s => s.vy)) : 0;
    check('pounce: landing on a vacuum stomps it and bounces', !!hit && !hit.r.died && bounce < -300, hit ? `jump at x ${hit.x}, bounce vy ${bounce.toFixed(0)}` : 'no jump x stomped');
    if (hit) {
      const no = await runRoom('vacuum', 'none', `${JUMP_AT(hit.x, 60)} if (s.x > 820) return 'stop';`, { frames: 260 });
      check('pounce: without it the same landing is a hit', no.died && no.cause === 'vacuum', `cause ${no.cause}`);
    }
    const side = await runRoom('vacuum', 'all', `if (s.x > 820) return 'stop';`, { frames: 260 });
    check('enemy: running into a vacuum from the side is a hit (even with pounce)', side.died && side.cause === 'vacuum', `cause ${side.cause}`);
  },

  async dash() {
    // jump, double, dash in quick taps; scan the start x for a smash
    const seq = (x) => `
      if (mem.t0 === undefined && s.x >= ${x}) { mem.t0 = s.i; return 'press'; }
      if (mem.t0 !== undefined) {
        const d = s.i - mem.t0;
        if (d === 6 || d === 13 || d === 20) return 'release';
        if (d === 7 || d === 14) return 'press';
      }
      if (s.x > 820 && s.onGround) return 'stop';`;
    let hit = null;
    for (let x = 500; x <= 680 && !hit; x += 6) {
      const r = await runRoom('boxes', 'double,dash', seq(x), { frames: 260, shots: [] });
      if (r.last.smashed >= 1 && !r.died) hit = { x, r };
    }
    check('dash: a dash smashes boxes', !!hit, hit ? `start x ${hit.x}, dashes ${hit.r.last.dashes}` : 'no start x smashed the boxes');
    if (hit) {
      const no = await runRoom('boxes', 'double', seq(hit.x), { frames: 260 });
      check('dash: without it the boxes are a hit', no.died && no.cause === 'boxes', `cause ${no.cause}`);
      const dist = (() => {
        const t = hit.r.trace;
        const a = t.findIndex(s => s.dashing);
        if (a < 0) return 0;
        let b = a;
        while (b < t.length && t[b].dashing) b++;
        return t[b - 1].x - t[a].x;
      })();
      check('dash: moves ~2x speed with no gravity', dist > 90, `dash covered ${dist.toFixed(0)} px`);
    }
    const gate = await runRoom('gate', 'none', `if (s.x > 820) return 'stop';`, { frames: 260 });
    check('breakable: running into a gate is a hit', gate.died && gate.cause === 'gate', `cause ${gate.cause}`);
  },

  async platform() {
    // Full jump from below: passes up through the platform (y 60) and lands on top
    const pol = `${JUMP_AT(560)} if (s.x > 800) return 'stop';`;
    const r = await runRoom('platform', 'none', pol, { frames: 300 });
    const onTop = r.trace.some(s => s.onGround && Math.abs(s.feet - 60) < 1);
    check('platform: one-way (jump up through it, land on top)', onTop && !r.died, `stood on top ${onTop}`);
  },

  async steam() {
    const off = await runRoom('steam', 'none', `if (s.x > 800) return 'stop';`, { frames: 400 });
    const hot = await runRoom('steam-hot', 'none', `if (s.x > 800) return 'stop';`, { frames: 400 });
    check('steam: a vent that is off is safe', !off.died, `died ${off.died}`);
    check('steam: a firing vent is a hit', hot.died && hot.cause === 'steam', `cause ${hot.cause}`);
  },

  async botplan() {
    // The planner bot with a scripted stretch: it must follow the script (2 presses) and clear the pit
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', e => errors.push(`script: ${String(e)}`));
    await openDetPage(page, `${base}/?level=test&room=script&abilities=double&autoplay=1&det=1`);
    let st = null;
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.advanceTime(500));
      st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      if (st.mode === 'complete' || st.deathLog.length) break;
    }
    await page.close();
    const bot = st?.bot || {};
    check('botPlan: the bot follows a scripted stretch and clears the pit', st?.mode === 'complete' && st.deathLog.length === 0 && bot.scripted === 2,
      `mode ${st?.mode}, deaths ${st?.deathLog?.length}, scripted presses ${bot.scripted}, planner searches ${bot.searches}`);
  },

  async pigeon() {
    const r = await runRoom('pigeon', 'none', `if (s.x > 1000) return 'stop';`, { frames: 400 });
    check('pigeon: a low pigeon flying left hits a running Booker', r.died && r.cause === 'pigeon', `cause ${r.cause}`);
  },

  async landbuffer() {
    // A press while falling, a few frames before landing, waits for the ground and
    // is a full jump (JUMP.LAND_BUFFER), not a low double jump. The same press high
    // above the ground (at the apex) is still a double jump (see 'double').
    const pol = `${JUMP_AT(300)}
      if (mem.t0 !== undefined && mem.t1 === undefined && s.i > mem.t0 + 10 && s.vy > 0 && s.feet < 22) { mem.t1 = s.i; mem.f1 = s.feet; return 'press'; }
      if (mem.t1 !== undefined && s.i === mem.t1 + 23) return 'release';
      if (mem.t1 !== undefined && mem.land === undefined && s.onGround) mem.land = s.i;
      if (mem.land !== undefined && s.onGround && s.i > mem.land + 10) return 'stop';`;
    const r = await runRoom('flat', 'double', pol, { frames: 300 });
    const t1 = r.trace.findIndex(t => t.vy > 0 && t.feet < 22 && t.i > 30);
    const land = r.trace.findIndex((t, i) => i > t1 && t.onGround);
    const peak2 = Math.max(...r.trace.slice(land).map(t => t.feet));
    check('landing buffer: a press just before landing is a full jump, not a double',
      r.last.doubles === 0 && peak2 >= 60 && land - t1 <= 5,
      `pressed ${land - t1} frames before landing, doubles ${r.last.doubles}, second jump peak ${peak2.toFixed(1)} px`);
  },

  async wallhit() {
    // Without wall kick, a press in the very frame Booker hits a wall face: the
    // controller also starts a jump that frame, but the dead dog must not jump
    // (no PLAYER_JUMP after PLAYER_DIED) or switch back to the run animation.
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', e => errors.push(`wallhit: ${String(e)}`));
    await openDetPage(page, `${base}/?level=test&room=wall&abilities=none&det=1`);
    const r = await page.evaluate(() => {
      const bus = window.__EVENT_BUS__;
      const E = window.__EVENTS__;
      const log = [];
      bus.on(E.PLAYER_DIED, (d) => log.push(`died:${d.cause}`));
      bus.on(E.PLAYER_JUMP, () => log.push('jump'));
      const run = window.__GAME__.scene.getScene('RunScene');
      const wallX = run.model.walls[0].x;
      let sameFrameJump = false;
      for (let i = 0; i < 400; i++) {
        const b = run.player.body;
        // This frame's physics step will press Booker against the face
        const pressNow = !log.length && b.x + b.width + b.velocity.x / 60 >= wallX - 1;
        if (pressNow) window.__RUN__.press();
        window.__DET__.step(1);
        if (pressNow) {
          sameFrameJump = run.player.ctrl.jumping;   // the controller took the press
          window.__RUN__.release();
        }
        if (log.some(e => e.startsWith('died'))) {
          window.__DET__.step(3);
          break;
        }
      }
      return { log, sameFrameJump, anim: run.player.sprite.anims.currentAnim?.key };
    });
    await page.close();
    const di = r.log.findIndex(e => e.startsWith('died'));
    check('wall hit: a press in the hit frame does not jump the dead dog',
      r.log[di] === 'died:wall' && r.sameFrameJump && !r.log.slice(di).includes('jump') && r.anim === 'booker-hurt',
      `events ${r.log.join(' ')}, controller jumped that frame ${r.sameFrameJump}, anim ${r.anim}`);
  },
};

for (const [name, fn] of Object.entries(tests)) {
  if (only && only !== name) continue;
  try {
    await fn();
  } catch (err) {
    check(`${name}: threw`, false, String(err).slice(0, 200));
  }
}

await browser.close();
if (errors.length) console.log('errors:', errors.slice(0, 10));
const failed = results.filter(r => !r.ok).length;
console.log(`ability-check: ${results.length - failed}/${results.length} passed${errors.length ? `, ${errors.length} page errors` : ''}`);
process.exit(failed || errors.length ? 1 : 0);
