// =============================================================================
// Casino.js — the app singletons, wired together once.
//
//   import { wallet, rng, settings } from '../core/Casino.js';
//
//   wallet    the Wallet (events go to the EventBus, every change is saved)
//   rng       the seeded Rng (?seed=N); games use rng.stream('<game>')
//   settings  { muted } (persisted; AudioBridge flips muted)
// =============================================================================

import { Wallet } from './Wallet.js';
import { rng } from './Rng.js';
import { eventBus } from './EventBus.js';
import { loadSave, initSave, writeSave, getSettings, saveSettings, freshRequested } from './Save.js';

const saved = initSave(loadSave());

export const wallet = new Wallet({
  emit: (event, data) => eventBus.emit(event, data),
  persist: (w) => writeSave({ wallet: w.toJSON() }),
  state: saved.wallet || null,
  now: () => Date.now(),
});

// ?fresh=1: overwrite the old save now, so a later reload without the flag
// continues this session instead of resurrecting the old one.
if (freshRequested()) writeSave({ wallet: wallet.toJSON() });

export const settings = {
  get muted() { return !!getSettings().muted; },
  set muted(v) { saveSettings({ muted: !!v }); },
};

export { rng };
