// Audio check. Runs against the dev server (default http://localhost:3000).
//
//   node scripts/audio-check.mjs [url] [--only songs,menu,run,levels,flow,sfx,glide,mute,mix]
//
// songs   song data: 16 bars each, token counts, chords, section layering
// menu    title menu theme, title mute button (no game start), M key, level select keeps the loop
// run     Level 1: game music, 3 death-restarts with one live sequencer, HUD mute (no jump),
//         pause/resume, section 3 and a live crossing into section 4
// levels  every level's variant (song, bpm, layers) in sections 1 and 4, plus music levels
// flow    in-page level changes (pause > Q > level select > next card): one live sequencer
// sfx     every ability and UI event plays its SFX without errors; rate limits hold
// glide   glide wind loop starts/stops (events, pause) and follows a real bot glide
// mute    mute silences music, SFX and the glide loop (meter on the master, post-mute)
// mix     SFX peaks sit at or under the music peaks; nothing near clipping
import { launchBrowser } from './lib/browser.mjs';
import { AUDIO } from '../src/core/Constants.js';
import { validateSongs, VARIANT_IDS } from '../src/audio/songs.js';

const args = process.argv.slice(2);
const url = (args.find(a => a.startsWith('http')) || 'http://localhost:3000').replace(/\/$/, '');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const want = (part) => !only || only.has(part);

const fail = [];
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail.push(msg); };
const section = (name) => console.log(`\n== ${name} ==`);
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

// --- songs (static, no browser) -------------------------------------------------
if (want('songs')) {
  section('songs');
  const problems = validateSongs();
  problems.forEach(p => console.log('   ', p));
  check(problems.length === 0, `song data valid (${problems.length} problems)`);
  for (const v of VARIANT_IDS) check(Array.isArray(AUDIO.VARIANT_BPM[v]) && AUDIO.VARIANT_BPM[v].length === 4, `${v}: 4 section tempos ${AUDIO.VARIANT_BPM[v]}`);
  const tops = VARIANT_IDS.map(v => AUDIO.VARIANT_BPM[v][3]);
  check(AUDIO.VARIANT_BPM.steakhouse[3] === Math.max(...tops), 'steakhouse is the fastest in section 4');
}

const browserParts = ['menu', 'run', 'levels', 'flow', 'sfx', 'glide', 'mute', 'mix'];
if (!browserParts.some(want)) process.exit(fail.length ? 1 : 0);

