#!/usr/bin/env node
// =============================================================================
// Soba Guard audio check (Playwright through scripts/lib/browser.mjs, headless
// Chromium, normal autoplay policy so the gesture unlock is tested for real).
// Reads render_game_to_text().audio.
//
//   A  menus + battle in real time: no AudioContext before a gesture; Shift /
//      Ctrl / Alt / Esc don't unlock; the speaker button mutes (and unlocks)
//      without leaving the Title; mute is saved and survives a reload; M
//      toggles; menu music keeps playing across menu screens (no restart);
//      Level Select -> battle music; the HUD speaker button toggles without
//      placing the selected card; P pauses (music fades, blip) and resumes;
//      the Pause menu's speaker button works; a hidden tab suspends the context
//   B  wave bands with ?wave=N&autoplay=1: layers grow from waves 1-3 to 4-7
//      to 8-10; a flag wave (5) adds the tension layer; the bot's play makes
//      gameplay SFX; muted -> SFX skipped
//   C  test clock: a real loss -> Results lose sting; 3 retries (R) and a
//      forced win (?test=1) -> win fanfare + happy barks; exactly 1 live
//      sequencer the whole time
//   D  audio blocked (no AudioContext / its constructor throws): the game still
//      plays, silently, with no errors
//   L  offline renders (src/audio/offline.js): every music layer set stays under
//      the limiter threshold, every SFX peaks below -1 dBFS pre-limiter, and a
//      worst-case burst (20 bites + 20 splats + 20 kills + 20 puffs + 20 coins
//      over 200 ms on top of band-3 tension music) never clips after the limiter
//   no console errors anywhere; liveSequencers never above 1
//
// Usage: node scripts/audio-check.mjs [--url http://localhost:3003] [--only A,B,C,D,L]
// Exit 0 when every check passes.
// =============================================================================

import { launchBrowser } from './lib/browser.mjs';
import { MENU } from '../src/core/MetaConstants.js';
import { AUDIO } from '../src/audio/AudioConstants.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const base = opt('--url', `http://localhost:${process.env.PORT || 3003}`).replace(/\/$/, '');
const only = opt('--only', 'A,B,C,D,L').split(',');

const W = 640;
const H = 360;
const MENU_MUTE = { x: MENU.MUTE_SLOT.X + MENU.MUTE_SLOT.W / 2, y: MENU.MUTE_SLOT.Y + MENU.MUTE_SLOT.H / 2 };
const HUD_MUTE = { x: AUDIO.MUTE_BTN_HUD.X + AUDIO.MUTE_BTN_HUD.SIZE / 2, y: AUDIO.MUTE_BTN_HUD.Y + AUDIO.MUTE_BTN_HUD.SIZE / 2 };

const fails = [];
const errors = [];
let maxLive = 0;
let okCount = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (cond) okCount += 1;
  else fails.push(msg);
  return cond;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const sfx = (s, name) => s.audio.sfx[name] || 0;

function watch(page, tag = '') {
  page.on('pageerror', e => errors.push(`pageerror${tag}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console${tag}: ${m.text()}`); });
}

async function boot(page, query = '', scene = null) {
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((k) => window.__GAME__?.isBooted && window.render_game_to_text
    && (!k || window.__GAME__.scene.isActive(k)), scene, { timeout: 20000 });
  // A Vite full reload (someone saved a src file) resets the game mid-check: flag it so the part reruns
  await page.evaluate(() => { window.__audioCheckMark = true; });
}

async function state(page) {
  const mark = await page.evaluate(() => window.__audioCheckMark === true);
  if (!mark) throw new Error('navigation: the page reloaded during the check');
  const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  maxLive = Math.max(maxLive, s.audio.liveSequencers || 0);
  return s;
}

async function clickGame(page, x, y) {
  const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.mouse.click(r.x + (x / W) * r.w, r.y + (y / H) * r.h);
}

