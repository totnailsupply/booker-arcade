// RTP check: runs every scripts/rtp/<game>.rtp.mjs module and checks that each
// game's return-to-player lands in its target band.
//
//   node scripts/rtp-check.mjs [--only plinko,slots]
//
// A module exports `default async function () => result | result[]`, where
// result = { game, label, rtp, band: [lo, hi], method: 'exact' | 'sim N', note? }.
// rtp and band are fractions (0.9898, not 98.98). Modules import the pure
// logic from src/games/<game>/logic.js (no Phaser) so this runs in node.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rtp');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith('.rtp.mjs')).sort()
  : [];
const picked = files.filter(f => !only || only.includes(f.replace('.rtp.mjs', '')));
if (!picked.length) {
  console.log('rtp-check: no modules found in scripts/rtp/');
  process.exit(only ? 1 : 0);
}

let failed = 0;
const pct = x => (x * 100).toFixed(2) + '%';
for (const f of picked) {
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const out = await mod.default();
    for (const r of [].concat(out)) {
      const ok = r.rtp >= r.band[0] && r.rtp <= r.band[1];
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.game.padEnd(10)} ${(r.label || '').padEnd(22)} RTP ${pct(r.rtp)}  band ${pct(r.band[0])}–${pct(r.band[1])}  (${r.method})${r.note ? '  ' + r.note : ''}`);
    }
  } catch (e) {
    failed++;
    console.log(`FAIL  ${f}: ${e.stack || e}`);
  }
  console.log(`      ${f} took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(failed ? `rtp-check: ${failed} failed` : 'rtp-check: all pass');
process.exit(failed ? 1 : 0);
