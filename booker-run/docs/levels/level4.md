# Level 4: The Factory

Factory interior at night. New ability: **wall kick** (touch a wall face in the air to cling, then press to kick up). Booker also has the double jump and the ear glide. Data: `src/levels/level4.js`.

Length: 16,500 px to the steak, about 85.5 s of game time for the bot. `parSeconds` is 88, because walls stall Booker and people climb a little slower than the bot. 16 walls, 73 bones.

## Section map

| # | Name | x | Speed | Contents |
|---|---|---|---|---|
| 1 | Loading Bay | 0–3400 | 175 | A crate. **Wall A** (84 px): a double jump clears it, or Booker clings and kicks, so nothing is forced. **Wall B** (140 px): too tall for a double jump, with a bone trail up its face. A 64 px lava pit, a crate, then a short two-step climb, **C1** (90 px) to **C2** (165 px). A 140 px double-jump pit. |
| 2 | Catwalks | 3400–7600 | 200 | A crate. **Wall D** (130 px) leads onto a yellow catwalk over lava, with a gear to hop. The first ground steam vent fires as Booker arrives (jump it). **Wall E** (120 px) has steam at its lip: cling, wait, climb. A stepping catwalk over a 288 px pit, and a crate. **Wall F** (160 px). **Wall G** (100 px) with a catwalk overhead (the high road and its bones) above a 352 px lava pit (the low road is a glide under it). A 190 px double-jump pit. |
| 3 | Boiler Room | 7600–11500 | 225 | Staircase catwalks over 416 px of lava. **The Boiler Tower**, then **the Furnace** glide (see below). **Wall H** (150 px) with a spinning saw gear at its foot: take off early and cling above the saw. **Lava pillars** (80 and 120 px) standing in a 448 px pit: kick up each pillar's face, or double-jump onto its top. A crate. |
| 4 | Furnace | 11500–16600 | 250 | **Wall I** (120 px) leads onto a catwalk with a gear, then a glide (or a jump and double) off its end over lava. A **steam trio** on the ground fires on, off, on as Booker passes (jump the first and last). **Wall J** (110 px) has lip steam. A crate, then a 220 px double-jump pit. **Wall K** (170 px) is the last climb, with lip steam, then the **final glide** over 416 px of lava and a short run-out to the steak. |

Section 1 is gentler than Level 3's last section (250 px/s, the 1,600 px Moon Bridge, pigeon flocks). From Section 2 on, Level 4 adds steam timing, climbs and lava pillars on top of every Level 3 skill, so it's harder overall.

## Signature moment: the Boiler Tower and the Furnace

At 8704–9600 (225 px/s), there's a two-step boiler. Step 1 is 90 px and step 2 is 170 px, the tallest wall in the game. Each step has a steam vent on its top edge, and the two fire in turn like a pump: lip 1 fires, stops, then lip 2 fires. Booker reaches step 1 while lip 1 is firing. He clings and waits, then climbs as it stops. He crosses step 1 and reaches step 2 while lip 2 is firing. He clings just under the edge, then tops out as it stops. From the top of the tower, the Furnace (576 px of lava) drops away. A tip says "Climb the boiler, then hold to glide!" Holding glides him 700+ px down a line of four bones to the far side.

## Steam rules

- A vent's clock starts when Booker is 480 px away. If no wall stalls him in those 480 px, he always meets the vent at the same phase.
- **Ground vents** (the first vent at 4700, the trio at 13450–13850) use that fixed phase. Each one is set to fire squarely on Booker (jump it) or to stay squarely off, 250–380 ms from either edge. A full jump clears each column (40–44 px) by 24+ px.
- **Lip vents** (walls E, J and K, and both boiler steps) sit on a wall's top edge. Each is already firing when Booker first touches the face, so the natural move is cling, wait, then climb. Warning puffs start 450 ms before each burst. Off windows are 1.0–1.2 s, against the 0.15–0.25 s it takes to cross a column. Clinging slides at 45 px/s, so a player can wait 2+ s on any lip wall.

## Tips

| x | Text |
|---|---|
| 640 | Hit a wall in the air, then tap to wall kick! |
| 1220 | Keep tapping to climb tall walls! |
| 4760 | Steam on top? Cling to the wall and wait! |
| 8450 | Climb the boiler, then hold to glide! |

## Design rules

