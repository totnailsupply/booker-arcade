// Wires EventBus events to music and SFX. Game code never calls audio directly.
//
// Rate limits and streaks use performance.now() (real time), so they behave the
// same in deterministic test mode. Positional volume for steam and the glide
// wind's pitch read Booker's position/velocity through a read-only probe of the
// RunScene (window.__GAME__); without it they fall back to fixed values.

import { AUDIO } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { saveMuted } from '../core/HighScore.js';
import { audioManager } from './AudioManager.js';
import {
  jumpSfx, landSfx, boneSfx, whooshSfx, deathSfx, fanfareSfx, woofSfx, clickSfx,
  doubleJumpSfx, glideStart, glideStop, glideUpdate, glideIsActive,
  wallClingSfx, wallKickSfx, pounceSfx, stompSfx, dashSfx, dashEndSfx, smashSfx,
  steamWindupSfx, steamOnSfx,
  menuMoveSfx, menuSelectSfx, menuBackSfx, retrySfx, lockedSfx, unlockSfx,
  gameOverStingSfx, newBestSfx, starPopSfx, tallyTickSfx, tallyDoneSfx,
  abilityIntroSfx, tipSfx, endingSfx,
} from './sfx.js';

let initialized = false;

// --- read-only probe of the running level (never throws) -----------------------
function runPlayer() {
  try {
    const run = window.__GAME__?.scene?.getScene?.('RunScene');
    if (!run || !run.player || !run.sys || !(run.sys.isActive() || run.sys.isPaused())) return null;
    return run.player;
  } catch {
    return null;
  }
}

/** 0..1 volume for a sound at world x, by distance from Booker. */
function distanceGain(x) {
  const p = runPlayer();
  const px = p?.sprite?.x;
  if (!Number.isFinite(x) || !Number.isFinite(px)) return 0.6;
  const d = Math.abs(x - px);
  if (d <= AUDIO.STEAM_NEAR_PX) return 1;
  if (d >= AUDIO.STEAM_FAR_PX) return 0;
  const k = 1 - (d - AUDIO.STEAM_NEAR_PX) / (AUDIO.STEAM_FAR_PX - AUDIO.STEAM_NEAR_PX);
  return 0.2 + 0.8 * k * k;
}

/** Calls fn at most once per gapMs (real time). */
function limiter(gapMs) {
  let last = -Infinity;
  return (fn) => {
    const now = performance.now();
    if (now - last < gapMs) return false;
    last = now;
    fn();
    return true;
  };
}

/** Counts quick repeats: returns 0 for the first, 1, 2, ... while within windowMs. */
function streak(windowMs) {
  let last = -Infinity;
  let n = 0;
  const fn = () => {
    const now = performance.now();
    n = now - last < windowMs ? n + 1 : 0;
    last = now;
    return n;
  };
  fn.reset = () => { last = -Infinity; n = 0; };
  return fn;
}

