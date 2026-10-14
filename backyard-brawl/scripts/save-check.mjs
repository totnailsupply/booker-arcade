#!/usr/bin/env node
// =============================================================================
// save-check.mjs — SaveData robustness (backyard-brawl:save, version 1).
//
//   - corrupt JSON, wrong JSON types, missing fields, bad field values and a
//     version mismatch all load as defaults (field by field) with no errors
//   - data persists across a reload (Kennel purchase, mute)
//   - the first write replaces a corrupt entry with a valid v1 save
//   - debug runs (?god=1) never write
//   - localStorage that throws on every call: the game still boots and runs
//
// Exits non-zero on any failed check or console error.
//   node scripts/save-check.mjs
// =============================================================================

import {
  BASE, openGame, step, state, press, readSave, checker, waitForScene,
} from './lib/menu-qa.mjs';

const c = checker('save-check');
const allErrors = [];

async function snapshotSave(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__SAVE__.get())));
}

async function loadCase(name, seed, check, url = BASE) {
  console.log(`\n${name}`);
  const { browser, page, errors } = await openGame({ url, seed });
  await step(page, 6);
  const d = await snapshotSave(page);
  await check(d, page);
  await browser.close();
  allErrors.push(...errors.map(e => `[${name}] ${e}`));
}

const isDefault = (d) => d.version === 1 && d.bones === 0 && d.scores.length === 0
  && Object.values(d.kennel).every(v => v === 0) && d.unlocks.weapons.join() === 'bark'
  && d.unlocks.endless === false && d.stats.runs === 0 && d.muted === false;

