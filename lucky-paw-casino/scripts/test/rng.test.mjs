import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, rng } from '../../src/core/Rng.js';

test('same seed -> same sequence; different seed -> different', () => {
  const a = new Rng(7), b = new Rng(7), c = new Rng(8);
  const sa = Array.from({ length: 50 }, () => a.next());
  const sb = Array.from({ length: 50 }, () => b.next());
  const sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('string seeds work and are stable', () => {
  assert.equal(new Rng('abc').nextU32(), new Rng('abc').nextU32());
});

test('int(n) covers [0,n) roughly uniformly', () => {
  const r = new Rng(1);
  const counts = new Array(6).fill(0);
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const v = r.int(6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
    counts[v]++;
  }
  for (const c of counts) assert.ok(Math.abs(c - N / 6) < N / 6 * 0.05, `bucket ${c}`);
  assert.equal(r.int(1), 0);
  assert.equal(r.int(0), 0);
});

test('range, chance, pick', () => {
  const r = new Rng(3);
  for (let i = 0; i < 1000; i++) {
    const v = r.range(2, 12);
    assert.ok(v >= 2 && v <= 12);
  }
  assert.equal(r.pick([]), undefined);
  assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  let hits = 0;
  for (let i = 0; i < 10000; i++) if (r.chance(0.25)) hits++;
  assert.ok(Math.abs(hits - 2500) < 250);
});

test('shuffle is a permutation and deterministic', () => {
  const a = new Rng(5).shuffle([...Array(52).keys()]);
  const b = new Rng(5).shuffle([...Array(52).keys()]);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(52).keys()]);
  assert.notDeepEqual(a, [...Array(52).keys()]);
});

test('fork: independent, deterministic, and repeated forks differ', () => {
  const p1 = new Rng(9), p2 = new Rng(9);
  const f1 = p1.fork('dice'), f2 = p2.fork('dice');
  assert.equal(f1.next(), f2.next());
  const f3 = p1.fork('dice');
  assert.notEqual(new Rng(9).fork('dice').nextU32(), f3.nextU32());
  // forking does not consume the parent stream
  const q = new Rng(9);
  const before = q.next();
  const q2 = new Rng(9);
  q2.fork('x');
  assert.equal(q2.next(), before);
});

test('stream(label) is memoised', () => {
  const r = new Rng(11);
  assert.equal(r.stream('plinko'), r.stream('plinko'));
  assert.notEqual(r.stream('plinko'), r.stream('slots'));
  const a = new Rng(11).stream('plinko').next();
  assert.equal(new Rng(11).stream('plinko').next(), a);
});

test('singleton exists in node (crypto seeded)', () => {
  assert.equal(typeof rng.next(), 'number');
});
