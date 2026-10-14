# Level 6: Steakhouse Row

Late-night steakhouse row: cobblestones, ember pits, neon sign ledges, steel kitchen walls. The finale. New ability: **zoomies dash** (press in the air after the double jump is spent). Booker has every ability: double jump, ear glide, wall kick, pounce, dash. Data: `src/levels/level6.js`.

Length: 22,200 px to the Golden Steak, about 90 s of game time (default par 92.0 s; the bot takes 90.2 s). 88 bones.

## Section map

| # | Name | x | Speed | Contents |
|---|---|---|---|---|
| 1 | Back Alley | 0–4100 | 195 | A trash can. The first box stack (2 high, 92 px) with a bone trail up and through it: a double jump or a dash both work. A gate (jump it or smash it). A grill. The first 3-high stack (138 px): taller than a double jump, so only a dash gets through. The mega gap (260 px) with a 3-stack on its far ledge: jump, double, then dash across and through. A 110 px gap. |
| 2 | Kitchen Door | 4100–8800 | 225 | A gap with a grill on its landing edge (glide past it). A 3-stack at the edge of a 420 px ember pit with two drones over it: dash through, then bounce off a drone. A steel wall (one wall kick) with a 288 px top, then glide off it over a 320 px pit. A neon ledge in the middle of a 360 px pit with a grill on its near end (land past it). A patrolling vacuum right before a 3-stack: pounce, double, dash. Grill, trash can, grill. |
| 3 | Grill Line | 8800–15200 | 250 | Trash can, gate, grill (double-jump rhythm). A 650 px ember pit with two updrafts: ride them toward the ceiling. A drone chain over a 560 px pit. Two neon ledges over a 660 px pit, each with a grill on its near end. Stair-step walls (80 then 152): climb, then dash through a gate on the top (the ceiling stops a jump over it) and glide over a 340 px pit. The box tunnel: stack, parked vacuum, stack, parked vacuum, stack (smash, bounce, double, smash, bounce, double, smash). Trash can. |
| 4 | Golden Mile | 15200–22200 | 280 | Grill, patrolling vacuum, 3-stack. Drones over a 520 px pit. A gate, a trash can. Then the grand finale gauntlet and a 1,300 px victory lap. |

## Signature moments

**The first dash (S1, 760–3400).** The tip shows at 760; the 2-stack at 1300 forgives a double jump. The tip at 2200 sets up the 3-stack at 2550, the first stack only a dash clears. The tip at 2850 sets up the mega gap at 3100. Glide out-reaches a dash on a plain gap, so the gap has a 3-stack on its far ledge: a glider arrives too low and only a dash gets in.

**The box tunnel (S3, 13800–14760).** Three 3-stacks 480 px apart with a parked vacuum between each pair. The intended rhythm is tap-tap-tap, bounce, tap-tap, bounce, tap-tap: each pounce refreshes the double and the dash. There's ground everywhere, so a player who lands can start over with jump, double, dash.

**The grand finale (S4, 18050–21000).** Every ability in order:

1. **Jump** a trash can (18050).
2. **Double jump** a 240 px gap with a grill on its landing edge (18350).
3. **Glide** into the updraft over a 640 px ember pit (18900). The updraft stops at 100 px, so a glider can't top the wall.
4. **Wall kick** up the 140 px steel wall (19540). Its 448 px top is a breather.
5. **Dash** through the gate on the wall top (19960). The ceiling keeps feet under 190 px and the gate reaches 194, so only a dash gets through.
6. **Pounce.** A shelf of three drones (y 64) sits under every fall line from the gate dash. Gliders pass far above and can drop onto it by choice.
7. **Double + dash** through the last 3-stack (20800).

Then comes a victory lap: a bone arch to jump for, a bone row, and the glowing Golden Steak at 22200.

## Tips

| x | Text |
|---|---|
| 760 | Double jump, then tap again to DASH! |
| 2200 | Too tall? DASH right through it! |
| 2850 | Jump, double jump, DASH across! |

## Design rules

- The dash is made necessary with breakables, not distance: glide reaches farther on every plain gap. A 3-stack (138 px) is taller than a double jump (121.6 px). A gate on a wall top of 140 px or more sits under the soft ceiling.
- Use only 3-stacks. A dash smashes only the boxes it touches; 3-stacks leave the lower boxes standing with nothing floating.
- Each combo between two safe landings is 3 presses or fewer (the planner's depth). Wall tops are long enough to land on before the next beat.
- Drones never sit on a glide line: a glider who is a few px low would hit one from the side.

## Bones

There are 88 bones (S1 18, S2 18, S3 21, S4 31), placed from the bot's measured flight paths: lines through stacks at dash height, bounce arcs over drones, ceiling bones on the gate dashes, and updraft-ride bones near the ceiling. The bot collects 85. It misses only the victory-lap arc at 21270–21330 (h 66–80), which needs a voluntary jump on the flat run-out. A full jump pressed anywhere from x 21150 to 21190 collects all three, so all 88 can be collected in one run (3 stars).

## Check results

| Check | Result |
|---|---|
| `autoplay-check --level 6` | Finish, 0 deaths. Score 3855, 85/88 bones, 90.2 s (par 92.0 s). 74 presses, 0 scripted, 1 planner fallback (on the finale wall top, recovers at once). |
| `--jitter 35 --seeds 5` | 5/5, 0 deaths. Scores 3775–3835, 77–83 bones. |
| `level-shots --level 6` (and `--debug`) | Readable with the real art. Stacks and gates read as smashable wood and cardboard, grills read as deadly fire, and the wall-top gate shows against the sky. Hitboxes match the sprites. |

Human press windows were measured headless with the game's own simulator, choosing the best earlier presses (Level 1's pallets: 6–12 frames; Level 2's double gaps: 25–33):

| Piece | Windows (frames) |
|---|---|
| S1 ground 3-stack (jump, double, dash) | 35, 15, 11 |
| S1 mega gap (jump, double, dash) | 42, 17, 29 |
| S2 drone pit dash (any glide hold) | 23 |
| S2 vacuum + stack (jump, double, dash) | 38, 29, 31 |
| S3 rooftop gate dash | 16 |
| S4 3-stack (jump, double, dash) | 38, 19, 10 |
| Finale gate dash | 19 with a held jump, 24 with a tapped jump |

Visibility: every press's threat is on screen 0.6 s or more before the press. The exceptions are wide pits whose far edge appears mid-flight (the updraft, drone and ledge pits). For each of those, the aid (updraft, drones, ledges) is visible well before takeoff, and the far side shows at least 1.3 s before the landing.

Difficulty: Section 1 (195 px/s, single beats with long run-ups and more than one way through) is easier than Level 5's last section (260 px/s, a triple vacuum pounce chain and drones over an 880 px pit). Sections 2–4 combine every ability at up to 280 px/s.

## botPlan

None. The planner handles the whole level, mostly because each combo is capped at 3 presses and wall tops are wide enough to settle on.
