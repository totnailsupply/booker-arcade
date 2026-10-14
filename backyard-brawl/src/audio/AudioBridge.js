// =============================================================================
// AudioBridge — wires EventBus events to music and SFX. Game code never calls
// audio directly.
//
// Inputs:
//   - sim events, forwarded by ArenaScene as `sim:<type>` (shot, hit, kill, pop,
//     pickup, levelUpOpen, card, playerHurt, dash, waveStart, waveEnd, victory,
//     endlessStart, bossSpawn, bossWindup, bossCharge, bossSummon, bossPhase2,
//     bossRing, bossBounce, bossDeath, swoop, enemyShot, bounce, playerDeath)
//   - scene / menu events (MUSIC_*, GAME_PAUSE/RESUME, MENU_MOVE/SELECT/BACK,
//     GAME_OVER_SHOWN, AUDIO_TOGGLE_MUTE)
//   - a light poll (AUDIO.POLL_MS) of the Arena's world for continuous state:
//     battle intensity (wave + enemies alive), boss phase, level-up overlay
//     (duck + shimmer), low-HP heartbeat, frisbee whirr, zoomies patter and the
//     Robo-Vac suction drone. The poll only reads; it never changes the game.
// =============================================================================

import { WAVES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { saveMuted } from '../core/SaveData.js';
import { AUDIO } from './audioConfig.js';
import { audioManager } from './AudioManager.js';
import {
  playSfx, wouldPlay, voiceCounts, startLoop, stopLoop, stopAllLoops, SFX_NAMES,
} from './sfx.js';

let initialized = false;

// --- reading the game (read-only) ------------------------------------------------

function scene(key) {
  const g = window.__GAME__;
  if (!g || !g.scene) return null;
  try { return g.scene.getScene(key) || null; } catch { return null; }
}

/** { world, active, paused } for a live Arena, or null. */
function arena() {
  const a = scene('ArenaScene');
  if (!a || !a.world || !a.sys) return null;
  const active = a.sys.isActive();
  const paused = a.sys.isPaused();
  if (!active && !paused) return null;
  return { world: a.world, active, paused, ended: !!a.ended };
}

const world = () => arena()?.world || null;

// The poll caches the live world, so per-hit panning doesn't look scenes up
let cachedWorld = null;

/** Stereo pan from a world x relative to Booker (subtle). */
function panOf(x) {
  const w = cachedWorld;
  if (!w || !Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, (x - w.player.x) / 220)) * 0.45;
}

// --- battle intensity -----------------------------------------------------------------

let intensity = 1;

function intensityScore(w) {
  const I = AUDIO.INTENSITY;
  let alive = 0;
  for (const e of w.enemies) if (!e.dead) alive += 1;
  return Math.max(0, (w.wave - 1) * I.WAVE_W) + alive * I.ALIVE_W;
}

/** Level 1..5 with hysteresis on the way down. */
function intensityLevel(w, prev) {
  const I = AUDIO.INTENSITY;
  const s = intensityScore(w);
  let up = 1;
  I.THRESHOLDS.forEach((th, i) => { if (s >= th) up = i + 2; });
  if (up >= prev) return up;
  // Falling: only drop below a threshold minus the hysteresis
  let lvl = prev;
  while (lvl > 1 && s < I.THRESHOLDS[lvl - 2] - I.HYST) lvl -= 1;
  return lvl;
}

const bossVariant = type => (type === 'boss-vac' ? 'vac' : 'cat');

// --- per-type sound maps -----------------------------------------------------------

const SHOT_SFX = { bark: 'shotBark', ball: 'shotBall', bone: 'shotBone', squeak: 'shotSqueak' };
const DEATH_SFX = {
  cat: 'deathCat', squirrel: 'deathSquirrel', crow: 'deathCrow', raccoon: 'deathRaccoon', skunk: 'deathSkunk', kitten: 'deathKitten',
};
const HIT_PITCH = { squirrel: 1.3, kitten: 1.4, crow: 1.15, cat: 1, skunk: 0.92, raccoon: 0.75 };

// --- kibble chain --------------------------------------------------------------------

let kibbleStep = -1;
let kibbleAt = -Infinity;

