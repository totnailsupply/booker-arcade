# Progress

Original prompt: Create a 2D arcade pixel game: a scrolling endless runner with auto-running, one-button controls, obstacle avoidance, increasing difficulty, and a high-score system. It is split into levels that have a real end. Build only the first level. The player character is Booker. Draw inspiration from the Booker assets but don't adopt their style. Use the real Booker photo (IMG_4251.heic) to create assets. Optional: /image-gen for game assets. Image gen budget is $5.

Engine: 2d (Phaser 4.2.1)
Created: 2026-10-13

## Pipeline Status

- [x] Step 1: Scaffold (core loop, Level 1 data, placeholder shapes)
- [x] Step 1.5: Pixel art (image-gen) — $0.49 spent; see art/spend.md
- [x] Step 2: Visual design (juice, death beat, banners, win, hitbox check)
- [x] Step 3: Audio (Web Audio API, procedural, zero dependencies)
- [ ] Step 4: Monetize — skipped (CLAUDE.md: only when the user asks)
- [x] Levels 2–6 (2026-10-13): engine, art ($1.15 of $10), five levels, menus, audio, FX, real-time fix, integration QA. See "Levels 2–6 — final state" at the end.

## Decisions

- One hit (obstacle or pit) restarts the level. No hearts.
- Setting: warehouse yard at golden hour.
- Finish line: a juicy steak.
- Booker has no collar. Pure dog: tan coat, cream chest, black muzzle mask, dark-tipped floppy ears, amber eyes.
- One button: Space / click / tap = jump; hold for a higher jump.
- 480x270 internal resolution, pixelArt: true.

## Image-gen spend

| Asset | Model | Cost |
|---|---|---|
| Booker hero | gpt-image-2.5-sunburst | $0.053 |
| Run cycle | gpt-image-2.5-sunburst | $0.058 |
| Pose frames | gpt-image-2.5-sunburst | $0.074 |
| Obstacles, bone, steak | gpt-image-2.5-sunburst | $0.072 |
| Backgrounds x3 | gpt-image-2.5-sunburst | $0.103 |
| Ground tile | gpt-image-2.5-sunburst | $0.014 |
| Title | gemini-3-pro-image 1K | $0.138 |
| **Total** | | **$0.49** |

Rebuild finals: `cd art && python3 scripts/build_assets.py`

## Step 1 notes

- Scrolling: Booker's body really moves (velocity.x = section speed); camera.scrollX is pinned to player.x - 100 on scene POST_UPDATE. World objects are static (barrels roll left). Parallax = screen-fixed TileSprites, tilePositionX = scrollX * 0.1/0.3/0.6.
- Jump: H=72 px, apex 0.36 s -> g=1111, v0=400, fall x1.6. Tap hop ~42 px (cut x0.5 after 90 ms min hold). Coyote 80 ms, buffer 100 ms. Math in Constants.js.
- Level 1 = src/levels/level1.js, 4 sections 150/175/200/230 px/s, steak at x=15600, ~81 s.
- Art: Assets.js reads public/assets/manifest.json; anything unlisted/failed gets a generated placeholder with the same key/size.
- QA: `node scripts/autoplay-check.mjs` (bot run to the steak; `--query start=section3`, `--no-manifest`).
- Debug URL flags: `?autoplay=1`, `?start=section3`, `?x=8000`.

## TODOs


## Gotchas

## Step 2 notes (visual design)

