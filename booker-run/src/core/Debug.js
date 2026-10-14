// Dev-only URL flags.
//   ?level=N | levelN    start that level directly (skips the menus). ?level=test = sandbox
//   ?room=name           sandbox room (with ?level=test): see src/levels/sandbox.js
//   ?unlock=all          every level selectable (not saved)
//   ?abilities=a,b       override the level's abilities (double,glide,wallkick,pounce,dash | none | all)
//   ?autoplay=1          the bot plays (skips the menus unless ?menus=1)
//   ?menus=1             with ?autoplay=1: keep title -> level select; the bot plays each level started
//   ?botjitter=ms        random +/- ms offset on every bot press and release (robustness checks)
//   ?seed=n              RNG seed for ?botjitter (default 1)
//   ?det=1               deterministic: once a run starts the real-time loop sleeps and the game
//                        advances only through window.advanceTime(ms), in fixed 1/60 s steps
//   ?start=section3      start at the beginning of section 1-4
//   ?x=8000              start at a world x position
//   ?debug=1             draw Arcade physics bodies (hitbox check)
// ?level, ?autoplay (without ?menus), ?start and ?x skip the title screen.

let cached = null;

function flag(params, name) {
  const v = params.get(name);
  return v === '1' || v === 'true' || v === 'yes';
}

export function getDebugOptions() {
  if (cached) return cached;
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = new URLSearchParams();
  }

  const autoplay = flag(params, 'autoplay');
  const menus = flag(params, 'menus');

  let level = null;
  const lv = params.get('level');
  if (lv) {
    const s = lv.trim().toLowerCase();
    if (/^\d+$/.test(s)) level = `level${parseInt(s, 10)}`;
    else if (/^level\d+$/.test(s)) level = s;
    else if (s === 'test' || s === 'sandbox') level = 'test';
  }

  let startSection = null;
  const start = params.get('start');
  if (start) {
    const m = /^section(\d+)$/i.exec(start) || /^(\d+)$/.exec(start);
    if (m) startSection = Math.max(0, parseInt(m[1], 10) - 1);
  }
  const xNum = parseFloat(params.get('x'));
  const startX = Number.isFinite(xNum) ? xNum : null;

  const jitter = parseFloat(params.get('botjitter'));
  const seed = parseInt(params.get('seed'), 10);
  const abilities = params.has('abilities') ? params.get('abilities') : null;

  cached = {
    autoplay,
    menus,
    level,
    room: params.get('room') || null,
    unlockAll: (params.get('unlock') || '').toLowerCase() === 'all',
    abilities,                       // raw string; parsed by parseAbilityList()
    botJitterMs: Number.isFinite(jitter) && jitter > 0 ? jitter : 0,
    seed: Number.isFinite(seed) ? seed : 1,
    det: flag(params, 'det'),
    physicsDebug: flag(params, 'debug'),
    startSection,
    startX,
    skipTitle: (autoplay && !menus) || level !== null || startSection !== null || startX !== null,
  };
  return cached;
}

/**
 * Start x for a level from ?start= / ?x= (null = the level's own start).
 * RunScene then moves it out of walls, pits and hazards (LevelModel.safeSpawnX).
 */
export function resolveStartX(level, debug = getDebugOptions()) {
  let x = null;
  if (debug.startSection !== null && level.sections?.length) {
    // Section startX is an absolute world x (docs/level-format.md)
    const idx = Math.min(level.sections.length - 1, debug.startSection);
    x = Math.max(level.startX, level.sections[idx].startX);
  }
  if (debug.startX !== null) x = Math.max(level.startX, Math.min(debug.startX, level.finishX - 50));
  return x;
}
