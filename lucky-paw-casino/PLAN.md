# Lucky Paw Casino — build plan

A 2D casino collection with five games: Plinko, Blackjack, Craps, Roulette, and
Slots. The setting is an after-hours backroom casino behind the nail supply shop
(the look of `Booker Assets/03 Casino - Blackjack dealer/concept/table-scene.png`):
green felt, warm wood, brass lamps, polish shelves.

- **Booker is the house.** He deals, spins, calls the dice, and hosts Plinko. The
  existing casino art covers him: dealer (6 expressions), croupier (4), stickman
  (3), Plinko host (3), cashier cage, card back, and the golden slots paw.
- **Soba is the player's buddy.** Soba sits in the player seat in every game,
  reacts to wins and losses, shoots the dice in Craps, and gives strategy hints
  in Blackjack. Soba needs new art (image-gen).

Engine: Phaser 4.2.1 + Vite. Dev server: http://localhost:3004 (strictPort).
Infrastructure (test clock, browser launcher, audio engine, iterate client) is
copied from `../soba-tower`.

## 1. Player loop

1. The lobby shows the chip balance, the VIP tier, and five game cards. Pick a game.
2. Pick a chip (1, 5, 25, 100, 500), place bets, and play. Every game has
   keyboard shortcuts (Space = deal / spin / roll / drop) and works by touch.
3. Wins pay out with chip-stack animations, a rolling counter, and reactions
   from Booker and Soba. Big wins (10x or more) add a coin shower and a banner.
4. **Esc** or the **Lobby** button returns to the lobby. Bets in play finish first.
5. The game saves after every round (`localStorage`, every call in try/catch).

## 2. Economy and progression

| Item | Value |
|---|---|
| Starting chips | 1,000 |
| Bailout | If the balance is under 10 and no bet is live, Booker's cashier cage gives 500 chips (counted in stats) |
| Daily bonus | +250 chips once per calendar day, claimed from the lobby |
| XP | 1 XP per chip wagered |
| VIP tiers | Puppy (0), Good Boy (2,500), Top Dog (10,000), Big Bone (40,000), Golden Paw (150,000) |
| Tier rewards | One-time chip gift (250 / 1,000 / 4,000 / 15,000) and a higher table limit (max bet 100 / 250 / 500 / 1,000 / 2,500) |
| Stats | Per game: rounds, wagered, won, net, biggest win, best streak. Overall: hands, biggest win, bailouts, VIP progress |

## 3. Games (exact rules; logic is pure JS and node-tested)

| Game | Rules | Target RTP |
|---|---|---|
| Plinko | 12 rows, risk Low / Medium / High. The outcome is 12 fair left-right steps from the seeded RNG; the ball (a tennis ball) animates peg to peg. Multipliers per bin: Low 10,3,1.6,1.4,1.1,1,0.5,…; Med 33,11,4,2,1.1,0.6,0.3,…; High 170,24,8.1,2,0.7,0.2,0.2,… (mirrored). Up to 10 balls in flight; Auto ×10 | 98.98 / 98.99 / 99.12 % (exact) |
| Blackjack | 6 decks, reshuffle at 75 % penetration, dealer stands on soft 17, blackjack pays 3:2, double on any first two cards, double after split, split once, split aces get one card each, no insurance or surrender. Soba's **Hint** shows the basic-strategy move | ≈ 99.4 % (basic-strategy bot) |
| Craps | Pass, Don't Pass (bar 12), Pass Odds (true odds, up to 3x), Field (2 and 12 pay 2:1), Any 7 (4:1), Any Craps (7:1), Yo 11 (15:1). Puck shows ON/OFF and the point. Soba throws; the dice tumble and bounce off the back wall | Pass 98.59 % |
| Roulette | European single zero. Straight (35:1), red/black, odd/even, 1–18/19–36 (1:1), dozens and columns (2:1). Click the layout to place chips; Undo, Clear, Rebet. The result comes from the RNG, then the ball animation lands in that pocket. History strip of the last 12 numbers | 97.30 % |
| Slots | 5 reels × 3 rows, 10 fixed lines, bet = line bet × 10. Symbols: Golden Paw (wild), Booker, Soba, Bone, Tennis Ball, Hydrant, Dog Bowl, and a Bonus scatter. 3+ scatters give 8 free spins at 2x. Staggered reel stops, anticipation on 2 scatters, payline highlights | 95–97 % (exact line math + Monte Carlo) |

