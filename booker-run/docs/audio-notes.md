# Audio notes

All audio is procedural Web Audio, with no files and no dependencies. Code lives in `src/audio/`:

- `songs.js`: song data (pure data, validated by `validateSongs()`).
- `music.js`: the step sequencer and its voices.
- `sfx.js`: all sound effects, including the glide wind loop.
- `AudioManager.js`: the context, buses, music transport, mute, ducking, and QA meters and offline renders.
- `AudioBridge.js`: maps EventBus events to sounds.

Tunables are in the `AUDIO` section of `src/core/Constants.js`.

Check everything with `node scripts/audio-check.mjs`. To run only some parts, add `--only songs,menu,run,levels,flow,sfx,glide,mute,mix`.

## Music

Every song is 16 bars long, an 8-bar A phrase plus an 8-bar B phrase, so it repeats about every 30 s. The sequencer plays 16th-note steps.

Gameplay songs add layers per section, and each section is faster. A section change lands on the next bar line, with a soft crash cymbal. Section 3 always adds `arp`, and section 4 always has 16th hats.

`MUSIC_GAMEPLAY { variant }` picks the song (`LEVELS[n].music`).

| Song | Key | BPM s1→s4 | Feel and instruments | Section layers (s1 base, then added) |
|---|---|---|---|---|
| `yard` (L1) | C major | 132 / 138 / 144 / 152 | The original upbeat theme, extended to 16 bars. Square lead, triangle bass on 8ths with octave bounce | lead, bass, kick, snare → hats8 → arp, kick2 → hats16, lead octave |
| `docks` (L2) | D minor (dorian), **6/8** (12 steps a bar; 138 bpm = 92 dotted-quarter beats) | 138 / 144 / 150 / 159 | Sea-shanty jig. Accordion lead (two detuned 25% pulse reeds), oom-pah-pah bass and chord stabs, stomp-clap kit | lead, bass, kick, clap, stab → hats8 (shaker) → arp, kick2 → hats16, lead octave |
| `rooftops` (L3) | A minor, 7th chords (Am7 Fmaj7 Cmaj7 …) | 116 / 120 / 126 / 132 | Dreamy and airy. Triangle lead with vibrato and a dotted-8th echo, triangle pad arps, half-time drums, light swing | lead, bass, pad, kick, snare, echo → hats8 → arp (sparkle), kick2 → hats16, sine octave |
| `factory` (L4) | E minor (bII F chord in B) | 136 / 142 / 148 / 156 | Driving industrial. Staccato square riffs, filtered square bass, four-on-the-floor kick, metal kit (clicky kick, ringing snare, metallic ticks) | lead, bass, kick, snare → hats8, clank → arp, kick2 → hats16, lead octave |
| `market` (L5) | G major, pentatonic lead over dominant 7ths | 126 / 132 / 138 / 146 | Funky and bright. Syncopated square bass, 12.5% pulse "chank" stabs, swung 16ths, ghost snares | lead, bass, kick, snare, stab → hats8, ghost → arp, kick2 → hats16, lead octave |
| `steakhouse` (L6) | D major. A quotes the Yard theme up a step; B ends on bVI-bVII-I (Bb C D) | 144 / 150 / 158 / 166 (fastest) | Bold, heroic finale. Unison 25% pulse lead, galloping bass, snare fill into each phrase | lead, bass, kick, snare, hats8 → arp → lead octave, kick2 → hats16, fill |
| `menu` | F major | 100 | Calm and warm. Echoing triangle lead, pad arps, soft heartbeat kick and shaker | — |
| results loop | C major (Yard) | 118 | The existing calm loop: triangle lead, bass, soft hats, after the fanfare | — |

The music bus ducks in two places:

- Under the new-ability card it drops to 0.3 (about -10 dB). The level's song starts once, under the card, and swells back over 0.6 s when the card goes, with no restart.
- Under the Level 6 ending flourish it drops for 2.8 s.

Only one sequencer is ever live (`liveSequencers` ≤ 1). A death stops the music, and the retry starts the song fresh at bar 1.

## SFX → events