- All effects live in `src/systems/Effects.js`, created in RunScene.create after the HUD and driven by EventBus (PLAYER_JUMP/LAND/DIED, BONE_COLLECTED, SECTION_CHANGED, LEVEL_START, LEVEL_COMPLETE). Tunables: `FX` in Constants.js.
- Squash/stretch: Arcade bodies resize with sprite scale, so Booker's physics sprite stays at scale 1 and is hidden; Effects draws a display sprite (`effects.view`, origin at the feet) that copies frame/position/angle on POST_UPDATE and is the one that squashes.
- Juice: run dust every 70 ms, land/take-off puffs, squash on land / stretch on take-off, bone sparkle + screen-space "+10", steak bob + additive halo + light beam + sparkles + Phaser 4 glow filter (WebGL only).
- Death: 60 ms hit-stop (tweens/timers/physics/particles time scale 0, counted with frame delta so it works under the virtual clock), red flash, impact sparks, existing shake + hurt tumble, fade to black over the last 160 ms, 140 ms fade-in on the retry. Total ~660 ms.
- Sections: "GO!" pop on every attempt start, "SPEED UP! / n. NAME" banner at y=52 (sky band) for ~1.1 s; screen-space speed streaks in sections 3 (90 ms) and 4 (45 ms).
- Win: slow-mo (0.3, eases back over 700 ms; scene.time is not scaled so COMPLETE_DELAY_MS is unchanged), hop on the display sprite, confetti, steak sparkle burst, warm flash, then the existing fade to LevelComplete.
- Parallax FAR 0.1 -> 0.025: bg-far moves 395 px over the level, so the baked-in sun never repeats. MID 0.3 / NEAR 0.6 unchanged.
- Title prompt: brighter text, thicker outline, darker bottom panel (0.78), hard on/off blink (650/300 ms, dims to 0.35 instead of 0.2).
- Hitboxes checked with `?debug=1` (new flag: Arcade debug draw). Booker 26x22 @11,14 and crate/pallets already sat inside the art. Cone 8x16 @4,4 -> 6x15 @5,5 (top corners were outside the taper). Barrel 14x14 @3,5 -> 12x12 @4,6 (corners were outside the circle).
- Fixed: barrels spun around a bottom origin and swung into the ground; now origin 0.5,0.5 (body position unchanged). Ground art now runs one screen past the level end (no void past the steak).
- `scripts/fx-shots.mjs`: timed screenshots of one moment (`--query "x=480" --shots 300,600 --keys 200:400 --title`). Screenshots in output/fx/{death,jump,section,complete,title,restart,hitbox-before,hitbox-after}.

## Gotchas (Step 2)

- Never scale `player.sprite`: the Arcade body would resize. Scale `effects.view` (via `effects.viewScale`).
- TweenManager timeScale survives scene.restart; Effects resets tweens/time/physics time scales in its constructor and destroy.
- Arcade `world.timeScale` is inverted (2 = half speed).

## Step 3 notes (audio)

- Files: `src/audio/AudioManager.js` (context, buses, music transport, mute), `music.js` (Sequencer + 8-bar C-Am-F-G chiptune), `sfx.js` (one-shots), `AudioBridge.js` (EventBus -> audio, M key, gesture unlock), `src/ui/MuteButton.js` (Graphics speaker icon, used by Hud and TitleScene). Tunables in the `AUDIO` section of Constants.js.
- Graph: per-track gain -> musicBus (0.42) / sfxBus (0.5) -> master (0.8) -> DynamicsCompressor limiter -> destination.
- Context is created/resumed on the first pointerdown/keydown/touchend (capture listeners on window). Music requests made before that are remembered and start once the context is running. Every SFX returns early if the context isn't running or audio is muted, so a suspended context never throws.
- Music layering: menu = triangle lead + bass @108; game section 1 = square lead, bass, kick, snare @132; section 2 adds 8th hats @138; section 3 adds 16th square arpeggio + extra kick @144; section 4 switches to 16th hats + lead doubled an octave up @152. Section changes are applied on the next bar line. Results screen = calm loop @118 with soft hats, after the fanfare.
- One sequencer at a time: `playMusic()` always fades and kills the previous one first. PLAYER_DIED stops music; RunScene's MUSIC_GAMEPLAY on restart starts a fresh loop from bar 1 at the current section. `liveSequencers` in render_game_to_text must stay <= 1.
- Pause: the sequencer stops scheduling and its gain fades to 0; resume continues from the same step.
- Events used: MUSIC_MENU, MUSIC_GAMEPLAY, MUSIC_GAMEOVER, MUSIC_STOP, GAME_PAUSE, GAME_RESUME, SECTION_CHANGED (whoosh + layer), PLAYER_JUMP, PLAYER_LAND (debounced 120 ms), BONE_COLLECTED (ignores the bones:0 HUD reset), PLAYER_DIED, LEVEL_COMPLETE (fanfare + two synthesized barks), AUDIO_INIT, AUDIO_TOGGLE_MUTE. New: AUDIO_MUTE_CHANGED { muted } (redraws mute buttons).
- Mute: M key anywhere, or the speaker button (HUD top-right; title top-right). Persisted with saveMuted() under `booker-run:muted`, mirrored in gameState.isMuted. The button's pointerdown calls event.stopPropagation(), which in Phaser 4 stops the scene-level pointerdown, so it never jumps or starts the game.
- QA: `node scripts/audio-check.mjs` (title mute button, M key, 3 restarts with one live sequencer, HUD tap without jump, pause/resume, section 3 and 4 layers). `render_game_to_text().audio` = { muted, contextState, track, musicPlaying, musicPaused, section, bpm, layers, sequencersStarted, liveSequencers }.

