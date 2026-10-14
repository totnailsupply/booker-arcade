export const Events = {
  // Game lifecycle (scenes)
  GAME_START: 'game:start',               // { level, seed, startWave }
  GAME_RESTART: 'game:restart',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_OVER: 'game:over',                 // { result }  (lost)
  LEVEL_COMPLETE: 'level:complete',       // { result }  (won)

  // UI (BattleScene)
  CARD_SELECT: 'ui:card_select',          // { key | null }
  CURSOR_MOVE: 'ui:cursor_move',          // { row, col }
  TOOL_SELECT: 'ui:tool_select',          // { tool: 'upgrade' | 'recall' | null }

  // Sim events, forwarded 1:1 from Battle.drainEvents() (payloads in src/sim)
  SIM_PLACE: 'sim:place',
  SIM_PLACE_FAIL: 'sim:place_fail',
  SIM_SHOOT: 'sim:shoot',
  SIM_HIT: 'sim:hit',
  SIM_KILL: 'sim:kill',
  SIM_BITE: 'sim:bite',
  SIM_UNIT_LOST: 'sim:unit_lost',
  SIM_SPAWN: 'sim:spawn',
  SIM_COIN_DROP: 'sim:coin_drop',
  SIM_COIN_COLLECT: 'sim:coin_collect',
  SIM_COIN_EXPIRE: 'sim:coin_expire',
  SIM_WAVE_START: 'sim:wave_start',
  SIM_HUGE_WAVE: 'sim:huge_wave',
  SIM_PUSH: 'sim:push',
  SIM_CARD_UNLOCK: 'sim:card_unlock',
  SIM_SCOOTER: 'sim:scooter',
  SIM_SCOOTER_GONE: 'sim:scooter_gone',
  SIM_HOUSE_HIT: 'sim:house_hit',
  SIM_WIN: 'sim:win',
  SIM_LOSE: 'sim:lose',
  SIM_ENTER: 'sim:enter',                 // an enemy steps into the garden
  SIM_LID_OFF: 'sim:lid_off',             // { enemy, row, x, cause: 'bark' | 'broken' }
  SIM_HOP: 'sim:hop',                     // a crow hops a defender { enemy, unit, row, from, to }
  SIM_EMBER: 'sim:ember',                 // Chili Lantern burst
  SIM_SOBA_MOVE: 'sim:soba_move',         // { from, to }
  SIM_BARK: 'sim:bark',                   // { row, x, toX, stunned, lids }
  SIM_ZOOMIES: 'sim:zoomies',             // { row }
  SIM_ZOOMIES_END: 'sim:zoomies_end',     // { row, hits }
  SIM_ZOOMIES_READY: 'sim:zoomies_ready',
  SIM_ABILITY_FAIL: 'sim:ability_fail',   // { ability, reason }
  SIM_FETCH: 'sim:fetch',                 // a coin starts flying to Soba { coin, row }
  SIM_UPGRADE: 'sim:upgrade',             // { unit, key, row, col, cost, coins }
  SIM_UPGRADE_FAIL: 'sim:upgrade_fail',   // { reason }
  SIM_RECALL: 'sim:recall',               // { unit, key, row, col, refund, coins }
  SIM_RECALL_FAIL: 'sim:recall_fail',
  SIM_HINT: 'sim:hint',                   // { id, text } once per battle

  // Audio (Step 3 wires src/audio to these)
  AUDIO_INIT: 'audio:init',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
  AUDIO_TOGGLE_MUTE: 'audio:toggle_mute',
  AUDIO_MUTE_CHANGED: 'audio:mute_changed', // { muted }

  // UI sounds (Step 3b): emitted where they happen, heard by src/audio/AudioBridge.js
  UI_PRESS: 'ui:press',                   // { label } any createButton press (mouse, touch or Enter)
  UI_MENU_MOVE: 'ui:menu_move',           // { to } MenuNav focus moved (keys or hover)
  UI_MENU_BACK: 'ui:menu_back',           // Esc / Backspace on a menu
  UI_SHOP: 'ui:shop',                     // { key, ok, reason } Treat Shop buy result
};

// Battle event type -> EventBus event name
export const SIM_EVENTS = {
  place: Events.SIM_PLACE,
  placeFail: Events.SIM_PLACE_FAIL,
  shoot: Events.SIM_SHOOT,
  hit: Events.SIM_HIT,
  kill: Events.SIM_KILL,
  bite: Events.SIM_BITE,
  unitLost: Events.SIM_UNIT_LOST,
  spawn: Events.SIM_SPAWN,
  coinDrop: Events.SIM_COIN_DROP,
  coinCollect: Events.SIM_COIN_COLLECT,
  coinExpire: Events.SIM_COIN_EXPIRE,
  waveStart: Events.SIM_WAVE_START,
  hugeWave: Events.SIM_HUGE_WAVE,
  push: Events.SIM_PUSH,
  cardUnlock: Events.SIM_CARD_UNLOCK,
  scooter: Events.SIM_SCOOTER,
  scooterGone: Events.SIM_SCOOTER_GONE,
  houseHit: Events.SIM_HOUSE_HIT,
  win: Events.SIM_WIN,
  lose: Events.SIM_LOSE,
  enter: Events.SIM_ENTER,
  lidOff: Events.SIM_LID_OFF,
  hop: Events.SIM_HOP,
  ember: Events.SIM_EMBER,
  sobaMove: Events.SIM_SOBA_MOVE,
  bark: Events.SIM_BARK,
  zoomies: Events.SIM_ZOOMIES,
  zoomiesEnd: Events.SIM_ZOOMIES_END,
  zoomiesReady: Events.SIM_ZOOMIES_READY,
  abilityFail: Events.SIM_ABILITY_FAIL,
  fetch: Events.SIM_FETCH,
  upgrade: Events.SIM_UPGRADE,
  upgradeFail: Events.SIM_UPGRADE_FAIL,
  recall: Events.SIM_RECALL,
  recallFail: Events.SIM_RECALL_FAIL,
  hint: Events.SIM_HINT,
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
