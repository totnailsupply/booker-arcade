// =============================================================================
// AudioBridge — wires EventBus events to music and SFX. Game code never calls
// audio directly. Global (initialized once in main.js); no per-scene
// listeners, so scene restarts can't leak or stack anything. Per-run state
// (crows already announced, milestones, treat streak) resets on LEVEL_START.
//
// Events -> sound
//   MUSIC_MENU / MUSIC_GAMEPLAY / MUSIC_GAMEOVER   title / zone music / results (win fanfare or lose sting, then a calm loop)
//   ZONE_CHANGED        music layer for the zone (next bar) + gate gong
//   HEIGHT_CHANGED      zone 4 "drive" layer near the top
//   FX_MILESTONE        milestone pluck (every 50 m, with the HUD pop; a gate on the same landing wins)
//   SOBA_BOUNCE         boing-pat (pitch rises per zone), spring, slider clack, lift clink;
//                       also checks the level's crows (caw as one scrolls on screen) and
//                       wind chimes (tinkle when Soba bounces near them)
//   CRUMBLE / CRUMBLE_FALL   crack / debris
//   STOMP               squawk + thump
//   TREAT_COLLECTED     chime (quick pickups step up the scale)
//   TILE_WARN           alarm pips synced to the marker blink, then the drop whoosh
//   SOBA_FELL           hurt yelp (+ chimes clang) and a music duck | life-lost whoosh; music stops at 0 lives
//   SOBA_RESPAWN        whoosh + soft pop
//   NEW_BEST            jingle
//   LEVEL_COMPLETE      temple bell (+ duck, game music fades out under it)
//   GAME_PAUSE / GAME_RESUME   music pause + blips
//   GAME_START / GAME_RESTART  UI select
//   Step 4 presentation events: FX_NEAR_MISS fwip, FX_TREAT_ARRIVE counter tick,
//   FX_PLATFORM_TURN slider knock / lift tick, FX_FIREWORK boom + crackle,
//   FX_RESULTS_STAR star chime, FX_SCORE_TALLY (done) tally ding
// =============================================================================

import { AUDIO, WORLD, CHIMES, CROW } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { saveMuted } from '../core/HighScore.js';
import { LEVEL1 } from '../levels/level1.js';
import { audioManager } from './AudioManager.js';
import { playSfx, cancelSfx, panOfX } from './sfx.js';

let initialized = false;

const wrapDx = (dx) => {
  const w = WORLD.WRAP_W;
  return ((((dx + w / 2) % w) + w) % w) - w / 2;
};

// --- per-run state ---------------------------------------------------------------

const run = {
  active: false,
  crows: [],
  chimes: [],
  lastCawAt: -Infinity,
  treatStreak: 0,
  lastTreatAt: -Infinity,
  pending: [],          // scheduled groups to cancel on pause / scene change
  gateThisTick: false,
};

function resetRun() {
  const hz = LEVEL1.hazards || [];
  run.crows = hz.filter(h => h.type === 'crow').map(h => ({ x: h.x, h: h.y, cawed: false, stomped: false }));
  // chimes def y = hook height; the tubes' centre hangs below it
  const tubeDy = CHIMES.HURT_TOP + CHIMES.HURT_H / 2;
  run.chimes = hz.filter(h => h.type === 'chimes').map(h => ({ x: h.x, h: h.y - tubeDy, lastAt: -Infinity }));
  run.lastCawAt = -Infinity;
  run.treatStreak = 0;
  run.lastTreatAt = -Infinity;
  cancelPending();
}

function cancelPending() {
  run.pending.forEach(cancelSfx);
  run.pending = [];
}

function keepPending(handle, seconds) {
  if (!handle) return;
  run.pending.push(handle);
  setTimeout(() => {
    run.pending = run.pending.filter(h => h !== handle);
  }, seconds * 1000);
}

