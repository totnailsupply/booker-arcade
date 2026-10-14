// Helpers for driving the game in deterministic mode (?det=1) from Playwright.
// See src/core/Deterministic.js: once RunScene starts, the real-time loop sleeps
// and window.advanceTime(ms) runs fixed 1/60 s steps.

/** Loads url and waits (real time) until deterministic mode is active. */
export async function openDetPage(page, url, { timeout = 20000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DET__ && window.__DET__.enabled, null, { timeout });
}

/** Advances the game by ms of game time (fixed steps). */
export async function stepGame(page, ms) {
  await page.evaluate((t) => window.advanceTime(t), ms);
}

/** Steps n single frames. */
export async function stepFrames(page, n = 1) {
  await page.evaluate((k) => window.__DET__.step(k), n);
}

export async function readState(page) {
  const raw = await page.evaluate(() => (window.render_game_to_text ? window.render_game_to_text() : null));
  return raw ? JSON.parse(raw) : null;
}
