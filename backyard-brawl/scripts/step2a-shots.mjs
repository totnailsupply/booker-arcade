#!/usr/bin/env node
// =============================================================================
// step2a-shots.mjs — screenshots of the combat content (bosses, new enemies,
// weapons) under the deterministic test clock. Launches through
// scripts/lib/browser.mjs (never plain chromium.launch: see that file).
//
//   node scripts/step2a-shots.mjs            # all shots -> output/step2a/
//   PORT=3002 node scripts/step2a-shots.mjs
//
// Each scenario loads a debug URL (?wave=N&god=1&autoplay=1...), steps the game
// with window.advanceTime and saves a PNG + the render_game_to_text() JSON at
// the listed sim times. Fails (exit 1) on page errors or a missing boss.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const PORT = process.env.PORT || 3002;
const OUT = path.resolve('output/step2a');
fs.mkdirSync(OUT, { recursive: true });

const SCENARIOS = [
  { name: 'w5-boss', url: '?wave=5&god=1&autoplay=1&seed=5', at: [4, 9, 14], expectBoss: 'boss-cat', bossNear: true },
  // phase2: the test drops the vac to 45 % HP (window.__GAME__ hook) to show the suction
  { name: 'w10-boss', url: '?wave=10&god=1&autoplay=1&seed=10', at: [4, 12, 30], expectBoss: 'boss-vac', bossNear: true, phase2: true },
  { name: 'w7-mix', url: '?wave=7&god=1&autoplay=1&seed=7&weapons=bark,frisbee,squeak,zoomies', at: [8, 20] },
  { name: 'w4-ball-bone', url: '?wave=4&god=1&autoplay=1&seed=4&weapons=ball,bone', at: [10] },
  // Not autoplay: Booker stands still (god) until a level-up opens, then the cards are shot
  { name: 'levelup', url: '?wave=4&god=1&seed=3&weapons=bark,ball', at: [], untilMode: 'levelup' },
  { name: 'w6-debug', url: '?wave=6&god=1&autoplay=1&seed=6&debug=1&weapons=bark,zoomies', at: [12] },
];

const FRAME_MS = 1000 / 60;

async function run() {
  const browser = await launchBrowser({ headless: true, viewport: { width: 960, height: 540 } });
  const errors = [];
  const summary = [];
  try {
    for (const sc of SCENARIOS) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(`${sc.name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${sc.name}: console ${m.text()}`); });
      await page.goto(`http://localhost:${PORT}/${sc.url}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        try { return JSON.parse(window.render_game_to_text()).scenes.includes('ArenaScene'); } catch { return false; }
      }, null, { timeout: 15000 });
      let simT = 0;
      let sawBoss = null;
      for (const at of sc.at) {
        // Step in 1 s chunks, watching for the boss
        while (simT < at) {
          await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 60);
          simT += 1;
          const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
          if (st.boss) sawBoss = st.boss.type;
        }
        const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
        const file = path.join(OUT, `${sc.name}-t${at}.png`);
        await page.locator('canvas').screenshot({ path: file });
        fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(state, null, 2));
        summary.push({
          shot: path.basename(file), mode: state.mode, wave: state.wave, enemies: state.enemyCount,
          types: state.enemyTypes, boss: state.boss, weapons: state.weapons, bones: state.goldenBones,
        });
      }
      if (sc.untilMode) {
        for (let i = 0; i < 120; i++) {
          await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 30);
          const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
          if (st.mode === sc.untilMode) {
            await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 20);
            const file = path.join(OUT, `${sc.name}.png`);
            await page.locator('canvas').screenshot({ path: file });
            summary.push({ shot: path.basename(file), mode: st.mode, choices: st.choices });
            break;
          }
        }
        if (!summary.some(x => x.shot === `${sc.name}.png`)) errors.push(`${sc.name}: never reached ${sc.untilMode}`);
      }
      if (sc.bossNear) {
        if (sc.phase2) {
          await page.evaluate(() => {
            const b = window.__GAME__.scene.getScene('ArenaScene').world.boss;
            if (b) b.hp = b.maxHp * 0.45;
          });
        }
        // Step (up to 40 s) until the boss is on screen near Booker, then shoot
        for (let i = 0; i < 160; i++) {
          await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * 15);
          const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
          if (st.boss && Math.abs(st.boss.x - st.player.x) < 170 && Math.abs(st.boss.y - st.player.y) < 90) {
            const file = path.join(OUT, `${sc.name}-near${sc.phase2 ? '-phase2' : ''}.png`);
            await page.locator('canvas').screenshot({ path: file });
            fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(st, null, 2));
            summary.push({ shot: path.basename(file), boss: st.boss, player: st.player });
            break;
          }
        }
      }
      if (sc.expectBoss && sawBoss !== sc.expectBoss) errors.push(`${sc.name}: expected ${sc.expectBoss}, saw ${sawBoss}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  for (const s of summary) console.log(JSON.stringify(s));
  if (errors.length) {
    console.error(`FAILED:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`OK: ${summary.length} shots in ${OUT}`);
}

run();
