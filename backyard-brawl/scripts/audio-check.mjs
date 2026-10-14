// Audio check (Step 3B). Runs against the dev server (default http://localhost:3002).
//
//   node scripts/audio-check.mjs [url] [--only songs,menu,mute,run,boss,stress,death,coverage,levels]
//
// songs     song data: bar/token counts, chords, sections, tempos (no browser)
// menu      nothing before the first gesture; menu music after it; weapon select
//           keeps the loop; Kennel buy / denied; Title -> Arena switches to battle;
//           pause / resume; one live sequencer
// mute      M mutes (master meter silent), persists across reload, M unmutes
// run       normal autoplay run: battle layers build, wave horn, level-up duck
//           (-8 dB) + shimmer pad, wave-clear sting
// boss      Big Tom (wave 5): boss track 'cat', roar + duck, charge warning;
//           Robo-Vac (wave 10): track 'vac', phase 2 section + suction drone,
//           boss death boom, drone stops
// stress    wave 9 god autoplay with 4 weapons + synthetic bursts (hundreds of
//           hits / kills / pickups per frame): per-sound voice caps, death group
//           cap, global cap, max concurrent voices, burst cost
// death     hp=4 standing run: heartbeat at low HP, death yelp + game-over sting,
//           calm Results loop, Space replay restarts the battle (1 sequencer)
// coverage  every SFX key played at least once (natural play first, then the
//           mapped EventBus events for the rest; lists both)
// levels    offline renders of every music track / section and every SFX
//           (pre-limiter peak / RMS); WAVs of the music in output/audio/
//
// Exit code 1 on any failure. Browsers launch through scripts/lib/browser.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { validateSongs, SONGS } from '../src/audio/songs.js';
import { SFX_DEFS, SFX_GROUPS, AUDIO } from '../src/audio/audioConfig.js';

const args = process.argv.slice(2);
const url = (args.find(a => a.startsWith('http')) || 'http://localhost:3002').replace(/\/$/, '');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const want = part => !only || only.has(part);
const SAVE_KEY = 'backyard-brawl:save';
const OUT = path.resolve('output/audio');

const fail = [];
let partFails = null;   // failures of the part attempt in progress
const check = (cond, msg) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + msg);
  if (!cond) (partFails || fail).push(msg);
};
const section = name => console.log(`\n== ${name} ==`);
const db = v => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

// --- songs (static) ---------------------------------------------------------------
if (want('songs')) {
  section('songs');
  const problems = validateSongs();
  problems.forEach(p => console.log('   ', p));
  check(problems.length === 0, `song data valid (${problems.length} problems)`);
  check(SONGS.menu.bpm >= 100 && SONGS.menu.bpm <= 120, `menu theme ${SONGS.menu.bpm} BPM (~110)`);
  check(SONGS.battle.arrange.sections.length === 5, 'battle has 5 intensity sections (base, drums, hats, arp, octave)');
  check(Math.min(...SONGS.boss.bpm) > Math.max(...SONGS.battle.bpm), `boss (${SONGS.boss.bpm}) is faster than battle (${SONGS.battle.bpm})`);
}

const browserParts = ['menu', 'mute', 'run', 'boss', 'stress', 'death', 'coverage', 'levels'];
if (!browserParts.some(want)) process.exit(fail.length ? 1 : 0);

const browser = await launchBrowser({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
let closing = false;
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('close', () => { if (!closing) console.log('PAGE CLOSED (unexpected)'); });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const wait = ms => page.waitForTimeout(ms);
const state = async () => {
  for (let i = 0; i < 20; i++) {
    try { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); } catch { await wait(250); }
  }
  throw new Error('render_game_to_text unavailable');
};
const until = async (pred, timeout = 5000, step = 100) => {
  let s = await state();
  for (let t = 0; t < timeout && !pred(s); t += step) {
    await wait(step);
    s = await state();
  }
  return s;
};
/** page.evaluate that survives a Vite full reload (another agent saving files). */
async function evalRetry(fn, arg) {
  for (let i = 0; i < 4; i++) {
    try { return await page.evaluate(fn, arg); } catch (err) {
      if (!/context was destroyed|navigation/i.test(String(err)) || i === 3) throw err;
      await wait(1500);
    }
  }
  return null;
}
const stats = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__AUDIO__.stats)));
const meter = (reset = false) => page.evaluate(r => window.__AUDIO__.readMeter(r), reset);
const enableMeter = () => page.evaluate(() => window.__AUDIO__.enableMeter());
const press = async (key, ms = 250) => { await page.keyboard.press(key); await wait(ms); };
const fire = (name, payload = {}, times = 1) => page.evaluate(([n, p, k]) => {
  for (let i = 0; i < k; i++) window.__EVENT_BUS__.emit(n, { ...p });
}, [name, payload, times]);