const browser = await launchBrowser({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('crash', () => console.log('PAGE CRASHED'));
let closing = false;
page.on('close', () => { if (!closing) console.log('PAGE CLOSED (unexpected)'); });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const wait = ms => page.waitForTimeout(ms);
const state = async () => {
  for (let i = 0; i < 20; i++) {
    try { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); } catch { await wait(250); }
  }
  throw new Error('render_game_to_text unavailable');
};
/** Polls state until pred(s) holds or timeout; returns the last state. */
const until = async (pred, timeout = 5000, step = 100) => {
  let s = await state();
  for (let t = 0; t < timeout && !pred(s); t += step) {
    await wait(step);
    s = await state();
  }
  return s;
};
/** Loads a page and makes a neutral gesture (Shift) so the AudioContext starts. */
const open = async (query = '') => {
  await page.goto(`${url}/${query ? `?${query}` : ''}`);
  await wait(900);
  await page.keyboard.press('Shift');
  await wait(300);
};
const fire = (name, payload = {}, times = 1) => page.evaluate(([n, p, k]) => {
  const ev = window.__EVENTS__[n];
  if (!ev) return false;
  for (let i = 0; i < k; i++) window.__EVENT_BUS__.emit(ev, p);
  return true;
}, [name, payload, times]);
const counts = async () => (await state()).audio.sfx || {};
const meterOn = () => page.evaluate(() => window.__AUDIO__.enableMeter());
const meterRead = (reset = true) => page.evaluate(r => window.__AUDIO__.readMeter(r), reset);
const meterReset = () => page.evaluate(() => window.__AUDIO__.resetMeter());

let s;

// --- menu -----------------------------------------------------------------------
if (want('menu') || want('run')) {
  section('menu');
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.removeItem('booker-run:muted'); } catch {} });
  await page.reload();
  await wait(1200);
  s = await state();
  check(s.audio.contextState === 'none' || s.audio.contextState === 'suspended', `before gesture: context ${s.audio.contextState}, track ${s.audio.track}`);
  check(s.audio.track === 'menu', 'title requested menu music');

  // Click the title mute button: must mute and NOT start the game
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 480;
  const clickGame = (x, y) => page.mouse.click(box.x + x * k, box.y + y * k);
  await clickGame(480 - 6 - 7, 6 + 7);
  await wait(400);
  s = await state();
  check(s.isMuted === true && s.audio.muted === true, 'title mute button mutes');
  check(s.mode === 'title', `title button did not start game (mode ${s.mode})`);
  check(s.audio.contextState === 'running', `context running after gesture (${s.audio.contextState})`);
  await page.keyboard.press('m');
  await wait(100);
  s = await state();
  check(s.isMuted === false, 'M key unmutes');
  s = await until(x => x.audio.musicPlaying);
  check(s.audio.musicPlaying && s.audio.track === 'menu' && s.audio.song === 'menu' && s.audio.bpm === AUDIO.MENU_BPM,
    `menu theme playing (${s.audio.song} @ ${s.audio.bpm} bpm, ${s.audio.layers})`);

  // Title -> level select (menu music keeps playing, same sequencer)
  const started = s.audio.sequencersStarted;
  await page.keyboard.press('Space');
  s = await until(x => x.mode === 'levelselect', 3000);
  check(s.mode === 'levelselect' && s.audio.track === 'menu' && s.audio.musicPlaying, `level select keeps the menu loop (${s.mode}, ${s.audio.track})`);
  await wait(400);
  const c0 = await counts();
  await page.keyboard.press('ArrowRight');
  await wait(150);
  await page.keyboard.press('ArrowLeft');
  await wait(250);
  s = await state();
  check((s.audio.sfx.menuMove || 0) >= (c0.menuMove || 0) + 1, `menu move tick (${c0.menuMove || 0} -> ${s.audio.sfx.menuMove || 0})`);
  check(s.audio.sequencersStarted === started, `menu loop not restarted by the level select (${started} -> ${s.audio.sequencersStarted})`);

  if (want('run')) {
    section('run (Level 1)');
    await page.keyboard.press('Space');
    s = await until(x => x.mode === 'playing' && x.audio.track === 'game', 4000);
    check(s.mode === 'playing' && s.audio.track === 'game' && s.audio.musicPlaying, `game music playing: ${s.audio.layers}`);
    check(s.audio.variant === 'yard' && s.audio.song === 'yard', `Level 1 plays the yard variant (${s.audio.variant}/${s.audio.song})`);
    check((s.audio.sfx.menuSelect || 0) >= 2, `select confirm played (title + level select: ${s.audio.sfx.menuSelect || 0})`);
    check(s.audio.liveSequencers === 1, `live sequencers = ${s.audio.liveSequencers}`);

    // 3 deaths in a row (idle into the first cone); a press on the game-over card
    // retries (presses in its first GAMEOVER.INPUT_LOCK_MS are ignored)
    for (let i = 0; i < 3; i++) {
      const before = (await state()).attempts;
      await until(x => x.mode === 'gameover', 9000);
      await wait(700);
      await page.keyboard.press('Space');
      s = await until(x => x.attempts > before && x.mode === 'playing', 3000);
      await wait(300);
      s = await state();
      check(s.attempts === before + 1 && s.audio.liveSequencers === 1 && s.audio.musicPlaying,
        `restart ${i + 1}: attempt ${s.attempts}, live sequencers ${s.audio.liveSequencers}, playing ${s.audio.musicPlaying}`);
    }
    s = await state();
    check((s.audio.sfx.death || 0) >= 3 && ((s.audio.sfx.gameOver || 0) + (s.audio.sfx.newBest || 0)) >= 3,
      `death + game-over sting per death (death ${s.audio.sfx.death}, sting ${s.audio.sfx.gameOver || 0}, new best ${s.audio.sfx.newBest || 0})`);

    // HUD mute button during play: mutes, no jump
    const yBefore = s.player.y;
    await clickGame(480 - 6 - 7, 6 + 5);
    await wait(60);
    s = await state();
    check(s.isMuted === true, 'HUD mute button mutes');
    check(s.player.vy >= 0 && s.player.onGround, `HUD tap did not jump (vy ${s.player.vy}, y ${yBefore}->${s.player.y})`);
    await clickGame(480 - 6 - 7, 6 + 5);
    await wait(60);
    s = await state();
    check(s.isMuted === false, 'HUD mute button unmutes');

    // Pause / resume
    await page.keyboard.press('p');
    await wait(200);
    s = await state();
    check(s.mode === 'paused' && s.audio.musicPaused && !s.audio.musicPlaying, 'pause stops music');
    await page.keyboard.press('p');
    await wait(300);
    s = await state();
    check(s.mode === 'playing' && s.audio.musicPlaying && s.audio.liveSequencers === 1, 'resume continues music');

    // Section layering: section 3, then a live crossing into section 4
    await open('start=section3&autoplay=1');
    s = await until(x => x.audio.section === 3 && x.audio.bpm === AUDIO.VARIANT_BPM.yard[2], 5000);
    check(s.audio.section === 3 && s.audio.layers.includes('arp') && s.audio.bpm === AUDIO.VARIANT_BPM.yard[2], `section 3 layers: ${s.audio.layers} @ ${s.audio.bpm}`);
    await open('x=10200&autoplay=1');
    s = await until(x => x.audio.section === 4 && x.audio.bpm === AUDIO.VARIANT_BPM.yard[3], 10000);
    check(s.audio.section === 4 && s.audio.layers.includes('hats16') && s.audio.bpm === AUDIO.VARIANT_BPM.yard[3], `live crossing into section 4: ${s.audio.layers} @ ${s.audio.bpm}`);
    check(s.audio.liveSequencers === 1, 'still one live sequencer after the crossing');
  }
}

