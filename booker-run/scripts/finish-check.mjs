#!/usr/bin/env node
// Jumping or gliding OVER the finish must still complete the level.
//
// The steak's hitbox is only ~34 px tall (42 for the golden steak), so a held
// jump 70-110 px before it clears it, and on Levels 3+ a glide does too.
// RunScene completes the level once Booker passes finishX, and the last ground
// runs a screen past the level end. For each level this starts near the finish
// (deterministic) and, from a range of take-off points:
//   - jump: press and hold 380 ms (a full jump)
//   - glide (Levels 3+): press and keep holding
// Every trial must complete with no death, and at least one trial per level
// must be a real over-jump (Booker passes finishX without touching the steak),
// so the check proves the case it is about.
//
// Usage: node scripts/finish-check.mjs [--url http://localhost:3000] [--levels 1,2,3,4,5,6]

import { launchBrowser } from './lib/browser.mjs';
import { openDetPage } from './lib/det.mjs';
import { LEVELS } from '../src/levels/index.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const base = opt('--url', 'http://localhost:3000');
const levels = opt('--levels', '1,2,3,4,5,6').split(',').map(Number);

const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};

const browser = await launchBrowser();
const errors = [];

for (const n of levels) {
  const entry = LEVELS[n - 1];
  const finishX = entry.data.finishX;
  const glide = entry.abilities.includes('glide');
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(`L${n}: ${String(e)}`));
  await openDetPage(page, `${base}/?level=${n}&x=${finishX - 420}&det=1`);

  const trials = [];
  for (let off = 40; off <= 160; off += 10) trials.push({ kind: 'jump', off, holdMs: 380 });
  if (glide) for (let off = 80; off <= 260; off += 20) trials.push({ kind: 'glide', off, holdMs: Infinity });

  const out = await page.evaluate(({ trials, finishX }) => {
    const game = window.__GAME__;
    const gs = window.__GAME_STATE__;
    const bus = window.__EVENT_BUS__;
    const E = window.__EVENTS__;
    let fin = null;
    bus.on(E.LEVEL_COMPLETE, () => {
      const p = game.scene.getScene('RunScene').player;
      fin = { x: p.sprite.x, feet: 238 - (p.body.y + p.body.height) };
    });
    const results = [];
    for (const t of trials) {
      let run = game.scene.getScene('RunScene');
      run.retry();                // fresh attempt at the same debug start
      window.__DET__.step(2);
      run = game.scene.getScene('RunScene');
      fin = null;
      const deaths0 = gs.deathLog.length;
      let pressedAt = null;
      let frames = 0;
      let maxFeet = 0;
      for (; frames < 900; frames++) {
        const p = run.player;
        if (!p || gs.mode !== 'playing') break;
        maxFeet = Math.max(maxFeet, 238 - (p.body.y + p.body.height));
        if (pressedAt === null && p.sprite.x >= finishX - t.off) {
          window.__RUN__.press();
          pressedAt = frames;
        }
        if (pressedAt !== null && (frames - pressedAt) * (1000 / 60) >= t.holdMs) window.__RUN__.release();
        window.__DET__.step(1);
      }
      window.__RUN__.release();
      results.push({
        ...t,
        mode: gs.mode,
        died: gs.deathLog.length > deaths0,
        cause: gs.deathLog[gs.deathLog.length - 1]?.cause || null,
        fin,
        over: !!fin && fin.x >= finishX,
        maxFeet: Math.round(maxFeet),
      });
    }
    return results;
  }, { trials, finishX });

  const bad = out.filter(r => r.died || r.mode !== 'complete');
  const overs = out.filter(r => r.over);
  check(bad.length === 0,
    `L${n}: all ${out.length} jump${glide ? '/glide' : ''} trials complete`
    + (bad.length ? ` (failed: ${bad.map(r => `${r.kind}@-${r.off} ${r.mode}${r.cause ? ` ${r.cause}` : ''}`).join(', ')})` : ''));
  check(overs.length > 0,
    `L${n}: ${overs.length} trial(s) cleared the steak without touching it (${overs.map(r => `${r.kind}@-${r.off}`).join(', ') || 'none'})`);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.log('page errors:', errors.slice(0, 5));
  fails.push('page errors');
}
console.log(fails.length ? `finish-check: FAILED (${fails.length})` : 'finish-check: PASSED');
process.exit(fails.length ? 1 : 0);