function kibble(x) {
  if (!wouldPlay('kibble')) return;
  const now = performance.now();
  kibbleStep = now - kibbleAt < AUDIO.KIBBLE_CHAIN_RESET_MS ? Math.min(kibbleStep + 1, AUDIO.KIBBLE_CHAIN_STEPS - 1) : 0;
  kibbleAt = now;
  playSfx('kibble', { step: kibbleStep, pan: panOf(x) });
}

// --- poll: continuous state ------------------------------------------------------------

const timers = { heartbeat: 0, frisbee: 0, zoomies: 0 };
let zoomSide = 1;
let lastPoll = 0;
let levelUpOpen = false;

function setLevelUp(open) {
  if (open === levelUpOpen) return;
  levelUpOpen = open;
  if (open) {
    audioManager.holdDuck('levelUp', AUDIO.DUCK.levelUp);
    audioManager.startShimmer();
  } else {
    audioManager.releaseDuck('levelUp');
    audioManager.stopShimmer();
  }
}

function poll() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - (lastPoll || now)) / 1000);
  lastPoll = now;
  const st = arena();
  const w = st?.world;
  cachedWorld = w || null;
  const live = !!(st && st.active && !st.ended && w && !w.over && w.phase !== 'dying');

  setLevelUp(!!(live && w.phase === 'levelup'));
  if (!live) {
    stopLoop('vacDrone');
    timers.heartbeat = 0;
    return;
  }
  const playing = w.phase === 'playing';
  const moving = playing || w.phase === 'wave_break';

  // Music layers
  const track = audioManager.track;
  if (track === 'battle') {
    intensity = intensityLevel(w, intensity);
    audioManager.setSection(intensity);
  } else if (track === 'boss') {
    const b = w.bosses.find(e => !e.dead);
    if (b) audioManager.setSection(b.phase2 || b.hp < b.maxHp * 0.5 ? 2 : 1);
  }

  // Low-HP heartbeat
  const p = w.player;
  const frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  if (moving && p.hp > 0 && frac <= AUDIO.HEARTBEAT_HP_FRAC) {
    timers.heartbeat -= dt;
    if (timers.heartbeat <= 0) {
      playSfx('heartbeat');
      const k = Math.max(0, Math.min(1, (frac - 0.1) / (AUDIO.HEARTBEAT_HP_FRAC - 0.1)));
      timers.heartbeat = AUDIO.HEARTBEAT_FAST_S + k * (AUDIO.HEARTBEAT_S - AUDIO.HEARTBEAT_FAST_S);
    }
  } else {
    timers.heartbeat = 0;
  }

  // Frisbee whirr (while discs spin in a fight)
  const fris = playing && w.weapons.find(x => x.key === 'frisbee');
  if (fris) {
    timers.frisbee -= dt;
    if (timers.frisbee <= 0) {
      const n = fris.discs?.length || 1;
      playSfx('frisbeeWhirr', { n });
      timers.frisbee = AUDIO.FRISBEE_TICK_S / Math.sqrt(n);
    }
  }

  // Zoomies paw patter (while Booker runs)
  if (playing && p.moving && w.weapons.some(x => x.key === 'zoomies')) {
    timers.zoomies -= dt;
    if (timers.zoomies <= 0) {
      zoomSide = -zoomSide;
      playSfx('zoomiesPatter', { side: zoomSide });
      timers.zoomies = AUDIO.ZOOMIES_PATTER_S;
    }
  }

  // Robo-Vac suction drone in phase 2
  const sucking = playing && w.bosses.some(b => !b.dead && b.type === 'boss-vac' && b.phase2);
  if (sucking) startLoop('vacDrone');
  else stopLoop('vacDrone');
}


// --- combat handlers ------------------------------------------------------------------

/** Enemy type of a hit / kill / bossSpawn payload (the sim names it `enemy`). */
function enemyOf(ev) {
  return ev.enemy || null;
}

function onHit(ev, type) {
  const pan = panOf(ev.x);
  if (type === 'boss-cat' || type === 'boss-vac') {
    playSfx('hitBoss', { vac: type === 'boss-vac', pan });
    return;
  }
  const k = HIT_PITCH[type] || 1;
  if (ev.crit) playSfx('hitCrit', { k, pan });
  else playSfx('hit', { k, pan });
}

function onKill(ev, type) {
  if (ev.boss) return; // bossDeath has its own boom
  const pan = panOf(ev.x);
  const name = DEATH_SFX[type];
  if (name) playSfx(name, { pan });
  if (ev.elite) playSfx('deathElite', { pan });
}

