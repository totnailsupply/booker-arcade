# Progress

Original prompt: Create a plan to build a **2D casino-style game collection** starring **Booker** and **Soba**, featuring **Plinko, Blackjack, Craps, Roulette, and Slots**. The game should feel polished, fun, and arcade-like, with each mode fully playable, easy to understand, and visually distinct while still fitting a cohesive overall style.

Design a clean **main menu / casino lobby** that lets players choose between games, track chips or currency, and view basic progression or stats. Prioritize satisfying feedback, intuitive UI, smooth animations, balanced game flow, and strong replayability. Booker and Soba should be used as the main character models and integrated into the game's presentation, branding, and visuals.

Use **`/image-gen`** to create the required character assets, UI elements, casino-themed environments, icons, and supporting visual assets. **Image generation is required** and should follow a strict **$10 total budget**.

First create a concise implementation plan, then build and test a fully playable version of the game collection.

Engine: 2d (Phaser 4.2.1, Vite), infrastructure copied from ../soba-tower and ../booker-run
Created: 2026-10-14
Dev server: http://localhost:3004 (`npm run dev`, strictPort)
Plan: PLAN.md (source of truth for rules and numbers)

## Pipeline Status

- [x] Step 1: Scaffold (core, wallet, UI kit, lobby, stats, stubs) — 2026-10-14
- [x] Step 1.5: Art (image-gen, parallel with Step 1): 26 assets, $0.3587 of $10 (16 calls, ledger art/spend.md). Rebuild: `python3 art/scripts/build_assets.py`
- [x] Step 2: Five games (parallel subagents; rules, scene, art, juice, SFX). Orchestrator re-ran combined gates: build, 94/94 tests, every RTP band, architecture 14/14
- [x] Step 3: Polish pass (shared-file fixes, portraits, bubbles, QA speed); music came with Step 1 (six lounge variants)
- [x] Step 4: Final QA (2026-10-14, orchestrator): build, 94/94 node tests, rtp-check all bands, validate-architecture 14/14, verify-runtime, full casino-check (kit, lobby, 5 games, conservation 1000 - 1070 + 2322 + 3584 = 5836, save/reload) PASS, ui-shots no console errors (reviewed lobby, stats, every game result, phone views), iterate-client 2 iterations
- [ ] Monetize: skipped (CLAUDE.md: only when the user asks)

## Decisions

- Booker art copied into public/assets/booker/ (dealer-* are the 256 px masters; croupier, stickman, plinko, cage, card back are the small game-files).
- QA scripts come from ../booker-run (they launch Chromium through scripts/lib/browser.mjs; the launchd reaper kills chromium.launch()).