/** Crows that scroll into view during this bounce's flight: one caw (rate-limited). */
function checkCrows(heightPx) {
  let first = null;
  for (const c of run.crows) {
    if (c.cawed || c.stomped) continue;
    if (c.h <= heightPx + AUDIO.CROW_CAW_ABOVE_PX && c.h >= heightPx - AUDIO.CROW_CAW_BELOW_PX) {
      c.cawed = true;
      first = first || c;
    }
  }
  const now = performance.now();
  if (first && now - run.lastCawAt >= AUDIO.CROW_CAW_GAP_MS) {
    run.lastCawAt = now;
    playSfx('caw', { pan: panOfX(first.x) });
  }
}

/** Wind chimes Soba is bouncing near: a tinkle, louder the closer she is. */
function checkChimes(x, heightPx) {
  const now = performance.now();
  for (const c of run.chimes) {
    const dx = Math.abs(wrapDx(x - c.x));
    const dh = c.h - heightPx;
    if (dx > AUDIO.CHIMES_NEAR_X || dh < -AUDIO.CHIMES_NEAR_BELOW || dh > AUDIO.CHIMES_NEAR_ABOVE) continue;
    if (now - c.lastAt < AUDIO.CHIMES_GAP_MS) continue;
    c.lastAt = now;
    playSfx('chimes', { pan: panOfX(c.x), gain: 1 - 0.5 * (dx / AUDIO.CHIMES_NEAR_X) });
    return;
  }
}

function onBounce({ type, x, heightPx, spring }) {
  if (!run.active) return;
  const zone = gameState.zone || 1;
  if (spring || type === 'spring' || type === 'springpad') {
    playSfx('spring');
  } else if (type !== 'crow' && type !== 'cushion') {
    // crow: the stomp sound covers it; cushion: the respawn pop covers it
    playSfx('bounce', { zone });
    if (type === 'slider') playSfx('clack', { pan: panOfX(x) });
    else if (type === 'lift') playSfx('clink', { pan: panOfX(x) });
  }
  checkCrows(heightPx);
  checkChimes(x, heightPx);
}

function onHeight({ progress }) {
  if (!run.active) return;
  if (gameState.zone >= 4 && progress >= AUDIO.DRIVE_PROGRESS) audioManager.setDrive(true);
}

/** fx:milestone is emitted from HEIGHT_CHANGED; a zone gate on the same landing (ZONE_CHANGED right after) wins. */
function onMilestone() {
  if (!run.active) return;
  queueMicrotask(() => {
    if (!run.gateThisTick) playSfx('milestone');
  });
}

function onStomp({ y }) {
  const h = -y;
  let best = null;
  for (const c of run.crows) {
    if (!c.stomped && (!best || Math.abs(c.h - h) < Math.abs(best.h - h))) best = c;
  }
  if (best && Math.abs(best.h - h) < CROW.H) best.stomped = true;
  playSfx('stomp');
}

function onTreat() {
  const now = performance.now();
  run.treatStreak = now - run.lastTreatAt < AUDIO.TREAT_STREAK_MS ? run.treatStreak + 1 : 0;
  run.lastTreatAt = now;
  playSfx('treat', { streak: run.treatStreak });
}

function onFell({ cause, hazard, lives }) {
  if (cause === 'hit') {
    playSfx('hurt');
    if (hazard === 'chimes') playSfx('chimes', { hit: true });
    audioManager.duck(AUDIO.DUCK_DB, AUDIO.DUCK_HURT_HOLD_S, AUDIO.DUCK_HURT_RELEASE_S);
  } else {
    playSfx('lifeLost');
  }
  if (lives <= 0) {
    run.active = false;
    cancelPending();
    audioManager.stopMusic(AUDIO.GAMEOVER_FADE_S);
  }
}

function onRespawn({ y }) {
  playSfx('respawn');
  // Crows above the respawn point announce themselves again on the next try
  const h = -y;
  for (const c of run.crows) if (!c.stomped && c.h > h - AUDIO.CROW_CAW_BELOW_PX) c.cawed = false;
}

function onComplete() {
  run.active = false;
  cancelPending();
  playSfx('bell');
  audioManager.duck(AUDIO.DUCK_DB, AUDIO.DUCK_BELL_HOLD_S, AUDIO.DUCK_BELL_RELEASE_S);
  audioManager.stopMusic(AUDIO.COMPLETE_FADE_S);
}

