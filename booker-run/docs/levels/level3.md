# Level 3: The Rooftops

City rooftops at blue twilight. New ability: **ear glide**. Hold while falling and the fall speed caps at 55 px/s; updraft vents lift a gliding Booker. Double jump carries over from Level 2. Data: `src/levels/level3.js`.

Length: 19,000 px to the steak, about 91.5 s of game time (default par 91.4 s). 78 bones. No `botPlan`.

## Section map

| # | Name | x | Speed | Contents |
|---|---|---|---|---|
| 1 | Rooftops | 0–4200 | 170 | A 90 px warm-up hop. The first glide: a 240 px chasm, wider than a double jump, with a bone trail along a held jump. A 260 px glide with an AC unit on the landing. The first vent, in a 420 px chasm (a double plus glide also crosses). A vent at the lip of a 650 px chasm lifts Booker onto a raised deck at 140 px (out of a double jump's 122 px reach), then a glide off the deck. |
| 2 | Vents | 4200–9300 | 195 | A 460 px chasm: jump, double, glide. A head-height pigeon on the roof (hop). A 700 px two-vent chain. An antenna sits where a full-hold glide comes down, so let go early and hop it, or double over it. A 920 px chasm with a stepping plank (y 40): glide onto it, then double plus glide off. A vent onto a deck with an AC unit on it. |
| 3 | Pigeon Alley | 9300–13500 | 220 | A vent lifts Booker over the far roof, and a four-pigeon flock (44–98 px) sweeps in, so let go and run under it. A low pigeon to hop, then a 40 px pigeon to run under (don't jump). A 1000 px chasm: vent, a low flock in the dip, vent. Ride the first vent high to stay over the flock. A 360 px glide with an antenna past the landing (over-gliding hits it). |
| 4 | Moonlight | 13500–19000 | 250 | A 400 px glide. **The Moon Bridge** (below). A 600 px chasm with a plank (y 56) under a flock at 110/128: glide low onto the plank and let the flock pass, then jump off. A 480 px double plus glide with an antenna past the landing. A flat run-out to the steak. |

## Signature moment: the Moon Bridge

At x 14500–16100 (250 px/s), a 1,600 px chasm is crossed on five vents in about 6.5 s. If you hold from the lip, the vents carry Booker up in steps (80 → 147 → 178 → the ceiling at about 190), then he glides down past the last two vents and lands about 300 px past the far edge. The far parallax is set to `0.0057`, so the moon stays in view all level. It sits right behind Booker as he rides the first bridge vent, which makes a silhouette shot. Eleven bones trace the arc. The top bone (h 201) is reached only by holding all the way up.

## Tips

| x | Text |
|---|---|
| 800 | Hold while falling to glide! |
| 2215 | Glide into a vent to ride the updraft! |
| 4280 | Double jump, then hold to glide! |
| 9480 | Let go to drop under pigeons! |

## Design rules

- Put vents at the chasm lip, or 60 px into the chasm. "Jump at the edge and hold" then works, and the bot's planner (which anchors on the edge) finds it.
- Every reach clearly works or clearly fails, by 20 px or more. Glide-only crossings keep a 29–89 px margin, and the chasms that need a double fail a glide-only crossing by 20+ px. Decks sit at 140 px, 18 px above a double jump's peak, so you need the vent.
- Antennas and AC units sit where a long glide comes down, so a full-hold glide meets them at 0–30 px of height. The fixes are visible at least 1.5 s ahead: let go early and hop, or use the unspent double jump.
- Let go to drop under pigeons only over a roof, where letting go means landing. Over a pit, flocks sit low in the dip, so riding high is the answer.
- In the air, a press spends the double jump before it resumes a glide. So "let go, then press again" bumps Booker up 56 px. No route depends on re-gliding after a drop.
- Takeoff windows: glide chasms 25–35 frames (the 400 px glide at 250 px/s: 17 frames; a double is the safer way). The double chasm allows 26 + 26 frames, and the vent rides 45–76 frames. Hazard hops allow 15–17 frames (pigeons 27–28). For comparison, Level 1's pallets allow 6–12 frames and Level 2's doubles 25–33 / 19–26.

## Bones

There are 78 bones, all on one route: a held glide from each lip, an early landing before the antennas, under the first flock, over the vent flock and along the Moon Bridge. A scripted run at human timing collects 78/78 in one run (3 stars). Each bone group is collected across a 60–100 px press window. The top three bones of the 11240 vent (h 175–199) are a risk/reward line that needs an early jump.

The bot collects 64/78 (62–66 under jitter). It presses at the lip and rides vents lower, so it misses mostly vent-top and apex bones: 4690, 6120, 7480, 9750, 9840, 11400, 11480, 11560, 11780, 14000, 15760, 17150, 17980 and 18100 (offline harness list; the browser run differs by about one).

## Check results (2026-10-13, against BotPilot.js of 05:52)

| Check | Result |
|---|---|
| `autoplay-check --level 3` | Finish, 0 deaths, score 3325, bones 64/78, 2 stars, 91.5 s |
| `--jitter 50 --seeds 5` | 5/5, 0 deaths (bones 62–66) |
| `--jitter 35 --seeds 5` | 5/5, 0 deaths (bones 62–66) |
| `level-shots --level 3` (and `--debug`) | The art reads: dark pit strips, vents and streaks, deck planks, pigeons against the sky, the moon behind the bridge |

## Difficulty

Section 1 runs at 170 px/s, with glide windows of 25–35 frames and vent windows of 60+. That's easier than Level 2's last section, which runs at 240 px/s with double gaps and tire stacks. The level as a whole is harder than Level 2: sections 3 and 4 (220–250 px/s) chain vents, flocks, and over-glide antennas, and many beats need two or three presses with hold and release timing.
