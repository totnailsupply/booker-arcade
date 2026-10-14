import '@fontsource/jersey-10/400.css';
import '@fontsource/silkscreen/700.css';
import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { wallet, rng, settings } from './core/Casino.js';
import { clearSave } from './core/Save.js';
import { jump, CASINO_SCENES } from './core/Nav.js';
import { assetReport } from './core/Assets.js';
import { initAudioBridge } from './audio/AudioBridge.js';
import { audioManager } from './audio/AudioManager.js';
import { playSfx } from './audio/sfx.js';
import { Button } from './ui/Button.js';
import { ChipTray } from './ui/ChipTray.js';
import { BetSpot } from './ui/BetSpot.js';
import { WinBanner } from './ui/WinBanner.js';
import { CharacterPortrait } from './ui/CharacterPortrait.js';
import { RulesPanel } from './ui/RulesPanel.js';
import { toast, floatText } from './ui/FloatText.js';

// Audio listens before any scene emits MUSIC_* events
initAudioBridge();

const DEBUG = (() => {
  try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; }
})();

/** Wait for Jersey 10 and Silkscreen so Text measures with the real font (max 3 s). */
async function loadFonts() {
  if (!document.fonts?.load) return;
  const all = Promise.all([
    document.fonts.load('400 24px "Jersey 10"'),
    document.fonts.load('700 24px "Silkscreen"'),
  ]);
  await Promise.race([all, new Promise(r => setTimeout(r, 3000))]).catch(() => {});
}

// --- Deterministic test clock ---------------------------------------------
// When a test harness calls window.advanceTime(ms), the real-time loop is put
// to sleep and the game is stepped in exact 1/60 s frames. Phaser's tweens
// read Date.now(), so while the test clock is on Date.now() is virtual too
// and only advances with steps. Scripts that never call advanceTime (a
// human, real-time checks) keep the normal loop. (From soba-tower.)
const FRAME_MS = 1000 / 60;
const testClock = { on: false, t: 0, frames: 0 };
window.__TEST_CLOCK__ = testClock;
let game = null;

window.advanceTime = (ms) => {
  if (!game || !game.isBooted) {
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

function activeScenes() {
  if (!game) return [];
  return game.scene.getScenes(true).map(s => s.scene.key);
}

// --- AI-readable state snapshot ----------------------------------------------
window.render_game_to_text = () => {
  const scenes = activeScenes();
  const paused = game ? CASINO_SCENES.filter(k => game.scene.isPaused(k)) : [];
  let mode = 'loading';
  let scene = scenes[0] || null;
  if (scenes.includes('Stats')) { mode = 'stats'; scene = 'Stats'; }
  else if (scenes.includes('Lobby')) { mode = 'lobby'; scene = 'Lobby'; }
  else {
    const g = scenes.find(k => ['Plinko', 'Blackjack', 'Craps', 'Roulette', 'Slots', 'Kit'].includes(k));
    if (g) { mode = 'game'; scene = g; }
  }
  const v = wallet.vip();
  const payload = {
    mode,
    scene,
    scenes,
    paused,
    balance: wallet.balance,
    vip: { tier: v.tier, name: v.name, xp: v.xp, next: v.next, progress: Math.round(v.progress * 1000) / 1000 },
    maxBet: wallet.maxBet(),
    inPlay: wallet.inPlay(),
    stats: wallet.summary(),
    daily: wallet.dailyAvailable(),
    bailout: wallet.bailoutAvailable(),
    isMuted: settings.muted,
    clock: testClock.on ? 'fixed-step' : 'realtime',
    frames: testClock.frames,
    rng: rng.info(),
    listeners: eventBus.total(),
    audio: { context: audioManager.ctx ? audioManager.ctx.state : 'none', track: audioManager.wanted?.track ?? null },
    game: null,
  };
  if (mode === 'game') {
    const s = game.scene.getScene(scene);
    try { payload.game = s?.snapshot ? s.snapshot() : null; } catch (err) { payload.game = { error: String(err) }; }
  }
  return JSON.stringify(payload);
};

// --- Test / debug API ------------------------------------------------------------
window.__CASINO__ = {
  wallet,
  rng,
  events: eventBus,
  Events,
  assets: assetReport,
  /** UI kit classes, so browser checks can poke at them in any scene. */
  ui: { Button, ChipTray, BetSpot, WinBanner, CharacterPortrait, RulesPanel, toast, floatText },
  playSfx,
  /** Jump straight to a scene ('Lobby', 'Plinko', ...). Stops the others. */
  goto(key, data) {
    if (!game) return false;
    jump(game, key, data);
    return true;
  },
  debug: {
    enabled: DEBUG,
    /** ?debug=1 only: set the balance exactly (booked as a debug bonus). */
    setBalance(n) {
      if (!DEBUG) return console.warn('__CASINO__.debug needs ?debug=1');
      wallet.setBalance(n);
      return wallet.balance;
    },
    /** ?debug=1 only: add XP (VIP gifts apply). */
    addXp(n) {
      if (!DEBUG) return console.warn('__CASINO__.debug needs ?debug=1');
      wallet.addXpDebug(n);
      return wallet.xp;
    },
    /** ?debug=1 only: wipe the save and start over in the lobby. */
    reset() {
      if (!DEBUG) return console.warn('__CASINO__.debug needs ?debug=1');
      clearSave();
      wallet.reset();
      if (game) jump(game, 'Lobby');
      return true;
    },
  },
};
window.__EVENT_BUS__ = eventBus;
window.__AUDIO__ = audioManager;

loadFonts().then(() => {
  game = new Phaser.Game(GameConfig);
  window.__GAME__ = game;
});
