// =============================================================================
// Save.js — localStorage persistence. Every storage call is wrapped in
// try/catch (private windows, blocked storage, quota): the game always runs,
// it just forgets.
//
// Shape: { version, savedAt, wallet: Wallet#toJSON(), settings: { muted } }
// ?fresh=1 ignores whatever is saved at boot (later saves still write).
// =============================================================================

import { SAVE } from './Constants.js';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function freshRequested() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('fresh') === '1';
  } catch {
    return false;
  }
}

/** The saved object, or null (none, corrupt, wrong version, or ?fresh=1). */
export function loadSave({ ignoreFresh = false } = {}) {
  if (!ignoreFresh && freshRequested()) return null;
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SAVE.KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== SAVE.VERSION) return migrate(data);
    return data;
  } catch (err) {
    console.warn('[save] unreadable save ignored:', err?.message || err);
    return null;
  }
}

function migrate(data) {
  // Only v1 exists. Anything else: keep what looks usable.
  if (data && data.wallet) return { ...data, version: SAVE.VERSION };
  return null;
}

let current = { version: SAVE.VERSION, wallet: null, settings: { muted: false } };

/** Seed the in-memory save from what was loaded (main.js does this at boot). */
export function initSave(data) {
  if (data) current = { ...current, ...data, settings: { ...current.settings, ...(data.settings || {}) } };
  return current;
}

/** Merge a patch into the save and write it. Returns true on success. */
export function writeSave(patch = {}) {
  current = {
    ...current,
    ...patch,
    settings: { ...current.settings, ...(patch.settings || {}) },
    version: SAVE.VERSION,
    savedAt: Date.now(),
  };
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(SAVE.KEY, JSON.stringify(current));
    return true;
  } catch (err) {
    console.warn('[save] write failed:', err?.message || err);
    return false;
  }
}

export function clearSave() {
  current = { version: SAVE.VERSION, wallet: null, settings: { muted: current.settings.muted } };
  const ls = storage();
  if (!ls) return false;
  try {
    ls.removeItem(SAVE.KEY);
    return true;
  } catch {
    return false;
  }
}

export function getSettings() {
  return { ...current.settings };
}

export function saveSettings(settings) {
  return writeSave({ settings });
}
