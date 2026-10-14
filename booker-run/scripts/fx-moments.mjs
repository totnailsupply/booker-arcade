#!/usr/bin/env node
// Screenshots of the Levels 2-6 effects at exact moments (deterministic mode).
// Each moment opens a sandbox room or a level, drives the button with a small
// policy (like ability-check.mjs) and takes screenshots when the policy asks.
//
// Usage:
//   node scripts/fx-moments.mjs [--only double,glide] [--out output/fx2] [--url http://localhost:3000]
// Moments: double glide updraft cling kick pounce drone dash gate steam golden amb2..amb6

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
const only = opt('--only', '').split(',').filter(Boolean);
const outDir = opt('--out', 'output/fx2');
fs.mkdirSync(outDir, { recursive: true });

// Policy pieces (strings run in the page; s = per-frame state, mem = scratch)
const JUMP_AT = (x, hold = 23) => `
  if (mem.t0 === undefined && s.x >= ${x}) { mem.t0 = s.i; return 'press'; }
  if (mem.t0 !== undefined && s.i === mem.t0 + ${hold}) return 'release';
`;
const SHOTS_AFTER = (key, list, prefix) => list.map(d => `
  if (mem.${key} !== undefined && s.i === mem.${key} + ${d}) return 'shot:${prefix}-${String(d).padStart(2, '0')}';`).join('');

const DASH_SEQ = (x) => `
  if (mem.t0 === undefined && s.x >= ${x}) { mem.t0 = s.i; return 'press'; }
  if (mem.t0 !== undefined) {
    const d = s.i - mem.t0;
    if (d === 6 || d === 13 || d === 20) return 'release';
    if (d === 7 || d === 14) return 'press';
  }
  if (mem.dash === undefined && s.dashing) mem.dash = s.i;
  if (mem.smash === undefined && s.smashed > 0) mem.smash = s.i;
`;

const AMB = (n) => ({
  q: `level=${n}&autoplay=1`,
  frames: 3600,
  // A pit (or grill / vent) on screen, then a later moment
  policy: `
    if (mem.k === undefined) mem.k = 0;
    const g = s.gaps.find(g => g.x - s.x > 140 && g.x - s.x < 200);
    if (g && mem.lastG !== g.x && mem.k < 2) { mem.lastG = g.x; mem.k++; mem.at = s.i; }
    if (mem.at !== undefined && s.i === mem.at + 20) return 'shot:pit' + mem.k;
    if (s.i === 900) return 'shot:mid';
    if (s.i > 1000 && mem.k >= 2) return 'stop';
    if (s.i > 1800) return 'stop';`,
});

