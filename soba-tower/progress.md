# Progress

Original prompt: Create a plan to build a 2D pixel-art arcade game called **Soba Tower**, inspired by classic vertical platformers like Doodle Jump. The player climbs an increasingly difficult tower by jumping between platforms as the camera scrolls upward. Include simple, responsive controls, progressively challenging platform layouts, moving and collapsing platforms, obstacles, and a high-score system based on height reached. Rather than making it truly endless, structure the game into levels with a defined starting point and finish line. For now, focus exclusively on designing and building the first level, ensuring the gameplay is polished, engaging, and replayable. The player character will be named **Soba**. Use reference images of Soba to create an original pixel-art character and animations that capture their likeness without directly copying the reference images' visual style. Establish a cohesive, charming pixel-art aesthetic across the environment, character, and UI. Use `/image-gen` to generate game assets where beneficial. **Total image generation budget: $5.** Prioritize gameplay mechanics, responsive movement, satisfying animations, and an enjoyable difficulty curve.

Follow-up: "Execute" (build the plan in PLAN.md with its defaults).

Engine: 2d (Phaser 4.2.1, Vite), base copied from ../booker-run
Created: 2026-10-13
Dev server: http://localhost:3001 (`npm run dev`, strictPort)
Plan: PLAN.md (source of truth for design numbers)

## Pipeline Status

- [x] Step 1: Scaffold and core loop (placeholder shapes)
- [x] Step 2: Level 1 content (platform types, obstacles, zones, finish, validator)
- [x] Step 3: Pixel art (image-gen). Art generated in parallel with Step 1; installed in public/assets/ during Step 2 (see "Step 2 notes")
- [x] Step 4: Visual polish (code-only, no image generation; see "Step 4 notes (visual polish)")
- [x] Step 5: Audio (procedural Web Audio, zero deps; see "Step 5 notes (audio)")
- [x] Step 6: Final QA and balance (see "Step 6 notes (final QA and balance)")
- [ ] Monetize: skipped (CLAUDE.md: only when the user asks)

## Decisions

- Defaults from PLAN.md section 9: auto-bounce + steer, 3 lives + zone checkpoints, noodle-house tower at dusk, rooftop bell finish.
- Soba photo refs converted to PNG in art/raw/ (soba_IMG_8630 full body, soba_IMG_8732 face, soba_IMG_8931 tongue/legs).

- Art generated in parallel with Step 1 (code untouched): all 20 contract keys in art/out/ + art/out/manifest.json, $0.327 spent (art/spend.md). Rebuild: `cd art && python3 scripts/build_assets.py`. Installed in public/assets/ during Step 2 (see Step 2 notes).
- Art deviations to handle at integration: soba has 12 frames (extra `sit` [11]); rise/celebrate[0] are 36 px tall, crouch 25 px, steer 23 px (same scale, shared baseline); celebrate[0] and sit face the viewer; slider plank fills top ~7 rows with wheels below; roof art is bottom-aligned 46 px inside the 64 px frame, deck surface at y≈31.
- Orchestrator art review: likeness passes (ears, blaze, tan cheeks, chest ruff, white front paws). Weakest: chimes (thin), Soba contrast against open navy sky at the top (consider a light rim in code).

## Step 1 notes (scaffold and core loop)

QA commands (dev server on 3001):
- `node scripts/iterate-client.js --url "http://localhost:3001/?lives=1" --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate` (`npm run iterate`). Every iteration ends in `mode: "game_over"` (Results). With the plain URL (3 lives) each iteration costs one life and iteration 3 ends in game_over.
- `node scripts/autoplay-check.mjs` (`npm run autoplay`): bot climbs to the bell, exit 0. Options: `--query zone=2`, `--query "y=600&debug=1"`, `--no-manifest`, `--allow-falls`, `--url`.
- `node scripts/sim-climb.mjs` (`npm run sim`): same bot + physics in node, no browser, 4 frame rates, < 1 s.

Files: removed RunScene, LevelCompleteScene, JumpInput, AutoPilot, Player. New: core/Kinematics.js, entities/{Soba,Platform,Bell}.js, systems/{SteerInput,PlatformSpawner,CameraRatchet,LivesCheckpoint,AutoClimber,Backdrop}.js, scenes/{ClimbScene,ResultsScene}.js, scripts/sim-climb.mjs. Rewritten: Constants, Assets, EventBus, GameState, HighScore, Debug, GameConfig, main.js, ScoreSystem, Effects (slim), Hud, Title/Pause/Preload scenes, AudioBridge, level1.js, autoplay-check.mjs, example-actions.json.

