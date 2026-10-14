// =============================================================================
// AudioBridge — wires EventBus events (and the scene that is showing) to music
// and SFX. Game code never calls audio directly. Global: initialized once in
// main.js with the Phaser game, before any scene runs; no per-scene listeners,
// so scene restarts can't leak or stack anything.
//
// Music (one sequencer at a time, AudioManager.playMusic replaces the old one):
//   menu screens (Title / Level Select / Shop)  'menu' (kept across menu screens)
//   GAME_START (every battle start and retry)   'battle', band from the start wave
//   sim:wave_start                              band 1-3 for the wave (waves 1-3 / 4-7 / 8-10
//                                               on a 10-wave level), tension on flag waves
//   LEVEL_COMPLETE / GAME_OVER                  battle music fades (AUDIO.END_FADE_S)
//   ResultsScene                                'results' with a win fanfare (+ happy barks)
//                                               or a lose sting, then a calm loop
//   GAME_PAUSE / GAME_RESUME                    music fades out / back in + blips
// The showing scene is read on Phaser's 'poststep' (it also runs under the
// advanceTime test clock), which also drives the bite crunch loop and the
// card-ready ticks from the live Battle.
//
// SFX: see the table in progress.md "Step 3b notes" and VOICES in sfx.js.
// Mute: M anywhere, the speaker buttons (AUDIO_TOGGLE_MUTE), persisted in
// SaveData and mirrored in gameState.isMuted.
// =============================================================================

import { AUDIO } from './AudioConstants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { SaveData } from '../core/SaveData.js';
import { audioManager } from './AudioManager.js';
import { playSfx, panOfX } from './sfx.js';
import { tileCenterX } from '../sim/Grid.js';

let initialized = false;
let game = null;

const MENU_SCENES = ['TitleScene', 'LevelSelectScene', 'ShopScene'];
const KILL_VOICE = { rat: 'killRat', lidrat: 'killLid', crow: 'killCrow' };

// --- per-battle state ------------------------------------------------------------

const run = {
  battle: null,          // the Battle the bite / card-ready polls read
  total: 10,
  lastBiteT: -Infinity,  // sim time of the last crunch
  cardsReady: null,      // key -> ready last frame
  coinStreak: 0,
  lastCoinAt: -Infinity,
};

let screen = null;       // 'menu' | 'battle' | 'results' (what the music follows)
let pressClaimed = false;

function resetRun(battle) {
  run.battle = battle || null;
  run.total = battle?.waves?.total || 10;
  run.lastBiteT = -Infinity;
  run.cardsReady = null;
  run.coinStreak = 0;
  run.lastCoinAt = -Infinity;
}

/** Wave band 1-3 for wave n of total. */
export function bandOf(wave, total) {
  const n = Math.max(1, wave || 1);
  const t = Math.max(1, total || 10);
  if (n <= Math.ceil(t * AUDIO.BAND_1)) return 1;
  if (n <= Math.ceil(t * AUDIO.BAND_2)) return 2;
  return 3;
}

// --- scene following (poststep) ---------------------------------------------------

function sceneOn(key) {
  try {
    return game.scene.isActive(key) || game.scene.isPaused(key);
  } catch {
    return false;
  }
}

function currentScreen() {
  if (sceneOn('ResultsScene')) return 'results';
  if (sceneOn('BattleScene')) return 'battle';
  if (MENU_SCENES.some(sceneOn)) return 'menu';
  return null;
}

function onScreen(next) {
  if (next === screen) return;
  screen = next;
  if (next === 'menu') {
    if (audioManager.track !== 'menu') audioManager.playMusic('menu', { fadeS: AUDIO.MENU_FADE_S });
  } else if (next === 'results') {
    const win = !!gameState.result?.won;
    run.battle = null;
    audioManager.playMusic('results', {
      intro: win ? 'win' : 'lose',
      delay: win ? AUDIO.RESULTS_WIN_DELAY_S : AUDIO.RESULTS_LOSE_DELAY_S,
    });
    if (win) playSfx('happyBarks', { delay: AUDIO.HAPPY_BARKS_DELAY_S });
  }
  // 'battle' music starts from GAME_START (so a retry from Pause restarts it too)
}

/** While anything bites: one crunch every BITE_GAP_S of sim time, a little louder with more biters. */
function pollBites(b) {
  if (b.outcome) return;
  let biters = 0;
  let x = 0;
  for (const e of b.enemies) {
    if (e.alive && e.state === 'bite' && !(e.stunLeft > 0)) {
      biters += 1;
      x += e.x;
    }
  }
  if (!biters || b.time - run.lastBiteT < AUDIO.BITE_GAP_S) return;
  run.lastBiteT = b.time;
  const gain = Math.min(AUDIO.BITE_MAX_GAIN, 1 + (biters - 1) * AUDIO.BITE_GAIN_PER);
  playSfx('bite', { gain, pan: panOfX(x / biters) });
}