async function main() {
  await loadCase('corrupt JSON', '{"version":1,"bones":12,', (d) => {
    c.ok(isDefault(d), 'corrupt JSON -> defaults');
  });
  await loadCase('JSON array', '[1,2,3]', (d) => c.ok(isDefault(d), 'array -> defaults'));
  await loadCase('JSON null', 'null', (d) => c.ok(isDefault(d), 'null -> defaults'));
  await loadCase('JSON number', '42', (d) => c.ok(isDefault(d), 'number -> defaults'));
  await loadCase('version mismatch', { version: 2, bones: 500, unlocks: { weapons: ['ball'], endless: true } }, (d) => {
    c.ok(isDefault(d), 'version 2 -> defaults');
  });
  await loadCase('no version', { bones: 500 }, (d) => c.ok(isDefault(d), 'missing version -> defaults'));
  await loadCase('only version', { version: 1 }, (d) => c.ok(isDefault(d), '{version:1} -> defaults for every field'));
  await loadCase('bad field values', {
    version: 1,
    bones: 'lots',
    scores: [{ score: 'x' }, null, { score: 900, weapon: 'laser', wave: -3 }, { score: 1200, wave: 4, date: 12 }],
    kennel: { hearty: 99, jaws: -2, paws: 2.7, foo: 3 },
    stats: { runs: 'many', kills: 120, bossesBeaten: ['boss-cat', 7, 'boss-cat'] },
    unlocks: { weapons: ['laser', 'ball', 'ball'], endless: 'yes' },
    lastWeapon: 'frisbee',
    muted: 1,
  }, (d) => {
    c.ok(d.bones === 0, 'non-numeric bones -> 0');
    c.ok(d.scores.length === 2 && d.scores[0].score === 1200 && d.scores[1].weapon === 'bark' && d.scores[1].wave === 0,
      `bad score rows dropped / repaired (${JSON.stringify(d.scores.map(s => [s.score, s.weapon, s.wave]))})`);
    c.ok(d.kennel.hearty === 5 && d.kennel.jaws === 0 && d.kennel.paws === 2 && !('foo' in d.kennel), `kennel ranks clamped ${JSON.stringify(d.kennel)}`);
    c.ok(d.stats.runs === 0 && d.stats.kills === 120 && d.stats.bossesBeaten.join() === 'boss-cat', 'stats repaired');
    c.ok(d.unlocks.weapons.join() === 'bark,ball' && d.unlocks.endless === true, `unlocks filtered ${d.unlocks.weapons}`);
    c.ok(d.lastWeapon === 'bark', 'last pick of a locked weapon falls back to bark');
    c.ok(d.muted === true, 'muted coerced to boolean');
  });

  // Persistence across reload + corrupt entry replaced by the first write
  console.log('\npersistence');
  {
    const { browser, page, errors } = await openGame({ url: BASE, seed: '{oops' });
    await step(page, 6);
    await press(page, 'm', 4); // mute -> first write
    let raw = await readSave(page);
    c.ok(raw && raw.version === 1 && raw.muted === true, 'first write replaces the corrupt entry with a valid v1 save');
    // Give ourselves bones through the save API (as Results would), then buy in the Kennel
    await page.evaluate(() => { window.__SAVE__.get().bones = 30; window.__SAVE__.write(); });
    await press(page, 'k', 8);
    await press(page, 'Enter', 4);
    raw = await readSave(page);
    c.ok(raw.kennel.hearty === 1 && raw.bones === 20, 'Kennel purchase written');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene', 15000, true);
    await step(page, 6);
    const s = await state(page);
    c.ok(s.save.bones === 20 && s.save.kennel.hearty === 1 && s.isMuted === true, `reload keeps bones, kennel, mute (${s.save.bones}, ${s.save.kennel.hearty}, ${s.isMuted})`);
    await browser.close();
    allErrors.push(...errors.map(e => `[persistence] ${e}`));
  }

  // Unlock rules + Golden Bones formula (recordRun on a plain URL)
  console.log('\nunlocks + bones');
  {
    const { browser, page, errors } = await openGame({ url: BASE, seed: null });
    await step(page, 4);
    const run = (r) => page.evaluate((x) => {
      const rec = window.__SAVE__.recordRun(x);
      return { rec, unlocks: window.__SAVE__.get().unlocks, bones: window.__SAVE__.get().bones };
    }, r);
    let o = await run({ score: 5999, wave: 2, wavesCleared: 1, kills: 100, goldenBones: 1, victory: false });
    c.ok(o.rec.bones.fromScore === 2 && o.rec.bones.fromWaves === 3 && o.rec.bones.drops === 1 && o.rec.bones.total === 6 && o.bones === 6,
      `bones = floor(5999/2000) + 3x1 + 1 = ${o.rec.bones.total}`);
    c.ok(o.rec.newWeapons.length === 0 && o.unlocks.weapons.join() === 'bark', 'wave 2: nothing unlocked');
    o = await run({ score: 0, wave: 3, wavesCleared: 2, kills: 100 });
    c.ok(o.rec.newWeapons.join() === 'ball', `reach wave 3 -> ball (${o.rec.newWeapons})`);
    o = await run({ score: 0, wave: 1, kills: 300 });
    c.ok(o.rec.newWeapons.join() === 'bone', `500 lifetime kills -> bone (${o.rec.newWeapons})`);
    o = await run({ score: 0, wave: 6, wavesCleared: 5, kills: 1, bossesBeaten: ['boss-cat'] });
    c.ok(o.rec.newWeapons.join() === 'frisbee,squeak', `wave 6 + Big Tom -> frisbee, squeak (${o.rec.newWeapons})`);
    c.ok(!o.rec.endlessUnlocked && !o.unlocks.endless, 'no endless before a win');
    o = await run({ score: 0, wave: 10, wavesCleared: 10, kills: 1, victory: true, bossesBeaten: ['boss-cat', 'boss-vac'] });
    c.ok(o.rec.newWeapons.join() === 'zoomies' && o.rec.endlessUnlocked && o.unlocks.endless, 'win -> zoomies + endless');
    o = await run({ score: 0, wave: 12, wavesCleared: 11, kills: 1, victory: false, endless: true });
    c.ok(o.rec.newWeapons.length === 0 && !o.rec.endlessUnlocked, 'nothing unlocks twice');
    const raw = await readSave(page);
    c.ok(raw.scores.length === 6 && raw.stats.runs === 6 && raw.stats.wins === 1 && raw.stats.bestWave === 12
      && raw.stats.bossesBeaten.join() === 'boss-cat,boss-vac' && raw.scores.some(x => x.endless && x.wave === 12),
    'stats + score flags written');
    await browser.close();
    allErrors.push(...errors.map(e => `[unlocks] ${e}`));
  }

  // Debug runs never write
  console.log('\ndebug run');
  {
    const seed = { version: 1, bones: 30, muted: false };
    const { browser, page, errors } = await openGame({ url: `${BASE}/?god=1`, seed });
    await step(page, 6);
    const before = await page.evaluate(() => localStorage.getItem('backyard-brawl:save'));
    await press(page, 'm', 4);
    await press(page, 'k', 8);
    await press(page, 'Enter', 4);
    await press(page, 'Escape', 6);
    await press(page, 'ArrowLeft', 3);
    await press(page, 'Enter', 6);
    await press(page, 'Enter', 30);
    c.ok((await state(page)).scenes.includes('ArenaScene'), '?god=1 run started');
    const after = await page.evaluate(() => localStorage.getItem('backyard-brawl:save'));
    c.ok(before === after, '?god=1: mute, Kennel buy and a run start leave localStorage unchanged');
    await browser.close();
    allErrors.push(...errors.map(e => `[debug] ${e}`));
  }

  // Storage that throws everywhere
  console.log('\nthrowing storage');
  {
    const { browser, page, errors } = await openGame({
      url: BASE,
      initScript: () => {
        const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
        Storage.prototype.getItem = boom;
        Storage.prototype.setItem = boom;
        Storage.prototype.removeItem = boom;
      },
    });
    await step(page, 6);
    await press(page, 'm', 4);
    await press(page, 'k', 8);
    await press(page, 'Enter', 4);
    await press(page, 'Escape', 6);
    await press(page, 'ArrowLeft', 3);
    await press(page, 'Enter', 6);
    await press(page, 'Enter', 10);
    const s = await state(page);
    c.ok(s.scenes.includes('ArenaScene'), 'game boots and starts a run with throwing localStorage');
    await browser.close();
    allErrors.push(...errors.map(e => `[throwing] ${e}`));
  }
}

try {
  await main();
} catch (e) {
  allErrors.push(`EXCEPTION: ${e.stack || e.message}`);
}
process.exit(c.finish(allErrors));
