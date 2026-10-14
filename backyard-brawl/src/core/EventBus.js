// Every event name the game uses. Sim events (src/sim emits { type, ... })
// are forwarded by ArenaScene as `sim:<type>` (SIM_EVENTS below).
export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',               // { seed, wave }
  GAME_RESTART: 'game:restart',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_OVER: 'game:over',                 // { result }  Results scene opened
  GAME_OVER_SHOWN: 'game:overShown',      // { isNewBest, rank }

  // Sim events, forwarded from World.drainEvents()
  SIM_SHOT: 'sim:shot',                   // { weapon, x, y, angle, count }
  SIM_HIT: 'sim:hit',                     // { id, enemy, x, y, dmg, crit, weapon }  (enemy = enemy type; World.emit keeps type = event name)
  SIM_KILL: 'sim:kill',                   // { id, enemy, x, y, points, combo, mult, elite, boss }
  SIM_POP: 'sim:pop',                     // { id, enemy, x, y } wave-end pop (no score)
  SIM_SPAWN: 'sim:spawn',                 // { id, enemy, x, y, elite }
  SIM_TELEGRAPH: 'sim:telegraph',         // { enemy, x, y }
  SIM_PICKUP: 'sim:pickup',               // { kind, size?, value?, x, y }
  SIM_LEVEL_UP: 'sim:levelUp',            // { level }
  SIM_LEVEL_UP_OPEN: 'sim:levelUpOpen',   // { level, choices }
  SIM_CARD: 'sim:card',                   // { kind, key, level, rare }
  SIM_REROLL: 'sim:reroll',               // { left }
  SIM_PLAYER_HURT: 'sim:playerHurt',      // { dmg, hp, x, y, from }
  SIM_PLAYER_DEATH: 'sim:playerDeath',    // { x, y, wave }
  SIM_DASH: 'sim:dash',                   // { x, y, dx, dy }
  SIM_WAVE_START: 'sim:waveStart',        // { wave, length, boss }
  SIM_WAVE_END: 'sim:waveEnd',            // { wave, bonus, heal }
  SIM_GAME_OVER: 'sim:gameOver',          // { wave, level, score, kills }
  SIM_VICTORY: 'sim:victory',             // { wave, score }

  // Menus
  MENU_MOVE: 'menu:move',
  MENU_SELECT: 'menu:select',             // { action } (action 'denied': locked weapon / locked Endless / failed Kennel buy)
  MENU_BACK: 'menu:back',

  // Audio
  AUDIO_INIT: 'audio:init',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',       // { wave }
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
  AUDIO_MUTE_CHANGED: 'audio:muteChanged', // { muted }
};

/** sim event type -> bus event name */
export const simEventName = (type) => `sim:${type}`;

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
