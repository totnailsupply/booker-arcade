# Level 2: The Docks

Harbor at dusk. New ability: **double jump** (press again in the air). Data: `src/levels/level2.js`.

Length: 16,500 px to the steak, about 82 s of game time (default par 81.8 s). 77 bones.

## Section map

| # | Name | x | Speed | Contents |
|---|---|---|---|---|
| 1 | Dock Edge | 0–3000 | 160 | Bollard, a 56 px puddle, and tires, all single jumps. Then the first water gap a single jump can't clear (150 px), with a bone arc that traces a jump plus a double at the apex. A bollard, a second double gap (165 px) with a higher top bone, and single tires. |
| 2 | Container Yard | 3000–6900 | 185 | First crab. A stepping-stone container (y 24) over a 280 px gap. Tires. Container stairs over water (y 32 → y 64), then a double-jump leap of 200 px down to the dock. The first tall tire stack (two tires). A crab, a 110 px gap, and a bollard. |
| 3 | Crane Line | 6900–11300 | 210 | Tires, a 185 px double gap, a crab, then the set piece. A crab, a tire stack, and a 100 px gap. |
| 4 | Last Ship | 11300–16500 | 240 | A 200 px double gap. Two stacked containers over a 420 px gap (the upper one is an optional bone route). A crab, tires, a 130 px gap, a tire stack, and a 230 px double gap. Pier planks for a rhythm change (gap, bollard, gap: tap, tap, tap). A crab, a final 220 px double gap, and a flat run-out to the steak. |

## Signature moment: the Crane Line

At 8300–10200 (210 px/s), 1,900 px of open water, about 9 s, crossed on six hanging containers. The rhythm is hop, hop, fly, fly, hop, fly, hop. Booker hops up from a low barge (y 16) to y 48, double-jumps 206 px to y 56, then double-jumps 196 px down to y 24. Next he hops up to y 64, double-jumps 206 px to y 40, and hops to the dock. Every double jump has a "crane hook" bone near the top of its arc. Only a double at the apex reaches the highest ones, so they're the risk/reward line.

## Tips

| x | Text |
|---|---|
| 1250 | Tap again in the air to double jump! |
| 2150 | Double jump at the top of a jump to fly highest. |
| 3550 | Containers are safe to land on. |
| 5550 | Tall tire stack: double jump right at the top! |

## Design rules

- Gaps that need a double jump are wider than a full jump can clear, and they leave 20+ px under the double-at-apex reach.
- Double-jump launch surfaces are 64 px high or lower. The HUD ceiling (feet at about 190 px) would clip a double from higher up.
- Anything that needs a held jump starts 200+ px after the previous landing surface begins.
- Container steps rise 32–48 px. A full jump (68.7 px) leaves 20+ px of margin.
- Crabs never cross a pit while on screen. They arrive from off-screen with about 1 s of warning.
- Tall tire stacks are the tightest element. The bone trail starts early to show the forgiving line: take off about 0.6 s before the stack and double at the apex.

## Bones

There are 77 bones, placed where both a late double (the bot's style) and a double at the apex (a human's style) pass. The bot collects 71. It misses:

- 5500/178, 8845/168: top bones that need a double at the apex.
- 13760, 13820, 13880: the Section 4 tire-stack trail. At 240 px/s the bot clears the stack with a late single jump.
- 14840/52: the pier bollard. The bot double-jumps over the gap and the bollard together.

**All 77 bones in one run is verified.** A temporary `botPlan` played the level human-style: jump, then double at the apex at every double, and tap through the pier planks. It took a full jump from the lower container to the upper one. The browser check scored 3205 with 77/77 bones, 3 stars and 0 deaths. Offline, the same route passes 10/10 with ±60 ms jitter.

## Check results

| Check | Result |
|---|---|
| `autoplay-check --level 2` | Finish, 0 deaths, score 3145, 71/77 bones, 81.9 s |
| `--jitter 60 --seeds 5` | 5/5 (scores 3135–3145) |
| `--jitter 35 --seeds 5` | 5/5 (scores 3165–3185) |
| `level-shots --level 2` (and `--debug`) | Hazards, water, containers and bones all read clearly. Hitboxes match the art. |

Human timing windows (frames at 60 fps, brute-forced with the game's own simulator):

| Element | Window |
|---|---|
| Single hazards | 12–28 frames |
| Double gaps: take-off | 25–33 frames |
| Double gaps: second press | 19–26 frames |
| Tire stacks, early take-off | 10–13 frames for the double |
| Level 1 pallets (reference) | 6–12 frames |

## botPlan

None. The planner handles every spot with 0 fallbacks.
