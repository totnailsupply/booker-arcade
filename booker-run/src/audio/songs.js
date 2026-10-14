// Song data for the procedural chiptune sequencer (src/audio/music.js).
// Pure data, no imports, so `scripts/audio-check.mjs` can validate it in Node.
//
// Notation (one string per bar, `stepsPerBar` tokens, 16th-note steps):
//   lead: note names ("E5", "F#5", "Bb5"), '-' holds the previous note, '.' rests
//   bass: semitones above the chord's bass root ("0", "12", "-5"), '-' holds, '.' rests
//   drum grids: 'x' full hit, 'o' medium (0.55), 'g' ghost (0.3), '.' nothing
//   optional per-song gains: kickGain, snareGain (multipliers), hatGain (absolute)
//   chords: one symbol per bar: C Am F7 Cmaj7 Am7 G6 Bm7b5 Csus4 (roots may be sharp/flat)
//
// Every song has an 8-bar A phrase and an 8-bar B phrase (16 bars) so the loop
// doesn't repeat too quickly. Gameplay layers stack per section (vertical
// layering); `arrange.game[i]` lists what section i+1 ADDS. 'hats16' replaces
// 'hats8' and 'kick2' replaces the kick pattern. Changes land on the next bar.
//
// Layer names: lead bass pad stab arp octave kick kick2 snare ghost hats8 hats16
// clank fill echo. Section 3 always adds 'arp'; section 4 always has 'hats16'.

