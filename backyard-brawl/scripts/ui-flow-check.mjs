#!/usr/bin/env node
// =============================================================================
// ui-flow-check.mjs — menu flow QA (test clock, headless, via lib/browser.mjs).
//
//   A  keyboard, debug run (?hp=1&seed=3): Title -Enter-> WeaponSelect -Enter->
//      Arena (2 presses) -> death -> Results (not saved) -Space-> Arena (instant)
//      -> Results -Esc-> Title
//   B  keyboard, plain URL, seeded save: Kennel (buy, verify localStorage, deny
//      when short) -> Title -> Scores -> Title; then a plain run to death writes
//      a score, bones and stats; Results -> Weapon -> WeaponSelect
//   C  mouse only: click PLAY, click a card (select), click it again -> Arena
//   D  touch only (hasTouch): tap PLAY, tap START -> Arena; Results Play Again tap
//
// Exits non-zero on any failed check or console error.
//   node scripts/ui-flow-check.mjs
// =============================================================================

import {
  BASE, openGame, step, state, press, readSave, click, tap, waitForScene, checker,
} from './lib/menu-qa.mjs';

const c = checker('ui-flow-check');
const allErrors = [];

async function untilMode(page, modes, maxFrames, chunk = 30) {
  for (let f = 0; f < maxFrames; f += chunk) {
    const s = await state(page);
    if (modes.includes(s.mode)) return { s, frames: f };
    // pick the first card if a level-up is open (only possible in long runs)
    if (s.mode === 'levelup') await page.keyboard.press('1');
    await step(page, chunk);
  }
  return { s: await state(page), frames: maxFrames };
}

async function framesUntilScene(page, key, max = 30) {
  for (let f = 0; f <= max; f++) {
    const on = await page.evaluate((k) => window.__GAME__.scene.isActive(k), key);
    if (on) return f;
    await step(page, 1);
  }
  return Infinity;
}

