#!/usr/bin/env node
// =============================================================================
// playthrough-check.mjs — a keyboard-only "human" session on the test clock.
//
// Title -> Enter -> Weapon Select -> Enter -> Arena, then about two waves:
// moves with WASD and arrows (8 directions, re-decided every 8 frames from
// render_game_to_text: away from the nearest enemies, off the fence), dashes
// with Space / Shift when something is close, rerolls once with R, picks cards
// with 1/2/3, pauses with Esc and resumes with Esc (and once with P + Enter on
// RESUME). Screenshots every 10 s of game time to output/playthrough/ (plus
// level-up and pause). Exit 1 if a step doesn't respond or the page errors.
//
//   node scripts/playthrough-check.mjs [--url http://localhost:3002] [--seed 21] [--secs 60]
// =============================================================================

import fs from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';
import { checker, step, state } from './lib/menu-qa.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = opt('url', `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, '');
const SEED = Number(opt('seed', 21));
const SECS = Number(opt('secs', 60));
const OUT = 'output/playthrough';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const c = checker('playthrough-check');

const browser = await launchBrowser({ headless: true, viewport: { width: 960, height: 540 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });

const held = new Set();
async function hold(keys) {
  for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function tapKey(k, after = 2) {
  await page.keyboard.press(k);
  await step(page, after);
}

// WASD for the first half, arrows after (both are player bindings)
function dirKeys(mx, my, arrows) {
  const k = [];
  if (mx > 0.35) k.push(arrows ? 'ArrowRight' : 'd');
  if (mx < -0.35) k.push(arrows ? 'ArrowLeft' : 'a');
  if (my > 0.35) k.push(arrows ? 'ArrowDown' : 's');
  if (my < -0.35) k.push(arrows ? 'ArrowUp' : 'w');
  return k;
}

function decide(s) {
  const p = s.player;
  let mx = 0;
  let my = 0;
  for (const e of s.enemies || []) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.max(8, Math.hypot(dx, dy));
    if (d > 120) continue;
    mx += dx / (d * d);
    my += dy / (d * d);
  }
  // stay off the fence: pull toward the centre near the edges
  const cx = 384 - p.x;
  const cy = 256 - p.y;
  if (Math.abs(cx) > 300) mx += Math.sign(cx) * 0.02;
  if (Math.abs(cy) > 180) my += Math.sign(cy) * 0.02;
  if (!mx && !my) { mx = 0.3 * Math.cos(s.simTime * 0.7); my = 0.3 * Math.sin(s.simTime * 0.7); }
  const l = Math.hypot(mx, my) || 1;
  const near = (s.enemies || [])[0];
  return { mx: mx / l, my: my / l, dash: !!near && near.dist < 22 && p.dashCd <= 0 };
}

let shots = 0;
const snap = async (name) => {
  await page.screenshot({ path: `${OUT}/${String(++shots).padStart(2, '0')}-${name}.png` });
};

try {
  await page.goto(`${BASE}/?seed=${SEED}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.isBooted && window.__GAME__.scene.isActive('TitleScene'), null, { timeout: 15000 });
  await step(page, 20);
  await snap('title');
  await tapKey('Enter', 14);
  let s = await state(page);
  c.ok(s.menu?.screen === 'weaponSelect', 'Enter on the title -> Weapon Select');
  await snap('weapon-select');
  await tapKey('Enter', 14);
  s = await state(page);
  c.ok(s.mode === 'playing', `Enter -> Arena (${s.mode})`);

  let nextShot = 10;
  let rerolled = false;
  let picks = 0;
  let pickKeys = new Set();
  let pausedEsc = false;
  let pausedP = false;
  let dashes = 0;
  let levelupShot = false;
  const startT = s.simTime;
  for (let i = 0; i < 60 * (SECS + 40) / 8; i++) {
    s = await state(page);
    if (s.mode === 'game_over' || s.mode === 'victory') break;
    if (s.simTime - startT >= SECS && s.wave >= 2 && s.mode !== 'levelup') break;
    if (s.mode === 'levelup') {
      await hold([]);
      await step(page, 40); // burst + cards
      if (!levelupShot) { await snap('levelup'); levelupShot = true; }
      if (!rerolled && s.rerolls > 0) {
        const before = s.choices.map(x => x.key).join();
        await tapKey('r', 30);
        const after = await state(page);
        c.ok(after.rerolls === s.rerolls - 1, `R rerolls (${s.rerolls} -> ${after.rerolls}; ${before} -> ${after.choices?.map(x => x.key).join()})`);
        rerolled = true;
      }
      const key = String((picks % 3) + 1);
      const lvl = s.level;
      const w = JSON.stringify(s.weapons) + JSON.stringify(s.statLevels);
      await tapKey(key, 20);
      const after = await state(page);
      const took = (JSON.stringify(after.weapons) + JSON.stringify(after.statLevels)) !== w;
      c.ok(took, `key ${key} picks card ${key} at level ${lvl}`);
      picks += 1;
      pickKeys.add(key);
      continue;
    }
    if (!pausedEsc && s.simTime - startT > 15 && s.mode === 'playing') {
      await hold([]);
      await tapKey('Escape', 10);
      const p = await state(page);
      c.ok(p.mode === 'paused', `Esc pauses (${p.mode})`);
      await snap('pause');
      await step(page, 30);
      const t0 = (await state(page)).simTime;
      c.ok(t0 === p.simTime, 'sim frozen while paused');
      await tapKey('Escape', 10);
      const r = await state(page);
      c.ok(r.mode !== 'paused' && !r.scenes.includes('PauseScene'), `Esc resumes (${r.mode})`);
      pausedEsc = true;
      continue;
    }
    if (!pausedP && s.simTime - startT > 40 && s.mode === 'playing') {
      await hold([]);
      await tapKey('p', 10);
      const p = await state(page);
      const focus = p.menu?.focus;
      await tapKey('Enter', 10);
      const r = await state(page);
      c.ok(p.mode === 'paused' && focus === 'resume' && r.mode !== 'paused', `P pauses, Enter on RESUME resumes (${p.mode}, focus ${focus}, then ${r.mode})`);
      pausedP = true;
      continue;
    }
    const d = decide(s);
    const keys = dirKeys(d.mx, d.my, s.simTime - startT > SECS / 2);
    if (d.dash) { keys.push(dashes % 2 ? 'Shift' : 'Space'); dashes += 1; }
    await hold(keys);
    await step(page, 8);
    if (d.dash) await hold(keys.filter(k => k !== 'Space' && k !== 'Shift'));
    if (s.simTime - startT >= nextShot) {
      await snap(`t${String(nextShot).padStart(3, '0')}s-wave${s.wave}`);
      nextShot += 10;
    }
  }
  await hold([]);
  s = await state(page);
  await snap(`end-${s.mode}-wave${s.wave}`);
  console.log(`     end: mode ${s.mode}, wave ${s.wave}, level ${s.level}, score ${s.score}, hp ${s.hp}/${s.maxHp}, picks ${picks}, dashes ${dashes}`);
  c.ok(s.wave >= 2 || s.mode === 'game_over', `played into wave 2 (wave ${s.wave}, ${s.mode})`);
  c.ok(picks >= 2 && pickKeys.size >= 2, `picked ${picks} cards with keys ${[...pickKeys].join('/')}`);
  c.ok(rerolled, 'rerolled once with R');
  c.ok(pausedEsc && pausedP, 'paused with Esc and with P');
  c.ok(dashes > 0, `dashed ${dashes} times (Space / Shift)`);
} catch (e) {
  errors.push(`EXCEPTION: ${e.stack || e.message}`);
} finally {
  await browser.close();
}
c.ok(!errors.length, `no page / console errors (${errors.length})`);
console.log(`\nscreenshots: ${OUT}/ (${shots})`);
process.exit(c.finish(errors));
