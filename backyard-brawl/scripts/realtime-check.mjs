#!/usr/bin/env node
// =============================================================================
// realtime-check.mjs — real-time browser play must end exactly like the
// fixed-step node sim.
//
// Each case opens `?autoplay=1&seed=N` (smart bot) in a real-time browser (no
// test clock, no advanceTime: requestAnimationFrame drives Phaser, frame deltas
// vary) and waits for Results. The result (score, wave, kills, level) must equal
// `node scripts/sim-run.mjs --bot smart --seed-base N --seeds 1`.
//
// A full winning run is ~7.5 min of sim time, so most cases use the debug flag
// `?speed=N` (N fixed steps per 1/60 s of real time; same steps, same inputs).
// Cases (default):
//   - 3 seeds, full runs, speed 8, no throttle
//   - 1 seed, full run, speed 8, CPU throttled 4x (CDP) + injected long tasks
//     (40-200 ms busy loops every ~0.6 s): frames drop, the accumulator caps
//   - 1 seed at speed 1 (true real time) with ?hp=2 (seed 3: knocked out in wave 3, ~84 s)
//
//   node scripts/realtime-check.mjs [--seeds 11,12,13] [--speed 8] [--workers 3]
//        [--hitch-seed 11] [--rt-seed 3] [--rt-hp 2] [--url http://localhost:3002]
//        [--quick]   (skip the full-length cases: only the speed-1 case + 1 hitched seed with hp 6)
//
// Exit 1 on any mismatch, timeout or page error. Browsers launch through
// scripts/lib/browser.mjs (a launchd job kills other Playwright browsers).
// =============================================================================

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const BASE = opt('url', `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, '');
const SEEDS = opt('seeds', '11,12,13').split(',').map(Number);
const SPEED = Number(opt('speed', 8));
const WORKERS = Number(opt('workers', 3));
const HITCH_SEED = Number(opt('hitch-seed', SEEDS[0]));
const RT_SEED = Number(opt('rt-seed', 3));
const RT_HP = Number(opt('rt-hp', 2));
const QUICK = flag('quick');
const TIMEOUT_MS = 8 * 60 * 1000;

function simExpect(seed, hp) {
  const a = ['scripts/sim-run.mjs', '--bot', 'smart', '--seed-base', String(seed), '--seeds', '1', '--json'];
  if (hp) a.push('--hp', String(hp));
  const out = JSON.parse(execFileSync('node', a, { cwd: ROOT, encoding: 'utf8' }));
  const r = out.runs[0];
  return { score: r.score, wave: r.wave, kills: r.kills, level: r.level, outcome: r.outcome };
}

const cases = [];
if (!QUICK) {
  for (const s of SEEDS) cases.push({ name: `seed ${s} speed ${SPEED}`, seed: s, speed: SPEED });
  cases.push({ name: `seed ${HITCH_SEED} speed ${SPEED} + CPU 4x + long tasks`, seed: HITCH_SEED, speed: SPEED, throttle: 4, hitches: true });
} else {
  cases.push({ name: `seed ${HITCH_SEED} hp 6 speed 4 + CPU 4x + long tasks`, seed: HITCH_SEED, hp: 6, speed: 4, throttle: 4, hitches: true });
}
cases.push({ name: `seed ${RT_SEED} hp ${RT_HP} speed 1 (true real time)`, seed: RT_SEED, hp: RT_HP, speed: 1 });

async function runCase(cs) {
  const expect = simExpect(cs.seed, cs.hp);
  const browser = await launchBrowser({ headless: true });
  const errors = [];
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });
    // Frame monitor (and optional long tasks) start with the page
    await page.addInitScript((hitches) => {
      const fm = { frames: 0, long: 0, max: 0, last: 0 };
      window.__FRAMES__ = fm;
      const tick = (t) => {
        if (fm.last) {
          const d = t - fm.last;
          fm.frames += 1;
          if (d > 50) fm.long += 1;
          if (d > fm.max) fm.max = d;
        }
        fm.last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      if (hitches) {
        let n = 0;
        const hitch = () => {
          // deterministic-ish pseudo-random 40-200 ms busy loop
          n = (n * 1103515245 + 12345) % 2147483648;
          const ms = 40 + (n % 160);
          const s = performance.now();
          while (performance.now() - s < ms) { /* block the main thread */ }
          setTimeout(hitch, 400 + (n % 400));
        };
        setTimeout(hitch, 1500);
      }
    }, !!cs.hitches);
    if (cs.throttle) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cs.throttle });
    }
    const q = `?autoplay=1&seed=${cs.seed}&speed=${cs.speed}${cs.hp ? `&hp=${cs.hp}` : ''}`;
    await page.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' });
    let got = null;
    let lastWave = 0;
    while (Date.now() - t0 < TIMEOUT_MS) {
      await page.waitForTimeout(1000);
      const s = await page.evaluate(() => {
        const st = JSON.parse(window.render_game_to_text());
        return { mode: st.mode, wave: st.wave, clock: st.clock, result: st.result || null };
      }).catch(() => null);
      if (!s) continue;
      if (s.wave && s.wave !== lastWave) lastWave = s.wave;
      if (s.clock !== 'realtime') throw new Error('test clock is on: not a real-time run');
      if ((s.mode === 'game_over' || s.mode === 'victory') && s.result) {
        got = { score: s.result.score, wave: s.result.wave, kills: s.result.kills, level: s.result.level, victory: !!s.result.victory };
        break;
      }
    }
    const frames = await page.evaluate(() => window.__FRAMES__).catch(() => null);
    return { cs, expect, got, frames, errors, secs: Math.round((Date.now() - t0) / 1000), lastWave };
  } finally {
    await browser.close();
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        out[i] = { cs: items[i], error: e.stack || e.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

console.log(`realtime-check: ${cases.length} cases, ${WORKERS} workers, ${BASE}`);
const results = await pool(cases, WORKERS, runCase);
let fails = 0;
for (const r of results) {
  if (r.error) {
    fails += 1;
    console.log(`  FAIL ${r.cs.name}: ${r.error}`);
    continue;
  }
  const { expect: e, got: g } = r;
  const same = g && ['score', 'wave', 'kills', 'level'].every(k => g[k] === e[k]);
  const fr = r.frames ? `frames ${r.frames.frames}, >50 ms ${r.frames.long}, max ${Math.round(r.frames.max)} ms` : 'no frame stats';
  const ok = same && !r.errors.length;
  if (!ok) fails += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.cs.name} (${r.secs}s; ${fr})`);
  console.log(`       sim     ${JSON.stringify(e)}`);
  console.log(`       browser ${g ? JSON.stringify(g) : `no result (timeout, last wave ${r.lastWave})`}`);
  for (const err of r.errors.slice(0, 5)) console.log(`       ${err}`);
  if (r.cs.hitches && r.frames && r.frames.long < 5) {
    fails += 1;
    console.log('  FAIL hitch case saw fewer than 5 long frames (throttle/long tasks not applied?)');
  }
}
console.log(fails ? `\nrealtime-check: FAILED (${fails})` : `\nrealtime-check: PASSED (${results.length} cases)`);
process.exit(fails ? 1 : 0);
