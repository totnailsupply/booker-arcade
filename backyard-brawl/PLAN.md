# Booker's Backyard Brawl — build plan

A 2D pixel-art arena survival shooter. Booker defends his backyard from waves of
cats, squirrels, crows, raccoons, and skunks, then faces a robot vacuum. Inspired
by Brotato (timed waves in one arena) and Vampire Survivors (auto-fire, XP gems,
pick 1 of 3 upgrades).

Engine: Phaser 4.2.1 + Vite. Dev server: http://localhost:3002 (strictPort).
Infrastructure (test clock, browser launcher, HighScore, audio engine, MuteButton)
is copied from `../soba-tower` and `../booker-run`.

## 1. Core loop (one run is about 8 minutes)

1. Pick a starting weapon (unlocked ones only) and press Start.
2. Move with WASD or arrows (touch: drag anywhere for a virtual joystick). Weapons
   aim and fire on their own. Space or Shift dashes (0.18 s, invulnerable,
   1.6 s cooldown; touch: second finger tap or the Dash button).
3. Kill enemies, collect kibble (XP). Each level-up pauses the action and offers
   3 cards: a new weapon, a weapon level, or a stat boost. R rerolls (limited).
4. Survive the wave timer. Wave end: remaining enemies pop into XP, all XP is
   pulled in, heal 20 % max HP, 2.5 s break with a "WAVE n" banner.
5. Waves 5 and 10 are boss waves (the wave ends when the boss dies). Clearing
   wave 10 is a win. After the first win, Endless mode unlocks (waves 11+).
6. Death or win goes to Results: score, high-score rank, Golden Bones earned.
   Space or Enter starts a new run with the same weapon in under 1 s.

## 2. Numbers (starting values; the balance bot tunes them)

| Item | Value |
|---|---|
| Internal resolution | 480x270, `pixelArt: true`, Scale FIT |
| Arena | 768x512 world, camera follows Booker with a soft deadzone, clamped to the arena |
| Booker | 110 px/s, hit circle r=7, 10 HP, 0.75 s invulnerability after a hit (Step 4: was 0.6) |
| Wave length | 20 + 4n s (wave 1 = 24 s, wave 9 = 56 s); boss waves end on boss death |
| Spawn budget | (1.6 + 0.2 (n-1) + 0.18 (n-1)^2) cost units per second, ramping 0.7x to 1.3x within a wave; telegraph 0.8 s with a paw-print marker; at least 110 px from Booker; enemy cap 140 |
| Enemy scaling | HP x (1 + 0.25 (n-1) + 0.09 (n-1)^2), contact damage +14 % per wave (Step 4: was 10 %) |
| XP curve | next = 5 + 6 (L-1) + floor(L^1.5); target level 25 to 30 by wave 10 |
| Combo | Kills within 1.5 s of each other build a multiplier: x1 + 0.1 per kill, cap x3 |

### Enemies (5 types and 2 bosses)

| Key | Behavior | HP | Cost | Points |
|---|---|---|---|---|
| `cat` | Walks straight at Booker (55 px/s) | 8 | 1 | 10 |
| `squirrel` | Fast (95 px/s), zig-zags, low HP; from wave 2 | 4 | 1 | 10 |
| `crow` | Flies; hovers, then swoops in a line; ignores spacing; from wave 3 | 6 | 1.5 | 15 |
| `raccoon` | Slow tank (40 px/s), knockback resistant; from wave 4 | 30 | 3 | 30 |
| `skunk` | Keeps 90 px distance and lobs stink clouds (slow projectile); from wave 6 | 12 | 2.5 | 25 |
| `boss-cat` (Big Tom, wave 5) | Charges in a line after a 0.7 s wind-up, then summons 4 kittens | 600 | — | 1000 |
| `boss-vac` (Robo-Vac 9000, wave 10) | Bounces around the arena, fires dust-ball rings, sucks Booker in during phase 2 | 1800 | — | 2500 |

From wave 7, 10 % of enemies are elites (1.2x size, golden tint, 3x HP, more XP).

### Weapons (auto-aim, 4 slots, levels 1 to 5)

| Key | Behavior |
|---|---|
| `bark` | Sound-wave shot at the nearest enemy. Default start. |
| `ball` | Tennis ball that ricochets to 3 enemies. Unlock: reach wave 3. |
| `bone` | Boomerang that pierces everything and comes back. Unlock: 500 total kills. |
| `frisbee` | 1 to 3 discs orbiting Booker. Unlock: reach wave 6. |
| `squeak` | Squeaky-toy shockwave ring around Booker with knockback. Unlock: beat Big Tom. |
| `zoomies` | Leaves a damaging paw-print trail while moving. Unlock: win a run. |

### Stat cards (stack up to 5)

Big Heart (+3 max HP, heal 3), Good Boy Snacks (+0.25 HP/s regen), Zoomies Boots
(+10 % speed), Sharp Teeth (+15 % damage), Waggy Tail (+12 % fire rate), Big Ears
(+30 % pickup radius), Thick Fur (+1 armor), Lucky Collar (+8 % crit, crits deal
2x), Big Paws (+20 % area), Extra Treats (+1 projectile, stacks to 2).

Cards: 3 per level-up, weighted toward owned weapons. 10 % of cards are Rare
(gold frame, double value). 2 rerolls per run (more from the Kennel).

### Pickups

Kibble XP (1 / 5 / 20), heart (+3 HP, 2 % drop), magnet (pulls all kibble, 0.5 %),
Golden Bone (+1 meta currency, 1 % drop).

## 3. Persistence (localStorage `backyard-brawl:save`, version 1, every call in try/catch)

