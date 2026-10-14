# Progress

Original prompt: Create a plan to build a **2D pixel-art tower defense strategy game** starring **Soba**, inspired by *Plants vs. Zombies*. Players must defend their territory against increasingly difficult waves of enemies by strategically placing defensive units, managing resources, and unlocking powerful upgrades.

Focus on **addictive, strategic gameplay** with simple controls, unique defensive units, diverse enemy types, and progressively challenging levels. Implement a resource-generation system, unit upgrades, special abilities for Soba, and creative enemy mechanics that encourage different strategies.

Include a level-based progression system, unlockable units, increasingly challenging enemy waves, polished menus, satisfying animations, and a cohesive, charming pixel-art aesthetic. Prioritize intuitive gameplay, strategic depth, and replayability while establishing an original identity beyond *Plants vs. Zombies*.

Use `/image-gen` for characters, enemies, environments, and UI assets, with a strict **$10 total image generation budget**.

First create a concise implementation plan, then build and test the first fully playable level. Structure the game to support future levels and upgrades.

Engine: 2d (Phaser 4.2.1, Vite). Infrastructure copied from ../soba-tower and ../booker-run.
Created: 2026-10-14
Dev server: http://localhost:3003 (`npm run dev`, strictPort, HMR off: refresh after edits)
Plan: PLAN.md (source of truth for design numbers)

## Pipeline Status

- [x] Step 1: Scaffold and core loop (placeholders)
- [x] Step 1.5: Art (image-gen, parallel with Step 1) — $0.34 of $10, 15 calls
- [x] Step 2: Content, Soba abilities, menus, save, Treat Shop, art install, balance (2a gameplay + 2b meta in parallel)
- [x] Step 3: Visual polish + audio (3a polish + 3b audio in parallel)
- [x] Step 4: Final QA (orchestrator)
- [ ] Monetize: skipped (CLAUDE.md: only when the user asks)

## Copied infrastructure (Step 0)

