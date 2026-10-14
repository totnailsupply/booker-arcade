# Soba Tower — build plan (Level 1)

Created: 2026-10-13
Engine: Phaser 4.2.1 + Vite (same stack as `booker-run/`)
Dev server port: 3001 (`booker-run` uses 3000)
Image-gen budget: $5.00 hard cap; target spend $1.50 or less

## 1. Concept

Soba, a small fluffy tricolor dog, climbs the outside of a tall noodle-house
tower at dusk. Soba bounces automatically on every platform landed on. The
player steers left and right. The camera ratchets upward and never scrolls
down. Level 1 has a fixed street-level start and a finish line at the
rooftop: a temple bell that Soba rings to end the level.

Pillars:

1. **Responsive steering.** Soba turns around immediately, with no slide.
2. **Readable danger.** Every hazard has a tell before it can hurt Soba.
3. **Learnable layout.** The level is the same on every attempt, so players
   improve through practice. The design doesn't depend on luck.
4. **One more try.** A restart is less than one second away. A "best height"
   flag in the world shows the previous record.

## 2. Soba likeness spec

Source photos (in `Soba Assets/`): `IMG_8630.HEIC` (full body, sitting),
`IMG_8732.HEIC` (face close-up), and `IMG_8931.heic` (tongue out, front legs).

Features to keep. These are what make the sprite read as Soba:

- Black body and head with a fluffy, slightly ragged silhouette.
- Tall, upright, pointed ears with a fringe of fur and pink inner ears.
- Tan dot "eyebrows" over each eye and tan cheeks.
- A thin white blaze up the forehead and a white muzzle.
- A big white chest ruff that dominates the front view.
- White front legs and paws. Tan on the back legs, with white toes.
- Warm brown eyes and a pink tongue out in happy poses.
- A plumed black tail.

Style rules. These rules keep the sprite original instead of a traced photo:

- Chibi proportions: the head is about 45% of body height.
- 1 px dark outline (`#1a1220`), a limited palette of 4 shades per material,
  and no photo shading or fur texture noise.
- Text describes the likeness. Photos go to the image model only as a
  likeness reference in an edit call. The prompt states "original pixel-art
  character, not a copy of the photo".
- Frame size is 40x40 px. In-game height is about 34 px, which is about 13%
  of the 270 px screen width.

## 3. Core mechanics

### Screen

- Portrait 270x480 internal resolution, `pixelArt: true`, `roundPixels: true`,
  and `Scale.FIT`. Portrait fits a vertical climb and phones.

### Controls

| Action | Keyboard | Touch | Mouse |
|---|---|---|---|
| Steer left | Left arrow, A | Hold the left half of the screen | Hold the left half of the screen |
| Steer right | Right arrow, D | Hold the right half of the screen | Hold the right half of the screen |
| Pause | Esc, P | Pause button | Pause button |
| Mute | M | Speaker button | Speaker button |

- Jumping is automatic: Soba bounces on landing, as in Doodle Jump.
- Horizontal wrap: leaving one side of the screen enters from the other side.

### Movement tuning

All values go in `Constants.js`:

- Bounce height H = 112 px, time to apex T = 0.44 s.
  Gravity g = 2H/T² ≈ 1157 px/s². Bounce velocity v0 = 2H/T ≈ 509 px/s.
- Fall gravity multiplier: 1.25. This gives a snappier fall without losing
  readability.
- Steering: max speed 190 px/s, acceleration 2400 px/s², and instant reversal
  (velocity is set to 0 when the input direction flips).
  Release deceleration: 1800 px/s².
- Platforms are one-way. Soba collides only while falling (`vy > 0`) and only
  when Soba's feet were above the platform top on the previous frame.
- Landing forgiveness: the foot hitbox is 2 px wider than the visible feet on
  each side.

### Platform types

| Type | Behavior | Tell | First appears |
|---|---|---|---|
| Beam (static) | Bounce | Plain wood | Zone 1 |
| Slider | Moves horizontally between two x values | Rail line under it | Zone 2 |
| Crumble | Holds one bounce, cracks, and falls 0.15 s later | Cracked texture, dust on touch | Zone 2 (late) |
| Spring | Super bounce, 2.2x H | Coiled spring on top | Zone 3 |
| Lift | Moves vertically | Chain above it | Zone 4 |

### Obstacles

| Obstacle | Behavior | Tell | Counter-play |
|---|---|---|---|
| Crow | Flies a horizontal patrol line | Flapping animation, caw SFX when on screen | Land on its head to stomp it (bounce and +50 points). Any other contact hurts Soba. |
| Falling roof tile | Drops from above on a fixed timer | A red flashing mark at the top edge for 0.6 s | Steer out of its column |
| Wind chimes (zone 4) | A static spiky hazard hung between platforms | Always visible | Route around |

