# UI notes (menus, overlays, HUD)

All UI renders at 480x270 with a generated pixel font and pixel panels, so it stays crisp at every integer scale.

## Building blocks (`src/ui/`)

| File | What it does |
|---|---|
| `PixelFontData.js`, `PixelFont.js` | Caps-only pixel font, 7 px cap height. `text(scene, x, y, str, { scale, color, align, valign, maxWidth })` returns a BitmapText snapped to whole pixels. Font `px` has a baked outline and shadow, and tinting sets its color. Font `px-flat` has ink only. Call `setText()` or `relayout()` after you change the text. |
| `UiKit.js` | `panel`, `pixelRect`, `ring`, `brackets`, and `miniBar` draw with Graphics. `PixelButton` is a Container + Graphics + BitmapText with focus and press states. `bindMenuKeys` maps arrows/WASD, Space/Enter, and Esc/Backspace. `icon(scene, x, y, frame, 24/16/12)` draws ui-icons; the 16 px and 12 px versions are box-downscaled at runtime. `burst` makes confetti. `loadPref` and `savePref` read and write UI preferences. |
| `LevelCard.js` | One 148x100 card on the level select. |
| `Hud.js` | The top bar, the level-name label, and tip toasts. |
| `AbilityIntro.js` | The NEW ABILITY card. |
| `MuteButton.js` | The speaker toggle (unchanged). |
| `PauseButton.js` | The HUD pause button (two bars, left of mute). It's the only way to pause on a touch screen. |

Layout numbers live in `Constants.js` under `PIXEL_FONT`, `UI_COLORS`, `UI_KIT`, `TITLE_UI`, `SELECT_UI`, `GAMEOVER_UI`, `COMPLETE_UI`, `PAUSE_UI`, `INTRO_UI`, `TIPS_UI`, and `HUD_ABILITIES`.

## Screens and controls

| Screen | Content | Keys | Mouse and touch |
|---|---|---|---|
| Title | Title art with a blinking prompt. Once there's progress, it adds a line with total score, stars x/18, and levels cleared x/6. Has a mute button. | Space, Up, or Enter goes to the level select | Tap anywhere (the mute button excepted) |
| Level select | A 3x2 grid of cards with a sliding, pulsing focus frame. The header shows total score (sum of bests), stars, and levels cleared. The footer shows the skills collected (lit when unlocked), total bones, and tries. A locked card shows its unlock rule. A new card gets a NEW! tag. A cleared card shows a check, or a trophy with 3 stars. Level 6 shows the golden steak. | Arrows or WASD move, with wrap. Space or Enter plays. Esc or Backspace returns to the title. | Hover focuses and click plays. On touch, the first tap focuses and the second plays. |
| Ability intro | On attempt 1 of a level that adds an ability, when the run starts from the menus. Shows the icon, the name, and the hint from `Abilities.js`. The run waits (mode `intro`, physics paused). | Space, Up, Enter, or Esc dismisses it after 300 ms. It also dismisses itself after 2.4 s. The dismissing press never jumps. | Tap |
| HUD | Score, bones, the level's ability icons, a progress bar with a best-% tick and the finish icon, TRY n, pause, and mute. On attempt 1, the level name shows under the bar. Tips toast at `tip.x` on attempts 1–2 only. | P or Esc pauses (key repeat is ignored). The run also pauses when the tab is hidden or the window loses focus (after the ability card, if it's up; not in `?autoplay` runs). | Pause button, mute button. Neither tap jumps. |
| Game over | A card over the dimmed run. It shows OUCH!, BONK!, or a similar line (SO CLOSE! at 90% or more), the % reached with a mini bar and best tick, NEW BEST!, the attempt, and a tip for the cause. It stays up until the player chooses (only the `?autoplay=1` bot auto-retries, after 1.2 s). | Presses in the first 0.6 s are ignored, and the retry hint lights up when presses count. Then Space, Up, or Enter retries. Esc or Backspace goes to the level select. | After 0.6 s, a tap retries. The LEVELS button goes to the level select. |
| Level complete | Left panel: stars pop in one by one, a count-up tally (distance, bones x/y, finish, time vs par), the total, and FIRST CLEAR! or NEW BEST SCORE!. A NEW! tag marks more stars and a NEW BEST TIME tag marks a faster time. Right panel: the unlock reveal (next level and its new skill), or your bests. After Level 6, the full-screen golden-steak ending plays first. | Arrows or WASD move. Space or Enter presses; the first press skips the tally. Esc goes to Levels. | Tap a button |
| Pause | RESUME, RESTART LEVEL, LEVEL SELECT, and SOUND ON/OFF. | Up and Down move. Space or Enter presses. P or Esc resumes. R restarts. Q goes to the level select. M mutes. Key repeat is ignored. | Tap a button. A tap outside the panel (the HUD pause button included) resumes. |

