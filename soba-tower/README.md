# Soba Tower

Soba Tower is a pixel-art vertical climber in the style of Doodle Jump. Soba, a
tricolor dog, bounces automatically; you steer her up a noodle-house tower and
ring the bell on the roof.

Level 1, "Noodle House", is 400 m tall and has four zones:

1. Street & Garden: static beams and screen wraps.
2. Balconies: sliders and crumbling planks.
3. Lantern Roofs: springs, crows, and falling roof tiles.
4. The Spire: lifts, wind chimes, and the bell on the roof.

You have 3 lives. Each zone gate is a checkpoint that restores you to at least
1 life. Your score counts height, biscuits, crow stomps, the finish, and time.
The game stores your best height, score, and stars per level in `localStorage`.

The game uses Phaser 4.2.1 and Vite. All sound is procedural Web Audio, with no
audio files.

## Controls

| Action | Keyboard | Touch or mouse |
| --- | --- | --- |
| Steer | Left / Right arrows, or A / D | Hold the left or right half of the screen |
| Start (title) | Any arrow, A, D, Space, or Enter | Tap |
| Retry (results) | Any key except M and Esc | Tap or **RETRY** |
| Back to the title (results) | Esc | None |
| Pause | P or Esc | Pause button in the HUD |
| Mute | M | Speaker button |

The most recent key or finger wins when both sides are held.

## Run the game

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Start the dev server:

   ```sh
   npm run dev
   ```

   The game runs at <http://localhost:3001>. The port is fixed (`strictPort`).

3. **Optional:** To build for production, run `npm run build`. The output goes
   to `dist/`. To serve that build, run `npm run preview`.

## Test and QA commands

Run these from this folder while the dev server is running. Every browser
script uses headless Chromium through Playwright.

| Command | What it checks |
| --- | --- |
| `node scripts/verify-runtime.mjs` | The game boots with no console errors. |
| `node scripts/iterate-client.js --url "http://localhost:3001/?lives=1" --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate` | Scripted input on the fixed-step test clock. Every iteration ends in `game_over` with score 180. |
| `node scripts/autoplay-check.mjs` | The bot climbs to the bell in real time with no lost lives. |
| `node scripts/sim-climb.mjs` | The same bot and rules in Node, with no browser. It also runs a "sloppy" bot that checks the difficulty curve. |
| `node scripts/validate-level.mjs` | Every route step is reachable, hazards leave safe windows, and the zone rules hold. |
| `node scripts/restart-check.mjs` | Retries after the finale and after a game over leave no zoom, time scale, or listener behind. |
| `node scripts/audio-check.mjs` | Gesture unlock, mute, music layers, SFX, and a game with audio blocked. Takes about 4 minutes. |
| `node scripts/validate-architecture.mjs` | Project structure rules. |
| `node scripts/zone-tour.mjs` | Screenshots at chosen heights (`--heights`, `--phone`, `--gpu`). |
| `node scripts/zone-tour.mjs --glitch` | Counts frames where Soba's sprite loses pixels in software WebGL. Fails on any cut frame. |
| `node scripts/zone-tour.mjs --climb` | One screenshot per second of a full bot climb, with a timeline of events. |
| `node scripts/fps-probe.mjs --query "zone=3&autoplay=1&lives=99"` | Average fps, 1% low, long frames, and shader compiles during play (`--gpu`, `--runs`). |
| `node scripts/event-shots.mjs` | Screenshots a set number of frames after a game event, for example `climb:spring+8`. |
| `node scripts/fx-shots.mjs` | Screenshots at set times, including the title (`--title`). |

If a browser script stops with "Target closed", run it again. Something outside
the project occasionally ends headless Chromium.

Screenshots and logs go to `output/`.

## Debug URL flags

Add these to the game URL, for example `http://localhost:3001/?zone=3&autoplay=1`.
None of the debug starts saves a high score.

| Flag | Effect |
| --- | --- |
| `autoplay=1` | The bot steers. Skips the title. |
| `zone=N` | Starts at zone N's checkpoint. Skips the title. |
| `y=PX` | Starts on a cushion at that height in px (16 px = 1 m). Skips the title. |
| `lives=N` | Starting lives, for example `lives=1` for a quick game over or `lives=99`. |
| `debug=1` | Draws hitboxes and platform tops. |
| `gltex=N` | Forces the WebGL texture units per batch. `0` uses all units. |
| `glfix=0` | Turns off the shader fix for the texture-id compare. |
| `glwarm=0` | Turns off the shader warm-up at boot. |

`window.render_game_to_text()` returns the game state as JSON, and
`window.advanceTime(ms)` steps the game in exact 1/60 s frames.

## Art pipeline

The art was generated once with `/image-gen` and then processed into small
pixel-art sprites.

- `art/drafts/` holds the generated drafts and their prompts.
- `art/scripts/build_assets.py` cuts, downscales, and palettizes the drafts
  into `art/out/` with a `manifest.json`. To rebuild, run
  `cd art && python3 scripts/build_assets.py`.
- `public/assets/` holds the copies that the game loads. After a rebuild, copy
  the 20 contract PNGs and `manifest.json` from `art/out/`.
- `art/spend.md` records every generation call and its cost ($0.33 of the $5
  budget).

At load, `src/core/VisualBake.js` derives more textures from these files: zone
facades, rims, recolors, and particles. If a file is missing,
`src/core/Assets.js` draws a placeholder with the same key and size.

## Add Level 2

A level is data. The rules in `src/systems/ClimbSim.js` work for any level.

1. In `src/levels/chunks.js`, add the new chunks. A chunk is a list of
   platforms, hazards, and treats with coordinates relative to the chunk base.
   The helpers at the top of the file (`beam`, `slider`, `crumble`, `spring`,
   `lift`, `crow`, `tile`, `chimes`, `treat`, `treatOff`) document each field.
2. Create `src/levels/level2.js` with the same shape as `level1.js`: `zones`
   (each with `startY`, `endY`, `respawn`, and an ordered `chunks` list),
   `finish`, `spawn`, and `parS`. Use `assemble()` from `level1.js` to stack
   the chunks.
3. Run `node scripts/validate-level.mjs` and `node scripts/sim-climb.mjs`
   against the new level, and tune until both pass.
4. Replace the direct `LEVEL1` imports with a current-level lookup. These
   files import `LEVEL1`: `src/main.js`, `src/core/Debug.js`,
   `src/audio/AudioBridge.js`, `src/scenes/{Preload,Title,Climb,Results}Scene.js`,
   `src/systems/Backdrop.js`, `src/ui/{BestFlag,Hud}.js`, and the scripts
   `sim-climb`, `validate-level`, and `zone-tour`.
5. Add the zone looks for the new zones (`ZONE_LOOK` in
   `src/core/Constants.js`) and their music sections (`src/audio/music.js`).

High scores are already stored per level id (`soba-tower:best:<levelId>`).
`PLAN.md` has the design rules, and `progress.md` has the build notes and
gotchas.
