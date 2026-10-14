export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_RESTART: 'game:restart',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  LEVEL_START: 'level:start',            // { attempt, startX, levelId }
  LEVEL_COMPLETE: 'level:complete',      // result (ScoreSystem.finalize) + levelId

  // Player
  PLAYER_JUMP: 'player:jump',
  PLAYER_LAND: 'player:land',
  PLAYER_DIED: 'player:died',            // { cause, x, attempt, progress }

  // Abilities (Levels 2-6). Payloads carry { x, y } of Booker's centre unless noted.
  PLAYER_DOUBLE_JUMP: 'player:double_jump',
  PLAYER_GLIDE_START: 'player:glide_start',
  PLAYER_GLIDE_END: 'player:glide_end',
  PLAYER_WALL_CLING: 'player:wall_cling',
  PLAYER_WALL_KICK: 'player:wall_kick',
  PLAYER_POUNCE: 'player:pounce',        // { x, y, enemy }
  PLAYER_DASH: 'player:dash',
  PLAYER_DASH_END: 'player:dash_end',
  BREAKABLE_SMASHED: 'world:breakable_smashed', // { type, x, y }
  ENEMY_STOMPED: 'world:enemy_stomped',  // { type, x, y }
  STEAM_WINDUP: 'world:steam_windup',    // { x } a vent starts its warning puffs
  STEAM_ON: 'world:steam_on',            // { x } a vent starts firing (visible on screen only)

  // Menus and progression (Phase 2 UI/audio hook in here)
  MENU_MOVE: 'menu:move',                // { scene, index }
  MENU_SELECT: 'menu:select',            // { scene, action, levelId? }
  MENU_BACK: 'menu:back',                // { scene }
  MENU_LOCKED: 'menu:locked',            // { levelId } a locked level refused to start
  LEVEL_UNLOCKED: 'level:unlocked',      // { levelId, number, name, ability }
  GAME_OVER_SHOWN: 'game:over_shown',    // { levelId, progress, bestProgress, attempt, cause, isNewBestProgress }
  NEW_BEST_PROGRESS: 'run:new_best_progress', // { levelId, progress }

  // Phase 2 UI (visual moments the audio pass can hook)
  UI_TALLY_TICK: 'ui:tally_tick',        // { row, value, done } level-complete score rows counting up (throttled)
  UI_STAR_POP: 'ui:star_pop',            // { index, earned } a result star pops in (earned = gold)
  UI_NEW_BEST: 'ui:new_best',            // { levelId, kind: 'score'|'stars'|'time' } a new-best callout appears
  UI_UNLOCK_REVEAL: 'ui:unlock_reveal',  // { levelId, ability, where: 'complete'|'select' } unlock animation plays
  UI_ENDING: 'ui:ending',                // { totalScore, totalStars } Level 6 golden steak flourish starts
  ABILITY_INTRO_SHOWN: 'ui:ability_intro',      // { levelId, ability } the new-ability card appears (gameplay waits)
  ABILITY_INTRO_DONE: 'ui:ability_intro_done',  // { levelId, ability, by: 'press'|'auto' } card gone, run starts
  TIP_SHOWN: 'ui:tip_shown',             // { levelId, x, text } a level tip toast appears

  // Run progress
  DISTANCE_CHANGED: 'run:distance',      // { distance, progress }
  SECTION_CHANGED: 'run:section',        // { index, name, speed }
  BONE_COLLECTED: 'run:bone',            // { bones, total, x, y }

  // Score
  SCORE_CHANGED: 'score:changed',        // { score }

  // Particles
  PARTICLES_EMIT: 'particles:emit',

  // Spectacle (visual effects hooks — emit during gameplay, design pass attaches effects)
  SPECTACLE_ENTRANCE: 'spectacle:entrance',
  SPECTACLE_ACTION: 'spectacle:action',
  SPECTACLE_HIT: 'spectacle:hit',
  SPECTACLE_COMBO: 'spectacle:combo',
  SPECTACLE_STREAK: 'spectacle:streak',
  SPECTACLE_NEAR_MISS: 'spectacle:near_miss',

  // Audio (used by /add-audio)
  AUDIO_INIT: 'audio:init',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
  AUDIO_MUTE_CHANGED: 'audio:muteChanged',  // { muted }
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

  removeAll() {
    this.listeners = {};
    return this;
  }
}

export const eventBus = new EventBus();
