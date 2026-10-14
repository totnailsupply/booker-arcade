// =============================================================================
// Rng.js — seedable PRNG (sfc32 seeded through a string hash). Pure ES module.
//
//   import { rng, Rng } from './core/Rng.js';
//   rng.next()        float in [0, 1)
//   rng.int(n)        integer in [0, n)
//   rng.range(a, b)   integer in [a, b] (inclusive)
//   rng.chance(p)     true with probability p
//   rng.pick(arr)     one element
//   rng.shuffle(arr)  Fisher–Yates IN PLACE, returns arr
//   rng.fork(label)   a NEW independent stream (deterministic: parent seed + label + fork count)
//   rng.stream(label) the SAME forked stream every call (memoised) — use this in games:
//                       const r = rng.stream('plinko');  // survives scene restarts
//
// The singleton `rng` is seeded from ?seed=N when present (tests use ?seed=7),
// otherwise from crypto.getRandomValues. `new Rng(seed)` makes a private one
// (node tests: new Rng(42)).
// =============================================================================

/** 32-bit string hash (cyrb53 lower half folded), stable across platforms. */
export function hashString(str) {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function randomSeed() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0];
  } catch {
    return (Math.random() * 2 ** 32) >>> 0;
  }
}

export class Rng {
  /** @param {number|string} [seed] any number or string; omitted = crypto random */
  constructor(seed) {
    this.seed = seed === undefined || seed === null ? randomSeed() : seed;
    const s = String(this.seed);
    this.a = hashString(`a:${s}`);
    this.b = hashString(`b:${s}`);
    this.c = hashString(`c:${s}`);
    this.d = hashString(`d:${s}`) | 1;
    this.calls = 0;
    this.forks = {};
    this.streams = {};
    for (let i = 0; i < 12; i++) this.nextU32(); // warm up
    this.calls = 0;
  }

  /** sfc32: next unsigned 32-bit integer. */
  nextU32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    this.calls += 1;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next() {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, n). Unbiased (rejection sampling). */
  int(n) {
    n = Math.floor(n);
    if (!(n > 0)) return 0;
    if (n === 1) return 0;
    const limit = Math.floor(4294967296 / n) * n;
    let x;
    do { x = this.nextU32(); } while (x >= limit);
    return x % n;
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[this.int(arr.length)];
  }

  /** Fisher–Yates in place. Returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** New independent stream. The n-th fork of a label is always the same stream for a given seed. */
  fork(label = '') {
    const n = (this.forks[label] = (this.forks[label] || 0) + 1);
    return new Rng(`${this.seed}/${label}#${n}`);
  }

  /** Memoised fork: one persistent stream per label (survives scene restarts). */
  stream(label) {
    return (this.streams[label] ||= new Rng(`${this.seed}/stream:${label}`));
  }

  /** Small state summary for render_game_to_text. */
  info() {
    return { seed: this.seed, calls: this.calls, streams: Object.fromEntries(Object.entries(this.streams).map(([k, r]) => [k, r.calls])) };
  }
}

function seedFromUrl() {
  try {
    if (typeof location === 'undefined') return null;
    const v = new URLSearchParams(location.search).get('seed');
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  } catch {
    return null;
  }
}

/** App-wide RNG (seeded from ?seed=N if present). */
export const rng = new Rng(seedFromUrl() ?? undefined);
