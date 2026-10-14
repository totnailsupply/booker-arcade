#!/usr/bin/env node
// =============================================================================
// validate-architecture.mjs — static checks for Lucky Paw Casino's structure.
//
//   node scripts/validate-architecture.mjs        exit 1 on any FAIL
//
// FAIL rules
//   1. Pure modules never import Phaser: core/{Constants,EventBus,Rng,Wallet,Save,Casino}.js
//      and every src/games/<g>/logic.js (+ any *logic*.js / rules*.js there).
//   2. Chips only change through the wallet: no code outside core/Wallet.js writes
//      `balance =`, `.s.balance`, or calls a private wallet field.
//   3. EventBus hygiene: every Events.X used in src/ exists in core/EventBus.js;
//      every eventBus.on(...) outside audio/AudioBridge.js / core/ has a matching
//      off() or uses listen() (scene/object-bound).
//   4. render_game_to_text, advanceTime and __CASINO__ are defined in main.js.
//   5. Every game scene file extends BaseGameScene and the five scene keys are registered.
//   6. Browser scripts launch Chromium only through scripts/lib/browser.mjs
//      (no chromium.launch( in scripts/).
//   7. No `pixelArt: true` in the game config (per-texture NEAREST instead).
// WARN rules
//   - Math.random() in game logic (use rng.stream(id) so ?seed=N replays)
//   - scene.events.on(...) without a matching off/once (listeners pile up across restarts)
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
let failed = 0;
let warned = 0;
let passed = 0;
const pass = (m) => { passed++; console.log(`[PASS] ${m}`); };
const fail = (m) => { failed++; console.log(`[FAIL] ${m}`); };
const warn = (m) => { warned++; console.log(`[WARN] ${m}`); };

function walk(dir, ext = '.js') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFileSync(p, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const files = walk(SRC);
const code = Object.fromEntries(files.map(f => [f, stripComments(read(f))]));

console.log('=== Lucky Paw Casino architecture ===\n');

// 1. Pure modules
const pure = ['core/Constants.js', 'core/EventBus.js', 'core/Rng.js', 'core/Wallet.js', 'core/Save.js', 'core/Casino.js'].map(f => path.join(SRC, f));
for (const f of files) {
  const r = rel(f);
  if (/src\/games\/[^/]+\/(logic|rules|.*logic.*)\.js$/.test(r)) pure.push(f);
}
let pureOk = true;
for (const f of pure) {
  if (!fs.existsSync(f)) { fail(`missing ${rel(f)}`); pureOk = false; continue; }
  if (/from\s+['"]phaser['"]|require\(['"]phaser['"]\)/.test(code[f] ?? read(f))) { fail(`${rel(f)} imports Phaser (must stay node-importable)`); pureOk = false; }
}
if (pureOk) pass(`pure modules stay Phaser-free (${pure.length} files)`);

// 2. Wallet is the only place chips change
let walletOk = true;
for (const f of files) {
  if (f.endsWith(path.join('core', 'Wallet.js'))) continue;
  const c = code[f];
  if (/wallet\s*\.\s*s\s*\./.test(c) || /\.s\.balance/.test(c) || /wallet\.balance\s*[+\-*/]?=(?!=)/.test(c)) {
    fail(`${rel(f)} touches wallet internals / assigns the balance (use bet/pay/refund)`);
    walletOk = false;
  }
}
if (walletOk) pass('only Wallet.js changes the balance');

// 3. EventBus hygiene
const busSrc = read(path.join(SRC, 'core/EventBus.js'));
const defined = new Set([...busSrc.matchAll(/^\s+([A-Z_]+):\s*'/gm)].map(m => m[1]));
let evOk = true;
for (const f of files) {
  for (const m of code[f].matchAll(/(?<![.\w])Events\.([A-Z_]+)/g)) {
    if (!defined.has(m[1])) { fail(`${rel(f)} uses undefined Events.${m[1]}`); evOk = false; }
  }
}
if (evOk) pass(`all Events.* references exist (${defined.size} events)`);
let leakOk = true;
for (const f of files) {
  const r = rel(f);
  if (r.endsWith('audio/AudioBridge.js') || r.includes('/core/')) continue; // global, initialised once
  const c = code[f];
  const ons = [...c.matchAll(/eventBus\.on\(\s*([\w.]+)/g)].map(m => m[1]);
  for (const ev of ons) {
    const offRe = new RegExp(`eventBus\\.off\\(\\s*${ev.replace('.', '\\.')}`);
    if (!offRe.test(c)) { fail(`${r}: eventBus.on(${ev}) without eventBus.off (use listen(this, ...))`); leakOk = false; }
  }
}
if (leakOk) pass('EventBus listeners are scene/object-bound (listen()) or removed');

// 4. main.js hooks
const main = read(path.join(SRC, 'main.js'));
for (const hook of ['render_game_to_text', 'advanceTime', '__CASINO__']) {
  if (main.includes(`window.${hook}`)) pass(`main.js defines window.${hook}`);
  else fail(`main.js is missing window.${hook}`);
}

// 5. Game scenes
const cfg = read(path.join(SRC, 'core/GameConfig.js'));
for (const [id, Name] of [['plinko', 'Plinko'], ['blackjack', 'Blackjack'], ['craps', 'Craps'], ['roulette', 'Roulette'], ['slots', 'Slots']]) {
  const f = path.join(SRC, 'games', id, `${Name}Scene.js`);
  if (!fs.existsSync(f)) { fail(`missing src/games/${id}/${Name}Scene.js`); continue; }
  const c = read(f);
  if (!/extends\s+BaseGameScene/.test(c)) fail(`${Name}Scene does not extend BaseGameScene`);
  else if (!new RegExp(`super\\(\\s*['"]${Name}['"]`).test(c)) fail(`${Name}Scene must call super('${Name}', ...)`);
  else if (!cfg.includes(`${Name}Scene`)) fail(`${Name}Scene not registered in GameConfig`);
  else pass(`${Name}Scene extends BaseGameScene with key '${Name}'`);
  for (const g of walk(path.join(SRC, 'games', id))) {
    if (/Math\.random\(/.test(code[g] ?? '')) warn(`${rel(g)} uses Math.random() (use this.rng / rng.stream('${id}') for ?seed replays)`);
  }
}

// 6. Browser launcher
let launchOk = true;
for (const f of [...walk(path.join(ROOT, 'scripts'), '.mjs'), ...walk(path.join(ROOT, 'scripts'), '.js')]) {
  if (f.includes(`${path.sep}lib${path.sep}`) || f.endsWith('validate-architecture.mjs')) continue;
  if (/chromium\.launch\(/.test(stripComments(read(f)))) { fail(`${rel(f)} calls chromium.launch() (use scripts/lib/browser.mjs)`); launchOk = false; }
}
if (launchOk) pass('scripts launch Chromium through scripts/lib/browser.mjs');

// 7. No global pixelArt
if (/pixelArt:\s*true/.test(cfg)) fail('GameConfig sets pixelArt: true (use per-texture NEAREST)');
else pass('no global pixelArt (text stays smooth)');

// WARN: scene.events.on without cleanup
for (const f of files) {
  const c = code[f];
  for (const m of c.matchAll(/this\.events\.on\(\s*['"](\w+)['"]/g)) {
    if (!new RegExp(`this\\.events\\.off\\(\\s*['"]${m[1]}['"]`).test(c)) warn(`${rel(f)}: this.events.on('${m[1]}') without off (piles up on restart)`);
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${warned} warnings`);
process.exit(failed ? 1 : 0);