// Every SFX played, across all sessions (stats reset on each page load)
const natural = {};
const collect = async () => {
  try {
    const st = await stats();
    for (const [k, v] of Object.entries(st.played)) natural[k] = (natural[k] || 0) + v;
    return st;
  } catch { return null; }
};
const capReport = { peakVoices: {}, peakGlobal: 0, peakGroups: {} };
const collectCaps = (st) => {
  if (!st) return;
  for (const [k, v] of Object.entries(st.peakVoices)) capReport.peakVoices[k] = Math.max(capReport.peakVoices[k] || 0, v);
  for (const [k, v] of Object.entries(st.peakGroups)) capReport.peakGroups[k] = Math.max(capReport.peakGroups[k] || 0, v);
  capReport.peakGlobal = Math.max(capReport.peakGlobal, st.peakGlobal);
};

// Vite full-reloads the page when another agent saves a file; a part that
// failed while that happened is run once more.
let navs = 0;
let expectedNavs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs += 1; });

async function part(name, fn) {
  if (!want(name)) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    partFails = [];
    const n0 = navs - expectedNavs;
    try {
      await fn();
    } catch (err) {
      console.log('FAIL exception:', String(err).split('\n')[0]);
      partFails.push(String(err));
    }
    const reloaded = navs - expectedNavs > n0;
    const failed = partFails;
    partFails = null;
    if (failed.length && reloaded && attempt === 1) {
      console.log(`     (page reloaded by Vite during '${name}': retrying the part)`);
      continue;
    }
    fail.push(...failed);
    return;
  }
}

/** Load a page (optionally seeding localStorage first). No gesture. */
async function open(query = '', seed = undefined) {
  await collect().then(collectCaps);
  expectedNavs += 1;
  await page.goto(`${url}/${query ? `?${query}` : ''}`);
  if (seed !== undefined) {
    expectedNavs += 1;
    await page.evaluate(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }, [SAVE_KEY, seed]);
    await page.reload();
  }
  await wait(1200);
}
/** A gesture that does nothing in the game (F2 isn't bound). */
const gesture = () => press('F2', 300);

