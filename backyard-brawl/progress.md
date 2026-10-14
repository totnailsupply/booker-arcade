# Progress

Original prompt: Create a plan to build a **2D pixel-art arena survival shooter** starring **Booker**, inspired by games like *Brotato* and *Vampire Survivors*. The player must survive increasingly difficult waves of enemies while earning points, leveling up, and unlocking powerful upgrades.

Focus on **fast-paced, addictive arcade gameplay** with simple controls, satisfying combat, diverse enemy types, and progressively escalating difficulty. Implement a **randomized upgrade system** where players choose between abilities, weapons, and stat boosts, allowing for unique builds each run.

Include a high-score system, persistent progression, polished menus, satisfying visual effects, and instant replayability. Prioritize responsive controls, balanced difficulty, and a cohesive pixel-art aesthetic.

Use `/image-gen` for characters, enemies, environments, and UI assets, with a strict **$10 total image generation budget**.

First create a concise implementation plan, then build and test a fully playable game.

Engine: 2d (Phaser 4.2.1, Vite), infrastructure copied from ../soba-tower and ../booker-run
Created: 2026-10-14
Dev server: http://localhost:3002 (`npm run dev`, strictPort)
Plan: PLAN.md (source of truth for design numbers)

## Pipeline Status

- [x] Step 1: Scaffold and core loop (placeholders)
- [x] Step 1.5: Art (image-gen, parallel with Step 1). $0.33 of $10 (12 calls); art/out + art/spend.md; rebuild: `cd art && python3 scripts/build_assets.py`
- [x] Step 2: Content, meta progression, menus, art install, balance (2A + 2B)
- [ ] Step 3: Visual polish + audio (3A visual polish done 2026-10-14; see Step 3A notes)
- [ ] Step 4: Final QA
- [ ] Monetize: skipped (CLAUDE.md: only when the user asks)

## Step 1 notes (2026-10-14)

### Files

- Config: `package.json` (phaser ^4.2.1, vite ^7.3.1, @playwright/test), `vite.config.js` (port 3002, strictPort), `index.html`, `public/assets/manifest.json` (empty `{ "assets": {} }`; Step 2 lists the art here).
- `src/sim/` (pure JS, no Phaser, no DOM, seeded): `World.js` (phases, step, choose/reroll, result), `Player.js`, `Enemies.js` (cat, squirrel behaviors, separation, damage, kill, combo), `Weapons.js` (generic interface + `bark`), `Projectiles.js`, `Pickups.js` (kibble, heart, magnet, XP curve), `Waves.js`, `Upgrades.js` (data-driven cards), `SpatialHash.js`, `Rng.js` (mulberry32), `bots.js` (idle, kite, smart).
- `src/core/`: `Constants.js` (every tunable), `EventBus.js` (sim events forwarded as `sim:<type>`), `SaveData.js`, `Assets.js` (manifest + code-drawn placeholders for every PLAN section 5 key), `Debug.js`, `Rng.js` (re-export), `GameState.js`, `GameConfig.js`, `GLGuard.js` (copied from soba-tower).
- `src/scenes/`: Boot, Preload, Title, Arena, LevelUp, Pause, Results.
- `src/ui/`: `Hud.js`, `Button.js` (Container + Graphics + Text, Zone for input, keyboard focus group), `TouchControls.js` (floating joystick + Dash button), `MuteButton.js` (copied). `src/systems/PlayerInput.js` (keyboard + touch -> `{ mx, my, dash }`).
- `src/audio/`: AudioManager, music, songs, sfx copied from booker-run (`sfx.js` gained `barkShotSfx`); new `AudioBridge.js` with minimal remaps.
- `scripts/`: `lib/browser.mjs`, `iterate-client.js`, `verify-runtime.mjs` (both copied, port 3002), `validate-architecture.mjs` (rewritten for this layout), `sim-run.mjs`, `example-actions.json`.

### QA commands (run from `backyard-brawl/`, dev server on 3002)

- `npm run build`
- `node scripts/verify-runtime.mjs`
- `node scripts/validate-architecture.mjs` (10/10)
- `npm run iterate` = `node scripts/iterate-client.js --url 'http://localhost:3002/?hp=3&seed=1' --actions-file scripts/example-actions.json --iterations 3 --screenshot-dir output/iterate`. Enter from the title, walk a square, stand still (tapping 1 for any level-up) until knocked out. All 3 iterations end in `game_over`, score 70, 6 kills. Add `--restart-cycles 2 --restart-key Space` to check instant replay (passes).
- `node scripts/sim-run.mjs --bot kite --seeds 5` (flags: `--bot idle|kite|smart --seeds N --seed-base B --waves N --start-wave N --hp N --json`)

### Decisions

