#!/usr/bin/env node
// Screenshots of the lobby, stats and every game scene at 1280x720 and at a
// 844x390 phone-landscape viewport -> output/shots/<name>-<viewport>.png
//
//   node scripts/ui-shots.mjs [--url http://localhost:3004] [--only lobby,stats,Plinko,results,rules]
//
// Per game: <game> (idle) and <game>-result (a round in progress / settled,
// driven through the ?debug=1 force hooks so the outcome is the same every
// run). After the games, lobby-after and stats-after show the cards and the
// stats table once real rounds have been played; lobby-bailout and
// lobby-claimed show the cashier card's states.
//
// Launches Chromium ONLY through scripts/lib/browser.mjs (a launchd reaper
// kills chromium.launch() browsers on this Mac).
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--url', `http://localhost:${process.env.PORT || 3004}`);
const ONLY = arg('--only', null)?.split(',');
const OUT = path.resolve('output/shots');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone', width: 844, height: 390, mobile: true },
];
const GAMES = ['Plinko', 'Blackjack', 'Craps', 'Roulette', 'Slots'];
const want = (n) => !ONLY || ONLY.includes(n) || ONLY.includes(n.toLowerCase());
const wantResults = !ONLY || ONLY.includes('results');

/** Start a round whose result is worth looking at. Returns ms to wait before the shot. */
const RESULTS = {
  // 5 balls into one bin (merged float) + one 3x bin
  async Plinko(page) {
    await page.evaluate(() => window.__CASINO__.force.plinko([6, 6, 6, 6, 6, 2]));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__GAME__.scene.getScene('Plinko').drop());
      await page.waitForTimeout(90);
    }
    return 2350;
  },
  // a natural: "BLACKJACK!" banner
  async Blackjack(page) {
    await page.evaluate(() => {
      const s = window.__GAME__.scene.getScene('Blackjack');
      s.spot.bet(10);
      window.__CASINO__.force.blackjack(['AS', '9D', 'KC', '7H']);
    });
    await page.keyboard.press('Space');
    return 3900;
  },
  // come-out 6: point on, Soba's first odds hint
  async Craps(page) {
    await page.evaluate(() => {
      const s = window.__GAME__.scene.getScene('Craps');
      s.spots.pass.bet(10);
      s.spots.field.bet(5);
      window.__CASINO__.force.craps([[3, 3]]);
    });
    await page.keyboard.press('Space');
    return 2600;
  },
  // red + 17 straight, ball lands on 17
  async Roulette(page) {
    await page.evaluate(() => {
      const s = window.__GAME__.scene.getScene('Roulette');
      s.placeChip('17');
      s.placeChip('red');
      s.placeChip('17');
      window.__CASINO__.force.roulette(17);
    });
    await page.keyboard.press('Space');
    return 7500;
  },
  // a three-of-a-kind line win (meter + Soba's line)
  async Slots(page) {
    await page.evaluate(() => {
      const G = (top, mid, bot) => [0, 1, 2, 3, 4].map(r => [top[r], mid[r], bot[r]]);
      window.__CASINO__.force.slots(G(['bowl', 'hydrant', 'ball', 'soba', 'bowl'], ['bone', 'bone', 'bone', 'hydrant', 'ball'], ['ball', 'bowl', 'hydrant', 'ball', 'soba']));
    });
    await page.keyboard.press('Space');
    return 3600;
  },
};

/** A second state per game where it matters (Blackjack: Soba's hint bubble on a 16 vs 10). */
const EXTRA = {
  async Blackjack(page) {
    await page.waitForTimeout(4500); // the natural clears
    await page.evaluate(() => {
      const s = window.__GAME__.scene.getScene('Blackjack');
      s.spot.bet(10);
      window.__CASINO__.force.blackjack(['10S', '10D', '6C', '7H', '8D', '5C']);
      if (!s.hintsOn) s.toggleHint();
    });
    await page.keyboard.press('Space');
    return 3600; // deal + Booker's peek (10 up), then the hint
  },
};

const errors = [];
const browser = await launchBrowser();
try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', (e) => errors.push(`[${vp.name}] PAGE ERROR ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${vp.name}] ${m.text()}`); });
    await page.goto(`${BASE}/?fresh=1&seed=7&debug=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'lobby', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    const shot = async (name) => {
      const file = path.join(OUT, `${name}-${vp.name}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${path.relative(process.cwd(), file)}`);
    };
    const toLobby = async () => {
      await page.evaluate(() => window.__CASINO__.goto('Lobby'));
      await page.waitForTimeout(1300);
    };
    if (want('lobby')) await shot('lobby');
    if (want('stats')) {
      await page.keyboard.press('s');
      await page.waitForTimeout(500);
      await shot('stats');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    for (const g of GAMES) {
      if (!want(g)) continue;
      await page.evaluate((k) => window.__CASINO__.goto(k), g);
      await page.waitForTimeout(1300);
      await shot(g.toLowerCase());
      if (wantResults && RESULTS[g]) {
        const wait = await RESULTS[g](page);
        await page.waitForTimeout(wait);
        await shot(`${g.toLowerCase()}-result`);
        if (EXTRA[g]) {
          await page.waitForTimeout(await EXTRA[g](page));
          await shot(`${g.toLowerCase()}-extra`);
        }
      }
    }
    if (want('rules')) {
      await page.evaluate(() => window.__CASINO__.goto('Blackjack'));
      await page.waitForTimeout(900);
      const box = await page.locator('canvas').boundingBox();
      const k = box.width / 1280;
      await page.mouse.click(box.x + 1182 * k, box.y + (32 * k) + (box.height - 720 * k) / 2);
      await page.waitForTimeout(500);
      await shot('rules');
    }
    // the lobby and stats after real rounds (best wins, round counts, totals)
    if (wantResults) {
      await toLobby();
      await shot('lobby-after');
      await page.keyboard.press('s');
      await page.waitForTimeout(500);
      await shot('stats-after');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      // cashier: bailout (broke), then the daily bonus, then "come back tomorrow"
      await page.evaluate(() => window.__CASINO__.debug.setBalance(5));
      await page.waitForTimeout(900);
      await shot('lobby-bailout');
      await page.keyboard.press('b');
      await page.waitForTimeout(500);
      await page.keyboard.press('d');
      await page.waitForTimeout(1400);
      await shot('lobby-claimed');
    }
    await toLobby();
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(`\n${errors.length} console error(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('ui-shots done, no console errors');
