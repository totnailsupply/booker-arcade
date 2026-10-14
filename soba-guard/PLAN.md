# Soba Guard — build plan

A 2D pixel-art lane-defense strategy game. Soba, the tricolor dog from
`../soba-tower`, guards the back garden of her family's noodle house at night.
Hungry critters come up the alley to raid the kitchen. Soba's kitchen crew
(lucky cats, dumpling steamers, rice-ball walls) holds the five garden rows,
and Soba herself patrols the porch with her own abilities.

Inspired by *Plants vs. Zombies* (lanes, a generator unit, unit cards with
recharge, flag waves). Original identity:

- **Soba is on the field.** She is a hero unit on the porch with two active
  abilities and a passive. Moving her between rows is a real decision.
- **Kitchen crew, not plants.** Every defender is a noodle-house object with a
  face. The resource is gold coins (square-hole mon coins), made by Lucky Cats.
- **Enemy mechanics that ask for different answers.** Pot-lid shields that
  Soba's bark knocks off, crows that hop the first defender, and (later)
  tanuki that turn to stone, foxes that change rows.
- **In-level tier upgrades.** You can upgrade a placed defender once, so you
  choose between more units and stronger units.

Engine: Phaser 4.2.1 + Vite. Dev server: http://localhost:3003 (strictPort).
Infrastructure (test clock, GLGuard, Assets placeholders, audio engine,
MuteButton, `scripts/lib/browser.mjs`) is copied from `../soba-tower` and
`../booker-run`.

## 1. Screen and layout (640x360, `pixelArt: true`, Scale FIT)

| Region | Rect (x, y, w, h) | Content |
|---|---|---|
| Top bar | 0, 0, 640, 56 | Coin counter, up to 6 unit cards (44x52), Upgrade and Recall tools, Pause, Mute |
| House | 0, 56, 72, 248 | Noodle-house back wall and door (the thing you defend) |
| Porch | 72, 84, 40, 200 | Soba's column, plus one Delivery Scooter per row |
| Grid | 112, 84, 360, 200 | 9 columns x 5 rows of 40x40 garden tiles |
| Alley | 472, 56, 168, 248 | Enemies enter here; the next wave queues up in view |
| Bottom bar | 0, 296, 640, 64 | Bark and Zoomies buttons with cooldown rings, level name, wave progress bar with flags |

## 2. Core loop (one level is 4 to 6 minutes)

1. Setup phase: 20 s, or press **Start** to skip. Lantern coins drift down.
2. Pick a card and click a free tile to place the defender. Each card has a
   cost and a recharge time.
3. Click coins (or move the keyboard cursor over them) to collect them. Soba
   fetches coins in her own row by herself.
4. Waves arrive from the alley. Flag waves are big; the last flag wave ends the
   level when its last enemy dies.
5. An enemy that reaches the porch triggers that row's Delivery Scooter, which
   clears the row once. A second enemy in a row without a scooter reaches the
   door: you lose.
6. Win → Results (stars, Golden Bones, unlock card). Lose → Results with
   **Retry** (under 1 s to a fresh start) and **Level select**.

## 3. Controls

| Action | Mouse or touch | Keyboard |
|---|---|---|
| Choose a card | Click or tap the card | 1 to 6 |
| Place | Click or tap a tile | Arrows or WASD move the tile cursor, Space or Enter places |
| Collect a coin | Click or tap it | Cursor passes over it |
| Move Soba | Tap a porch cell | F moves Soba to the cursor's row |
| Bark / Zoomies | Bottom-bar buttons | B / Z |
| Upgrade / Recall tool | Top-bar buttons, then a defender | U / X, then Space |
| Cancel | Tap the selected card again, or right-click | Esc |
| Pause / Mute | Top-bar buttons | P / M |

## 4. Content (starting numbers; the balance bots tune them)

Tile = 40 px. Times in seconds. All numbers live in `src/core/Constants.js`
and `src/data/*.js`.

### Soba (hero)

| Ability | Effect |
|---|---|
| Fetch (passive) | Coins that land in Soba's row fly to her after 1 s |
| Bark (B) | Stuns enemies in her row within 4 tiles for 2.5 s, pushes them back 24 px, and knocks off pot lids. Cooldown 18 s |
| Zoomies (Z) | Needs a full meter (12 kills). Soba dashes down her row and back in 1.2 s, dealing 150 damage to each enemy in the row |

