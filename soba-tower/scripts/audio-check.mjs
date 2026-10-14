#!/usr/bin/env node
// =============================================================================
// Soba Tower audio check (Playwright, headless Chromium, normal autoplay policy
// so the gesture unlock is tested for real). Reads render_game_to_text().audio.
//
//   A  title: no context before a gesture; the speaker button mutes without
//      starting the game and unlocks the context; M toggles; mute persists
//      across a reload; title music (one sequencer); start -> zone-1 music;
//      bounces make sound, muted bounces don't; pause/resume; a hidden tab
//      suspends the context and pauses the climb
//   B  3 game-over -> retry cycles on the deterministic test clock (?lives=1,
//      the scripted fall from scripts/example-actions.json): Results plays the
//      lose sting, each retry restarts the game music, never > 1 sequencer
//   C  ?zone=3&autoplay=1: zone-3 layers (taiko, arp, flute, chappa) at 116 bpm,
//      the bot's climb triggers crow caws, bounces, treats
//   D  ?zone=4&autoplay=1 to the roof: In-scale night layers, the drive layer
//      near the top, the bell (+ music duck), Results win fanfare -> calm loop
//   E  audio blocked (no AudioContext, or its constructor throws): the game
//      still plays, silently, with no errors
//   no console errors anywhere; liveSequencers never above 1
//
// Usage: node scripts/audio-check.mjs [--url http://localhost:3001] [--only A,B,C,D,E] [--levels]
//   --levels  also render every music layer set and SFX offline (src/audio/offline.js)
//             and print peak / RMS at the master, before the limiter
// Exit 0 when every check passes.
// =============================================================================

import fs from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3001').replace(/\/$/, '');
const only = opt('--only', 'A,B,C,D,E').split(',');
const levels = args.includes('--levels');
const outDir = 'output/audio-check';
fs.mkdirSync(outDir, { recursive: true });

const GAME_W = 270;
const MUTE_BTN = { x: 257, y: 13 };      // speaker button centre (game px), same on every screen
const FRAME = 1000 / 60;

const fails = [];
const errors = [];
let maxLive = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) fails.push(msg);
  return cond;
};

async function openPage(browser, query = '') {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.isBooted && window.render_game_to_text, null, { timeout: 15000 });
  // A Vite full reload (someone saved a src file) resets the game mid-check: flag it so the part reruns
  await page.evaluate(() => { window.__audioCheckMark = true; });
  await wait(700);
  return page;
}

async function state(page) {
  const mark = await page.evaluate(() => window.__audioCheckMark === true);
  if (!mark) throw new Error('navigation: the page reloaded during the check');
  const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  maxLive = Math.max(maxLive, s.audio.liveSequencers);
  return s;
}

