import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState, MODES } from './core/GameState.js';
import { SaveData } from './core/SaveData.js';
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

const MENU_MODES = new Set([MODES.TITLE, MODES.LEVEL_SELECT, MODES.COMPLETE]);

// --- AI-readable game state snapshot ---
// Coordinates: world pixels, origin top-left, x right, y down. Ground top y = 238.
window.render_game_to_text = () => {
  if (!game || !gameState) return JSON.stringify({ error: 'not_ready' });

  const active = game.scene.getScenes(true).map(s => s.scene.key);
  const run = game.scene.getScene('RunScene');
  const runLive = run && run.player && (run.sys.isActive() || run.sys.isPaused());
  let mode = gameState.mode;
  if (!active.length || active[0] === 'BootScene' || active[0] === 'PreloadScene') mode = MODES.TITLE; // still loading

  const payload = {
    coords: 'world px, origin top-left, x right, y down, ground y=238',
    mode,
    scenes: active,
    levelId: gameState.levelId,
    score: gameState.score,
    bones: gameState.bones,
    bonesTotal: gameState.bonesTotal,
    attempts: gameState.attempts,
    deathLog: gameState.deathLog,
    distance: gameState.distance,
    progress: Math.round(gameState.progress * 1000) / 1000,
    speed: Math.round(gameState.speed),
    section: gameState.section,
    bestScore: gameState.bestScore,
    isMuted: gameState.isMuted,
    audio: audioManager.debugState(),
    det: window.__DET__ ? { frames: window.__DET__.frames } : null,
  };

  if (runLive && [MODES.PLAYING, MODES.DYING, MODES.GAMEOVER, MODES.PAUSED, MODES.COMPLETE, MODES.INTRO].includes(mode)) {
    Object.assign(payload, run.snapshot());
  }
  if (mode === MODES.COMPLETE && gameState.result) {
    payload.result = gameState.result;
    if (!payload.bot && gameState.botStats) payload.bot = gameState.botStats;
  }
  if (mode === MODES.GAMEOVER) payload.lastDeath = gameState.lastDeath;
  if (MENU_MODES.has(mode)) {
    payload.save = SaveData.summary();
    const sel = game.scene.getScene('LevelSelectScene');
    if (active.includes('LevelSelectScene') && sel?.snapshot) payload.menu = sel.snapshot();
    const done = game.scene.getScene('LevelCompleteScene');
    if (active.includes('LevelCompleteScene') && done?.snapshot) payload.menu = done.snapshot();
  }
  // Overlays and the title expose their UI state too (game over card, pause menu, title)
  for (const key of ['TitleScene', 'GameOverScene', 'PauseScene']) {
    const sc = game.scene.getScene(key);
    if (active.includes(key) && sc?.snapshot) payload.menu = sc.snapshot();
  }

  return JSON.stringify(payload);
};

// --- Time-stepping hook ---
// Waits for real time to elapse while the game loop runs normally.
// iterate-client.js injects its own version before page load; keep that one.
// In deterministic mode (?det=1) RunScene replaces it with fixed 1/60 s steps
// (src/core/Deterministic.js).
if (typeof window.advanceTime !== 'function') {
  window.advanceTime = (ms) => new Promise((resolve) => {
    const start = performance.now();
    function step() {
      if (performance.now() - start >= ms) return resolve();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
