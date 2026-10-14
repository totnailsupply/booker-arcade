# Soba Guard

Soba Guard is a pixel-art lane-defense game. Soba, the tricolor dog from
Soba Tower, guards the back garden of her family's noodle house. Hungry
critters come up the alley. You place kitchen-crew defenders on a 9x5 garden
grid, collect coins, and use Soba's own abilities from the porch.

Level 1, "Back Garden", has 10 waves with big waves at 5 and 10. Clearing it
unlocks the Chili Lantern for Level 2. Levels 2 to 5 show as "Coming soon" on
the level map until their data exists.

The game uses Phaser 4.2.1 and Vite. All sound is procedural Web Audio.

## Run the game

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Start the dev server:

   ```sh
   npm run dev
   ```

   The game runs at <http://localhost:3003>. Hot reload is off, so refresh
   the browser after an edit.

3. **Optional:** To build for production, run `npm run build`. The output goes
   to `dist/`.

## How to play

- **Lucky Cat** (50 coins) drops a coin every 14 s. Build cats early.
- **Dumpling Steamer** (100) shoots dumplings down its row.
- **Onigiri Wall** (50) blocks critters for a long time. It joins after wave 3.
- **Alley Rat** walks and bites. **Pot-Lid Rat** blocks dumplings with its lid
  until Soba barks it off. **Crow** hops over the first defender it meets.
- **Soba** stands on the porch. She fetches coins in her row, **Bark** stuns
  her row and knocks lids off, and **Zoomies** (charged by 12 kills) dashes
  down her row.
- An enemy that reaches the porch sets off that row's Delivery Scooter, which
  clears the row once. The next one in that row gets into the house.
- Each defender can be upgraded once in a battle. Recall refunds half of what
  you paid.
- Stars: clear the level, use no scooter, lose no defender. Each new star pays
  5 Golden Bones, which buy permanent upgrades in the Treat Shop.

## Controls

| Action | Mouse or touch | Keyboard |
| --- | --- | --- |
| Choose a card | Click or tap the card | 1 to 3 |
| Place a defender | Click or tap a tile | Arrows or WASD move the cursor, Space or Enter places |
| Collect a coin | Click or tap it | Move the cursor over it |
| Move Soba | Tap a porch cell | F moves Soba to the cursor's row |
| Bark / Zoomies | Bottom-bar buttons | B / Z |
| Upgrade / Recall | **UPGRADE** / **RECALL**, then a defender | U / X, then Space |
| Cancel | Tap the selected card again, or right-click | Esc |
| Pause | Pause button | P or Esc |
| Mute | Speaker button | M |

## Test and QA commands

Run these from this folder while the dev server is running. Browser scripts
use headless Chromium through `scripts/lib/browser.mjs`.

| Command | What it checks |
| --- | --- |
| `npm run build` | The production build succeeds. |
| `node scripts/verify-runtime.mjs` | The game boots with no console errors. |
| `node scripts/validate-architecture.mjs` | Project structure rules, sim purity, and no magic numbers. |
| `npm run iterate` | Scripted keyboard input on the fixed-step test clock. Each of 3 iterations ends in `game_over` with score 255. |
| `node scripts/sim-level.mjs --level 1 --bot all --seeds 20` | Headless balance gates for 6 bots (idle, steamers, cats-steamers, novice, novice-skip, smart). |
| `node scripts/ability-check.mjs` | Bark, Zoomies, Soba movement, Upgrade, and Recall. |
| `node scripts/ui-flow-check.mjs` | Menus, pause, results, Treat Shop, and modifiers with keyboard, mouse, and touch. |
| `node scripts/save-check.mjs` | Save persistence, blocked storage, corrupt saves, and debug runs that never write. |
| `node scripts/audio-check.mjs` | Gesture unlock, mute, music layers, retries, and blocked audio. Takes about 4 minutes. |
| `node scripts/fps-probe.mjs` | Frame pacing of a real-time autoplay battle. |
| `node scripts/fx-shots.mjs --prefix X [--only bark,win]` | Screenshots of effects on the test clock. |

## Debug URL flags

Debug starts never write to the save.

| Flag | Effect |
| --- | --- |
| `skip=1` | Skips the menus and starts the battle. |
| `level=N` | Starts level N. |
| `wave=N` | Starts at wave N. |
| `coins=N` | Starting coins. |
| `seed=N` | RNG seed. Debug starts use seed 20261014 by default. |
| `god=1` | You can't lose. |
| `autoplay=1` | A bot plays (`bot=idle`, `steamers`, `cats-steamers`, `novice`, or `smart`; default `smart`). |
| `debug=1` | Draws the grid and hitboxes. |
| `reset=1` | Wipes the save. |
| `test=1` | Adds `window.__TEST_FINISH__(won, stars)` for menu tests. |

`window.render_game_to_text()` returns the game state as JSON, and
`window.advanceTime(ms)` steps the game in exact 1/60 s frames.

## Art pipeline

The art was generated with `/image-gen` and processed into pixel-art sheets
($0.34 of the $10 budget; every call is in `art/spend.md`).

- `art/drafts/` holds the drafts and their prompts. The sheets already include
  the Chili Lantern, Tanuki, and Fox for later levels.
- `cd art && python3 scripts/build_assets.py` rebuilds `art/out/`.
- After a rebuild, copy the PNGs (not `preview.png` or `mock.png`) and
  `manifest.json` from `art/out/` to `public/assets/`.
- If a file is missing, `src/core/Assets.js` draws a placeholder with the same
  key and size.

## Add Level 2

All game rules are in `src/sim/`, and a level is data.

1. Create `src/data/levels/level2.js` with the same shape as `level1.js`. The
   comment at the top of `level1.js` documents every field. Put `chili` in
   `cards`, because the menus don't pass cards to the battle.
2. Add the level to `LEVELS` in `src/data/levels/index.js`. The level map
   makes the node playable once Level 1 is cleared.
3. If the level uses the Tanuki (`stone`) or the Fox (`lane`), implement those
   mechanics in `src/sim/Enemies.js`. They're in `src/data/enemies.js` as data
   only.
4. Give the Chili Lantern an ember effect in `src/fx/Effects.js`. Its sim
   behavior already works.
5. Run `node scripts/sim-level.mjs --level 2 --bot all --seeds 20` and tune
   until the balance gates pass.

`PLAN.md` has the design, and `progress.md` has the build notes, balance
changes, and gotchas.