const MOMENTS = {
  double: {
    q: 'level=test&room=flat&abilities=double',
    policy: `${JUMP_AT(300)}
      if (mem.t0 !== undefined && mem.t1 === undefined && s.i > mem.t0 + 23 && s.vy >= 0) { mem.t1 = s.i; return 'press'; }
      if (mem.t1 !== undefined && s.i === mem.t1 + 6) return 'release';
      ${SHOTS_AFTER('t1', [1, 3, 6, 10, 16], 'double')}
      if (mem.t1 !== undefined && s.i > mem.t1 + 20) return 'stop';`,
  },
  glide: {
    q: 'level=test&room=flat&abilities=glide',
    frames: 400,
    policy: `${JUMP_AT(300, 140)}
      if (mem.g === undefined && s.gliding) mem.g = s.i;
      ${SHOTS_AFTER('g', [4, 20, 45, 70], 'glide')}
      if (mem.t0 !== undefined && s.i === mem.t0 + 142) return 'shot:glide-end';
      if (mem.t0 !== undefined && s.i === mem.t0 + 150) return 'shot:glide-end2';
      if (mem.t0 !== undefined && s.i > mem.t0 + 152) return 'stop';`,
  },
  updraft: {
    q: 'level=test&room=updraft&abilities=glide',
    frames: 500,
    policy: `
      if (s.i === 60) return 'shot:updraft-approach';
      ${JUMP_AT(588, 600)}
      if (mem.u === undefined && s.bx + 26 > 760) mem.u = s.i;
      ${SHOTS_AFTER('u', [6, 20], 'updraft-in')}
      if (mem.u !== undefined && s.i > mem.u + 22) return 'stop';`,
  },
  cling: {
    q: 'level=test&room=wall&abilities=wallkick',
    frames: 400,
    policy: `${JUMP_AT(600)}
      if (mem.c === undefined && s.clinging) mem.c = s.i;
      ${SHOTS_AFTER('c', [1, 8, 18], 'cling')}
      if (mem.c !== undefined && s.i === mem.c + 24) { mem.k = s.i; return 'press'; }
      if (mem.k !== undefined && s.i === mem.k + 5) return 'release';
      ${SHOTS_AFTER('k', [1, 3, 6, 12], 'kick')}
      if (mem.k !== undefined && s.i > mem.k + 14) return 'stop';`,
  },
  pounce: {
    q: 'level=test&room=vacuum&abilities=pounce',
    frames: 260,
    scan: { from: 560, to: 660, step: 6, ok: 'stomped' },
    policy: (x) => `${JUMP_AT(x, 60)}
      if (s.i === 40) return 'shot:vacuum-idle';
      if (mem.p === undefined && s.stomped > 0) mem.p = s.i;
      ${SHOTS_AFTER('p', [0, 2, 4, 8, 14, 24], 'pounce')}
      if (mem.p !== undefined && s.i > mem.p + 26) return 'stop';
      if (s.x > 820) return 'stop';`,
  },
  drone: {
    q: 'level=test&room=drone&abilities=pounce',
    frames: 200,
    policy: `
      if (s.i === 100 || s.i === 104 || s.i === 140) return 'shot:drone-' + s.i;
      if (s.i > 141) return 'stop';`,
  },
  dash: {
    q: 'level=test&room=boxes&abilities=double,dash',
    frames: 260,
    scan: { from: 500, to: 680, step: 6, ok: 'smashed' },
    policy: (x) => `${DASH_SEQ(x)}
      ${SHOTS_AFTER('dash', [1, 3, 6], 'dash')}
      ${SHOTS_AFTER('smash', [0, 2, 5, 10, 20], 'smash')}
      if (mem.smash !== undefined && s.i > mem.smash + 22) return 'stop';
      if (s.x > 820 && s.onGround) return 'stop';`,
  },
  gate: {
    q: 'level=test&room=gate&abilities=double,dash',
    frames: 260,
    scan: { from: 500, to: 680, step: 4, ok: 'smashed' },
    // a low hop, a quick double and an early dash (the gate is only 56 px tall)
    policy: (x) => `
      if (mem.t0 === undefined && s.x >= ${x}) { mem.t0 = s.i; return 'press'; }
      if (mem.t0 !== undefined) {
        const d = s.i - mem.t0;
        if (d === 4 || d === 8 || d === 12) return 'release';
        if (d === 5 || d === 9) return 'press';
      }
      if (mem.smash === undefined && s.smashed > 0) mem.smash = s.i;
      ${SHOTS_AFTER('smash', [0, 3, 8, 16], 'gate')}
      if (mem.smash !== undefined && s.i > mem.smash + 18) return 'stop';
      if (s.x > 820 && s.onGround) return 'stop';`,
  },
  steam: {
    q: 'level=test&room=steam&abilities=none',
    frames: 400,
    // vent at x 700: clock starts when Booker is 480 px away; period 1600, on 600, windup 450
    policy: `
      if (s.steam && s.steam.active) {
        const p = s.steam.p;
        if (!mem.w1 && p >= 1170 && p < 1600) { mem.w1 = 1; return 'shot:steam-windup-early'; }
        if (!mem.w2 && p >= 1480) { mem.w2 = 1; return 'shot:steam-windup-late'; }
        if (mem.w2 && !mem.o1 && p >= 40 && p < 600) { mem.o1 = 1; return 'shot:steam-on-start'; }
        if (mem.o1 && !mem.o2 && p >= 380 && p < 600) { mem.o2 = 1; return 'shot:steam-on-mid'; }
        if (mem.o2 && !mem.f && p >= 640 && p < 1100) { mem.f = 1; return 'shot:steam-off'; }
      }
      if (mem.f) return 'stop';`,
  },
  golden: {
    q: 'level=6&abilities=none&x=FINISH-380',
    frames: 300,
    policy: `
      if (s.i === 30) return 'shot:golden-far';
      if (s.i === 90) return 'shot:golden-near';
      if (mem.c === undefined && s.mode === 'complete') mem.c = s.i;
      ${SHOTS_AFTER('c', [2, 12, 30], 'golden-win')}
      if (mem.c !== undefined && s.i > mem.c + 32) return 'stop';`,
  },
  // Pixel-font banners ("GO!", "SPEED UP!") and the "+10" bone pop, on Level 1
  banner: {
    q: 'level=1&autoplay=1&x=SECTION2-150',
    frames: 200,
    policy: `
      if (s.i === 14) return 'shot:go';
      if (mem.b === undefined) mem.b = s.bones;
      if (s.bones > mem.b && mem.bt === undefined) mem.bt = s.i;
      if (mem.bt !== undefined && s.i === mem.bt + 8) return 'shot:bone';
      if (mem.sec === undefined && s.section > 1) mem.sec = s.i;
      if (mem.sec !== undefined && s.i === mem.sec + 14) return 'shot:speedup';
      if (mem.sec !== undefined && s.i > mem.sec + 16 && mem.bt !== undefined && s.i > mem.bt + 10) return 'stop';`,
  },
  amb2: AMB(2),
  amb3: AMB(3),
  amb4: AMB(4),
  amb5: AMB(5),
  amb6: AMB(6),
};