Decisions:
- No Arcade Physics. Soba is kinematic (`core/Kinematics.js`, pure functions shared by the game, the bot and node scripts). Exact constant-gravity integration per frame, split at the apex (rise g = 1157, fall g = 1446, v0 = 509, apex 112 px at 0.44 s). Steering: 190 px/s max, accel 2400, release decel 1800, instant reversal (vx = 0 when the direction flips). All numbers + derivations in Constants.js (BOUNCE, STEER).
- World coords: y down, street surface y = 0, so the climb is negative y; height px = -y; 1 m = 16 px. Level data is authored in HEIGHT px (positive up), x = platform centre.
- One-way landing (`findLanding`): swept test every frame. Feet were at or above the platform top last frame (prevY, so lifts work), at or below it now, vy > 0, and |wrapDelta(x, p.x)| <= w/2 + 8 + 2 (paws 16 px + 2 px forgiveness per side). The highest crossed top wins. Snap the feet to the top and set vy = -v0 * velocityMult. Order per frame: platforms record prevY and move, Soba steps, landing test, lives, camera, fail test, render.
- Wrap: x wraps mod 270 as soon as the centre crosses an edge. The landing test uses the wrapped shortest distance, so the ghost half counts. A ghost sprite copies frame/flip/scale when the centre is within 20 px of an edge.
- Camera (CameraRatchet): target = min(target, centreY - 0.42 * 480), smoothed with 1 - exp(-10 dt), never moves down during play. Clamped to show at most 40 px below the street and 170 px above the roof. `panTo()` eases 0.6 s for respawns, then resets the ratchet target there.
- Fail = Soba's art (feet - 36 px) fully below the view's bottom edge. LivesCheckpoint: lose a life, 300 ms beat, a cushion spawns at the checkpoint zone's `respawn` point, the camera pans there, Soba bounces off the cushion (it fades after one bounce), 1 s blink invulnerability. 0 lives -> game over -> Results immediately (the fall is the beat). Landing at or above a zone's startY = gate = checkpoint and lives >= 1, plus a banner and a lantern rope on the facade.
- Height: `maxHeightM` = highest surface LANDED on (so an idle Soba bouncing on the street scores 0). The HUD shows it, the score uses floor(maxHeightM) * 10. The roof landing counts.
- Platforms: `entities/Platform.js` has a PLATFORM_TYPES strategy table (texture, composed, init, update, onBounce -> {velocityMult | finish}, predictX). Current types: beam, roof (finish), cushion (fades after one bounce), street (invisible full-width floor). PlatformSpawner keeps every logical platform and activates those within one screen (480 px) of the view; views are pooled Images. Composed platform textures (`plat-beam@48` etc.) are built once from the 3-frame [cap, mid, cap] sheet (works for placeholders and loaded PNGs).
- Finish (Step 1, superseded in Step 2: roof at 6400 px, deck from the roof art, no stilts): roof platform at 1736 px (108.5 m), 208 wide. The bell hung on code-drawn stilts 34 px above the roof. Landing on the roof -> mode complete, bell rings, celebrate 1.1 s, then Results.
- Score / stars (ScoreSystem): + 1000 finish, time bonus 500 at par (finish height / 60 px/s = 28.9 s for the temp level) down to 0 at 2x par. Stars: finish, no life lost, >= 75% treats. HighScore per level: {height, score, time, stars}, every storage call in try/catch. Debug starts (?autoplay, ?y, ?zone) never save.
- Deterministic test clock (main.js): the first `window.advanceTime(ms)` call sleeps Phaser's RAF loop and steps `game.step(t, 1000/60)` round(ms / 16.67) times. It also makes `Date.now()` virtual (Phaser's TweenManager reads Date.now). One scripted frame = one game frame, so iterate-client runs are identical every time. Real-time scripts (autoplay-check, humans) never call advanceTime and keep the normal loop.
- QA actions (scripts/example-actions.json, 491 frames): right (start/retry), idle, left 12 (onto the trellis at x=72), idle 220 (the trellis climbs itself to 18 m, score 180), right 11 (step off the trellis into the empty drop zone x 114-148), idle (fall -> game over). A node search confirmed any right tap of 6-16 frames falls at every start offset 15-75 frames.
- Level 1 (temporary): zone 1 Street & Garden 0-1400 (trellis column of 6 beams at x=72, then a zigzag with wraps at 340, 588, 740, 1104; gaps 42-60, widths 64 -> 56), zone 2 Balconies opening (3 wide breather beams 1444/1496/1548, then 1606/1666, gaps 52-60, widths 56/48), roof 1736. The bot clears it in ~12.4 s, 20 bounces. The first beam is not above the spawn, so an idle Soba stays on the street with score 0.
- Placeholders: one PLACEHOLDER_DRAW table in Assets.js for every contract key (soba 10x 40x40 poses, plat-beam/slider/crumble/crumble-cracked/lift 3x 8x12, spring, crow, roof-tile, chimes, treat, bell, cushion, best-flag, paw, wall 192x192, skyline, street, roof). The Soba placeholder is a pixel-drawn tricolor dog with an auto 1 px #1a1220 outline. The sky is code-only: 4 px bands coloured by world height (orange -> rose -> violet -> night), stars fade in high up, a banded sun sets behind the skyline.
- Art manifest compatibility: `registerAnimations(scene, resolved)` uses a manifest entry's `"animations"` frame lists when the sheet loaded from a file (art/out uses a 12-frame layout: fall [5,6], steer 7, hurt 8, celebrate [9,10], sit 11). Verified by routing /assets/* to art/out in Playwright: all 20 keys load, anims map correctly, no errors. Not copied to public/assets (Step 3).
- Audio: kept booker-run's engine. AudioBridge remaps SOBA_BOUNCE -> jump blip, SOBA_FELL -> death, ZONE_CHANGED -> section layer + whoosh, SOBA_RESPAWN -> whoosh, LEVEL_COMPLETE -> fanfare + woof. Mute: M + HUD/title/results button, stored under `soba-tower:muted`.

## Step 2 notes (Level 1 content + art integration)

QA commands (dev server on 3001), all green at the end of Step 2:
- `node scripts/iterate-client.js --url "http://localhost:3001/?lives=1" --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate`: 3/3 identical, `mode: "game_over"`, score 180, `result.livesStart` 1.
- `node scripts/autoplay-check.mjs`: RANG THE BELL, 0 lives lost, 55.7 s, score 6250, 28/40 treats, 1 stomp (same numbers as the headless 60 fps sim). `--no-manifest --query y=4700` also rings the bell. No `--allow-falls` needed.
- `node scripts/sim-climb.mjs` (`npm run sim`, ~15 s): expert bot clean at 60/30/144/45 fps and 12/12 runs with real-time-like frame spikes; sloppy-bot curve (below).
- `node scripts/validate-level.mjs` (`npm run validate-level`, `--verbose` lists every route step, dodge window and waiting spot): OK, 98 route steps, 25 hazard steps.
- `node scripts/validate-architecture.mjs`: 5/5.
- Screenshots: `node scripts/fx-shots.mjs --query "zone=3&autoplay=1&debug=1&lives=99" --shots 1500,4000` (rewritten for Soba: `--title`, `--keys left:200:400`, `--no-manifest`, `--scale`), and the new `node scripts/event-shots.mjs --query "y=2340&autoplay=1&debug=1" --events "climb:crumble+1,climb:crumbleFall+8"` (deterministic test clock, shot N frames after an EventBus event; `--best 30` fakes a stored best, `--hit-at 1.5` forces a hit).

Art integration (Part A):
- `public/assets/`: the 20 contract PNGs + `manifest.json` copied from art/out (not preview.png / soba_vs_photo.png). All 20 keys load from files; `--no-manifest` still falls back to placeholders for every key.
- Soba: 12-frame sheet via the manifest "animations" lists; new `soba-sit` anim (frame 11) used on the game-over Results screen (celebrate after a clear). Origin stays at the feet (every art frame has its feet on row 39). Frontal frames (celebrate[0], sit) are just mirrored when facing left.
- Hitboxes checked against the art (python masks + `?debug=1` crops): Soba FOOT_W 16 -> 18 (fall-pose paws span 19 px) + 2 px forgiveness per side; hurtbox 20x28 -> 16x24 (inside the art). Crow hurtbox 10x6 (95-97% opaque in both flap frames, either facing), stomp zone = whole crow width + landing box, from its head (centre-8) down to its centre. Roof tile 6x6 (>= 94% opaque at every angle of its +-20 deg wobble; a full spin would swing the art off the box, so tiles rock instead of spin). Chimes 8x10 over the tubes, static while the art sways +-7 deg.
- Readability: crow, roof tile, chimes and the spring get a baked 1 px cream rim (`Assets.buildRims`, textures `*-rim`, 1 px padding per frame) — the crow was near-invisible on the dark facade and the night sky.
- Slider plank: landing surface is row 0; a faint rail is drawn under the wheels (row 11) across the full travel. Lift: two chains from an anchor bar 56 px above its highest top.
- Roof: the art is placed so its drawn deck (row 32, `PLATFORM.ROOF_DECK_ROW`) is the roof platform's top; the roof platform itself is invisible (208 wide, x 31-239). The placeholder roof is redrawn with the same layout.
- Bell: stilts removed; the 48x48 gate stands on the back of the deck behind Soba. Ringing = 1 px shake + small squash (no rotation), a warm glow and 3 sound-wave rings (1 px circles redrawn per tween step). On landing, Soba hops 38 px to the side so she never hides the bell, and faces it.

Code (Part B/C/D):
- New: `systems/ClimbSim.js` (the whole frame of rules, Phaser-free: the scene and the node scripts run the same code), `systems/HazardSystem.js`, `entities/{Crow,RoofTile,Chimes,Treat}.js`, `core/Hitboxes.js`, `ui/BestFlag.js`, `levels/chunks.js`, `scripts/{validate-level,event-shots}.mjs`.
- Rewritten: `entities/Platform.js` (slider, crumble, spring + springpad, lift), `systems/AutoClimber.js`, `scenes/ClimbScene.js` (thin wrapper around ClimbSim), `entities/Bell.js`, `systems/Effects.js`, `levels/level1.js` (assembles chunks), `scripts/{sim-climb,fx-shots}.mjs`.
- Headless-capable: Soba, CameraRatchet, PlatformSpawner, HazardSystem, TreatField all take `scene = null`.

