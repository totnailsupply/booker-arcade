#!/usr/bin/env node
// =============================================================================
// casino-check.mjs — the browser QA runner for Lucky Paw Casino.
//
//   node scripts/casino-check.mjs [--url http://localhost:3004] [--only lobby,roulette] [--headed]
//
// 1. Loads <url>/?fresh=1&seed=7 (fresh save, seeded RNG) and waits for the lobby.
// 2. Runs every scripts/checks/*-check.mjs module (alphabetical; --only filters by
//    the name before "-check"). Each module:
//        export default async function (page, helpers) { ... }   // throw to fail
//    and may export `export const name = 'Roulette'`.
// 3. Verifies wallet conservation (start - bet + paid + bonus == balance) and
//    that nothing is left "in play".
// 4. Reloads WITHOUT ?fresh=1 and checks the save survived (balance, rounds, XP).
// Fails on any page error or console error at any point.
//
// The browser is launched ONLY through scripts/lib/browser.mjs (a launchd
// reaper on this Mac kills chromium.launch() browsers).
//
// helpers (all game-coordinate based; the game runs on the fixed-step test
// clock once step() is first called, so runs are deterministic):
//   step(ms = 16.7)            advance the game clock by ms (1/60 s frames)
//   readState()                parsed render_game_to_text()
//   waitFor(pred, maxMs=5000)  step until pred(state) is true; returns the state (throws on timeout)
//   openGame(key)              lobby -> game by pressing its number key (1-5); waits for the scene
//   backToLobby()              Esc; waits for the lobby (returns false if the game refused)
//   clickAt(x, y)              click at game px (1280x720 space) mapped onto the canvas
//   pressKey(key)              Playwright key name ('Space', 'Escape', 'Digit1', 'h'), then one frame
//   evaluate(fn, arg)          page.evaluate shortcut
//   assert(cond, msg)          throw with msg if !cond
//   log(...args)               prefixed console.log
//   wallet()                   { balance, conservationError, inPlay, totals }
//   errors                     array of console/page errors so far
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--url', `http://localhost:${process.env.PORT || 3004}`);
const ONLY = arg('--only', null)?.split(',').map(s => s.toLowerCase());
const HEADED = args.includes('--headed');
const CHECKS_DIR = path.resolve('scripts/checks');
const GAME_KEYS = { Plinko: 'Digit1', Blackjack: 'Digit2', Craps: 'Digit3', Roulette: 'Digit4', Slots: 'Digit5' };

const errors = [];
let failures = 0;

function makeHelpers(page) {
  const helpers = {
    page,
    errors,
    log: (...a) => console.log('   ', ...a),
    assert(cond, msg) { if (!cond) throw new Error(`assert: ${msg}`); },
    async evaluate(fn, a) { return page.evaluate(fn, a); },
    async step(ms = 1000 / 60) { await page.evaluate((t) => window.advanceTime(t), ms); },
    async readState() {
      const raw = await page.evaluate(() => window.render_game_to_text());
      return JSON.parse(raw);
    },
    async waitFor(pred, maxMs = 5000, stepMs = 50) {
      let st = await helpers.readState();
      for (let t = 0; t <= maxMs; t += stepMs) {
        if (pred(st)) return st;
        await helpers.step(stepMs);
        st = await helpers.readState();
      }
      throw new Error(`waitFor timed out after ${maxMs} ms; state: mode=${st.mode} scene=${st.scene}`);
    },
    async clickAt(x, y, { button = 'left' } = {}) {
      const box = await page.locator('canvas').boundingBox();
      const k = Math.min(box.width / 1280, box.height / 720);
      const ox = box.x + (box.width - 1280 * k) / 2;
      const oy = box.y + (box.height - 720 * k) / 2;
      await page.mouse.move(ox + x * k, oy + y * k);
      await helpers.step();
      await page.mouse.down({ button });
      await helpers.step();
      await page.mouse.up({ button });
      await helpers.step();
    },
    async pressKey(key) {
      await page.keyboard.press(key);
      await helpers.step();
      await helpers.step();
    },
    async openGame(key) {
      let st = await helpers.readState();
      if (st.mode !== 'lobby') {
        await helpers.backToLobby();
      }
      await helpers.waitFor(s => s.mode === 'lobby' && !s.paused.includes('Lobby'));
      await helpers.step(300); // lobby fade-in
      await helpers.pressKey(GAME_KEYS[key]);
      st = await helpers.waitFor(s => s.scene === key && s.mode === 'game', 4000);
      await helpers.step(300); // game fade-in
      return st;
    },
    async backToLobby() {
      await helpers.pressKey('Escape');
      try {
        await helpers.waitFor(s => s.mode === 'lobby', 1500);
        await helpers.step(300);
        return true;
      } catch {
        return false;
      }
    },
    async wallet() {
      return page.evaluate(() => {
        const w = window.__CASINO__.wallet;
        return { balance: w.balance, conservationError: w.conservationError(), inPlay: w.inPlay(), totals: w.totals };
      });
    },
  };
  return helpers;
}