### Fail state, lives, and checkpoints

- Soba has 3 lives (paw icons in the HUD).
- Falling below the bottom edge of the screen, or touching a hazard, costs one
  life. Soba then respawns on a floating cushion at the start of the current
  zone. The camera pans back down there over 0.6 s.
- At 0 lives the run ends. The results screen shows height reached, score,
  and best.
- Each zone gate is a checkpoint and restores lives to at least 1. This keeps
  a late mistake from erasing a strong run, but keeps the stakes.

### Score and high score

- Height: 1 m = 16 px. The HUD shows current meters and a progress bar from
  the street to the bell.
- Score = max height (m) × 10 + treats × 25 + crow stomps × 50 + finish
  bonus 1000 + time bonus.
- Stored per level in `localStorage`, with every call in `try/catch`: best
  height, best score, best time, and stars.
- The in-world "BEST" flag on the tower wall marks the previous best height.
  Passing it triggers a "NEW BEST!" pop.
- Stars: 1 for finishing, 1 for finishing with all 3 lives, and 1 for 30 or
  more of the 40 treats.

## 4. Level 1 layout: "Noodle House"

Total climb: about 6400 px (400 m), 70–120 s for a first clear.
The sky shifts from sunset orange to violet to night with stars as Soba climbs.
This shows progress without a menu.

| Zone | Height (px) | Name | Gap (px) | Platform width (px) | New element | Hazards |
|---|---|---|---|---|---|---|
| 1 | 0–1400 | Street & Garden | 40–60 | 64–56 | Steering, wrap | None |
| 2 | 1400–3000 | Balconies | 55–75 | 56–44 | Sliders, then crumbles | None |
| 3 | 3000–4800 | Lantern Roofs | 65–85 | 48–40 | Springs | Crows, roof tiles |
| 4 | 4800–6400 | The Spire | 70–90 | 44–32 | Lifts | Crows, tiles, chimes |
| Finish | 6400 | Rooftop bell | — | Wide landing | — | — |

Rules that keep the level fair:

- The maximum vertical gap is 90 px, or 80% of H. Every gap is reachable
  from a full bounce, with time to steer.
- Each zone opens with a breather: 3 wide static platforms and a banner.
- Each new element is first shown alone and safe. A spring appears with
  nothing above it. Crumbles appear first beside a static fallback.
- No forced crumble-only path before zone 3.

Authoring: the level lives in `src/levels/level1.js` as hand-placed "chunks"
(patterns about 300 px tall), assembled in a fixed order. The layout is
deterministic. `scripts/validate-level.mjs` checks each next platform for
reachability: vertical gap, horizontal distance with wrap, and the moving
platform's worst-case position. The script fails the build gate on any
unreachable step.

## 5. Art plan (image-gen)

Workflow: reuse `booker-run/art/scripts/gen.sh` (it logs every call to
`art/spend.md` with a running total) and adapt `build_assets.py`. The adapted
script cuts frames, box-downscales them, applies one shared palette of
32 colors or fewer, and thresholds alpha. Generate a draft at low quality
first. Pay for medium quality only after the draft looks right.

| # | Asset | Model | Est. cost |
|---|---|---|---|
| 1 | Soba hero (photo-referenced edit), draft + final | gpt-image (transparent) | $0.06 |
| 2 | Animation sheet A: idle, crouch/land, rise, apex, fall | gpt-image | $0.06 |
| 3 | Animation sheet B: lean-steer, hurt, celebrate (2 frames), respawn | gpt-image | $0.06 |
| 4 | Platform sheet: beam, slider, crumble (3 frames), spring (2 frames), lift | gpt-image | $0.05 |
| 5 | Props: crow (2 frames), roof tile, chimes, treat, bell, cushion, best flag | gpt-image | $0.05 |
| 6 | Tower wall, seamless vertical tile | gpt-image | $0.03 |
| 7 | Parallax skyline (far) + lanterns and rooftops (near), transparent | gpt-image | $0.06 |
| 8 | Title card "SOBA TOWER" | gemini-3-pro-image 1K | $0.14 |
| | **Planned total** | | **about $0.51** |
| | Retries and fixes reserve | | $1.00 |
| | **Stop and ask the user if spend reaches** | | **$3.00** |

- The sky gradient and the color shift between zones are code (Graphics
  gradient), not images.
- Every asset has a generated placeholder with the same key and size, as in
  `booker-run` (`Assets.js` + `manifest.json`). The game runs even if an
  image fails.
- UI text uses a pixel bitmap font made in code, with no image cost.

## 6. Code structure

Copy `booker-run` as the base and keep its proven systems: EventBus,
GameState, HighScore, Assets manifest with placeholder fallback, Effects,
AudioManager, MuteButton, Debug URL flags, and the QA scripts. Replace the
runner-specific code:

