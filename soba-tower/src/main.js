import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState, MODES } from './core/GameState.js';
import { WORLD } from './core/Constants.js';
import { LEVEL1 } from './levels/level1.js';
import { initAudioBridge } from './audio/AudioBridge.js';
import { audioManager } from './audio/AudioManager.js';

// Audio listens before any scene emits MUSIC_* events
initAudioBridge();

const game = new Phaser.Game(GameConfig);

// Expose for Playwright testing
window.__GAME__ = game;
window.__GAME_STATE__ = gameState;
window.__EVENT_BUS__ = eventBus;
window.__EVENTS__ = Events;
window.__AUDIO__ = audioManager;

// --- AI-readable game state snapshot ---
window.render_game_to_text = () => {
  if (!game || !gameState) return JSON.stringify({ error: 'not_ready' });

  const active = game.scene.getScenes(true).map(s => s.scene.key);
  const climb = game.scene.getScene('ClimbScene');
  const climbLive = climb && climb.soba && (climb.sys.isActive() || climb.sys.isPaused());
  let mode = gameState.mode;
  if (!active.length || active[0] === 'BootScene' || active[0] === 'PreloadScene') mode = MODES.TITLE; // still loading

  const payload = {
    coords: 'world px; x right 0..270 (wraps), y down; street top y=0; height px = -y; 1 m = 16 px',
    mode,
    scenes: active,
    score: gameState.score,
    lives: gameState.lives,
    zone: gameState.zone,
    zoneName: LEVEL1.zones[Math.max(0, gameState.zone - 1)]?.name ?? '',
    checkpointZone: gameState.checkpointZone,
    heightM: Math.round(gameState.heightM * 10) / 10,
    maxHeightM: Math.round(gameState.maxHeightM * 10) / 10,
    progress: Math.round(gameState.progress * 1000) / 1000,
    treats: gameState.treats,
    treatsCollected: gameState.treats,
    treatsTotal: gameState.treatsTotal,
    stomps: gameState.stomps,
    attempts: gameState.attempts,
    runTimeS: Math.round(gameState.runTimeMs / 100) / 10,
    bestHeightM: gameState.bestHeightM,
    bestScore: gameState.bestScore,
    isMuted: gameState.isMuted,
    clock: testClock.on ? 'fixed-step' : 'realtime',
    listeners: eventBus.counts(),
    audio: audioManager.debugState(),
  };

  if (climbLive && mode !== MODES.TITLE) Object.assign(payload, climb.snapshot());
  if ((mode === MODES.COMPLETE || mode === MODES.GAME_OVER) && gameState.result) payload.result = gameState.result;
  payload.pxPerM = WORLD.PX_PER_M;

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
