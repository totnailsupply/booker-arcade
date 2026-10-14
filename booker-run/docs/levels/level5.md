# Level 5: Night Market

Neon street market at night. New ability: **pounce**. Land on a robot from above to pop it and bounce. The bounce is 77 px if the button is held when Booker lands, or 41 px if not, and it refreshes the double jump. Booker also has double jump, glide and wall kick. Data: `src/levels/level5.js`.

Length: 19,300 px to the steak, about 88 s of game time (par 88 s; section lengths over speeds give 86.8 s, plus hit-stops and wall clings). 75 bones, 39 robots (20 vacuums, 19 drones). No `botPlan`.

## Section map

| # | Name | x | Speed | Contents |
|---|---|---|---|---|
| 1 | Stalls | 0–4300 | 185 | Teaches the pounce. **A:** a lone vacuum (820). Hop it, or land on it; a bone arrow points down at it and two bones sit on the bounce. **B:** a vacuum on the lip of a 48 px manhole (1480). The bounce carries Booker over the manhole. **C:** a drone (y 40) over a 160 px manhole (2275). Glide onto it for the big bounce and high bones. Then an awning with a vacuum under it, the first patrolling vacuum, a low drone that blocks the street (y 22), and a manhole with a vacuum just past it. Hydrants and a cart are familiar single jumps. |
| 2 | Crowds | 4300–9000 | 210 | A patrolling vacuum between two carts, and an awning over a manhole with a vacuum patrolling on top. **First must-pounce:** a 640 px manhole (double jump plus glide reaches 612) with two drone stepping stones. Then a low drone that bounces Booker up a shutter (wall kick works too). A patroller, a vacuum on a manhole lip, a three-vacuum train (spaced 90 px, so the tapped bounces chain by themselves), and a drone over a 200 px manhole. |
| 3 | Lantern Ladder | 9000–14100 | 235 | Hydrant, patroller, cart. Then the set piece (below). Back on the street: a drone hovering over a cart (stomp it, or clear both), a low drone, a manhole with a vacuum just past it, and a **patrolling drone** over a 200 px manhole. |
| 4 | Neon Rush | 14100–19300 | 260 | A three-vacuum train (spaced 112 px) whose last bounce carries Booker over a 90 px manhole. A low drone, then a shutter (h 100) with bones on top. **Must-pounce:** an 880 px manhole with two drones (double jump plus glide reaches 758). An awning with a vacuum patrolling on top, a drone over a cart, then drone stairs down (y 80 → 50) over a 500 px manhole. A hydrant, a patroller and a cart, then a flat run-out to the steak. |

## Signature moment: the Lantern Ladder

At 10350–11610 (235 px/s), a 1,260 px open sewer that only pounces can cross. Four drones climb into the night sky (y 50 → 75 → 100 → 115, about 320 px apart). They sit on the "keep holding" line. Jump at the sewer edge and hold the button the whole way: Booker glides onto each drone and gets the big bounce every time. The bounce off the fourth reaches the HUD ceiling, and Booker glides onto a row of high awnings (y 150 → 100 → 52) over the market. The awnings step down to the street. One held press, about 10 s long, collects all 12 bones (one at each bounce apex, plus every awning row).

- A held jump taken anywhere from x 10290 to 10370 works (sewer edge 10350): about 20 frames, which covers a natural jump at the edge. Drone 1 is on screen 0.7–1.1 s before that.
- Recovery lines exist. Release to drop onto a drone you're passing over. A pounce refreshes the double jump, so you can press again to climb back onto the line.
- The street resumes at 11610, under the awnings. A player who drops off after drone 3 or 4 lands safely among a hydrant and a patrolling vacuum, and only misses the high bones.

## Tips

| x | Text |
|---|---|
| 560 | Land on robots to pounce! Hold to bounce higher. |
| 1950 | Drones too! A pounce gives back your double jump. |
| 5560 | Too far to glide? Bounce off the drones! |
| 9950 | Keep holding to chain pounces up the drones! |

## Design rules