Buttons: a `PixelButton` presses on release, and only if the press started on it (a finger or mouse button held from before never presses a button it is released over). On the Level 6 ending, a tap or press closes the ending (after 0.6 s) and the results buttons under it can't be pressed until it's gone. NEXT LEVEL is the default when the next level is open. After Level 6, LEVELS is the default. LEVELS on the results screen opens the level select and plays the unlock on the new card.

## EventBus events the UI emits

Existing events: `MENU_MOVE`, `MENU_SELECT` (action: `start`, `play`, `retry`, `auto-retry`, `next`, `replay`, `resume`, or `restart`), `MENU_BACK`, `MENU_LOCKED`, `AUDIO_TOGGLE_MUTE`.

New events:

| Event | Payload |
|---|---|
| `UI_TALLY_TICK` | `{ row, value, done }`, throttled to one per 50 ms per row |
| `UI_STAR_POP` | `{ index, earned }` |
| `UI_NEW_BEST` | `{ levelId, kind }`, where kind is `firstClear`, `score`, `stars`, or `time` |
| `UI_UNLOCK_REVEAL` | `{ levelId, ability, where }`, where `where` is `complete` or `select` |
| `UI_ENDING` | `{ totalScore, totalStars }` |
| `ABILITY_INTRO_SHOWN` | `{ levelId, ability }` |
| `ABILITY_INTRO_DONE` | `{ levelId, ability, by }`, where `by` is `press` or `auto` |
| `TIP_SHOWN` | `{ levelId, x, text }` |

`RunScene` still emits `LEVEL_UNLOCKED`, `GAME_OVER_SHOWN`, and `NEW_BEST_PROGRESS`. When the intro card is up, `LEVEL_START` is emitted after the card closes.

## Save fields used

From `SaveData.summary()`:
- Per level: `unlocked`, `completed`, `bestScore`, `bestStars`, `bestProgress`, `bestTimeS`, `attempts`, `clears`.
- Totals: `totalScore`, `totalStars`, `maxStars`, `levelsCleared`, `levelCount`, `abilitiesUnlocked`.

`SaveData.getLevel(id).bestBones` supplies the footer bone total. A level card shows NEW! when the level is unlocked, not completed, has 0 attempts, and is level 2 or later.

The results screen compares against `prev`, the level's save entry before this run, which `RunScene.complete()` passes in. A first clear shows FIRST CLEAR!. More stars than before shows NEW!. A time more than 0.05 s faster than `bestTimeS` shows NEW BEST TIME.

The UI's only storage key is `booker-run:ui:lastLevel`, the last focused card.

## Hooks outside `src/ui/`

- `RunScene`:
  - `hud.setTips(level.tips, attempts, startX)`.
  - The intro gate (`AbilityIntro.shouldShow`, mode `intro`, `LEVEL_START` sent after the card closes).
  - `prev` passed to `LevelCompleteScene`.
  - `ui` and `intro` added to `snapshot()`.
- `GameState`: `MODES.INTRO`.
- `main.js`: `render_game_to_text()` includes the run snapshot in mode `intro`. It also shows `menu` from `TitleScene`, `GameOverScene`, and `PauseScene`; each `snapshot()` reports its `screen`.

## Debug flags and checks

- `?intro=1` forces the ability card on attempt 1 of Levels 2–6. `?intro=0` turns it off.
- Debug starts (`?level`, `?x`, `?start`, and `?autoplay` without `?menus`) skip the card, so the bot checks never see it.
- `node scripts/ui-flow-check.mjs` takes about 25 s. It covers:
  - Navigation by keys and mouse, and locked refusals.
  - The clear, the tally and stars, and the unlock (results screen and level select).
  - The Next flow and the ability card (press dismiss and auto dismiss).
  - Tips on attempts 1–2.
  - The game over card stays up, early presses are ignored, a later press retries; 3 retries leave identical counts.
  - Every pause menu action.
  - Saves and totals across reloads, legacy migration, and the Level 6 ending.
- `node scripts/ui-shots.mjs [--only name,...]` saves every screen at 1x and 2x to `output/ui/`.
- `node scripts/touch-check.mjs` repeats the flows with real touch events (a `hasTouch` context and `page.touchscreen.tap`): title, the level select's focus-then-play taps, the ability card, a jump tap, the HUD mute and pause buttons, every pause action, the game over card, results (LEVELS, NEXT), a just-unlocked card mid-reveal, and the Level 6 ending.
- `node scripts/campaign-check.mjs` plays the whole campaign through the real menus on a fresh save (the bot plays each level, NEXT LEVEL each time, the ending), then checks 6/6 cleared and that the totals equal the per-level bests.
- `node scripts/save-check.mjs` covers two tabs, a stale tab, and save versions and backups.

## Per-visit state

Phaser reuses a scene object for every visit, and fields set in `create()` survive to the next visit. Every scene resets its per-visit fields at the top of `create()` (for example `LevelCompleteScene.sequenceDone` and `ending`, `LevelSelectScene.touchArmed`, `RunScene.resumedAt` and `abilityIntro`). Listeners added to `scene.events` also outlive a visit, so remove them on `shutdown` (as `JumpInput` and `AbilityIntro` do).