async function partA() {
  console.log('\nA. keyboard flow (debug run ?hp=1&seed=3)');
  const { browser, page, errors } = await openGame({ url: `${BASE}/?hp=1&seed=3`, seed: null });
  await step(page, 10);
  let s = await state(page);
  c.ok(s.menu?.screen === 'title' && s.menu.focus === 'play', `title shows with PLAY focused (${s.menu?.screen}/${s.menu?.focus})`);
  await press(page, 'Enter', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect', 'Enter #1 -> WeaponSelect');
  c.ok(s.menu?.selected === 'bark', `default pick is bark (${s.menu?.selected})`);
  await press(page, 'Enter', 4);
  s = await state(page);
  c.ok(s.scenes.includes('ArenaScene'), 'Enter #2 -> Arena (Title -> Arena in 2 key presses)');
  c.ok(s.runConfig?.startWeapon === 'bark' && s.runConfig?.endless === false && typeof s.runConfig?.meta?.hearty === 'number',
    `runConfig set ${JSON.stringify(s.runConfig)}`);

  let r = await untilMode(page, ['game_over', 'victory'], 6000);
  s = r.s;
  await step(page, 10);
  s = await state(page);
  c.ok(s.menu?.screen === 'results', `death -> Results after ${r.frames} frames`);
  c.ok(s.menu?.saved === false, 'debug run is not saved');
  c.ok(s.save.runs === 0, 'debug run left stats untouched');
  const raw = await readSave(page);
  c.ok(raw === null || raw.stats?.runs === 0, 'debug run wrote nothing to localStorage');

  // Instant replay
  const t0 = Date.now();
  await page.keyboard.press('Space');
  const f = await framesUntilScene(page, 'ArenaScene');
  const ms = Date.now() - t0;
  c.ok(f <= 2, `Space on Results -> Arena in ${f} frame(s) (${ms} ms wall clock)`);
  c.ok(ms < 1000, 'instant replay under 1 s');
  s = await state(page);
  c.ok(s.runConfig?.startWeapon === 'bark', 'replay keeps the runConfig');

  r = await untilMode(page, ['game_over', 'victory'], 6000);
  await step(page, 20);
  s = await state(page);
  c.ok(s.menu?.screen === 'results', 'second death -> Results');
  await press(page, 'ArrowRight', 3);
  s = await state(page);
  c.ok(s.menu?.focus === 'weapon', `Right moves focus to WEAPON (${s.menu?.focus})`);
  await press(page, 'Escape', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title', 'Esc on Results -> Title');

  // Pause menu: Esc in the Arena, Restart reuses runConfig, Quit -> title
  await press(page, 'Enter', 6);
  await press(page, 'Enter', 6);
  await step(page, 30);
  await press(page, 'Escape', 4);
  s = await state(page);
  c.ok(s.menu?.screen === 'pause' && s.mode === 'paused', 'Esc in Arena -> Pause');
  await press(page, 'ArrowDown', 2);
  await press(page, 'Enter', 6);
  s = await state(page);
  c.ok(s.scenes.includes('ArenaScene') && !s.scenes.includes('PauseScene') && s.mode !== 'paused', 'Pause Restart -> fresh Arena');
  await press(page, 'Escape', 4);
  await press(page, 'q', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title' && !s.scenes.includes('ArenaScene'), 'Pause Q -> Title');

  await browser.close();
  allErrors.push(...errors);
}

async function partB() {
  console.log('\nB. keyboard flow, plain URL (saves)');
  const seed = {
    version: 1, bones: 50, scores: [], kennel: {}, stats: { runs: 0, kills: 0, bestWave: 0, wins: 0 },
    unlocks: { weapons: ['bark', 'ball'], endless: false }, lastWeapon: 'ball', muted: true,
  };
  const { browser, page, errors } = await openGame({ url: BASE, seed });
  await step(page, 10);
  let s = await state(page);
  c.ok(s.save.bones === 50, `seeded save loaded (bones ${s.save.bones})`);

  // Kennel via the menu row: Right, Enter
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 8);
  s = await state(page);
  c.ok(s.menu?.screen === 'kennel' && s.menu.focus === 'hearty', `Kennel opens on Hearty (${s.menu?.focus})`);
  await press(page, 'Enter', 4);
  let raw = await readSave(page);
  c.ok(raw?.kennel?.hearty === 1 && raw?.bones === 40, `bought Hearty 1 for 10 (save: hearty ${raw?.kennel?.hearty}, bones ${raw?.bones})`);
  await press(page, 'Enter', 4);
  raw = await readSave(page);
  c.ok(raw?.kennel?.hearty === 2 && raw?.bones === 20, `bought Hearty 2 for 20 (bones ${raw?.bones})`);
  await press(page, 'Enter', 4); // rank 3 costs 35 > 20
  raw = await readSave(page);
  s = await state(page);
  c.ok(raw?.kennel?.hearty === 2 && raw?.bones === 20 && s.menu.bones === 20, 'cannot buy without funds (nothing spent)');
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 4); // Strong Jaws rank 1 = 10
  raw = await readSave(page);
  c.ok(raw?.kennel?.jaws === 1 && raw?.bones === 10, `bought Strong Jaws 1 (bones ${raw?.bones})`);
  await press(page, 'Escape', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title' && s.menu.focus === 'kennel', 'Esc -> Title, focus back on KENNEL');

  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 8);
  s = await state(page);
  c.ok(s.menu?.screen === 'scores' && s.menu.rows === 0, 'Scores opens (empty table)');
  await press(page, 'Escape', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title', 'Esc -> Title');

  // Remembered pick + a plain run that saves
  await press(page, 'ArrowLeft', 3);
  await press(page, 'ArrowLeft', 3);
  await press(page, 'Enter', 6);
  s = await state(page);
  c.ok(s.menu?.selected === 'ball', `WeaponSelect remembers the last pick (${s.menu?.selected})`);
  await press(page, 'ArrowLeft', 3); // -> bark
  await press(page, 'Enter', 6);
  s = await state(page);
  c.ok(s.runConfig?.startWeapon === 'bark' && s.runConfig.meta.hearty === 2 && s.runConfig.meta.jaws === 1,
    `runConfig carries weapon + Kennel ranks ${JSON.stringify(s.runConfig)}`);
  raw = await readSave(page);
  c.ok(raw?.lastWeapon === 'bark', 'last pick saved');

  const r = await untilMode(page, ['game_over', 'victory'], 40000, 60);
  await step(page, 20);
  s = await state(page);
  c.ok(s.menu?.screen === 'results', `plain run ended -> Results (${r.frames} frames, wave ${s.result?.wave})`);
  c.ok(s.menu?.saved === true && s.menu.rank === 1, `plain run saved at rank ${s.menu?.rank}`);
  raw = await readSave(page);
  const bones = s.menu?.bones;
  c.ok(raw?.scores?.length === 1 && raw.stats.runs === 1 && raw.lastScoreId === raw.scores[0].id,
    'score entry + stats + newest id written');
  c.ok(bones && raw.bones === 10 + bones.total
    && bones.total === Math.floor(s.result.score / 2000) + 3 * (s.result.wavesCleared || 0) + (s.result.goldenBones || 0),
  `Golden Bones = floor(score/2000) + 3 x waves + drops (${JSON.stringify(bones)})`);

  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter', 8);
  s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect', 'Results WEAPON -> WeaponSelect');
  await press(page, 'Escape', 6);
  await press(page, 'h', 8);
  s = await state(page);
  c.ok(s.menu?.screen === 'scores' && s.menu.rows === 1 && s.menu.newestRow === 0, 'Scores shows + highlights the new entry');
  await press(page, 'Enter', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title', 'Enter on BACK -> Title');

  await browser.close();
  allErrors.push(...errors);
}

async function partC() {
  console.log('\nC. mouse only');
  const seed = { version: 1, unlocks: { weapons: ['bark', 'ball', 'bone'], endless: true }, lastWeapon: 'bark' };
  const { browser, page, errors } = await openGame({ url: `${BASE}/?seed=5`, seed });
  await step(page, 10);
  await click(page, 'TitleScene', 'play', 6);
  let s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect', 'click PLAY -> WeaponSelect');
  await click(page, 'WeaponSelectScene', 'bone', 4);
  s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect' && s.menu.selected === 'bone', 'first click on a card selects it');
  await click(page, 'WeaponSelectScene', 'zoomies', 4);
  s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect' && s.menu.selected === 'bone', 'click on a locked card does nothing');
  await click(page, 'WeaponSelectScene', 'endless', 4);
  s = await state(page);
  c.ok(s.menu?.endless === true, 'click ENDLESS toggles it on');
  await click(page, 'WeaponSelectScene', 'bone', 6);
  s = await state(page);
  c.ok(s.scenes.includes('ArenaScene') && s.runConfig?.startWeapon === 'bone' && s.runConfig.endless === true,
    `second click starts the run ${JSON.stringify(s.runConfig)}`);
  await browser.close();
  allErrors.push(...errors);
}

async function partD() {
  console.log('\nD. touch only (hasTouch)');
  const { browser, page, errors } = await openGame({
    url: `${BASE}/?hp=1&seed=3`, seed: null, contextOptions: { hasTouch: true, isMobile: true },
  });
  await step(page, 10);
  await tap(page, 'TitleScene', 'play', 6);
  let s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect', 'tap PLAY -> WeaponSelect');
  await tap(page, 'WeaponSelectScene', 'start', 6);
  s = await state(page);
  c.ok(s.scenes.includes('ArenaScene'), 'tap START -> Arena');
  await untilMode(page, ['game_over', 'victory'], 6000);
  await step(page, 20);
  await tap(page, 'ResultsScene', 'again', 4);
  s = await state(page);
  c.ok(s.scenes.includes('ArenaScene'), 'tap PLAY AGAIN -> Arena');
  await untilMode(page, ['game_over', 'victory'], 6000);
  await step(page, 20);
  await tap(page, 'ResultsScene', 'title', 6);
  await tap(page, 'TitleScene', 'kennel', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'kennel', 'tap KENNEL -> Kennel');
  await tap(page, 'KennelScene', 'back', 6);
  await tap(page, 'TitleScene', 'scores', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'scores', 'tap SCORES -> Scores');
  await tap(page, 'ScoresScene', 'back', 6);
  s = await state(page);
  c.ok(s.menu?.screen === 'title', 'tap BACK -> Title');
  await browser.close();
  allErrors.push(...errors);
}

try {
  await partA();
  await partB();
  await partC();
  await partD();
} catch (e) {
  allErrors.push(`EXCEPTION: ${e.stack || e.message}`);
}
process.exit(c.finish(allErrors));