```
soba-tower/
  src/
    core/        Constants, EventBus, GameState, HighScore, Assets, GameConfig, Debug
    scenes/      Boot, Preload, Title, ClimbScene, Pause, Results
    entities/    Soba, Platform (type strategy), Crow, RoofTile, Chimes, Treat, Bell
    systems/     SteerInput, CameraRatchet, PlatformSpawner (pools + culling),
                 LivesCheckpoint, ScoreSystem, Effects, AutoClimber (test bot)
    levels/      level1.js (chunks), chunks.js
    audio/       AudioManager, music, sfx, AudioBridge
    ui/          Hud (height bar, lives, treats), MuteButton, BestFlag
  scripts/       iterate-client.js, verify-runtime.mjs, validate-architecture.mjs,
                 validate-level.mjs (new), autoplay-check.mjs (rewritten for climbing)
  art/           raw/ (photo refs as PNG), drafts/, scripts/, spend.md
  progress.md
```

Key decisions:

- Platforms are pooled. Only platforms within one screen above or below the
  camera are active.
- The camera scrolls with `scrollY = min(scrollY, soba.y - 0.42 × H_screen)`
  plus a short lerp, so it never moves down during play.
- Wrap: Soba's x changes by ±270 when the body center crosses an edge. A ghost
  sprite draws on the far edge during the crossing.
- `render_game_to_text()` reports mode, Soba's x/y/vx/vy, height in meters,
  lives, zone, the platforms on screen with their type and state, hazards,
  treats, and camera y.
- Debug flags: `?zone=3`, `?y=4000`, `?autoplay=1`, `?debug=1` (hitboxes),
  and `?lives=99`.

## 7. Game feel

- Squash on landing (0.08 s), stretch on rise, and a dust puff on every bounce.
- Spring: a big stretch, a "boing" with a pitch slide, and speed lines.
- Crumble: shake, debris particles, and a crack SFX.
- Crow stomp: 50 ms hit-stop, feathers, and a "+50" pop.
- Hurt: 60 ms hit-stop, a red flash, and a tumble. Then a cushion respawn with
  a blink and 1 s of invulnerability.
- Height milestones every 50 m show a pop. Zone banners show the zone name.
- Finish: Soba lands on the roof, the bell rings with a camera zoom, the sky
  turns to fireworks, and slow motion runs for 0.6 s. Then Results.
- Bounce SFX pitch rises a little per zone. Music adds a layer per zone
  (procedural Web Audio, reused from `booker-run`).

## 8. Build pipeline and gates

Each step runs the QA gate: `npm run build`, `verify-runtime.mjs`,
`iterate-client.js` (3 iterations), `validate-architecture.mjs`, a screenshot
review, and from Step 1 on, `validate-level.mjs` + `autoplay-check.mjs`. A
step gets at most 3 attempts. Progress and decisions go in `progress.md`.

1. **Scaffold and core loop (placeholder shapes).** Copy the base, set the
   portrait config, add steering, the auto-bounce, one-way platforms, wrap,
   the camera ratchet, fall death, lives, height score, and restart. Gate: the
   bot reaches 100 m; 3 restarts in a row behave identically.
2. **Level 1 content.** Add all 5 platform types, 3 obstacles, treats, zones,
   checkpoints, the bell finish, and the level validator. Gate: the validator
   passes, the bot clears the level with infinite lives, and a human playtest
   pass tunes the gap and speed numbers.
3. **Pixel art (image-gen).** Make the Soba sheets first, since the character
   carries the game, then platforms, props, backgrounds, and the title. Check
   hitboxes with `?debug=1` after the art swap. Gate: a contact sheet review
   for likeness against the photos, plus readability at 1x.
4. **Visual polish.** Add everything in section 7, the HUD layout, the title
   screen, and the Results screen with stars and best values.
5. **Audio.** Add music layers, SFX, and mute (M key + button).
6. **Final QA and balance.** Do 5 timed bot runs, review screenshots of every
   zone, and test touch at phone size. Write `progress.md` TODOs for Level 2.

Skipped: deploy and Play.fun monetization. `CLAUDE.md` says to run them only
when the user asks.

## 9. Open decisions (defaults chosen)

| Decision | Default in this plan | Alternative |
|---|---|---|
| Jump model | Automatic bounce, steer only (Doodle Jump) | Manual jump button (Icy Tower) |
| Failure | 3 lives + zone checkpoints | One life, restart from the street |
| Setting | Noodle-house tower at dusk (puns on "soba") | Treehouse, lighthouse, or a city high-rise |
| Finish | Ring the rooftop bell | A giant treat bowl or a flag |