/** A card whose recharge just finished ticks once. */
function pollCards(b) {
  const now = {};
  for (const c of b.cards) now[c.key] = c.rechargeLeft <= 0;
  if (run.cardsReady && !b.outcome) {
    for (const [k, ready] of Object.entries(now)) {
      if (ready && run.cardsReady[k] === false) playSfx('cardReady');
    }
  }
  run.cardsReady = now;
}

let pollWarned = false;
function onPostStep() {
  try {
    onScreen(currentScreen());
    const b = run.battle;
    if (screen === 'battle' && b && sceneOn('BattleScene') && game.scene.isActive('BattleScene')) {
      pollBites(b);
      pollCards(b);
    }
  } catch (err) {
    if (!pollWarned) console.warn('[Audio] poll failed:', err);
    pollWarned = true;
  }
}

// --- handlers --------------------------------------------------------------------

function toggleMute() {
  const muted = !audioManager.muted;
  gameState.isMuted = muted;
  try { SaveData.setMuted(muted); } catch { /* storage blocked: session only */ }
  audioManager.setMuted(muted);
  if (!muted) playSfx('uiConfirm');
  eventBus.emit(Events.AUDIO_MUTE_CHANGED, { muted });
}

function onGameStart({ startWave } = {}) {
  const battle = game?.scene?.getScene('BattleScene')?.battle || null;
  resetRun(battle);
  pressClaimed = true;
  screen = 'battle';
  const wave = battle?.waves?.current || startWave || 1;
  audioManager.playMusic('battle', { section: bandOf(wave, run.total), tension: false });
}

function onWaveStart({ wave, total, flag }) {
  run.total = total || run.total;
  audioManager.setBattleState(bandOf(wave, run.total), !!flag);
  if (flag) {
    playSfx('hugeWave');
    audioManager.duck(AUDIO.DUCK_DB, AUDIO.DUCK_HUGE_HOLD_S, AUDIO.DUCK_HUGE_RELEASE_S);
  } else {
    playSfx('waveStart');
  }
}

function onCoinCollect({ x }) {
  const now = performance.now();
  run.coinStreak = now - run.lastCoinAt < AUDIO.COIN_STREAK_MS ? run.coinStreak + 1 : 0;
  run.lastCoinAt = now;
  playSfx('coinCollect', { streak: run.coinStreak, pan: panOfX(x) });
}

function onKill({ key, x }) {
  playSfx(KILL_VOICE[key] || 'killPoof', { pan: panOfX(x) });
}

function onBattleEnd(won) {
  audioManager.fadeOutMusic(AUDIO.END_FADE_S);
  playSfx(won ? 'winHit' : 'doorBang');
}

/** Any createButton press: a confirm (or back) pluck unless the press's own event already made a sound. */
function onPress({ label } = {}) {
  pressClaimed = false;
  const text = String(label || '');
  queueMicrotask(() => {
    if (pressClaimed) return;
    if (sceneOn('PauseScene') && /^RESUME/.test(text)) return;   // the unpause blip covers it
    playSfx(text.startsWith('<') ? 'uiBack' : 'uiConfirm');
  });
}

const claim = (fn) => (data) => {
  pressClaimed = true;
  fn(data);
};

// --- init --------------------------------------------------------------------------

