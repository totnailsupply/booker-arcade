// =============================================================================
// EventBus.js — the app-wide event channel (pure JS, node-importable).
//
// Inside a Phaser scene, ALWAYS subscribe with
//     listen(this, Events.BALANCE_CHANGED, (d) => ...)
// (or eventBus.on + eventBus.off in a 'shutdown' handler). listen() removes
// the listener when the scene shuts down, so 50 lobby <-> game switches leave
// the listener counts flat (render_game_to_text().listeners shows them).
// =============================================================================

export const Events = {
  // Wallet (emitted by Wallet.js)
  BALANCE_CHANGED: 'wallet:balance',     // { balance, delta, reason: 'bet'|'pay'|'refund'|'bonus'|'bailout'|'daily'|'gift'|'debug'|'reset', game }
  ROUND_SETTLED: 'wallet:round',         // { game, wagered, paid, net, outcome: 'win'|'lose'|'push', streak, balance }
  BIG_WIN: 'wallet:bigWin',              // { game, wagered, paid, x }  paid >= 10x wagered
  VIP_UP: 'wallet:vipUp',                // { tier, name, gift, maxBet }
  BAILOUT: 'wallet:bailout',             // { amount, balance, count }
  DAILY_CLAIMED: 'wallet:daily',         // { amount, balance, date }
  XP_CHANGED: 'wallet:xp',               // { xp, tier, progress }
  WALLET_RESET: 'wallet:reset',          // {}

  // Navigation
  SCENE_CHANGED: 'scene:changed',        // { key, from }
  GAME_ENTER: 'game:enter',              // { game }
  GAME_LEAVE: 'game:leave',              // { game }
  STATS_OPEN: 'ui:statsOpen',
  STATS_CLOSE: 'ui:statsClose',

  // UI
  TOAST: 'ui:toast',                     // { text, kind?: 'info'|'warn'|'error', ms? }
  CHIP_SELECTED: 'ui:chip',              // { value }
  BANNER_SHOW: 'ui:banner',              // { tier: 'win'|'big'|'mega', amount }

  // Audio
  AUDIO_INIT: 'audio:init',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
  AUDIO_MUTE_CHANGED: 'audio:muteChanged',   // { muted }
  MUSIC_PLAY: 'music:play',              // { track: 'lobby'|'plinko'|'blackjack'|'craps'|'roulette'|'slots' }
  MUSIC_STOP: 'music:stop',
  MUSIC_DUCK: 'music:duck',              // { db?, holdS?, releaseS? }
};

export class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!event) throw new Error('EventBus.on: unknown event (typo in Events.*?)');
    (this.listeners[event] ||= []).push(callback);
    return this;
  }

  once(event, callback) {
    const wrap = (d) => {
      this.off(event, wrap);
      callback(d);
    };
    return this.on(event, wrap);
  }

  off(event, callback) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  emit(event, data) {
    const list = this.listeners[event];
    if (!list || !list.length) return this;
    // Copy so a listener can unsubscribe during emit
    for (const cb of [...list]) {
      try {
        cb(data);
      } catch (err) {
        console.error(`EventBus error in ${event}:`, err);
      }
    }
    return this;
  }

  /** Listener count per event (render_game_to_text uses it to spot leaks). */
  counts() {
    const out = {};
    for (const [k, v] of Object.entries(this.listeners)) if (v.length) out[k] = v.length;
    return out;
  }

  total() {
    return Object.values(this.listeners).reduce((n, v) => n + v.length, 0);
  }

  removeAll() {
    this.listeners = {};
    return this;
  }
}

export const eventBus = new EventBus();

/**
 * Subscribe for the lifetime of a Phaser scene or game object. Returns an
 * unsubscribe function.
 *   listen(scene, ...)       removed on the scene's 'shutdown' (or 'destroy')
 *   listen(gameObject, ...)  removed when the object is destroyed (scene
 *                            shutdown destroys every display object too)
 */
export function listen(owner, event, callback) {
  eventBus.on(event, callback);
  let done = false;
  const isScene = !!(owner && owner.sys && owner.events);
  const ev = isScene ? owner.events : (owner && typeof owner.once === 'function' ? owner : null);
  const names = isScene ? ['shutdown', 'destroy'] : ['destroy'];
  const off = () => {
    if (done) return;
    done = true;
    eventBus.off(event, callback);
    if (ev) for (const n of names) ev.off(n, off);
  };
  if (ev) for (const n of names) ev.once(n, off);
  return off;
}
