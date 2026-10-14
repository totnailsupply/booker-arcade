// Small seeded RNG (mulberry32) for reproducible bot jitter.

export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Uniform in [-range, +range]. */
    symmetric: (range) => (range > 0 ? (next() * 2 - 1) * range : 0),
  };
}