/** Shift every note of some lead bars by n semitones (used for quotes). */
function transposeBars(bars, n) {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return bars.map(bar => bar.split(/\s+/).map((t) => {
    const m = /^([A-G])([#b]?)(\d)$/.exec(t);
    if (!m) return t;
    const midi = 12 * (Number(m[3]) + 1) + IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + n;
    return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }).join(' '));
}

// --- The Yard (Level 1): the original theme, now 16 bars -------------------
const YARD_A = [
  'E5 - G5 - C6 - G5 - A5 G5 E5 - D5 - E5 -',
  'C5 - E5 - A5 - G5 - E5 - C5 - D5 - E5 -',
  'F5 - A5 - C6 - A5 - G5 F5 E5 - D5 - C5 -',
  'D5 - G5 - B5 - D6 - C6 - B5 - G5 - - -',
  'E5 - G5 - C6 - E6 - D6 C6 G5 - E5 - G5 -',
  'A5 - C6 - E6 - C6 - B5 - A5 - E5 - - -',
  'F5 - A5 - C6 - F6 - E6 - C6 - A5 - G5 -',
  'G5 - B5 - D6 - B5 - G5 - - - . . D5 -',
];
const YARD_B = [
  'G5 - E5 - G5 - C6 - B5 - C6 - D6 - E6 -',
  'C6 - B5 - A5 - E5 - A5 - B5 - C6 - - -',
  'A5 - C6 - F6 - E6 - D6 - C6 - A5 - C6 -',
  'B5 - D6 - G5 - B5 - D6 - - - . . . .',
  'C6 - A5 - F5 - A5 - C6 - F6 - E6 - C6 -',
  'D6 - B5 - G5 - B5 - D6 - G6 - F6 - D6 -',
  'E6 - C6 - A5 - C6 - E6 - D6 C6 B5 A5 - -',
  'B5 - - - D6 - - - G5 - A5 - B5 - D6 -',
];

const CHIP_DRUMS = {
  kick: 'x . . . . . . . x . . . . . . .',
  kick2: 'x . . . . . . . x . x . . . . .',
  snare: '. . . . x . . . . . . . x . . .',
  hats8: 'o . x . o . x . o . x . o . x .',
  hats16: 'x o x o x o x o x o x o x o x o',
};
const ARP16 = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1];

export const SONGS = {
  yard: {
    id: 'yard',
    key: 'C major',
    feel: 'upbeat chiptune, square lead',
    stepsPerBar: 16,
    swing: 0,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Am', 'G'],
    lead: [...YARD_A, ...YARD_B],
    leadVoice: { wave: 'square', gain: 0.11, cutoff: 2600, gate: 0.92 },
    bass: ['0 - 12 - 0 - 12 - 0 - 12 - 0 - 12 -'],
    bassVoice: { wave: 'triangle', gain: 0.32, cutoff: 1200, gate: 0.8 },
    arp: { wave: 'square', gain: 0.035, cutoff: 3500, order: ARP16, shift: 12 },
    octave: { wave: 'triangle', gain: 0.06, cutoff: 5000 },
    kit: 'chip',
    drums: CHIP_DRUMS,
    hatGain: 0.06,
    arrange: {
      game: [['lead', 'bass', 'kick', 'snare'], ['hats8'], ['arp', 'kick2'], ['hats16', 'octave']],
      // Results-screen loop: calm, triangle lead, soft hats
      complete: {
        layers: ['lead', 'bass', 'hats8'],
        leadVoice: { wave: 'triangle', gain: 0.22, cutoff: 2600, gate: 0.92 },
        bassGain: 0.24,
        hatGain: 0.04,
      },
    },
  },

  // --- The Docks (Level 2): sea shanty in 6/8, accordion lead, oom-pah-pah --
  docks: {
    id: 'docks',
    key: 'D minor (dorian), 6/8',
    feel: 'sea shanty jig, accordion lead, stomp-clap',
    stepsPerBar: 12,
    swing: 0,
    chords: ['Dm', 'C', 'Dm', 'Am', 'Dm', 'C', 'Bb', 'A', 'F', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'A'],
    lead: [
      'A5 - - - A5 - A5 - - - D6 -',
      'C6 - - - G5 - E5 - - - G5 -',
      'D6 - - - C6 - A5 - - - F5 -',
      'E5 - - - A5 - C6 - B5 - A5 -',
      'A5 - - - A5 - A5 - D6 - E6 -',
      'E6 - - - C6 - G5 - - - C6 -',
      'D6 - - - Bb5 - F5 - - - Bb5 -',
      'C#6 - - - E6 - A5 - - - . .',
      'C6 - A5 - C6 - F6 - - - C6 -',
      'E6 - D6 - C6 - G5 - - - - -',
      'F6 - E6 - D6 - A5 - - - D6 -',
      'C6 - B5 - A5 - E5 - - - - -',
      'D6 - F6 - D6 - Bb5 - - - D6 -',
      'C6 - A5 - C6 - F5 - - - A5 -',
      'Bb5 - A5 - G5 - D6 - - - Bb5 -',
      'E5 - A5 - C#6 - E6 - - - . .',
    ],
    // Accordion: two detuned pulse reeds (musette beating)
    leadVoice: { wave: 'pulse25', gain: 0.085, cutoff: 2400, gate: 0.9, detune: 9, attack: 0.012 },
    bass: ['0 - - - . . -5 - - - . .'],
    bassVoice: { wave: 'triangle', gain: 0.36, cutoff: 1000, gate: 0.85 },
    // The "pah-pah" of oom-pah-pah: soft chord stabs on the off 8ths
    stab: { wave: 'square', gain: 0.03, cutoff: 1600, steps: '. . x . x . . . x . x .', shift: -12, len: 1.4, tones: 3 },
    arp: { wave: 'square', gain: 0.03, cutoff: 3200, order: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1], shift: 12 },
    octave: { wave: 'triangle', gain: 0.055, cutoff: 5000 },
    kit: 'clap',
    drums: {
      kick: 'x . . . . . . . . . . .',
      kick2: 'x . . . . . . . . x . .',
      snare: '. . . . . . x . . . . .',
      hats8: 'x . o . o . x . o . o .',
      hats16: 'x o x o x o x o x o x o',
    },
    hatGain: 0.05,
    arrange: {
      game: [['lead', 'bass', 'kick', 'snare', 'stab'], ['hats8'], ['arp', 'kick2'], ['hats16', 'octave']],
    },
  },

  // --- The Rooftops (Level 3): dreamy minor 7ths, half-time, echoing triangle
  rooftops: {
    id: 'rooftops',
    key: 'A minor (7th chords)',
    feel: 'dreamy, airy: triangle lead with echo, triangle pad arps, half-time drums',
    stepsPerBar: 16,
    swing: 0.1,
    chords: ['Am7', 'Fmaj7', 'Cmaj7', 'G6', 'Am7', 'Fmaj7', 'Dm7', 'Em7',
      'Dm7', 'Em7', 'Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Bm7b5', 'E7'],
    lead: [
      'E5 - - - - - G5 - A5 - - - C6 - - -',
      'B5 - - - A5 - - - E5 - - - - - - -',
      'G5 - - - B5 - - - D6 - - - B5 - - -',
      'A5 - - - - - - - G5 - E5 - D5 - - -',
      'E5 - - - - - G5 - A5 - - - E6 - - -',
      'D6 - C6 - - - A5 - - - E5 - - - - -',
      'F5 - - - A5 - - - C6 - - - D6 - - -',
      'B5 - - - - - - - G5 - - - . . . .',
      'A5 - C6 - F6 - - - E6 - - - C6 - - -',
      'B5 - D6 - G6 - - - F#6 - - - D6 - - -',
      'C6 - E6 - A6 - - - G6 - - - E6 - - -',
      'D6 - - - B5 - - - G5 - - - - - - -',
      'F5 - A5 - C6 - - - D6 - - - F6 - - -',
      'E6 - - - D6 - - - B5 - - - G5 - - -',
      'D6 - - - F6 - - - A5 - - - B5 - - -',
      'G#5 - - - B5 - - - D6 - - - . . . .',
    ],
    leadVoice: { wave: 'triangle', gain: 0.2, cutoff: null, gate: 0.95, attack: 0.02, vibrato: { rate: 5, cents: 12, after: 0.18 }, echo: 0.45 },
    bass: ['0 - - - - - - - 7 - - - - - 12 -'],
    bassVoice: { wave: 'triangle', gain: 0.27, cutoff: 900, gate: 0.92 },
    pad: { wave: 'triangle', gain: 0.075, order: [0, 1, 2, 3, 2, 1, 2, 3], shift: -12, len: 2.6, echo: 0.3 },
    arp: { wave: 'triangle', gain: 0.05, cutoff: null, order: [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 1, 3, 2, 3, 1, 2], shift: 12, echo: 0.4 },
    octave: { wave: 'sine', gain: 0.07, cutoff: null },
    kit: 'soft',
    drums: {
      kick: 'x . . . . . . . . . . . . . . .',
      kick2: 'x . . . . . . . . . x . . . . .',
      snare: '. . . . . . . . x . . . . . . .',
      hats8: 'x . o . x . o . x . o . x . o .',
      hats16: 'x o x o x o x o x o x o x o x o',
    },
    hatGain: 0.035,
    echo: { steps: 3, feedback: 0.32, wet: 0.5, cutoff: 2400 },
    arrange: {
      game: [['lead', 'bass', 'pad', 'kick', 'snare', 'echo'], ['hats8'], ['arp', 'kick2'], ['hats16', 'octave']],
    },
  },

  // --- The Factory (Level 4): driving minor riffs, metallic percussion ------
  factory: {
    id: 'factory',
    key: 'E minor',
    feel: 'driving industrial: staccato riffs, four-on-the-floor, metal clanks',
    stepsPerBar: 16,
    swing: 0,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B', 'Am', 'Em', 'F', 'Em', 'Am', 'C', 'D', 'B'],
    lead: [
      'E5 - E5 G5 . E5 B5 - A5 - G5 - F#5 - G5 -',
      'E5 - E5 G5 . E5 B5 - D6 - B5 - A5 - G5 -',
      'C6 - B5 - G5 - E5 - G5 - C6 - B5 - G5 -',
      'A5 - F#5 - D5 - F#5 - A5 - D6 - C6 - A5 -',
      'E6 - . E6 D6 - B5 - G5 - B5 - E5 - . .',
      'G5 - . G5 A5 - B5 - D6 - B5 - G5 - E5 -',
      'C6 - . C6 B5 - G5 - E6 - D6 - C6 - B5 -',
      'B5 - - - D#6 - - - F#6 - - - . . . .',
      'A5 - C6 - E6 - . A5 C6 - E6 - A6 - . .',
      'G6 - E6 - B5 - . G5 B5 - E6 - G6 - . .',
      'F6 - E6 - C6 - A5 - F5 - A5 - C6 - E6 -',
      'E6 - - - B5 - - - G5 - - - E5 - . .',
      'C6 - B5 A5 - - E5 - A5 - B5 - C6 - E6 -',
      'G6 - E6 - C6 - G5 - C6 - E6 - G6 - E6 -',
      'F#6 - D6 - A5 - F#5 - A5 - D6 - F#6 - A6 -',
      'B6 - - - A6 - - - F#6 - - - D#6 - - -',
    ],
    leadVoice: { wave: 'square', gain: 0.11, cutoff: 2200, gate: 0.72 },
    bass: ['0 . 0 . 12 . 0 . 0 . 0 . 12 . 7 .'],
    bassVoice: { wave: 'square', gain: 0.27, cutoff: 750, gate: 0.7 },
    arp: { wave: 'square', gain: 0.032, cutoff: 3000, order: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3], shift: 12 },
    octave: { wave: 'triangle', gain: 0.06, cutoff: 5000 },
    kit: 'metal',
    drums: {
      kick: 'x . . . x . . . x . . . x . . .',
      kick2: 'x . . . x . . . x . . . x . x .',
      snare: '. . . . x . . . . . . . x . . .',
      clank: '. . . . . . x . . . . . . x . .',
      hats8: 'o . x . o . x . o . x . o . x .',
      hats16: 'x o x o x o x o x o x o x o x o',
    },
    hatGain: 0.05,
    arrange: {
      game: [['lead', 'bass', 'kick', 'snare'], ['hats8', 'clank'], ['arp', 'kick2'], ['hats16', 'octave']],
    },
  },

  // --- Night Market (Level 5): funky syncopated bass, pentatonic lead -------
  market: {
    id: 'market',
    key: 'G major (pentatonic lead, dominant 7ths)',
    feel: 'funky and bright: slap-style bass, chank stabs, swung 16ths',
    stepsPerBar: 16,
    swing: 0.14,
    chords: ['G7', 'G7', 'C7', 'C7', 'G7', 'Em7', 'Am7', 'D7',
      'Cmaj7', 'Bm7', 'Am7', 'D7', 'Cmaj7', 'Bm7', 'Em7', 'D7'],
    lead: [
      'D6 . B5 . D6 - E6 . . D6 . B5 A5 - G5 .',
      'B5 . G5 . A5 - B5 . . D6 . . E6 - . .',
      'E6 . D6 . E6 - G6 . . E6 . D6 E6 - . .',
      'G6 . E6 . D6 - E6 . . D6 . A5 G5 - . .',
      'D6 . B5 . D6 - E6 . . D6 . B5 A5 - G5 .',
      'G5 . A5 . B5 - D6 . . E6 . D6 B5 - . .',
      'E6 . . E6 D6 . B5 . A5 . . A5 B5 - . .',
      'D6 . E6 . D6 . A5 . D6 - - - . . . .',
      'E6 - G6 . E6 . D6 . E6 . . G6 - . A6 .',
      'D6 - B5 . D6 . E6 . D6 . . B5 - . A5 .',
      'E6 - . E6 . D6 . B5 . A5 . . G5 - . .',
      'A5 . B5 . D6 . E6 . G6 . . E6 D6 - . .',
      'G6 . E6 . G6 . A6 . G6 . . E6 - . D6 .',
      'D6 . B5 . D6 . E6 . D6 . . B5 - . A5 .',
      'B5 . . B5 D6 . E6 . G6 . . E6 D6 - B5 .',
      'A5 - - - B5 - - - D6 - . . . . . .',
    ],
    leadVoice: { wave: 'pulse25', gain: 0.115, cutoff: 4200, gate: 0.7 },
    bass: ['0 - . 0 . . 12 . . 0 . 7 12 . 7 .'],
    bassVoice: { wave: 'square', gain: 0.3, cutoff: 850, gate: 0.8 },
    stab: { wave: 'pulse12', gain: 0.026, cutoff: 3000, steps: '. . . x . . x . . . . x . . x .', shift: 0, len: 0.6, tones: 4 },
    arp: { wave: 'square', gain: 0.03, cutoff: 3500, order: ARP16, shift: 12 },
    octave: { wave: 'triangle', gain: 0.06, cutoff: 5000 },
    kit: 'chip',
    drums: {
      kick: 'x . . x . . . . . . x . . . . .',
      kick2: 'x . . x . . . . . . x . . x . .',
      snare: '. . . . x . . . . . . . x . . .',
      ghost: '. . . . . . . g . g . . . . . g',
      hats8: 'x . o . x . o . x . o . x . o .',
      hats16: 'x o x o x o x o x o x o x o x o',
    },
    hatGain: 0.055,
    arrange: {
      game: [['lead', 'bass', 'kick', 'snare', 'stab'], ['hats8', 'ghost'], ['arp', 'kick2'], ['hats16', 'octave']],
    },
  },

  // --- Steakhouse Row (Level 6): heroic finale, quotes the Yard theme -------
  steakhouse: {
    id: 'steakhouse',
    key: 'D major (A quotes the Yard theme up a step; B ends bVI-bVII-I)',
    feel: 'bold and heroic: unison pulse lead, galloping bass, snare fills, fastest',
    stepsPerBar: 16,
    swing: 0,
    chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G', 'A', 'Bm', 'G', 'D', 'A', 'Bb', 'C', 'D', 'A'],
    lead: [
      ...transposeBars(YARD_A, 2),
      'F#5 - B5 - D6 - F#6 - E6 - D6 - B5 - D6 -',
      'G6 - - - D6 - B5 - D6 - G6 - F#6 - D6 -',
      'A5 - D6 - F#6 - A6 - - - F#6 - D6 - A5 -',
      'C#6 - E6 - A6 - G6 - F#6 - E6 - C#6 - E6 -',
      'F5 - Bb5 - D6 - - - C6 - Bb5 - A5 - Bb5 -',
      'G5 - C6 - E6 - - - D6 - C6 - Bb5 - C6 -',
      'D6 - - - F#6 - - - A6 - - - - - - -',
      'A5 - C#6 - E6 - A6 - G6 - E6 - C#6 - A5 -',
    ],
    leadVoice: { wave: 'pulse25', gain: 0.08, cutoff: 3200, gate: 0.9, detune: 5, attack: 0.008 },
    bass: ['0 - 0 0 0 - 0 0 0 - 0 0 12 - 7 -'],
    bassVoice: { wave: 'triangle', gain: 0.28, cutoff: 1400, gate: 0.85 },
    arp: { wave: 'square', gain: 0.033, cutoff: 3500, order: ARP16, shift: 12 },
    octave: { wave: 'triangle', gain: 0.065, cutoff: 5000 },
    kit: 'chip',
    snareGain: 0.7,           // the snare lands on lead + bass downbeats: keep the peaks down
    drums: {
      kick: 'x . . . . . x . x . . . . . . .',
      kick2: 'x . . . . . x . x . x . . . x .',
      snare: '. . . . x . . . . . . . x . . .',
      hats8: 'o . x . o . x . o . x . o . x .',
      hats16: 'x o x o x o x o x o x o x o x o',
    },
    hatGain: 0.055,
    arrange: {
      game: [['lead', 'bass', 'kick', 'snare', 'hats8'], ['arp'], ['octave', 'kick2'], ['hats16', 'fill']],
    },
  },

  // --- Title and level select: calm, inviting --------------------------------
  menu: {
    id: 'menu',
    key: 'F major',
    feel: 'calm and warm: echoing triangle lead, pad arps, soft heartbeat kick and shaker',
    stepsPerBar: 16,
    swing: 0.12,
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'C7'],
    lead: [
      'A5 - - - C6 - - - A5 - G5 - F5 - - -',
      'D5 - - - F5 - - - A5 - - - - - - -',
      'Bb5 - - - A5 - - - G5 - F5 - D5 - - -',
      'E5 - - - G5 - - - C6 - - - . . . .',
      'A5 - - - C6 - - - F6 - E6 - C6 - - -',
      'E6 - - - C6 - - - A5 - - - - - - -',
      'D6 - - - C6 - Bb5 - A5 - - - G5 - - -',
      'G5 - - - - - - - . . . . . . . .',
      'F5 - - - Bb5 - - - D6 - - - C6 - - -',
      'C6 - - - Bb5 - - - G5 - - - E5 - - -',
      'E5 - - - A5 - - - C6 - - - E6 - - -',
      'D6 - - - - - - - A5 - - - . . . .',
      'Bb5 - - - D6 - - - G6 - - - F6 - - -',
      'E6 - - - D6 - - - C6 - - - Bb5 - - -',
      'A5 - - - C6 - - - F5 - - - - - - -',
      'G5 - - - A5 - - - Bb5 - - - G5 - - -',
    ],
    leadVoice: { wave: 'triangle', gain: 0.19, cutoff: null, gate: 0.95, attack: 0.015, vibrato: { rate: 4.5, cents: 10, after: 0.2 }, echo: 0.35 },
    bass: ['0 - - - - - - - 7 - - - 12 - - -'],
    bassVoice: { wave: 'triangle', gain: 0.22, cutoff: 900, gate: 0.9 },
    pad: { wave: 'triangle', gain: 0.06, order: [0, 1, 2, 3, 2, 1, 2, 3], shift: -12, len: 2.4, echo: 0.25 },
    kit: 'soft',
    drums: {
      kick: 'x . . . . . . . x . . . . . . .',
      hats8: 'o . g . o . g . o . g . o . g .',
    },
    kickGain: 0.6,
    hatGain: 0.03,
    echo: { steps: 3, feedback: 0.3, wet: 0.45, cutoff: 2200 },
    arrange: {
      menu: ['lead', 'bass', 'pad', 'kick', 'hats8', 'echo'],
    },
  },
};

