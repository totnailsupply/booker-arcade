# Integration QA to-do (orchestrator)

Items collected from Phase 2 reports to check in the final integration pass. Each ticked item has a one-line outcome.

- [x] Far-layer sun or moon splitting across the screen edges with the default far parallax (Level 3 report). Check each level's far layer at the start and the end of the level, Level 1 included.
  - Outcome: L1, L2, L4 and L6 split (L1 x 11140–14260, L2 13250, L4 8630–9550, L6 18830–20460); L3 was already fixed (0.0057); L5 has no disc. New far factors keep each disc whole and 25 px from the left edge at the finish: L1 0.0162 (registry), L2 0.0153, L4 0.0108, L6 0.0139. Shots: `output/far-layer/{before,after}/montage.png`.
- [x] Vents over chasms look like they float (sent to the FX agent).
  - Outcome: the FX agent added a pipe under every vent over a pit (`FXT.PIPE`, fx-notes); no further change.
- [x] An air press while gliding spends the double jump first (Level 3 report). Working as designed. Check that tips don't promise "press again to keep gliding".
  - Outcome: no level tip, death tip or ability hint says that; no change.
- [x] BotPilot planning cost: about 150 ms per call in a real-time `?autoplay=1` run. Bot only; check realtime autoplay still finishes.
  - Outcome: `realtime-check` (60 and 120 Hz, hitches, 4 workers) finishes every level (see the final suite).
- [x] Re-run every level's autoplay and jitter checks after the final BotPilot change (Level 2 and Level 3 were validated before the hardEnd fix).
  - Outcome: re-run after all integration fixes (final suite).
- [x] Soft ceiling (CEILING_Y 26) clips high double jumps. Documented; review level screenshots for odd clipped arcs.
  - Outcome: 9 ceiling contacts in the bot runs (L3 2, L4 3, L6 4, none in L2 and L5); each is a short apex just under the HUD with no visible bump (`output/ceiling/montage.png`). No change.
- [x] Merge per-agent notes (docs/levels/*.md, docs/ui-notes.md, docs/audio-notes.md, docs/fx-notes.md) into progress.md.
  - Outcome: progress.md has a "Levels 2–6 — final state" section that summarizes and links to each note.
- [x] Touch path on level select (first tap focuses, second tap plays) has no automated check. Add a Playwright run with `hasTouch: true` and tap events.
  - Outcome: `scripts/touch-check.mjs` (real touch events) covers the title, level select (focus then play, no carried-over arm, a card mid-reveal), the ability card, a jump tap, HUD mute and pause taps (no jump), every pause action, game over, results (LEVELS, NEXT) and the L6 ending.
- [x] Audio-check "market loudness within 3 dB of the yard" failure seen by the UI agent (audio agent's area; confirm it's fixed).
  - Outcome: confirmed in the final `audio-check` run.
- [x] Review UI agent's edits outside its area: RunScene intro gate and tips, GameState MODES.INTRO, main.js render_game_to_text, validate-architecture.mjs (accepts BitmapText, scans src/ui).
  - Outcome: correct, with one gap fixed: a window blur or hidden tab while the ability card was up was ignored (pause needs PLAYING), so the run started unattended; it now pauses as soon as the card closes. Esc still only dismisses the card. MODES.INTRO, the render_game_to_text additions and the validator changes are fine.
- [x] Debug starts (`?x=`, `?start=`) can spawn Booker inside a wall's footprint (Level 6 report). Debug only; consider snapping the spawn to just before the wall.
  - Outcome: `LevelModel.safeSpawnX` moves a debug start left out of walls, pits, static hazards, obstacles and breakables, keeping 40 px of run-up (`PLAYER.SPAWN_CLEAR`).
- [x] `level-shots.mjs` default of 12 shots covers only 30 s; consider a default that spans the whole level. Clear stale frames per run.
  - Outcome: the default count now reaches the finish (par + 10 s), old shots are deleted first, and it writes the `contact.png` sheet its header promised.
- [x] Vent art: L6 uses the rooftop vent over ember pits (sent to the FX agent).
  - Outcome: the FX agent themed L6 updrafts (copper vent, warm air, embers: `FX.UPDRAFT_THEMES`); no further change.
- [x] **HIGH: real-time fidelity.** FX agent saw the real-time bot sometimes die on L6 while deterministic runs pass. Find out whether it's planner hitches (bot-only) or frame-rate-dependent gameplay. Gameplay must match the deterministic tuning at 60 Hz and at 120 Hz (ProMotion displays) and under frame drops. Test with forced loop rates.
  - Outcome: fixed before this pass (fixed-tick RunScene loop); `realtime-check` still matches deterministic mode after every change here (final suite).
- [x] `?start=sectionN` adds level.startX to an absolute section startX, so debug starts land 100 px into the section (Level 5 report). Fix in Debug/RunScene.
  - Outcome: `resolveStartX` uses the section's absolute `startX`; the registry comment that called it relative is corrected.
- [x] Low drones (y ≤ 50) in front of the L5 background's orange crates are less readable. Check screenshots; consider a 1 px dark outline (FX added a ground shadow already).
  - Outcome: weak at x 2275 and 7150 (orange body on orange fruit crates). Every drone now has a 1 px dark outline sprite behind it (`outlineSheet`, `FX.DRONE_OUTLINE_*`), visual only. Shots: `output/l5-drones/{before,after}/montage.png`.
- [x] Bone graze nondeterminism (bob keeps running through hit-stop) affects offline tools only. Note in docs.
  - Outcome: noted in docs/level-format.md, "Bot caveats".
- [x] Bot rushes narrow steam gaps (takes the earliest working kick) — bot-only; L4 designed around it. Note in docs.
  - Outcome: noted in docs/level-format.md, "Bot caveats" (with the 3-presses-ahead limit).