- Art deviations: Soba portraits are a 128 grid x2 (64 was too mushy next to Booker's dealer art); duo-hero 780x512; sym-wild reuses booker/slots-paw.png; title-logo is smooth (pixel:false). Table bgs (blackjack/craps/roulette): wood rail at y~240-280, plain felt below. Plinko/slots bgs: centre half is a plain dark wall.

## Step 1 notes (core subagent)

What exists:
- core/: Constants (palette, fonts, LAYOUT, CHIPS, ECONOMY, VIP_TIERS, GAMES, AUDIO mix), EventBus (+ `listen(owner, ev, fn)`),
  Rng (sfc32; `rng.stream(id)` per game), Wallet (pure, node-tested), Save (`lucky-paw-casino:v1`), Casino (singletons),
  Assets (manifest + Booker files + NEAREST), Textures (chips, mini chips, particles, placeholders), Nav (goto/fadeIn/jump), GameConfig, GLGuard.
- ui/: Button, ChipTray, BetSpot, TopBar (+ BalancePill, VipBadge), RulesPanel, WinBanner, CharacterPortrait, FloatText/Toast, MuteButton, theme, index.js barrel.
- games/BaseGameScene.js (header comment = how to subclass) + five stub scenes.
- scenes/: Boot, Preload, Lobby (3x2 grid: five games + cashier card), Stats (overlay over the paused lobby).
- audio/: sfx.js (22 voices), music.js (lounge combo, 6 tracks), AudioBridge (gesture unlock, M/mute persisted, MUSIC_PLAY).
- scripts/: casino-check.mjs (+ checks/lobby-check.mjs, checks/kit-check.mjs), ui-shots.mjs, validate-architecture.mjs,
  test/{wallet,rng}.test.mjs (+ test/package.json + all-tests.mjs so `node --test scripts/test/` works on Node 22), example-actions.json.

- Font (orchestrator, after Step 1): Tiny5 for all UI text and numbers, Silkscreen Bold via text(..., { display: true }) for big titles. Pixelify Sans closed its "c" ("Blaokjaok", "Oraps") and Jersey 10 is gone too. Tiny5 has one weight: text() never synthesises bold.

- Orchestrator added `minBet` to GAMES (Plinko 10, Slots 10; lobby card shows it) and `scripts/rtp-check.mjs` (runs scripts/rtp/<game>.rtp.mjs, `--only`).
- Step 2: five game subagents run in parallel; each owns src/games/<g>/, scripts/test/<g>.test.mjs, scripts/rtp/<g>.rtp.mjs, scripts/checks/<g>-check.mjs, output/<g>/. Shared files are off limits to them; they report needed shared changes.

- Plinko done (agent): 94/94 tests at the time, exact RTP 98.98/98.99/99.12 %, plinko-check PASS. Multipliers stored in tenths so payouts are exact integers. Booker portrait moved to (872,158) beside the chute.
- Orchestrator set `server.hmr: false` in vite.config.js (11:27): HMR full reloads killed agents' browser checks whenever another agent saved a file.

- Craps done (agent): exact RTP Pass 98.586 %, Don't Pass 98.636 % (pushes return the stake), Field 94.444 %, Any 7 83.333 %, Any Craps / Yo 88.889 %, Odds 100 %. A roll that resolves bets settles exactly those bets (one wallet round); no-action rolls are not rounds. Odds round to whole-chip multiples (5/9 in 2s, 6/8 in 5s).
- Blackjack done (agent): 6D S17 peek DAS, split once on equal VALUE (K-10 splits), split aces one card, 3:2 rounded down to whole chips (5 -> 12), RTP 99.55 % over 2M simulated rounds. Card ranks use custom 5x7 glyphs.
- Font, second change (orchestrator, during Step 2): Jersey 10 everywhere via text(), size x FONT.SCALE (1.3); Silkscreen for display. Tiny5 drew 8 like "$" (balance 874 read "$74", "roll an $ before a 7"). Canvas code that sets ctx.font must multiply by FONT.SCALE (Textures.js does).
- Roulette done (agent): European wheel, 49 bets, max bet caps the TOTAL per spin, every bet type RTP 36/37 exact. Own Board.js (49 zones, cloth baked into one texture) instead of 49 BetSpots. Undo reverts whole actions (incl. Rebet/Double).
- Slots done (agent): 5x3, 10 lines, 34-stop strips, exact full-game RTP 96.20 % (MC 96.15 % over 8M), hit rate 30.4 %, bonus 1 in 167, 8 free spins x2 (retrigger, cap 50). A bonus round stays open through its free spins and books once (wagered = the real stake). Reels clip with setCrop (no masks).

## Core notes (money model, save)

- Money model: chips leave the balance when placed (`wallet.bet`), `pay(n)` credits the TOTAL return (stake included), `settleRound` only books. `BaseGameScene.settle(wagered, paid)` does pay + book + reactions + banner. BetSpot.win/lose/push are visual only.
- maxBet (VIP table limit) is enforced by the UI (BetSpot/ChipTray via `wallet.whyNot`), not by `wallet.bet`, so a blackjack double can exceed it.
- XP is granted at bet time and taken back on refund; the VIP tier never drops (tierReached is monotonic) and gifts are one-time.
- Font: Jersey 10 for all UI text and numbers (see Decisions); `num: true` routes to the same face.
- Chips still in play when a game scene shuts down are refunded with a console.warn (same as a reload). A forced `__CASINO__.goto()` therefore never loses chips.
- ?fresh=1 ignores the old save AND overwrites it at boot, so a later reload without the flag continues the fresh session (casino-check relies on this).

## Step 3 notes (polish pass)

- Every Booker host portrait (croupier, stickman, Plinko host) uses the 256 px dealer masters; the lobby cashier card shows the dealer portrait in a teller window. Stickman and Plinko host root for the player (player win -> dealer-excited); the croupier winces.
- WinBanner: `title` option (Blackjack natural shows "BLACKJACK!" via settle's `bannerTitle`); its dim layer stops taking input as soon as hide() starts.
- BetSpot `pillSide` (above/right/left/below); Craps uses it. BaseGameScene `leaveRefusal()` supplies the refusal toast (Plinko, Craps, Blackjack override it).
- TopBar +/- float sits inside the top bar, left of the balance pill.
- Blackjack: leaving is allowed once a round has settled; rules state 3:2 rounds down on odd bets.
- Plinko: bet panel chip is the largest chip that fits the bet; floats in one bin merge within 650 ms.
- Speech bubbles: CharacterPortrait `'below'` side and `bubbleWidth`; Craps, Slots and Roulette bubbles no longer cover table labels.
- Wallet `summary()` totals only GAME_IDS (the Kit sandbox no longer counts).
- QA speed: headless Chromium's software WebGL made each advanceTime round trip cost 60-160 ms. scripts/lib/browser.mjs now launches with GPU flags (`QA_SOFTWARE_GL=1` restores software GL). Game checks dropped from 2-4 min to 15-30 s each.
- scripts/example-actions.json: lobby -> Slots (5) -> 3 spins -> Esc. ui-shots.mjs adds forced result shots, lobby-after, stats-after, bailout and claimed states.

## TODOs

- Blackjack: a doubled hand's sideways card partly covers the first two cards (corner ranks stay visible).
- Art: sym-booker / sym-soba are a little muddy at 32 px; duo-hero crops Soba's paw at the right edge.
- Craps: Soba shows the sad face when a field bet loses on the roll that sets the point, while her bubble cheers the point.

## Gotchas

- `node --test scripts/test/` with a directory fails on Node 22 (it tries to require the folder). scripts/test/package.json "main" points at all-tests.mjs, which imports every *.test.mjs.
- BetSpot's bet method is `bet(n)`, not `add(n)`: Container.add() is Phaser's add-child.
- Scene `this.events.on(...)` listeners survive scene restarts (Systems events persist); pair with off on 'shutdown' or use once. `listen()` handles EventBus subscriptions.
- Esc ordering: RulesPanel/confirm closeModal() is deferred a microtask so the Esc that closes a modal can't also trigger the Lobby button's Esc in the same keyboard dispatch.
- Phaser 4: `Texture#setFilter(Phaser.Textures.FilterMode.NEAREST)` per texture; no `setTintFill` (use setTint + setTintMode). Particles: `this.add.particles(x, y, key, cfg)` returns the emitter (explode(n), stop()).
- Containers: interactive children are Zones (origin 0.5, default hit rect) — avoids the Container hit-area/displayOrigin quirk.
