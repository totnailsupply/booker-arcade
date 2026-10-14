#!/usr/bin/env node
// Screenshots of every menu (1280x720 page, 480x270 game) into output/menus/.
// Seeds a rich save so every widget has content. Uses the test clock.
//   node scripts/menu-shots.mjs [--out output/menus]

import fs from 'node:fs';
import path from 'node:path';
import {
  openGame, richSave, step, press, shot, waitForScene,
} from './lib/menu-qa.mjs';

const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : 'output/menus';
fs.mkdirSync(OUT, { recursive: true });
const file = (n) => path.join(OUT, `${n}.png`);

async function startResults(page, result) {
  await page.evaluate((r) => {
    const g = window.__GAME__;
    const active = g.scene.getScenes(true)[0];
    active.scene.start('ResultsScene', { result: r });
  }, result);
  await waitForScene(page, 'ResultsScene');
}

async function main() {
  // --- rich save: title, weapon select, kennel, scores, results, pause
  let { browser, page, errors } = await openGame({ seed: richSave() });
  await step(page, 40);
  await shot(page, file('01-title'));
  await press(page, 'Enter', 20);
  await shot(page, file('02-weapon-select'));
  await press(page, 'ArrowRight', 3);
  await press(page, 'ArrowDown', 3);
  await press(page, 'Enter', 20); // locked card -> shake + message
  await step(page, 4);
  await shot(page, file('03-weapon-select-locked'));
  await press(page, 'Escape', 20);
  await press(page, 'k', 20);
  await shot(page, file('04-kennel'));
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 30); // buy Strong Jaws -> already MAX
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 30); // buy Quick Paws rank 1
  await shot(page, file('05-kennel-bought'));
  await press(page, 'Escape', 20);
  await press(page, 'h', 20);
  await shot(page, file('06-scores'));
  await press(page, 'Escape', 20);

  await startResults(page, {
    score: 18450, wave: 6, wavesCleared: 5, level: 17, kills: 702, timeSec: 263, bestCombo: 24,
    victory: false, endless: false, goldenBones: 2, bossesBeaten: ['boss-cat'],
    weapons: [{ key: 'ball', level: 4 }, { key: 'bark', level: 2 }, { key: 'frisbee', level: 1 }], startWeapon: 'ball',
  });
  await step(page, 30);
  await shot(page, file('07-results-counting'));
  await step(page, 120);
  await shot(page, file('08-results'));

  // Pause over a live run
  await press(page, 'Space', 10);
  await waitForScene(page, 'ArenaScene');
  await step(page, 200);
  await press(page, 'Escape', 10);
  await shot(page, file('09-pause'));
  await browser.close();
  const allErrors = [...errors];

  // --- fresh save: empty scores, victory with every unlock at once
  ({ browser, page, errors } = await openGame({ seed: null }));
  await step(page, 20);
  await shot(page, file('10-title-fresh'));
  await press(page, 'h', 20);
  await shot(page, file('11-scores-empty'));
  await press(page, 'Escape', 20);
  await startResults(page, {
    score: 31200, wave: 10, wavesCleared: 10, level: 28, kills: 1300, timeSec: 512, bestCombo: 41,
    victory: true, endless: false, goldenBones: 6, bossesBeaten: ['boss-cat', 'boss-vac'],
    weapons: [{ key: 'bark', level: 5 }, { key: 'ball', level: 3 }, { key: 'squeak', level: 2 }, { key: 'zoomies', level: 1 }],
    startWeapon: 'bark',
  });
  await step(page, 160);
  await shot(page, file('12-results-victory-unlocks'));
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 20);
  await shot(page, file('13-weapon-select-all-unlocked'));
  await browser.close();
  allErrors.push(...errors);

  if (allErrors.length) {
    console.error('Console errors:');
    allErrors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }
  console.log(`menu shots written to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
