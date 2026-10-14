#!/usr/bin/env node
// =============================================================================
// touch-check.mjs — the whole game with taps and drags only, on phone
// viewports (hasTouch + isMobile): landscape 844x390 and portrait 390x844.
//
// Per viewport:
//   1. ?god=1&seed=3: Title -> tap PLAY -> tap START -> Arena.
//      Joystick drag (CDP touch events, held over several frames) moves Booker
//      right, then up. Dash button tap dashes. Wait for a level-up, tap a card
//      (and the REROLL button first when offered). Tap the HUD pause button ->
//      Pause, tap RESUME -> playing.
//   2. ?hp=1&seed=3: tap through to the Arena, get knocked out -> Results,
//      tap PLAY AGAIN -> Arena, knocked out again -> tap TITLE -> Title.
// Screenshots go to output/touch/ (arena HUD with the touch controls showing,
// level-up, pause, results). Geometry checks: the canvas fits the viewport, the
// Dash button and the joystick zone don't cover HUD text (bounds checked in
// game coordinates).
//
// Test clock (advanceTime) for determinism. Exit 1 on any failure or page error.
//   node scripts/touch-check.mjs [--url http://localhost:3002]
// =============================================================================

import fs from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';
import { checker, itemPos, toPage, step, state } from './lib/menu-qa.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = opt('url', `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, '');
const OUT = 'output/touch';
fs.mkdirSync(OUT, { recursive: true });
const c = checker('touch-check');
const allErrors = [];

const VIEWPORTS = [
  { name: 'landscape', viewport: { width: 844, height: 390 } },
  { name: 'portrait', viewport: { width: 390, height: 844 } },
];