- Measured with the game's controller code: a kick from a sliding cling gains about 55 px (not the analytic 64), the cling slides at 45 px/s, and the soft ceiling caps Booker's feet at about 190 px.
- Gears sit only on tops of 130 px or lower. Hopping from higher would clip on the ceiling.
- Every wall has a flat run-in. A crate or vent is at least 300 px before a wall face, and nothing needs a press within 1 s after topping out a two-kick climb. The bot plans at most 3 presses ahead, and players need that breathing room too.
- Walls and catwalks sit on the 32 px tile grid, so the art shows no partial tile at a wall's left edge.
- The longest stall is about 1 s for the bot (boiler step 2) and stays under 2 s for a player who waits out one steam burst.

## Bones

73 bones: 18, 17, 16 and 22 by section. They sit up wall faces, along catwalks, over vents that fire, and on the glide lines. The bot collects 53–59, depending on jitter. The rest are on lines the bot doesn't happen to fly:

- Tops of the short steps (C1 and boiler step 1) and pillar 1. The bot kicks straight past them to the next face.
- Arcs over crates and the catwalk gears. The bot clears them with a low hop.
- The high-road catwalk G. The bot glides under it.
- The Furnace, catwalk I and final-glide lines. These follow a walk-off glide or a jump-and-glide. The bot double-jumps first and flies about 35 px higher.
- The 220 px double-jump pit arc.

**All 73 bones in one run is verified.** A goal-seeking copy of the planner played the whole level with the game's frame-exact simulator (BotSim). Its simulator treated passing any uncollected bone as a death. It finished with 73/73 bones and 0 deaths (87.3 s), which gives 3 stars. Each bone the bot misses was also checked on its own, starting from the bot's own run (20/20 reachable).

## Check results

All checks ran in the browser on the final engine (`BotPilot.js`, 06:10), deterministic mode.

| Check | Result |
|---|---|
| `autoplay-check --level 4` | Finish, 0 deaths, score 2975, 53/73 bones, 84.6 s (par 88, full time bonus) |
| `--jitter 45 --seeds 5` | 5/5, 0 deaths (scores 2985–2995, 54–55 bones). Seeds 6–10 also 5/5 (2985–3035, 54–59 bones). |
| `--jitter 35 --seeds 5` | 5/5, 0 deaths (scores 2985–2995, 54–55 bones) |
| `level-shots --level 4` (and `--debug`) | Steel walls read as climbable and catwalks as standable. Lava, gears and steam read as deadly. Hitboxes match the art. |
| All bones in one run | 73/73, 0 deaths (goal-seeking planner, frame-exact simulator) |

The longest stall is about 1.05 s (boiler step 2).

Human timing windows, in frames at 60 fps, brute-forced with the game's own simulator. "Single" means one press does it. "With follow-ups" means up to two more presses, such as a double jump or more kicks. A "+" means the scan started inside the window, so the real window is wider.

| Element | Window |
|---|---|
| Crate at 560 | 37 single, 69 with follow-ups |
| Wall A (84 px) | 121+ |
| 140 px double pit | 78 single (a held glide also works) |
| First steam vent (fires on arrival) | 32 single jump |
| Catwalk D gear hop | 34+ |
| Wall E lip: kick after the steam stops | 86, plus 13 for a quick climb just as it stops |
| 190 px double pit | 32 single, 81 with a double |
| Boiler step 1 lip | 50 as the steam stops (another 48 one cycle later) |
| Boiler step 2 lip | 92 |
| Wall H, saw at the foot | 42+ |
| Lava pillars | 47+ |
| Catwalk I gear hop | 28+ |
| Steam trio, vents 1 and 3 | 33 single jump each |
| Wall J lip | 145 |
| Crate at 14700 | 23 single, 45 with follow-ups |
| 220 px double pit | 25 single, 72 with a double |
| Wall K lip, then the final glide | 36 (hold the last kick to glide) |

For comparison, Level 1's pallets allow 6–12 frames, and Level 2's double gaps allow 25–33.

## botPlan

None. The planner handles every spot. While building the level, two planner bugs showed up. The engine owner fixed both in `BotPilot.js`.

1. While clinging, if doing nothing led to a gear or a pit instead of the wall stuck rule, the planner anchored its kick at the death. It kicked once, slid back, and looped forever. This showed on wall H (saw at the foot) and the lava pillars.
2. `run()` treated reaching the search horizon as safe even when Booker was pinned against a wall face. On a 170 px wall, one low kick outlasted the 5 s horizon, so the bot looped on wall K.