- scripts/lib/browser.mjs + det.mjs, iterate-client.js, verify-runtime.mjs (booker-run; port 3003). validate-architecture.mjs (soba-tower).
- src/core/GLGuard.js, EventBus.js, Assets.js; src/audio/*; src/ui/MuteButton.js (soba-tower). These are references to adapt, not final code: Assets.js and the audio files are tower-specific.
- art/scripts/gen.sh (logs every image-gen call to art/spend.md). art/raw: Soba likeness refs (soba_ref_face, soba_ref_fullbody, hero_low-1, soba_tower_sheet = the 12-frame 40x40 Soba sheet from soba-tower).

## Decisions

- Name "Soba Guard", folder soba-guard, port 3003 (3000 booker-run, 3001 soba-tower, 3002 backyard-brawl).
- 640x360 internal resolution (a TD needs room for cards and text), 40 px tiles, 9x5 grid.
- Pure-JS sim in src/sim (fixed 1/60 s, seeded RNG) so headless balance bots run in Node.

## Step 1.5 notes (art)

- Every contract key is in art/out (manifest.json, preview.png, mock.png). Rebuild: `cd art && python3 scripts/build_assets.py` (deterministic). Prompts in art/drafts/prompts.sh + prompts.txt.
- One shared palette (<= 32 colours), alpha 0/255, outline #1a1220. Frames of one animation share a scale and are aligned on the feet.
- Alley image: top ~55 px is a wall with lanterns; row-1 enemies overlap its bottom edge. House: door + noren at mid-height.
- Weak spots to cover in code: enemy walk frames 0/1 differ only slightly (add a walk bob); grey rats have modest contrast on pavers; feather and stone puff are small at 16 px.

## Orchestrator notes after Step 1 QA

- Gate rerun by the orchestrator: build OK, verify-runtime PASSED, architecture 7/7, iterate 3/3 game_over score 110 (identical), sim idle 0/5 won, steamers 5/5 won.
- Art installed: art/out/*.png (minus preview/mock) + manifest.json copied to public/assets. output/step1-battle.png = autoplay at 90 s with real art.
- Seen in that shot (for Step 2/3): no Soba on the porch yet; the band between the top bar and the grid (y 56-84) is a flat green strip; the wave-progress flag markers overlap the "Wave n/10" label; default serif font.

## Orchestrator notes after Step 2 QA

- Combined gate rerun by the orchestrator: build OK, verify-runtime PASSED, architecture 7/7, sim-level all bots ALL PASS (idle 0 %, steamers 0 %, novice 100 % / 25 % 3-star, smart 100 % / 100 % 3-star), iterate 3/3 game_over score 255, ability-check ALL PASS, ui-flow-check PASSED, save-check PASSED.
- Visual notes for Step 3: HUD uses Courier while menus use META_FONT (Verdana stack): unify. Flat green hedge band at y 56-84 behind the hint strip. Bitten units stay solid red. No particles or hit feedback yet. Empty mute slots on menu screens and no mute in the battle HUD.

## Step 4 notes (final QA, orchestrator)

All run on the combined code after Steps 3a and 3b:
- build OK; verify-runtime PASSED; validate-architecture 7/7, 0 warnings.
- iterate (?skip=1&wave=10&coins=300, 3 iterations): game_over, score 255, identical, no error files.
- sim-level --bot all --seeds 20: ALL PASS. ability-check ALL PASS. ui-flow-check PASSED (keyboard, mouse, touch). save-check PASSED. audio-check OK (103 checks).
- fps-probe real time, ?autoplay=1: won, 790, 246.3 s = the fixed-step and Node result. Final wave 60.0 fps, no frame over 50 ms. A 31-44 s hitch cluster happened at load average 25-31 (other sessions); two 50 s reruns had 2 and 0 frames over 50 ms.
- The "flag over the A" in output/step3/after-hugewave.png is an older build: output/step3/recheck-hugewave.png shows the flag clear of the text.
- README.md written (run, controls, QA commands, debug flags, art pipeline, how to add Level 2).

## TODOs

- Level 2 "Night Market": level data with the Chili Lantern card, Tanuki (`stone`) and Fox (`lane`) mechanics in src/sim/Enemies.js (data only now), an ember effect for the Chili Lantern, balance gates.
- Level 1 is easy for skilled play (smart bot 3-stars every seed; novice 25 % 3-star). Consider a harder optional challenge or endless mode for replay.
- A player who builds no Lucky Cats can't win Level 1 (steamers-only 0 %). The opening hint covers it; watch real players.
- No touch test on a real phone yet (Playwright touch paths pass).

## Gotchas

- Use launchBrowser() from scripts/lib/browser.mjs for every Playwright script (a launchd reaper kills chromium.launch() browsers).
- Never use broad kill commands (pkill node, killall chrome): other sessions and dev servers run on this machine.

## Step 1 notes (scaffold and core loop)

Gates at the end of Step 1: `npm run build` OK; `verify-runtime` PASSED; `validate-architecture` 7/7, 0 warnings; iterate (`?skip=1&wave=10&coins=300`, 3 iterations) PASSED, all three `mode: "game_over"`, score 110, 11 kills, t 84.4 s, identical (Retry is a clean slate, `listeners: {}`); `sim-level --bot idle --seeds 10` 0/10 won (losses at waves 4-6); `--bot steamers --seeds 10` 10/10 won (score 520, 42 kills, ~250 s).

Files:
- `src/sim/` (pure JS, Node-safe): `Battle.js` (state, commands, step, events, snapshot/result), `Grid.js`, `Units.js`, `Enemies.js`, `Projectiles.js`, `Coins.js`, `Waves.js`, `Scooters.js`, `Rng.js` (mulberry32), `Bots.js` (idle, steamers).
- `src/data/`: `units.js` (luckycat, steamer, onigiri, chili data), `enemies.js` (rat + Step 2 enemies as data), `levels/level1.js`, `levels/index.js`.
- `src/core/`: `Constants.js` (all layout + tunables), `Assets.js` (rewritten for the PLAN §7 contract: 16 keys, code-drawn placeholders with a 1 px outline), `BattleConfig.js` (seed/start config, retry config), `Debug.js`, `GameState.js`, `GameConfig.js`, `EventBus.js` (game/ui/sim/audio events + `SIM_EVENTS` map); `GLGuard.js` unchanged.
- `src/scenes/`: Boot, Preload (placeholders + shader warm-up; `?skip` goes straight to Battle), Title, Battle, Results. `src/ui/`: Button, Card, Hud. `src/main.js` (render_game_to_text + soba-tower's test clock, unchanged).
- `scripts/sim-level.mjs` (new), `scripts/example-actions.json` (new), `scripts/validate-architecture.mjs` (adapted: buttons in ui/, sim/data purity, asset contract).

How the split works: `Battle.step(1/60, { commands, cursor })` holds every rule. Commands: `place`, `collect` (id), `collectAt` (x, y), `start` (skip setup); `cursor` (keyboard tile cursor) collects coins in its tile each step. The sim queues events (`place`, `placeFail`, `shoot`, `hit`, `kill`, `bite`, `unitLost`, `spawn`, `coinDrop`, `coinCollect`, `coinExpire`, `waveStart`, `hugeWave`, `push`, `cardUnlock`, `scooter`, `scooterGone`, `houseHit`, `win`, `lose`); BattleScene drains them after each step and emits them on the EventBus as `sim:*`. BattleScene only steps (accumulator, max 5 steps/frame, backlog dropped), renders with pooled sprites keyed by entity id (frames picked from sim time, so no Phaser anims), and owns UI state (selected card, cursor, pause). The browser `?autoplay=1` run (same seed, same bot) matches the Node sim exactly (seed 20261014: won, 520, 42 kills, 253.3 s).

Decisions:
- Coordinates in the sim are screen px (grid x 112..472, rows from y 84), so the scene draws entities at their sim x with no conversion.
- Enemy x is its centre. A walker bites the rightmost defender in its row within `ENEMY.BITE_REACH` (28 px) of the defender's centre; the scooter triggers when the body's front (x - 10) reaches the grid edge (x 112); the door is x 72.
- Steamers fire only at enemies left of `ENEMY.FIRE_RANGE_X` (488, just inside the alley), so rats queuing in the alley are safe until they step up.
- The scooter clears the garden row only (porch to x 488) and leaves; enemies still in the alley survive it.
- Waves can arrive in pushes: `groups: [{ at, enemies, spread }]` (each later push emits `push`). The final wave of Level 1 is 7 rats, then 6 more 36 s later. Reason: with one burst, every rat in a row reached the porch together and the scooter erased them all, so an unguarded row could never lose on the final wave (the `?wave=10` iterate run won 50% of seeds). With the late push, the one-steamer `?wave=10` scenario loses for 56/61 seeds (debug seed: lost at frame ~5060).
- Debug starts (`?skip`, `?wave`, `?level`, `?coins`, `?autoplay`, `?god`, `?seed`) use `DEBUG.SEED` (20261014) unless `?seed` is given; Retry keeps the seed on debug runs and rolls a new one in normal play.
- Results: R / Space / Enter or RETRY retries (120 ms fade), Esc / T or TITLE goes to the title; keys count only after 300 ms and never on repeats. Mode stays `won` / `game_over` on Results.
- During the setup, Space/Enter with no card selected (or the START button) starts wave 1. Placing deselects the card (PvZ). A tap on a coin collects it even with a card selected.
- Onigiri unlocks when wave 4 starts (`unlocks: [{ afterWave: 3 }]`); `?wave=N` starts with the cards unlocked before wave N.
- Win bonus 100 points (`SCORE.WIN_BONUS`) on top of kill points.

Gotchas:
- Phaser Container hit areas are centred on the container; every clickable thing here uses a top-left `Zone` inside the container instead (Button, Card), which also makes `event.stopPropagation()` keep the click away from the scene's own pointerdown.
- The accumulator compares with `SIM.EPS`: 16.666 ms frames under the test clock otherwise skip a step now and then (float drift), which would break fixed-step = real-time parity.
- iterate-client mouse coords are canvas CSS px (1280x720 for a 640x360 game in its 1280x720 viewport); the actions file uses the keyboard only.
- zsh: `echo =====` fails ("= not found"); variables don't word-split in `for` loops (`set -- $cfg` doesn't split).

TODOs (Step 2+):
- Level 1 content: lid rats and crows replace the substituted rats (comments in `level1.js` list the PLAN counts), Soba on the porch (Fetch, Bark, Zoomies), tier upgrades, Recall, hints, menus, save, Treat Shop, art install (manifest → `public/assets/`).
- Balance: idle currently loses at waves 4-6 (PLAN gate: before wave 5); the `steamers` bot (cats then steamers) wins 100%. PLAN's novice / smart / steamers-only bots need writing (`src/sim/Bots.js`).
- Audio is not wired (src/audio and src/ui/MuteButton.js are untouched Step 0 copies, imported by nothing); Step 3 hooks `sim:*` events.
- No hit/kill/collect effects yet (only a red hit tint and toasts); Step 3.

## Step 2b notes (menus, progression, save, Treat Shop)

Gates at the end of Step 2b: `npm run build` OK; `verify-runtime` PASSED; `validate-architecture` 7/7 (the one warning is in `src/sim/Bots.js`); `ui-flow-check` PASSED (0 failed, 0 warnings: keyboard-only, mouse-only and touch paths); `save-check` PASSED; `npm run iterate` PASSED. Screenshots: `output/step2/ui-{title,select,select-locked,select-progress,shop,shop-refused,pause,results-win,results-loss}.png`.

Files (all new unless noted):
- `src/core/SaveData.js`: `soba-guard:save` v1. Every storage call in try/catch; storage blocked or full → in-memory save for the session (`status().storageOk` false). Corrupt JSON, a foreign version, `null` or an array → clean v1 save, rewritten at once; well-formed saves are sanitised field by field (bones >= 0, ranks 0-3, starter units always kept). API: `level(n)`, `bones()`, `shopRank(k)`, `shopRanks()`, `unlockedUnits()`, `isUnitUnlocked(k)`, `muted()/setMuted()`, `getModifiers()`, `buy(k)`, `recordResult(result, { debug })`, `reset()`, `reload()`, `status()`. `window.__SAVE__` = SaveData. `?reset=1` wipes the save on load.
- `src/core/MetaConstants.js`: every menu number and string (font, colours, layouts, level-node table, star labels, loss tips). `META_FONT` = Verdana/Tahoma/DejaVu Sans, bold with a 3 px dark stroke: the battle HUD can adopt it.
- `src/data/shop.js`: Piggy Bank (+25 start coins), Loud Bark (`barkCooldownS` +2 per rank = 2 s off the cooldown, matching Soba.js), Hot Steam (+10 %), Lucky Paws (+8 %); 3 ranks at 5/10/15 bones.
- `src/scenes/{Title,LevelSelect,Shop,Results,Pause}Scene.js` (Title and Results replaced). `src/ui/MenuNav.js` (focus + arrows/WASD/Enter/Space/Esc, optional explicit neighbours, mouse hover moves focus), `src/ui/MenuKit.js` (text style, night sky, lanterns, panels, bone badge, toast, fades, level/progression helpers, `battleConfigFor` / `startBattle`), `src/ui/MenuHooks.js` (`menuSnapshot` for render_game_to_text, `?test=1` hook). `src/ui/Button.js` extended (same signature; adds `font`, `lip`, `icon`, `setFocused`, `setDimmed`, `setLabel`, `activate`, `getBounds2`).
- `src/core/GameConfig.js`: scene list Boot, Preload, Title, LevelSelect, Shop, Battle, Pause, Results. `src/main.js`: one import, `installMenuHooks(game)`, and a `menu` block in render_game_to_text.
- `scripts/ui-flow-check.mjs`, `scripts/save-check.mjs`. `scripts/validate-architecture.mjs`: the magic-number scan now skips any `*Constants.js` (MetaConstants).

How it fits:
- Flow: Title → Level Select → Battle (`makeBattleConfig({ levelNumber, modifiers: SaveData.getModifiers() })`) → Results → Retry / Level Select / Next level. Pause: BattleScene launches `PauseScene` and pauses itself; PauseScene resumes it (`scene.resume('BattleScene')`) and stops, or Retry (fresh battle, `retryConfig`) / Quit (Level Select).
- Level Select: a node is playable when `src/data/levels` has that level number and the previous level is cleared; otherwise "Coming soon" (no data) or "Clear X first". The reward per node comes from `level.clearUnlocks[0]`, else `LEVEL_NODES[n].reward`.
- Results writes the save. Debug = `result.debug === true`, or no `debug` field and `battleConfig.debugRun`. Stars merge with OR; each star pays 5 bones once ever; `unlocks` join `unlockedUnits` (if a result has no `unlocks` field, a win unlocks the level's reward). A loss never removes anything.
- render_game_to_text `menu`: `{ scene, focus, bones, levels: [{ n, name, playable, exists, cleared, stars, bestScore, reward }], shop, unlocked, modifiers, storage, ...scene extras }` (Level Select `selected`; Shop `lastPurchase`, `lastFail`; Results `won, stars, starsShown, bonesEarned, saved, debug, unlockShown, nextLevel`). Mode stays `title` on menu screens.
- `?test=1` adds `window.__TEST_FINISH__(won, stars)`: ends the current battle with a NON-debug result for the battle config's level and opens Results (stars default to all three on a win).

Gotchas:
- Phaser reuses scene instances: fields like `this.soba` keep pointing at destroyed objects on the next visit. Reset them at the top of `create()`. Custom listeners on `this.events` also survive a restart (MenuNav takes an `onFocus` callback instead).
- Keys reach only the RUNNING scene (`canInput`), so P in PauseScene never re-toggles the paused BattleScene.

For later steps:
- Step 3 audio: the top-right slot (`MENU.MUTE_SLOT`, `drawMuteSlot` in MenuKit) is where `MuteButton` goes on menu screens; `SaveData.muted()/setMuted()` store the flag.
- Level 2+: list `chili` in `level.cards` (menus don't pass `cards`; the Level 1 tutorial depends on its own card list).

## Step 2a notes (gameplay content, Soba, tiers, balance)

Gates at the end of Step 2a: `npm run build` OK; `verify-runtime` PASSED; `validate-architecture` 7/7, 0 warnings; iterate (`?skip=1&wave=10&coins=300`, 3 iterations) PASSED, all `game_over`, score 255, 19 kills, t 58.6 s, identical; `sim-level --level 1 --bot all --seeds 20` ALL PASS (table below); `ability-check` 30/30 PASS; browser `?autoplay=1` (smart, seed 20261014) = Node exactly (won, 790, 53 kills, 246.3 s, 3 stars) on the test clock and in real time, and novice seed 7 too. P with the new PauseScene: pause, resume (P / Esc) checked in the browser. Screenshots: `output/step2/{auto-*,soba-bark,soba-bark-wave6,crow-hop,zoomies,tools-upgrade,tools-recall}.png`.

Balance (20 seeds from 1; 50 seeds from 101 in brackets):

| bot | win | 3 stars | gate |
|---|---|---|---|
| idle | 0 % (all lose at wave 4) [0 %, wave 4] | 0 | loses before wave 5: PASS |
| steamers (steamers only) | 0 % [2 %] | 0 | <= 50 %: PASS |
| novice | 100 % [100 %] | 25 % [42 %] | >= 70 %: PASS |
| novice-skip (never builds in row 4) | 0 % [2 %] | 0 | check: every row needs defending |
| smart | 100 % [100 %] | 100 % [100 %] | 100 % and 3 stars >= 60 %: PASS |
| cats-steamers (Step 1 bot) | 100 % | 95 % | (no gate) |

With every Treat Shop item at rank 3 (`--mods '{"startCoins":75,"barkCooldownS":6,"dumplingDamagePct":30,"catRatePct":24}'`) steamers-only rises to 45 % and novice to 100 % / 100 % 3 stars, so the shop is felt.

Balance changes vs PLAN (all in data/Constants, each one measured with the bots):
- Lucky Cat: a coin every 14 s (PLAN 9), tier 2 every 10 s (PLAN 6.5). At 9 s the economy was ~2.7x PvZ's sunflower: novice won 100 % with 3 stars every time, crows and lid rats died around column 7 (0 hops a game), smart sat on 2000 coins.
- Crow: 220 HP, 24 px/s (PLAN 150, 18). At 150 HP crows never reached a defender, so the hop never showed.
- Waves 8-10 heavier than the PLAN table: 8 = 2 rats + 2 lid rats + 2 crows (PLAN 2 lid + 2 crows), 9 = 3 rats + 2 lid + 1 crow (PLAN 4 mixed), 10 = 6 rats + 3 lid + 2 crows, then a push of 5 rats + 2 lid + 2 crows 30 s later (PLAN 8 + 3 + 2). The two-push final wave from Step 1 is kept (it still stops scooters alone from saving a bare row).
- Waves 1 and 3: their first rat always takes row 2 (`rows: [2]` in the wave). Without it idle survived to wave 5 on some seeds (rats from consecutive waves got flattened by the same scooter). Now an empty garden loses at wave 4 on every seed.
- Bark: stun + push reach 4 tiles from the porch edge (enemy front x <= 272, PLAN), but the lid is knocked off any lid rat in her row whose front is in the garden (x <= 472, `SOBA.BARK_LID_X`). With a 4-tile lid range, a player following "press B" when the lid rat appears wasted the 18 s cooldown, and the smart bot never barked at a lid.
- A scooter kill no longer counts toward the "70 % of the wave's HP is gone" early-next-wave rule (`Waves.onScooterKill`): failing shouldn't speed the level up (it made idle's loss wave seed-dependent).

Files: new `src/sim/Soba.js`, `src/ui/{AbilityButton,ToolButton,HintToast}.js`, `scripts/ability-check.mjs`. Rewritten: `src/sim/{Battle,Enemies,Units,Bots}.js`, `src/scenes/BattleScene.js`, `src/ui/Hud.js`, `src/core/BattleConfig.js`, `src/data/{units,enemies}.js`, `src/data/levels/level1.js`, `scripts/sim-level.mjs`. Edited: `src/sim/{Waves,Coins}.js`, `src/core/{Constants,EventBus,Debug}.js`, `scripts/example-actions.json` (description only).

How it works:
- Commands added to `Battle.step`: `sobaMove {row}`, `bark`, `zoomies`, `upgrade {row,col}`, `recall {row,col}`. Bark/zoomies asked for while Soba trots are queued and fire when she arrives (so "tap porch, then B" just works). New sim events: `enter` (critter steps into the garden), `lidOff {cause: bark|broken}`, `hop`, `ember`, `sobaMove`, `bark`, `zoomies`, `zoomiesEnd`, `zoomiesReady`, `abilityFail`, `fetch`, `upgrade`, `upgradeFail`, `recall`, `recallFail`, `hint` (all forwarded as `sim:*`, names in EventBus.js).
- Lid: `e.lid` soaks all frontal damage (dumplings, embers, zoomies) and overflow carries to the body; a lid rat with no lid is drawn with the `rat` sheet; the lid tumbles off as the items `lid` frame. Crow: on reaching its first defender it hops (0.6 s, 22 px arc) to 24 px past it, then walks/bites normally; airborne crows ignore bark. Stunned critters neither move nor bite (blue tint + a star circling).
- Soba: x 92 on the porch, faces right, run frames while moving/dashing (flipped on the zoomies return leg), bark frames 0.6 s, cheer/sad at the end. Drawn in front of the parked scooters. Fetch: landed coins in her row fly to her after 1 s (also coins already lying in a row she moves to). Zoomies meter: +1 per kill of any cause.
- Tiers: `tier2` in `data/units.js` (cat interval, steamer 2-dumpling burst 0.15 s apart, onigiri 2000 HP full heal; chili has none). `unit.paid` sums what was paid; Recall refunds floor(50 %). Recalled units don't count as lost. Tier-2 units wear an items `star` badge.
- Chili Lantern is now implemented in the sim (`role: 'area'`, embers hit every enemy within 3 tiles ahead every 2 s) but has no Level 1 card and no ember sprite yet.
- Input: U / X toggle the tools (top-bar buttons at x 452 / 500), then Space or a tap on a defender applies it (the tool turns off after a success); the cursor shows `-75` / `MAX` / `+62`. B / Z / F, a porch tap moves Soba. Esc / right-click clear card and tool. P launches `PauseScene` when the scene manager has it (it does now), else the built-in overlay.
- Hints: `level.hints` (id -> text), fired once per battle by the sim (`battle.hint(id)`): cat (start), coin (first coin), steamer (first rat of the first wave), soba (wave 2), onigiri (unlock), lidrat / crow (first one to enter the garden), upgrade (wave 5), zoomies (meter full). Shown one at a time, 4.5 s each, in the strip under the top bar; `hintsShown` and `hintVisible` are in the snapshot.
- HUD: bottom bar = level name, Bark (B) and Zoomies (Z) round 44 px buttons with a ring (cooldown seconds / kills left as a number), "Wave n/10" right-aligned left of the bar (no overlap), pole-and-pennant flags above the bar that turn green once passed. Big event toasts moved to mid-field (y 160).
- Result contract: `Battle.result()` = `{ levelNumber, levelId, levelName, won, score, wave, wavesTotal, kills, scootersUsed, unitsLost, timeS, seed, debug, stars: [cleared, noScooterUsed, noDefenderLost], unlocks }` plus `outcome` and `time` for older readers. `debug` is the config's `debugRun` (or god mode).
- Bots: `idle`, `steamers` (steamers only, renamed from the Step 1 bot, which is now `cats-steamers`), `novice` (seeded bot RNG from the battle seed, so browser = Node), `novice-skip`, `smart`. Tunables in `Constants.BOTS`. `?autoplay=1` now runs `smart`; `?bot=` picks another. `sim-level --bot all` prints the gate table and exits 1 if a gate fails; `--mods` takes modifiers JSON.

Gotchas:
- `rows: [..]` in a wave pins the rows of the first spawns in time order; the wave's enemy order is shuffled with the battle RNG.
- Sprites change texture mid-life (lid rat -> rat): `sync()` releases and re-acquires when the wanted texture differs, so pools stay per texture. `acquire()` resets angle/scale/flip too.
- Units being bitten stay red the whole time (hit flash every frame, Step 1 behaviour); Step 3 could switch to a flicker.

TODOs / for later steps:
- Step 3: bark/zoomies/lid/hop sounds (`sim:bark`, `sim:zoomies`, `sim:lid_off`, `sim:hop`, `sim:fetch`, `sim:upgrade`, `sim:recall`), ember and zoomies dust particles, chili ember sprite, nicer hedge band (hints sit on it), maybe the META_FONT for the HUD.
- The smart bot always 3-stars and ends with spare coins: Level 1 is easy for an optimal player (by design for a first level). Novice wins every seed but 3-stars only 25-42 %.
- Steamers-only loses ~100 %: a player who never builds cats can't win Level 1. The `cat` hint at the start is the safety net; watch it in playtests.

## Step 3b notes (audio)

Gates at the end of Step 3b (dev server 3003): `npm run build` OK; `verify-runtime` PASSED; `validate-architecture` 7/7 (the magic-number WARN lists only src/fx files, none of the audio edits); `audio-check` AUDIO CHECK OK (103 checks, max liveSequencers 1, no console errors, ~4 min); iterate (`?skip=1&wave=10&coins=300`, 3 iterations) PASSED, all `game_over`, score 255, 19 kills, t 58.6 s, identical, and each ends `audio: results / lose / live 1`; `ui-flow-check` PASSED; `save-check` PASSED.

Files: new `src/audio/AudioConstants.js` (every audio number, so core/Constants.js stays the polish agent's), rewritten `src/audio/{music,sfx,AudioBridge,offline}.js`, `src/ui/MuteButton.js`, `scripts/audio-check.mjs`; adapted `src/audio/AudioManager.js` (battle state instead of zones), `src/audio/synth.js` (+ `chip` pulse lead). One-line hooks elsewhere: `main.js` (`initAudioBridge(game)` + `payload.audio`), `EventBus.js` (UI sound block: `UI_PRESS`, `UI_MENU_MOVE`, `UI_MENU_BACK`, `UI_SHOP`), `Button.js` (press emits `UI_PRESS {label}`), `MenuNav.js` (focus move after the first frame emits `UI_MENU_MOVE`; Esc/Backspace emits `UI_MENU_BACK`), `ShopScene.js` (buy emits `UI_SHOP {ok, reason}`), `Hud.js` (speaker button left of Pause, `AUDIO.MUTE_BTN_HUD` x 566), `MenuKit.drawMuteSlot` (now a real `MuteButton` at `MENU.MUTE_SLOT`), `PauseScene.js` (calls `drawMuteSlot`). Results has no speaker button: its panel (x 24-616, y 12) covers the slot; M works there.

How it works:
- Gesture unlock: the AudioContext is created/resumed on the first pointerdown / keydown / touchend (capture phase; Shift/Ctrl/Alt/Meta/Esc don't count, Chrome doesn't treat them as activation). Until then music requests are remembered and every SFX is a counted no-op. Every context call is in try/catch: a missing or throwing `AudioContext` leaves the game silent and error-free (`audio-check` part D). Hidden tab suspends the context.
- Buses: sequencer layers -> music bus (-7 dB) -> duck -> master (-1) -> limiter (-3 dB threshold, 20:1); SFX groups -> SFX bus (-3) -> master; generated 2 s reverb -> return (-9). Mute ramps the master to 0 in 50 ms; stored with `SaveData.setMuted` and mirrored in `gameState.isMuted`. M anywhere (not with Ctrl/Cmd/Alt) or any speaker button emits `AUDIO_TOGGLE_MUTE`; unmuting plays the confirm pluck.
- Music follows the showing scene: `AudioBridge` reads the active scene on Phaser's `poststep` (it also runs under the advanceTime test clock): menu screens -> `menu` (kept across Title / Level Select / Shop, no restart), ResultsScene -> `results` with a win or lose intro. Battle music starts on `GAME_START` (so Pause -> Retry and Results -> Retry restart it). One sequencer at a time: `playMusic` always stops the old one; `liveSequencers` stays 1 through 3 retries.
- Battle layers: `sim:wave_start` sets the wave band (waves <= 30 % of the level: band 1, <= 70 %: band 2, else band 3: 1-3 / 4-7 / 8-10 on Level 1) and tension on flag waves; both land on the next bar line. Layers: band 1 = chip pulse lead, soft bass, kakko (104 bpm); band 2 + walking bass, taiko, 8th hats, koto arpeggio (106); band 3 + matsuri taiko fills, 16th hats, chappa, fue doubling (110); tension (flag wave until the next normal wave) = In scale, driving bass, busy taiko, shime-daiko 16ths, drone (114). Menu = soft koto, long bass, drone, shakuhachi (88). Results = 2-bar win fanfare (chip run + strum, 132 bpm; happy barks 1 s in) or lose sting (In-scale fall, 72), then a calm koto loop (yo / In). Battle music fades over 1 s at the win / loss (`winHit` / `doorBang`). Pause fades music out (0.2 s) and back.
- SFX (`sfx.js` VOICES, event -> sound): card select / tool select = wood tok + pluck; `sim:place` soft thunk; place / upgrade / recall / ability fail = soft "bu-bu"; coin drop = bell chime; coin collect = bright ding stepping up the yo scale for pickups < 0.9 s apart; shoot = steam puff; hit = soft splat (lid hits: small tink; embers/zoomies quieter splat); kill = rat squeak + poof / lid-rat lower squeak + tink / crow caw + feathers / anything else "pon" + poof; crow entering the garden = caw; hop = three wing flaps; lid off = metal clang + two clatters; bite = crunch looped every 0.42 s of SIM time while anything bites (one voice, +15 % gain per extra biter, max 1.6x, polled from the Battle on poststep); unit lost = crumble + falling pop; upgrade = koto arpeggio up; recall = reverse whoosh + chink; bark = synthesized woof (sawtooth through two formants + square body + breath, +-8 % pitch); zoomies = yip + 14 paw taps + whoosh out and back; zoomies ready = three bells; scooter = beep-beep horn + putting two-stroke engine; wave start = taiko + koto signal; huge wave = taiko don, don, don-don + gong, music ducks 4 dB; push = three taiko; card recharged = tiny tick (polled); new crew card = koto run; menu move tick / confirm pluck / back pluck; shop buy = ka-ching + sparkle; shop refused = low double buzz; pause / unpause blips.
- `UI_PRESS` plays confirm (or back for labels starting with "<") in a microtask unless the press's own event already made a sound (pause, mute, shop, back key): `claim()` in AudioBridge.
- Throttling (`createGate` in sfx.js, shared with offline.js): per-sound minimum gap (`AUDIO.SFX_GAP_MS`) plus density: more than 2 plays of one sound in 300 ms get 1/sqrt(n) quieter. Offline worst case (20 each of bite, splat, rat kill, puff, coin within 200 ms over band-3 tension music): 19 played, 81 skipped, pre-limiter peak -6.1 dBFS, 0 clipped samples.
- render_game_to_text().audio: muted, contextState, track, intro, segment, musicPlaying, musicPaused, section, tension, scale, bpm, layers, duckDb, sequencersStarted, liveSequencers, sfx {name: plays}, sfxLast, sfxSkipped.

Measured (pre-limiter dBFS, `audio-check` part L): music peaks -9.4 to -14.8, loud RMS -23.5 to -24.2, never over the limiter threshold. SFX peaks: push -7.1, hugeWave -5.9, winHit -5.4 (the loudest), bark -7.9, doorBang -7.9, lidOff -9.7, happyBarks -10.4, waveStart -10.9, scooter -12, upgrade -13.4, uiConfirm -14.6, place / denied / cardUnlock ~ -15, coinCollect -16.4, kills -16 to -18, hit -18.8, bite -18.9, hop -20.2, shoot -20.5, coinDrop -21.9, sobaMove -22.4, cardReady -24.6, uiMove -25.

`scripts/audio-check.mjs` parts (`--only A,B,C,D,L`): A menus + battle in real time (gesture unlock, modifier keys don't unlock, Title / Level Select / HUD / Pause speaker buttons, mute persists across reload, M, menu music not restarted between menus, card selected + HUD speaker click places nothing, pause/resume, hidden tab); B `?wave=1/4/5/8&coins=400&autoplay=1` layers 3 -> 6 -> 8 and tension 9 at the flag wave, gameplay SFX, muted SFX skipped; C test clock: real loss (idle bot at wave 10) -> lose sting, 3 retries -> exactly 1 live sequencer, forced win (`?test=1`) -> fanfare, happy barks, calm loop, Esc -> menu music; D AudioContext missing / throwing; L offline levels + the burst.

Gotchas:
- Results ignores keys for its first 300 ms of game time; under the test clock, step `advanceTime` past that before pressing R/Esc (part C does).
- SFX rate limits use `performance.now()` (real time), so fixed-step runs skip fast repeats: don't assert exact SFX counts there. The bite loop uses sim time.
- While Step 3b ran, `src/fx/Effects.js` briefly threw `Cannot read properties of undefined (reading 'In')` (`Phaser.Math.Easing.Quadratic.In`) during a battle; it was gone on the next runs (the polish agent's file, mid-edit).

## Step 3a notes (visual polish / game feel)

Gates at the end of Step 3a: `npm run build` OK; `verify-runtime` PASSED; `validate-architecture` 7/7, 0 warnings; iterate (`?skip=1&wave=10&coins=300`, 3 iterations) PASSED, all `game_over`, score 255, 19 kills, t 58.6 s, game state identical (only the frame counter and the audio agent's cumulative SFX counters differ); `ability-check` ALL PASS; `ui-flow-check` PASSED (0 failed, 0 warnings); `sim-level --level 1 --bot all --seeds 20` ALL PASS (same table as Step 2a: idle 0 %, steamers 0 %, novice 100 % / 25 %, smart 100 % / 100 %). Real time (`scripts/fps-probe.mjs`, headless Chromium, `?autoplay=1`): won 790 in 246.3 s (= the Node sim), 59.9 fps average, p99 16.8 ms, final wave 60.0 fps with 0 frames over 25 ms; 4 frames over 50 ms, all but one in one cluster at 21 s that did not reproduce in 3 reruns (machine noise; an earlier run under load had 27). Crowded stress run (`?skip=1&wave=10&bot=steamers&coins=900`, 15 critters alive): 59.4 fps, 0 frames over 50 ms. Screenshots: `output/step3/before-*.png` vs `after-*.png` (title, midwave, bark, zoomies, scooter, hugewave, cards, tool, ghost-blocked, loss, win, results-win, results-shine); `scripts/fx-shots.mjs --prefix X [--only a,b]` retakes them on the test clock.

Files (new): `src/fx/Effects.js` (all battle juice, driven by `sim:*` EventBus events, created in BattleScene.create, destroyed on shutdown; listeners verified gone after Results), `src/fx/FxTextures.js` (code-drawn white particle textures: pixel, dust, spark, line, confetti, firefly, radial glow), `src/fx/Ambient.js` (fireflies, flickering ADD glows, twinkling stars, moon glow, confetti, `addMenuAmbience(scene)`), `src/fx/Scenery.js` (sky + fence + hedge + lantern string band at y 56-84, plank edge under the grid), `scripts/fx-shots.mjs`, `scripts/fps-probe.mjs`. Edited: `src/scenes/BattleScene.js` (rendering only: Effects wiring, styleUnit/styleEnemy/styleSoba per sprite, coin bounce, dumpling bob, scooter rattle, ghost preview, tool icon, scenery, fade to Results; the old dropLid/showBark/drawFx moved to Effects), `src/ui/{Hud,Card,HintToast}.js`, `src/scenes/{Title,LevelSelect,Shop,Results}Scene.js` (ambience; Results star pop/sparkles/confetti/unlock shine), `src/core/Constants.js` (UI.FONT = META_FONT stack, DEPTH.FX/FX_TOP/HUD_FX, VIEW.RESULTS_DELAY_WIN, UI.WAVE_BAR/WAVE_TEXT moved right 14 px, new FX / FX_PARTICLES / FX_COLORS / SCENERY), `scripts/validate-architecture.mjs` (skips the two pixel-drawing fx files, like Assets.js). No `src/sim` or `src/data` change.

What is where:
- Critters: white FILL flash 0.06 s + squash on every hit, steam puff + dough crumbs (dumpling), clang sparks (lid hit), sparks + small shake (zoomies hit); 2 px walk bob and a 1 px bite lunge; bark jitter on stunned critters; death = white squish ghost + dust + coloured pixels + "+points" pop (crows also drop feathers); the lid tumbles off spinning with clang sparks.
- Crew: 1 px idle breathing (scaleY), place pop (Back ease from 0.35) + dust ring, steamer recoil + steam on each shot, cat hop on each coin, upgrade pop + ADD gold glow + sparks + "UP!", recall poof + green "+refund"; bitten = 3 Hz flicker (white, then red, then normal) instead of solid red; lost = crumbling ghost + debris in the unit's colour.
- Coins: landing double bounce, glints, drop sparkle; collected coins fly to the counter (fetched ones from Soba) and the counter bumps.
- Soba: bark squash + "WOOF!" pop + rings sweeping the row + small shake; zoomies gold afterimages + paw dust; win hops.
- Scooter: launch shake + exhaust, speed lines and puffs while driving, 1 px rattle.
- Huge wave: red ribbon banner slides in from the right, the flag pops and flutters, slides out (replaces the toast). Other toasts now pop in (Back ease) and fade out.
- Win: cream flash (capped overlay), two confetti bursts, sparks, slow motion of all effects (0.3 easing back to 1 over 1.2 s of frame time; tweens + emitters time scale, reset on create/destroy), Results after 2.2 s (loss stays 1.2 s), 0.3 s fade to Results.
- Loss / house hit: shake + capped red flash; camera ColorMatrix filter desaturates over 0.8 s plus a dark overlay; Soba sad.
- HUD: Verdana stack everywhere (UI.FONT); cards: unaffordable cost in red, selected card lifts 2 px with a pulsing gold outline, white flash + hop when a card finishes recharging, sparkles on a newly unlocked card; ghost preview of the selected unit on the hovered/cursor tile with a green (fits) or red (blocked, red-tinted ghost) tile; bobbing star/coin icon on the tile for Upgrade/Recall; hints fade in/out.
- Scene: band y 56-84 = night-sky strip, picket fence, two-row hedge, sagging lantern string with 6 round lanterns + glows; plank edge under the grid; flickering ADD glows on the house window/lanterns and the alley lanterns (`SCENERY.*_GLOWS`, art-local px); fireflies over the alley and band. Menus: twinkling stars, fireflies, glows (title also moon glow + glows on its hanging lanterns). Results: stars pop with a big Back overshoot, sparkles and a tiny shake; confetti on a win; the unlock card pops with sparkles and a diagonal shine sweeps it every 2.4 s.
- Caps: every emitter has maxAliveParticles (FX.CAP_*); ghosts, lids, flying coins, afterimages and pops are fixed pools that recycle the oldest.

Gotchas:
- `Phaser.Math.Easing.Quadratic` (not `Quad`, which is only a tween ease string).
- Tint modes in Phaser 4 are a per-vertex value (no extra shader), but they stick: pooled sprites must reset `setTintMode(MULTIPLY)` (BattleScene.acquire and Effects do).
- The camera ColorMatrix filter on loss dies with the scene's cameras (CameraManager recreates them on restart); Effects.destroy also removes it.
- Camera shake moves the HUD too (one camera); keep intensities <= 0.01.
- `explode(n, x, y)` ignores the config's x/y ops but still applies the emitZone, so confetti uses a zone strip and `explode(n, 0, 0)`.
- Effects runs on frame dt (0 while the built-in pause is up; the PauseScene pause stops the whole scene); it never reads the wall clock, and all its randomness is Math.random in the view only (state JSON stays identical, pixels don't).