async function clickGame(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / GAME_W;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const sfx = (s, name) => s.audio.sfx[name] || 0;

/** Runs `fn` once more if headless Chromium was killed underneath us. */
async function part(name, fn, force = false) {
  if (!force && !only.includes(name)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await chromium.launch({ headless: true });
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

// --- A: title, gesture unlock, mute, start, pause, background --------------------

await part('A', async (browser) => {
  let page = await openPage(browser);
  await page.evaluate(() => { try { localStorage.removeItem('soba-tower:muted'); } catch { /* blocked */ } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.isBooted && window.render_game_to_text);
  await page.evaluate(() => { window.__audioCheckMark = true; });
  await wait(800);
  let s = await state(page);
  check(s.mode === 'title' && s.audio.contextState === 'none', `before any gesture: no AudioContext (${s.audio.contextState})`);
  check(s.audio.track === 'title', `title music requested (${s.audio.track})`);

  // Shift / Ctrl / Esc are not user activation in Chrome: they must not try to unlock
  const autoplayWarnings = [];
  page.on('console', (m) => { if (/AudioContext was not allowed to start/i.test(m.text())) autoplayWarnings.push(m.text()); });
  for (const key of ['Shift', 'Control', 'Alt', 'Escape']) await page.keyboard.press(key);
  await wait(300);
  s = await state(page);
  check(s.mode === 'title' && s.audio.contextState === 'none' && autoplayWarnings.length === 0,
    `modifier keys / Esc leave audio locked, no autoplay warning (context ${s.audio.contextState}, ${autoplayWarnings.length} warnings)`);

  await clickGame(page, MUTE_BTN.x, MUTE_BTN.y);
  await wait(400);
  s = await state(page);
  check(s.isMuted && s.audio.muted, 'speaker button mutes');
  check(s.mode === 'title', `speaker button did not start the game (mode ${s.mode})`);
  check(s.audio.contextState === 'running', `the click unlocked the context (${s.audio.contextState})`);
  const stored = await page.evaluate(() => localStorage.getItem('soba-tower:muted'));
  check(stored === 'true', `mute saved to localStorage (${stored})`);

  // persists across a reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GAME__?.isBooted && window.render_game_to_text);
  await page.evaluate(() => { window.__audioCheckMark = true; });
  await wait(800);
  s = await state(page);
  check(s.isMuted && s.audio.muted, 'mute restored after reload');
  await page.keyboard.press('m');
  await wait(500);
  s = await state(page);
  check(!s.isMuted && !s.audio.muted, 'M unmutes');
  check(s.audio.contextState === 'running', `M key unlocked the context (${s.audio.contextState})`);
  check(s.audio.musicPlaying && s.audio.track === 'title' && s.audio.bpm === 92 && s.audio.liveSequencers === 1,
    `title theme playing: ${s.audio.bpm} bpm, ${s.audio.layers}, live ${s.audio.liveSequencers}`);
  check(sfx(s, 'select') >= 1, 'unmute plays the select blip');

  await page.keyboard.press('ArrowRight');
  for (let t = 0; t < 25; t++) {
    await wait(200);
    s = await state(page);
    if (s.mode === 'playing' && sfx(s, 'bounce') > 0) break;
  }
  check(s.mode === 'playing' && s.audio.track === 'game' && s.audio.musicPlaying,
    `climb music playing: section ${s.audio.section}, ${s.audio.layers}`);
  check(s.audio.section === 1 && s.audio.scale === 'yo' && s.audio.bpm === 110 && !s.audio.layers.includes('taiko'),
    `zone 1 = gentle layers (${s.audio.layers} @ ${s.audio.bpm}, ${s.audio.scale})`);
  check(s.audio.liveSequencers === 1, `one live sequencer (${s.audio.liveSequencers})`);
  check(sfx(s, 'bounce') > 0, `bounces make sound (${sfx(s, 'bounce')})`);

  // muted: no SFX play
  await page.keyboard.press('m');
  await wait(100);
  const before = await state(page);
  await wait(1500);
  s = await state(page);
  check(s.isMuted && sfx(s, 'bounce') === sfx(before, 'bounce') && s.audio.sfxSkipped > before.audio.sfxSkipped,
    `muted: bounce SFX skipped (${sfx(before, 'bounce')} -> ${sfx(s, 'bounce')}, skipped +${s.audio.sfxSkipped - before.audio.sfxSkipped})`);
  await page.keyboard.press('m');
  await wait(1200);
  s = await state(page);
  check(!s.isMuted && sfx(s, 'bounce') > sfx(before, 'bounce'), 'unmuted: bounces audible again');

  // pause / resume
  await page.keyboard.press('p');
  await wait(300);
  s = await state(page);
  check(s.mode === 'paused' && s.audio.musicPaused && !s.audio.musicPlaying && sfx(s, 'pause') === 1,
    `pause: music paused, pause blip (${sfx(s, 'pause')})`);
  await page.keyboard.press('p');
  await wait(400);
  s = await state(page);
  check(s.mode === 'playing' && s.audio.musicPlaying && sfx(s, 'unpause') === 1 && s.audio.liveSequencers === 1,
    'resume: music back, unpause blip, still one sequencer');

  // hidden tab: context suspends, the climb pauses itself; visible again: context resumes
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(400);
  s = await state(page);
  check(s.audio.contextState === 'suspended' && s.mode === 'paused', `hidden tab: context ${s.audio.contextState}, mode ${s.mode}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(400);
  s = await state(page);
  check(s.audio.contextState === 'running', `visible again: context ${s.audio.contextState}`);
  await page.keyboard.press('p');
  await wait(400);
  s = await state(page);
  check(s.mode === 'playing' && s.audio.musicPlaying && s.audio.liveSequencers === 1, 'resumed after the hidden tab');
  await page.close();
});

// --- B: 3 game-over -> retry cycles (deterministic test clock) ----------------------

await part('B', async (browser) => {
  const page = await openPage(browser, '?lives=1');
  const steps = JSON.parse(fs.readFileSync('scripts/example-actions.json', 'utf8')).steps;
  const KEYS = { left: 'ArrowLeft', right: 'ArrowRight' };
  const runSteps = async () => {
    for (const st of steps) {
      for (const b of st.buttons) await page.keyboard.down(KEYS[b]);
      for (let f = 0; f < st.frames; f++) await page.evaluate(ms => window.advanceTime(ms), FRAME);
      for (const b of st.buttons) await page.keyboard.up(KEYS[b]);
    }
  };
  for (let i = 1; i <= 3; i++) {
    await runSteps();
    await wait(300);   // real time for the Results music to start
    const s = await state(page);
    check(s.mode === 'game_over' && s.scenes.includes('ResultsScene'), `cycle ${i}: game over -> Results (mode ${s.mode})`);
    check(s.audio.track === 'results' && s.audio.intro === 'lose' && s.audio.liveSequencers === 1,
      `cycle ${i}: lose sting / results loop (${s.audio.track}/${s.audio.intro}, segment ${s.audio.segment}), live ${s.audio.liveSequencers}`);
    check(sfx(s, 'lifeLost') === i, `cycle ${i}: life-lost whoosh played (${sfx(s, 'lifeLost')})`);
  }
  // one more retry: back to the zone-1 music, still exactly one sequencer
  await page.keyboard.down('ArrowRight');
  for (let f = 0; f < 3; f++) await page.evaluate(ms => window.advanceTime(ms), FRAME);
  await page.keyboard.up('ArrowRight');
  for (let f = 0; f < 40; f++) await page.evaluate(ms => window.advanceTime(ms), FRAME);
  await wait(300);
  const s = await state(page);
  check(s.mode === 'playing' && s.attempts === 4 && s.audio.track === 'game' && s.audio.section === 1,
    `retry 4: attempt ${s.attempts}, ${s.audio.track} section ${s.audio.section}`);
  check(s.audio.liveSequencers === 1, `after 3 restarts: liveSequencers ${s.audio.liveSequencers}, started ${s.audio.sequencersStarted}`);
  check(sfx(s, 'select') >= 3, `retry select blips (${sfx(s, 'select')})`);
  await page.close();
});

// --- C: zone 3 layering + hazards with the bot --------------------------------------

await part('C', async (browser) => {
  const page = await openPage(browser, '?zone=3&autoplay=1');
  await clickGame(page, GAME_W / 2, 300);   // the gesture (the bot ignores input)
  await wait(1500);
  let s = await state(page);
  check(s.audio.contextState === 'running' && s.audio.track === 'game', `context ${s.audio.contextState}, track ${s.audio.track}`);
  const want = ['taiko', 'hats16', 'kakko', 'chappa', 'arp', 'flute'];
  check(s.zone === 3 && s.audio.section === 3 && want.every(l => s.audio.layers.includes(l)) && s.audio.bpm === 116,
    `zone 3 layers: ${s.audio.layers} @ ${s.audio.bpm}`);
  let reached4 = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    await wait(250);
    s = await state(page);
    if (s.zone === 4 && s.audio.section === 4 && !reached4) reached4 = s;
    if (reached4) break;
  }
  const caw = sfx(s, 'caw');
  check(caw >= 1, `crow caws as crows scroll on screen (${caw})`);
  check(sfx(s, 'bounce') >= 5, `bounces (${sfx(s, 'bounce')})`);
  console.log(`      zone-3 sfx: ${JSON.stringify(s.audio.sfx)}`);
  if (reached4) {
    check(reached4.audio.scale === 'in' && reached4.audio.layers.includes('drone') && sfx(reached4, 'gate') >= 1,
      `zone 4 gate: gong + night layers on the next bar (${reached4.audio.layers}, ${reached4.audio.scale})`);
  } else {
    console.log('      (the bot did not reach zone 4 within 24 s; part D covers zone 4)');
  }
  await page.screenshot({ path: `${outDir}/zone3.png` });
  await page.close();
});

// --- D: zone 4 to the bell --------------------------------------------------------------

await part('D', async (browser) => {
  const page = await openPage(browser, '?zone=4&autoplay=1');
  await clickGame(page, GAME_W / 2, 300);
  await wait(1500);
  let s = await state(page);
  check(s.audio.section === 4 && s.audio.scale === 'in' && s.audio.layers.includes('drone') && s.audio.layers.includes('tick')
    && !s.audio.layers.includes('arp') && s.audio.bpm === 118,
  `zone 4 night layers: ${s.audio.layers} @ ${s.audio.bpm} (${s.audio.scale})`);
  let drive = false;
  let ducked = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await wait(200);
    s = await state(page);
    if (s.audio.layers.includes('drive')) drive = true;
    if (sfx(s, 'bell') && ducked === null) ducked = s.audio.duckDb;
    if (s.scenes.includes('ResultsScene') && s.audio.track === 'results') break;
  }
  check(drive, 'drive layer near the top of zone 4');
  check(sfx(s, 'bell') === 1, `bell rang once (${sfx(s, 'bell')})`);
  check(ducked !== null && ducked <= -1, `music ducked under the bell (${ducked} dB)`);
  check(s.mode === 'complete' && s.audio.track === 'results' && s.audio.intro === 'win',
    `Results: ${s.audio.track} / ${s.audio.intro} (${s.audio.segment})`);
  await wait(6500);
  s = await state(page);
  check(s.audio.segment === 'loop' && s.audio.scale === 'yo' && s.audio.liveSequencers === 1,
    `after the fanfare: calm results loop (${s.audio.segment}, ${s.audio.layers}, ${s.audio.bpm} bpm)`);
  console.log(`      zone-4 sfx: ${JSON.stringify(s.audio.sfx)}`);
  await page.screenshot({ path: `${outDir}/results-win.png` });
  await page.close();
});

// --- E: audio blocked (no AudioContext / constructor throws): the game plays silently ---

await part('E', async (browser) => {
  for (const mode of ['missing', 'throws']) {
    const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
    page.on('pageerror', e => errors.push(`pageerror (${mode}): ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console (${mode}): ${m.text()}`); });
    if (mode === 'missing') {
      await page.addInitScript(() => {
        delete window.AudioContext;
        delete window.webkitAudioContext;
      });
    }
    // 'throws' from the very start: Phaser's own sound manager is off
    // (GameConfig audio.noAudio), so nothing touches AudioContext at boot
    if (mode === 'throws') {
      await page.addInitScript(() => {
        window.AudioContext = function Blocked() { throw new Error('blocked by test'); };
        window.webkitAudioContext = undefined;
      });
    }
    await page.goto(`${base}/?zone=3&autoplay=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__GAME__?.isBooted && window.render_game_to_text, null, { timeout: 15000 });
    await page.evaluate(() => { window.__audioCheckMark = true; });
    if (mode === 'throws') {
      const phaserCtx = await page.evaluate(() => !!window.__GAME__.sound?.context);
      check(!phaserCtx, `audio throws: Phaser booted without an AudioContext of its own (noAudio)`);
    }
    await wait(700);
    await clickGame(page, GAME_W / 2, 300);
    await page.keyboard.press('m');
    await page.keyboard.press('m');
    await page.keyboard.press('p');
    await wait(300);
    await page.keyboard.press('p');
    await wait(3500);
    const s = await state(page);
    check(s.audio.contextState === 'none' && s.mode === 'playing' && s.heightM > 0,
      `audio ${mode}: game plays silently (context ${s.audio.contextState}, mode ${s.mode}, ${s.heightM} m, skipped ${s.audio.sfxSkipped})`);
    await page.close();
  }
});

// --- levels (optional) ---------------------------------------------------------------

await part('levels', async (browser) => {
  const page = await openPage(browser);
  console.log('\n--- levels at the master, pre-limiter (dBFS)');
  const res = await page.evaluate(async () => {
    const m = await import('/src/audio/offline.js');
    const out = [];
    const music = [
      ['title', { track: 'title', seconds: 22 }],
      ['zone 1', { track: 'game', section: 1, seconds: 20 }],
      ['zone 2', { track: 'game', section: 2, seconds: 20 }],
      ['zone 3', { track: 'game', section: 3, seconds: 20 }],
      ['zone 4', { track: 'game', section: 4, seconds: 20 }],
      ['zone 4 drive', { track: 'game', section: 4, drive: true, seconds: 20 }],
      ['results win', { track: 'results', intro: 'win', seconds: 12 }],
      ['results lose', { track: 'results', intro: 'lose', seconds: 12 }],
    ];
    for (const [k, c] of music) out.push({ k: `music ${k}`, music: true, ...(await m.renderMusic(c)) });
    for (const n of m.SFX_NAMES) out.push({ k: `sfx ${n}`, ...(await m.renderSfx(n, { zone: 1, earned: true, index: 2, type: 'slider' }, n === 'bell' ? 8 : 3)) });
    return out;
  });
  for (const r of res) {
    console.log(`${r.k.padEnd(20)} peak ${String(r.peakDb).padStart(6)}  loud RMS ${String(r.loudRmsDb).padStart(6)}  over-threshold ${r.overLimiterPct}%`);
    if (r.music) check(r.overLimiterPct < 0.01, `${r.k}: music stays under the limiter threshold`);
    else check(r.peakDb < -1, `${r.k}: peak below -1 dBFS`);
  }
}, levels);

console.log(`\nmax liveSequencers seen: ${maxLive}`);
check(maxLive <= 1, 'never more than one live sequencer');
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(fails.length ? `\nAUDIO CHECK FAILED (${fails.length})` : '\nAUDIO CHECK OK');
process.exit(fails.length ? 1 : 0);
