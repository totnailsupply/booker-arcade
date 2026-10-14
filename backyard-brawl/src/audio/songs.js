// Song data for the procedural chiptune sequencer (src/audio/music.js).
// Pure data, no imports, so scripts/audio-check.mjs can validate it in Node.
//
// Notation (one string per bar, `stepsPerBar` tokens, 16th-note steps):
//   lead: note names ("E5", "F#5", "Bb5"), '-' holds the previous note, '.' rests
//   bass: semitones above the chord's bass root ("0", "12", "-5"), '-' holds, '.' rests
//   drum grids: 'x' full hit, 'o' medium (0.55), 'g' ghost (0.3), '.' nothing
//   chords: one symbol per bar: C Am F7 Cmaj7 Am7 G6 Bm7b5 Csus4 (roots may be sharp/flat)
//
// Songs are 8 or 16 bars. `arrange.sections[i]` lists the layers section i+1
// ADDS (vertical layering); the sequencer moves between sections on bar lines.
// 'hats16' replaces 'hats8' and 'kick2' replaces the kick pattern.
//
// Layer names: lead bass pad stab arp octave kick kick2 snare ghost hats8 hats16
// clank fill echo.
//
// Tracks: menu (title, weapon select, kennel, scores), battle (5 intensity
// levels), boss (2 phases; variant 'cat' = Big Tom, 'vac' = Robo-Vac),
// results (calm loop after the game-over sting or the victory fanfare).

const CHIP_HATS = {
  hats8: 'o . x . o . x . o . x . o . x .',
  hats16: 'x o x o x o x o x o x o x o x o',
};

