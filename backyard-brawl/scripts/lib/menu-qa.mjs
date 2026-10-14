// Shared helpers for the menu QA scripts (ui-flow-check, save-check, menu-shots).
// Every browser goes through ./browser.mjs (see the launchd note there).

import { launchBrowser } from './browser.mjs';

export const PORT = process.env.PORT || 3002;
export const BASE = `http://localhost:${PORT}`;
export const SAVE_KEY = 'backyard-brawl:save';

/** A plausible v1 save. Override any field. */
export function richSave(over = {}) {
  const day = (d) => `2026-10-${String(d).padStart(2, '0')}`;
  const weapons = ['bark', 'ball', 'bone', 'frisbee', 'squeak', 'zoomies'];
  const scores = Array.from({ length: 9 }, (_, i) => ({
    id: 1000 + i,
    score: 24000 - i * 2300,
    wave: 9 - i,
    level: 26 - i * 2,
    time: 480 - i * 35,
    kills: 900 - i * 80,
    weapon: weapons[i % 3],
    date: day(5 + i),
    victory: false,
    endless: false,
  }));
  return {
    version: 1,
    scores,
    lastScoreId: 1004,
    bones: 137,
    kennel: { hearty: 2, jaws: 5, paws: 0, sniffer: 1, lucky: 0, learner: 3 },
    stats: { runs: 23, kills: 6400, bestWave: 9, wins: 0, bones: 412, bossesBeaten: ['boss-cat'] },
    unlocks: { weapons: ['bark', 'ball', 'bone', 'frisbee'], endless: false },
    lastWeapon: 'ball',
    lastEndless: false,
    muted: true,
    ...over,
  };
}

/**
 * Opens the game with an optional localStorage seed (raw string or object;
 * null = clear storage). Returns { browser, page, errors }.
 */
export async function openGame({ url = BASE, seed, contextOptions = {}, viewport, initScript } = {}) {
  const browser = await launchBrowser({ headless: true, contextOptions, viewport });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });
  if (seed !== undefined) {
    const value = seed === null ? null : (typeof seed === 'string' ? seed : JSON.stringify(seed));
    await page.addInitScript(([key, v]) => {
      // Only seed the first load in this tab (reloads keep what the game wrote)
      try {
        if (!sessionStorage.getItem('__seeded')) {
          sessionStorage.setItem('__seeded', '1');
          if (v === null) localStorage.removeItem(key);
          else localStorage.setItem(key, v);
        }
      } catch { /* ignore */ }
    }, [SAVE_KEY, value]);
  }
  if (initScript) await page.addInitScript(initScript);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene', 15000, true);
  return { browser, page, errors };
}

/** Polls (real time) until a scene is active. */
export async function waitForScene(page, key, timeout = 10000, realtime = false) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate((k) => {
      const g = window.__GAME__;
      return !!(g && g.isBooted && g.scene.isActive(k));
    }, key).catch(() => false);
    if (ok) return true;
    if (!realtime) await step(page, 2);
    else await page.waitForTimeout(50);
  }
  throw new Error(`timeout waiting for ${key}`);
}

/** Advances the deterministic test clock by n frames. */
export async function step(page, frames = 1) {
  await page.evaluate((n) => window.advanceTime(n * 1000 / 60), frames);
}

export async function state(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

export async function press(page, key, after = 4) {
  await page.keyboard.press(key);
  await step(page, after);
}

export async function readSave(page) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return 'UNPARSEABLE'; }
  }, SAVE_KEY);
}

/** Game coords (480x270) -> page coords of the canvas. */
export async function toPage(page, x, y) {
  return page.evaluate(([gx, gy]) => {
    const c = window.__GAME__.canvas.getBoundingClientRect();
    return { x: c.left + gx * c.width / 480, y: c.top + gy * c.height / 270 };
  }, [x, y]);
}

/** Center of a focusable item (Button / Tile) in the active menu scene, by key. */
export async function itemPos(page, sceneKey, itemKey) {
  const p = await page.evaluate(([sk, ik]) => {
    const s = window.__GAME__.scene.getScene(sk);
    const it = s?.nav?.items.find(i => i.key === ik);
    return it ? { x: it.x, y: it.y } : null;
  }, [sceneKey, itemKey]);
  if (!p) throw new Error(`no item ${itemKey} in ${sceneKey}`);
  return toPage(page, p.x, p.y);
}

export async function click(page, sceneKey, itemKey, after = 4) {
  const p = await itemPos(page, sceneKey, itemKey);
  await page.mouse.move(p.x, p.y);
  await step(page, 1);
  await page.mouse.down();
  await step(page, 1);
  await page.mouse.up();
  await step(page, after);
}

export async function tap(page, sceneKey, itemKey, after = 4) {
  const p = await itemPos(page, sceneKey, itemKey);
  await page.touchscreen.tap(p.x, p.y);
  await step(page, after);
}

export async function shot(page, file) {
  await page.screenshot({ path: file });
}

/** Simple assertion collector. */
export function checker(name) {
  const fails = [];
  let n = 0;
  return {
    ok(cond, msg) {
      n += 1;
      if (cond) console.log(`  ok   ${msg}`);
      else { console.log(`  FAIL ${msg}`); fails.push(msg); }
      return cond;
    },
    finish(extraErrors = []) {
      for (const e of extraErrors) fails.push(e);
      if (fails.length) {
        console.error(`\n${name}: FAILED ${fails.length}/${n + extraErrors.length}`);
        fails.forEach((f) => console.error(`  - ${f}`));
        return 1;
      }
      console.log(`\n${name}: PASSED (${n} checks)`);
      return 0;
    },
  };
}
