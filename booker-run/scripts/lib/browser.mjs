// Shared Chromium launcher for the QA scripts.
//
// Why not chromium.launch()? It gives the browser a temp profile named
// `playwright_chromiumdev_profile-*`. This machine runs a launchd job
// (~/.claude/hooks/playwright-reaper.sh sweep, every 120 s) that SIGTERMs any
// browser with that profile marker whose parent is not a Playwright MCP server,
// treating it as an orphaned MCP browser. Our test scripts are the parent, so
// every long check (autoplay ~85 s, audio ~60 s) lost its browser at a random
// point ("Target page, context or browser has been closed").
//
// launchPersistentContext() with our own profile dir avoids the marker. The
// browser is still closed (and its profile deleted) when the script calls
// close(), so nothing is left running.
//
// Returns a small Browser-like object: newPage(options), close() and `context`.
// contextOptions go to launchPersistentContext (e.g. { hasTouch: true, isMobile: true }
// for real touch events through page.touchscreen.tap()).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

export async function launchBrowser({ headless = true, args = [], viewport = null, contextOptions = {} } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booker-run-qa-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args,
    viewport: viewport || { width: 1280, height: 720 },
    ...contextOptions,
  });
  let spare = context.pages()[0] || null; // the profile opens with one blank tab
  let closed = false;

  return {
    context,
    async newPage(options = {}) {
      const page = spare || await context.newPage();
      spare = null;
      if (options.viewport) await page.setViewportSize(options.viewport);
      return page;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await context.close();
      } finally {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    },
  };
}
