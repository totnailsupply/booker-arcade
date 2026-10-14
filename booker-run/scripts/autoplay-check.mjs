#!/usr/bin/env node
// Plays a level with the bot (?autoplay=1) until it reaches the finish.
//
// Default: deterministic. The page runs with ?det=1, so once the run starts the
// game only advances through window.advanceTime(ms) in fixed 1/60 s steps and
// the result doesn't depend on machine load (same input -> same run).
// --realtime: the old real-time mode (polls while the game runs at its own pace;
// relaunches from a safe ?x= if the browser is killed externally).
//
// Usage:
//   node scripts/autoplay-check.mjs [--level N|test] [--room name] [--query "start=section3&x=900"]
//        [--jitter ms --seeds k [--seed-start 1] [--min-pass n]] [--realtime]
//        [--url http://localhost:3000] [--no-manifest] [--timeout ms] [--out dir] [--json file]
// Exit 0 when every run reaches the finish with 0 deaths (with --seeds: when at
// least --min-pass runs do; default ceil(0.8 * seeds)). One JSON summary line per
// run is printed ("RESULT {...}"), and --json writes all of them to a file.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { openDetPage, readState, stepGame } from './lib/det.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const level = opt('--level', null);
const room = opt('--room', null);
const extra = opt('--query', '');
const realtime = args.includes('--realtime');
const jitter = parseFloat(opt('--jitter', '0')) || 0;
const seeds = parseInt(opt('--seeds', '1'), 10) || 1;
const seedStart = parseInt(opt('--seed-start', '1'), 10) || 1;
const minPass = parseInt(opt('--min-pass', String(Math.ceil(seeds * 0.8))), 10);
const timeoutMs = parseInt(opt('--timeout', realtime ? '150000' : '240000'), 10);
const outDir = opt('--out', `output/autoplay${level ? `/level${level}` : ''}`);
const jsonOut = opt('--json', null);
const noManifest = args.includes('--no-manifest');

fs.mkdirSync(outDir, { recursive: true });

// --no-manifest answers the manifest with a 404 on purpose; the browser logs it
const expectedError = (text) => noManifest && /404/.test(text);

function buildQuery(seed) {
  const q = ['autoplay=1'];
  if (level) q.push(`level=${level}`);
  if (room) q.push(`room=${room}`);
  if (jitter > 0) q.push(`botjitter=${jitter}`, `seed=${seed}`);
  if (!realtime) q.push('det=1');
  if (extra) q.push(extra);
  return q.join('&');
}

// ---------------------------------------------------------------------------
// Deterministic run
// ---------------------------------------------------------------------------

const CHUNK_MS = 500;           // game time per advanceTime() call
const MAX_GAME_S = 600;         // give up after 10 minutes of game time
const MAX_DEATHS = 10;          // ...or after this many deaths

async function runDet(browser, seed) {
  const errors = [];
  const url = `${base}/?${buildQuery(seed)}`;
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !expectedError(m.text())) errors.push(m.text()); });
  if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
  const t0 = Date.now();
  await openDetPage(page, url);
  console.log(`autoplay-check: ${url}${noManifest ? ' (no manifest)' : ''}`);

  let last = null;
  let deaths = 0;
  let lastLog = 0;
  let reached = false;
  while (Date.now() - t0 < timeoutMs) {
    await stepGame(page, CHUNK_MS);
    last = await readState(page);
    if (!last) continue;
    const gameS = (last.det?.frames || 0) / 60;
    const n = last.deathLog?.length || 0;
    if (n > deaths) {
      for (const d of last.deathLog.slice(deaths)) {
        if (d.attempt <= 3) console.log(`  death ${d.attempt}: x=${d.x} cause=${d.cause} progress=${d.progress}`);
      }
      if (deaths < 3) await page.screenshot({ path: path.join(outDir, `death-s${seed}-${n}.png`) });
      deaths = n;
      if (deaths >= MAX_DEATHS) {
        console.log(`  giving up after ${deaths} deaths`);
        break;
      }
    }
    if (gameS - lastLog >= 15) {
      lastLog = gameS;
      console.log(`  t=${gameS.toFixed(0)}s mode=${last.mode} x=${last.player?.x} section=${last.section} speed=${last.speed} bones=${last.bones}/${last.bonesTotal} attempts=${last.attempts}`);
    }
    if (last.mode === 'complete' && last.scenes?.includes('LevelCompleteScene')) {
      reached = true;
      await stepGame(page, 600);
      await page.screenshot({ path: path.join(outDir, `complete-s${seed}.png`) });
      break;
    }
    if (gameS > MAX_GAME_S) break;
  }
  const assets = await page.evaluate(() => window.__ASSET_SOURCES__ || null);
  await page.close().catch(() => {});
  const summary = {
    level: last?.levelId || level || 'level1',
    seed: jitter > 0 ? seed : null,
    jitterMs: jitter,
    mode: 'deterministic',
    completed: reached,
    deaths,
    deathLog: last?.deathLog || [],
    score: last?.result?.score ?? last?.score ?? null,
    result: last?.result || null,
    gameSeconds: Math.round(((last?.det?.frames || 0) / 60) * 100) / 100,
    wallSeconds: Math.round((Date.now() - t0) / 100) / 10,
    bot: last?.bot || null,
    placeholders: assets?.placeholders?.length ?? null,
    errors: errors.slice(0, 10),
  };
  summary.pass = summary.completed && summary.deaths === 0 && errors.length === 0;
  return summary;
}

