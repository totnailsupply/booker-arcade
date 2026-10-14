// =============================================================================
// AudioBridge — global audio wiring, initialised once in main.js (no per-scene
// listeners, so scene switches can't leak or stack anything).
//
//   - Creates/resumes the AudioContext on the first user gesture (autoplay policy).
//   - M key anywhere, or EventBus AUDIO_TOGGLE_MUTE (TopBar / lobby buttons),
//     toggles mute; the state is saved (settings.muted) and announced with
//     AUDIO_MUTE_CHANGED { muted }.
//   - MUSIC_PLAY { track } / MUSIC_STOP / MUSIC_DUCK drive the music.
//   - Wallet events add small stings: VIP_UP -> bonus, BAILOUT / DAILY -> coin
//     stream, BIG_WIN -> music duck (the WinBanner plays bigWin itself).
//   - A hidden tab suspends the context.
//
// Games play SFX directly: import { playSfx } from '../../audio/AudioBridge.js'
// (re-exported from sfx.js).
// =============================================================================

import { AUDIO } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { settings } from '../core/Casino.js';
import { audioManager } from './AudioManager.js';
import { playSfx, cancelSfx, SFX_NAMES } from './sfx.js';

export { playSfx, cancelSfx, SFX_NAMES };
export { MUSIC_TRACKS } from './music.js';

let initialized = false;

export function isMuted() {
  return !!settings.muted;
}

function toggleMute() {
  const muted = !settings.muted;
  settings.muted = muted;
  audioManager.setMuted(muted);
  if (!muted) playSfx('click');
  eventBus.emit(Events.AUDIO_MUTE_CHANGED, { muted });
}

function coinStream(n = 6) {
  for (let i = 0; i < n; i++) playSfx('coin', { index: i, delay: i * 0.07 });
}

export function initAudioBridge() {
  if (initialized) return;
  initialized = true;

  audioManager.muted = !!settings.muted;

  // --- Autoplay policy: create/resume the context on the first user gesture ---
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  const NOT_A_GESTURE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'CapsLock', 'Fn', 'OS']);
  let announced = false;
  const onGesture = (e) => {
    if (e.type === 'keydown' && NOT_A_GESTURE.has(e.key)) return;
    audioManager.unlock();
    if (!announced && audioManager.ctx) {
      announced = true;
      eventBus.emit(Events.AUDIO_INIT);
    }
    if (audioManager.running) GESTURES.forEach(ev => window.removeEventListener(ev, onGesture, true));
  };
  GESTURES.forEach(ev => window.addEventListener(ev, onGesture, true));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audioManager.suspendForBackground();
    else audioManager.resumeFromBackground();
  });

  // --- Mute ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
  });
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, toggleMute);

  // --- Music ---
  eventBus.on(Events.MUSIC_PLAY, ({ track } = {}) => audioManager.playMusic(track || 'lobby'));
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());
  eventBus.on(Events.MUSIC_DUCK, ({ db = AUDIO.DUCK_DB, holdS = AUDIO.DUCK_WIN_HOLD_S, releaseS = AUDIO.DUCK_WIN_RELEASE_S } = {}) => {
    audioManager.duck(db, holdS, releaseS);
  });

  // --- Wallet stings ---
  eventBus.on(Events.VIP_UP, () => {
    playSfx('bonus');
    audioManager.duck(AUDIO.DUCK_DB, AUDIO.DUCK_WIN_HOLD_S, AUDIO.DUCK_WIN_RELEASE_S);
  });
  eventBus.on(Events.BAILOUT, () => { playSfx('woof'); coinStream(8); });
  eventBus.on(Events.DAILY_CLAIMED, () => coinStream(6));
  eventBus.on(Events.BIG_WIN, () => audioManager.duck(AUDIO.DUCK_DB, AUDIO.DUCK_WIN_HOLD_S * 1.5, AUDIO.DUCK_WIN_RELEASE_S));
}