export function initAudioBridge() {
  if (initialized) return;
  initialized = true;

  audioManager.muted = !!gameState.isMuted;

  // --- Autoplay policy: create/resume the context on the first user gesture ---
  let announced = false;
  const onGesture = () => {
    audioManager.unlock();
    if (!announced && audioManager.ctx) {
      announced = true;
      eventBus.emit(Events.AUDIO_INIT);
    }
    // Keep listening until the context actually runs (some browsers need a second gesture)
    if (audioManager.running) {
      ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.removeEventListener(ev, onGesture, true));
    }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, onGesture, true));
  eventBus.on(Events.AUDIO_INIT, () => audioManager.unlock());

  // --- Mute: M key anywhere, HUD/title button emits AUDIO_TOGGLE_MUTE ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
  });
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    const muted = !gameState.isMuted;
    gameState.isMuted = muted;
    saveMuted(muted);
    audioManager.setMuted(muted);
    if (!muted) clickSfx();
    eventBus.emit(Events.AUDIO_MUTE_CHANGED, { muted });
  });

  // --- Glide wind loop: starts/stops with the events, follows the fall speed ---
  let glidePoll = null;
  const stopGlide = () => {
    if (glidePoll) {
      clearInterval(glidePoll);
      glidePoll = null;
    }
    glideStop();
  };
  const startGlide = () => {
    if (!glideStart()) return;
    if (glidePoll) return;
    glidePoll = setInterval(() => {
      // Safety net: never leave wind playing outside active play
      if (gameState.mode !== MODES.PLAYING || !glideIsActive()) {
        stopGlide();
        return;
      }
      const vy = runPlayer()?.body?.velocity?.y;
      if (Number.isFinite(vy)) glideUpdate(vy);
    }, AUDIO.GLIDE_POLL_MS);
  };

  // --- Music ---
  // Ducks: the level's music starts under the new-ability card (RunScene emits
  // ABILITY_INTRO_SHOWN, then MUSIC_GAMEPLAY once) and swells back when the card
  // goes; the results loop dips under the Level 6 ending flourish.
  let endingTimer = null;
  const unduck = () => {
    if (endingTimer) {
      clearTimeout(endingTimer);
      endingTimer = null;
    }
    if (audioManager.duckLevel !== 1) audioManager.duckMusic(1);
  };
  eventBus.on(Events.MUSIC_MENU, () => {
    stopGlide();
    unduck();
    audioManager.playMusic('menu');
  });
  // payload { levelId, variant }: variant = LEVELS[n].music (yard, docks, rooftops, factory, market, steakhouse)
  eventBus.on(Events.MUSIC_GAMEPLAY, (d) => audioManager.playMusic('game', {
    section: gameState.section || 1,
    variant: d?.variant || null,
  }));
  eventBus.on(Events.MUSIC_GAMEOVER, () => {
    unduck();
    audioManager.playMusic('complete', { delay: AUDIO.COMPLETE_MUSIC_DELAY_S });
  });
  eventBus.on(Events.MUSIC_STOP, () => {
    stopGlide();
    unduck();
    audioManager.stopMusic();
  });
  eventBus.on(Events.GAME_PAUSE, () => {
    stopGlide();
    audioManager.pauseMusic();
  });
  eventBus.on(Events.GAME_RESUME, () => {
    audioManager.resumeMusic();
    if (runPlayer()?.ctrl?.gliding) startGlide();
  });

  eventBus.on(Events.SECTION_CHANGED, ({ index }) => {
    audioManager.setSection(index + 1);
    whooshSfx();
  });

  // --- Core run SFX ---
  const kickChain = streak(AUDIO.KICK_STREAK_MS);
  const stompChain = streak(AUDIO.STOMP_STREAK_MS);
  let newBestPending = false;

  eventBus.on(Events.LEVEL_START, () => {
    stopGlide();
    unduck();
    kickChain.reset();
    stompChain.reset();
    newBestPending = false;
  });

  eventBus.on(Events.PLAYER_JUMP, () => jumpSfx());

  let lastLand = 0;
  eventBus.on(Events.PLAYER_LAND, () => {
    const now = performance.now();
    if (now - lastLand < AUDIO.LAND_MIN_GAP_MS) return;
    lastLand = now;
    landSfx();
  });

  eventBus.on(Events.BONE_COLLECTED, (d) => {
    // RunScene emits { bones: 0 } on create to reset the HUD; that isn't a pickup.
    if (!d || !d.bones || d.x === undefined) return;
    boneSfx();
  });

  eventBus.on(Events.PLAYER_DIED, () => {
    stopGlide();
    unduck();
    audioManager.stopMusic();
    deathSfx();
  });

  eventBus.on(Events.LEVEL_COMPLETE, (r) => {
    stopGlide();
    audioManager.stopMusic();
    fanfareSfx(r?.levelId === 'level6');
    woofSfx(0.75);
  });

  // --- Ability SFX ---
  const clingLimit = limiter(AUDIO.CLING_MIN_GAP_MS);
  const windupLimit = limiter(AUDIO.STEAM_MIN_GAP_MS);
  const steamOnLimit = limiter(AUDIO.STEAM_MIN_GAP_MS);

  eventBus.on(Events.PLAYER_DOUBLE_JUMP, () => doubleJumpSfx());
  eventBus.on(Events.PLAYER_GLIDE_START, () => startGlide());
  eventBus.on(Events.PLAYER_GLIDE_END, () => stopGlide());
  eventBus.on(Events.PLAYER_WALL_CLING, () => clingLimit(wallClingSfx));
  eventBus.on(Events.PLAYER_WALL_KICK, () => wallKickSfx(Math.min(kickChain(), 5)));
  eventBus.on(Events.PLAYER_POUNCE, () => pounceSfx());
  eventBus.on(Events.ENEMY_STOMPED, () => stompSfx(stompChain()));
  eventBus.on(Events.PLAYER_DASH, () => dashSfx());
  eventBus.on(Events.PLAYER_DASH_END, () => dashEndSfx());
  eventBus.on(Events.BREAKABLE_SMASHED, (d) => smashSfx(d?.type));
  eventBus.on(Events.STEAM_WINDUP, (d) => {
    const v = distanceGain(d?.x);
    if (v > 0) windupLimit(() => steamWindupSfx(v));
  });
  eventBus.on(Events.STEAM_ON, (d) => {
    const v = distanceGain(d?.x);
    if (v > 0) steamOnLimit(() => steamOnSfx(v));
  });

  // --- UI SFX ---
  const moveLimit = limiter(AUDIO.MENU_MOVE_MIN_GAP_MS);
  const tallyLimit = limiter(AUDIO.TALLY_MIN_GAP_MS);

  eventBus.on(Events.MENU_MOVE, () => moveLimit(menuMoveSfx));
  eventBus.on(Events.MENU_SELECT, (d) => {
    if (d?.action === 'auto-retry') return;          // the card retries on its own: stay quiet
    if (d?.action === 'retry') retrySfx();
    else menuSelectSfx();
  });
  eventBus.on(Events.MENU_BACK, () => menuBackSfx());
  eventBus.on(Events.MENU_LOCKED, () => lockedSfx());
  // Unlock jingle: on the unlock animation when the UI reports it (results card or
  // level select); otherwise right after the level-complete fanfare.
  if (Events.UI_UNLOCK_REVEAL) {
    const revealLimit = limiter(600);
    eventBus.on(Events.UI_UNLOCK_REVEAL, () => revealLimit(() => unlockSfx(0)));
  } else {
    eventBus.on(Events.LEVEL_UNLOCKED, () => unlockSfx(AUDIO.UNLOCK_JINGLE_DELAY_S));
  }

  // A new best plays the rising arpeggio on the game-over card instead of the sting
  eventBus.on(Events.NEW_BEST_PROGRESS, () => { newBestPending = true; });
  eventBus.on(Events.GAME_OVER_SHOWN, (d) => {
    if (d?.isNewBestProgress || newBestPending) newBestSfx();
    else gameOverStingSfx();
    newBestPending = false;
  });

  // Phase 2 UI moments (hooked only if the UI defines the event)
  const on = (name, fn) => { if (Events[name]) eventBus.on(Events[name], fn); };
  const newBestLimit = limiter(250);
  const tipLimit = limiter(400);
  on('UI_STAR_POP', (d) => starPopSfx(d?.index ?? 0, d?.earned !== false));
  on('UI_TALLY_TICK', (d) => {
    if (d?.done) tallyDoneSfx();
    else tallyLimit(() => tallyTickSfx(Math.min(1, (d?.row || 0) * 0.25)));
  });
  on('UI_NEW_BEST', () => newBestLimit(newBestSfx));
  on('UI_ENDING', () => {
    unduck();
    endingSfx();
    audioManager.duckMusic(AUDIO.ENDING_DUCK);
    endingTimer = setTimeout(() => {
      endingTimer = null;
      audioManager.duckMusic(1, AUDIO.DUCK_RELEASE_S);
    }, AUDIO.ENDING_DUCK_S * 1000);
  });
  on('ABILITY_INTRO_SHOWN', () => {
    unduck();
    abilityIntroSfx();
    audioManager.duckMusic(AUDIO.INTRO_DUCK);
  });
  on('ABILITY_INTRO_DONE', (d) => {
    if (d?.by === 'press') menuSelectSfx();
    audioManager.duckMusic(1, AUDIO.DUCK_RELEASE_S);
  });
  on('TIP_SHOWN', () => tipLimit(tipSfx));
}