| Event | Sound |
|---|---|
| `PLAYER_JUMP`, `PLAYER_LAND`, `BONE_COLLECTED`, `SECTION_CHANGED`, `PLAYER_DIED`, `LEVEL_COMPLETE` | Unchanged from Step 3: blip, thump (120 ms debounce), climbing chime, whoosh, bonk, fanfare and woof. Level 6 adds a sparkle run to the fanfare |
| `PLAYER_DOUBLE_JUMP` | Airy rising "flip" whoosh (noise sweep + triangle sweep) with a two-note sparkle |
| `PLAYER_GLIDE_START` / `END` | Looping wind: band-passed noise with a slow gust LFO and a faint whistle. It fades in and out with `setTargetAtTime` (no clicks), and a re-grab during the fade reuses the loop. Pitch and level follow Booker's vertical speed (polled every 50 ms). It also stops on pause, death, level start, menu, and any mode that isn't PLAYING |
| `PLAYER_WALL_CLING` | Short paw scrape: three falling noise scratches (150 ms rate limit) |
| `PLAYER_WALL_KICK` | Punchy tick + thump + rising pulse. Each kick in a chain (within 700 ms) climbs a semitone, up to +5 |
| `PLAYER_POUNCE` | Cartoon boing (rising triangle with a fast 22 Hz wobble) + squish |
| `ENEMY_STOMPED` | Squelchy pop + coin chime (B→E). The chime climbs 2 semitones per stomp in a chain (1.5 s) |
| `PLAYER_DASH` / `DASH_END` | Zoom: rising noise sweep, saw sweep, and low growl / a soft falling tail |
| `BREAKABLE_SMASHED` | Crunchy crash: thud, four cracks, a body crunch, and debris patter. A `gate` adds a metal clang |
| `STEAM_WINDUP` / `STEAM_ON` | Quiet rising hiss / louder hiss burst. Volume falls off with distance from Booker (full within 140 px, silent past 560 px). Each type is rate-limited to one per 250 ms across all vents |
| `MENU_MOVE` | Soft tick (40 ms rate limit) |
| `MENU_SELECT` | Bright two-note confirm. The `retry` action plays a quick soft blip instead, and `auto-retry` is silent |
| `MENU_BACK` / `MENU_LOCKED` | Two falling notes / a dull thud with a low buzz |
| `UI_UNLOCK_REVEAL` | Sparkly rising jingle that lands on a chord. Without this event, `LEVEL_UNLOCKED` plays it 1.2 s after the fanfare |
| `GAME_OVER_SHOWN` | Gentle two-note "aw". If the death set a new best (`isNewBestProgress` or `NEW_BEST_PROGRESS`), it plays the rising new-best arpeggio instead |
| `UI_NEW_BEST` | Small rising arpeggio (250 ms rate limit) |
| `UI_STAR_POP` | Pop that rises per star (E6, G6, C7). An unearned star plays a soft low tick |
| `UI_TALLY_TICK` | Tiny tick that rises with the row (45 ms rate limit). `done` plays a short ding |
| `ABILITY_INTRO_SHOWN` / `DONE` | Rising shimmer that lands on a bright chord, with the music ducked / a confirm when a press dismisses the card, then the music swells back |
| `TIP_SHOWN` | Soft "ding-dong" (400 ms rate limit) |
| `UI_ENDING` | Golden Steak flourish: a rising sweep, the Yard opening quoted in D, a big chord with a timpani hit and shimmer, then a double bark (about 2.4 s) |

Every repeated SFX gets a small random pitch offset (±4%; ±1–2% for chimes). Every SFX returns early when the context isn't running or audio is muted, so nothing throws before the first gesture or without Web Audio.

## Mix

The signal path is: track gain → music bus (0.42) / SFX bus (0.5) → master (0.8) → limiter (DynamicsCompressor, threshold -6 dBFS, ratio 12) → output. Mute ramps the master to 0.

The levels below come from offline renders (`OfflineAudioContext`), so they don't depend on machine load. All values are linear at the bus output.

- **Music:** every song is within 3 dB RMS of the Yard. The Yard measures 0.065 RMS (-23.7 dB), with peaks of 0.28–0.42 (-11 to -7.5 dB). Section 4 is never quieter than section 1.
- **Noise peaks:** noise percussion can line up with a lead and bass downbeat, which pushes a rare peak toward 0.56. That is 0.45 at the master, still under the limiter threshold.
- **SFX:** every SFX peaks at or below the quietest song's peak (0.28):
  - Loudest: locked thud -5.0 dB, smash -5.7 dB, pounce -6.0 dB, wall kick -6.3 dB, land -6.3 dB.
  - Middle: jump -10 dB, stomp -9 dB.
  - Quietest: UI ticks and taps -14 to -21 dB.
  - Wind loop: about -32 dB RMS, under the music's -25 dB.
  - Ending flourish: -0.7 dB, over music ducked by 10 dB.
- **Headroom:** the worst-case music peak plus the loudest SFX peak, at the master, is 0.58–0.69 (-4.7 to -3.2 dBFS), depending on the noise peaks in a render.
- **Dash:** the dash zoom sits at -12 dB.

## QA hooks

- `render_game_to_text().audio` reports:
  - Tracks: `track`, `variant`, `song`, `bpm`, `section`, `bar`, `layers`.
  - State: `glide`, `duck`, `muted`, `contextState`.
  - Counters: `sfx` (play counts by name), `sequencersStarted`, `liveSequencers`.
- `window.__AUDIO__` provides these debug methods:
  - `enableMeter()` and `readMeter()`: a live ScriptProcessor meter on the music bus, the SFX bus, and the master after mute.
  - `renderMusicOffline({ variant, section, track })` and `renderSfxOffline(fn)`: offline renders that return the peak and RMS.
- The check fires events through `window.__EVENT_BUS__`.

## Needs a human listen

- Whether the Docks 6/8 accordion reads as a shanty, and the detune amount (9 cents).
- The Rooftops echo and swing: it may feel too slow next to a 170–250 px/s run.
- The Factory clank pattern, and whether the four-on-the-floor gets tiring over 90 s.
- The Market swing amount (0.14) and the bass/stab groove.
- The Steakhouse Yard quote: is it recognizable at 144–166 bpm?
- The glide wind level and whistle, and the steam hiss distance falloff during real play.
- Whether the pounce boing and the stomp chime overlap well (both fire on every stomp).
