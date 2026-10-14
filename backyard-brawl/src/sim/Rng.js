// Seeded RNG (mulberry32). Every random decision in the sim goes through one
// of these so a seed replays the same run in the browser and in node.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /** [0, 1) */
  float() { return this.next(); }

  /** [lo, hi) */
  range(lo, hi) { return lo + (hi - lo) * this.next(); }

  /** integer in [0, n) */
  int(n) { return Math.floor(this.next() * n); }

  chance(p) { return this.next() < p; }

  pick(list) { return list[this.int(list.length)]; }

  /** items: [{ weight, ... }] -> one item (null when empty / all zero) */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}

/** A seed from the clock when no ?seed= is given. */
export function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}