export function initAudioBridge(phaserGame) {
  if (initialized) return;
  initialized = true;
  game = phaserGame;

  try {
    audioManager.muted = !!SaveData.muted();
  } catch { audioManager.muted = false; }
  gameState.isMuted = audioManager.muted;

  // --- Autoplay policy: create/resume the context on the first user gesture ---
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  // Chrome doesn't count Escape or a lone modifier key as user activation, so
  // unlocking on them only logs "The AudioContext was not allowed to start".
  const NOT_A_GESTURE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'CapsLock', 'Fn', 'OS']);
  let announced = false;
  const onGesture = (e) => {
    if (e.type === 'keydown' && NOT_A_GESTURE.has(e.key)) return;
    audioManager.unlock();
    if (!announced && audioManager.ctx) {
      announced = true;
      eventBus.emit(Events.AUDIO_INIT);
    }
    // Keep listening until the context actually runs (some browsers need a second gesture)
    if (audioManager.running) GESTURES.forEach(ev => window.removeEventListener(ev, onGesture, true));
  };
  GESTURES.forEach(ev => window.addEventListener(ev, onGesture, true));
  eventBus.on(Events.AUDIO_INIT, () => audioManager.unlock());

  // --- Background tab: suspend the context ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audioManager.suspendForBackground();
    else audioManager.resumeFromBackground();
  });

  // --- Mute: M key anywhere; the speaker buttons emit AUDIO_TOGGLE_MUTE ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
  });
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, claim(toggleMute));

  // --- Scenes / music ---
  game?.events?.on('poststep', onPostStep);
  eventBus.on(Events.GAME_START, onGameStart);
  eventBus.on(Events.LEVEL_COMPLETE, () => onBattleEnd(true));
  eventBus.on(Events.GAME_OVER, () => onBattleEnd(false));
  eventBus.on(Events.GAME_PAUSE, claim(() => {
    audioManager.pauseMusic();
    if (!document.hidden) playSfx('pause');
  }));
  eventBus.on(Events.GAME_RESUME, claim(() => {
    audioManager.resumeMusic();
    playSfx('unpause');
  }));
  // Legacy explicit requests still work (nothing emits them today)
  eventBus.on(Events.MUSIC_MENU, () => audioManager.playMusic('menu'));
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());

  // --- Menus ---
  eventBus.on(Events.UI_PRESS, onPress);
  eventBus.on(Events.UI_MENU_MOVE, () => playSfx('uiMove'));
  eventBus.on(Events.UI_MENU_BACK, claim(() => {
    if (!sceneOn('PauseScene')) playSfx('uiBack');
  }));
  eventBus.on(Events.UI_SHOP, claim(({ ok }) => playSfx(ok ? 'shopBuy' : 'shopRefused')));

  // --- Battle UI ---
  eventBus.on(Events.CARD_SELECT, ({ key }) => { if (key) playSfx('cardSelect'); });
  eventBus.on(Events.TOOL_SELECT, ({ tool }) => { if (tool) playSfx('cardSelect'); });

  // --- Sim events ---
  const S = (ev, fn) => eventBus.on(ev, (d) => fn(d || {}));
  S(Events.SIM_PLACE, ({ col }) => playSfx('place', { pan: panOfX(tileCenterX(col ?? 4)) }));
  S(Events.SIM_PLACE_FAIL, () => playSfx('denied'));
  S(Events.SIM_UPGRADE_FAIL, () => playSfx('denied'));
  S(Events.SIM_RECALL_FAIL, () => playSfx('denied'));
  S(Events.SIM_ABILITY_FAIL, () => playSfx('denied'));
  S(Events.SIM_SHOOT, ({ x }) => playSfx('shoot', { pan: panOfX(x), gain: 0.8 }));
  S(Events.SIM_HIT, ({ x, lid, cause }) => {
    if (lid) playSfx('lidHit', { pan: panOfX(x) });
    else if (cause !== 'scooter') playSfx('hit', { pan: panOfX(x), gain: cause === 'dumpling' ? 1 : 0.6 });
  });
  S(Events.SIM_EMBER, ({ x }) => playSfx('ember', { pan: panOfX(x) }));
  S(Events.SIM_KILL, onKill);
  S(Events.SIM_BITE, () => { if (run.battle) pollBites(run.battle); });
  S(Events.SIM_UNIT_LOST, () => playSfx('unitLost'));
  S(Events.SIM_COIN_DROP, ({ x }) => playSfx('coinDrop', { pan: panOfX(x) }));
  S(Events.SIM_COIN_COLLECT, onCoinCollect);
  S(Events.SIM_WAVE_START, onWaveStart);
  S(Events.SIM_PUSH, () => playSfx('push'));
  S(Events.SIM_CARD_UNLOCK, () => playSfx('cardUnlock'));
  S(Events.SIM_SCOOTER, () => playSfx('scooter'));
  S(Events.SIM_ENTER, ({ key }) => { if (key === 'crow') playSfx('caw'); });
  S(Events.SIM_HOP, ({ from }) => playSfx('hop', { pan: panOfX(from) }));
  S(Events.SIM_LID_OFF, ({ x }) => playSfx('lidOff', { pan: panOfX(x) }));
  S(Events.SIM_SOBA_MOVE, () => playSfx('sobaMove'));
  S(Events.SIM_BARK, () => playSfx('bark'));
  S(Events.SIM_ZOOMIES, () => playSfx('zoomies'));
  S(Events.SIM_ZOOMIES_READY, () => playSfx('zoomiesReady'));
  S(Events.SIM_UPGRADE, () => playSfx('upgrade'));
  S(Events.SIM_RECALL, () => playSfx('recall'));
}

/** render_game_to_text().audio */
export function audioDebug() {
  try {
    return audioManager.debugState();
  } catch (err) {
    return { error: String(err) };
  }
}