// --- levels: each variant ------------------------------------------------------
if (want('levels')) {
  section('levels (variant per level, sections 1 and 4)');
  for (let n = 1; n <= 6; n++) {
    const v = VARIANT_IDS[n - 1];
    const bpm = AUDIO.VARIANT_BPM[v];
    await open(`level=${n}&autoplay=1&unlock=all`);
    s = await until(x => x.audio.musicPlaying && x.audio.track === 'game', 5000);
    check(s.audio.track === 'game' && s.audio.variant === v && s.audio.song === v && s.audio.bpm === bpm[0] && s.audio.musicPlaying && s.audio.liveSequencers === 1,
      `level ${n}: ${s.audio.song} @ ${s.audio.bpm} (want ${v} @ ${bpm[0]}), ${s.audio.layers}`);

    await open(`level=${n}&start=section4&autoplay=1&unlock=all`);
    s = await until(x => x.audio.section === 4 && x.audio.bpm === bpm[3], 6000);
    check(s.audio.song === v && s.audio.bpm === bpm[3] && s.audio.layers.includes('hats16') && s.audio.layers.includes('arp'),
      `level ${n} section 4: ${s.audio.song} @ ${s.audio.bpm}, ${s.audio.layers}`);
  }
}

// --- flow: in-page level changes ------------------------------------------------
if (want('flow')) {
  section('flow (one live sequencer across level changes)');
  // The bot plays each level started from the menus (no deaths while the check waits)
  await open('unlock=all&autoplay=1&menus=1');
  await page.keyboard.press('Space');
  s = await until(x => x.mode === 'levelselect', 3000);
  check(s.mode === 'levelselect' && s.audio.song === 'menu', `level select: ${s.audio.song}`);
  for (let n = 1; n <= 6; n++) {
    const v = VARIANT_IDS[n - 1];
    s = await until(x => x.mode === 'levelselect' && x.menu?.selected, 3000);
    for (let k = 0; k < 8 && s.menu?.selected !== `level${n}`; k++) {
      await page.keyboard.press('ArrowRight');
      await wait(150);
      s = await state();
    }
    const sel = s.menu?.selected;
    const started = s.audio.sequencersStarted;
    const intros = s.audio.sfx.abilityIntro || 0;
    await page.keyboard.press('Space');
    s = await until(x => x.audio.track === 'game' && x.audio.variant === v && x.audio.musicPlaying, 5000);
    check(s.audio.variant === v && s.audio.song === v && s.audio.liveSequencers === 1 && s.audio.musicPlaying,
      `level ${n} (selected ${sel}): ${s.audio.song}, live sequencers ${s.audio.liveSequencers}`);
    check(s.audio.sequencersStarted === started + 1, `level ${n}: music started once (${started} -> ${s.audio.sequencersStarted})`);
    if (s.mode === 'intro') {
      check(Math.abs(s.audio.duck - AUDIO.INTRO_DUCK) < 1e-6 && (s.audio.sfx.abilityIntro || 0) === intros + 1,
        `level ${n} ability card: music ducked to ${s.audio.duck}, intro fanfare ${s.audio.sfx.abilityIntro || 0}`);
      s = await until(x => x.mode === 'playing', 5000);
      check(s.mode === 'playing' && s.audio.duck === 1 && s.audio.sequencersStarted === started + 1 && s.audio.liveSequencers === 1,
        `level ${n} card gone: duck ${s.audio.duck}, no music restart (${s.audio.sequencersStarted})`);
    } else {
      s = await until(x => x.mode === 'playing', 3000);
      check(s.audio.duck === 1, `level ${n}: no ability card, music not ducked (mode ${s.mode})`);
    }
    // Quit to the level select: pause, then Q
    await page.keyboard.press('p');
    await wait(250);
    await page.keyboard.press('q');
    s = await until(x => x.mode === 'levelselect' && x.audio.track === 'menu' && x.audio.musicPlaying, 5000);
    check(s.mode === 'levelselect' && s.audio.song === 'menu' && s.audio.liveSequencers === 1,
      `back to level select: ${s.audio.song}, live sequencers ${s.audio.liveSequencers}, glide ${s.audio.glide}`);
    await wait(500);
  }
}