async function hoverGame(page, x, y) {
  const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.mouse.move(r.x + (x / W) * r.w, r.y + (y / H) * r.h);
}

const active = (page, key) => page.evaluate(k => window.__GAME__.scene.isActive(k), key);
const adv = (page, ms) => page.evaluate(t => window.advanceTime(t), ms);

/** Polls until fn(state) is true or the timeout passes; returns the last state. */
async function until(page, fn, ms = 6000, step = 150) {
  const t0 = Date.now();
  let s = await state(page);
  while (!fn(s) && Date.now() - t0 < ms) {
    await wait(step);
    s = await state(page);
  }
  return s;
}

/** Runs `fn` with a fresh browser; reruns (up to 3 tries) when the browser dies or the page reloads. */
async function part(name, fn) {
  if (!only.includes(name)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await launchBrowser();
    try {
      console.log(`\n--- part ${name}${attempt > 1 ? ' (retry)' : ''}`);
      await fn(browser);
      await browser.close();
      return;
    } catch (err) {
      await browser.close().catch(() => {});
      const msg = String(err);
      if (attempt < 3 && /Target (page, context or browser )?(has been )?closed|Browser closed|crashed|Execution context was destroyed|navigation/i.test(msg)) continue;
      check(false, `part ${name} threw: ${msg.split('\n')[0]}`);
      return;
    }
  }
}

// --- A: menus, gesture unlock, mute, battle music, pause, hidden tab ----------------

