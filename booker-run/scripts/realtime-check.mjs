#!/usr/bin/env node
// Real-time frame-rate fidelity check.
//
// Real players run the game in real time, often at 120 Hz or 144 Hz, with
// frame drops and hitches. Gameplay must still match the deterministic tuning
// (?det=1, fixed 1/60 s frames) that the bot and the level designers use.
//
// 1. Record: one deterministic bot run per level (?autoplay=1&det=1). Kept:
//    the input timeline (fresh presses and held changes, keyed by game time),
//    Booker's body position at every gameplay update, the outcome, and how long
//    each bot plan took (real ms).
// 2. Replay that input timeline in real-time mode (no bot, no ?det) on a
//    virtual display: requestAnimationFrame fires with vsync-like timestamps
//    (1000/hz apart, 0.1 ms resolution) as fast as the page can go, and
//    performance.now() / Date.now() follow the same clock, so a run doesn't
//    depend on machine load. Variants per level:
//      det replay     the same replay in deterministic mode (self-test of the method)
//      @hz            each --rates value (default 30, 60, 120, 144)
//      hitch#seed     60 Hz with random 100-300 ms stalls every 1-3 s of game time
//      bot-hitch      60 Hz with stalls as long as the recorded bot plans, where they ran
// 3. Compare each replay with the recording at equal game time (time since the
//    run's first gameplay update): Booker's body x/y, death, completion, bones.
//
// Optional --bot: also plays the level with the real bot in real-time mode on
// the virtual display at each rate, adding every plan's real duration to the
// clock (the hitch the bot itself causes), and reports the outcome.
//
// Usage:
//   node scripts/realtime-check.mjs [--levels 2,3,4,5,6] [--rates 30,60,120,144]
//        [--hitch-seeds 2] [--no-bot-hitch] [--bot] [--tolerance 0.01] [--workers 4]
//        [--url http://localhost:3000] [--json file]
// Exit 0 when every replay matches its recording (trajectory within --tolerance
// px, same death / completion / bones) and every --bot run finishes with 0 deaths.

import fs from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';
import { openDetPage, stepGame } from './lib/det.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const levels = opt('--levels', '2,3,4,5,6').split(',').map(s => s.trim()).filter(Boolean);
const rates = opt('--rates', '30,60,120,144').split(',').map(Number).filter(n => n > 0);
const hitchSeeds = parseInt(opt('--hitch-seeds', '2'), 10) || 0;
const botHitch = !args.includes('--no-bot-hitch');
const liveBot = args.includes('--bot');
const tolerance = parseFloat(opt('--tolerance', '0.01'));
const workers = parseInt(opt('--workers', '4'), 10) || 1;
const jsonOut = opt('--json', null);

const FRAME = 1000 / 60;
const MAX_REAL_MS = 15 * 60 * 1000;   // per run

// ---------------------------------------------------------------------------
// Page side (serialised into the page; no closures over Node values)
// ---------------------------------------------------------------------------

