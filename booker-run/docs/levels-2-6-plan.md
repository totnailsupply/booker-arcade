# Booker Run: Levels 2–6 implementation plan

Status: approved by the user's request on 2026-10-13. Every agent working on Levels 2–6 reads this file first.

## Goals

- Add Levels 2–6. Each level introduces one new Booker ability, is built around it, and ends at a clear finish.
- Abilities carry forward: level N has every ability introduced in levels 2..N. Level 1 stays exactly as it is (no abilities).
- Keep the game one-button, responsive, and arcade-like.
- Redesign the menus: title, level selector with locked and unlocked levels, persistent high scores (overall and per level), and progression tracking.
- Improve the game-over and level-complete screens so players want to retry.
- Keep one pixel-art look. Image generation budget for this phase: **$10 total**, hard limit.

## One-button ability grammar

Space, Up arrow, mouse button, or a tap is the only game input. Each ability adds one meaning to that button, in this order:

| Level | Ability | Input | Rule |
|---|---|---|---|
| 1 | Jump | Press on the ground; hold for higher | Existing. |
| 2 | **Double jump** | Press in the air | One air jump per airtime. Refreshed by landing, a wall kick, or a pounce. A short spin animation. |
| 3 | **Ear glide** | Hold while falling | Fall speed is capped while held. Updraft vents lift a gliding Booker. |
| 4 | **Wall kick** | Touch a wall face in the air, then press | Booker clings and slides down slowly. A press kicks him upward and refreshes the double jump. Walls are solid, not deadly. |
| 5 | **Pounce** | No new input: land on an enemy from above | Stomps the enemy, bounces Booker (hold for a higher bounce), and refreshes the double jump and dash. Touching an enemy from the side or below is a hit. |
| 6 | **Zoomies dash** | Press in the air after the double jump is spent | About 0.3 s horizontal burst at about 2x speed with no gravity. Smashes breakable objects. One dash per airtime, refreshed like the double jump. |

Every number lives in `Constants.js` with the reach math written out, like the existing `JUMP` block.

## Levels

Each level runs about 80–100 s, in four sections. Section 1 teaches the new ability in a forgiving way. Sections 2–4 combine it with earlier abilities at rising speed. A run-out leads to the finish. One hit still restarts the level.

| # | Name | Setting | New ability | New elements | Speed (px/s) |
|---|---|---|---|---|---|
| 1 | The Yard | Warehouse lot, golden hour | — | Existing | 150 → 230 |
| 2 | The Docks | Harbor at dusk, cranes, containers | Double jump | Water pits, one-way container platforms, tall tire stacks, scuttling crabs | 160 → 240 |
| 3 | The Rooftops | City rooftops, blue twilight | Ear glide | Wide chasms between buildings, updraft vents, antennas, flying pigeons | 170 → 250 |
| 4 | The Factory | Factory interior at night | Wall kick | Tall walls and shafts, catwalk platforms, spinning gears, timed steam jets | 175 → 250 |
| 5 | Night Market | Neon street market | Pounce | Robot vacuums (ground patrol), delivery drones (hovering), food carts, open manholes | 185 → 260 |
| 6 | Steakhouse Row | Late-night neon, grill smoke | Zoomies dash | Breakable box stacks and gates, hot grills, mega gaps, every earlier element | 195 → 280 |

The finish is a steak in every level. Level 6 ends at a Golden Steak.

## Architecture changes (reuse, don't rewrite)

- `src/levels/index.js`: registry of all levels with metadata (id, number, name, ability, theme, music variant). `level1.js` stays as is.
- `src/levels/levelN.js`: authored data. Existing fields (`sections`, `obstacles`, `gaps`, `bones`, `finishX`, `length`) plus new element lists: `platforms`, `walls`, `updrafts`, `enemies`, `breakables`, `hazards` (timed or moving), and optional `botPlan`.
- `src/core/Abilities.js`: ability definitions (id, name, hint text, icon frame, level introduced) and `abilitiesForLevel(n)`.
- `src/core/SaveData.js`: replaces `HighScore.js` with a versioned save (`booker-run:save:v1`). It migrates the existing Level 1 best. Per level: completed, best score, best stars, best time, best progress %, best bones, attempts, clears. Overall: total score (sum of bests), stars, levels cleared. Unlock rule: level N unlocks when level N-1 is completed.
- `RunScene` loads a level by id from scene data and builds every element type. `Player` gets an ability state machine gated by the level's ability set.
- Themes: each level names its texture keys (backgrounds, ground, pit fill, platform, hazards). Missing art falls back to generated placeholders, as today.
- Scenes: `TitleScene` → `LevelSelectScene` (new) → `RunScene` → `GameOverScene` (new overlay) or `LevelCompleteScene`.

## Menus and screens