await part('A', async (browser) => {
  const page = await browser.newPage();
  watch(page);
  await boot(page, '?reset=1', 'TitleScene');
  await wait(600);
  let s = await state(page);
  check(s.audio.contextState === 'none', `before any gesture: no AudioContext (${s.audio.contextState})`);
  check(s.audio.track === 'menu', `menu music requested on the Title (${s.audio.track})`);

  // Shift / Ctrl / Esc are not user activation in Chrome: they must not try to unlock
  const autoplayWarnings = [];
  page.on('console', (m) => { if (/AudioContext was not allowed to start/i.test(m.text())) autoplayWarnings.push(m.text()); });
  for (const key of ['Shift', 'Control', 'Alt', 'Escape']) await page.keyboard.press(key);
  await wait(300);
  s = await state(page);
  check(s.audio.contextState === 'none' && autoplayWarnings.length === 0,
    `modifier keys / Esc leave audio locked, no autoplay warning (context ${s.audio.contextState}, ${autoplayWarnings.length} warnings)`);

  // the speaker button: mutes, unlocks, doesn't leave the Title
  await hoverGame(page, MENU_MUTE.x, MENU_MUTE.y);
  await wait(150);
  await clickGame(page, MENU_MUTE.x, MENU_MUTE.y);
  await wait(400);
  s = await state(page);
  check(s.audio.muted === true, `speaker button mutes (${s.audio.muted})`);
  check(await active(page, 'TitleScene') && s.menu?.scene === 'TitleScene', `speaker button did not leave the Title (${s.menu?.scene})`);
  check(s.audio.contextState === 'running', `the click unlocked the context (${s.audio.contextState})`);
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('soba-guard:save')).muted; } catch { return 'ERR'; } });
  check(saved === true, `mute saved in soba-guard:save (${saved})`);

  // persists across a reload
  await boot(page, '', 'TitleScene');
  await wait(500);
  s = await state(page);
  check(s.audio.muted === true, 'mute restored after a reload');
  await page.keyboard.press('m');
  s = await until(page, x => x.audio.musicPlaying);
  check(s.audio.muted === false, 'M unmutes');
  check(s.audio.contextState === 'running', `the M key unlocked the context (${s.audio.contextState})`);
  check(s.audio.musicPlaying && s.audio.track === 'menu' && s.audio.bpm === AUDIO.MENU_BPM && s.audio.liveSequencers === 1,
    `menu music playing: ${s.audio.bpm} bpm, [${s.audio.layers}], live ${s.audio.liveSequencers}`);
  check(sfx(s, 'uiConfirm') >= 1, 'unmute plays the confirm pluck');
  await page.keyboard.press('m');
  await wait(200);
  await page.keyboard.press('m');
  await wait(200);
  s = await state(page);
  check(s.audio.muted === false, 'M toggles twice -> unmuted again');

  // menu navigation sounds, and menu music keeps going into Level Select
  const startedOnTitle = s.audio.sequencersStarted;
  await page.keyboard.press('ArrowDown');
  await wait(150);
  await page.keyboard.press('ArrowUp');
  await wait(150);
  s = await state(page);
  check(sfx(s, 'uiMove') >= 1, `arrow keys: menu move ticks (${sfx(s, 'uiMove')})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME__.scene.isActive('LevelSelectScene'), null, { timeout: 5000 });
  await wait(700);
  s = await state(page);
  check(sfx(s, 'uiConfirm') >= 2, `Enter on Play: confirm pluck (${sfx(s, 'uiConfirm')})`);
  check(s.audio.track === 'menu' && s.audio.sequencersStarted === startedOnTitle && s.audio.musicPlaying,
    `Level Select keeps the menu music (no restart: started ${startedOnTitle} -> ${s.audio.sequencersStarted})`);
  // Level Select has its own speaker button
  await clickGame(page, MENU_MUTE.x, MENU_MUTE.y);
  await wait(250);
  s = await state(page);
  check(s.audio.muted === true && await active(page, 'LevelSelectScene'), 'Level Select speaker button mutes (stays on the screen)');
  await clickGame(page, MENU_MUTE.x, MENU_MUTE.y);
  await wait(250);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME__.scene.isActive('BattleScene'), null, { timeout: 5000 });
  s = await until(page, x => x.audio.track === 'battle' && x.audio.musicPlaying);
  check(s.audio.track === 'battle' && s.audio.musicPlaying && s.audio.section === 1 && !s.audio.layers.includes('taiko'),
    `battle music, wave band 1: [${s.audio.layers}] @ ${s.audio.bpm}`);
  check(s.audio.liveSequencers === 1, `one live sequencer (${s.audio.liveSequencers})`);

  // HUD speaker button: toggles without placing the selected card
  await page.keyboard.press('1');
  await wait(150);
  const before = await state(page);
  await clickGame(page, HUD_MUTE.x, HUD_MUTE.y);
  await wait(300);
  s = await state(page);
  const units = x => (x.units || []).length;
  check(s.audio.muted === true && s.mode === 'playing' && units(s) === units(before),
    `HUD speaker button mutes, nothing placed (units ${units(before)} -> ${units(s)}, mode ${s.mode})`);
  check(sfx(before, 'cardSelect') >= 1, `card 1 selected with a tok (${sfx(before, 'cardSelect')})`);
  await clickGame(page, HUD_MUTE.x, HUD_MUTE.y);
  await wait(300);
  s = await state(page);
  check(s.audio.muted === false, 'HUD speaker button unmutes');

  // pause / resume
  await page.keyboard.press('p');
  s = await until(page, x => x.audio.musicPaused, 2000);
  check(s.mode === 'paused' && s.audio.musicPaused && !s.audio.musicPlaying && sfx(s, 'pause') === 1,
    `pause: music faded out, pause blip (${sfx(s, 'pause')})`);
  await clickGame(page, MENU_MUTE.x, MENU_MUTE.y);
  await wait(250);
  s = await state(page);
  check(s.audio.muted === true && await active(page, 'PauseScene'), 'Pause menu speaker button mutes, still paused');
  await page.keyboard.press('m');
  await wait(150);
  await page.keyboard.press('p');
  s = await until(page, x => x.audio.musicPlaying, 2000);
  check(s.mode === 'playing' && s.audio.musicPlaying && sfx(s, 'unpause') === 1 && s.audio.liveSequencers === 1,
    'resume: music back, unpause blip, still one sequencer');

  // hidden tab: the context suspends; visible again: resumes
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(400);
  s = await state(page);
  check(s.audio.contextState === 'suspended', `hidden tab: context ${s.audio.contextState}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  s = await until(page, x => x.audio.contextState === 'running' && x.audio.musicPlaying, 2000);
  check(s.audio.contextState === 'running' && s.audio.musicPlaying, `visible again: context ${s.audio.contextState}, music ${s.audio.musicPlaying}`);
  await page.screenshot({ path: 'output/audio-check-hud.png' }).catch(() => {});
  await page.close();
});

