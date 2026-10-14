# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

booker_arcade is for building 2D arcade games, mainly platformers, that star Booker, the mascot from the `tot-hq` repo. The aim is to build each game in as few passes as possible. The first game is `booker-run/` (Phaser 4.2.1, Vite). Run these from that folder:

- Dev server: `npm run dev` (http://localhost:3000). Hot reload is off; refresh the browser after an edit.
- Build: `npm run build`
- Quick check: `node scripts/iterate-client.js --url http://localhost:3000 --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate`
- Beatability: `node scripts/autoplay-check.mjs --level N` (bot plays level N to the finish with fixed 1/60 s steps); add `--jitter 35 --seeds 5` for input-timing robustness.
- Other checks: `ability-check.mjs`, `ui-flow-check.mjs`, `touch-check.mjs`, `campaign-check.mjs`, `save-check.mjs`, `finish-check.mjs`, `audio-check.mjs`, `verify-runtime.mjs`, and `realtime-check.mjs --levels 1,2,3,4,5,6 --rates 60,120 --hitch-seeds 1 --workers 4` (real-time play must match the fixed-step runs). All are in `scripts/`.
- Screenshots: `node scripts/level-shots.mjs --level N [--debug]`, `node scripts/ui-shots.mjs`.
- Levels 2–6: the format and design rules are in `booker-run/docs/level-format.md`, and the current state and decisions are in `booker-run/progress.md`. Browser scripts must launch through `scripts/lib/browser.mjs`, because a launchd job on this Mac kills other Playwright browsers.

## Engine and skills

- Default to **Phaser 4** (4.2.x). The user-level `phaser` skill covers Phaser 4. Read its `v4-new-features` topic before you write Phaser code, because most Phaser code from memory is Phaser 3.
- The `game-creator` plugin (`game-creator:*` skills and agents) generates **Phaser 3** code (`^3.90`). Its pipeline and QA patterns are useful. Before you use its scaffolds or templates, state the Phaser version, or port its output to Phaser 4.
- Don't run `game-creator:viral-game` or `game-creator:monetize-game` unless the user asks. They deploy to here.now and register the game on Play.fun. Use `game-creator:quick-game` or `game-creator:make-game` to build a game.
- `skills-lock.json` pins the project skills in `.claude/skills/`: `platformer`, `phaser-arcade-physics`, `camera-systems`, `input-systems`, and `prototype-fast`. These come from `gamedev-skills/awesome-gamedev-agent-skills` and were installed with `npx skills add`. The same source provides the user-level `game-feel`, `game-ui-ux`, and `audio-design` skills.
- To verify a game automatically, follow `game-creator:game-qa`. It uses Playwright with a controlled game clock and a `render_game_to_text()` hook that reports game state as text.

## Art assets (`Booker Assets/`)

The art was copied from `tot-hq` on 2026-10-13. The full file inventory is in `/Users/tommytu/Desktop/Booker Assets/README.md`. Each character folder uses the same subfolders:

- `game-files/`: the `.webp` sprites the existing HQ games load. They're tiny pixel art, as small as 17 px wide. Load these in-game, and set Phaser's `pixelArt: true` so they scale without blur.
- `png/`: the same art scaled up with hard pixel edges. Use these outside the game, not as game textures.
- `hi-res/`: the original art at 1024 px or larger, which the sprites were cut from.
- `alternates/`: rejected second takes.

The folder layout here differs from the README:

- `booker.png` (the 256x256 master mascot) and `bone.png` are at the root of `Booker Assets/`, and `01 Mascot/` is empty.
- `05 Casino - Craps stickman/` is inside `04 Casino - Roulette croupier/`.

The only full-body walking sprite is `02 Empire/game-files/booker-stand.webp` (28x32, with a `-night` variant). It's a single frame, so a platformer needs new run and jump frames. The `image-gen` and `game-creator:add-assets` skills can make them. Keep new frames in the same pixel-art style as `booker.png`.

`contact-sheet.png` at the repo root shows every in-game Booker sprite.