## 4. Art (image-gen, $10 hard cap, target under $3)

Style: match Booker's existing casino portraits (64 px pixel art, warm palette,
dark outline). Backgrounds are pixel art at 320×180, upscaled 4× with nearest
neighbour to 1280×720. Every call goes into `art/spend.md` with its `cost_usd`.

| Asset | Model | Estimate |
|---|---|---|
| Soba casino portrait hero, then 5 expressions (neutral, happy, sad, nervous, smug), 64 px and 256 px masters. References: Booker dealer art (style), Soba photos (likeness) | `gpt-image-2.5-sunburst`, transparent | $0.15 |
| Booker + Soba duo for the lobby | `gpt-image-2.5-sunburst`, transparent | $0.08 |
| "LUCKY PAW CASINO" logo | `gemini-3-pro-image`, 1K | $0.14–0.28 |
| 6 backgrounds: lobby + one per game, each with its own felt colour (Plinko violet, Blackjack green, Craps blue, Roulette burgundy, Slots gold) | `gpt-image-2`, low → medium | $0.40 |
| 5 game icons (one sheet) and 8 slot symbols (one sheet) | `gpt-image-2.5-sunburst`, transparent | $0.15 |

Code draws everything that needs exact geometry or crisp text: cards, chips,
dice, the roulette wheel and layout, Plinko pegs, buttons, and panels.

## 5. Architecture

```
src/core/      Constants, EventBus, GameState (wallet, stats, VIP), Save, Rng (seedable; ?seed=N), Assets, GameConfig
src/games/<g>/ logic.js (pure rules, no Phaser), config.js (tables, layout), <G>Scene.js
src/ui/        Button, ChipTray, BetSpot, TopBar, Panel, WinBanner, CharacterPortrait, MuteButton, RulesPanel
src/scenes/    Boot, Preload, Lobby, Stats
src/audio/     AudioManager + synth (from soba-tower), lounge music, casino SFX
scripts/       test/<g>.test.mjs, rtp-check.mjs, checks/<g>-check.mjs, casino-check.mjs, ui-shots.mjs, iterate-client.js, verify-runtime.mjs
art/           raw/, drafts/, out/, spend.md, scripts/build_assets.py
```

- Internal resolution 1280×720, Scale FIT, antialiased text. Pixel textures get
  the NEAREST filter one by one, so sprites stay crisp and text stays smooth.
- Each game scene uses the shared UI kit and the wallet API
  (`wallet.bet(n)`, `wallet.pay(n)`), so the balance can only change through
  one place, and the wallet log can prove chip conservation in tests.
- `render_game_to_text()` reports the scene, balance, VIP tier, and the active
  game's `snapshot()`.

## 6. Build order

1. **Scaffold (main thread + core subagent).** Project, test clock, wallet, save,
   RNG, UI kit, lobby, stats, audio engine, and five stub scenes.
   **Art subagent** runs in parallel and installs assets into `public/assets/`.
2. **Five game subagents in parallel.** Each owns `src/games/<g>/`, its node
   tests, and its browser check, and builds rules, scene, art, juice, and SFX in
   one pass.
3. **Polish pass.** Lobby and cross-game consistency, music, transitions.
4. **QA gate after each step.** Build, runtime, iterate client, logic tests,
   RTP check, per-game browser checks, screenshots.
5. Monetize: skipped (CLAUDE.md: only when the user asks).

## 7. Done means

- All five games play from lobby to payout and back, by mouse, touch, and keyboard.
- `node --test scripts/test/` passes; `rtp-check.mjs` lands every game in its band.
- `casino-check.mjs` plays 10+ rounds of each game in the browser with no console
  errors, and the wallet log balances (start − wagered + paid = end).
- Save survives a reload. Mute works (M key and button).
- Art spend under $10, logged in `art/spend.md`.