// --- B: wave bands, tension, gameplay SFX ---------------------------------------------

await part('B', async (browser) => {
  const page = await browser.newPage();
  watch(page);
  const bands = {};
  for (const [wave, band, tension] of [[1, 1, false], [4, 2, false], [5, 2, true], [8, 3, false]]) {
    await boot(page, `?wave=${wave}&coins=400&autoplay=1`, 'BattleScene');
    await clickGame(page, 600, 200);   // the gesture (the alley: no command)
    if (wave === 1) await page.keyboard.press('Space');   // skip the setup: wave 1 starts
    // layers change on the next bar line
    const s = await until(page, x => x.audio.musicPlaying && x.audio.section === band && x.audio.tension === tension, 6000);
    bands[wave] = s.audio.layers;
    if (wave === 1) check(sfx(s, 'waveStart') === 1, `Space starts wave 1: wave start drum (${sfx(s, 'waveStart')})`);
    check(s.audio.track === 'battle' && s.audio.section === band && s.audio.tension === tension,
      `?wave=${wave}: band ${s.audio.section}${s.audio.tension ? ' + tension' : ''}, [${s.audio.layers}] @ ${s.audio.bpm} (${s.audio.scale})`);
    if (wave === 8) {
      // let the bot play: gameplay SFX
      const t = await until(page, x => sfx(x, 'place') > 0 && sfx(x, 'shoot') > 0 && (sfx(x, 'hit') + sfx(x, 'lidHit')) > 0, 20000, 300);
      console.log(`      sfx after ~20 s of wave 8: ${JSON.stringify(t.audio.sfx)}`);
      check(sfx(t, 'place') > 0 && sfx(t, 'shoot') > 0 && sfx(t, 'hit') + sfx(t, 'lidHit') > 0,
        `the bot's play is audible: place ${sfx(t, 'place')}, shoot ${sfx(t, 'shoot')}, hit ${sfx(t, 'hit')}, lid ${sfx(t, 'lidHit')}`);
      // muted: SFX skipped
      await page.keyboard.press('m');
      await wait(150);
      const m0 = await state(page);
      await wait(2500);
      const m1 = await state(page);
      const total = x => Object.values(x.audio.sfx).reduce((a, b) => a + b, 0);
      check(m1.audio.muted && total(m1) === total(m0) && m1.audio.sfxSkipped > m0.audio.sfxSkipped,
        `muted: SFX skipped (played ${total(m0)} -> ${total(m1)}, skipped +${m1.audio.sfxSkipped - m0.audio.sfxSkipped})`);
      await page.keyboard.press('m');
    }
  }
  check(bands[1].length < bands[4].length && bands[4].length < bands[8].length,
    `layers grow with the waves: ${bands[1].length} -> ${bands[4].length} -> ${bands[8].length}`);
  check(bands[5].includes('tension') && bands[5].includes('shime') && bands[5].length > bands[4].length,
    `flag wave adds the tension layer (${bands[5].length} layers: [${bands[5]}])`);
  await page.close();
});

// --- C: loss sting, 3 retries, win fanfare (test clock) --------------------------------