Decisions:
- Moving things are pure functions of the world clock (`ClimbSim.time`, advances while playing/respawning/complete): sliders and lifts ping-pong at constant speed (`Kinematics.pingPongPos`), crows patrol the same way. `xAt(T)` / `yAt(T)` / `poseAt(T)` answer "where at time T", so culling never changes positions and the bot / validator predict exactly.
- Spring = a 'spring' beam + a separate 16 px 'springpad' platform 7 px above it (the compressed spring's top). The swept landing test hits the pad first when the paws are over it: velocity x sqrt(2.2) (apex 246 px). Rest frame 0 (compressed); a hit shows a squashed frame 0 for 70 ms, then frame 1 (extended) for 420 ms.
- Crumble: one bounce -> 'cracked' (cracked texture, 1 px shake) -> 0.15 s later 'falling' (not solid, view drops + fades, debris) -> 'gone'. Restored for every respawn (`ClimbSim.resetForRespawn`), as are roof tiles above the respawn point. Stomped crows stay gone (the +50 was earned); treats stay collected.
- Crow contact: falling + feet came from above its centre + reached its head + within the stomp width = stomp (bounce, +50, it tumbles off-screen). Any other overlap = hit. Stomps work while invulnerable; hits don't.
- Roof tile: triggers when Soba's feet are within 160 px above its trigger height (a start or respawn far above never sets it off; `?zone=` / `?y=` starts mark lower tiles spent). 0.6 s warning: a red triangle under the HUD in its column, blinking, with a dotted red column guide; then it drops from just above the view (v0 160, g 1000, max 700 px/s).
- Hit = lose a life: Soba pops up and tumbles (hurt frame) for 0.55 s, red camera flash + small shake, then the usual cushion respawn. A fatal hit tumbles 0.7 s before Results; a fatal fall still goes straight to Results (the QA path).
- Score par: `LEVEL1.parS = 80` s (expert bot 53-57 s, sloppy median clear 82 s). Stars unchanged (finish, no life lost, >= 30/40 treats). `result.livesStart` = actual starting lives (`gameState.livesStart`).
- render_game_to_text adds `zoneName`, `worldTime`, `hazards[] {type, x, y, state, ...}` (on screen + any warning tile), `treatsOnScreen[] {x, y, off?}`, `treatsCollected` / `treatsTotal`, `stomps`, `bestFlagM`.
- Title: logo art, text rows moved above Soba's bounce arc (all text < y 290, arc >= y 296) on a translucent panel, depth above Soba, prompt blink 1.0 <-> 0.6. HUD: biscuit counter top-centre; progress bar on a dark backing (platforms near the right edge still pass under it — wrap play needs the full width).
- Audio placeholders (Step 5 replaces): stomp = land + woof, spring = whoosh, crumble = land, tile warning = click, new best = bone.

Level 1 "Noodle House" (validate-level summary; 99 platforms, 15 hazards, 40 treats, roof 6400 px = 400 m):
| Zone | Heights | Platforms | Hazards | Treats (off-path) | Gaps | Widths |
|---|---|---|---|---|---|---|
| 1 Street & Garden | 0-1400 | 27 beams | none | 10 (1) | 44-60 | 56-64 |
| 2 Balconies | 1400-3000 | 16 beams, 8 sliders (40->82 px/s), 5 crumbles | none | 10 (2) | 52-74 | 48-64 |
| 3 Lantern Roofs | 3000-4800 | 18 beams, 2 springs, 1 slider (78), 1 crumble | 4 crows, 4 tiles | 10 (2) | 52-78 (spring 179-181) | 40-64 |
| 4 The Spire | 4800-6400 | 15 beams, 4 lifts, 1 slider (85), 1 spring (onto the roof) | 3 crows, 3 chimes, 1 tile | 10 (3) | 52-90 (spring 117) | 32-64 |
- Chunk order (level1.js): z1 garden-trellis, first-wrap, garden-zigzag, garden-wraps, garden-gate-run (Step 1 layout; only the last two beams moved up for a 68 px gate step). z2 breather, slider-intro, slider-pair, slider-run, crumble-intro, balcony-mix, balcony-finale. z3 breather, spring-intro, crow-intro, tile-intro, roof-crows, lantern-steps, lantern-top. z4 breather, lift-intro, chimes-intro, spire-lifts, spire-chimes, spire-mix, spire-top.
- First appearances, each alone: slider 1664, crumble 2396 (beside a static beam), spring 3212 (nothing above it for 188 px), crow 3590 (patrols off the route), tile 3752 (falls on an empty column), lift 4990, chimes 5250 (off the route).
- Off-path treats: the left-edge wrap detour (z1), two over side-branch crumbles (z2), two just above crow lines (z3), under the first chimes, beside a crow, by the last crow (z4).
- Zone-2 crumbles are side branches except the finale pair (the quick line) which has a static line beside it; the validator proves zone 3 is reachable with no crumble at all.

Validator rules (`LEVEL_RULES`): gap <= 90 (spring <= 197) and below the apex; lateral need <= 85% of the reach left after a 0.12 s reaction (190 px/s with accel); sliders/lifts at their worst positions (9 samples each end to end); every route step near a crow/chimes has a hazard-free departure (32 departure times x 3 landing spots); every static route platform under a crow/chimes has a safe spot to bounce in place; tiles leave >= 12 px of landing room; zone type/hazard rules, 3 wide breather beams per gate, cushions clear, 40 treats.

Difficulty curve (sloppy bot, `node scripts/sim-climb.mjs --runs 150`; 99 lives so every run sees every zone):
| Zone | Falls | Hits | Lives lost / run | Runs that lose a life |
|---|---|---|---|---|
| 1 Street & Garden | 3 | 0 | 0.02 | 2% (all at the first wrap off the trellis) |
| 2 Balconies | 9 | 0 | 0.06 | 6% (mostly after taking a crumble branch) |
| 3 Lantern Roofs | 31 | 53 | 0.56 | 38% |
| 4 The Spire | 3 | 108 | 0.74 | 43% |
- Hits by hazard: chimes 64, crow 60, tile 37; 148 stomps. Median clear 84 s, median 31/40 treats.
- Real rules (3 lives, gates restore to >= 1), 150 runs: 131 finished (87%), all of them with <= 3 lives lost; median 1 life lost; game overs in zone 3: 6, zone 4: 13; 45 three-star runs.
- Default 50-run output (what `npm run sim` prints) agrees: 0% / 4% / 42% / 44%, 78-82% finish.
- Sloppy model (Constants.SLOPPY): 0.15 +- 0.04 s reaction after every new plan (never stacked), 10% hesitations of +0.08-0.25 s after a bounce, 7 px aim error, late releases, +-0.3 s timing error on moving platforms, 12% random target picks, reach judged 0.85-1.08x, 18% of plans with no hazard check.
- Tuning history: chimes first hung 112 px over beams (sloppy bot trapped: 21 hits/run) -> 152 px (only the head at the apex grazes them); crows moved off apex height over beams that had no safe waiting spot; the tile that dropped onto the next beam's column now triggers on landing there; the final tile over the spring was removed; the zone-2 finale got a crumble pair (zone 2 was 0-1%).

AutoClimber (expert, ?autoplay=1): plans with a forward simulation of its own controller against predicted hazards, two bounces deep (a landing only counts as safe if some next flight, staying included, is safe), re-checks every 3 frames, 3 px hazard margin, stomps count as safe, lift landing times by fixed-point iteration.

## Step 4 notes (visual polish)

QA commands (dev server on 3001), all green at the end of Step 4:
- `node scripts/iterate-client.js --url "http://localhost:3001/?lives=1" --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate`: PASSED, 3/3 identical (`game_over`, score 180, 18 m, `livesStart` 1), no listener build-up.
- `node scripts/autoplay-check.mjs`: RANG THE BELL, resumes 0, score 6250, 28/40 treats, 1 stomp, 55.7 s: the same numbers as before Step 4 (hit-stop / slow motion don't change outcomes).
- `node scripts/validate-level.mjs`: OK. `node scripts/sim-climb.mjs`: OK. `node scripts/validate-architecture.mjs`: 5/5 (the magic-number WARN is the old one).
- New: `node scripts/zone-tour.mjs [--heights 40,1380,3000,4780,6300] [--frames 20] [--phone] [--no-manifest]` (canvas shots at any height via `?y=`; `--phone` = 390x844 @2x; prints console warnings), `node scripts/restart-check.mjs` (finale -> Results -> retry and hit -> game over -> retry: zoom 1, origin 0.5, tween/clock time scales 1, listener counts unchanged; prints "clean"), `node scripts/fps-probe.mjs [--query ...] [--eval "<js>"]` (samples `game.loop.actualFps`; headless Chromium renders in software and sits at ~48-53 fps with or without the Step 4 layers, and with ClimbScene.update disabled, so it measures the harness, not the game).
- `scripts/event-shots.mjs` now accepts several offsets per event (`climb:spring+1,climb:spring+8`) and logs renderer crashes / disconnects.
- Best before/after: zones `output/qa-step23/02-zone{1,3,4}.png` -> `output/zone-tour/a/h{1380,3000,4780,6300}.png`, `output/zone-tour/b/h{0040,5200}.png`; finish `output/qa-step23/05-finish-ring-2.png` -> `output/fx4/fin/01-level-complete-f166.png`, `output/fx4/fin3/01-level-complete-f256.png`; Results `output/qa-step23/05-finish-results.png` -> `output/fx4/res/02-level-complete-f386.png`; title `output/qa-step23/01-title.png` -> `output/fx4/title/shot-02-2200ms.png`; crumbles `output/fx4/crum2/h2560.png`; tile/chimes `output/fx4/z3b/{tilecrop,chimecrop}.png`; phone `output/fx4/phone/h5200.png`.

Files: new `core/VisualBake.js`, `systems/{SobaJuice,Ambient,Finale}.js`, `scripts/{zone-tour,restart-check,fps-probe}.mjs`. Rewritten `systems/Effects.js`, `systems/Backdrop.js`, `ui/Hud.js`. Edited `scenes/{ClimbScene,TitleScene,ResultsScene,PreloadScene}.js`, `ui/BestFlag.js`, `entities/RoofTile.js` (warning column only), `core/Constants.js` (Step 4 block at the end: JUICE, BURST, ZONE_LOOK, AMBIENT, PROGRESS_FX, FINALE, DANGER, RESULTS_FX, TITLE_FX; RESULTS_LAYOUT re-spaced), `core/EventBus.js` (Step 4 events), `scripts/event-shots.mjs`.

What was added:
- Zone identity (`VisualBake.bakeZoneWalls`, baked once in PreloadScene): the 8-colour wall tile is recoloured per zone palette (`ZONE_LOOK.PALETTES`; any other colour, e.g. the placeholder art, gets the zone's multiply tint) and composed over each zone's whole height into `wall-z1..z4` (192 x 1475..1950 px, ~5 MB total), so details don't repeat every tile. Windows are found as connected components (panes merged within 3 px) and lit per zone (100 / 86 / 95 / 30%; zone 4 some TV-blue). Zone 1: ivy + planter boxes with flowers; zone 2: balconies under 70% of the windows, cooler walls; zone 3: plum walls, red lacquer trim with gold studs, red lanterns; zone 4: night-blue, mostly dark windows, the spire narrows to x 25..174 of the facade, a moonlit left edge and a shadowed right edge. Each zone fades in over the zone below with a 4x4 ordered dither across 150 px centred on its gate; a zone's top extension only covers the next zone's column.
- Gates: a pagoda eave band (240 px, composed from the roof art: the curled 30 px end caps + a 36 px bracket strip, rows 25..63) centred on each gate line, with a hanging lacquer sign `N · ZONE NAME` at x 86 (the old rope + label is gone). Paper lantern strings (rope texture + 6 swaying lanterns, culled off-screen) at 130 px (the street) and 7 heights in zone 3. A moon (screen space, parallax 0.05, fades in with the night sky) hangs left, half behind the spire. Stars twinkle.
- Ambient particles (`systems/Ambient.js`, one capped emitter per kind, spawned around the view, mixed near gates): leaves + petals (1), steam wisps (2), additive warm motes (3), wind streaks (4). Depth RIG - 1: behind platforms.
- Soba (`systems/SobaJuice.js`, runs after soba.render each frame, copies everything to the wrap ghost): landing squash 1.24 x 0.76 blending into a speed stretch while rising (up to +9%) and falling (+5%), spring stretch 0.72 x 1.38, a 7 deg lean into the steering direction, a 480 deg/s tumble spin around her centre while hurt, and a 1 px light rim sprite (`soba-rim`, baked outline-only frames) that fades in over the 320 px below the zone-3 gate (max alpha 0.7).
- Effects (`systems/Effects.js`): dust puff on every bounce (bigger on springs) + speed lines trailing a spring launch; crumble crack dust + chips, drop debris + dust, idle crumbles shed a grain every 0.8-1.7 s; slider/lift turnaround puffs on screen; stomp = 50 ms hit-stop + white flash on the crow + feathers + a small shake + "+50"; treat = sparkles + "+25" + the biscuit flies to the HUD counter (the counter updates and bumps on arrival); hurt = 60 ms hit-stop + white flash on Soba + a red overlay (max alpha 0.4) + shake + stars + tumble; respawn = dust ring; near-miss = whoosh lines; pulsing red additive glow behind falling roof tiles and chimes; milestone events every 50 m.
- Readability: roof tiles recoloured teal -> terracotta with a hot yellow-orange rim, chimes re-rimmed hot orange (crows keep the cream rim), stronger tile warning column (3 px, alpha 0.62 / 0.34); idle crumbles 32% paler with hairline cracks baked into each [cap, mid, cap] frame (clearly different from beams at phone size).
- Progress: "100 m!" pop under the HUD band + a gold punch on the height readout; zone ribbon slides in (Back ease), holds 1.3 s, slides out, at y 338 (below Soba's anchor line, so the platforms she's heading for stay clear), alpha 0.8; NEW BEST: the flag flutters, confetti bursts from it and rains from the top, "NEW BEST!" at y 300 with a wobble; the flag/line stay on the facade on the narrower spire.
- Finish (`systems/Finale.js`): bell rings, the camera zooms to 1.4 around the bell (zoom origin moved to the bell's screen position), 0.6 s of slow motion at 0.35 (sim dt + tweens + effect emitters, easing back over the last third), the HUD fades, 7 rocket + burst fireworks over the roof, Soba celebrates; Results 2.7 s after landing (a fresh key / tap after 0.9 s skips).
- UI: HUD band alpha 0.62 + a light edge line; Title: the camera eases 360 px down the tower to the street (skyline parallax shows), the logo drops in and bobs, Soba sits by the noodle-shop door (breathing) and springs up when the game starts, leaves drift; Results: rows re-spaced (5 breakdown lines end ~314, BEST at 334), each star sits over its reason icon (bell / paw / biscuit, dim when missed), earned stars pop in with sparkles, the score counts up.

Step 4 EventBus events (all `fx:*`, emitted for audio; payloads are stable, audio hooks the starred ones):
| Event | Payload | When |
|---|---|---|
| FX_MILESTONE* `fx:milestone` | { meters, heightPx } | max height passes 50, 100 ... 350 m (not at a debug start's own height, not at the roof) |
| FX_HIT_STOP `fx:hitStop` | { ms, cause: 'stomp'\|'hit' } | the sim freezes (50 / 60 ms) |
| FX_NEAR_MISS* `fx:nearMiss` | { hazard, x, y, gap } | a live hazard's closest approach was within 7 px of Soba's hurtbox and it moved away without a hit (1.5 s cooldown per hazard) |
| FX_TREAT_ARRIVE* `fx:treatArrive` | { treats, total } | the flying biscuit reaches the HUD counter (~0.42 s after climb:treat) |
| FX_PLATFORM_TURN* `fx:platformTurn` | { type: 'slider'\|'lift', x, y } | an on-screen mover turns around |
| FX_CONFETTI `fx:confetti` | { x, y } | right after climb:newBest |
| FX_FINISH_ZOOM `fx:finishZoom` | { x, y, zoom } | roof landing, the zoom starts |
| FX_SLOWMO `fx:slowmo` | { scale, ms } | slow motion starts (0.35, 600) and ends (1, 0) |
| FX_FIREWORK* `fx:firework` | { index, x, y, color } | each burst (7, 330 ms apart from 0.3 s) |
| FX_RESULTS_STAR* `fx:resultsStar` | { index, earned } | an earned star pops on Results |
| FX_SCORE_TALLY* `fx:scoreTally` | { score, done } | Results count-up starts / ends |

Decisions:
- Hit-stop and slow motion: `Effects.simScale(realDt)` returns 0 (frozen), the slow-mo scale or 1, and ClimbScene runs `sim.step(dt * k)`. The whole sim pauses together, so every rule plays out exactly as without it (autoplay numbers unchanged). Juice, effects, the finale and the Results timer run on real time.
- Squash/stretch is procedural per frame (no tweens on Soba's scale), so it never fights other tweens and the ghost/rim copy it exactly.
- Textures are derived at load (tints, palette swaps, outlines, composition); no new image files. `bakeVisuals` is idempotent (textures survive restarts).
- The HUD shares the main camera, so the finale fades it out instead of letting the zoom scale it (no second UI camera).
- Pops ("+50"/"+25") sit 30 px beside the action toward the screen centre (they hid Soba when centred on her).

## Step 5 notes (audio)

QA commands (dev server on 3001), all green at the end of Step 5:
- `node scripts/audio-check.mjs` (rewritten for Soba Tower, ~4 min, normal autoplay policy so the gesture unlock is real). Parts: A title/gesture/mute (button, M, persisted across reload)/start/zone-1 music/muted SFX skip/pause/hidden tab; B 3 game-over -> retry cycles on the test clock (`?lives=1`, example-actions.json); C `?zone=3&autoplay=1` layers + caws + the zone-4 gate; D `?zone=4&autoplay=1` night layers, drive, bell + duck, win fanfare -> calm loop; E audio blocked (no AudioContext / constructor throws: the game plays silently, no errors). `--only A,C` picks parts; `--levels` renders every music layer set and SFX offline (`src/audio/offline.js`) and prints peak / RMS at the master before the limiter. A part reruns (up to 3 tries) when Chromium is killed or Vite reloads the page. Last run: 87 ok, 0 fail, max liveSequencers 1, no console errors.
- `node scripts/iterate-client.js --url "http://localhost:3001/?lives=1" --actions-file scripts/example-actions.json --iterations 2 --screenshot-dir output/iterate`: PASSED; state ends `audio.track: "results"`, `intro: "lose"`, liveSequencers 1.

Files (all in `src/audio/` + `AUDIO` in Constants.js): `synth.js` (new: envelopes, tone/noise/pluck/flute voices, yo/In scales, reverb impulse), `music.js`, `sfx.js`, `AudioManager.js`, `AudioBridge.js` (rewritten), `offline.js` (new, dev-only, never imported by the game), `scripts/audio-check.mjs` (rewritten). `ui/MuteButton.js` unchanged (it already emits AUDIO_TOGGLE_MUTE, redraws on AUDIO_MUTE_CHANGED, unsubscribes on shutdown).

Mix (dB, `AUDIO`): per-layer gains (`MIX`: lead -6, bass -8, taiko -7, shaku -10, flute -15, drone -15, arp -17, kakko -19, tick -22, chappa -23, hats -24) with pans and reverb sends -> music bus -5 -> duck -> master -1 -> limiter (threshold -3, ratio 20, knee 2, 2 ms / 150 ms). SFX: one group gain per play (+-1.2 dB, +-4% pitch, optional pan from world x, max +-0.5) -> SFX bus -2 -> master. Reverb: generated 2.4 s stereo impulse -> return -8 -> master; sends on the bell, gong, chimes, treat, koto lead, flutes. Duck: music -4 dB, 40 ms attack, under a hurt (hold 0.35 s, release 0.6 s) and the bell (hold 1.2 s, release 1.2 s); overlapping ducks extend the hold.
- Measured (pre-limiter dBFS): music loud RMS -20.3 to -21.6 in every track/zone, peaks -5.9 to -9.2, never over the limiter threshold. SFX peaks: bell -3.6 (the loudest), gate gong -5.6, crack -8, stomp / hurt -8.4, spring -11.4, caw -11.9, clack/clink -12, bounce -13.5, treat -13.7, newBest -13.9, tile pips -14.5, firework -14.7, chimes -17, debris -18, near-miss -19, counter -23, turn -25.

Music (`music.js`): D tonic, melodies stored as scale degrees so one tune plays in the yo scale (D E G A B) or the In scale (D Eb G A Bb). 16-bar loop = phrase A + phrase B over D D G A E G A D. Koto lead = triangle + a little square, a fast pitch drop from 2.5% sharp, a closing lowpass, no sustain; `^` notes bend up a whole tone (oshide). Look-ahead scheduler (25 ms setInterval, 120 ms ahead on the AudioContext clock). Vertical layers change on the next bar line:
| Track | bpm | Scale | Layers |
|---|---|---|---|
| title | 92 | yo | soft koto, long bass, D/A drone, shakuhachi answers |
| zone 1 | 110 | yo | koto + soft bass |
| zone 2 | 112 | yo | + walking bass, taiko, 8th hats, kakko woodblock |
| zone 3 | 116 | yo | + matsuri taiko with bar-8 fills, 16th hats, chappa cymbals, koto arpeggio, fue doubling the long notes |
| zone 4 | 118 | In | night: phrase A only, darker lead, drone, heartbeat taiko, ticking woodblock |
| zone 4 drive | 118 | In | from 88% of the climb: driving 8th bass, busy taiko, 16th hats, arpeggio, phrase B back |
| results | 96 | yo / In | horizontal re-sequencing: intro segment (win: 2-bar fanfare at 120, a yo run + open strum; lose: a 2-bar In-scale fall at 76 + a low shakuhachi breath), then a calm loop (yo after a win, In after a loss) |

SFX (`sfx.js`), event -> sound:
| Event | Sound |
|---|---|
| SOBA_BOUNCE | boing-pat (paw pat + rising sine, +1.5 semitones per zone); spring pad: big "boyoyoing" (triangle slide with a decaying 14 Hz wobble + twang + whoosh); slider: wood clack-clack; lift: metal clink; cushion / crow: silent (respawn / stomp cover them) |
| SOBA_BOUNCE (+ LEVEL1 hazards) | crow caw when a crow will scroll on screen this flight (once per crow per try, 1.5 s apart); chimes tinkle when Soba bounces near them |
| CRUMBLE / CRUMBLE_FALL | crack + snap + creak / pebble ticks + falling rumble |
| STOMP | squawk + thump + feather puff |
| TREAT_COLLECTED | two-note chime; pickups < 1.2 s apart step up D6 E6 G6 A6 B6 D7 |
| TILE_WARN | alarm pips at 0 / 0.2 / 0.4 s (the marker's bright blinks), whoosh at 0.6 s as it drops (cancelled on pause / game over) |
| SOBA_FELL | hit: yelp + bump + music duck (chimes hit: all five tubes); fall: falling whistle + whoosh; 0 lives: music fades 0.35 s |
| SOBA_RESPAWN | short rising whoosh + soft pop + sparkle |
| ZONE_CHANGED | gong (D3, inharmonic blooming partials) + koto strum D5 A5 D6 E6; music layer on the next bar |
| FX_MILESTONE | koto A5 -> D6 (skipped when a zone gate lands on the same landing) |
| NEW_BEST | koto run D6 E6 G6 A6 -> D7 |
| LEVEL_COMPLETE | temple bell: D4 prime, D3 hum, 11 inharmonic partials with their own decays (7.5 s hum .. 0.25 s top), beating pairs on hum / prime / nominal, mallet thud + strike clang, long reverb; music ducks and fades out 1.4 s |
| FX_FIREWORK / FX_RESULTS_STAR / FX_SCORE_TALLY (done) | soft boom + crackle / star chime A5 D6 A6 (empty: dull tick) / tally ding |
| FX_NEAR_MISS / FX_TREAT_ARRIVE / FX_PLATFORM_TURN | airy fwip / tiny counter tick / slider knock or lift tick (quiet, 450 ms apart) |
| GAME_PAUSE / GAME_RESUME | down / up blips (no blip when the pause came from a hidden tab) |
| GAME_START / GAME_RESTART / unmute | koto select pluck |

Decisions:
- Gesture unlock: the context is created on the first pointerdown / keydown / touchend (capture phase); music requests made before that are remembered and start when it runs. `sfxOut()` returns null while the context isn't running or audio is muted, so every SFX is a no-op then (counted in `sfxSkipped`).
- One sequencer: `playMusic` always stops the old one (80 ms fade) before starting the next; `Sequencer.live` counts running schedulers (3 restarts -> still 1).
- Hidden tab: `visibilitychange` suspends the context (the climb pauses itself); visible again resumes it. The scheduler skips any backlog after a stall instead of burst-playing it.
- Crow on screen / near chimes: no event for these, so AudioBridge reads `LEVEL1.hazards` and checks on every SOBA_BOUNCE (bounce height h): caw for crows between h - 200 and h + 290 px (the view top reaches about h + 330 at the apex). After a respawn, crows above the respawn point caw again; stomped crows never do. Chimes: within 60 px in x (wrapped) and -40..+150 px of the tubes' centre, 1.2 s per chime.
- render_game_to_text().audio (`AudioManager.debugState()`, already called by main.js): muted, contextState, track, intro, segment, musicPlaying, musicPaused, section, drive, scale, bpm, layers, duckDb, sequencersStarted, liveSequencers, sfx {name: plays}, sfxLast, sfxSkipped.

Gotchas:
- A new GainNode sits at gain 1.0 until its first automation event, and float rounding can start a source one frame before a same-time `setValueAtTime(EPS, t)`: that frame passed at full gain as a one-sample click (found in the offline renders, random because it depended on the noise sample). Every envelope now starts from `synth.silentGain()` (gain already at EPS).
- SFX rate limits use `performance.now()` (real time), so under the advanceTime test clock fast repeats are skipped: don't assert exact SFX counts in fixed-step runs.
- Phaser also creates an AudioContext of its own at boot (see the TODO); ours is separate and created on the first gesture.

## Step 6 notes (final QA and balance)

All green at the end of Step 6 (dev server on 3001): `npm run build`, `verify-runtime` PASSED, `iterate-client` (`?lives=1`, 3 iterations) PASSED with 3/3 `game_over` / score 180, `autoplay-check` RANG THE BELL (resumes 0, score 6250, 28/40 treats, 1 stomp, 55.7 s: unchanged), `sim-climb` OK, `validate-level` OK, `restart-check` clean (finale zoom now 1.98 -> 2), `audio-check` AUDIO CHECK OK (53 ok, 0 fail, two new checks), `validate-architecture` 5/5 (the old magic-number WARN). New checks: `zone-tour --glitch` GLITCH OK, `zone-tour --climb`, `fps-probe` (1% low, shader links).

Files: new `src/core/GLGuard.js`, `README.md`. Edited `src/core/{GameConfig,Assets,VisualBake,Constants}.js`, `src/scenes/PreloadScene.js`, `src/audio/AudioBridge.js`, `src/systems/{Backdrop,Ambient,Finale}.js`, `src/ui/{BestFlag,Hud}.js`, `scripts/{zone-tour,fps-probe,audio-check}.mjs`. Gameplay (`ClimbSim`, level data, `Kinematics`) unchanged.

### 1. "Half Soba" in software GL: root cause and fix
- Root cause (Phaser 4.2.1, not ours): the multi-texture batch shader picks the sampler with an exact float compare on an interpolated varying (`GetTexture-glsl.js`: `if (outTexDatum == 0.0) ... else if (outTexDatum == float(INDEX)) ... else return vec4(0)`). SwiftShader interpolates a constant varying as (id*b0 + id*b1 + id*b2) / (b0 + b1 + b2). That is exact for ids 0, 1, 2 and 4 (the numerator is the denominator times a power of two) and can be one ulp off for 3, 5, 6, 7, ... on rotated or scaled quads. Those fragments return vec4(0) and vanish. Soba leans and squashes every frame, so whenever her texture landed on such a unit part of her sprite disappeared. This matches the QA data exactly: 1 or 2 units never cut, 4 units cut (id 3), 8 and 16 cut more often. Real GPUs interpolate a constant exactly (ANGLE Metal: 0 cut frames with or without the fix).
- Fix (`GLGuard.installShaderFix`, all renderers): `WebGLRenderer.prototype.createProgram` is wrapped so every fragment source compares `floor(outTexDatum + 0.5)` (also the `texId` in `GetTexRes`). `window.__GL_GUARD__.fixedPrograms` counts rewritten programs; 0 would mean a Phaser update renamed the varying.
- Mitigation on top (`GLGuard.prepareGL`, called from GameConfig before the game exists): a throwaway WebGL context reports `WEBGL_debug_renderer_info`; SwiftShader / llvmpipe / softpipe / "software" / Microsoft Basic Render Driver get `render.maxTextures = 1`, which removes the compare from the shader entirely. Real GPUs keep every unit.
- Debug flags: `?gltex=N` (force units, 0 = all), `?glfix=0` (no shader rewrite), `?glwarm=0` (no warm-up).
- Regression check: `node scripts/zone-tour.mjs --glitch`. The bot climbs on the test clock; before each render Soba and her ghost get a magenta FILL tint and everything drawn above her is hidden for that one render (objects after her can't change her texture unit); after it the GL buffer is read back and magenta pixels counted against the frame's opaque pixels x |scaleX * scaleY|. Coverage < 0.6 = a cut frame; any cut frame exits 1. It runs every height twice: the game default and `gltex=16` (all units, the shader fix alone). Raising Soba to the top depth instead of hiding occluders hid the bug (her texture then lands on unit 0/1), so don't "simplify" the probe that way.
- Evidence (240 frames per height, h1500 + h3100, headless SwiftShader):
  | Config | Cut frames |
  |---|---|
  | `gltex=16&glfix=0` (the pre-Step-6 setup) | 88/454 (coverage down to 0.15; `output/glitch/control/glitch-h1500-gltex16-f25.png`, crop `output/glitch/before/crop-h1500-f25.png`) |
  | default (maxTextures 1 + fix) | 0/454; long run 4 heights x 600 frames: 0/2348 (min coverage 0.973) |
  | `gltex=16` (fix alone, 16 units) | 0/454 |
  | `glfix=0` default units (cap alone) | 0/454 |
  | production build (`vite preview`), default / guard off | 0/454 / 65/454 |
  | ANGLE Metal GPU (`--gpu`), default / `glfix=0` | 0/456 / 0/456 |

### 2. Shader warm-up
- Cause: `BatchHandlerQuad.finalizeTextureCount` builds one program per "textures in this batch" count (`STANDARD__TexCoordOut_{N}TexCount_GetTexture{N}_Tint`), compiled on first use; ANGLE also builds the pipeline on the first draw. New counts appear mid-climb (a treat flying to the HUD, a "+25" text, crumble debris).
- Fix: `GLGuard.warmShaders` (end of `PreloadScene.create`) draws one off-screen batch per count 1..maxTextures, in NORMAL and ADD blend, each group closed by a 1 px Graphics fill so it is its own batch; the Title starts after that frame rendered. SwiftShader (maxTextures 1) compiles 2 programs at boot; a GPU with 16 units compiles 17 (~8 ms each on an M2 Max).
- `scripts/fps-probe.mjs` now records every rAF interval and every `linkProgram`: avg fps, 1% low (average of the slowest 1% of frames), worst frame, frames > 50 ms, links during the climb, and it relaunches once if Chromium dies. Cold starts, 15 s, 3 runs each (median):
  | Start | Before (`gltex=0&glfix=0&glwarm=0`) | After (default) |
  |---|---|---|
  | SwiftShader `?zone=3&autoplay=1` | 57 fps, 1% low 11, worst 150 ms, 8 long frames, 9 links | 60 fps, 1% low 60, worst 17 ms, 0 long, 0 links |
  | SwiftShader `?zone=4&autoplay=1` | 57 fps, 1% low 11, worst 117 ms, 7 long, 7 links | 60 fps, 1% low 60, worst 17 ms, 0 long, 0 links |
  | GPU `?zone=2/3/4` | 60 fps, 8/9/7 links (7-12 ms each, absorbed by the GPU's headroom) | 60 fps, 0 links |
  With 16 units in SwiftShader (`gltex=0`, warm-up on) the links also drop to 0; one of three runs still had 3 frames > 50 ms with no link (SwiftShader pipeline state or GC), which is why software GL keeps the 1-unit cap.

### 3-5. Boot robustness
- `GameConfig.audio = { noAudio: true }`: Phaser's sound manager is a NoAudioSoundManager, so nothing touches AudioContext at boot. `audio-check` part E now installs the throwing `AudioContext` constructor before boot (was: after boot) and checks `game.sound.context` is absent. Phaser's console banner still says "Web Audio" (its DebugHeader checks device support before `noAudio`); ignore it.
- AudioBridge: keydown of Shift / Control / Alt / Meta / Escape / CapsLock / Fn no longer calls `unlock()` (Chrome doesn't count them as user activation). `audio-check` part A presses Shift, Control, Alt and Esc on the title: context stays `none`, 0 "AudioContext was not allowed to start" warnings.
- Canvas readbacks: with `pixelArt: true`, Phaser's CanvasPool creates every pooled canvas's 2D context with `willReadFrequently: false` first, so `textures.createCanvas()` contexts are GPU-backed and the later `{ willReadFrequently: true }` in CanvasTexture is ignored. `Assets.createCanvasTexture(scene, key, w, h)` makes a CPU-backed canvas first and registers it with `textures.addCanvas`; every bake (Assets placeholders / rims / composed platforms, VisualBake `makeCanvas`) uses it. A boot trace shows 0 `getImageData` calls on GPU-backed canvases (was 3+ in `buildRims` plus every placeholder `outline`). The one remaining SwiftShader-only "GPU stall due to ReadPixels" console message comes from Chrome uploading Phaser's built-in data-URI textures at renderer boot (before any game texture) and does not appear on a GPU.

### 6. Cosmetic layout
- NEW BEST: when the pop fires, the passed flag's "BEST nn m" label fades out (350 ms, `PROGRESS_FX.OLD_BEST_FADE_MS`); it used to scroll through "NEW BEST!" ~45 frames later. `output/step6/sheet-newbest.png` (+10/+30/+45/+60 frames).
- Gate signs: `Backdrop.signX` keeps each sign clear of platform art in its rows (3 px margin): it nudges left from x 86, or mirrors right if the left has no room. Zone 2's sign moved left past the 1372 px beam; zones 3 and 4 didn't move. `output/step6/signs/h1380.png`, `output/step6/signs/z34-crops.png`.
- Zone ribbon: hold 1300 -> 900 ms and it fades from 0.8 to 0.45 while it holds (visible 1.4 s instead of 1.8 s). `output/step6/sheet-ribbon.png`.
- Zone 3 lanterns: 7 strings x 6 lanterns -> 4 strings (3160 / 3600 / 4040 / 4480) x 4 lanterns; the street string has 4 too. `output/step6/zones-sheet.png`.
- Zone 1 leaves: drawn at 2x (8x6), a lighter leaf palette (`ZONE_LOOK.LEAF_COLORS`), alpha 0.95, rate 1.7 -> 2.0 /s. `output/step6/leaves/crop.png`.
- Finale zoom 1.4 -> 2 (integer, square pixels). The zoom origin now leaves the bell at screen y 214 (`FINALE.BELL_SCREEN_Y`) so the sky above shows the fireworks, and the bursts sit closer (`FIREWORK_DX` 16-52, `FIREWORK_DY` 34-74). Soba, the bell and every burst stay in frame; the moon (screen-space parallax) leaves the frame during the zoom. `output/step6/finale-14-vs-20.png` (top 1.4, bottom 2).

### 7. Balance pass (no changes)
- `node scripts/sim-climb.mjs --runs 150`: zone 1 2%, zone 2 6%, zone 3 38%, zone 4 43% of runs lose a life; 131/150 (87%) finish with 3 lives + checkpoints; median clear 82 s; hits crow 60 / chimes 64 / tile 37. Same numbers as Step 2: on target.
- Per chunk (sloppy bot, 150 runs, losses per run): the peak is `4:spire-chimes` (0.41/run, all chimes hits), then `3:roof-crows` (0.38: 31 falls when the spring + crow + crumble line goes wrong, 26 crow hits), `4:spire-lifts` (0.19). Nothing else above 0.07. The hardest moment is in zone 4, with zone 3's roof-crows a close second three-quarters of the way through zone 3 (after a checkpoint, before a breather); not a spike early in the climb, so no numbers changed.
- Pacing (`node scripts/zone-tour.mjs --climb`, one shot per second, `output/climb/t*.png`, timeline `output/climb/timeline.txt`, sheet `output/step6/climb-sheet.png`): the bot clears in 56 s, a new chunk or event at least every 4 s (longest quiet stretch 4 s, t=7-11 s on the zone-1 gate run), gates at 11 / 27 / 42 s.

## TODOs

Open after Step 6:
- Human playtest, ideally on a phone: zone 3-4 hazard density (the sloppy bot loses ~1.2 lives there per run; `3:roof-crows` and `4:spire-chimes` are the two peaks), touch steering near the progress bar, the roof-tile warning marker under the HUD band edge (y 44).
- Listening pass on headphones and a phone speaker (the mix was balanced by measurement): the bounce level over a full climb, the zone-4 platform-turn ticks, the bell.
- Optional: a `HAZARD_ONSCREEN` event from `HazardSystem.syncViews` would make the crow caw frame-exact (it is derived from level data on each bounce now).
- Optional: a second UI camera would let shake/zoom skip the HUD (the finale fades the HUD instead).
- After a Phaser upgrade: rerun `node scripts/zone-tour.mjs --glitch` and `node scripts/fps-probe.mjs`. If upstream fixes the texture-id compare, `GLGuard` can go; if it renames `outTexDatum`, `__GL_GUARD__.fixedPrograms` reads 0.

Level 2 TODOs:
- Level registry: replace the direct `LEVEL1` imports (main, Debug, AudioBridge, Preload/Title/Climb/Results scenes, Backdrop, BestFlag, Hud, sim-climb, validate-level, zone-tour) with a current-level lookup; pass the level into ClimbScene.
- `level2.js` can stack its chunks with `assemble()` (already exported from `level1.js`); new chunks go in `chunks.js` (or a `chunks2.js`) with the same helpers; `validate-level`, `sim-climb` and `zone-tour` need a `--level` flag.
- Level select / "next level" on the Results screen after a clear; high scores are already stored per level id.
- New zone looks (`ZONE_LOOK` palettes, wall bakes per zone: `bakeZoneWalls` takes the level), lantern string heights and the gate sign layout (`Backdrop.signX` is generic).
- Music: new sections or a new key/scale per level (`src/audio/music.js`); AudioBridge reads `LEVEL1.hazards` for caws/chimes.
- New mechanics only if they stay pure functions of the world clock (see Step 2 decisions), so the bot, validator and sims keep predicting them.
- Art: new facade tile / props through `art/scripts/build_assets.py` ($4.67 of the image budget left, `art/spend.md`).

## Gotchas

- Phaser's TweenManager uses Date.now(), not the frame delta. Under the test clock Date.now is virtualized (main.js). Gameplay never depends on tweens: the camera pan, respawn timers, blink and complete delay all use the frame dt.
- Scene shutdown destroys every display-list object, including pooled (invisible) platform Images. PlatformSpawner.release() only drops references.
- Results/Title accept only fresh keydowns (event.repeat ignored), so keys held while falling never skip the Results screen. Esc on Results goes to the title. M is never a "retry".
- Pause debounce uses the scene clock (this.time.now), so the key that resumed can't re-pause within 200 ms.
- validate-architecture's magic-number WARN comes from pixel-art drawing in Assets.js, the kept audio code and level data. Gameplay files (ClimbScene, Soba, Kinematics, systems) are clean.
- Real-time scripts (autoplay-check, fx-shots, event-shots) restart if Vite reloads the page: don't edit src/ while one runs (an early Step 2 autoplay run "lost a life" twice that way). Headless Chromium also gets killed by something outside this project now and then: autoplay-check resumes from the last checkpoint height (`resumes=1` in its summary), the shot scripts just need a rerun.
- All rules live in ClimbSim; ClimbScene must not grow game logic of its own or the node sims stop matching the game. The real-time autoplay matched the headless 60 fps run exactly (score 6250, 28 treats, 1 stomp).
- Particles use Math.random, so iterate-client screenshots are not pixel-identical between iterations; the state JSON is.
- A spring is two platforms (beam + pad). Anything that walks `level.platforms` (validator, bot) must treat the pad as the launch node.
- Platform widths must be multiples of 8 (the [cap, mid, cap] composition rounds to 8 px segments; a 44 px logical platform would draw 48 px wide). The validator fails on it.
- Roof tiles only trigger inside a 160 px window above the trigger height, and `?zone=` / `?y=` starts mark lower tiles spent; otherwise a zone-4 start dropped every zone-3 tile at once.
- AutoClimber keeps the sloppy moving-platform timing error in a module-level variable around each decide(); the expert and the validator always see 0.
- Replacing a texture under the same key (VisualBake `makeCanvas`) removes it first: read the source frames BEFORE the call. Reading inside the paint callback read the new empty canvas (an invisible crumble and "Texture plat-crumble has no frame 1/2" warnings).
- `ParticleEmitter.setParticleTint([...])` with an array renders the particles black; pass one colour (arrays work in the emitter's creation config).
- A full-screen `camera.flash()` starts at alpha 1 and hid everything during the hurt hit-stop; the hurt flash is a capped overlay rectangle instead.
- Camera zoom scales scrollFactor-0 objects too (the HUD). The finale moves the zoom origin to the bell and fades the HUD; ClimbScene.create resets zoom 1 / origin 0.5 (restart-check verifies).
- Effects/Finale set `tweens.timeScale` and emitter time scales during slow motion; `Effects.resetTimeScales` runs on create and destroy, so a retry mid-slow-mo starts at 1.
- Phaser 4's multi-texture shader compares an interpolated float texture id with `==`; software GL (SwiftShader) drops fragments of rotated/scaled quads on units 3, 5, 6, 7, ... GLGuard rounds the id and caps software GL to 1 unit. Keep `zone-tour --glitch` passing.
- Don't call `getImageData` on a `textures.createCanvas()` context (GPU-backed under pixelArt): use `Assets.createCanvasTexture`.
- `--glitch` probes must not change Soba's depth or batch order: that changes which texture unit she gets and hides the bug.