Soba can't be hurt. She trots between rows at 160 px/s.

### Defenders

| Key | Name | Cost | Recharge | HP | Behavior | Tier 2 (cost) |
|---|---|---|---|---|---|---|
| `luckycat` | Lucky Cat | 50 | 7.5 | 300 | Drops a 25-coin every 9 s (first after 5 s) | Every 6.5 s (+75) |
| `steamer` | Dumpling Steamer | 100 | 7.5 | 300 | Fires a dumpling (20 dmg, 160 px/s) every 1.4 s while an enemy is ahead in its row | Two-dumpling burst (+125) |
| `onigiri` | Onigiri Wall | 50 | 25 | 1200 | Blocks; 3 damage frames | Nori wrap: 2000 max HP, full heal (+75) |
| `chili` | Chili Lantern (unlocked by clearing Level 1, used from Level 2) | 150 | 15 | 300 | Embers hit every enemy in a 3x1 area ahead | — |

Recall refunds 50 % of what you paid for the unit, tiers included.

### Enemies

| Key | Name | HP | Speed (px/s) | Bite (dps) | Mechanic | Points | First level |
|---|---|---|---|---|---|---|---|
| `rat` | Alley Rat | 200 | 12 | 25 | Walks and bites | 10 | 1 |
| `lidrat` | Pot-Lid Rat | 200 + 300 lid | 12 | 25 | The lid absorbs damage from the front. Bark knocks it off at once | 20 | 1 (wave 4) |
| `crow` | Crow | 150 | 18 | 25 | Hops over the first defender it reaches, then walks | 15 | 1 (wave 6) |
| `tanuki` | Tanuki | 500 | 9 | 40 | Turns to stone (immune) for 3 s after each 150 damage | 30 | 2 (data only) |
| `fox` | Fox | 250 | 16 | 30 | Moves to a neighbor row when it meets a defender | 25 | 3 (data only) |

### Economy

Start with 100 coins. A lantern coin (25) drifts down every 9 s. Uncollected
coins blink after 7 s and vanish at 10 s.

### Level 1: "Back Garden" (5 rows, 10 waves, flags at waves 5 and 10)

Cards at the start: Lucky Cat, Dumpling Steamer. Onigiri Wall unlocks after
wave 3 with a "New crew member!" card. Short, non-blocking hint toasts teach
each new thing once (place a cat, collect a coin, bark at a lid).

| Wave | Enemies |
|---|---|
| 1–3 | 1, 2, then 2 rats |
| 4 | 2 rats, 1 lid rat |
| 5 (flag) | 5 rats, 1 lid rat |
| 6 | 2 rats, 1 crow |
| 7 | 3 rats, 1 lid rat |
| 8 | 2 lid rats, 2 crows |
| 9 | 4 mixed |
| 10 (flag, final) | 8 rats, 3 lid rats, 2 crows |

The next wave starts after 25 s, or sooner when 70 % of the current wave's HP
is gone. Rows come from a seeded RNG (mulberry32) with a rule of no more than
two spawns in a row on one lane.

## 5. Progression (localStorage `soba-guard:save`, version 1, every call in try/catch)

- Per level: cleared, best stars, best score.
- Stars: ★ clear, ★ no scooter used, ★ no defender lost.
- Golden Bones: 5 per newly earned star.
- Treat Shop (permanent, 3 ranks, costs 5/10/15 bones): Piggy Bank (+25
  starting coins), Loud Bark (−2 s Bark cooldown), Hot Steam (+10 % dumpling
  damage), Lucky Paws (Lucky Cat 8 % faster).
- Unlocked units, muted flag. Debug starts never write to the save.

## 6. Screens

Title (Play, Treat Shop, mute) → Level Select (5 nodes on a map: Back Garden,
Night Market, Rooftops, Bamboo Grove, Temple Gate; a node is playable when its
level data exists, otherwise "Coming soon") → Battle ↔ Pause → Results →
Battle (retry) or Level Select. Every screen works with keyboard, mouse, and touch.

## 7. Art plan (`/image-gen`, $10 hard cap, stop and ask at $5, expected about $1)

