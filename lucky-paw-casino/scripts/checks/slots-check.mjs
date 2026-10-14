// Slots ("Golden Paw") browser check — run: node scripts/casino-check.mjs --only slots
//
// Reloads with ?debug=1 (the force hook needs it; any Vite HMR socket is mocked
// as a safety net so an edit elsewhere can't reload the page mid-check). Then:
// 15+ Space spins with wallet deltas checked against the pure logic, a bet
// change, slam-stop, Lobby refused mid-spin, a forced 5-of-a-kind (MEGA
// banner), a forced bonus with a retrigger run through every free spin, Auto
// (stopped by a click), and Lobby allowed when idle.
import { evaluateGrid, gridFromStops } from '../../src/games/slots/logic.js';

export const name = 'Slots';

const G = (top, mid, bot) => [0, 1, 2, 3, 4].map(r => [top[r], mid[r], bot[r]]);
const QUIET_TOP = ['bowl', 'hydrant', 'ball', 'soba', 'bowl'];
const QUIET_BOT = ['ball', 'bowl', 'hydrant', 'ball', 'soba'];
const FIVE_BOOKER = G(QUIET_TOP, ['booker', 'booker', 'booker', 'booker', 'booker'], QUIET_BOT);
const TRIGGER = G(['scatter', 'bowl', 'hydrant', 'ball', 'soba'], ['bone', 'ball', 'scatter', 'hydrant', 'bowl'], ['ball', 'bowl', 'ball', 'scatter', 'hydrant']);
const BONE4 = G(QUIET_TOP, ['bone', 'wild', 'bone', 'bone', 'hydrant'], QUIET_BOT);

