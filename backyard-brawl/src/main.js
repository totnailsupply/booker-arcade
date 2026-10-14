import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState, MODES } from './core/GameState.js';
import { SaveData } from './core/SaveData.js';
import { getDebugOptions } from './core/Debug.js';
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
window.__SAVE__ = SaveData;

// --- AI-readable game state snapshot ---------------------------------------
// mode: title | playing | levelup | paused | wave_break | game_over | victory
window.render_game_to_text = () => {
  if (!game) return JSON.stringify({ error: 'not_ready' });
  const active = game.scene.getScenes(true).map(s => s.scene.key);
  const arena = game.scene.getScene('ArenaScene');
  const arenaLive = !!(arena && arena.world && (arena.sys.isActive() || arena.sys.isPaused()));
  let mode = gameState.mode;
  if (!active.length || active.includes('BootScene') || active.includes('PreloadScene')) mode = MODES.TITLE;
  if (arenaLive && active.includes('PauseScene')) mode = MODES.PAUSED;

  const payload = {
    coords: 'arena px: x right 0..768, y down 0..512 (fence: 12 px left/right, 16 px top/bottom); screen 480x270 follows Booker',
    mode,
    scenes: active,
    bestScore: SaveData.bestScore(),
    isMuted: gameState.isMuted,
    debug: getDebugOptions().isDebugRun,
    clock: testClock.on ? 'fixed-step' : 'realtime',
  };
  if (arenaLive) Object.assign(payload, arena.snapshot());
  // Menu screens (Title, WeaponSelect, Kennel, Scores, Pause, Results) report focus + state
  const MENU_SCENES = ['PauseScene', 'ResultsScene', 'WeaponSelectScene', 'KennelScene', 'ScoresScene', 'TitleScene'];
  const menuKey = MENU_SCENES.find(k => active.includes(k));
  if (menuKey) {
    const m = game.scene.getScene(menuKey);
    try { payload.menu = m.textState?.() || { screen: menuKey }; } catch { payload.menu = { screen: menuKey }; }
  }
  const save = SaveData.get();
  payload.save = {
    bones: save.bones,
    unlocked: save.unlocks.weapons,
    endless: save.unlocks.endless,
    kennel: save.kennel,
    runs: save.stats.runs,
  };
  payload.runConfig = gameState.runConfig;
  if ((mode === MODES.GAME_OVER || mode === MODES.VICTORY) && gameState.result) {
    const r = gameState.result;
    payload.result = { ...r, record: undefined };
    payload.score = r.score;
    payload.wave = r.wave;
    payload.level = r.level;
    payload.kills = r.kills;
  }
  payload.listeners = eventBus.counts();
  payload.audio = audioManager.debugState();
  return JSON.stringify(payload);
};

// --- Deterministic test clock (from soba-tower) ---------------------------------
// When a test harness calls window.advanceTime(ms) (iterate-client.js, game-qa
// tests), the real-time loop is put to sleep and the game is stepped in exact
// 1/60 s frames: one scripted "frame" (advanceTime(1000/60)) = one game frame =
// one sim step, so scripted inputs produce the same run every time (with ?seed=).
// Phaser's TweenManager reads Date.now(), so while the test clock is on,
// Date.now() is virtual too and only advances with steps.
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