async function loadLobby(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'lobby', null, { timeout: 20000 });
}

const browser = await launchBrowser({ headless: !HEADED });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });
  const h = makeHelpers(page);

  console.log(`casino-check: ${BASE}`);
  await loadLobby(page, `${BASE}/?fresh=1&seed=7`);
  await h.step(500);
  const st0 = await h.readState();
  h.assert(st0.balance === 1000, `fresh balance should be 1000, got ${st0.balance}`);
  console.log(`  lobby loaded (balance ${st0.balance}, VIP ${st0.vip.name})`);

  const files = fs.existsSync(CHECKS_DIR) ? fs.readdirSync(CHECKS_DIR).filter(f => f.endsWith('-check.mjs')).sort() : [];
  for (const f of files) {
    const id = f.replace(/-check\.mjs$/, '').toLowerCase();
    if (ONLY && !ONLY.includes(id)) continue;
    const mod = await import(pathToFileURL(path.join(CHECKS_DIR, f)).href);
    const name = mod.name || id;
    const before = errors.length;
    const t0 = Date.now();
    try {
      // every check starts from the lobby
      const s = await h.readState();
      if (s.mode !== 'lobby') await page.evaluate(() => window.__CASINO__.goto('Lobby'));
      await h.waitFor(x => x.mode === 'lobby');
      await h.step(300);
      await mod.default(page, h);
      if (errors.length > before) throw new Error(`console errors during check:\n      ${errors.slice(before).join('\n      ')}`);
      const w = await h.wallet();
      if (w.conservationError !== 0) throw new Error(`wallet books off by ${w.conservationError}`);
      console.log(`  PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (err) {
      failures++;
      console.log(`  FAIL ${name}: ${err.message}`);
      try {
        fs.mkdirSync('output/check-fail', { recursive: true });
        await page.screenshot({ path: `output/check-fail/${id}.png` });
        console.log(`       screenshot: output/check-fail/${id}.png`);
      } catch { /* ignore */ }
    }
  }

  // --- wallet conservation over the whole session ---
  await page.evaluate(() => window.__CASINO__.goto('Lobby'));
  await h.waitFor(x => x.mode === 'lobby');
  await h.step(300);
  const w = await h.wallet();
  const t = w.totals;
  const lhs = t.start - t.bet + t.paid + t.bonus;
  if (lhs !== w.balance || w.conservationError !== 0) {
    failures++;
    console.log(`  FAIL conservation: start ${t.start} - bet ${t.bet} + paid ${t.paid} + bonus ${t.bonus} = ${lhs} != balance ${w.balance}`);
  } else {
    console.log(`  PASS conservation: ${t.start} - ${t.bet} + ${t.paid} + ${t.bonus} = ${w.balance}`);
  }
  if (w.inPlay !== 0) {
    failures++;
    console.log(`  FAIL ${w.inPlay} chips still in play back in the lobby`);
  }

  // --- save survives a reload ---
  const before = await h.readState();
  await loadLobby(page, `${BASE}/?seed=7`);
  await h.step(300);
  const after = await h.readState();
  const same = after.balance === before.balance && after.stats.rounds === before.stats.rounds && after.vip.xp === before.vip.xp
    && after.stats.dailies === before.stats.dailies;
  if (!same) {
    failures++;
    console.log(`  FAIL save/reload: before balance ${before.balance} rounds ${before.stats.rounds} xp ${before.vip.xp}; after ${after.balance} / ${after.stats.rounds} / ${after.vip.xp}`);
  } else {
    console.log(`  PASS save survives reload (balance ${after.balance}, rounds ${after.stats.rounds}, xp ${after.vip.xp})`);
  }
  const w2 = await h.wallet();
  if (w2.conservationError !== 0) {
    failures++;
    console.log(`  FAIL conservation after reload (${w2.conservationError})`);
  }
} catch (err) {
  failures++;
  console.log(`  FAIL runner: ${err.stack || err.message}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log(`\n${errors.length} console/page error(s):\n  ${errors.join('\n  ')}`);
  failures++;
}
console.log(failures ? `\ncasino-check FAILED (${failures})` : '\ncasino-check PASSED');
process.exit(failures ? 1 : 0);