// ---------------------------------------------------------------------------
// Real-time run (legacy behaviour, with resume after an external browser kill)
// ---------------------------------------------------------------------------

async function runRealtime() {
  const MAX_RESUMES = 4;
  const errors = [];
  const deaths = [];
  let last = null;
  let resumes = 0;
  let resumeX = null;
  let assets = null;
  const start = Date.now();
  // The resume x is only taken from a spot with a clear runway, so a relaunch
  // never spawns Booker in front of an obstacle.
  const RESUME_RUNWAY_PX = 200;
  while (Date.now() - start < timeoutMs) {
    const q = [buildQuery(seedStart), resumeX ? `x=${resumeX}` : ''].filter(Boolean).join('&');
    const url = `${base}/?${q}`;
    const browser = await launchBrowser({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !expectedError(m.text())) errors.push(m.text()); });
      if (noManifest) await page.route('**/assets/manifest.json', r => r.fulfill({ status: 404, body: 'not found' }));
      console.log(`autoplay-check (realtime): ${url}${noManifest ? ' (no manifest)' : ''}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      let lastLogAt = 0;
      let seen = 0;
      while (Date.now() - start < timeoutMs) {
        await page.waitForTimeout(250);
        last = await readState(page);
        if (!last) continue;
        if (last.player && last.mode === 'playing' && last.player.onGround) {
          const px = last.player.x;
          const ob = last.obstaclesAhead?.[0];
          const clearObstacle = !ob || ob.x - px > RESUME_RUNWAY_PX;
          const clearGap = !last.nextGap || last.nextGap.x - px > RESUME_RUNWAY_PX;
          if (clearObstacle && clearGap) resumeX = px;
        }
        const n = last.deathLog?.length || 0;
        if (n > seen) {
          for (const d of last.deathLog.slice(seen)) {
            deaths.push(d);
            console.log(`  death at x=${d.x} cause=${d.cause} section=${last.section}`);
          }
          seen = n;
          await page.screenshot({ path: path.join(outDir, `death-${deaths.length}.png`) });
        }
        if (Date.now() - lastLogAt > 10000) {
          lastLogAt = Date.now();
          console.log(`  t=${((Date.now() - start) / 1000).toFixed(0)}s mode=${last.mode} x=${last.player?.x} section=${last.section} speed=${last.speed} bones=${last.bones}/${last.bonesTotal} attempts=${last.attempts}`);
        }
        if (last.mode === 'complete' && last.scenes?.includes('LevelCompleteScene')) {
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(outDir, 'complete.png') });
          break;
        }
      }
      assets = await page.evaluate(() => window.__ASSET_SOURCES__ || null);
      await browser.close();
      break;
    } catch (err) {
      await browser.close().catch(() => {});
      if (!/closed/i.test(String(err)) || resumes >= MAX_RESUMES) throw err;
      resumes += 1;
      console.log(`  browser closed externally; resuming from x=${resumeX} (resume ${resumes})`);
    }
  }
  const summary = {
    level: last?.levelId || level || 'level1',
    mode: 'realtime',
    completed: last?.mode === 'complete',
    deaths: deaths.length,
    deathLog: deaths,
    resumes,
    score: last?.result?.score ?? last?.score ?? null,
    result: last?.result || null,
    wallSeconds: Math.round((Date.now() - start) / 100) / 10,
    placeholders: assets?.placeholders?.length ?? null,
    errors: errors.slice(0, 10),
  };
  summary.pass = summary.completed && summary.deaths === 0 && errors.length === 0;
  return summary;
}

// ---------------------------------------------------------------------------

const results = [];
if (realtime) {
  const r = await runRealtime();
  results.push(r);
  console.log(`RESULT ${JSON.stringify(r)}`);
} else {
  const browser = await launchBrowser({ headless: true });
  try {
    for (let k = 0; k < seeds; k++) {
      const seed = seedStart + k;
      const r = await runDet(browser, seed);
      results.push(r);
      console.log(`  final: completed=${r.completed} deaths=${r.deaths} score=${r.score} game=${r.gameSeconds}s wall=${r.wallSeconds}s`);
      console.log(`RESULT ${JSON.stringify(r)}`);
    }
  } finally {
    await browser.close();
  }
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
const passes = results.filter(r => r.pass).length;
const need = seeds > 1 ? minPass : results.length;
console.log(`autoplay-check: ${passes}/${results.length} runs reached the finish with 0 deaths (need ${need})`);
console.log(passes >= need ? 'autoplay-check: REACHED THE STEAK' : 'autoplay-check: FAILED');
process.exit(passes >= need ? 0 : 1);