// --- sfx: every event --------------------------------------------------------------
const SFX_CASES = [
  // ability
  ['PLAYER_DOUBLE_JUMP', {}, 'doubleJump'],
  ['PLAYER_WALL_CLING', {}, 'wallCling'],
  ['PLAYER_WALL_KICK', {}, 'wallKick'],
  ['PLAYER_POUNCE', { enemy: 'vacuum' }, 'pounce'],
  ['ENEMY_STOMPED', { type: 'vacuum' }, 'stomp'],
  ['PLAYER_DASH', {}, 'dash'],
  ['PLAYER_DASH_END', {}, 'dashEnd'],
  ['BREAKABLE_SMASHED', { type: 'boxes' }, 'smash'],
  ['BREAKABLE_SMASHED', { type: 'gate' }, 'smash'],
  ['STEAM_WINDUP', 'near', 'steamWindup'],
  ['STEAM_ON', 'near', 'steamOn'],
  // UI
  ['MENU_MOVE', { scene: 'test', index: 1 }, 'menuMove'],
  ['MENU_SELECT', { scene: 'test', action: 'play' }, 'menuSelect'],
  ['MENU_SELECT', { scene: 'test', action: 'retry' }, 'retry'],
  ['MENU_BACK', { scene: 'test' }, 'menuBack'],
  ['MENU_LOCKED', { levelId: 'level6' }, 'locked'],
  ['UI_UNLOCK_REVEAL', { levelId: 'level2', where: 'complete' }, 'unlock'],
  ['GAME_OVER_SHOWN', { isNewBestProgress: false }, 'gameOver'],
  ['GAME_OVER_SHOWN', { isNewBestProgress: true }, 'newBest'],
  ['UI_STAR_POP', { index: 0, earned: true }, 'starPop'],
  ['UI_STAR_POP', { index: 2, earned: true }, 'starPop'],
  ['UI_TALLY_TICK', { row: 0, value: 10 }, 'tally'],
  ['UI_TALLY_TICK', { row: 0, value: 100, done: true }, 'tallyDone'],
  ['UI_NEW_BEST', { kind: 'score' }, 'newBest'],
  ['UI_ENDING', {}, 'ending'],
  ['ABILITY_INTRO_SHOWN', { ability: 'double' }, 'abilityIntro'],
  ['TIP_SHOWN', { text: 'test' }, 'tip'],
];

async function playingPage() {
  await open('level=1&autoplay=1');
  s = await until(x => x.mode === 'playing' && x.audio.musicPlaying, 5000);
  return s;
}