function toggleMute() {
  const muted = !gameState.isMuted;
  gameState.isMuted = muted;
  saveMuted(muted);
  audioManager.setMuted(muted);
  if (!muted) playSfx('select');
  eventBus.emit(Events.AUDIO_MUTE_CHANGED, { muted });
}

export function initAudioBridge() {
  if (initialized) return;
  initialized = true;

  audioManager.muted = !!gameState.isMuted;

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

  // --- Background tab: suspend the context (the climb also pauses itself) ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audioManager.suspendForBackground();
    else audioManager.resumeFromBackground();
  });

  // --- Mute: M key anywhere, the speaker button emits AUDIO_TOGGLE_MUTE ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
  });
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, toggleMute);

  // --- Music ---
  eventBus.on(Events.MUSIC_MENU, () => audioManager.playMusic('title'));
  eventBus.on(Events.MUSIC_GAMEPLAY, () => audioManager.playMusic('game', { section: gameState.zone || 1, drive: false }));
  eventBus.on(Events.MUSIC_GAMEOVER, () => {
    cancelPending();
    const win = gameState.result?.outcome === 'complete';
    audioManager.playMusic('results', {
      intro: win ? 'win' : 'lose',
      delay: win ? AUDIO.RESULTS_WIN_DELAY_S : AUDIO.RESULTS_LOSE_DELAY_S,
    });
  });
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());

  eventBus.on(Events.GAME_PAUSE, () => {
    audioManager.pauseMusic();
    cancelPending();
    if (!document.hidden) playSfx('pause');
  });
  eventBus.on(Events.GAME_RESUME, () => {
    audioManager.resumeMusic();
    playSfx('unpause');
  });
  eventBus.on(Events.GAME_START, () => playSfx('select'));
  eventBus.on(Events.GAME_RESTART, () => playSfx('select'));

  // --- Climb ---
  eventBus.on(Events.LEVEL_START, () => {
    resetRun();
    run.active = true;
  });
  eventBus.on(Events.ZONE_CHANGED, ({ zone }) => {
    run.gateThisTick = true;
    queueMicrotask(() => { run.gateThisTick = false; });
    audioManager.setSection(zone);
    playSfx('gate');
  });
  eventBus.on(Events.HEIGHT_CHANGED, onHeight);
  eventBus.on(Events.SOBA_BOUNCE, onBounce);
  eventBus.on(Events.CRUMBLE, ({ x }) => playSfx('crack', { pan: panOfX(x) }));
  eventBus.on(Events.CRUMBLE_FALL, ({ x }) => playSfx('debris', { pan: panOfX(x) }));
  eventBus.on(Events.STOMP, onStomp);
  eventBus.on(Events.TREAT_COLLECTED, onTreat);
  eventBus.on(Events.TILE_WARN, ({ x }) => {
    keepPending(playSfx('tileWarn', { pan: panOfX(x) }), AUDIO.TILE_PENDING_S);
  });
  eventBus.on(Events.SOBA_FELL, onFell);
  eventBus.on(Events.SOBA_RESPAWN, onRespawn);
  eventBus.on(Events.NEW_BEST, () => playSfx('newBest'));
  eventBus.on(Events.LEVEL_COMPLETE, onComplete);

  // --- Step 4 presentation moments (Effects / Finale / Results emit these) ---
  const onFx = (ev, cb) => { if (ev) eventBus.on(ev, cb); };
  onFx(Events.FX_MILESTONE, onMilestone);
  onFx(Events.FX_NEAR_MISS, ({ x }) => { if (run.active) playSfx('nearMiss', { pan: panOfX(x) }); });
  onFx(Events.FX_TREAT_ARRIVE, () => playSfx('counter'));
  onFx(Events.FX_PLATFORM_TURN, ({ type, x }) => { if (run.active) playSfx('turn', { type, pan: panOfX(x) }); });
  onFx(Events.FX_FIREWORK, ({ x }) => playSfx('firework', { pan: panOfX(x) }));
  onFx(Events.FX_RESULTS_STAR, ({ index, earned }) => playSfx('star', { index, earned }));
  onFx(Events.FX_SCORE_TALLY, ({ done }) => { if (done) playSfx('tally'); });
}
