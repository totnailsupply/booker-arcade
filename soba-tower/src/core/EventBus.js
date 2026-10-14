export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_RESTART: 'game:restart',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_OVER: 'game:over',                 // { result }
  LEVEL_START: 'level:start',             // { attempt, startHeight }
  LEVEL_COMPLETE: 'level:complete',       // { result }

  // Soba
  SOBA_BOUNCE: 'soba:bounce',             // { type, x, y, heightPx, spring }
  SOBA_FELL: 'soba:fell',                 // { cause: 'fall'|'hit', hazard, lives, zone, x, y }
  SOBA_RESPAWN: 'soba:respawn',           // { zone, x, y }

  // Climb progress
  HEIGHT_CHANGED: 'climb:height',         // { heightM, maxHeightM, progress }
  ZONE_CHANGED: 'climb:zone',             // { index, zone, name, checkpoint }
  LIVES_CHANGED: 'climb:lives',           // { lives, max }
  TREAT_COLLECTED: 'climb:treat',         // { treats, total, x, y }
  STOMP: 'climb:stomp',                   // { stomps, x, y }
  SPRING: 'climb:spring',                 // { x, y }
  CRUMBLE: 'climb:crumble',               // { x, y, w } cracked (falls 0.15 s later)
  CRUMBLE_FALL: 'climb:crumbleFall',      // { x, y, w }
  TILE_WARN: 'climb:tileWarn',            // { x }
  NEW_BEST: 'climb:newBest',              // { heightM, previousM }

  // Score
  SCORE_CHANGED: 'score:changed',         // { score }

  // Audio
  AUDIO_INIT: 'audio:init',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
  AUDIO_MUTE_CHANGED: 'audio:muteChanged',  // { muted }

  // --- Step 4 (visual) events: presentation moments audio can hook --------------
  FX_MILESTONE: 'fx:milestone',           // { meters, heightPx }  max height passed 50, 100, ... 350 m
  FX_HIT_STOP: 'fx:hitStop',              // { ms, cause: 'stomp'|'hit' }  the whole sim freezes this long
  FX_NEAR_MISS: 'fx:nearMiss',            // { hazard: 'crow'|'tile'|'chimes', x, y, gap }  passed close, no hit
  FX_TREAT_ARRIVE: 'fx:treatArrive',      // { treats, total }  the flying biscuit reached the HUD counter
  FX_PLATFORM_TURN: 'fx:platformTurn',    // { type: 'slider'|'lift', x, y }  an on-screen mover turned (dust puff)
  FX_CONFETTI: 'fx:confetti',             // { x, y }  NEW BEST confetti + flag flutter (right after climb:newBest)
  FX_FINISH_ZOOM: 'fx:finishZoom',        // { x, y, zoom }  roof landing: camera zooms on the bell
  FX_SLOWMO: 'fx:slowmo',                 // { scale, ms }  slow motion starts (scale < 1) / ends (scale 1, ms 0)
  FX_FIREWORK: 'fx:firework',             // { index, x, y, color }  one firework bursts over the roof
  FX_RESULTS_STAR: 'fx:resultsStar',      // { index, earned }  a Results star pops in
  FX_SCORE_TALLY: 'fx:scoreTally',        // { score, done }  Results score count-up starts (done false) / ends (done true)
};

class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  emit(event, data) {
    if (!this.listeners[event]) return this;
    // Copy so a listener can unsubscribe during emit
    [...this.listeners[event]].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`EventBus error in ${event}:`, err);
      }
    });
    return this;
  }

  /** Listener count per event (render_game_to_text uses it to spot leaks). */
  counts() {
    const out = {};
    for (const [k, v] of Object.entries(this.listeners)) if (v.length) out[k] = v.length;
    return out;
  }

  removeAll() {
    this.listeners = {};
    return this;
  }
}

export const eventBus = new EventBus();