## Gotchas (Step 3)

- Headless Chromium under Playwright lets the AudioContext run after a synthetic key press, so audio-check sees `running`. Before any gesture `contextState` is `none` (the context is created lazily to avoid the autoplay warning).
- Vite full-reloads the page when other files change; long Playwright checks can be interrupted by edits in progress. Re-run if a check fails with `attempts: 0`.
- Phaser still creates its own (unused) WebAudio sound manager; harmless.


## Autofix after Steps 2 + 3 (QA failures)

- **Page closes were external, not the game.** A user-level launchd job (`~/.claude/hooks/playwright-reaper.sh sweep`, every 120 s) SIGTERMs every browser whose command line has `playwright_chromiumdev_profile` and whose parent is not a Playwright MCP server ("orphaned" in `~/.claude/playwright-reaper/reaper.log`). That matches every `chromium.launch()` from our QA scripts, so any check longer than a few seconds lost its browser at a random point. Proved with a SIGTERM-logging wrapper as `executablePath` (sender = `playwright-reaper.sh sweep`); about:blank pages and all Chromium channels died in the same sweep. Memory, display list, tweens, listeners, and fps were flat during the run.
- Fix: `scripts/lib/browser.mjs` `launchBrowser()` uses `launchPersistentContext()` with our own `booker-run-qa-*` temp profile (deleted on close). All five QA scripts (autoplay-check, audio-check, fx-shots, verify-runtime, iterate-client) use it. Use it for any new Playwright script too.
- **The "bot deaths" came from the resume logic, not from FX timing.** After a kill, autoplay-check relaunched at `?x=<last x - 40>`, which could spawn Booker right in front of a crate he couldn't clear, so he died on every respawn (TRY 40 in one screenshot). Resume now only takes x from a grounded spot with 200 px of clear runway (no obstacle or gap ahead). Exit criteria are unchanged.
- **`totalSeconds` 19.4 also came from a resume:** `?x=` starts a new page, so the time only counted the last stretch. A clean run reports totalSeconds ≈ 81.2 against par 81.07, which earns the full 300 time bonus. The time counts only PLAYING frames (pause and the death beat are excluded), with each frame capped at 50 ms.
- audio-check's `PAGE CLOSED` line was its own final `browser.close()`. Now it prints only on an unexpected close.
- The ground past the steak was already fixed in Step 2. The art ends at x=16280, 680 px past the steak (x=15600), and the camera's right edge at completion is x=15940. `output/fx/complete/montage.png` was taken before that fix. The new shot is `output/autofix/complete-ground.png`.
- Restart stability (5 attempts, sampled 1 s into each): children 151, tweens 4, emitters 7, EventBus listeners 27, scene listeners 58, keyboard 4, intervals 2, live sequencers 1, time scales 1/1/1, heap 23.1 MB. No growth.

## Gotchas (autofix)

- Don't use `chromium.launch()` in this repo's scripts; the reaper kills it within 120 s. Use `launchBrowser()` from `scripts/lib/browser.mjs`.
- A resumed autoplay run (`resumes>0`) isn't a clean proof, because the time bonus and bones restart from the resume point. The done criteria need `resumes=0`.
- Don't use broad kill commands (`pkill node`, `killall chrome`). Other sessions and the shared dev server run on this machine.

## Levels 2–6 — Phase 1 engine

Plan: `docs/levels-2-6-plan.md`. Level data format, element tables, bot and commands: `docs/level-format.md`.

### What exists now