export default async function slotsCheck(page, h) {
  // --- reload with the debug hook, HMR muted --------------------------------------------
  const url = new URL(page.url());
  url.searchParams.delete('fresh');
  url.searchParams.set('debug', '1');
  url.searchParams.set('seed', '7');
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'lobby', null, { timeout: 20000 });
  await h.step(300);
  await h.evaluate(() => window.__CASINO__.debug.setBalance(5000));
  await h.openGame('Slots');
  // Turbo keeps the run short (same logic, faster presentation)
  if (!(await h.readState()).game.turbo) await h.pressKey('t');
  h.assert((await h.readState()).game.turbo, 'turbo on');

  let st = (await h.readState()).game;
  h.assert(st && st.game === 'slots' && st.phase === 'idle', 'slots scene idle');
  h.assert(st.grid.length === 5 && st.grid.every(c => c.length === 3), 'grid 5x3');
  h.assert(await h.evaluate(() => typeof window.__CASINO__.force?.slots === 'function'), 'force hook with ?debug=1');

  /** Step until the machine is idle; skips banners (click) and cards (Space). */
  async function settleIdle(maxMs = 60000) {
    for (let t = 0; t < maxMs; t += 250) {
      const s = (await h.readState()).game;
      if (s.banner) { await h.clickAt(640, 360); await h.clickAt(640, 360); continue; }
      if (s.card) { await h.pressKey('Space'); continue; }
      if (s.phase === 'idle' && !s.counting && !s.spinning) return s;
      await h.step(250);
    }
    throw new Error('slots never went idle');
  }

  /** Logic check of one finished base spin (no bonus): grid vs stops, win vs logic, wallet delta. */
  function checkSpin(s, before, after, label) {
    if (s.stops) {
      const g = gridFromStops(s.stops);
      h.assert(JSON.stringify(g) === JSON.stringify(s.grid), `${label}: reels landed on the logic's stops`);
    }
    const ev = evaluateGrid(s.grid, { lineBet: s.lineBet });
    h.assert(ev.win === s.lastWin, `${label}: win ${s.lastWin} == logic ${ev.win}`);
    h.assert(after - before === s.lastWin - s.totalBet, `${label}: wallet delta ${after - before} == ${s.lastWin} - ${s.totalBet}`);
  }

  // --- 15 spins with Space ----------------------------------------------------------------
  let wins = 0;
  for (let i = 0; i < 15; i++) {
    const before = (await h.wallet()).balance;
    const r0 = (await h.readState()).stats.games.slots.rounds;
    await h.pressKey('Space');
    st = (await h.readState()).game;
    h.assert(st.spinning, `spin ${i + 1} started`);
    h.assert((await h.wallet()).inPlay === st.totalBet, 'stake in play while spinning');
    let bonus = false;
    for (let t = 0; t < 60000; t += 250) {
      const s = (await h.readState()).game;
      if (s.phase === 'freespins') bonus = true;
      if (s.phase === 'idle' && !s.counting && !s.spinning && !s.card && !s.banner) break;
      if (s.banner) { await h.clickAt(640, 360); await h.clickAt(640, 360); continue; }
      if (s.card) { await h.pressKey('Space'); continue; }
      await h.step(250);
    }
    st = (await h.readState()).game;
    const after = (await h.wallet()).balance;
    const r1 = (await h.readState()).stats.games.slots.rounds;
    h.assert(r1 === r0 + 1, `spin ${i + 1} booked one round`);
    if (bonus) {
      h.assert(after - before === st.roundWin - st.totalBet, `natural bonus: delta ${after - before} == ${st.roundWin} - ${st.totalBet}`);
      h.log(`spin ${i + 1}: natural bonus, ${st.freeSpinsPlayed} free spins, round win ${st.roundWin}`);
    } else {
      checkSpin(st, before, after, `spin ${i + 1}`);
    }
    if (st.lastWin > 0) wins++;
  }
  h.log(`15 spins: ${wins} winning, balance ${(await h.wallet()).balance}`);

  // --- bet change ----------------------------------------------------------------------------
  await h.pressKey('ArrowUp');
  st = (await h.readState()).game;
  h.assert(st.lineBet === 2 && st.totalBet === 20, `Up raises the line bet (got ${st.lineBet} / ${st.totalBet})`);
  for (let i = 0; i < 6; i++) await h.pressKey('ArrowUp');
  st = (await h.readState()).game;
  const max = (await h.readState()).maxBet;
  h.assert(st.totalBet <= max, `total bet ${st.totalBet} capped by the table limit ${max}`);
  await h.pressKey('ArrowDown');
  await h.pressKey('ArrowDown');
  st = (await h.readState()).game;
  const bet2 = st.totalBet;
  {
    const before = (await h.wallet()).balance;
    await h.pressKey('Space');
    st = await settleIdle();
    checkSpin(st, before, (await h.wallet()).balance, `bet ${bet2} spin`);
  }

  // --- slam stop (and Lobby refused mid-spin) ---------------------------------------------------
  {
    const before = (await h.wallet()).balance;
    await h.pressKey('Space');
    await h.step(120);
    await h.pressKey('Escape');
    let s = await h.readState();
    h.assert(s.mode === 'game' && s.scene === 'Slots', 'Lobby refused mid-spin');
    h.assert(s.game.spinning, 'still spinning after Esc');
    await h.pressKey('Space'); // slam
    let ms = 0;
    for (; ms < 2000; ms += 50) {
      s = await h.readState();
      if (!s.game.spinning) break;
      await h.step(250);
    }
    h.assert(ms <= 800, `slam stopped all reels in ${ms} ms`);
    st = await settleIdle();
    checkSpin(st, before, (await h.wallet()).balance, 'slammed spin');
  }

  // back to line bet 1 for the forced outcomes
  for (let i = 0; i < 8; i++) await h.pressKey('ArrowDown');
  st = (await h.readState()).game;
  h.assert(st.lineBet === 1, 'line bet back to 1');

  // --- forced 5 of a kind -> MEGA banner ----------------------------------------------------------
  {
    const before = (await h.wallet()).balance;
    await h.evaluate((g) => window.__CASINO__.force.slots(g), FIVE_BOOKER);
    await h.pressKey('Space');
    const s = await h.waitFor(x => x.game.banner === 'mega', 20000);
    h.assert(s.game.lines.some(l => l.symbol === 'booker' && l.count === 5 && l.line === 1), '5x Booker on line 1');
    st = await settleIdle();
    checkSpin(st, before, (await h.wallet()).balance, '5 of a kind');
    h.assert(st.lastWin === 500, `5x Booker pays 500 on line bet 1 (got ${st.lastWin})`);
  }

  // --- forced bonus with a retrigger, run through every free spin -------------------------------
  {
    const before = (await h.wallet()).balance;
    const r0 = (await h.readState()).stats.games.slots.rounds;
    // trigger, then free spin 1 retriggers, free spin 2 is a 4x bone line (x2)
    await h.evaluate((a) => window.__CASINO__.force.slots(...a), [TRIGGER, TRIGGER, BONE4]);
    await h.pressKey('Space');
    const trig = await h.waitFor(x => x.game.card === 'intro', 20000);
    h.assert(trig.game.phase === 'freespins', 'bonus phase');
    h.assert(trig.game.scatters === 3, 'three Star Tags');
    const trigWin = trig.game.lastWin;
    h.assert(trigWin === evaluateGrid(TRIGGER, { lineBet: 1 }).win, `trigger spin pays the logic win (${trigWin})`);
    h.assert((await h.wallet()).inPlay === 10, 'round stays open through the bonus');
    // Lobby refused during free spins
    await h.pressKey('Escape');
    h.assert((await h.readState()).scene === 'Slots', 'Lobby refused during free spins');
    const boneFree = evaluateGrid(BONE4, { lineBet: 1, free: true }).win;
    h.assert(boneFree === 2 * evaluateGrid(BONE4, { lineBet: 1 }).win, 'free-spin wins are x2');
    let sawBone = false;
    let maxPlayed = 0;
    for (let t = 0; t < 180000; t += 250) {
      const s = (await h.readState()).game;
      maxPlayed = Math.max(maxPlayed, s.freeSpinsPlayed);
      if (s.phase === 'freespins' && s.freeSpinsPlayed === 2 && !s.spinning && s.lastWin === boneFree) sawBone = true;
      if (s.phase === 'idle' && !s.counting && !s.card && !s.banner) break;
      if (s.banner) { await h.clickAt(640, 360); await h.clickAt(640, 360); continue; }
      if (s.card) { await h.pressKey('Space'); continue; }
      await h.step(250);
    }
    st = (await h.readState()).game;
    const after = (await h.wallet()).balance;
    h.assert(maxPlayed === 16 && st.freeSpinsPlayed === 16, `8 + 8 retriggered free spins played (got ${st.freeSpinsPlayed})`);
    h.assert(sawBone, `free spin 2 (4x bone + 3x ball) paid x2 = ${boneFree}`);
    h.assert(st.roundWin === trigWin + st.freeSpinTotal, `round win ${st.roundWin} = trigger ${trigWin} + free spins ${st.freeSpinTotal}`);
    h.assert(after - before === st.roundWin - 10, `bonus wallet delta ${after - before} == ${st.roundWin} - 10`);
    const r1 = (await h.readState()).stats.games.slots.rounds;
    h.assert(r1 === r0 + 1, 'the whole bonus is booked as one round');
    h.assert((await h.wallet()).inPlay === 0, 'nothing in play after the bonus');
    h.log(`bonus: ${st.freeSpinsPlayed} free spins, free-spin total ${st.freeSpinTotal}, round ${st.roundWin}`);
  }

  // --- Auto, stopped by a click -------------------------------------------------------------------
  {
    const r0 = (await h.readState()).stats.games.slots.rounds;
    await h.pressKey('a');
    st = (await h.readState()).game;
    h.assert(st.auto === 9 && st.spinning, `auto started (auto ${st.auto})`);
    await h.waitFor(x => x.stats.games.slots.rounds >= r0 + 3, 30000);
    await h.clickAt(640, 330); // any click stops auto
    st = (await h.readState()).game;
    h.assert(st.auto === 0, 'a click stops auto');
    st = await settleIdle();
    const r1 = (await h.readState()).stats.games.slots.rounds;
    h.assert(r1 >= r0 + 3 && r1 <= r0 + 5, `auto played ${r1 - r0} spins then stopped`);
    await h.step(1500);
    h.assert((await h.readState()).stats.games.slots.rounds === r1, 'no more spins after the click');
  }

  // --- leave when idle ------------------------------------------------------------------------------
  const w = await h.wallet();
  h.assert(w.conservationError === 0 && w.inPlay === 0, 'books balance, nothing in play');
  h.assert(await h.backToLobby(), 'Lobby allowed when idle');
}
