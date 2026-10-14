# FX notes (Levels 2–6)

Every effect here is visual only. Nothing changes a body, a hitbox, a velocity, the score or the game clock. Level 1 keeps its Step 2 effects. The only change there is that the banners and the "+10" now use the pixel font.

## Files

| File | What it draws |
|---|---|
| `src/systems/Effects.js` | Step 2 juice, the display sprite (`effects.view`), banners, the death beat and the win. Creates the modules below and wires their events. |
| `src/fx/AbilityFx.js` | Ability juice. It is created only when the level has an ability, so Level 1 doesn't get it. |
| `src/fx/WorldFx.js` | Drone rotor blur and shadow, vacuum light, golden steak, and culling of the steam and updraft views. |
| `src/fx/SteamView.js` | A steam vent's look: off, wind-up, firing. LevelWorld sets the phase. |
| `src/fx/UpdraftView.js` | An updraft column's look. |
| `src/fx/Ambience.js` | Atmosphere for each level, chosen by `entry.number`. The sandbox (number 0) gets none. |
| `src/fx/textures.js` | Generated canvas textures (`FXT.*`) and the chunk frames for smashed breakables. |

LevelWorld keeps the steam clock, the bodies and the `STEAM_*` events. Each frame it calls `view.setPhase(phase)` and `view.update(dt, windupProgress)`.

## Effects and events

| Event | Effect |
|---|---|
| `PLAYER_DOUBLE_JUMP` | A flat ring and side puffs at the feet, a whoosh arc spinning around the spin frames (10–11) for `DOUBLE.SPIN_MS`, and a stretch. The arc stops early if a dash, cling or pounce pose takes over. |
| `PLAYER_GLIDE_START` / `_END` | Trails from both ear tips (offsets for frames 12 and 13), soft air puffs below, and a ±1 px float bob on the display sprite. The bob and trails stop as soon as the glide ends. |
| `PLAYER_WALL_CLING` | A dust puff, sparks and a squash. The squash is anchored at the paws (`FX.CLING_PAW_DX`), so they stay on the wall face. While Booker slides (cling and `vy > 0`), sparks and dust scrape from his front and hind paws. |
| `PLAYER_WALL_KICK` | A tall ring and a puff burst off the wall face, sparks, and a stretch. |
| `ENEMY_STOMPED` | Two ground shockwave rings, stars, a flash and a tiny shake. The enemy flashes white and squashes flat, then pops and spins away (`LevelWorld.stompEnemy`). |
| `PLAYER_POUNCE` | The squash holds through RunScene's 40 ms stomp freeze, then the bounce stretches. |
| `PLAYER_DASH` / `_END` | Cream afterimages, speed lines and a sonic ring. The camera lags 8 px and catches up; `Effects.lateSync` applies this after RunScene pins the camera, so it never builds up. The dash ends with a puff. |
| `BREAKABLE_SMASHED` | The sprite splits into chunks that tumble away (3 boxes, or 2 gate halves), plus splinters, dust, a flash, a ring and the existing shake. RunScene's 60 ms freeze is the hit-stop. |
| Steam phase | **Off**: the vent is dark. **Wind-up** (450 ms): the vent goes from orange to red, its glow grows and flickers in the last third, and puffs come faster. **On**: a dense white column exactly as tall as the hitbox, with billows and a cap. The column appears only while the steam is deadly. When it stops, the column vanishes at once and only faint wisps remain. |
| Updraft | A fill that is strongest at the vent, dashed side edges that rise, and a dashed lip at the top. Streaks and leaves die when they leave the zone, so the top edge stays crisp. A vent over a pit sits on a pipe that runs down into the pit (`FXT.PIPE`). `FX.UPDRAFT_THEMES` sets colours per level; Level 6 uses warm air, a copper vent, and ember and ash scraps. |
| Walls | `FX.WALL_TINTS` tints the factory wall art per level. Level 6 uses rusty steel. |
| Enemies | Drones show rotor blur and a ground shadow that shrinks with height (no shadow over pits). A vacuum's red light glows on its lit frame, so it blinks with the 2-frame loop. |
| Golden steak (Level 6) | Two counter-rotating sunbursts, a second halo, a wider beam, twinkling glints, a stronger glow filter, and two gold shockwave rings on the win. |

## Ambience (subtle; world emitters run only while their source is on screen)

| Level | Ambience |
|---|---|
| 2 Docks | Spray and glints over the water pits, and 3 far gulls. |
| 3 Rooftops | 22 twinkling stars and 2 slow clouds. |
| 4 Factory | Embers, spark spurts and a pulsing heat glow over the molten pits. |
| 5 Market | 12 drifting lantern bokeh and 4 rising sky lanterns. |
| 6 Steakhouse | Grill smoke, embers from the grills and coal pits, and 7 drifting embers on screen. |

## Tunables

These are in `FX` in `src/core/Constants.js`:

- Ability juice: `SPIN_ARC_*`, `GLIDE_*`, `CLING_*`, `SCRAPE_*`, `POUNCE_*`, `STOMP_*`, `DASH_GHOST*`, `DASH_LINE_*`, `DASH_NUDGE_*`, `SMASH_*`.
- World: `STEAM_*`, `UPDRAFT_*` (including `UPDRAFT_THEMES`), `WALL_TINTS`, `ROTOR_COLOR`, `DRONE_SHADOW_ALPHA`, `VACUUM_LIGHT_*`, `GOLDEN_*`.
- Ambience: `AMB_*`.
- Banners: `BANNER_FONT_SCALE`, `BANNER_SUB_Y`.

Every emitter has a `maxAliveParticles` cap. In 30 s of Level 6, the most particles alive at once was about 50, against a budget of 150.

## Checking

- `node scripts/fx-moments.mjs [--only double,glide,...] [--out output/fx2]` takes deterministic screenshots of each effect at exact frames. It uses the sandbox rooms and the levels.
- `node scripts/fx-perf.mjs --level 6 --seconds 30 --restarts 3 [--gpu]` plays in real time and samples fps, children, emitters, live particles, tweens and listeners, then restarts the level. `--gpu` uses ANGLE Metal; without it, headless Chromium uses SwiftShader and fps reflects the software renderer.

## Gotchas

- A pixel ring scaled below about 0.5 loses its lines under nearest sampling. Flat and tall rings are drawn at native size instead (`FXT.RING_H`, `FXT.RING_V`).
- Never tween `player.sprite`. Squash, bob and the cling offset all go through `effects.viewScale`, `effects.viewBob` and `syncView`.
- Don't freeze tweens for an in-play hit-stop. Bone bob tweens move pickup bodies, so freezing them would change gameplay. Hit-stops come from `RunScene.freeze()`.