/** Level music variant ids, in level order (LEVELS[n].music). */
export const VARIANT_IDS = ['yard', 'docks', 'rooftops', 'factory', 'market', 'steakhouse'];

/** The song a track plays: menu theme, results loop (Yard), or the level's variant. */
export function resolveSong(track, variant) {
  if (track === 'menu') return SONGS.menu;
  if (track === 'complete') return SONGS.yard;
  return SONGS[variant] || SONGS.yard;
}

/**
 * Checks every song's bars and grids have the right number of tokens and only
 * known symbols. Returns a list of problems (empty = fine). Used by audio-check.
 */
export function validateSongs() {
  const problems = [];
  const NOTE = /^[A-G][#b]?\d$/;
  for (const song of Object.values(SONGS)) {
    const n = song.stepsPerBar;
    const tag = song.id;
    if (song.lead.length !== 16) problems.push(`${tag}: lead has ${song.lead.length} bars (want 16 = 8 A + 8 B)`);
    if (song.chords.length !== song.lead.length) problems.push(`${tag}: ${song.chords.length} chords for ${song.lead.length} bars`);
    song.lead.forEach((bar, i) => {
      const t = bar.trim().split(/\s+/);
      if (t.length !== n) problems.push(`${tag}: lead bar ${i + 1} has ${t.length} tokens`);
      t.forEach(x => { if (x !== '-' && x !== '.' && !NOTE.test(x)) problems.push(`${tag}: bad note ${x} in bar ${i + 1}`); });
    });
    song.bass.forEach((bar, i) => {
      const t = bar.trim().split(/\s+/);
      if (t.length !== n) problems.push(`${tag}: bass pattern ${i + 1} has ${t.length} tokens`);
      t.forEach(x => { if (x !== '-' && x !== '.' && !/^-?\d+$/.test(x)) problems.push(`${tag}: bad bass token ${x}`); });
    });
    for (const [name, grid] of Object.entries(song.drums || {})) {
      const t = grid.trim().split(/\s+/);
      if (t.length !== n) problems.push(`${tag}: drum ${name} has ${t.length} steps`);
      t.forEach(x => { if (!['x', 'o', 'g', '.'].includes(x)) problems.push(`${tag}: bad drum token ${x} in ${name}`); });
    }
    if (song.stab) {
      const t = song.stab.steps.trim().split(/\s+/);
      if (t.length !== n) problems.push(`${tag}: stab grid has ${t.length} steps`);
    }
    if (song.arp && song.arp.order.length !== n) problems.push(`${tag}: arp order has ${song.arp.order.length} steps`);
    for (const c of song.chords) {
      if (!/^[A-G][#b]?(m7b5|maj7|m7|m|7|6|sus4)?$/.test(c)) problems.push(`${tag}: unknown chord ${c}`);
    }
    if (song.arrange.game) {
      const all = song.arrange.game.flat();
      if (!song.arrange.game[2].includes('arp') && !song.arrange.game.slice(0, 2).flat().includes('arp')) problems.push(`${tag}: no arp by section 3`);
      if (!all.includes('hats16')) problems.push(`${tag}: no hats16 in section 4`);
    }
  }
  return problems;
}