function pageInit(cfg) {
  const realNow = performance.now.bind(performance);
  const st = {
    cfg, traj: [], inputs: [], plans: [], firstDt: null, frames: 0, hitches: 0, hitchMs: 0, ended: null, maxTicks: 0,
  };
  window.__RTC__ = st;
  const tau = () => window.__GAME_STATE__.runTimeMs - st.firstDt;

  // Hooks the run once RunScene exists (after its first gameplay update)
  function patch() {
    if (st.firstDt !== null) return true;
    const run = window.__GAME__?.scene?.getScene('RunScene');
    if (!run || !run.input_ || !run.player) return false;
    const gs = window.__GAME_STATE__;
    st.firstDt = gs.runTimeMs;
    const inp = run.input_;
    const orig = inp.poll.bind(inp);
    const tl = cfg.timeline || [];
    let ti = 0;
    let held = false;
    inp.poll = () => {
      const t = tau();
      let r;
      if (cfg.mode === 'replay') {
        orig();
        let pressed = false;
        while (ti < tl.length && tl[ti].t <= t + 1e-6) {
          const e = tl[ti++];
          if (e.p) pressed = true;
          held = e.h;
        }
        r = { pressed, held };
      } else {
        r = orig();
        if (r.pressed || r.held !== held) {
          st.inputs.push({ t, p: r.pressed, h: r.held });
          held = r.held;
        }
      }
      const b = run.player.body;
      st.traj.push([Math.round(t * 1000) / 1000, b.x, b.y]);
      return r;
    };
    const ap = run.autopilot;
    if (ap && typeof ap.plan === 'function') {
      const op = ap.plan.bind(ap);
      ap.plan = () => {
        const a = realNow();
        op();
        const ms = realNow() - a;
        st.plans.push({ t: tau(), ms });
        if (cfg.mode === 'bot') st.pendingHitch = (st.pendingHitch || 0) + ms;
      };
    }
    return true;
  }

  function checkEnd() {
    if (st.ended || st.firstDt === null) return;
    const gs = window.__GAME_STATE__;
    if (gs.deathLog.length) st.ended = { kind: 'death', death: gs.deathLog[0] };
    else if (gs.mode === 'complete') st.ended = { kind: 'complete' };
    if (st.ended) {
      Object.assign(st.ended, {
        tau: tau(), bones: gs.bones, bonesTotal: gs.bonesTotal, score: gs.result?.score ?? null,
      });
    }
  }
  st.patch = patch;
  st.checkEnd = checkEnd;
  if (cfg.mode === 'record' || cfg.det) return;

  // Virtual display: rAF at cfg.hz with vsync-like timestamps
  const period = 1000 / cfg.hz;
  const t0 = Math.round(realNow());
  const dateOff = Date.now() - t0;
  let vt = t0;
  let k = 0;
  let extra = 0;
  performance.now = () => vt;
  Date.now = () => vt + dateOff;
  let queue = [];
  let nextId = 1;
  let scheduled = false;
  const hitches = (cfg.hitches || []).slice();
  const stall = (ms) => {
    // A frame that took ms longer: the next vsync is that much (rounded up) later
    extra += Math.ceil(ms / period) * period;
    st.hitches += 1;
    st.hitchMs += ms;
  };
  function frame() {
    scheduled = false;
    if (st.ended) return;            // freeze the game where it ended
    st.frames += 1;
    if (patch()) {
      checkEnd();
      if (st.ended) return;
      while (hitches.length && tau() >= hitches[0].t) stall(hitches.shift().ms);
      if (st.pendingHitch) {
        stall(st.pendingHitch);
        st.pendingHitch = 0;
      }
    }
    k += 1;
    vt = Math.round((t0 + k * period + extra) * 10) / 10;
    const q = queue;
    queue = [];
    const run = window.__GAME__?.scene?.getScene('RunScene');
    const before = run?.ticks;
    for (const e of q) e.cb(vt);
    // Gameplay ticks this frame ran (RunScene.ticks; absent before the fixed-tick loop)
    if (typeof before === 'number' && run.ticks >= before) st.maxTicks = Math.max(st.maxTicks, run.ticks - before);
  }
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    if (!scheduled) {
      scheduled = true;
      setTimeout(frame, 0);
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    queue = queue.filter(e => e.id !== id);
  };
}

// ---------------------------------------------------------------------------
// Node side
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHitches(seed, untilMs) {
  const rnd = mulberry32(seed * 9973 + 17);
  const out = [];
  for (let t = 1000 + rnd() * 2000; t < untilMs; t += 1000 + rnd() * 2000) {
    out.push({ t, ms: 100 + rnd() * 200 });
  }
  return out;
}

const pageErrors = (page, errors) => {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
};

async function readEnd(page) {
  return page.evaluate(() => {
    const st = window.__RTC__;
    return { ended: st.ended, traj: st.traj, inputs: st.inputs, plans: st.plans, frames: st.frames, hitches: st.hitches, hitchMs: st.hitchMs, maxTicks: st.maxTicks };
  });
}