await part('C', async (browser) => {
  const page = await browser.newPage();
  watch(page);
  // Results ignores keys for its first 300 ms of GAME time, and the test clock
  // only moves with advanceTime: step past that guard before pressing keys.
  const toScene = async (key, maxMs = 6000) => {
    for (let t = 0; t < maxMs && !(await active(page, key)); t += 100) await adv(page, 100);
    await adv(page, 500);
  };
  await boot(page, '?wave=10&bot=idle&test=1', 'BattleScene');
  await clickGame(page, 600, 200);
  await wait(300);
  // a real loss: the idle bot at wave 10
  let s;
  for (let i = 0; i < 40 && !(await active(page, 'ResultsScene')); i++) await adv(page, 5000);
  await adv(page, 500);
  s = await until(page, x => x.audio.track === 'results' && x.audio.musicPlaying, 3000);
  check(s.mode === 'game_over' && await active(page, 'ResultsScene'), `idle at wave 10 loses -> Results (mode ${s.mode})`);
  check(s.audio.track === 'results' && s.audio.intro === 'lose' && s.audio.liveSequencers === 1,
    `lose sting / results loop (${s.audio.track}/${s.audio.intro}, segment ${s.audio.segment}), live ${s.audio.liveSequencers}`);
  check(sfx(s, 'doorBang') === 1, `the door bang at the loss (${sfx(s, 'doorBang')})`);
  const started0 = s.audio.sequencersStarted;
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press('r');
    await toScene('BattleScene');
    s = await until(page, x => x.audio.track === 'battle' && x.audio.musicPlaying, 3000);
    check(s.mode === 'playing' && s.audio.track === 'battle' && s.audio.liveSequencers === 1,
      `retry ${i}: battle music again, live ${s.audio.liveSequencers}`);
    if (i < 3) {
      await page.evaluate(() => window.__TEST_FINISH__(false));
      await toScene('ResultsScene');
      s = await until(page, x => x.audio.track === 'results', 3000);
      check(s.audio.intro === 'lose' && s.audio.liveSequencers === 1, `retry ${i} -> loss -> lose sting, live ${s.audio.liveSequencers}`);
    }
  }
  check(s.audio.sequencersStarted - started0 === 5 && s.audio.liveSequencers === 1,
    `3 retries: ${s.audio.sequencersStarted - started0} sequencers started (3 battles + 2 results), ${s.audio.liveSequencers} live`);
  // a win: fanfare, happy barks, then the calm loop
  await page.evaluate(() => window.__TEST_FINISH__(true));
  await toScene('ResultsScene');
  s = await until(page, x => x.audio.track === 'results', 3000);
  check(s.audio.intro === 'win' && s.audio.segment === 'intro' && s.audio.layers.includes('intro:win'),
    `win: fanfare intro (${s.audio.layers})`);
  s = await until(page, x => sfx(x, 'happyBarks') >= 1 && x.audio.segment === 'loop', 6000, 200);
  check(sfx(s, 'happyBarks') === 1, `happy barks after the fanfare (${sfx(s, 'happyBarks')})`);
  check(s.audio.segment === 'loop' && s.audio.scale === 'yo' && s.audio.liveSequencers === 1,
    `after the fanfare: calm results loop (${s.audio.segment}, [${s.audio.layers}], ${s.audio.bpm} bpm)`);
  // Results -> Level Select: menu music
  await page.keyboard.press('Escape');
  await toScene('LevelSelectScene');
  s = await until(page, x => x.audio.track === 'menu' && x.audio.musicPlaying, 3000);
  check(s.audio.track === 'menu' && s.audio.liveSequencers === 1, `Results -> Level Select: menu music (${s.audio.track}), live ${s.audio.liveSequencers}`);
  await page.close();
});

// --- D: audio blocked: the game plays silently ------------------------------------------