export const SONGS = {
  // --- Title: light, bouncy G major, ~110 BPM ---------------------------------------
  menu: {
    id: 'menu',
    key: 'G major',
    feel: 'light and bouncy: staccato pulse lead, hopping bass, swung 16ths',
    stepsPerBar: 16,
    bpm: 110,
    swing: 0.12,
    chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'D', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'G'],
    lead: [
      'D5 . G5 . B5 . G5 . D6 - B5 - G5 - . .',
      'E5 . G5 . B5 . E6 . D6 - B5 - G5 - . .',
      'E5 . G5 . C6 . E6 . D6 - C6 - A5 - G5 -',
      'F#5 - A5 - D6 - - - . . A5 . B5 . C6 .',
      'D6 . B5 . G5 . B5 . D6 - G6 - F#6 - E6 -',
      'D6 . B5 . G5 . E5 . G5 - B5 - . . . .',
      'C6 . E6 . G6 - E6 . D6 . C6 . A5 - . .',
      'A5 - B5 - C6 - A5 - D6 - - - . . . .',
      'G5 . . G5 E6 - D6 - C6 - G5 - E5 - G5 -',
      'A5 . . A5 F#6 - E6 - D6 - A5 - F#5 - A5 -',
      'B5 . D6 . F#6 - D6 . B5 . D6 . F#6 - . .',
      'G6 - - - E6 - - - B5 - - - . . . .',
      'E6 . D6 . C6 . G5 . E6 . D6 . C6 - . .',
      'F#6 . E6 . D6 . A5 . F#6 . E6 . D6 - . .',
      'G5 . B5 . D6 . G6 . F#6 - D6 - B5 - A5 -',
      'G5 - - - . . D5 . G5 . . . . . . .',
    ],
    leadVoice: { wave: 'pulse25', gain: 0.11, cutoff: 3600, gate: 0.75 },
    bass: ['0 . 12 . 7 . 12 . 0 . 12 . 7 . 12 .'],
    bassVoice: { wave: 'triangle', gain: 0.3, cutoff: 1200, gate: 0.6 },
    stab: { wave: 'pulse12', gain: 0.022, cutoff: 2800, steps: '. . x . . . x . . . x . . . x .', shift: 0, len: 0.7, tones: 3 },
    kit: 'chip',
    drums: {
      kick: 'x . . . . . . . x . . x . . . .',
      snare: '. . . . x . . . . . . . x . . .',
      ...CHIP_HATS,
    },
    kickGain: 0.75,
    snareGain: 0.7,
    hatGain: 0.04,
    arrange: {
      sections: [['lead', 'bass', 'stab', 'kick', 'snare', 'hats8']],
    },
  },

  // --- Battle: A minor, 144 BPM; builds with intensity ---------------------------------
  battle: {
    id: 'battle',
    key: 'A minor',
    feel: 'scrappy and driving: square riff, octave bass, layers build with the crowd',
    stepsPerBar: 16,
    bpm: [144, 144, 144, 146, 148],
    swing: 0,
    chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'E', 'F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'],
    lead: [
      'A5 - . A5 G5 - E5 - . E5 G5 - A5 - C6 -',
      'B5 - A5 - G5 - E5 - D5 - E5 - . . . .',
      'F5 - . F5 A5 - C6 - . C6 A5 - F5 - A5 -',
      'G5 - B5 - D6 - B5 - G5 - - - D5 - G5 -',
      'A5 - . A5 G5 - E5 - . E5 G5 - A5 - E6 -',
      'D6 - C6 - B5 - A5 - G5 - A5 - . . . .',
      'F5 - A5 - D6 - F6 - E6 - D6 - A5 - F5 -',
      'E5 - G#5 - B5 - E6 - D6 - B5 - G#5 - B5 -',
      'C6 - - - A5 - C6 - F6 - - - E6 - C6 -',
      'D6 - - - B5 - D6 - G6 - - - F6 - D6 -',
      'E6 - - - C6 - A5 - E6 - C6 - A5 - C6 -',
      'B5 - A5 - G5 - A5 - - - . . E5 - A5 -',
      'C6 - A5 - F5 - A5 - C6 - F6 - E6 - C6 -',
      'D6 - B5 - G5 - B5 - D6 - G6 - F6 - D6 -',
      'E6 - - - D6 - - - B5 - - - G#5 - - -',
      'B5 - - - G#5 - - - E5 - - - . . . .',
    ],
    leadVoice: { wave: 'square', gain: 0.1, cutoff: 2600, gate: 0.85 },
    bass: ['0 - 0 12 0 - 0 12 0 - 0 12 0 - 7 12'],
    bassVoice: { wave: 'triangle', gain: 0.32, cutoff: 1300, gate: 0.75 },
    stab: { wave: 'pulse12', gain: 0.024, cutoff: 2400, steps: '. . . . . . x . . . . . . . x .', shift: 0, len: 1.2, tones: 3 },
    arp: { wave: 'square', gain: 0.03, cutoff: 3400, order: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1], shift: 12 },
    octave: { wave: 'triangle', gain: 0.06, cutoff: 5000 },
    kit: 'chip',
    drums: {
      kick: 'x . . . . . x . x . . . . . . .',
      kick2: 'x . . . . . x . x . x . . . x .',
      snare: '. . . . x . . . . . . . x . . .',
      ghost: '. . . . . . . g . . . . . g . .',
      ...CHIP_HATS,
    },
    hatGain: 0.05,
    arrange: {
      // intensity 1..5: base, +drums, +hats, +arpeggio, +lead octave
      sections: [['lead', 'bass', 'stab'], ['kick', 'snare'], ['hats8', 'ghost'], ['arp', 'kick2'], ['hats16', 'octave', 'fill']],
    },
  },

  // --- Boss: C harmonic minor, 160 BPM; phase 2 adds the full kit -------------------------
  boss: {
    id: 'boss',
    key: 'C minor (harmonic: G major dominant)',
    feel: 'dark and urgent: staccato minor riff, pumping square bass, low stabs',
    stepsPerBar: 16,
    bpm: [160, 166],
    swing: 0,
    chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Cm', 'Fm', 'G', 'Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Fm', 'G', 'G'],
    lead: [
      'C5 C5 . C5 Eb5 - C5 . G5 - F#5 - G5 - . .',
      'C6 - B5 - G5 - Eb5 - D5 - Eb5 - C5 - . .',
      'Ab5 - . Ab5 G5 - Eb5 - C5 - Eb5 - Ab5 - C6 -',
      'B5 - - - G5 - - - D6 - - - B5 - . .',
      'C5 C5 . C5 Eb5 - C5 . G5 - F#5 - G5 - . .',
      'Eb6 - D6 - C6 - G5 - Ab5 - G5 - Eb5 - D5 -',
      'F5 - Ab5 - C6 - F6 - Eb6 - C6 - Ab5 - F5 -',
      'G5 - B5 - D6 - F6 - - - D6 - B5 - G5 -',
      'C6 - - - Eb6 - - - Ab6 - - - G6 - Eb6 -',
      'D6 - - - F6 - - - Bb6 - - - Ab6 - F6 -',
      'G6 - - - Eb6 - C6 - G5 - C6 - Eb6 - G6 -',
      'F#6 - G6 - - - . . C6 - B5 - C6 - . .',
      'Ab5 - C6 - Eb6 - Ab6 - G6 - Eb6 - C6 - Ab5 -',
      'F5 - Ab5 - C6 - F6 - Eb6 - C6 - Ab5 - C6 -',
      'B5 - D6 - G6 - - - F6 - D6 - B5 - G5 -',
      'D6 - - - B5 - - - G5 - - - B5 - D6 -',
    ],
    leadVoice: { wave: 'pulse25', gain: 0.1, cutoff: 3000, gate: 0.8, detune: 6 },
    bass: ['0 . 0 0 12 . 0 0 0 . 0 0 12 . 10 .'],
    bassVoice: { wave: 'square', gain: 0.22, cutoff: 700, gate: 0.7 },
    stab: { wave: 'square', gain: 0.026, cutoff: 1400, steps: '. . x . . . x . . . x . . x . .', shift: -12, len: 0.8, tones: 3 },
    arp: { wave: 'square', gain: 0.028, cutoff: 3200, order: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3], shift: 12 },
    octave: { wave: 'triangle', gain: 0.06, cutoff: 5000 },
    kit: 'chip',
    drums: {
      kick: 'x . . . x . . . x . . . x . . .',
      kick2: 'x . . . x . . x x . . . x . x .',
      snare: '. . . . x . . . . . . . x . . .',
      clank: '. . . . . . x . . . . . . x . .',
      ...CHIP_HATS,
    },
    hatGain: 0.05,
    snareGain: 0.85,
    variants: {
      cat: { kit: 'chip' },
      vac: { kit: 'metal', addLayers: ['clank'] },
    },
    arrange: {
      sections: [['lead', 'bass', 'stab', 'kick', 'snare', 'hats8'], ['arp', 'kick2', 'hats16', 'octave', 'fill']],
    },
  },

  // --- Results: calm, warm F major (the booker-run menu theme), 96 BPM -------------------
  results: {
    id: 'results',
    key: 'F major',
    feel: 'calm and warm: echoing triangle lead, pad arps, soft heartbeat kick and shaker',
    stepsPerBar: 16,
    bpm: 96,
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
      sections: [['lead', 'bass', 'pad', 'kick', 'hats8', 'echo']],
    },
  },
};

export const TRACKS = Object.keys(SONGS);

/** The song a track plays. */
export function resolveSong(track) {
  return SONGS[track] || SONGS.battle;
}

/** Number of sections (intensity levels) a track has. */
export const sectionCount = track => resolveSong(track).arrange.sections.length;

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
    if (song.lead.length % 8 !== 0) problems.push(`${tag}: lead has ${song.lead.length} bars (want 8 or 16)`);
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
    const secs = song.arrange?.sections;
    if (!Array.isArray(secs) || !secs.length) problems.push(`${tag}: no arrange.sections`);
    if (Array.isArray(song.bpm) && secs && song.bpm.length !== secs.length) problems.push(`${tag}: ${song.bpm.length} tempos for ${secs.length} sections`);
    for (const layer of (secs || []).flat()) {
      if (['arp', 'pad', 'stab', 'octave'].includes(layer) && !song[layer]) problems.push(`${tag}: layer ${layer} has no voice`);
      if (['kick', 'kick2', 'snare', 'ghost', 'clank', 'hats8', 'hats16'].includes(layer) && !song.drums?.[layer]) problems.push(`${tag}: layer ${layer} has no grid`);
    }
  }
  return problems;
}