- **Title:** logo art, "Press to start", mute button.
- **Level select:** 6 cards (thumbnail, number, name, ability icon, best score, stars, lock). Header with total score, stars (x/18), levels cleared (x/6), and unlocked ability icons. Arrow keys plus Space or Enter, mouse, and touch. A card for a locked level shows what unlocks it.
- **Game over (after a hit):** a compact card over the frozen level: percent reached, best percent, attempt number, a short tip for what killed Booker. Auto-retries after about 1.2 s; any press retries at once; Esc goes to level select. The HUD progress bar marks the best percent.
- **Level complete:** animated score tally, star reveal, new-best callouts, time against par, bones collected. An unlock reveal for the next level and its ability. Buttons: **Next level**, **Replay**, **Levels**.

## Art (image-gen, $10 hard limit)

Ledger: `art/spend.md`, section "Levels 2–6". First pass may spend at most $7; $3 stays in reserve for fixes. Expected cost is about $3–4.

Asset contract (keys, files in `public/assets/`, sizes in px). Art must match these sizes exactly; code loads these keys.

| Key | Size | Notes |
|---|---|---|
| `booker` | 864x36 (18 frames of 48x36) | Frames 0–9 unchanged. 10–11 double-jump spin, 12–13 ear glide (ears spread like wings), 14 wall cling (paws on a wall at the frame's right), 15 pounce (paws down), 16–17 zoomies dash (stretched, motion lines) |
| `ui-icons` | 240x24 (10 frames of 24x24) | 0 double jump, 1 glide, 2 wall kick, 3 pounce, 4 zoomies, 5 lock, 6 star on, 7 star off, 8 trophy, 9 bone |
| `menu-bg` | 480x270 | Level select background, calm, low detail behind cards |
| `thumb-l1` … `thumb-l6` | 128x72 | Made with Pillow from each level's backgrounds (no image-gen cost) |
| `lN-bg-far`, `lN-bg-mid`, `lN-bg-near` | 480x270 each | N = 2..6. Far opaque; mid and near transparent at the top. Left and right edges tile. |
| `lN-ground` | 32x32 | Tiles horizontally |
| `lN-pit` | 32x32 | What shows in a pit (water, dark alley, glow). Tiles both ways |
| `lN-platform` | 32x16 | One-way platform top, tiles horizontally |
| `l2-bollard` 16x20, `l2-tires` 24x32, `l2-crab` 20x12 | | Docks hazards. Tires need a held jump |
| `l3-acunit` 28x24, `l3-antenna` 12x48, `l3-pigeon` 32x12 (2 frames of 16x12), `l3-vent` 32x16 | | Rooftops |
| `l4-wall` 32x32, `l4-gear` 24x24, `l4-crate` 24x24, `l4-steam-vent` 16x8 | | Factory. Wall tiles both ways. Steam is drawn in code |
| `l5-vacuum` 48x16 (2 frames of 24x16), `l5-drone` 48x16 (2 frames of 24x16), `l5-cart` 32x28, `l5-hydrant` 14x20 | | Night Market |
| `l6-boxes` 24x48, `l6-gate` 16x56, `l6-grill` 32x24, `l6-trashcan` 20x28, `golden-steak` 48x36 | | Steakhouse Row. Boxes and gate are breakable |

## Audio

Procedural Web Audio, as today. Each level gets its own music variant (key, progression, tempo range, lead instrument). New SFX: double jump, glide wind loop, wall cling and kick, pounce boing, dash zoom, break crash, unlock jingle, menu move and select.

## Testing

- Deterministic mode: autoplay checks drive the game with fixed 1/60 s steps through `window.advanceTime`, so results don't depend on machine load.
- Per level: `node scripts/autoplay-check.mjs --level N` reaches the finish with 0 deaths. A jitter run (`?botjitter=35`, random ±35 ms input timing, 5 seeds) passes at least 4 of 5, which shows the level doesn't need frame-perfect input.
- `scripts/ability-check.mjs`: a sandbox level tests each ability in isolation.
- `scripts/ui-flow-check.mjs`: title → level select → play → complete → unlock → next level; locked cards refuse to start; saves persist across reloads; migration from the old Level 1 save.
- Every existing check still passes, and Level 1's bot score stays 2945.
- Debug flags: `?level=N`, `?unlock=all`, `?abilities=double,glide`, `?autoplay=1`, `?botjitter=ms`, `?seed=n`, `?start=sectionN`, `?x=`, `?debug=1`.

## Phases

1. **Engine (one agent) in parallel with Art (two agents).** The engine agent builds the registry, abilities, element types, save data, bot, checks, and short stub levels. The art agents produce the asset contract.
2. **Content, in parallel:** five level-design agents (one per level, each owns only its `levelN.js` and its level's tuning), one UI agent (menus and screens), one audio agent.
3. **Integration QA:** full check suite, screenshots of every level and screen, a code review, and fixes until everything passes.
4. **Docs:** update `progress.md` and `CLAUDE.md`.