/** Deterministic bot run: the reference. */
async function record(browser, levelId) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  pageErrors(page, errors);
  await page.addInitScript(pageInit, { mode: 'record' });
  await openDetPage(page, `${base}/?autoplay=1&level=${levelId}&det=1`);
  await page.evaluate(() => window.__RTC__.patch());
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_REAL_MS) {
    await stepGame(page, 500);
    const done = await page.evaluate(() => { window.__RTC__.checkEnd(); return !!window.__RTC__.ended; });
    if (done) break;
  }
  const r = await readEnd(page);
  await page.close();
  return { ...r, errors };
}

/** Real-time run on the virtual display. mode 'replay' (input timeline) or 'bot'. */
async function playRealtime(browser, levelId, cfg) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  pageErrors(page, errors);
  await page.addInitScript(pageInit, cfg);
  const q = cfg.mode === 'bot' ? `autoplay=1&level=${levelId}` : `level=${levelId}`;
  const t0 = Date.now();
  if (cfg.det) {
    // Self-test: the same replay in deterministic mode must reproduce the recording
    await openDetPage(page, `${base}/?${q}&det=1`);
    await page.evaluate(() => window.__RTC__.patch());
    while (Date.now() - t0 < MAX_REAL_MS) {
      await stepGame(page, 500);
      const done = await page.evaluate(() => { window.__RTC__.checkEnd(); return !!window.__RTC__.ended; });
      if (done) break;
    }
  } else {
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__RTC__ && window.__RTC__.ended, null, { timeout: MAX_REAL_MS, polling: 250 });
  }
  const r = await readEnd(page);
  await page.close();
  return { ...r, errors, wallS: Math.round((Date.now() - t0) / 100) / 10 };
}