- High scores: top 10 entries {score, wave, level, time, kills, weapon, date}.
- Golden Bones: earned per run = floor(score / 2000) + 3 x waves cleared + drops (Step 4 retune;
  was /250 and 5 per wave). A win pays about 90, a wave-5 death about 25; maxing the Kennel
  (1200 bones) takes about 20 runs for an average player and 13 for a strong one.
- Kennel (permanent upgrades, 5 ranks, costs 10/20/35/55/80): Hearty (+2 max HP),
  Strong Jaws (+5 % damage), Quick Paws (+4 % speed), Sniffer (+15 % pickup radius),
  Lucky (+1 reroll), Fast Learner (+8 % XP).
- Lifetime stats (runs, kills, best wave, wins), weapon unlocks, Endless unlock, muted.
- Debug starts (`?wave=`, `?god=1`, `?autoplay=1`) never write to the save.

## 4. Screens

Title (Play, Kennel, High Scores, mute) → Weapon Select → Arena (HUD) ↔ Level-Up
overlay ↔ Pause → Results → Arena (instant replay) or Title.

- HUD: HP bar, XP bar with level, wave number and timer (boss HP bar on boss
  waves), score with combo, weapon slot icons with levels, Golden Bones, mute.
- Level-Up: 3 cards (icon, name, level, description). Keys 1/2/3, arrows +
  Enter, click, or tap. R = reroll.
- Every screen works with keyboard, mouse, and touch. Esc/P pauses. M mutes.

## 5. Art plan (image-gen, $10 hard cap, review at $5, expected about $1.50)

Style: 16-bit side-view pixel art (Brotato-like characters in a top-down arena),
1 px dark outline, warm sunny backyard palette. Booker likeness comes from
`../booker-run/art/raw/hero_ref.png` (tan coat, cream chest, black muzzle mask,
dark-tipped floppy ears, amber eyes, no collar), passed with `-r`.

Model: `openai/gpt-image-2.5-sunburst` with `background=transparent` for sprites
(low-quality drafts, medium finals). `google/gemini-3-pro-image` 1K only for the
title card (text). Every call is logged in `art/spend.md` through `art/scripts/gen.sh`.

Asset contract (keys loaded from `public/assets/manifest.json`; any missing key
gets a code-drawn placeholder with the same key and size):

| Key | Frame size | Frames |
|---|---|---|
| `booker` | 32x32 | 8: idle 0-1, run 2-5, hurt 6, dash 7 (faces right) |
| `cat`, `skunk`, `crow` | 24x24 | 2 (walk or flap) |
| `squirrel` | 20x20 | 2 |
| `raccoon` | 28x28 | 2 |
| `boss-cat`, `boss-vac` | 64x64 | 2 |
| `items` | 16x16 | 12: bark wave, tennis ball, bone, frisbee, stink cloud, dust ball, kibble S/M/L, heart, magnet, golden bone |
| `icons` | 24x24 | 16: 6 weapons + 10 stats (card icons) |
| `arena` | 768x512 | backyard lawn, fence border, flower beds, a few decorative props baked in |
| `title` | 480x270 | title card with the words "BOOKER'S BACKYARD BRAWL" |

Code-drawn: paw-print trail, shockwave ring, spawn marker, particles, UI panels and cards.

## 6. Code structure

- `src/sim/`: pure JavaScript game logic, no Phaser imports. `World.step(dt, input)`
  at a fixed 1/60 s with a seeded RNG (mulberry32). Modules: World, Player,
  Enemies, Weapons, Projectiles, Pickups, Waves, Upgrades, SpatialHash, Rng.
  The sim pushes events (hit, kill, levelUp, waveStart, playerHurt, ...) into a
  queue that the scene forwards to the EventBus.
- `src/scenes/`: Boot, Preload, Title, WeaponSelect, Arena (renders the sim with
  pooled sprites; accumulator, max 5 steps per frame), LevelUp, Pause, Results,
  Kennel, Scores.
- `src/fx/`: Effects driven by EventBus. `src/audio/`: procedural Web Audio
  (engine from booker-run). `src/ui/`: Hud, Card, MuteButton, Joystick.
- `src/core/`: Constants (every tunable), EventBus, SaveData, Assets (manifest +
  placeholders), Debug (URL flags).
- Test hooks: `window.render_game_to_text()`, `window.advanceTime(ms)` (soba-tower
  test clock), `?seed= ?wave= ?god=1 ?hp= ?weapons= ?autoplay=1 ?debug=1`.

## 7. Build pipeline and gates

| Step | Owner | Gate |
|---|---|---|
| 1. Scaffold + core loop (sim, one weapon, two enemies, XP, level-up, waves, death, restart, placeholders) | subagent | build, verify-runtime, iterate (score > 0, game_over), headless sim runs |
| 1.5 Art (runs in parallel with Step 1, writes only `art/`) | subagent | every contract key in `art/out`, spend under cap |
| 2. Content: all weapons, enemies, bosses, cards, meta, menus, art install, balance | subagent | balance gates (following list), ui-flow-check, save-check |
| 3. Visual polish (juice) and audio, in parallel with disjoint files | 2 subagents | build, verify-runtime, screenshots reviewed |
| 4. Final QA: every check, touch, performance at 140 enemies, real-time vs fixed-step | QA subagent + fixes | all green |

Balance gates (`scripts/sim-run.mjs`, headless node, 20 seeds, default weapon):

- Idle bot (never moves, picks the first card): dies in wave 1 to 3.
- Kite bot (runs from the nearest enemies, random cards): median death wave 5 to 8; wins at most 30 %.
- Smart bot (kites, dashes through gaps, prioritized cards): wins at least 60 %.

Monetization (Play.fun) is skipped. CLAUDE.md allows it only when the user asks.