if (want('sfx')) {
  section('sfx (every ability and UI event)');
  await playingPage();
  const playerX = async () => (await state()).player?.x ?? 300;
  for (const [ev, payload, name] of SFX_CASES) {
    const p = payload === 'near' ? { x: (await playerX()) + 60 } : payload;
    const before = (await counts())[name] || 0;
    const defined = await fire(ev, p);
    await wait(300);
    const after = (await counts())[name] || 0;
    if (!defined) { console.log(`skip ${ev} (event not defined)`); continue; }
    check(after === before + 1, `${ev} -> ${name} (${before} -> ${after})`);
  }
  // Rate limits and filters
  const rl = async (label, ev, payload, times, name, expect) => {
    const before = (await counts())[name] || 0;
    await fire(ev, payload, times);
    await wait(300);
    const after = (await counts())[name] || 0;
    check(after - before === expect, `${label}: ${times}x ${ev} -> ${after - before} ${name} (want ${expect})`);
  };
  await wait(300);
  await rl('steam rate limit', 'STEAM_ON', { x: (await playerX()) + 60 }, 5, 'steamOn', 1);
  await wait(300);
  await rl('steam far away is silent', 'STEAM_ON', { x: (await playerX()) + 3000 }, 1, 'steamOn', 0);
  await rl('menu move rate limit', 'MENU_MOVE', { scene: 'test', index: 2 }, 5, 'menuMove', 1);
  await rl('tally rate limit', 'UI_TALLY_TICK', { row: 1, value: 5 }, 10, 'tally', 1);
  await rl('auto-retry is quiet', 'MENU_SELECT', { scene: 'GameOverScene', action: 'auto-retry' }, 1, 'menuSelect', 0);
  await rl('cling rate limit', 'PLAYER_WALL_CLING', {}, 4, 'wallCling', 1);
  s = await state();
  check(s.audio.liveSequencers === 1 && s.audio.musicPlaying, 'music still playing after the SFX barrage');
  // The ending flourish ducks the music, then lets it back up
  await wait(300);
  await fire('UI_ENDING', { totalScore: 1, totalStars: 1 });
  await wait(200);
  s = await state();
  const ducked = s.audio.duck;
  await wait(AUDIO.ENDING_DUCK_S * 1000 + 300);
  s = await state();
  check(Math.abs(ducked - AUDIO.ENDING_DUCK) < 1e-6 && s.audio.duck === 1, `ending flourish ducks the music (${ducked}) and releases it (${s.audio.duck})`);
}

// --- glide -------------------------------------------------------------------------
if (want('glide')) {
  section('glide (wind loop)');
  // Flat sandbox room, no bot: nothing else plays on the SFX bus
  await open('level=test&room=flat');
  s = await until(x => x.mode === 'playing' && x.audio.musicPlaying, 5000);
  await meterOn();
  const g0 = (await counts()).glide || 0;
  await fire('PLAYER_GLIDE_START');
  await meterReset();
  await wait(400);
  s = await state();
  const mg = await meterRead();
  check(s.audio.glide === true && (s.audio.sfx.glide || 0) === g0 + 1, `glide start: loop on (count ${s.audio.sfx.glide})`);
  check(mg.sfx.rmsAvg > 0.002, `wind is audible (sfx rms ${mg.sfx.rmsAvg}, ${db(mg.sfx.rmsAvg)} dB; music rms ${mg.music.rmsAvg})`);
  await fire('PLAYER_GLIDE_START');
  await wait(150);
  s = await state();
  check((s.audio.sfx.glide || 0) === g0 + 1, 'a second glide start does not stack a second loop');
  await fire('PLAYER_GLIDE_END');
  await wait(800);
  await meterReset();
  await wait(300);
  s = await state();
  const mEnd = await meterRead();
  check(s.audio.glide === false, 'glide end: loop off');
  check(mEnd.sfx.peak < 0.002, `silent after the fade-out (sfx peak ${mEnd.sfx.peak})`);
  // Re-grab during the fade-out reuses the loop
  await fire('PLAYER_GLIDE_START');
  await wait(200);
  await fire('PLAYER_GLIDE_END');
  await wait(30);
  await fire('PLAYER_GLIDE_START');
  await wait(200);
  s = await state();
  check(s.audio.glide === true, 're-grab during the fade-out keeps the wind on');
  // Pause stops the wind
  await page.keyboard.press('p');
  await wait(300);
  s = await state();
  check(s.mode === 'paused' && s.audio.glide === false, 'pause stops the wind');
  await page.keyboard.press('p');
  await wait(400);
  await fire('PLAYER_GLIDE_END');

  // Real glide: the bot crosses the updraft room by gliding
  await open('level=test&room=updraft&autoplay=1');
  let sawGlide = false;
  for (let t = 0; t < 14000; t += 100) {
    s = await state();
    if (s.audio.glide) sawGlide = true;
    if (s.mode === 'complete' || (sawGlide && !s.audio.glide && s.player && s.player.onGround)) break;
    await wait(100);
  }
  await wait(800);
  s = await state();
  check(sawGlide && (s.audio.sfx.glide || 0) >= 1, `bot glide plays the wind (glide count ${s.audio.sfx.glide || 0}, deaths ${s.deathLog?.length ?? '?'})`);
  check(s.audio.glide === false, 'wind stops after the glide');
}