/** Booker's position in the reference at game time t (linear between samples). */
function makeLookup(traj) {
  const ts = traj.map(s => s[0]);
  return (t) => {
    let lo = 0;
    let hi = ts.length - 1;
    if (t <= ts[0]) return traj[0];
    if (t >= ts[hi]) return traj[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) lo = mid; else hi = mid;
    }
    const a = traj[lo];
    const b = traj[hi];
    if (Math.abs(a[0] - t) < 1e-6) return a;
    const f = (t - a[0]) / (b[0] - a[0]);
    return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

function compare(ref, run) {
  const at = makeLookup(ref.traj);
  const endT = Math.min(ref.ended?.tau ?? Infinity, run.ended?.tau ?? Infinity);
  let maxDx = 0;
  let maxDy = 0;
  let first = null;
  for (const [t, x, y] of run.traj) {
    if (t > endT) break;
    const r = at(t);
    const dx = Math.abs(x - r[1]);
    const dy = Math.abs(y - r[2]);
    maxDx = Math.max(maxDx, dx);
    maxDy = Math.max(maxDy, dy);
    if (!first && (dx > tolerance || dy > tolerance)) {
      first = { t: Math.round(t), x: Math.round(r[1] + 14), dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 };
    }
  }
  const e0 = ref.ended || {};
  const e1 = run.ended || {};
  const outcome = (e) => (e.kind === 'death' ? `death ${e.death.cause}@${e.death.x}` : e.kind || 'none');
  const sameOutcome = outcome(e0) === outcome(e1);
  const sameBones = e0.bones === e1.bones;
  return {
    maxDx: Math.round(maxDx * 1000) / 1000,
    maxDy: Math.round(maxDy * 1000) / 1000,
    firstDiverge: first,
    refOutcome: outcome(e0),
    outcome: outcome(e1),
    bones: `${e1.bones}/${e0.bones}`,
    endT: `${Math.round(e1.tau ?? 0)}/${Math.round(e0.tau ?? 0)}`,
    pass: !first && sameOutcome && sameBones && !run.errors.length,
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// --- main ---------------------------------------------------------------------

const browsers = [];
const getBrowser = async (i) => {
  if (!browsers[i]) browsers[i] = await launchBrowser({ headless: true });
  return browsers[i];
};

const results = [];
let failed = 0;
try {
  console.log(`realtime-check: recording levels ${levels.join(', ')} (deterministic bot runs)`);
  const refs = await pool(levels, workers, async (lv, i) => {
    const r = await record(await getBrowser(i % workers), lv);
    const e = r.ended || {};
    const plans = r.plans.map(p => p.ms).sort((a, b) => a - b);
    const p = (q) => Math.round(plans[Math.min(plans.length - 1, Math.floor(q * plans.length))] || 0);
    console.log(`  level ${lv}: ${e.kind}${e.death ? ` ${e.death.cause}@${e.death.x}` : ''} t=${Math.round(e.tau || 0)} ms, bones ${e.bones}/${e.bonesTotal}, ${r.inputs.filter(x => x.p).length} presses; bot plans ${plans.length}: p50 ${p(0.5)} ms, p99 ${p(0.99)} ms, max ${p(1)} ms, >50 ms: ${plans.filter(m => m > 50).length}`);
    if (r.errors.length) console.log(`    page errors: ${r.errors.slice(0, 3).join(' | ')}`);
    return r;
  });

  const jobs = [];
  levels.forEach((lv, li) => {
    const ref = refs[li];
    if (!ref.ended) return;
    const until = ref.ended.tau;
    jobs.push({ lv, li, name: 'det replay (self-test)', cfg: { mode: 'replay', det: true, timeline: ref.inputs } });
    for (const hz of rates) jobs.push({ lv, li, name: `${hz} Hz`, cfg: { mode: 'replay', hz, timeline: ref.inputs } });
    for (let s = 1; s <= hitchSeeds; s++) {
      const hitches = randomHitches(s + li * 101, until);
      jobs.push({ lv, li, name: `60 Hz + hitches #${s}`, cfg: { mode: 'replay', hz: 60, timeline: ref.inputs, hitches } });
    }
    if (botHitch) {
      const hitches = ref.plans.filter(p => p.ms >= 1).map(p => ({ t: p.t, ms: p.ms }));
      jobs.push({ lv, li, name: '60 Hz + bot-plan hitches', cfg: { mode: 'replay', hz: 60, timeline: ref.inputs, hitches } });
    }
    if (liveBot) for (const hz of rates) jobs.push({ lv, li, name: `live bot ${hz} Hz`, cfg: { mode: 'bot', hz }, bot: true });
  });

  console.log(`realtime-check: ${jobs.length} real-time runs (virtual display)`);
  const outs = await pool(jobs, workers, async (job, i) => {
    const run = await playRealtime(await getBrowser(i % workers), job.lv, job.cfg);
    const ref = refs[job.li];
    let res;
    if (job.bot) {
      const e = run.ended || {};
      const outcome = e.kind === 'death' ? `death ${e.death.cause}@${e.death.x}` : e.kind || 'none';
      res = { outcome, refOutcome: 'complete', bones: `${e.bones}/${ref.ended.bones}`, pass: e.kind === 'complete' && !run.errors.length };
    } else {
      res = compare(ref, run);
    }
    const row = { level: job.lv, run: job.name, ...res, hitches: run.hitches, hitchMs: Math.round(run.hitchMs), maxTicksPerFrame: run.maxTicks, frames: run.frames, wallS: run.wallS, errors: run.errors.slice(0, 3) };
    const tag = row.pass ? 'ok  ' : 'FAIL';
    const traj = job.bot ? '' : ` max |dx| ${row.maxDx} |dy| ${row.maxDy}${row.firstDiverge ? ` (from t=${row.firstDiverge.t} ms, x~${row.firstDiverge.x})` : ''}`;
    console.log(`${tag} level ${job.lv} ${job.name}: ${row.outcome} (ref ${row.refOutcome}), bones ${row.bones}${traj}${row.hitches ? `, ${row.hitches} hitches ${row.hitchMs} ms` : ''}${row.maxTicksPerFrame ? `, max ${row.maxTicksPerFrame} ticks/frame` : ''}${row.errors.length ? ` errors: ${row.errors.join(' | ')}` : ''}`);
    return row;
  });
  results.push(...outs);
  failed = outs.filter(r => !r.pass).length;
} finally {
  await Promise.all(browsers.filter(Boolean).map(b => b.close().catch(() => {})));
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
console.log(`realtime-check: ${results.length - failed}/${results.length} real-time runs match the deterministic run`);
console.log(failed ? 'realtime-check: FAILED' : 'realtime-check: OK');
process.exit(failed ? 1 : 0);
