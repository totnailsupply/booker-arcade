// Seeded RNG: mulberry32. The sim never touches Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /** Float in [0, 1). */
  float() {
    return this.next();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Integer in [0, n). */
  int(n) {
    return Math.floor(this.next() * n);
  }
}
