# Booker's Backyard Brawl

A 2D pixel-art arena survival shooter starring Booker. Booker defends his backyard
from waves of cats, squirrels, crows, raccoons, and skunks, then faces two bosses:
Big Tom (wave 5) and the Robo-Vac 9000 (wave 10). Weapons fire on their own; you
move, dash, collect kibble, and pick one of three upgrade cards at each level-up.
Clearing wave 10 wins the run and unlocks Endless mode. Golden Bones from each run
buy permanent Kennel upgrades.

Phaser 4.2.1 + Vite. Internal resolution 480x270, pixel art, scaled to fit.
The game logic is a pure-JS fixed-step sim (`src/sim/`) that runs the same in the
browser and in node. Design numbers live in `PLAN.md`; build notes in `progress.md`.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | WASD or arrow keys | Drag anywhere on the left 70 % of the screen (floating joystick) |
| Dash (0.18 s, invulnerable) | Space or Shift | Dash button (bottom right), or tap with a second finger |
| Pick a level-up card | 1 / 2 / 3, or arrows + Enter | Tap a card |
| Reroll the cards | R | REROLL button |
| Pause / resume | Esc or P | Pause button (top right, under the speaker) |
| Mute | M | Speaker button (top right) |
| Menus | Arrows / WASD + Enter, Esc = back | Tap |
| Replay from Results | Space (instant), Enter = focused button | PLAY AGAIN |

Mouse works everywhere a tap does.

## Run and build

```sh
npm install
npm run dev        # http://localhost:3002 (strict port; hot reload reloads the page)
npm run build      # dist/ with relative paths (vite base './')
npx vite preview --port 3012 --strictPort   # serve dist/
```

## Debug URL flags

Any flag makes the run a debug run: nothing is written to the save.

| Flag | Effect |
|---|---|
| `?seed=N` | Fixed RNG seed (same input, same run) |
| `?wave=N` | Start at wave N (1-10); skips the title |
| `?god=1` | Booker takes no damage |
| `?hp=N` | Starting max HP |
| `?autoplay=1` | A bot plays (and picks cards); skips the title. `&bot=idle\|kite\|smart` (default smart) |
| `?speed=N` | QA: N fixed sim steps per 1/60 s of real time (1-16); outcomes don't change |
| `?weapons=a,b` | Starting weapons (`bark, ball, bone, frisbee, squeak, zoomies`) |
| `?debug=1` | Draw hit circles, pickup radius and the fence |

Test hooks: `window.render_game_to_text()` (JSON game state) and
`window.advanceTime(ms)` (deterministic test clock, 1/60 s frames).

## QA scripts (run from this folder with the dev server up)

| Command | What it checks |
|---|---|
| `node scripts/verify-runtime.mjs [--url U]` | Boots without errors, failed requests or placeholder art |
| `npm run iterate` | Scripted play (iterate-client) to game over, screenshots in `output/iterate` |
| `node scripts/validate-architecture.mjs` | Sim has no Phaser/DOM imports, constants centralized, etc. |
| `node scripts/ui-flow-check.mjs` | Every menu path with keyboard, mouse and touch; save writes |
| `node scripts/save-check.mjs` | Save repair, persistence, unlock rules, Golden Bones formula |
| `node scripts/audio-check.mjs` | Music/SFX mapping, ducking, mute, voice caps, mix levels |
| `node scripts/step2a-shots.mjs`, `node scripts/fx-shots.mjs`, `node scripts/menu-shots.mjs` | Screenshot sets in `output/` |
| `node scripts/perf-check.mjs` | Real-time frame cost in a crowded arena |
| `node scripts/realtime-check.mjs` | Real-time browser runs (incl. CPU throttle + long-task hitches) end exactly like `sim-run` |
| `node scripts/touch-check.mjs` | Phone landscape + portrait, taps and drags only, screenshots in `output/touch` |
| `node scripts/soak-check.mjs` | 3 runs in one page + Endless into wave 12: no growth in objects, tweens, timers, listeners, heap |
| `node scripts/playthrough-check.mjs` | Keyboard-only session over ~2 waves, screenshots in `output/playthrough` |
| `node scripts/sim-run.mjs --bot idle\|kite\|smart --seeds 40 --seed-base 1000` | Headless balance (gates: idle dies in waves 1-3; kite median death 5-8, at most 30 % wins; smart at least 60 % wins) |

Browser scripts launch Chromium through `scripts/lib/browser.mjs` (a launchd job on
this Mac kills other Playwright browsers).

## Art budget

All sprites, the arena and the title card were generated with image-gen:
$0.33 of the $10 cap (12 calls; log in `art/spend.md`). Rebuild the finals with
`cd art && python3 scripts/build_assets.py`. Effects, UI panels and the HUD are
code-drawn; all audio is synthesized with Web Audio (`src/audio/`).