try {
  // --- menu --------------------------------------------------------------------------
  await part('menu', async () => {
    section('menu');
    await open('', { version: 1, bones: 50, muted: false });
    let s = await state();
    check(s.audio.contextState === 'none' && !s.audio.musicPlaying, `no audio before the first gesture (context ${s.audio.contextState})`);
    check(s.audio.track === 'menu', `title asked for the menu theme (${s.audio.track})`);
    await press('ArrowRight', 200);
    s = await until(x => x.audio.musicPlaying, 3000);
    check(s.audio.contextState === 'running' && s.audio.musicPlaying && s.audio.song === 'menu', `menu music starts after the gesture (${s.audio.contextState}, ${s.audio.song} @${s.audio.bpm})`);
    check((s.audio.sfx.menuMove || 0) >= 1, 'menu move tick');
    const seq0 = s.audio.sequencersStarted;
    // Kennel: buy, buy, denied (50 bones: 10 + 20, then 35 > 20)
    await press('Enter', 400);
    s = await state();
    check(s.menu?.screen === 'kennel', `Title -> Kennel (${s.menu?.screen})`);
    await press('Enter', 300);
    await press('Enter', 300);
    await press('Enter', 300);
    s = await state();
    check((s.audio.sfx.buy || 0) === 2 && (s.audio.sfx.denied || 0) === 1, `Kennel: 2 buys + 1 denied (buy ${s.audio.sfx.buy}, denied ${s.audio.sfx.denied})`);
    await press('Escape', 400);
    s = await state();
    check(s.menu?.screen === 'title' && (s.audio.sfx.menuBack || 0) >= 1, 'Esc back to title (menu back)');
    check(s.audio.sequencersStarted === seq0 && s.audio.musicPlaying, `menu loop kept across Kennel / Title (${s.audio.sequencersStarted} started)`);
    await press('ArrowLeft', 200);
    await press('Enter', 400);
    s = await state();
    check(s.menu?.screen === 'weaponSelect' && s.audio.song === 'menu' && s.audio.sequencersStarted === seq0, 'weapon select keeps the menu loop');
    await press('Enter', 500);
    s = await until(x => x.audio.song === 'battle', 3000);
    check(s.audio.track === 'battle' && s.audio.musicPlaying && s.audio.liveSequencers === 1, `Arena: battle music, 1 live sequencer (${s.audio.song} @${s.audio.bpm}, live ${s.audio.liveSequencers})`);
    check((s.audio.sfx.menuStart || 0) >= 1, 'start-run chime + woof');
    await wait(2500);
    await enableMeter();
    await press('Escape', 500);
    s = await state();
    check(s.audio.musicPaused && !s.audio.musicPlaying, 'pause: music paused');
    await meter(true);
    await wait(600);
    const mp = await meter(true);
    check(mp.music.peak < 0.002, `pause: music bus silent (${db(mp.music.peak)} dB)`);
    await press('p', 500);
    s = await state();
    check(!s.audio.musicPaused && s.audio.musicPlaying && s.audio.liveSequencers === 1, 'resume: music back, 1 live sequencer');
    await wait(600);
    const mr = await meter(true);
    check(mr.music.rmsMax > 0.005, `resume: music audible (${db(mr.music.rmsMax)} dB rms)`);
  });

  // --- mute --------------------------------------------------------------------------
  await part('mute', async () => {
    section('mute');
    await open('', { version: 1, bones: 0, muted: false });
    await gesture();
    await until(x => x.audio.musicPlaying, 3000);
    await enableMeter();
    await press('m', 300);
    let s = await state();
    check(s.isMuted && s.audio.muted, 'M mutes');
    await meter(true);
    await page.evaluate(() => window.__AUDIO__.debug.playSfx('menuSelect'));
    await wait(800);
    let m = await meter(true);
    check(m.master.peak < 1e-4, `muted: master silent with music + a menu SFX (${db(m.master.peak)} dB)`);
    let saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}').muted, SAVE_KEY);
    check(saved === true, 'mute saved');
    expectedNavs += 1;
    await page.reload();
    await wait(1200);
    s = await state();
    check(s.isMuted && s.audio.muted, 'mute restored after reload');
    await gesture();
    await until(x => x.audio.contextState === 'running', 3000);
    await enableMeter();
    await meter(true);
    await wait(700);
    m = await meter(true);
    check(m.master.peak < 1e-4, `still silent after reload (${db(m.master.peak)} dB)`);
    await press('m', 300);
    await wait(700);
    m = await meter(true);
    s = await state();
    saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}').muted, SAVE_KEY);
    check(!s.audio.muted && m.master.peak > 0.01 && saved === false, `M unmutes (master ${db(m.master.peak)} dB, saved ${saved})`);
  });

  // --- run ---------------------------------------------------------------------------
  await part('run', async () => {
    section('run (autoplay, wave 1-2, real time)');
    await open('autoplay=1&seed=1');
    await gesture();
    await enableMeter();
    const seen = { sections: new Set(), levelupDuck: null, levelupShimmer: false, afterDuck: null, mode: new Set() };
    let lastMode = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 32000) {
      const s = await state();
      seen.mode.add(s.mode);
      if (s.audio.song === 'battle') seen.sections.add(s.audio.section);
      if (s.mode === 'levelup') {
        if (seen.levelupDuck === null || s.audio.duckDb < seen.levelupDuck) seen.levelupDuck = s.audio.duckDb;
        if (s.audio.shimmer) seen.levelupShimmer = true;
      }
      if (lastMode === 'levelup' && s.mode !== 'levelup') seen.leftAt = Date.now();
      if (seen.leftAt && Date.now() - seen.leftAt > 900 && seen.afterDuck === null) seen.afterDuck = s.audio.duckDb;
      lastMode = s.mode;
      if (s.wave >= 2 && (s.audio.sfx.waveClear || 0) >= 1 && seen.afterDuck !== null) break;
      await wait(40);
    }
    const s = await state();
    const sfx = s.audio.sfx;
    check(s.audio.song === 'battle' && s.audio.liveSequencers === 1, `battle music (live ${s.audio.liveSequencers})`);
    check(seen.sections.size >= 2 && Math.max(...seen.sections) >= 2, `battle layers built with the crowd (sections ${[...seen.sections].join(',')})`);
    check((sfx.waveHorn || 0) >= 1, `wave start horn (${sfx.waveHorn})`);
    check((sfx.shotBark || 0) > 5 && (sfx.hit || 0) > 5 && (sfx.deathCat || 0) > 0 && (sfx.kibble || 0) > 0, `combat: bark ${sfx.shotBark}, hit ${sfx.hit}, cat death ${sfx.deathCat}, kibble ${sfx.kibble}`);
    check((sfx.levelUp || 0) >= 1 && (sfx.cardSelect || 0) >= 1, `level-up arpeggio ${sfx.levelUp}, card select ${sfx.cardSelect}`);
    check(seen.levelupDuck !== null && seen.levelupDuck <= -6 && seen.levelupShimmer, `level-up ducks the music (${seen.levelupDuck} dB, target ${AUDIO.DUCK.levelUp}) + shimmer pad (${seen.levelupShimmer})`);
    check(seen.afterDuck !== null && seen.afterDuck > -1, `duck released after the overlay (${seen.afterDuck} dB)`);
    check((sfx.waveClear || 0) >= 1, `wave-clear sting (${sfx.waveClear}), wave now ${s.wave}`);
  });

  // --- boss ----------------------------------------------------------------------------
  await part('boss', async () => {
    section('boss: Big Tom (wave 5)');
    await open('wave=5&god=1&autoplay=1&seed=3');
    await gesture();
    let s = await until(x => (x.audio.sfx.chargeWarn || 0) >= 1, 12000, 150);
    check(s.audio.song === 'boss' && s.audio.variant === 'cat' && s.audio.bpm > 150, `boss track (variant ${s.audio.variant}, ${s.audio.bpm} BPM, layers ${s.audio.layers.length})`);
    // (?wave=5 starts the wave before the first gesture, so its horn is silent by design)
    check((s.audio.sfx.bossIntroCat || 0) >= 1, `Big Tom roar on arrival (${s.audio.sfx.bossIntroCat})`);
    check((s.audio.sfx.chargeWarn || 0) >= 1, `charge warning on the wind-up (${s.audio.sfx.chargeWarn})`);

    section('boss: Robo-Vac (wave 10)');
    await open('wave=10&god=1&autoplay=1&seed=3&weapons=bark,ball,bone,frisbee');
    await gesture();
    s = await until(x => (x.audio.sfx.bossIntroVac || 0) >= 1, 6000);
    check(s.audio.song === 'boss' && s.audio.variant === 'vac' && s.audio.layers.includes('clank'), `boss track variant vac (${s.audio.layers.join(',')})`);
    check(s.audio.duckTarget <= -6, `music ducked under the vacuum whine (${s.audio.duckTarget} dB)`);
    // Force phase 2 (QA shortcut: drop the boss under 50 % HP)
    await page.evaluate(() => {
      const b = window.__GAME__.scene.getScene('ArenaScene').world.bosses[0];
      b.hp = Math.min(b.hp, b.maxHp * 0.49);
    });
    s = await until(x => x.audio.loops.includes('vacDrone') && x.audio.section === 2, 6000);
    check((s.audio.sfx.vacPhase2 || 0) >= 1, 'phase 2 alarm');
    check(s.audio.loops.includes('vacDrone'), `suction drone loop running (${s.audio.loops})`);
    check(s.audio.section === 2 && s.audio.layers.includes('hats16'), `boss music phase 2 section (${s.audio.section}, ${s.audio.bpm} BPM)`);
    await page.keyboard.press('Escape');
    await wait(400);
    s = await state();
    check(!s.audio.loops.includes('vacDrone') && s.audio.musicPaused, 'pause stops the drone and the music');
    await press('p', 500);
    s = await until(x => x.audio.loops.includes('vacDrone'), 3000);
    check(s.audio.loops.includes('vacDrone'), 'drone back after resume');
    await page.evaluate(() => {
      const b = window.__GAME__.scene.getScene('ArenaScene').world.bosses[0];
      b.hp = 1;
    });
    s = await until(x => (x.audio.sfx.bossDeath || 0) >= 1, 8000);
    check((s.audio.sfx.bossDeath || 0) >= 1, 'boss death boom');
    await wait(400);
    s = await state();
    check(!s.audio.loops.includes('vacDrone'), 'drone stops when the boss dies');
    s = await until(x => (x.audio.sfx.victory || 0) >= 1, 6000);
    check((s.audio.sfx.victory || 0) >= 1 && !s.audio.musicPlaying, `victory fanfare, battle loop stopped (${s.mode})`);
    s = await until(x => x.audio.song === 'results', 10000);
    check(s.audio.song === 'results' && s.audio.liveSequencers === 1, `Results: calm loop after the fanfare (${s.audio.song} @${s.audio.bpm})`);
  });

  // --- stress --------------------------------------------------------------------------
  await part('stress', async () => {
    section('stress: wave 9, god, 4 weapons + synthetic bursts');
    await open('wave=9&god=1&autoplay=1&seed=2&weapons=bark,ball,bone,frisbee');
    await gesture();
    await page.evaluate(() => window.__AUDIO__.resetStats());
    await wait(10000);
    let st = await stats();
    const hitsPerSec = ((st.played.hit || 0) + Object.values(st.skipped.hit || {}).reduce((a, b) => a + b, 0)) / 10;
    console.log(`     natural: ${hitsPerSec.toFixed(0)} hit events/s, peak voices ${st.peakGlobal}, played ${Object.values(st.played).reduce((a, b) => a + b, 0)}`);
    collectCaps(st);
    // Synthetic bursts: 60 frames of 300 hits, 40 kills (all types), 30 pops, 60 kibble
    const cost = await page.evaluate(async () => {
      const bus = window.__EVENT_BUS__;
      const types = ['cat', 'squirrel', 'crow', 'raccoon', 'skunk', 'kitten'];
      const times = [];
      for (let f = 0; f < 60; f++) {
        const t0 = performance.now();
        for (let i = 0; i < 300; i++) bus.emit('sim:hit', { type: types[i % 6], x: 300 + i, y: 200, dmg: 3, crit: i % 9 === 0 });
        for (let i = 0; i < 40; i++) bus.emit('sim:kill', { type: types[i % 6], x: 300, y: 200, points: 10, elite: i % 10 === 0 });
        for (let i = 0; i < 30; i++) bus.emit('sim:pop', { id: i, enemy: 'cat', x: 300, y: 200 });
        for (let i = 0; i < 60; i++) bus.emit('sim:pickup', { kind: 'kibble', size: 'S', x: 300, y: 200 });
        times.push(performance.now() - t0);
        await new Promise(r => setTimeout(r, 16));
      }
      times.sort((a, b) => a - b);
      return { median: times[30], max: times[59] };
    });
    await wait(500);
    st = await stats();
    collectCaps(st);
    console.log(`     burst cost per frame (430 events): median ${cost.median.toFixed(2)} ms, max ${cost.max.toFixed(2)} ms`);
    let capsOk = true;
    for (const [k, v] of Object.entries(st.peakVoices)) {
      const max = SFX_DEFS[k]?.max ?? 4;
      if (v > max) { capsOk = false; console.log(`     ${k}: ${v} > ${max}`); }
    }
    check(capsOk, `per-sound caps hold (hit ${st.peakVoices.hit}/${SFX_DEFS.hit.max}, kibble ${st.peakVoices.kibble}/${SFX_DEFS.kibble.max}, deathCat ${st.peakVoices.deathCat}/${SFX_DEFS.deathCat.max})`);
    check((st.peakGroups.death || 0) <= SFX_GROUPS.death.max, `death pops group cap (${st.peakGroups.death}/${SFX_GROUPS.death.max})`);
    check(st.peakGlobal <= AUDIO.GLOBAL_HARD_CAP, `max concurrent SFX voices ${st.peakGlobal} (hard cap ${AUDIO.GLOBAL_HARD_CAP})`);
    const sk = st.skipped.hit || {};
    check((sk.gap || 0) + (sk.cap || 0) > 1000, `hit throttling active (skipped gap ${sk.gap}, cap ${sk.cap}, global ${sk.global})`);
    check(cost.max < 12, `bursts stay cheap (max ${cost.max.toFixed(1)} ms per 430-event frame)`);
    const s = await state();
    check(s.audio.liveSequencers === 1, 'one live sequencer');
  });

  // --- death ----------------------------------------------------------------------------
  await part('death', async () => {
    section('death: heartbeat, game over, Results, replay');
    await open('hp=4&seed=3');
    await press('Enter', 400);
    await press('Enter', 600);
    let s = await until(x => x.mode === 'game_over' || x.mode === 'victory', 60000, 200);
    check((s.audio.sfx.hurt || 0) >= 1, `hurt yelp (${s.audio.sfx.hurt})`);
    check((s.audio.sfx.heartbeat || 0) >= 1, `low-HP heartbeat (${s.audio.sfx.heartbeat})`);
    check((s.audio.sfx.playerDeath || 0) >= 1 && (s.audio.sfx.gameOver || 0) >= 1, 'death yelp + game-over sting');
    s = await until(x => x.audio.song === 'results', 6000);
    check(s.audio.song === 'results' && s.audio.liveSequencers === 1, `calm Results loop (${s.audio.song} @${s.audio.bpm})`);
    const before = s.audio.sequencersStarted;
    await press('Space', 600);
    s = await until(x => x.audio.song === 'battle', 3000);
    check(s.audio.song === 'battle' && s.audio.liveSequencers === 1 && s.audio.sequencersStarted === before + 1, `Space replay: battle restarts, 1 live sequencer (${s.audio.sequencersStarted})`);
    check((s.audio.sfx.retry || 0) >= 1, 'retry blip');
  });

  // --- coverage --------------------------------------------------------------------------
  await part('coverage', async () => {
    section('coverage');
    // A level-up by hand: card move, reroll, select through the real overlay
    await open('seed=7&god=1');
    await press('Enter', 400);
    await press('Enter', 800);
    await page.evaluate(() => { const w = window.__GAME__.scene.getScene('ArenaScene').world; w.xp = w.xpNext + 1; });
    let s = await until(x => x.mode === 'levelup' && x.scenes.includes('LevelUpScene'), 4000);
    await wait(900);   // past the overlay's input guard
    await press('ArrowRight', 200);
    await press('ArrowRight', 200);
    await press('r', 400);
    await press('Enter', 400);
    s = await state();
    check((s.audio.sfx.cardMove || 0) >= 2 && (s.audio.sfx.cardReroll || 0) >= 1 && (s.audio.sfx.cardSelect || 0) >= 1,
      `level-up overlay by hand: card move ${s.audio.sfx.cardMove}, reroll ${s.audio.sfx.cardReroll}, select ${s.audio.sfx.cardSelect}`);
    await open('autoplay=1&seed=5&god=1&weapons=squeak,zoomies,frisbee,bone');
    await gesture();
    await wait(3000);
    // Low HP (god mode keeps Booker alive): the heartbeat should start
    await page.evaluate(() => { const p = window.__GAME__.scene.getScene('ArenaScene').world.player; p.hp = p.maxHp * 0.2; });
    await wait(3000);
    await collect();
    const all = await page.evaluate(() => window.__AUDIO__.debug.names);
    const missing = all.filter(n => !natural[n]);
    console.log(`     natural play reached ${all.length - missing.length}/${all.length}; not reached: ${missing.join(', ') || 'none'}`);
    // Fire the mapped events for the rest
    await page.evaluate(() => window.__AUDIO__.resetStats());
    const E = {
      shotBark: ['sim:shot', { weapon: 'bark', x: 0 }], shotBall: ['sim:shot', { weapon: 'ball', x: 0 }], shotBone: ['sim:shot', { weapon: 'bone', x: 0 }],
      shotSqueak: ['sim:shot', { weapon: 'squeak', x: 0 }], ballBounce: ['sim:bounce', { x: 0 }],
      hit: ['sim:hit', { enemy: 'cat', x: 0, dmg: 1 }], hitCrit: ['sim:hit', { enemy: 'cat', x: 0, dmg: 2, crit: true }], hitBoss: ['sim:hit', { enemy: 'boss-vac', x: 0, dmg: 2 }],
      deathCat: ['sim:kill', { enemy: 'cat', points: 1 }], deathSquirrel: ['sim:kill', { enemy: 'squirrel', points: 1 }], deathCrow: ['sim:kill', { enemy: 'crow', points: 1 }],
      deathRaccoon: ['sim:kill', { enemy: 'raccoon', points: 1 }], deathSkunk: ['sim:kill', { enemy: 'skunk', points: 1 }], deathKitten: ['sim:kill', { enemy: 'kitten', points: 1 }],
      deathElite: ['sim:kill', { enemy: 'raccoon', points: 1, elite: true }], pop: ['sim:pop', { id: 1, enemy: 'cat' }],
      crowSwoop: ['sim:swoop', {}], stinkLob: ['sim:enemyShot', { kind: 'stink' }],
      bossIntroCat: ['sim:bossSpawn', { enemy: 'boss-cat', name: 'BIG TOM', hp: 600 }], bossIntroVac: ['sim:bossSpawn', { enemy: 'boss-vac', name: 'ROBO-VAC 9000', hp: 1800 }],
      chargeWarn: ['sim:bossWindup', {}], chargeGo: ['sim:bossCharge', {}], summon: ['sim:bossSummon', {}], vacPhase2: ['sim:bossPhase2', {}],
      dustRing: ['sim:bossRing', {}], vacBounce: ['sim:bossBounce', {}], bossDeath: ['sim:bossDeath', { enemy: 'boss-cat', name: 'BIG TOM' }],
      kibble: ['sim:pickup', { kind: 'kibble' }], heart: ['sim:pickup', { kind: 'heart' }], magnet: ['sim:pickup', { kind: 'magnet' }], goldenBone: ['sim:pickup', { kind: 'goldenBone' }],
      hurt: ['sim:playerHurt', {}], dash: ['sim:dash', {}], waveHorn: ['sim:waveStart', { wave: 2, boss: false }], bossHorn: ['sim:waveStart', { wave: 5, boss: true, bossType: 'boss-cat' }],
      levelUp: ['sim:levelUpOpen', {}], waveClear: ['sim:waveEnd', { wave: 3 }], victory: ['sim:victory', {}], playerDeath: ['sim:playerDeath', {}], gameOver: ['sim:playerDeath', {}],
      cardRare: ['sim:card', { rare: true }], cardSelect: ['menu:select', { action: 'card' }], cardReroll: ['menu:select', { action: 'reroll' }],
      menuMove: ['menu:move', {}], menuSelect: ['menu:select', { action: 'scores' }], menuStart: ['menu:select', { action: 'play' }], menuBack: ['menu:back', {}],
      buy: ['menu:select', { action: 'buy' }], denied: ['menu:select', { action: 'denied' }], unlock: ['menu:select', { action: 'unlock' }], retry: ['menu:select', { action: 'retry' }],
      newBest: ['game:overShown', { isNewBest: true }], click: ['audio:toggleMute', {}, 2], frisbeeWhirr: null, zoomiesPatter: null, heartbeat: null, cardMove: null,
    };
    const unmapped = [];
    for (const name of missing) {
      const e = E[name];
      if (!e) { unmapped.push(name); continue; }
      await fire(e[0], e[1], e[2] || 1);
      await wait(name === 'gameOver' ? 700 : 120);
    }
    await wait(400);
    const st = await stats();
    const still = missing.filter(n => !st.played[n]);
    check(still.length === 0, `every SFX key plays (${all.length}); via events: ${missing.filter(n => st.played[n]).join(', ') || 'none'}${still.length ? `; NEVER: ${still.join(', ')}` : ''}${unmapped.length ? `; polled-only: ${unmapped.join(', ')}` : ''}`);
  });

  // --- levels (offline) ------------------------------------------------------------------
  await part('levels', async () => {
    section('levels (offline render, pre-limiter)');
    await open('');
    fs.mkdirSync(OUT, { recursive: true });
    const jobs = [
      ['menu', 1, null], ['battle', 1, null], ['battle', 3, null], ['battle', 5, null],
      ['boss', 1, 'cat'], ['boss', 2, 'vac'], ['results', 1, null],
    ];
    const music = {};
    for (const [track, sec, variant] of jobs) {
      const r = await evalRetry(async ([t, s, v]) => {
        const m = await import('/src/audio/offline.js');
        return m.renderMusic({ track: t, section: s, variant: v, seconds: 12, wav: true });
      }, [track, sec, variant]);
      const name = `${track}-s${sec}${variant ? `-${variant}` : ''}`;
      fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.from(r.wav, 'base64'));
      music[name] = r;
      console.log(`     ${name.padEnd(14)} ${String(r.bpm).padStart(3)} BPM  peak ${r.peakDb} dB  rms ${r.rmsDb} dB  loud rms ${r.loudRmsDb} dB  over limiter ${r.overLimiterPct}%`);
    }
    const sfx = await evalRetry(async () => {
      const m = await import('/src/audio/offline.js');
      const out = {};
      for (const n of m.SFX_NAMES) out[n] = await m.renderSfx(n, { k: 1, n: 2, step: 3, side: 1 }, n === 'victory' ? 3 : 1.8);
      return out;
    });
    const rows = Object.entries(sfx).sort((a, b) => b[1].peakDb - a[1].peakDb);
    console.log(`     SFX peaks (dB): ${rows.map(([n, r]) => `${n} ${r.peakDb}`).join(', ')}`);
    const mVals = Object.values(music);
    check(mVals.every(r => r.peakDb <= -1), `music never clips (max peak ${Math.max(...mVals.map(r => r.peakDb))} dB pre-limiter)`);
    check(mVals.every(r => r.overLimiterPct < 3), `music rarely touches the limiter (max ${Math.max(...mVals.map(r => r.overLimiterPct))}%)`);
    const battleTop = music['battle-s5'].loudRmsDb;
    check(battleTop >= -26 && battleTop <= -16, `battle (full) loud RMS ${battleTop} dB in [-26, -16]`);
    check(rows.every(([, r]) => r.peakDb <= -0.5), `no single SFX clips (max ${rows[0][0]} ${rows[0][1].peakDb} dB)`);
    const common = ['hit', 'deathCat', 'deathSquirrel', 'shotBark', 'kibble', 'hurt', 'shotBall'].map(n => sfx[n].peakDb).sort((x, y) => x - y);
    const median = common[Math.floor(common.length / 2)];
    console.log(`     common SFX median peak ${median} dB; battle music loud RMS ${battleTop} dB (music sits ${(battleTop - median).toFixed(1)} dB under)`);
    check(median - battleTop >= 6, `common SFX peaks stand >= 6 dB over the music bed (${(median - battleTop).toFixed(1)} dB)`);
    const big = ['bossDeath', 'bossIntroCat', 'victory', 'playerDeath'].map(n => sfx[n].peakDb);
    check(Math.max(...big) <= -3, `big moments peak under -3 dB (${big.join(', ')})`);
    console.log(`     WAVs: ${OUT}`);
  });

  // --- caps over every session --------------------------------------------------------
  await collect().then(collectCaps);
  section('voices');
  console.log(`     max concurrent SFX voices over all sessions: ${capReport.peakGlobal}; death group ${capReport.peakGroups.death || 0}`);
  console.log(`     per sound: ${Object.entries(capReport.peakVoices).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} catch (err) {
  console.log('FAIL exception:', err.stack || err);
  fail.push(String(err));
} finally {
  const errs = errors.filter(e => !/GL Driver|GPU stall/.test(e));
  check(errs.length === 0, `no page / console errors (${errs.length})`);
  errs.slice(0, 10).forEach(e => console.log('    ', e));
  closing = true;
  await browser.close();
}

console.log(`\n${fail.length ? `FAILED ${fail.length}` : 'ALL OK'}`);
process.exit(fail.length ? 1 : 0);