// --- mute ---------------------------------------------------------------------------
if (want('mute')) {
  section('mute');
  await playingPage();
  await meterOn();
  await page.keyboard.press('m');
  await wait(200);
  await meterReset();
  const c0 = await counts();
  for (const ev of ['PLAYER_DOUBLE_JUMP', 'PLAYER_DASH', 'BREAKABLE_SMASHED', 'ENEMY_STOMPED', 'MENU_SELECT', 'PLAYER_GLIDE_START']) await fire(ev, { type: 'boxes', action: 'play' });
  await wait(800);
  const m = await meterRead();
  s = await state();
  check(s.audio.muted && s.audio.musicPlaying, 'muted while the music keeps its place');
  check(m.master.peak < 0.0005, `master is silent while muted (peak ${m.master.peak})`);
  check(JSON.stringify(s.audio.sfx) === JSON.stringify(c0), 'no SFX voices created while muted');
  await fire('PLAYER_GLIDE_END');
  await page.keyboard.press('m');
  await wait(300);
  await meterReset();
  await wait(800);
  const m2 = await meterRead();
  check(m2.master.peak > 0.01, `unmute restores sound (master peak ${m2.master.peak})`);
}

// --- mix -------------------------------------------------------------------------------
if (want('mix')) {
  // Offline renders (OfflineAudioContext): the numbers don't depend on machine
  // load, unlike live metering in headless Chromium.
  section('mix (offline renders: music per variant, every SFX)');
  await playingPage();
  // Noise percussion makes peaks vary a little per render: keep the worst of 3
  const renderMusic = async (o) => {
    const rs = [];
    for (let i = 0; i < 3; i++) rs.push(await page.evaluate(x => window.__AUDIO__.renderMusicOffline(x), o));
    const r = rs.reduce((a, b) => (b.peak > a.peak ? b : a));
    return { ...r, rms: Math.round((rs.reduce((t, x) => t + x.rms, 0) / rs.length) * 10000) / 10000 };
  };
  const music = {};
  for (const v of VARIANT_IDS) {
    music[v] = { s1: await renderMusic({ variant: v, section: 1 }), s4: await renderMusic({ variant: v, section: 4 }) };
  }
  music.menu = { s1: await renderMusic({ track: 'menu' }) };
  music.complete = { s1: await renderMusic({ track: 'complete' }) };
  const yard = music.yard.s1;
  for (const [v, m] of Object.entries(music)) {
    const fmt = (x) => `peak ${x.peak} (${db(x.peak)} dB) rms ${x.rms} (${db(x.rms)} dB)`;
    console.log(`     ${v.padEnd(10)} s1 ${fmt(m.s1)}${m.s4 ? `   s4 ${fmt(m.s4)}` : ''}`);
    const d = 20 * Math.log10(m.s1.rms / yard.rms);
    check(Math.abs(d) <= 3, `${v}: loudness within 3 dB of the yard (${d >= 0 ? '+' : ''}${d.toFixed(1)} dB)`);
    if (m.s4) check(m.s4.rms >= m.s1.rms * 0.89, `${v}: section 4 is not quieter than section 1 (${db(m.s1.rms)} -> ${db(m.s4.rms)} dB)`);
    // 0.62 at the bus = 0.5 at the master = the limiter threshold (-6 dBFS). Noise
    // percussion (Gaussian-ish after filtering) sometimes lands on a lead + bass
    // downbeat; the worst of 3 renders must still stay under it.
    check(Math.max(m.s1.peak, m.s4?.peak || 0) < 0.62, `${v}: music bus peak stays under the limiter threshold (${Math.max(m.s1.peak, m.s4?.peak || 0)})`);
  }
  const musicPeak = Math.min(...VARIANT_IDS.map(v => music[v].s1.peak));
  console.log(`     reference: quietest variant peak ${musicPeak} (${db(musicPeak)} dB)`);

  // Pause the run so the bot's own jumps/landings can't trip the bridge's debounces
  await page.keyboard.press('p');
  await wait(300);
  const NEAR = 'near';   // steam: placed at Booker's current x when rendered
  const MIX_CASES = [
    ['PLAYER_JUMP', {}], ['PLAYER_LAND', {}], ['BONE_COLLECTED', { bones: 1, x: 1 }],
    ['PLAYER_DOUBLE_JUMP', {}], ['PLAYER_WALL_CLING', {}], ['PLAYER_WALL_KICK', {}],
    ['PLAYER_POUNCE', {}], ['ENEMY_STOMPED', {}], ['PLAYER_DASH', {}], ['PLAYER_DASH_END', {}],
    ['BREAKABLE_SMASHED', { type: 'boxes' }], ['BREAKABLE_SMASHED', { type: 'gate' }],
    ['STEAM_WINDUP', NEAR], ['STEAM_ON', NEAR],
    ['MENU_MOVE', {}], ['MENU_SELECT', { action: 'play' }], ['MENU_SELECT', { action: 'retry' }], ['MENU_BACK', {}], ['MENU_LOCKED', {}],
    ['UI_UNLOCK_REVEAL', {}], ['GAME_OVER_SHOWN', {}], ['UI_NEW_BEST', {}], ['UI_STAR_POP', { index: 2 }],
    ['UI_TALLY_TICK', { row: 2 }], ['UI_TALLY_TICK', { done: true }], ['ABILITY_INTRO_SHOWN', {}], ['TIP_SHOWN', {}],
    ['UI_ENDING', {}],
  ];
  const rows = [];
  for (const [ev, p0] of MIX_CASES) {
    await wait(320);   // clears the bridge's rate limits
    const p = p0 === NEAR ? { x: (await state()).player?.x ?? 300 } : p0;
    const r = await page.evaluate(([n, pl, secs]) => window.__AUDIO__.renderSfxOffline(
      () => window.__EVENT_BUS__.emit(window.__EVENTS__[n], pl), secs), [ev, p, ev === 'UI_ENDING' ? 2.8 : 1.2]);
    rows.push([ev, r]);
  }
  for (const [ev, r] of rows) {
    const rel = 20 * Math.log10(r.peak / musicPeak);
    console.log(`     ${ev.padEnd(20)} ${r.played.join('+').padEnd(16)} peak ${r.peak.toFixed(3)} (${rel >= 0 ? '+' : ''}${rel.toFixed(1)} dB vs music)  rms50ms ${r.rmsMax.toFixed(3)}`);
  }
  const silent = rows.filter(([, r]) => !(r.peak > 0.002));
  check(silent.length === 0, `every SFX renders sound${silent.length ? ': silent ' + silent.map(x => x[0]).join(', ') : ''}`);
  const loud = rows.filter(([, r]) => r.peak > musicPeak * 1.12);   // +1 dB tolerance
  check(loud.length === 0, `every SFX peaks at or under the music peak (+1 dB tolerance)${loud.length ? ': ' + loud.map(x => `${x[0]} ${x[1].peak}`).join(', ') : ''}`);
  const worst = Math.max(...rows.map(([, r]) => r.peak));
  const topMusic = Math.max(...Object.values(music).flatMap(m => [m.s1.peak, m.s4?.peak || 0]));
  const sum = (worst + topMusic) * AUDIO.MASTER_GAIN;
  check(sum < 1, `worst case music peak + loudest SFX peak at the master stays under 0 dBFS (${sum.toFixed(3)}, ${db(sum)} dB)`);
}

console.log('\nerrors:', errors);
check(errors.length === 0, 'no page errors');
closing = true;
await browser.close();
console.log(fail.length ? `\nFAILED ${fail.length}` : '\nALL OK');
process.exit(fail.length ? 1 : 0);