await part('D', async (browser) => {
  for (const mode of ['missing', 'throws']) {
    const page = await browser.newPage();
    watch(page, ` (${mode})`);
    if (mode === 'missing') {
      await page.addInitScript(() => {
        delete window.AudioContext;
        delete window.webkitAudioContext;
      });
    } else {
      await page.addInitScript(() => {
        window.AudioContext = function Blocked() { throw new Error('blocked by test'); };
        window.webkitAudioContext = undefined;
      });
    }
    await boot(page, '?autoplay=1', 'BattleScene');
    await wait(500);
    await clickGame(page, 600, 200);
    await page.keyboard.press('m');
    await page.keyboard.press('m');
    await clickGame(page, HUD_MUTE.x, HUD_MUTE.y);
    await page.keyboard.press('p');
    await wait(300);
    await page.keyboard.press('p');
    const t0 = (await state(page)).time;
    await wait(3000);
    const s = await state(page);
    check(s.audio.contextState === 'none' && s.mode === 'playing' && s.time > t0,
      `audio ${mode}: game plays silently (context ${s.audio.contextState}, mode ${s.mode}, t ${t0} -> ${s.time}, skipped ${s.audio.sfxSkipped})`);
    await page.close();
  }
});

// --- L: offline levels -----------------------------------------------------------------

await part('L', async (browser) => {
  const page = await browser.newPage();
  watch(page);
  await boot(page, '', 'TitleScene');
  console.log('\n--- levels at the master, pre-limiter (dBFS)');
  const res = await page.evaluate(async () => {
    const m = await import('/src/audio/offline.js');
    const out = [];
    const music = [
      ['menu', { track: 'menu', seconds: 22 }],
      ['battle 1', { track: 'battle', section: 1, seconds: 20 }],
      ['battle 2', { track: 'battle', section: 2, seconds: 20 }],
      ['battle 3', { track: 'battle', section: 3, seconds: 20 }],
      ['battle 2 tension', { track: 'battle', section: 2, tension: true, seconds: 20 }],
      ['battle 3 tension', { track: 'battle', section: 3, tension: true, seconds: 20 }],
      ['results win', { track: 'results', intro: 'win', seconds: 12 }],
      ['results lose', { track: 'results', intro: 'lose', seconds: 12 }],
    ];
    for (const [k, c] of music) out.push({ k: `music ${k}`, kind: 'music', ...(await m.renderMusic(c)) });
    for (const n of m.SFX_NAMES) {
      out.push({ k: `sfx ${n}`, kind: 'sfx', ...(await m.renderSfx(n, { streak: 6 }, n === 'hugeWave' ? 5 : 2.5)) });
    }
    const burst = ['bite', 'hit', 'killRat', 'shoot', 'coinCollect'];
    out.push({ k: 'burst pre-limiter', kind: 'burstPre', ...(await m.renderBurst(burst, { count: 20 })) });
    out.push({ k: 'burst post-limiter', kind: 'burstPost', ...(await m.renderBurst(burst, { count: 20, limiter: true })) });
    return out;
  });
  for (const r of res) {
    console.log(`${r.k.padEnd(24)} peak ${String(r.peakDb).padStart(6)}  loud RMS ${String(r.loudRmsDb).padStart(6)}  over-thr ${r.overLimiterPct}%${r.played !== undefined ? `  played ${r.played} skipped ${r.skipped}` : ''}`);
    if (r.kind === 'music') check(r.overLimiterPct < 0.01, `${r.k}: music stays under the limiter threshold`);
    else if (r.kind === 'sfx') check(r.peakDb < -1, `${r.k}: peak below -1 dBFS`);
    else if (r.kind === 'burstPre') check(r.skipped > 0, `burst: the gate throttles (${r.played} played, ${r.skipped} skipped, pre-limiter peak ${r.peakDb})`);
    else if (r.kind === 'burstPost') check(r.clippedSamples === 0 && r.peakDb < 0, `burst after the limiter: no clipped samples (peak ${r.peakDb} dBFS)`);
  }
  await page.close();
});

console.log(`\nmax liveSequencers seen: ${maxLive}`);
check(maxLive <= 1, 'never more than one live sequencer');
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(fails.length ? `\nAUDIO CHECK FAILED (${fails.length} of ${okCount + fails.length})` : `\nAUDIO CHECK OK (${okCount} checks)`);
process.exit(fails.length ? 1 : 0);