- **Registry** `src/levels/index.js`: `LEVELS` (6 entries: id, number, name, ability, abilities, theme texture keys, music variant id, bot kind, data), `getLevel(idOrNumber)`, `nextLevel(id)`, `getSandbox(room)`. Stub levels `level2.js`..`level6.js` (25–30 s each) use every new element; Phase 2 replaces them. `_helpers.js` has `arc()`/`row()` for bones. `sandbox.js` = `?level=test&room=...` (never in the level select).
- **Shared model** `src/world/LevelModel.js`: every rect (ground segments, one-way platforms, walls, updrafts, hazard/obstacle hitboxes, breakables, steam columns, finish) plus mover/steam stepping as plain data. `src/world/LevelWorld.js` builds the Phaser objects from it; the bot's simulator collides against the same rects.
- **Controller** `src/entities/PlayerController.js`: Booker's movement as pure logic (no Phaser), run by `Player.js` in the game and by `BotSim.js` in the bot. Level 1 runs the original rules unchanged. Abilities in `src/core/Abilities.js`; tunables and the measured reach table in `Constants.js` (`DOUBLE`, `GLIDE`, `UPDRAFT`, `WALL`, `POUNCE`, `DASH`; `node scripts/reach-table.mjs` regenerates it).
- **Save** `src/core/SaveData.js` (`booker-run:save:v1`): per level completed/bestScore/bestStars/bestTimeS/bestProgress/bestBones/attempts/clears; totals; `isUnlocked(n)`; migrates `booker-run:best:level1` once; the mute key is unchanged. `HighScore.js` is now a thin wrapper.
- **Scenes**: Title -> `LevelSelectScene` -> Run -> `GameOverScene` (overlay over the paused run; auto-retry 1.2 s, any press retries, Esc -> levels) or `LevelCompleteScene` (Next/Replay/Levels; Next is the default when open). Pause has Q = quit to levels. All functional only; Phase 2 restyles them.
- **Bot**: Level 1 keeps its original `AutoPilot` (score 2945). Levels 2–6 and the sandbox use `BotPilot` (planner over `BotSim`, a frame-exact model of RunScene + Arcade). `botPlan` in level data scripts tricky spots.
- **Deterministic mode** `src/core/Deterministic.js` (`?det=1`): when RunScene starts, the real-time loop sleeps; `window.advanceTime(ms)` runs fixed 1/60 s `game.headlessStep`s (a real `game.step` render on the last one) and `Date.now()` becomes a virtual clock (Phaser's TweenManager times tweens with `Date.now()`). Arcade then steps exactly once per frame. Default in `autoplay-check`; `--realtime` keeps the old mode.
- **Checks**: `autoplay-check.mjs` (`--level`, `--query`, `--jitter ms --seeds k`, `--realtime`, `RESULT {...}` JSON per run), `ability-check.mjs` (20 checks), `ui-flow-check.mjs`, `level-shots.mjs`, `reach-table.mjs`; `audio-check.mjs` and `example-actions.json` updated for the level-select step.

### Decisions

- Abilities: double jump is a fixed +56 px boost (no variable height). Glide starts when held while falling and lasts while held (updrafts may lift it). Wall kicks repeat (150 ms apart), so any wall can be climbed; on the ground against a face it's a hit at once without wall kick, after 1.2 s with it. Pounce reuses the jump's variable height (77 px held, 41 px tapped). Dash ends early against a wall face.
- Moving hazards, enemies and steam clocks start when Booker gets close (ACTIVATE_AHEAD), so they meet him at the same place regardless of `?start=`/`?x=` or earlier walls. Enemy art faces left and is never flipped.
- A dash smash and a stomp freeze gameplay briefly (`RunScene.freeze()`: physics paused, gameplay update skipped). The simulator ignores freezes because the whole world stops.
- The death beat no longer fades to black: the game-over card dims the frozen level instead. Retry fades in from black.
- After a clear, "Levels" highlights the newly unlocked level.
- Far parallax for Levels 2–6 = min(0.025, 400 / length), so a baked-in sun/moon never repeats.
- Per-level tuning (speeds, `parSeconds`, `parallax`, `botPlan`) lives in the level file, so each Phase 2 designer touches only `levelN.js`.
- Level 1 is byte-for-byte the same run: deterministic and real-time `autoplay-check` both give 2945 (1545 distance + 60/62 bones + 500 + 300).

### Gotchas

- Arcade's overlap-only checks set `touching.down` (falling through a bone). Level 1's old `onGround` counted it, so a mid-air pickup counted as "landing" (coyote refresh, land thump). Kept for Level 1 only (`Player.legacyGround`) to keep its proof run identical; ability levels use `blocked.down`, so a pickup never refreshes the double jump.
- Booker's frame 14 (cling) draws the paws at x = 47 but his body (the wall face) ends at x = 37: the display sprite shifts 10 px **left** while clinging (`ANIM.CLING_OFFSET_X = -10`). The art note said right; the screenshot showed the dog inside the wall.
- Collider order matters for the simulator: ground, L1 obstacles, finish, platforms, walls, hazards, enemies, breakables, steam. Colliders for new element types are only added when the level has them.
- The planner must never "defer forever": at a wall it anchors the next press at the earliest frame (a lazy plan kept postponing the climb and looped). It also measures slack for every follow-up press and pads follow-ups by the hold jitter (a jittered tap delayed a dash out of its one-frame window). Without these, 35 ms jitter failed L6's box stack.
- Each new attempt reseeds the bot's jitter (`seed + (attempt - 1) * 7919`); attempt 1 uses `?seed`.
- In deterministic mode nothing moves unless a script calls `window.advanceTime()`. Boot, preload, title and level select still run in real time until RunScene starts.
- `?det=1` and the title: with `?menus=1&autoplay=1&det=1` the menus run in real time and each level the bot starts is stepped.
- `scripts/lib/det.mjs` has `openDetPage`, `stepGame`, `stepFrames`, `readState` for new scripts. Always launch browsers with `launchBrowser()`.

### For Phase 2

- Level designers: read `docs/level-format.md`, keep 20+ px margin on every reach in the `Constants.js` table, run `autoplay-check --level N`, then `--jitter 35 --seeds 5` (4/5 needed), then `level-shots`. Script only unfair-for-the-bot spots with `botPlan`.
- UI: scenes expose `snapshot()` for `render_game_to_text` (`menu`, `save`); events `MENU_MOVE/SELECT/BACK/LOCKED`, `LEVEL_UNLOCKED`, `GAME_OVER_SHOWN`, `NEW_BEST_PROGRESS`. `DEATH_TIPS` (exported from `GameOverScene.js`) has a tip per death cause. Keep the Container+Graphics+Text button pattern (validate-architecture).
- Audio: `MUSIC_GAMEPLAY` carries `{ levelId, variant }` (variant = `LEVELS[n].music`: yard, docks, rooftops, factory, market, steakhouse); `audioManager.variant` stores it, the sequencer ignores it so far. New events: `PLAYER_DOUBLE_JUMP`, `PLAYER_GLIDE_START/END`, `PLAYER_WALL_CLING`, `PLAYER_WALL_KICK`, `PLAYER_POUNCE`, `PLAYER_DASH/DASH_END`, `BREAKABLE_SMASHED`, `ENEMY_STOMPED`, `STEAM_WINDUP`, `STEAM_ON`. AudioBridge maps a few to existing SFX as placeholders (double/kick/pounce -> jump, dash -> whoosh, smash -> land); replace them.

## Levels 2–6 — final state

Second user prompt (2026-10-13), summarized: build Levels 2–6, each introducing a Booker ability that carries forward; redesign the main menu with a level selector, locked and unlocked levels, persistent per-level and overall high scores, and progress tracking; improve the game-over and level-complete screens; keep one pixel-art look; image-gen budget $10.

### Levels

| # | Name | New ability | Speeds (px/s) | Length | Bones | Bot score (det) | Design notes |
|---|---|---|---|---|---|---|---|
| 1 | The Yard | — | 150–230 | ~82 s | 62 | 2945 | (frozen) |
| 2 | The Docks | Double jump | 160–240 | ~83 s | 77 | 3145 | `docs/levels/level2.md` |
| 3 | The Rooftops | Ear glide | 170–250 | ~93 s | 78 | 3325 | `docs/levels/level3.md` |
| 4 | The Factory | Wall kick | 175–250 | ~86 s | 73 | 2975 | `docs/levels/level4.md` |
| 5 | Night Market | Pounce | 185–260 | ~89 s | 75 | 3225 | `docs/levels/level5.md` |
| 6 | Steakhouse Row | Zoomies dash | 195–280 | ~91 s | 88 | 3855 | `docs/levels/level6.md` |

Every level's designer proved all bones collectable in one run (3 stars). Jitter targets: all levels 5/5 at ±35 ms; L2 ±60, L3 ±50, L4 ±45, L5 ±40 also 5/5; L6 is 3/5 at ±50 ms (hardest level, not a target).

### Where things are

- Plan: `docs/levels-2-6-plan.md`. Level format, element tables, abilities, bot caveats, commands: `docs/level-format.md`.
- UI (title, level select, ability intro card, tips, HUD with pause button, game over, level complete, L6 ending, pause, pixel font): `docs/ui-notes.md`.
- Audio (six level songs, menu theme, ~25 ability and UI sounds, glide wind loop, ducking, mix levels): `docs/audio-notes.md`.
- FX (ability juice in `src/fx/`, steam and updraft views, per-level ambience, golden steak): `docs/fx-notes.md`.
- Art: `art/spend.md` (ledger; agent ledgers `art/spend-levels-A.md` and `-B.md`), rebuild scripts in `art/levels/scripts/`, previews `art/levels/preview-A.png` and `preview-B.png`.
- Integration QA log with outcomes: `docs/integration-todo.md`.
- Backups: `.snapshots/` (Level 1 final, Phase 1 engine, Phase 2 levels).

### Decisions (Phase 2–3)

- One-button grammar, by priority: ground jump (hold for higher) > wall kick while clinging > double jump > dash (L6, after the double is spent); hold while falling = glide; landing on an enemy = pounce. A press while falling that would land within the jump buffer becomes a full ground jump (`JUMP.LAND_BUFFER`), so an early press never wastes the double jump.
- Level 6 forces the dash with breakables (3-high box stacks, gates on tall wall tops), because a glide out-reaches a dash on any plain gap.
- Ability intro card on attempt 1 from the menus (run held in `MODES.INTRO`); tips show on attempts 1–2.
- Game over is an overlay with % reached, best %, and a cause tip. It stays up until the player presses (2026-10-14 fix: it used to auto-retry after 1.2 s and close on any press after 150 ms, so it vanished while players were still tapping). Presses in the first 0.6 s are ignored (`GAMEOVER.INPUT_LOCK_MS`); only the `?autoplay=1` bot auto-retries. Level complete has a tally, star pops, new-best callouts, and an unlock reveal; L6 adds a Golden Steak ending.
- Real-time play runs a fixed 1/60 s tick (`RunScene.stepGame`), so it matches the deterministic tuning at any display rate; at most 3 ticks per frame, so a long hitch slows game time instead of skipping it.
- Passing `finishX` completes the level, and the last ground body runs a screen past the end, so over-jumping the steak can't kill.
- Saves merge per level with storage before each write and on `storage` events from other tabs; versioned migration chain with backup keys.
- Far parallax per level is tuned so the sun or moon never splits across the screen edges (L1 0.0162 in the registry, L2 0.0153, L3 0.0057, L4 0.0108, L6 0.0139).

### Gotchas (Phase 2–3)

- Phaser reuses scene instances: reset every per-visit field in `create()`.
- The pause debounce uses the game-loop clock, not `performance.now()`, so it works in `?det=1` too.
- A launchd job (`com.tommytu.playwright-reaper`) kills Playwright browsers it didn't start; always use `launchBrowser()`.
- Vite hot reload is off (`vite.config.js`), because mid-run reloads broke parallel Playwright checks. Refresh the browser by hand after an edit.
- The scratchpad was shared between parallel agents; give each agent its own subfolder.

### TODOs

- A human listen: music per level (shanty feel, rooftops tempo, factory fatigue, market swing, the yard quote in the finale), glide wind, steam fade, pounce sound blend.
- A human playtest of every level, especially L5's must-pounce chains and L6's finale (press windows 10–23 frames, comparable to Level 1's pallets at 6–12).
- L5 and L6 neon signs in the background wrap at the screen edges like any tiling art (only the sun and moon were treated).