- A big (held) bounce comes from being held at the moment of the stomp, which in practice means gliding into the robot. Every chain and ladder is laid out on that line, so "hold" is always the safe answer.
- Must-pounce gaps are wider than the double jump plus glide reach at their speed (612 @210, 685 @235, 758 @260). Elsewhere a pounce is the obvious line but not the only one.
- Drone heights: y 22 always blocks the street (its hitbox reaches Booker's head even at the top of its bob). y ≥ 34 always lets him run underneath. Nothing sits in the ambiguous y 24–32 band.
- Vacuum trains are spaced a little under the tapped-bounce reach (86 / 98 / 109 / 121 px at 185 / 210 / 235 / 260), so each bounce drifts later into the next robot's stomp window.
- Patrolling robots meet Booker 100–200 px out with 0.8+ s on screen. The patroller after the shutter stays within 7620–7700 whatever the wall-cling time.
- No awning is directly above a cart (they share the stripes). Drones hover over two carts on purpose, as blockers.

## Bones

There are 75 bones (S1 19, S2 16, S3 20, S4 20). Risk/reward lines: the ladder and high awnings (12), the drone-bounce apexes of both chains, and the high bounces off drones C and 8790.

The bot collects 51/75. It survives with late, low jumps, so it misses the bones that need a pounce: the vacuum-A arrow, drone C's high bounce, the chain apexes, the ladder's upper rungs and the high awnings (it drops to the street after drone 3), and some awning rows.

**All 75 bones in one run is verified.** A search with the game's own simulator built one continuous human-style route (37 presses, mostly "glide into the robot" holds plus one 10.8 s hold up the ladder). Each bone had to overlap by 2+ px, inside the part of its hitbox common to every bob phase. A temporary `botPlan` played that route in the browser and scored 3465 with 75/75 bones, 3 stars, 0 deaths, attempt 1, 88.0 s. The plan was removed afterwards.

## Check results

| Check | Result |
|---|---|
| `autoplay-check --level 5` | Finish, 0 deaths, score 3225, 51/75 bones (2 stars), 87.9 s vs par 88 |
| `--jitter 40 --seeds 5` | 5/5 (scores 3225–3245) |
| `--jitter 35 --seeds 5` | 5/5 (scores 3225–3245) |
| `--query start=section2/3/4` | All finish with 0 deaths |
| Offline (BotSim harness) | 10/10 at ±40 ms and ±35 ms |
| `level-shots --level 5` (and `--debug`) | Vacuums pop (white on dark). Manholes read as dark pits. The ladder reads well against the sky. Hitboxes match the art. |

Human timing windows (frames at 60 fps, brute-forced from the bot's states; one ground press with any hold up to 130 frames, optionally plus one air press):

| Element | Window |
|---|---|
| Section 1, every beat | 41–46 |
| S2 awning with a patroller on top | 17 (one press), 36 (with an air press) |
| S2 640 px drone chain | 23 |
| Lantern Ladder takeoff (pure hold line) | 20 |
| S3 drone over cart → low drone → manhole | 30 |
| S4 vacuum train, shutter | 24–41 |
| S4 880 px drone chain | 22 |
| S4 awning → drone over cart → stairs (one run, 2 presses) | 11 (lower bound; humans use more presses) |

For reference: Level 1 pallets allow 6–12 frames, Level 2 double gaps 25–33. Section 1 (185 px/s, 41–46 frames) is easier than Level 4's last section (250 px/s). Sections 3–4 run at 235–260 px/s with four must-pounce set pieces at 11–23 frames, so the level is harder overall than Level 4.

## Notes for the engine

- `?start=sectionN` starts at `sections[N].startX + level.startX`, but `startX` values are absolute, so a debug start lands 100 px into the section. This is harmless.
- Drones at y ≤ 50 hover in front of the mid layer's orange fruit crates, so they are smaller and lower-contrast than the vacuums. A 1 px dark outline or a faint ground shadow under drones would make them pop.
- Bone overlaps that graze by 2 px or less can differ between BotSim and the browser (the bone bob tween keeps running through hit-stops). Bone tools should test against an inset rect.