Style: 16-bit pixel art matching `../soba-tower` (1 px dark outline `#1a1220`,
4 shades per material, warm lantern-lit night palette). Soba's likeness comes
from `../soba-tower/art/drafts/hero_low-1.png` and `../soba-tower/art/out/soba.png`,
passed with `-r`. Sprites use `openai/gpt-image-2.5-sunburst` with
`background=transparent` (low-quality draft, medium final). The title card uses
`google/gemini-3-pro-image` at 1K. Every call goes through `art/scripts/gen.sh`,
which logs it to `art/spend.md`. Future-level units and enemies are drawn in the
same sheets now, since a sheet costs the same with more items on it.

Asset contract (`public/assets/manifest.json`; a missing key gets a code-drawn
placeholder with the same key and size):

| Key | Frame | Frames |
|---|---|---|
| `soba` | 40x40 | 10: idle 0-1, bark 2-3, run 4-7, cheer 8, sad 9 (faces right) |
| `luckycat`, `steamer`, `chili` | 32x32 | 3: idle 0-1, action 2 |
| `onigiri` | 32x32 | 3: full, bitten, crumbling |
| `rat`, `lidrat`, `crow`, `tanuki`, `fox` | 32x32 | 4: walk 0-1, bite 2-3 (face left) |
| `scooter` | 32x24 | 2 |
| `items` | 16x16 | 8: coin, dumpling, lid, ember, feather, stone puff, bone, star |
| `tiles` | 40x40 | 4: garden light, garden dark, porch, alley |
| `house` | 72x248 | Noodle-house back wall with a door and lanterns |
| `alley` | 168x248 | Alley wall, crates, lantern strings |
| `title` | 320x120 | "SOBA GUARD" logo |

Code-drawn: UI panels, cards, buttons, cooldown rings, particles, cursor, sky.

## 8. Code structure

- `src/sim/`: pure JavaScript rules, no Phaser imports. `Battle.step(dt, input)`
  at a fixed 1/60 s with the seeded RNG. Modules: Battle, Grid, Units, Enemies,
  Projectiles, Coins, Waves, Soba, Rng. The sim queues events (place, shoot,
  hit, kill, coinDrop, waveStart, scooter, win, lose) that the scene forwards
  to the EventBus.
- `src/data/`: `units.js`, `enemies.js`, `levels/level1.js` (waves, cards,
  unlocks, hints), `levels/index.js` (the level list), `shop.js`.
- `src/scenes/`: Boot, Preload, Title, LevelSelect, Shop, Battle (renders the
  sim with pooled sprites; accumulator with at most 5 steps per frame), Pause,
  Results.
- `src/ui/`: Hud (TopBar, BottomBar), Card, Button, MuteButton, Toast.
  `src/fx/Effects.js`, `src/audio/` (engine from `soba-tower`).
- `src/core/`: Constants, EventBus, SaveData, Assets, Debug, GLGuard.
- Test hooks: `window.render_game_to_text()`, `window.advanceTime(ms)`,
  URL flags `?level= ?wave= ?coins= ?seed= ?autoplay=1 ?god=1 ?debug=1 ?skip=1`.

## 9. Build pipeline and gates

| Step | Owner | Gate |
|---|---|---|
| 1. Scaffold + core loop: sim, grid, 3 defenders, rat, coins, waves, scooters, win/lose, retry, placeholders | subagent | build, verify-runtime, iterate (score > 0, `game_over`), headless sim |
| 1.5 Art (parallel with Step 1; writes only `art/`) | subagent | every contract key in `art/out`, spend under $5 |
| 2. Content: lid rat, crow, Soba abilities, tiers, recall, Level 1 waves and hints, menus, save, Treat Shop, art install, balance | subagent | balance gates, ui-flow-check, save-check |
| 3. Visual polish and audio, in parallel with disjoint files | 2 subagents | build, verify-runtime, screenshots reviewed |
| 4. Final QA: every check, touch, real-time vs fixed-step | QA subagent + fixes | all green |

Balance gates (`scripts/sim-level.mjs --level 1 --bot <name> --seeds 20`, headless Node):

- Idle bot (never places, never collects): loses before wave 5.
- Steamers-only bot (no cats, places a steamer whenever it can afford one): wins at most 50 %.
- Novice bot (random rows, 1.5 s collection delay, never uses abilities): wins at least 70 %.
- Smart bot (two columns of cats, steamers in front, walls on pressure, barks at lids): wins 100 % and earns 3 stars at least 60 %.

Monetization (Play.fun) is skipped. CLAUDE.md allows it only when the user asks.
