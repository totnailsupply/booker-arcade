import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState, MODES } from './core/GameState.js';
import { menuSnapshot, installMenuHooks } from './ui/MenuHooks.js';
import { initAudioBridge, audioDebug } from './audio/AudioBridge.js';

const game = new Phaser.Game(GameConfig);
initAudioBridge(game); // Step 3b: listens before any scene emits (scenes start after boot)

// Expose for Playwright testing
window.__GAME__ = game;
window.__GAME_STATE__ = gameState;
window.__EVENT_BUS__ = eventBus;
window.__EVENTS__ = Events;
installMenuHooks(game); // ?test=1 only: window.__TEST_FINISH__(won, stars)

// --- AI-readable game state snapshot ---
// Coordinates: screen px (640x360). Grid tiles are 40 px, columns 0-8 from
// x=112, rows 0-4 from y=84. Enemies walk left (x shrinks) toward the house.
window.render_game_to_text = () => {
  if (!game || !gameState) return JSON.stringify({ error: 'not_ready' });

  const active = game.scene.getScenes(true).map(s => s.scene.key);
  let mode = gameState.mode;
  if (!active.length || active[0] === 'BootScene' || active[0] === 'PreloadScene') mode = MODES.TITLE; // still loading

  const payload = {
    coords: 'screen px 640x360; grid 9x5 tiles of 40 px from (112,84); enemies walk left; house at x<72',
    mode,
    scenes: active,
    score: 0,
    clock: testClock.on ? 'fixed-step' : 'realtime',
    frames: testClock.frames,
    listeners: eventBus.counts(),
  };

  const battle = game.scene.getScene('BattleScene');
  const battleLive = battle && battle.battle && (battle.sys.isActive() || battle.sys.isPaused());
  if (battleLive) {
    Object.assign(payload, battle.snapshot());
  } else if (gameState.result) {
    const r = gameState.result;
    Object.assign(payload, { score: r.score, wave: r.wave, wavesTotal: r.wavesTotal, seed: r.seed, result: r });
  }
  // Menu screens (Step 2b, src/ui/MenuHooks.js): focus, bones, levels, shop ranks
  const menu = menuSnapshot(game);
  if (menu) payload.menu = menu;
  payload.audio = audioDebug(); // { muted, contextState, track, musicPlaying, layers, liveSequencers, ... }
  payload.mode = mode;
  return JSON.stringify(payload);
};

// --- Deterministic test clock ---------------------------------------------
// When a test harness calls window.advanceTime(ms) (iterate-client.js, game-qa
// tests), the real-time loop is put to sleep and the game is stepped in exact
// 1/60 s frames: one scripted "frame" (advanceTime(1000/60)) = one game frame,
// so scripted inputs produce the same run every time. Scripts that never call
// advanceTime (autoplay-check.mjs, a human) keep the normal real-time loop.
// Phaser's TweenManager reads Date.now() (not the frame delta), so while the
// test clock is on, Date.now() is virtual too and only advances with steps.
const FRAME_MS = 1000 / 60;
const testClock = { on: false, t: 0, frames: 0 };
window.__TEST_CLOCK__ = testClock;

window.advanceTime = (ms) => {
  if (!game.isBooted) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (!testClock.on) {
    testClock.on = true;
    game.loop.sleep();
    testClock.t = game.loop.now || performance.now();
    const t0 = testClock.t;
    const dateBase = Date.now();
    Date.now = () => dateBase + (testClock.t - t0);
  }
  const frames = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i < frames; i++) {
    testClock.t += FRAME_MS;
    testClock.frames += 1;
    game.step(testClock.t, FRAME_MS);
  }
  return Promise.resolve();
};
