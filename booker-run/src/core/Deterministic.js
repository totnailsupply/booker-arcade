// =============================================================================
// Deterministic mode (?det=1). Used by the QA scripts so results don't depend
// on machine load.
//
// When a run starts (RunScene.create), the real-time loop is put to sleep and
// the game only advances when something calls window.advanceTime(ms): that runs
// round(ms / 16.667) fixed steps of exactly 1/60 s through Phaser's own
// game.step(time, delta) (headless steps, with a real render on the last one so
// screenshots are current). Date.now() is replaced by a virtual clock that
// advances with the steps, because Phaser's TweenManager times tweens with
// Date.now() (bone bob, death tumble, slow-mo); everything else already uses
// the step delta. Arcade's fixed 60 Hz world then steps exactly once per frame.
//
// window.__DET__ = { enabled, frames, step(n), advance(ms) } for scripts.
// =============================================================================

export const FRAME_MS = 1000 / 60;

const state = {
  enabled: false,
  frames: 0,
  vt: 0,          // virtual game time (ms)
  dateOffset: 0,  // Date.now() = vt + dateOffset
  game: null,
};

const realDateNow = Date.now.bind(Date);

export function isDeterministic() {
  return state.enabled;
}

/** Steps the game n fixed frames. Renders only the last one. */
export function stepFrames(n) {
  const game = state.game;
  if (!game || !state.enabled) return 0;
  const loop = game.loop;
  for (let i = 0; i < n; i++) {
    state.vt += FRAME_MS;
    state.frames += 1;
    loop.now = state.vt;
    loop.time = state.vt;
    loop.delta = FRAME_MS;
    loop.rawDelta = FRAME_MS;
    loop.frame += 1;
    if (i === n - 1) game.step(state.vt, FRAME_MS);
    else game.headlessStep(state.vt, FRAME_MS);
  }
  return n;
}

export function enableDeterministic(game) {
  if (state.enabled) return;
  state.enabled = true;
  state.game = game;
  state.vt = game.loop.now || performance.now();
  state.dateOffset = realDateNow() - state.vt;
  Date.now = () => state.vt + state.dateOffset;
  game.loop.sleep();

  window.advanceTime = (ms) => {
    const n = Math.max(1, Math.round((ms || FRAME_MS) / FRAME_MS));
    stepFrames(n);
    return Promise.resolve();
  };
  window.__DET__ = {
    get enabled() { return state.enabled; },
    get frames() { return state.frames; },
    step: (n = 1) => stepFrames(n),
    advance: (ms) => window.advanceTime(ms),
  };
}