const browser = await launchBrowser();
const errors = [];

async function openRun(q) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(`${q}: ${String(e)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${q}: ${m.text()}`); });
  if (q.includes('FINISH')) {
    // Resolve x=FINISH-n from the level data
    const lv = parseInt(/level=(\d+)/.exec(q)[1], 10);
    const mod = await import(path.resolve(`src/levels/level${lv}.js`));
    const data = Object.values(mod)[0];
    q = q.replace(/FINISH-(\d+)/, (_m, d) => String(data.finishX - parseInt(d, 10)));
  }
  if (q.includes('SECTION2')) {
    const mod = await import(path.resolve('src/levels/level1.js'));
    const L = mod.LEVEL1;
    q = q.replace(/SECTION2-(\d+)/, (_m, d) => String(L.startX + L.sections[1].startX - parseInt(d, 10)));
  }
  await openDetPage(page, `${base}/?${q}&det=1`);
  return page;
}

/** Runs a policy frame by frame. Returns { shots, last }. */
async function run(page, policySrc, frames, name, takeShots = true) {
  await page.evaluate((src) => {
    const bus = window.__EVENT_BUS__;
    const E = window.__EVENTS__;
    const counts = { stomped: 0, smashed: 0 };
    bus.on(E.ENEMY_STOMPED, () => { counts.stomped += 1; });
    bus.on(E.BREAKABLE_SMASHED, () => { counts.smashed += 1; });
    window.__FXM__ = { policy: new Function('s', 'mem', src), mem: {}, i: 0, counts };
  }, policySrc);
  const shots = [];
  let last = null;
  for (;;) {
    const r = await page.evaluate((maxFrames) => {
      const st = window.__FXM__;
      const gs = window.__GAME_STATE__;
      while (st.i < maxFrames) {
        const runScene = window.__GAME__.scene.getScene('RunScene');
        const p = runScene.player;
        if (!p) return { done: true };
        const b = p.body;
        const c = p.ctrl;
        const w = runScene.world;
        const st0 = w.model.steams[0];
        const ss0 = w.steamStates[0];
        const s = {
          i: st.i, x: p.sprite.x, bx: b.x, by: b.y, vy: b.velocity.y, onGround: p.onGround,
          clinging: c.clinging, gliding: c.gliding, dashing: c.dashing, mode: gs.mode,
          deaths: gs.deathLog.length, gaps: w.model.gaps, bones: gs.bones, section: gs.section,
          steam: st0 ? { active: ss0.active, p: ((ss0.clock + st0.offset) % st0.period + st0.period) % st0.period } : null,
          ...st.counts,
        };
        const act = st.policy(s, st.mem);
        if (act === 'stop') return { done: true, s };
        if (typeof act === 'string' && act.startsWith('shot:')) {
          st.i += 1;            // the shot shows the frame already rendered; step on next call
          return { shot: act.slice(5), s };
        }
        if (act === 'press') window.__RUN__.press();
        if (act === 'release') window.__RUN__.release();
        window.__DET__.step(1);
        st.i += 1;
        if (gs.mode === 'gameover' || s.deaths > 0 && gs.mode !== 'dying') return { done: true, s };
      }
      return { done: true };
    }, frames);
    if (r.s) last = r.s;
    if (r.shot && takeShots) {
      const file = path.join(outDir, `${name}-${r.shot}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
    }
    if (r.done) break;
  }
  return { shots, last };
}

for (const [name, m] of Object.entries(MOMENTS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    let policy = m.policy;
    if (m.scan) {
      // Find a start x that triggers the event, then rerun it with shots
      let found = null;
      for (let x = m.scan.from; x <= m.scan.to && found === null; x += m.scan.step) {
        const page = await openRun(m.q);
        const { last } = await run(page, m.policy(x), m.frames || 360, name, false);
        await page.close();
        if (last && last[m.scan.ok] > 0 && !last.deaths) found = x;
      }
      if (found === null) {
        console.log(`${name}: no start x worked`);
        continue;
      }
      policy = m.policy(found);
    }
    const page = await openRun(m.q);
    const { shots, last } = await run(page, policy, m.frames || 360, name);
    await page.close();
    console.log(`${name}: ${shots.length} shots (last x ${Math.round(last?.x || 0)}, deaths ${last?.deaths ?? '?'})`);
    for (const f of shots) console.log(`  ${f}`);
  } catch (err) {
    console.log(`${name}: threw ${String(err).slice(0, 200)}`);
    errors.push(String(err));
  }
}

await browser.close();
if (errors.length) console.log('errors:', errors.slice(0, 10));
process.exit(errors.length ? 1 : 0);