- Sim at fixed 1/60 s; ArenaScene accumulator, max 5 steps per frame. A frame within 0.5 ms of 1/60 s counts as exactly one step (Phaser's smoothed delta under the test clock is 16.63 ms, which otherwise skipped a step every ~500 frames).
- `?autoplay=1` computes the bot input every step, like sim-run. Browser autoplay and node give the same result for the same seed (checked: kite seed 4, score 1100, wave 3, 72.1 s in both).
- Level-up freezes the sim (`world.phase = 'levelup'`); the Arena keeps rendering and launches `LevelUpScene`, which calls `world.choose(i)` / `world.reroll()`. More pending levels reroll the cards in place.
- Score = kill points x combo (x1 + 0.1 per chained kill within 1.5 s, cap x3) + wave bonus 100 x n. Wave-end pops give XP only (no score, no kill count).
- Contact damage is fractional after wave scaling (+10 % per wave); HUD shows `ceil(hp)`. Armor subtracts flat, minimum 0.5 per hit.
- Spawns: budget (1.2 + 0.45 (n-1))/s, 3 units at wave start, capped so it can't bank more than one second's worth; random point at least 110 px from Booker; 0.8 s paw marker; cap 140 alive + telegraphed.
- Boss waves 5 and 10 are plain timed waves (banner says "BOSS WAVE (stub)"). Clearing wave 10 = victory.
- Rare cards (10 %) only on stat cards (double value, counts as one stack). All 10 stat cards are in already; only `bark` exists as a weapon.
- Any URL flag (`seed, wave, god, hp, autoplay, debug, weapons`) is a debug run: SaveData never writes (scores, stats, mute). Checked: a plain run writes `backyard-brawl:save`, `?god=1` doesn't.
- Debug flags: `?seed= ?wave=N ?god=1 ?hp=N ?autoplay=1 (&bot=idle|kite|smart, default smart) ?debug=1 ?weapons=a,b`. `?autoplay` and `?wave` skip the title.

### Sim numbers (no tuning yet; PLAN gates in parentheses)

- `--bot kite --seeds 5`: 1 win / 5; deaths in waves 4, 3, 3, 4; median level 7, median score 4614, peak 96 enemies, ~0.1 s per run.
- 20 seeds: idle dies in wave 1 every time (gate 1-3: ok). Kite median death wave 4, 10 % wins (gate 5-8, at most 30 %: dies too early). Smart 95 % wins (gate at least 60 %: ok, maybe too easy). Smart reaches level 17 by wave 10 (target 25-30: XP is low).

### Gotchas

- Phaser 4: `setTintFill` is gone; the hit flash uses `setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)` and resets to `MULTIPLY`.
- A missing `manifest.json` 404 shows as a console error in verify-runtime, so an empty manifest is checked in.
- Under the test clock the Arena's first frame has a large delta (several steps at once); the bot input per step keeps that deterministic.
- Card picks ignore keys for 180 ms after the overlay opens and ignore key repeat, so a held Space (dash) can't pick a card.

## Step 2B notes: menus, meta progression, high scores (2026-10-14)

### Files

- `src/core/SaveData.js`: save v1 (`backyard-brawl:save`). Shape: `scores` (top 10, each `{id, score, wave, level, time, kills, weapon, date, victory, endless}`), `lastScoreId`, `bones`, `kennel` (6 ranks 0-5), `stats {runs, kills, bestWave, wins, bones, bossesBeaten[]}`, `unlocks {weapons[], endless}`, `lastWeapon`, `lastEndless`, `muted`. API: `get, write, bestScore, isUnlocked, kennelRanks, recordRun(result), buyKennel(key), setLastPick, setMuted, reload`. Exports `normalizeResult` (missing Results fields default to 0 / [] / false), `bonesFor`, `kennelCost`.
- `src/core/GameState.js`: `runConfig` plus `makeRunConfig(weapon, endless)`. The Step 1 `lastWeapon` is now a getter and setter over `runConfig.startWeapon`. New mode `menu`.
- `src/core/Constants.js` (appended): `MENU_META` (weapon roster, names, blurbs, unlock rules; Kennel names, costs, per-rank values, icons; bones formula) and `MENU` (palette, button height, timings). It's named `MENU_META` because 2A's `META` holds the sim's per-rank values.
- `src/core/GameConfig.js`: scene list. `src/main.js`: `render_game_to_text()` now has `menu` (`textState()` of the active menu scene), `save` (bones, unlocked, endless, kennel, runs) and `runConfig`.
- `src/ui/Menu.js`: the shared menu kit. It has `menuText`, `drawFrame`/`addPanel` (wood frame), `addBackdrop`, `addHeader`, `Tile` (focusable card with bounce, shake and red flash), `MenuNav` (spatial arrow/WASD focus that wraps, with mouse hover synced to focus), `bindMenuKeys` (held-key guard, ignores repeat), and `fmt`/`fmtTime`/`boneIcon`. `src/ui/Button.js` is restyled as a wood plank with a gold focus ring and a hop. The constructor signature is unchanged.
- Scenes: `TitleScene`, new `WeaponSelectScene`, `KennelScene`, `ScoresScene`, and the rewritten `ResultsScene` and `PauseScene`.
- Scripts: `scripts/lib/menu-qa.mjs` (helpers), `ui-flow-check.mjs`, `save-check.mjs`, `menu-shots.mjs` (writes to `output/menus/`). `scripts/example-actions.json` now presses Enter, waits 12 frames, then presses Enter again.

### Decisions

- Title flow: Title, then WeaponSelect, then Arena takes Enter, Enter. Keyboard focus on an unlocked card also selects it, and Enter on a card starts the run. Mouse and touch: the first tap on a card selects it, and a second tap (or START) starts the run. Hovering only shows the card's info. A locked card shakes, flashes red, and shows its unlock condition plus progress (for example `Kills: 120/500`).
- Golden Bones = floor(score / 250) + 5 x wavesCleared + drops. They are added at Results. Debug runs compute the breakdown and show it but change nothing, in memory or on disk.
- Unlocks are checked in `recordRun`: ball when the best wave reached is 3 or more, bone at 500 lifetime kills, frisbee at wave 6, squeak when `bossesBeaten` includes `boss-cat`, zoomies when wins is 1 or more. Endless unlocks when wins is 1 or more. `stats.bestWave` is the highest wave reached, not waves cleared.
- A version mismatch, corrupt JSON or a non-object loads as full defaults. Inside a v1 save, each field is repaired on its own: ranks are clamped to 0-5, weapons are filtered to known keys, bad score rows are dropped, and a locked last pick falls back to bark.
- Results: Space replays at once with the same runConfig, Enter activates the focused button (PLAY AGAIN by default), and Esc goes to the title. Keys are ignored for 250 ms after Results opens. The score counts up over 0.9 s, then the bones rows, earned and balance count up, then the unlock cards pop in at 1 s. With no unlocks, the card row shows "Next unlock: ...". 1-2 cards are wide, 3 are medium, and 4-6 are compact.
- Pause reads `ArenaScene.snapshot()` (wave, level, score, weapons, stats) for the YOUR BUILD panel. Stat values are totals, so Kennel bonuses show there too (for example Strong Jaws as Sharp Teeth +5%).
- Kennel buy with no funds: the card shakes and flashes red, the balance flashes red, and the info line says "Need N more Golden Bones". A full upgrade shows MAX.
- Menu SFX reuse `MENU_MOVE`, `MENU_SELECT` (`action: play/kennel/scores/buy/weapon/unlock/retry`) and `MENU_BACK` (a failed buy, a locked weapon card and a locked Endless send `MENU_SELECT { action: 'denied' }` since Step 3A). Step 3 can map `action: 'buy'` and `'unlock'` to their own sounds.

### QA commands (dev server on 3002)

- `node scripts/ui-flow-check.mjs` (48 checks, about 15 s). Parts: A is keyboard on a debug run (?hp=1&seed=3), covering Enter, Enter, death, Results not saved, Space replay in 1 frame, Esc to title, and Pause Restart/Quit. B is keyboard on a plain URL with a seeded save, covering Kennel buys checked in localStorage, a buy denied for lack of funds, Scores, the remembered pick, runConfig carrying the Kennel ranks, and a plain run to death that writes the score, bones and stats. C is mouse only and D is touch only (`hasTouch`).
- `node scripts/save-check.mjs` (29 checks): corrupt, array, null, number, wrong version, missing and bad fields, persistence across reload, unlock rules and the bones formula, debug never writes, and storage that throws on every call.
- `node scripts/menu-shots.mjs` writes 13 PNGs to `output/menus/` (rich save, fresh save, results with 6 unlocks, and pause).
- `npm run iterate` still passes. Iteration 0 starts from the title and iterations 1-2 replay from Results, so iteration 0 spends 15 fewer frames in the Arena and its score can differ.

### Gotchas

- The menu scenes ignore keys for 120 ms after opening (`MENU.INPUT_GUARD_MS`) so a held Enter can't skip through two screens. Under the test clock that is 8 frames, so scripts should wait at least 10 frames between screens.
- Esc from Kennel or Scores returns to the title with focus on that button (TitleScene `init({focus})`). Scripts that go back to Play must press Left first.
- `?hp=` and the other debug flags make every write a no-op. Test saves through a plain URL with localStorage seeded before load (`openGame({ seed })` in `menu-qa.mjs`, which seeds once per tab so reload tests work).
- `MenuNav.focus(i, sound, animate, source)`: `source` is `'pointer'` for hover and tap. WeaponSelect uses it so that hover doesn't change the selection.

## Step 2A notes: combat content, art install, balance (2026-10-14)

### Files

- Art: `public/assets/*.png` copied from `art/out/` (no preview/drafts); `public/assets/manifest.json` = `art/out/manifest.json` (top-level keys, which `Assets.resolveManifest` already reads). Placeholders are only generated for missing keys.
- `src/core/Constants.js` (sim sections): `ARENA.BORDER_X/BORDER_Y` (12/16, matches the arena.png fence), new `ENEMIES` (crow, raccoon, skunk, kitten, boss-cat, boss-vac), `ENEMY` (elites, Golden Bone chance, `HP_QUAD`), `HOSTILE`, `BOSS`, `WAVES` (`BUDGET_QUAD`, in-wave ramp, `BOSS_EVERY`), `META`, `WEAPON_KEYS`, 6 weapon tables, `WEAPON_DESC`, `BOTS` (card scores, boss dodge, kibble risk), `RENDER` (feet offsets, shadow widths, tints), `DEPTH.TRAIL`.
- `src/sim/`: `Enemies.js` (behaviors, bosses, elites, `queryEnemies`), `Projectiles.js` (ball ricochet, boomerang bone, enemy shots `world.hostiles`), `Weapons.js` (ball, bone, frisbee, squeak, zoomies), `Waves.js` (boss waves, elites, quadratic budget, endless), `World.js` (runConfig options, meta, result contract), `Pickups.js` (Golden Bones, XP multiplier), `Player.js` (fence clamp, vac pull), `Upgrades.js` (`from` level, rare text), `bots.js`.
- `src/scenes/ArenaScene.js` (art rendering, boss FX, runConfig, snapshot), `src/scenes/LevelUpScene.js` ("NEW!" / "Lv 3 → 4"), `src/ui/Hud.js` (boss bar, bone counter), `src/core/Assets.js` (enemy anims `<key>-move`, `GEN.AURA`).
- `scripts/sim-run.mjs` (new flags `--weapon --meta --allowed --endless --god --perf`, killer + level-at-wave-10 columns), `scripts/step2a-shots.mjs` (screenshots to `output/step2a/`).

### Decisions

- Rendering: ground units use origin (0.5, 1) at `y + RENDER.FEET[type]` (the sim position is the hit-circle centre); crows are centred with a shadow 12 px below and draw over ground units. Kittens reuse the cat sheet at 0.7x. Elites: 1.2x, gold MULTIPLY tint, pulsing gold aura under them. Enemy frames are set from `e.age` (not `play()`), so frames stay deterministic under the test clock; the `<key>-move` anims exist for menus.
- Bosses are in `world.enemies` (weapons target them normally) and `world.bosses`, but not in the SpatialHash (a 22 px radius would widen every query); `queryEnemies()` = hash + bosses. Bosses shove small enemies aside and are never knocked back.
- Boss waves (n % 5 == 0; Robo-Vac when n % 10 == 0): no timer (HUD shows BOSS), 1.4 s big red paw telegraph on the far side, normal spawns at 0.45x, wave clears 1.3 s after the boss dies. Boss = guaranteed Golden Bone + XP shower. Endless repeats bosses with +60 % HP per 10 waves. Golden Bones still on the lawn at wave end are credited.
- Big Tom: walk 2.2 s → 0.7 s wind-up with a red lane → 300 px/s charge (stops at the fence) → summons 4 kittens (max 8 alive). Robo-Vac: bounces off the fence re-aiming halfway to Booker, 12 dust balls every 2.8 s; under 50 % HP: faster, 16 balls every 2.1 s, pulls Booker at 42 px/s within 300 px (suction rings drawn).
- Weapons: frisbee / zoomies have no cooldown (update hook; `active` = playing phase). Frisbee and zoomies use per-enemy re-hit timers (`e.cdOrbit`, `e.cdTrail`); paw prints hit crows too (otherwise a zoomies start can't touch them). Extra Treats: +1 shot (bark/ball/bone), +1 disc, +25 % squeak damage, +15 % print size.
- Difficulty: budget 1.6 + 0.2k + 0.17k² cost/s (k = n-1), ramping 0.7x → 1.3x within a wave; HP x (1 + 0.25k + 0.09k²) (wave 10 = 10.5x). Average alive enemies per wave (smart): 9, 7, 10, 13, 11 (boss), 22, 31, 38, 46, 19 (boss).
- Smart bot: scored cards (second weapon first, then levels, then stats), sidesteps Big Tom's lane and dashes through charges, avoids enemy shots, grabs kibble within 90 px unless an enemy is within 40 px (without this, squeak/zoomies starts lost their XP behind them).
- `?autoplay=1` offers every weapon as cards (demo); real runs offer unlocked weapons only. `result.debug = isDebugRun`. `result.outcome` = victory when wave 10 was cleared (Endless too).

### Balance (`node scripts/sim-run.mjs --seeds 20`, bark, meta 0, all weapons allowed)

| Run | Wins | Median death wave | Level at wave 10 | Gate |
|---|---|---|---|---|
| idle | 0 % | 1 (one seed 3) | - | dies 1-3 ✓ |
| kite | 30 % | 5.5 | 28.5 | median 5-8, ≤ 30 % ✓ |
| smart | 75 % | 6 | 28 | ≥ 60 % (aim 65-85), level 25-30 ✓ |
| smart, start ball / bone / frisbee / squeak / zoomies | 85 / 75 / 50 / 60 / 55 % | 7 / 7 / 6 / 6 / 6 | 28-29 | ≥ 40 % each ✓ |
| kite, meta ranks 5 | 85 % | 7 | 33 | better than ranks 0 ✓ |
| smart, `--allowed bark` (fresh save) | 95 % | 5 | 28 | stat cards only: easier |

20 seeds swing ±10 %; 40-seed runs agreed (kite 23-28 %, smart 70-78 %). Peak enemies ~100-140 in late waves.

### Performance (`node scripts/sim-run.mjs --perf`, node, wave 10 + Robo-Vac, cap kept full, 4 weapons at level 5)

- bark+ball+bone+frisbee: ~125 enemies, 31 shots, 42 dust/stink: mean 0.062 ms/step, p50 0.049, p99 0.27, max 1.0 (GC).
- squeak+zoomies+frisbee+bone: mean 0.059 ms, p99 0.21, max 0.56.
- Hot loops reuse arrays (`world.scratch`, weapon `discs`, `trailPool`, `MODS`, cached spawn pools); remaining allocations are per shot / per event.

### QA (all green 2026-10-14)

build; verify-runtime; iterate 3/3 game_over (score 53/76/76); validate-architecture 10/10 (1 warning: geometry literals); ui-flow-check 48; save-check 29; `node scripts/step2a-shots.mjs` 13 shots (Big Tom lane, Robo-Vac phase 2, wave 7 mix with elites, ball/bone, debug hit circles, level-up cards). Browser check: runConfig hearty 5 → maxHp 20, lucky 3 → 5 rerolls; Endless rolls into wave 11 after the Robo-Vac.

### Gotchas

- `world.scratch` is shared by every hash query: never run a second query while iterating its result (squeak copies into `w.hitBuf`; ball retargets with a linear scan).
- Enemies.js ↔ Projectiles.js import each other (spawnHostile / damageEnemy); nothing uses the other module at load time, keep it that way.
- Golden Bones: ~7 (kite) to ~14 (smart) drops per run at 1 %; with PLAN's floor(score/250) a winning smart run scores ~90k (≈ 360 bones). The Kennel may fill fast; tune in Step 4 if needed.
- `main.js` (2B) still says "fence 16 px" in `render_game_to_text().coords`; it is 12 px left/right now.

## Step 3B notes (audio) (2026-10-14)

### Files (all in `src/audio/`, no file outside it changed)

- `audioConfig.js`: every audio tunable. Bus levels in dB, limiter, duck amounts, intensity mapping, heartbeat / frisbee / zoomies timings, and `SFX_DEFS` (per sound: bus, max voices, min gap, priority, variation, level trim) plus `SFX_GROUPS` (death pops share max 6). `Constants.AUDIO` now only matters for the mute button size.
- `synth.js`: envelope helpers from soba-tower (`tone`, `noise`, `envGain`, EPS start so nothing clicks) plus chiptune pulse waves.
- `AudioManager.js`: `buildGraph()` = sequencer → musicBus → duck → master; stingBus (stingers, level-up shimmer pad, never ducked), sfxBus, uiBus → master → limiter. Music transport (`playMusic(track, {section, variant, delay, keep})`, one sequencer, `setSection` on bar lines), held + timed ducks, shimmer pad, background-tab suspend, voice stats, debug meter (music/sting/sfx/ui/master taps), `debugState()`.
- `music.js`: booker-run's Sequencer, generalized to N sections per song, tempo per section, kit variants. `songs.js`: `menu` (G major, 110 BPM, bouncy), `battle` (A minor, 144-148 BPM, 5 sections: base lead+bass+stabs → +kick/snare → +hats → +arpeggio → +lead octave/16th hats/fills), `boss` (C harmonic minor, 160/166 BPM, 2 phases; variant `cat` chip kit, `vac` metal kit + clanks), `results` (calm F major loop, 96 BPM).
- `sfx.js`: 57 synthesized voices (`VOICES`, pure, return their length), `playSfx(name, o)` with voice limiting, `wouldPlay`, `voiceCounts`, and the Robo-Vac `vacDrone` loop (`startLoop`/`stopLoop`).
- `AudioBridge.js`: EventBus → audio, M key, gesture unlock, visibility suspend, and a 50 ms read-only poll of the Arena world. `offline.js` (dev only): OfflineAudioContext renders, pre-limiter stats, WAV export.
- `scripts/audio-check.mjs` (new).

### Events mapped

- Music: `MUSIC_MENU` → menu (kept, not restarted, across Title / Kennel / Scores / Weapon Select); `MUSIC_GAMEPLAY` → battle, or boss when the run starts on a boss wave; `sim:waveStart` → boss track + boss horn on boss waves, back to battle + wave horn otherwise; `sim:waveEnd` → wave-clear sting + duck (skipped on wave 10); `sim:victory` → stop + fanfare; `sim:endlessStart` → fanfare over the loop; `sim:playerDeath` → fade out, death yelp, game-over sting; `MUSIC_GAMEOVER` → calm Results loop after 1.1 s (1.6 s on a win); `GAME_PAUSE/RESUME` → pause/resume, loops stop.
- Polled: battle intensity (score = 0.25 (wave-1) + 0.05 alive; thresholds 0.3/1.2/2.2/3.4, hysteresis 0.35, change lands on the next bar), boss phase (phase 2 or < 50 % HP → section 2), level-up overlay (hold −8 dB duck + shimmer pad until the phase leaves `levelup`), heartbeat at ≤ 30 % HP (0.86 s → 0.6 s), frisbee whirr tick, zoomies patter while moving, Robo-Vac drone in phase 2.
- SFX: `sim:shot` (bark / ball / bone / squeak), `sim:bounce`, `sim:hit` (pitch per enemy type, crit, boss thud / metal clank), `sim:kill` (cat / squirrel / crow / raccoon / skunk / kitten + elite layer), `sim:pop`, `sim:swoop`, `sim:enemyShot`, `sim:boss*` (spawn roar or vacuum whine + −7 dB duck, windup warning, charge, summon, phase 2 alarm, ring, bounce, death boom + −9 dB duck), `sim:pickup` (kibble chain: +1 pentatonic step per blip within 0.4 s; heart, magnet, golden bone), `sim:playerHurt`, `sim:dash`, `sim:levelUpOpen` (arpeggio), `sim:card` rare sparkle. Menus: `MENU_MOVE` (card tick inside LevelUp, else menu tick), `MENU_SELECT` action `card / reroll / play / buy / unlock / retry / denied|locked / other`, `MENU_BACK` (a Kennel MENU_BACK while `!scene.leaving` is a failed buy → denied), `GAME_OVER_SHOWN` new best.

### Mix (offline, pre-limiter; `audio-check --only levels`)

- Music loud RMS −23 to −25 dB, peaks −8 to −13 dB; common SFX peaks −20 (hit tick) to −10 (deaths), median −14 (music sits ~9 dB under); boss death / roar / fanfare peak −5 to −7 dB. Nothing reaches the −6 dB limiter threshold alone. WAVs: `output/audio/*.wav`.
- Voice limits: hit max 4 / 30 ms, deaths 2-3 each / 45-60 ms + death group 6, kibble 4 / 35 ms; prio-0 sounds drop above 16 alive voices, hard cap 28. Wave 9 god run + synthetic bursts (300 hits, 40 kills, 30 pops, 60 kibble per frame for 60 frames): peak 16 concurrent SFX voices, caps held, burst cost median 0.5-0.8 ms, max 2-4 ms per frame.

### QA commands (dev server on 3002)

- `node scripts/audio-check.mjs` (~3 min, 70 checks; `--only songs,menu,mute,run,boss,stress,death,coverage,levels`). If Vite full-reloads the page mid-part (another agent saving files), the part reruns once.
- `npm run build`, `node scripts/verify-runtime.mjs`, `npm run iterate`, `node scripts/validate-architecture.mjs`: all pass.
- `render_game_to_text().audio`: track, variant, song, section, pendingSection, bpm, layers, duckDb, duckTarget, shimmer, loops, sfx counts, peakVoices, liveSequencers. `window.__AUDIO__.stats` (played / skipped by reason / peaks) and `window.__AUDIO__.debug` (playSfx, voiceCounts, names).

### Gotchas

- **Sim event names collide with enemy types.** `World.emit` builds `{ type, t, ...data }`, and hit / kill / pop / spawn / telegraph / bossSpawn / bossDeath payloads carry `type: <enemy>`, so they reach the bus as `sim:cat`, `sim:boss-vac`, ... and `sim:hit` / `sim:kill` / `sim:pop` / `sim:spawn` / `sim:bossSpawn` / `sim:bossDeath` never fire (ArenaFx listens to those too). The bridge listens to `sim:<enemyType>` and tells the kind apart from the payload (`dmg` = hit, `points` = kill, `name`+`hp` = boss spawn, `name` = boss death, `id` without `elite` = pop). Suggested fix (sim owner): emit `{ ...data, type, t }` with the enemy type renamed to `enemy`; the bridge already reads `ev.enemy`, so it keeps working.
- `?wave=N` starts the wave before any gesture, so its horn is silent (the context isn't running yet). Expected.
- Kennel sends `MENU_BACK` for a failed buy; Weapon Select sends nothing for a locked card or the locked Endless toggle. Emitting `MENU_SELECT { action: 'denied' }` there would play the denied buzz (already mapped).
- UI confirm sounds need max ≥ 2 voices: with max 1 a second Kennel buy 300 ms later was skipped (the first was still ringing).

## Step 3A notes: visual polish / game feel (2026-10-14)

### Files

- New `src/fx/`: `ArenaFx.js` (director: EventBus `sim:*` listeners + `update(world, dtMs, booker)`; owns the player marker, shake, hit-stop, level-up intro, sweeps, boss intro, arrows, vignette, streaks, twinkles, death beat), `DamageNumbers.js` (pooled RetroFont BitmapText), `Particles.js` (4 shared explode-mode emitters: puff, dust, sparkle, confetti), `textures.js` (code-drawn FX textures + the `fx-num` 3x5 pixel font + `fx-outline`, Booker's frames dilated 1 px), `Transitions.js` (`fadeIn(scene)`).
- `src/scenes/ArenaScene.js`: creates `ArenaFx`; hit-stop gate before stepping; level-up overlay waits `fx.levelUpGate()`; Booker at `FX.DEPTH.PLAYER` (over enemies); enemy hit squash; boss above the intro darkening; marker pulse; kibble pop arc; stink landing marks + lingering danger rings; Big Tom lane chevrons; banners pass a style; shake calls moved to fx; `snapshot().fx` (numbers, particles, hitStopMs, levelUpWaitMs, bossIntroMs, arrows, vignette, dying).
- `src/ui/Hud.js`: `update(world, dtMs)`, score pop, combo meter (grows/shakes/colour with the multiplier + draining window bar), HP damage trail (white chunk holds 280 ms, then drains; low-HP bar blink), XP bar flash on level, dash bar flash when ready, banner ribbon + punch-in (`banner(title, sub, style)`: wave / clear / boss / danger). Golden Bones row moved to y 44 (under the combo meter).
- `src/scenes/LevelUpScene.js`: dim fades in, title punches in (moved to y 44, off the HUD), cards slide up + flip in with a stagger, focused card hops + bobs, rare cards shimmer, pick pops the chosen card (others drop) for 170 ms before the overlay closes or re-deals.
- Menu scenes (Title, WeaponSelect, Kennel, Scores, Results): `fadeIn(this)` in `create()`. WeaponSelect / Kennel: `MENU_SELECT { action: 'denied' }` on a locked weapon card, a locked Endless (button deny wrapped) and a failed Kennel buy (was `MENU_BACK`).
- `src/core/Constants.js`: new `FX` section (every tunable: depths, colours, shake pairs `[ms, intensity]`, hit-stop ms, number caps, particle counts, level-up/card timings, boss intro, vignette, fades, HUD juice).
- Sim fix (`src/sim/World.js`, `Enemies.js`, `Waves.js`): `World.emit` built `{ type, t, ...data }`, so payloads with an enemy `type` overwrote the event type (hits arrived as `sim:cat`; `sim:hit/kill/pop/spawn/telegraph/bossSpawn/bossDeath` never fired). Now `{ ...data, type, t }` and those payloads name the enemy `enemy`. Outcomes unchanged (smart 20-seed summary identical before/after). Audio's `enemyOf()` reads `ev.enemy`; its `sim:<enemyType>` fallback no longer receives anything (no double sounds; audio-check ALL OK).
- Scripts: `scripts/fx-shots.mjs` (18 shots in `output/fx/`: crowd w7/w9, hit numbers, level-up burst / cards-in / cards, boss intro, boss arrow, Big Tom charge lane, stink, boss death pre/boom/confetti, low HP, death beat start/fade, wave clear, hurt; `node scripts/fx-shots.mjs boss` runs a subset), `scripts/perf-check.mjs` (real time; frame interval + prestep->postrender cost, mean/p95).

### Decisions

- Every effect counts the frame delta it is handed, never wall time: hit-stop (`HITSTOP_HURT_MS` 50, `HITSTOP_BOSS_DEATH_MS` 60) skips sim steps (acc not advanced) for that many ms of delta; the level-up intro (`LEVELUP_INTRO_MS` 260: golden burst, ring, gold screen flash, XP flash) delays launching the overlay. The bot steps with the sim, so autoplay runs and iterate scores are unchanged (iterate still 53/76/76).
- Player readability: cream ground ring at `ACTORS - 0.5` (above every enemy shadow), a 1 px cream rim (`fx-outline` sprite behind Booker, same frame/flip/angle), Booker drawn at depth 950 over all enemies. Hurt = 60 ms white FILL, red MULTIPLY to 220 ms, i-frame blink kept (but not during the flash or the death pose). Dash cooldown arc around the ring, pop when ready.
- Damage numbers: 3x5 pixel RetroFont (no per-hit canvas text), cap 40, hits on the same enemy within 160 ms merge, crits 2x yellow with "!", boss hits pink, heart pickups "+3" green. When full, normal hits are skipped (counted in `fx.numbersSkipped`); crits/boss recycle the oldest.
- Death beat (sim's 1.1 s DYING phase, enemies already frozen): camera ColorMatrix filter desaturates/darkens over 0.4 s (WebGL only, guarded), FX particles at 0.35x, red vignette, camera fade to black over the last 0.3 s. Results opens on time.
- Transitions are fade-INs (150 ms) on scene create, so no transition delays a scene change (Results -> Arena replay still 1 frame; ui-flow-check checks it).
- Boss intro on `bossSpawn` (the landing, after the 1.4 s telegraph): 0.8 s darkening with the boss above it, name card slides in/out, landing shake + dust ring. Big Tom's charge impact is detected in fx from the boss state change charge -> recover (no new sim event).
- Off-screen arrows (max 5): boss (red, bigger; hidden while a good part of the sprite shows), Golden Bones (gold), hearts (pink), kept clear of the HUD's top 30 px.

### Performance (`node scripts/perf-check.mjs`, headless, real time)

- Before FX (Step 2 src copy served on a second port, same machine load), wave 9 seed 9 (~70 mean / 132-140 max enemies): cost 0.40-0.41 ms mean, p95 0.5-0.6; frame 16.9-17.3 ms.
- After (FX + Step 3B audio): cost 0.50-0.51 ms mean, p95 0.7; frame 17.3-17.6 ms. Wave 10 (?wave=10, boss wave, ~44 enemies): 0.31-0.40 -> 0.45 ms.
- FX alone (same page, FX toggled off/on 3x): 0.625 off vs 0.614 on (noise); `fx.update` 0.01 ms/frame, sim event forwarding 0.005 ms, Hud.update 0.06 ms. The A/B gap is mostly audio now receiving hit/kill events plus run noise; FX adds well under 25 %.

### Gotchas

- Vite reloads the page when any `src/` file changes (also another agent's): a long Playwright script then dies with "Execution context was destroyed" or stalls. Re-run it.
- Phaser 4 RetroFont: `Phaser.GameObjects.RetroFont.Parse()` returns the cache entry `{ data, texture, frame }`; add that to `scene.cache.bitmapFont` as is.
- Camera ColorMatrix: `cam.filters.external.addColorMatrix()`; `colorMatrix.saturate(-k)` (−1 = grey), then `brightness(v, true)` to multiply. Cameras are destroyed on scene shutdown, so the filter goes with them.
- Particle colour per burst: `emitter.setParticleTint(c).explode(n, x, y)` (tint op evaluated on emit). `emitter.timeScale` slows one emitter.
- Two agents share the session scratchpad: use a unique subfolder for temp scripts.

## Decisions

- Orchestrator gate after Step 1 (2026-10-14): build OK, verify-runtime PASSED, iterate 3/3 game_over score 70, smart bot 5/5 wins.
- Step 2 split in two parallel subagents with strict file ownership: 2A combat/art install/balance (sim, Arena, LevelUp, Hud, Assets, public/assets), 2B menus/meta (Title, WeaponSelect, Kennel, Scores, Results, Pause, SaveData, GameState). Contract: `GameState.runConfig = {startWeapon, meta, endless}`; Results gets `{result}` with score, wave, wavesCleared, level, kills, timeSec, bestCombo, victory, endless, goldenBones, bossesBeaten, weapons, startWeapon, debug.

- Orchestrator gate after Step 2 (2026-10-14): build OK, verify-runtime PASSED, iterate 3/3, ui-flow-check 48/48, save-check 29/29. Fresh seeds (base 500, 20 each): idle dies wave 1; kite median death wave 5, 10 % wins; smart 80 % wins, level 29 at wave 10. Screenshot review: Booker hard to find in crowded waves; no off-screen boss indicator (both sent to Step 3A).
- Step 3 split: 3A visual polish (src/fx, Arena, Hud, LevelUp, scene transitions) and 3B audio (src/audio only, tunables in src/audio/audioConfig.js), in parallel.

## TODOs

- Step 4: Golden Bone income too fast (a win ~ 90k score -> ~360 bones with floor(score/250); Kennel max costs 1200 total). Target: maxed Kennel after roughly 15-25 runs. Proposed: floor(score/1000) + 3 x waves cleared + drops.
- Step 4: main.js render_game_to_text coords string still says fence 16 px (left/right are 12 px).

- Step 2 done (2A + 2B). Possible Step 4 tuning: Golden Bone income vs Kennel costs; wave 10 boss wave is less crowded than wave 9 (BOSS.SPAWN_MULT 0.45).

## Gotchas
