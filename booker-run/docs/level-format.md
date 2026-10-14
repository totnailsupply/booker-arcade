# Level format (Levels 2–6)

Each level is one file, `src/levels/levelN.js`, exporting `LEVELn`. A level designer edits only that file. The registry (`src/levels/index.js`) adds the number, abilities, theme textures and music id. Level 1 (`level1.js`) is frozen.

## Coordinates

- World pixels. x grows right, y grows down. The screen is 480x270.
- The ground's top surface is `WORLD.GROUND_Y = 238`. Every height in level data is **px above the ground**.
- Booker's sprite x is the reference for `startX`, sections, `botPlan` and the camera (he stays at screen x 100).
- His hitbox is 26x22 px. Keep everything below ~216 px of height (the HUD covers the top 24 px; Booker's body never rises above y = 26).
- **Soft ceiling:** `PLAYER.CEILING_Y = 26` zeroes upward speed once Booker's body top reaches y = 26, which is about 190 px of feet height above the ground. A double jump (or kick, or bounce) launched from a surface higher than about 64 px gets clipped by it. Keep launch surfaces for "double jump at the top" moves at 64 px or lower, or plan for the clip.

## Fields

| Field | Shape | Notes |
|---|---|---|
| `id`, `name` | string | `id` must be `levelN`. |
| `startX` | number | Booker's start (100). |
| `finishX` | number | Centre of the finish (steak). Touching the steak **or** passing `finishX` (a jump or glide over it) completes the level. |
| `length` | number | World width. The last ground (body and art) runs one screen past it. |
| `finish` | `'steak'` \| `'golden-steak'` | Default `steak`. Level 6 uses `golden-steak`. |
| `sections` | `[{ name, startX, speed }]` | `startX` is an **absolute world x** (the code compares it with Booker's world x, as in `level1.js`). Speed lerps to each section's px/s. Section 2+ shows a "SPEED UP!" banner. |
| `obstacles` | `[{ x, type }]` | Level 1 types: `cone`, `crate`, `pallets`, `barrel` (rolls left). x = sprite centre on the ground. |
| `gaps` | `[{ x, width }]` | Pits. x = left edge. The theme's pit tile (water, alley, lava, manhole) fills them. Falling 24 px below the ground is a death. |
| `bones` | `[{ x, h }]` | h = bone centre height. Stars: 1 = finished, 2 = half the bones, 3 = all. Helpers `arc()` and `row()` are in `src/levels/_helpers.js`. |
| `platforms` | `[{ x, y, w }]` | One-way. x = left edge, y = top surface height, w = width (multiples of 32 look best). Land on top from above; pass through from below and the sides. |
| `walls` | `[{ x, w, h }]` | Solid from the ground up. x = left edge, h = height. The top is standable. See "Walls" below. |
| `updrafts` | `[{ x, w, h, strength? }]` | Zone from the ground up to h. Lifts a **gliding** Booker toward `strength` px/s upward (default 150). No effect when not gliding. A vent is drawn at the base. |
| `enemies` | `[{ x, type, y?, patrol? }]` | `vacuum` (ground; y = base height, default 0) or `drone` (y = centre height, default 40; bobs ±4 px). `patrol` px: walks between `x - patrol` and `x`, starting left. Stomp with pounce; any other contact is a hit. |
| `breakables` | `[{ x, type, y? }]` | `boxes` (24x48) or `gate` (16x56). y = base height (stack boxes at y 0, 46, 92). A dash smashes them; any other contact is a hit. |
| `hazards` | `[{ x, type, y?, ... }]` | See the next table. |
| `parallax` | `{ far, mid, near }` | Optional, visual only. Default far = min(0.025, 400 / length). A far layer with a sun or moon needs its own `far`, or the disc slides off the left edge and wraps in at the right, split in two: far = (disc left x in the art − 24) / (finishX − 100). Levels 2, 3, 4 and 6 set one; Level 1's is in the registry (`src/levels/index.js`), since `level1.js` is frozen. |
| `parSeconds` | number | Optional. Default = each section's length / speed. Set it when walls or detours slow Booker down. |
| `botPlan` | `[{ x, action, ms? }]` | Optional scripted bot input. See "Bot". |

### Hazards

All hazard positions are sprite centres (x). `y` is the base height above the ground (to stand one on a platform or wall top), except flyers, where y is the centre height.

| Type | Size | Hitbox (from the sprite's top-left) | Behaviour |
|---|---|---|---|
| `bollard` | 16x20 | 10x17 at 3,3 | Static. |
| `tires` | 24x32 | 20x30 at 2,2 | Static. Needs a held jump; two stacked (y 0 and 30) need a double jump. |
| `crab` | 20x12 | 14x8 at 3,4 | Scuttles left at 60 px/s once Booker is 400 px away. |
| `acunit` | 28x24 | 24x20 at 2,4 | Static. |
| `antenna` | 12x48 | 4x44 at 4,4 | Static, tall and thin. |
| `pigeon` | 16x12 | 10x6 at 3,3 | Flies left at 90 px/s at centre height y once Booker is 520 px away. |
| `gear` | 24x24 | 16x16 at 4,4 | Static, spins. Use y to float it. |
| `l4crate` | 24x24 | 18x19 at 3,5 | Static. |
| `steam` | vent 16x8 | column 10 x (h - 4) | Timed. `{ period, on, offset, h }` in ms/px (defaults 1800, 700, 0, 80). The vent's clock starts when Booker is 480 px away; the column is deadly while `(clock + offset) % period < on`, with warning puffs 450 ms before. |
| `cart` | 32x28 | 28x22 at 2,6 | Static. Its canopy matches the L5 platform awning, so don't put an awning right above a cart. |
| `hydrant` | 14x20 | 10x16 at 2,4 | Static. |
| `grill` | 32x24 | 26x18 at 3,6 | Static. |
| `trashcan` | 20x28 | 14x24 at 3,4 | Static. |

Moving things start when Booker gets close, so they always meet him at the same place: about `ACTIVATE_AHEAD * v / (speed + v)` px left of their authored x (a pigeon at 240 px/s meets him ~142 px left of its x).

### Walls

- Running into a wall face on the ground **without** wall kick is a hit.
- In the air with wall kick, touching a face clings: the fall slows to 45 px/s. A press kicks up 67 px on paper (about 55 px in practice from a sliding cling) and refreshes the double jump and dash. Kicks repeat (150 ms apart), so any wall can be climbed.
- On the ground against a face **with** wall kick, Booker has 1.2 s to jump before it counts as a hit (he must never be stuck forever).
- The camera stops with Booker while a wall blocks him.

## Abilities

Level N has every ability introduced at or before N (`src/core/Abilities.js`). One button, by priority:

| State | A press means |
|---|---|
| On the ground or within 80 ms of leaving it | Jump (hold up to ~0.38 s for full height) |
| Clinging to a wall (L4+) | Wall kick |
| Falling, and landing (ground, platform or wall top) before the 100 ms buffer runs out (L2+, `JUMP.LAND_BUFFER`) | Waits, then a full jump on landing (not a low double jump or a dash). If the landing stops being due in time, the press falls back to the air move. |
| In the air with the air jump left (L2+) | Double jump (fixed +56 px boost) |
| In the air, air jump spent (L6) | Zoomies dash: 0.3 s at 2x speed, no gravity, smashes breakables |
| Otherwise | Buffered 100 ms (jumps on landing) |

Holding while falling glides (L3+): fall speed eases to 55 px/s. Landing on an enemy from above pounces (L5+): the enemy pops, Booker bounces 77 px held or 41 px tapped, and the double jump and dash refresh.

All tunables live in `src/core/Constants.js` (`JUMP`, `DOUBLE`, `GLIDE`, `UPDRAFT`, `WALL`, `POUNCE`, `DASH`) with a reach table (jump, double, glide, dash reach at every level speed). Recompute it with `node scripts/reach-table.mjs`. Per-level tuning belongs in the level file (speeds, `parSeconds`, `parallax`), not in Constants.js.

## Bot

`?autoplay=1` plays any level. Level 1 uses its original bot. Levels 2–6 use a planner (`src/systems/BotPilot.js`): it simulates Booker frame by frame with the game's own controller code (`src/systems/BotSim.js`), searches press and hold timings (up to three presses: jump, double jump, dash, kicks, pounce bounces, glide holds), and picks the timing with the most slack so that input jitter can't break it. It re-plans after every press.

When the planner struggles with a spot, script it with `botPlan`:

```js
botPlan: [
  { x: 2310, action: 'press', ms: 380 },  // press, hold 380 ms (full jump); default ms = 380
  { x: 2400, action: 'tap' },             // press, hold 100 ms
  { x: 3000, action: 'hold' },            // press and keep holding...
  { x: 3300, action: 'release' },         // ...until here
],
```

x is Booker's sprite x when the action fires. Entries less than 300 px apart form one scripted stretch. The planner stands down from 60 px before a stretch's first entry until its last press is released, and treats reaching a stretch as safe. Jitter (`?botjitter=`) shifts scripted presses and holds too.

### Bot caveats (bot only; players are not affected)

- **3 presses ahead at most.** The planner searches up to three presses between safe landings (ground, a platform, a wall top). Keep each combo at 3 presses or fewer, and leave a calm stretch after a multi-press climb (Level 4 keeps 1 s before the next press after a two-kick climb; Level 6 caps every combo at 3).
- **It rushes steam gaps.** At a timed vent the planner takes the earliest press that gets through, not the middle of the off window, so it kicks or jumps through narrow gaps right as the steam stops. Level 4's lip vents have 1.0–1.2 s off windows so even the earliest kick has margin. Don't design a steam gap the bot can only pass by luck.
- **Bone grazes aren't exact offline.** A bone's body follows its bob tween, and the bob keeps running through hit-stops (stomp and smash freezes), which BotSim skips. So an overlap that grazes a bone by 2 px or less can differ between BotSim (or any offline tool) and the browser. Offline bone tools should test against an inset rect. Deaths never depend on it, and the planner doesn't plan for bones.

## Debug flags

`?level=N` (or `test`), `?room=name` (sandbox room, see `src/levels/sandbox.js`), `?unlock=all`, `?abilities=double,glide` (`none`, `all`), `?autoplay=1`, `?menus=1` (keep the menus with autoplay), `?botjitter=ms`, `?seed=n`, `?det=1` (deterministic stepping), `?start=sectionN` (the section's own `startX`), `?x=`, `?debug=1` (hitboxes).

A debug start (`?start=`, `?x=`) that lands inside a wall, over a pit or on a static hazard, obstacle or breakable moves left until Booker stands on ground with 40 px of clear run-up (`PLAYER.SPAWN_CLEAR`, `LevelModel.safeSpawnX`).

## Commands

Run these from `booker-run/` with the dev server up (`npm run dev`):

| Command | What it proves |
|---|---|
| `node scripts/autoplay-check.mjs --level N` | The bot reaches the finish with 0 deaths (deterministic, fixed 1/60 s steps). Prints a `RESULT {...}` JSON line. |
| `node scripts/autoplay-check.mjs --level N --jitter 35 --seeds 5` | Robustness: random ±35 ms on every press and hold, 5 seeds; passes at 4/5. |
| `node scripts/autoplay-check.mjs --realtime` | The old real-time mode (Level 1 score stays 2945 either way). |
| `node scripts/level-shots.mjs --level N [--debug]` | Screenshots every 2.5 s of game time while the bot plays, through to the finish, plus `contact.png` (`--debug` draws hitboxes). Old shots are deleted first. |
| `node scripts/finish-check.mjs` | Jumping or gliding over the finish completes every level. |
| `node scripts/ability-check.mjs` | Each ability and element works in isolation, and fails without the ability. |
| `node scripts/ui-flow-check.mjs` | Menus, unlocks, saves, migration, game-over retries. |
| `node scripts/reach-table.mjs` | Reach numbers for the current tunables. |
| `node scripts/audio-check.mjs`, `node scripts/verify-runtime.mjs` | Audio and boot smoke tests. |

## Design checklist

1. Section 1 teaches the new ability gently; sections 2–4 combine it with older ones at rising speed; a flat run-out leads to the finish.
2. Leave at least 200 px of flat run-up before anything that needs a held jump, and 20+ px of margin on every reach in the table.
3. Run `autoplay-check --level N`, then the jitter run (4/5 or better), then look at `level-shots`.
4. If the bot fails at one spot, first ask whether a player would find it fair; only then add a `botPlan` stretch.