const onPop = ev => playSfx('pop', { pan: panOf(ev.x) });

function onBossSpawn(ev, type) {
  const vac = type ? type === 'boss-vac' : /VAC/i.test(ev.name || '');
  playSfx(vac ? 'bossIntroVac' : 'bossIntroCat');
  audioManager.duck(AUDIO.DUCK.bossIntro, AUDIO.BOSS_INTRO_HOLD_S);
}

function onBossDeath() {
  stopLoop('vacDrone');
  playSfx('bossDeath');
  audioManager.duck(AUDIO.DUCK.bossDeath, AUDIO.BOSS_DEATH_HOLD_S);
}

// =============================================================================

export function initAudioBridge() {
  if (initialized) return;
  initialized = true;

  audioManager.muted = !!gameState.isMuted;
  // QA hooks (audio-check): window.__AUDIO__.debug
  audioManager.debug = { playSfx, voiceCounts, names: SFX_NAMES, startLoop, stopLoop, intensity: () => intensity };

  // --- Autoplay policy: create/resume the context on the first user gesture ---
  let announced = false;
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  const NOT_A_GESTURE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'CapsLock', 'Fn', 'OS']);
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
  eventBus.on(Events.AUDIO_INIT, () => audioManager.unlock());

  // A hidden tab suspends the context; it resumes when visible again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audioManager.suspendForBackground();
    else audioManager.resumeFromBackground();
  });

  // --- Mute: M key anywhere; the speaker buttons emit AUDIO_TOGGLE_MUTE ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
  });
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    const muted = !gameState.isMuted;
    gameState.isMuted = muted;
    saveMuted(muted);
    audioManager.setMuted(muted);
    if (!muted) playSfx('click');
    eventBus.emit(Events.AUDIO_MUTE_CHANGED, { muted });
  });

  setInterval(() => {
    try { poll(); } catch (err) { console.warn('[Audio] poll failed:', err); }
  }, AUDIO.POLL_MS);

  // --- Music ---------------------------------------------------------------------
  eventBus.on(Events.MUSIC_MENU, () => audioManager.playMusic('menu', { keep: true }));
  eventBus.on(Events.MUSIC_GAMEPLAY, () => {
    const w = world();
    intensity = w ? intensityLevel(w, 1) : 1;
    kibbleStep = -1;
    if (w && w.bossWave) {
      const b = w.bosses[0];
      const type = b?.type || (w.wave % (WAVES.BOSS_EVERY * 2) === 0 ? 'boss-vac' : 'boss-cat');
      audioManager.playMusic('boss', { variant: bossVariant(type) });
    } else {
      audioManager.playMusic('battle', { section: intensity });
    }
  });
  eventBus.on(Events.MUSIC_GAMEOVER, (d) => audioManager.playMusic('results', {
    delay: d?.win ? AUDIO.RESULTS_WIN_DELAY_S : AUDIO.RESULTS_DELAY_S,
  }));
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());
  eventBus.on(Events.GAME_PAUSE, () => {
    audioManager.pauseMusic();
    stopAllLoops();
  });
  eventBus.on(Events.GAME_RESUME, () => audioManager.resumeMusic());

  // --- Waves ---------------------------------------------------------------------
  eventBus.on(Events.SIM_WAVE_START, (ev) => {
    if (ev.boss) {
      audioManager.playMusic('boss', { variant: bossVariant(ev.bossType), keep: true });
      playSfx('bossHorn');
    } else {
      if (audioManager.track !== 'battle') {
        const w = world();
        intensity = w ? intensityLevel(w, 1) : 1;
        audioManager.playMusic('battle', { section: intensity, keep: true });
      }
      playSfx('waveHorn');
    }
  });
  eventBus.on(Events.SIM_WAVE_END, (ev) => {
    // Wave 10: the victory fanfare (or the Endless fanfare) plays instead
    if (ev.wave === WAVES.COUNT) return;
    playSfx('waveClear');
    audioManager.duck(AUDIO.DUCK.waveClear, AUDIO.WAVE_CLEAR_HOLD_S);
  });
  eventBus.on(Events.SIM_VICTORY, () => {
    audioManager.stopMusic(AUDIO.DEATH_FADE_S);
    stopAllLoops();
    playSfx('victory');
  });
  eventBus.on('sim:endlessStart', () => {
    playSfx('victory');
    audioManager.duck(AUDIO.DUCK.waveClear, 2.4);
  });

  // --- Combat --------------------------------------------------------------------
  eventBus.on(Events.SIM_SHOT, (ev) => {
    const name = SHOT_SFX[ev.weapon];
    if (name) playSfx(name, { pan: panOf(ev.x) });
  });
  eventBus.on('sim:bounce', ev => playSfx('ballBounce', { pan: panOf(ev.x) }));
  eventBus.on(Events.SIM_HIT, ev => onHit(ev, enemyOf(ev)));
  eventBus.on(Events.SIM_KILL, ev => onKill(ev, enemyOf(ev)));
  eventBus.on(Events.SIM_POP, ev => onPop(ev));
  eventBus.on('sim:swoop', ev => playSfx('crowSwoop', { pan: panOf(ev.x) }));
  eventBus.on('sim:enemyShot', ev => playSfx('stinkLob', { pan: panOf(ev.x) }));

  // --- Bosses --------------------------------------------------------------------
  eventBus.on('sim:bossSpawn', ev => onBossSpawn(ev, enemyOf(ev)));
  eventBus.on('sim:bossWindup', () => playSfx('chargeWarn'));
  eventBus.on('sim:bossCharge', ev => playSfx('chargeGo', { pan: panOf(ev.x) }));
  eventBus.on('sim:bossSummon', ev => playSfx('summon', { pan: panOf(ev.x) }));
  eventBus.on('sim:bossPhase2', () => playSfx('vacPhase2'));
  eventBus.on('sim:bossRing', ev => playSfx('dustRing', { pan: panOf(ev.x) }));
  eventBus.on('sim:bossBounce', ev => playSfx('vacBounce', { pan: panOf(ev.x) }));
  eventBus.on('sim:bossDeath', () => onBossDeath());

  // --- Pickups and player ------------------------------------------------------------
  eventBus.on(Events.SIM_PICKUP, (ev) => {
    if (ev.kind === 'kibble') kibble(ev.x);
    else if (ev.kind === 'heart') playSfx('heart');
    else if (ev.kind === 'magnet') playSfx('magnet');
    else if (ev.kind === 'goldenBone') playSfx('goldenBone');
  });
  eventBus.on(Events.SIM_PLAYER_HURT, () => playSfx('hurt'));
  eventBus.on(Events.SIM_DASH, () => playSfx('dash'));
  eventBus.on(Events.SIM_PLAYER_DEATH, () => {
    audioManager.stopMusic(AUDIO.DEATH_FADE_S);
    stopAllLoops();
    setLevelUp(false);
    playSfx('playerDeath');
    playSfx('gameOver', { delay: AUDIO.GAME_OVER_STING_DELAY_S });
  });

  // --- Level-up overlay ------------------------------------------------------------
  eventBus.on(Events.SIM_LEVEL_UP_OPEN, () => {
    playSfx('levelUp');
    setLevelUp(true);   // the poll releases it when the overlay closes
  });
  eventBus.on(Events.SIM_CARD, (ev) => { if (ev.rare) playSfx('cardRare'); });

  // --- Menus ---------------------------------------------------------------------
  const levelUpActive = () => !!scene('LevelUpScene')?.sys?.isActive();
  eventBus.on(Events.MENU_MOVE, () => playSfx(levelUpActive() ? 'cardMove' : 'menuMove'));
  eventBus.on(Events.MENU_SELECT, (d) => {
    switch (d?.action) {
      case 'card': playSfx('cardSelect'); break;
      case 'reroll': playSfx('cardReroll'); break;
      case 'play': playSfx('menuStart'); break;
      case 'buy': playSfx('buy'); break;
      case 'unlock': playSfx('unlock'); break;
      case 'retry': playSfx('retry'); break;
      case 'denied':
      case 'locked': playSfx('denied'); break;
      default: playSfx('menuSelect');
    }
  });
  eventBus.on(Events.MENU_BACK, () => {
    // KennelScene sends MENU_BACK for a failed buy too; a real back sets `leaving` first
    const k = scene('KennelScene');
    if (k?.sys?.isActive() && !k.leaving) playSfx('denied');
    else playSfx('menuBack');
  });
  eventBus.on(Events.GAME_OVER_SHOWN, (d) => {
    if (d?.isNewBest) playSfx('newBest', { delay: d?.win ? 2.2 : 1.2 });
  });
}
