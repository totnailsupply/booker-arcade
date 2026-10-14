#!/usr/bin/env node
// =============================================================================
// fx-shots.mjs — screenshots of the Step 3A visual-polish moments under the
// deterministic test clock, into output/fx/. Launches through
// scripts/lib/browser.mjs (never plain chromium.launch: see that file).
//
//   node scripts/fx-shots.mjs              # every shot
//   node scripts/fx-shots.mjs crowd boss   # only scenarios whose name contains a word
//
// Each scenario loads a debug URL, steps with window.advanceTime until a
// condition on render_game_to_text() holds, then saves PNG + JSON. Fails
// (exit 1) on page errors or a condition that never holds.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';

const PORT = process.env.PORT || 3002;
const OUT = path.resolve('output/fx');
fs.mkdirSync(OUT, { recursive: true });
const FRAME_MS = 1000 / 60;
const only = process.argv.slice(2);


// until(state) -> true when the shot should be taken; after = extra frames before the shot
const SCENARIOS = [
  { name: 'crowd-w7', url: '?wave=7&god=1&autoplay=1&seed=7&weapons=bark,ball', shots: [
    { until: (s) => s.simTime >= 22 && s.enemyCount >= 30, max: 2400, chunk: 30 },
  ] },
  { name: 'crowd-w9', url: '?wave=9&god=1&autoplay=1&seed=9&weapons=bark,frisbee,squeak', shots: [
    { until: (s) => s.enemyCount >= 70, max: 4000, chunk: 30 },
  ] },
  { name: 'hit-numbers', url: '?wave=4&god=1&autoplay=1&seed=4&weapons=bark,ball,bone', shots: [
    { until: (s) => s.fx?.numbers >= 6, max: 2400, chunk: 2 },
  ] },
  // Not autoplay: Booker stands still (god) until a level-up opens
  { name: 'levelup', url: '?wave=4&god=1&seed=3&weapons=bark,ball', shots: [
    { tag: 'burst', until: (s) => s.mode === 'levelup', max: 4000, chunk: 2, after: 6 },
    { tag: 'cards-in', until: (s) => s.scenes.includes('LevelUpScene'), max: 120, chunk: 1, after: 5 },
    { tag: 'cards', until: () => true, max: 1, chunk: 1, after: 40 },
  ] },
  { name: 'boss-intro', url: '?wave=5&god=1&autoplay=1&seed=5', shots: [
    { until: (s) => s.fx?.bossIntroMs > 0, max: 600, chunk: 1, after: 20 },
  ] },
  { name: 'boss-arrow', url: '?wave=10&god=1&autoplay=1&seed=10', shots: [
    { until: (s) => s.boss && s.fx?.arrows > 0, max: 3000, chunk: 5, after: 0 },
  ] },
  { name: 'boss-death', url: '?wave=5&god=1&autoplay=1&seed=5', shots: [
    { tag: 'pre', until: (s) => !!s.boss && s.fx?.bossIntroMs === 0, max: 900, chunk: 5,
      eval: () => { const w = window.__GAME__.scene.getScene('ArenaScene').world; const b = w.boss; if (b) { b.hp = 1; b.x = w.player.x + 40; b.y = w.player.y; } } },
    { tag: 'boom', until: (s) => !s.boss, max: 900, chunk: 1, after: 8 },
    { tag: 'confetti', until: () => true, max: 1, chunk: 1, after: 30 },
  ] },
  { name: 'charge-lane', url: '?wave=5&god=1&autoplay=1&seed=5', shots: [
    { until: (s) => s.boss && s.boss.state === 'windup', max: 2400, chunk: 2, after: 14 },
  ] },
  { name: 'stink', url: '?wave=8&god=1&autoplay=1&seed=8', shots: [
    { until: (s) => s.enemyShots >= 3, max: 3000, chunk: 5, after: 0 },
  ] },
  { name: 'low-hp', url: '?wave=3&god=1&autoplay=1&seed=3', shots: [
    { until: (s) => s.simTime > 4, max: 600, chunk: 30, after: 20,
      eval: () => { const p = window.__GAME__.scene.getScene('ArenaScene').world.player; p.hp = p.maxHp * 0.2; } },
  ] },
  { name: 'death-beat', url: '?hp=1&wave=2&seed=3', shots: [
    { tag: 'start', until: (s) => s.fx?.dying, max: 4000, chunk: 2, after: 12 },
    { tag: 'fade', until: () => true, max: 1, chunk: 1, after: 34 },
  ] },
  { name: 'wave-clear', url: '?wave=1&god=1&autoplay=1&seed=1', shots: [
    { until: (s) => s.phase === 'wave_break', max: 3000, chunk: 2, after: 10 },
  ] },
  { name: 'hurt', url: '?wave=3&seed=3', shots: [
    { until: (s) => s.hp < s.maxHp, max: 3000, chunk: 1, after: 2 },
  ] },
];

async function textState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function run() {
  const browser = await launchBrowser({ headless: true, viewport: { width: 960, height: 540 } });
  const errors = [];
  const summary = [];
  try {
    for (const sc of SCENARIOS) {
      if (only.length && !only.some(w => sc.name.includes(w))) continue;
      console.log(`> ${sc.name}`);
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(`${sc.name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${sc.name}: console ${m.text()}`); });
      await page.goto(`http://localhost:${PORT}/${sc.url}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        try { return JSON.parse(window.render_game_to_text()).scenes.includes('ArenaScene'); } catch { return false; }
      }, null, { timeout: 15000 });
      for (const shot of sc.shots) {
        let ok = false;
        let st;
        for (let f = 0; f <= shot.max; f += shot.chunk) {
          st = await textState(page);
          if (shot.until(st)) { ok = true; break; }
          await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * shot.chunk);
        }
        if (!ok) {
          errors.push(`${sc.name}${shot.tag ? `-${shot.tag}` : ''}: condition never held`);
          break;
        }
        if (shot.eval) await page.evaluate(shot.eval);
        if (shot.after) await page.evaluate((ms) => window.advanceTime(ms), FRAME_MS * shot.after);
        st = await textState(page);
        const file = path.join(OUT, `${sc.name}${shot.tag ? `-${shot.tag}` : ''}.png`);
        await page.locator('canvas').screenshot({ path: file });
        fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(st, null, 2));
        summary.push({ shot: path.basename(file), mode: st.mode, wave: st.wave, enemies: st.enemyCount, hp: st.hp, fx: st.fx });
      }
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