async function open(url, viewport) {
  const browser = await launchBrowser({
    headless: true,
    viewport,
    contextOptions: { hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`); });
  await page.addInitScript(() => { try { localStorage.removeItem('backyard-brawl:save'); } catch { /* ignore */ } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.isBooted && window.__GAME__.scene.isActive('TitleScene'), null, { timeout: 15000 });
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, errors, cdp };
}

async function tapItem(page, scene, key, after = 6) {
  const p = await itemPos(page, scene, key);
  await page.touchscreen.tap(p.x, p.y);
  await step(page, after);
}

async function tapGame(page, gx, gy, after = 4) {
  const p = await toPage(page, gx, gy);
  await page.touchscreen.tap(p.x, p.y);
  await step(page, after);
}

/** Holds a finger at game (x0,y0), drags to (x1,y1), holds `frames`, lifts. */
async function drag(page, cdp, [x0, y0], [x1, y1], frames) {
  const a = await toPage(page, x0, y0);
  const b = await toPage(page, x1, y1);
  const pt = (p) => [{ x: p.x, y: p.y, id: 7, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a) });
  await step(page, 2);
  for (let i = 1; i <= 5; i++) {
    const p = { x: a.x + (b.x - a.x) * (i / 5), y: a.y + (b.y - a.y) * (i / 5) };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
    await step(page, 1);
  }
  await step(page, frames);
  const mid = await state(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await step(page, 2);
  return mid;
}

async function untilMode(page, modes, maxFrames) {
  for (let f = 0; f < maxFrames; f += 20) {
    const s = await state(page);
    if (modes.includes(s.mode)) return s;
    await step(page, 20);
  }
  return state(page);
}

async function play(vp) {
  console.log(`\n== ${vp.name} ${vp.viewport.width}x${vp.viewport.height} ==`);
  const tag = vp.name;
  // --- 1. god run: controls ---------------------------------------------------------
  {
    const { browser, page, errors, cdp } = await open(`${BASE}/?god=1&seed=3`, vp.viewport);
    try {
      await step(page, 10);
      const box = await page.evaluate(() => {
        const r = window.__GAME__.canvas.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
      });
      c.ok(box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= box.vw + 0.5 && box.y + box.h <= box.vh + 0.5,
        `canvas fits the viewport (${Math.round(box.w)}x${Math.round(box.h)} at ${Math.round(box.x)},${Math.round(box.y)})`);
      await page.screenshot({ path: `${OUT}/${tag}-1-title.png` });
      await tapItem(page, 'TitleScene', 'play', 12);
      let s = await state(page);
      c.ok(s.menu?.screen === 'weaponSelect', 'tap PLAY -> Weapon Select');
      await page.screenshot({ path: `${OUT}/${tag}-2-weapons.png` });
      await tapItem(page, 'WeaponSelectScene', 'start', 12);
      s = await state(page);
      c.ok(s.scenes.includes('ArenaScene') && s.mode === 'playing', `tap START -> Arena (${s.mode})`);

      // Joystick: drag right from the left half of the screen
      const p0 = s.player;
      let mid = await drag(page, cdp, [120, 160], [160, 160], 30);
      c.ok(mid.player.x > p0.x + 20 && Math.abs(mid.player.y - p0.y) < 12, `joystick right moves Booker right (${p0.x},${p0.y} -> ${mid.player.x},${mid.player.y})`);
      const p1 = (await state(page)).player;
      // The joystick ring is drawn while the finger is down: screenshot mid-drag
      const a = await toPage(page, 120, 170);
      const b = await toPage(page, 120, 140);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 8 }] });
      await step(page, 2);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y, id: 8 }] });
      await step(page, 30);
      await page.screenshot({ path: `${OUT}/${tag}-3-arena-joystick.png` });
      mid = await state(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await step(page, 2);
      c.ok(mid.player.y < p1.y - 15, `joystick up moves Booker up (${p1.y} -> ${mid.player.y})`);
      const touchUi = await page.evaluate(() => {
        const t = window.__GAME__.scene.getScene('ArenaScene').touch;
        return { seen: t.touchSeen, joy: t.joyId };
      });
      c.ok(touchUi.seen && touchUi.joy === null, 'touch controls active, joystick released on lift');

      // Dash button
      const before = (await state(page)).player;
      const D = await page.evaluate(() => ({ x: 444, y: 232 }));
      await tapGame(page, D.x, D.y, 2);
      s = await state(page);
      c.ok(s.player.dashCd > 0 || s.player.dashing, `Dash button dashes (dashCd ${s.player.dashCd}, dashing ${s.player.dashing}; before ${before.dashCd})`);

      // HUD vs touch controls: nothing of the HUD inside the Dash button or the joystick start zone
      const geo = await page.evaluate(() => {
        const sc = window.__GAME__.scene.getScene('ArenaScene');
        const h = sc.hud;
        const objs = { hp: h.hpText, lv: h.lvText, wave: h.waveText, timer: h.timerText, score: h.scoreText, bones: h.boneText };
        const out = {};
        for (const [k, o] of Object.entries(objs)) {
          const r = o.getBounds();
          out[k] = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        h.slots.forEach((sl, i) => { const r = sl.icon.getBounds(); out[`slot${i}`] = { x: r.x, y: r.y, w: r.width, h: r.height }; });
        return { hud: out, pause: { x: h.pauseBtn.x, y: h.pauseBtn.y, s: h.pauseBtn.size } };
      });
      const DASH = { x: 444, y: 232, r: 18 };
      const hitsDash = Object.entries(geo.hud).filter(([, r]) => {
        const cx = Math.max(r.x, Math.min(DASH.x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(DASH.y, r.y + r.h));
        return (cx - DASH.x) ** 2 + (cy - DASH.y) ** 2 < DASH.r ** 2;
      }).map(([k]) => k);
      c.ok(!hitsDash.length, `Dash button covers no HUD element (${hitsDash.join(',') || 'none'})`);
      const offscreen = Object.entries(geo.hud).filter(([, r]) => r.w > 0 && (r.x < 0 || r.y < 0 || r.x + r.w > 480 || r.y + r.h > 270)).map(([k]) => k);
      c.ok(!offscreen.length, `HUD fully inside the 480x270 view (${offscreen.join(',') || 'all inside'})`);

      // Level-up: wait (god mode, bark auto-fires) and tap a card
      s = await untilMode(page, ['levelup'], 60 * 90);
      await step(page, 40); // intro burst + cards flip in
      c.ok(s.mode === 'levelup' && (await state(page)).scenes.includes('LevelUpScene'), `level-up overlay opened (level ${s.level})`);
      await page.screenshot({ path: `${OUT}/${tag}-4-levelup.png` });
      const lu = await page.evaluate(() => {
        const sc = window.__GAME__.scene.getScene('LevelUpScene');
        return {
          cards: sc.cards.map(k => ({ x: k.x, y: k.baseY })),
          reroll: sc.rerollBtn && sc.rerollBtn.visible ? { x: sc.rerollBtn.x, y: sc.rerollBtn.y } : null,
          rerolls: sc.world.rerolls,
          choices: sc.world.choices.map(x => x.key).join(),
        };
      });
      if (lu.reroll) {
        await tapGame(page, lu.reroll.x, lu.reroll.y, 30);
        const after = await page.evaluate(() => {
          const sc = window.__GAME__.scene.getScene('LevelUpScene');
          return { rerolls: sc.world.rerolls };
        });
        c.ok(after.rerolls === lu.rerolls - 1, `tap REROLL rerolls (${lu.rerolls} -> ${after.rerolls})`);
      } else {
        c.ok(false, 'a REROLL button is offered on touch');
      }
      const lvBefore = (await state(page)).weapons;
      const statsBefore = JSON.stringify((await state(page)).statLevels);
      await tapGame(page, lu.cards[1].x, lu.cards[1].y, 30);
      s = await state(page);
      const changed = JSON.stringify(s.weapons) !== JSON.stringify(lvBefore) || JSON.stringify(s.statLevels) !== statsBefore;
      c.ok(changed, `tap a card picks it (weapons ${JSON.stringify(s.weapons.map(w => w.key + w.level))})`);
      s = await untilMode(page, ['playing', 'wave_break'], 600);
      c.ok(['playing', 'wave_break'].includes(s.mode), `back to playing after the pick (${s.mode})`);

      // Pause by touch (HUD pause button), then resume by touch
      await tapGame(page, geo.pause.x + geo.pause.s / 2, geo.pause.y + geo.pause.s / 2, 8);
      s = await state(page);
      c.ok(s.mode === 'paused' && s.scenes.includes('PauseScene'), `tap the HUD pause button -> Pause (${s.mode})`);
      await page.screenshot({ path: `${OUT}/${tag}-5-pause.png` });
      await tapItem(page, 'PauseScene', 'resume', 8);
      s = await state(page);
      c.ok(!s.scenes.includes('PauseScene') && ['playing', 'wave_break', 'levelup'].includes(s.mode), `tap RESUME -> playing (${s.mode})`);
      await step(page, 20);
      await page.screenshot({ path: `${OUT}/${tag}-6-arena.png` });
    } finally {
      await browser.close();
    }
    allErrors.push(...errors.map(e => `[${tag} god] ${e}`));
  }
  // --- 2. Results by touch ------------------------------------------------------------
  {
    const { browser, page, errors } = await open(`${BASE}/?hp=1&seed=3`, vp.viewport);
    try {
      await step(page, 10);
      await tapItem(page, 'TitleScene', 'play', 12);
      await tapItem(page, 'WeaponSelectScene', 'start', 12);
      let s = await untilMode(page, ['game_over', 'victory'], 60 * 60);
      c.ok(s.mode === 'game_over', `knocked out -> Results (${s.mode})`);
      await step(page, 90);
      await page.screenshot({ path: `${OUT}/${tag}-7-results.png` });
      await tapItem(page, 'ResultsScene', 'again', 6);
      s = await state(page);
      c.ok(s.scenes.includes('ArenaScene') && s.mode === 'playing', 'tap PLAY AGAIN -> Arena');
      s = await untilMode(page, ['game_over', 'victory'], 60 * 60);
      await step(page, 30);
      await tapItem(page, 'ResultsScene', 'title', 12);
      s = await state(page);
      c.ok(s.menu?.screen === 'title', `tap TITLE -> Title (${s.menu?.screen})`);
    } finally {
      await browser.close();
    }
    allErrors.push(...errors.map(e => `[${tag} results] ${e}`));
  }
}

try {
  for (const vp of VIEWPORTS) await play(vp);
} catch (e) {
  allErrors.push(`EXCEPTION: ${e.stack || e.message}`);
}
console.log(`\nscreenshots: ${OUT}/`);
process.exit(c.finish(allErrors));
