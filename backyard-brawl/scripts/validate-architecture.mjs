#!/usr/bin/env node
// =============================================================================
// validate-architecture.mjs — static checks for Backyard Brawl's structure
// (adapted from soba-tower's game-creator validator to PLAN section 6).
//
//   FAIL  render_game_to_text() and window.advanceTime in src/main.js
//   FAIL  src/sim/ has no Phaser / DOM / Math.random / Date.now (headless + seeded)
//   FAIL  every browser script in scripts/ launches through scripts/lib/browser.mjs
//   FAIL  EventBus defines events; Constants / SaveData / Assets exist
//   FAIL  SaveData wraps localStorage in try/catch
//   WARN  numeric literals in src/sim/ that look like tunables (belong in Constants.js)
//
// Usage: node scripts/validate-architecture.mjs   (exit 1 on any FAIL)
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
let passed = 0;
let failed = 0;
let warnings = 0;
const pass = (m) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m) => { console.log(`[FAIL] ${m}`); failed++; };
const warn = (m) => { console.log(`[WARN] ${m}`); warnings++; };
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null);

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, ext));
    else if (ext.some(x => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('=== Architecture Validation (backyard-brawl) ===\n');

// 1. Test hooks
const main = read(path.join(SRC, 'main.js'));
if (main && /render_game_to_text/.test(main)) pass('render_game_to_text() in src/main.js');
else fail('render_game_to_text() missing from src/main.js');
if (main && /window\.advanceTime\s*=/.test(main)) pass('window.advanceTime test clock in src/main.js');
else fail('window.advanceTime missing from src/main.js');

// 2. Pure sim
const simFiles = walk(path.join(SRC, 'sim'), ['.js']);
if (!simFiles.length) fail('src/sim/ is empty');
const banned = [
  [/from\s+['"]phaser['"]/, 'imports phaser'],
  [/\bwindow\./, 'uses window'],
  [/\bdocument\./, 'uses document'],
  [/Math\.random\s*\(/, 'uses Math.random (use the seeded Rng)'],
  [/Date\.now\s*\(/, 'uses Date.now'],
  [/performance\.now\s*\(/, 'uses performance.now'],
];
let simClean = true;
for (const f of simFiles) {
  const src = stripComments(fs.readFileSync(f, 'utf-8'));
  for (const [re, what] of banned) {
    if (re.test(src) && !(path.basename(f) === 'Rng.js' && /Date\.now|Math\.random/.test(what) && /randomSeed/.test(src))) {
      fail(`src/sim/${path.relative(path.join(SRC, 'sim'), f)} ${what}`);
      simClean = false;
    }
  }
}
if (simClean && simFiles.length) pass(`src/sim/ is pure JS (${simFiles.length} files, no Phaser/DOM/unseeded randomness)`);

// 3. Browser scripts use the shared launcher
const scripts = walk(path.join(ROOT, 'scripts'), ['.js', '.mjs']).filter(f => !f.includes(`${path.sep}lib${path.sep}`) && path.basename(f) !== 'validate-architecture.mjs');
let launchOk = true;
for (const f of scripts) {
  const src = fs.readFileSync(f, 'utf-8');
  if (/chromium\.launch\s*\(/.test(src)) {
    fail(`${path.relative(ROOT, f)} calls chromium.launch() (use scripts/lib/browser.mjs)`);
    launchOk = false;
  }
}
if (launchOk) pass('browser scripts launch through scripts/lib/browser.mjs');

// 4. Core modules
const bus = read(path.join(SRC, 'core/EventBus.js'));
const n = bus ? (bus.match(/[A-Z_]+\s*:\s*['"][a-z]+:[A-Za-z_]+['"]/g) || []).length : 0;
if (n > 0) pass(`EventBus events defined (${n})`);
else fail('EventBus has no event constants');
for (const f of ['core/Constants.js', 'core/Assets.js', 'core/Debug.js', 'core/SaveData.js']) {
  if (read(path.join(SRC, f))) pass(`src/${f} exists`);
  else fail(`src/${f} missing`);
}

// 5. SaveData storage access is guarded
const save = read(path.join(SRC, 'core/SaveData.js'));
if (save) {
  const body = stripComments(save);
  const uses = (body.match(/localStorage\.\w+\(/g) || []).length;
  const tries = (body.match(/\btry\s*\{/g) || []).length;
  if (uses > 0 && tries >= uses) pass(`SaveData: ${uses} localStorage call(s), ${tries} try block(s)`);
  else fail(`SaveData: ${uses} localStorage call(s) but only ${tries} try block(s)`);
}

// 6. Tunables in the sim (warn only)
const allowed = new Set([0, 1, 2, 3, 4, 5, 10, 16, 32, 60, 100, 1000, 0.5, 0.25, 0.75, -1]);
const hits = [];
for (const f of simFiles) {
  if (['Rng.js', 'SpatialHash.js', 'DetMath.js'].includes(path.basename(f))) continue; // math kernels, not tunables
  const lines = fs.readFileSync(f, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('import ')) return;
    const code = t.replace(/(['"`]).*?\1/g, '').replace(/\/\/.*$/, '');
    for (const m of code.matchAll(/(?<![\w.])(\d+\.?\d*)(?![\w.])/g)) {
      const v = parseFloat(m[1]);
      if (allowed.has(v) || (v > 0 && v < 1) || /0x/.test(m[0])) continue;
      hits.push(`  src/sim/${path.basename(f)}:${i + 1}  ${t}`);
    }
  });
}
if (hits.length) {
  warn(`possible tunables in src/sim/ (move to Constants.js):\n${hits.slice(0, 15).join('\n')}${hits.length > 15 ? `\n  ... and ${hits.length - 15} more` : ''}`);
} else {
  console.log('[INFO] no magic numbers in src/sim/');
}

console.log(`\nResults: ${passed}/${passed + failed} passed, ${failed} failed, ${warnings} warning${warnings !== 1 ? 's' : ''}`);
process.exit(failed > 0 ? 1 : 0);
