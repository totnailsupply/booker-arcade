// Craps browser check: real clicks/keys on the table, fixed dice through the
// scene's roll queue (scene.queueRolls — the same hook ?debug=1 exposes as
// __CASINO__.force.craps), and exact wallet deltas for every settlement.
//
// Sequences: pass + field, come-out 6, odds (rounding, cap, undo, clear),
// leave refused while the pass bet works, roll 4 (no action), roll 6 (pass +
// odds win), rebet, point 8 then seven out, Yo 11 (big-win banner), bar 12
// push on Don't Pass, then leaving with a prop bet refunds it.

export const name = 'Craps';

const SPOT = {
  pass: { x: 445, y: 550 }, dontPass: { x: 529, y: 476 }, field: { x: 529, y: 406 },
  odds: { x: 772, y: 550 }, any7: { x: 974, y: 361 }, anyCraps: { x: 974, y: 453 }, yo: { x: 974, y: 547 },
};
// chip tray centred at x 410: chips 1, 5, 25, 100, 500
const CHIP = { 1: 258, 5: 334, 25: 410, 100: 486, 500: 562 };
const CHIP_Y = 664;

export default async function crapsCheck(page, h) {
  await h.openGame('Craps');
  await h.step(500);
  const G = (fn, a) => h.evaluate(fn, a);
  const queue = (rolls) => G((r) => window.__GAME__.scene.getScene('Craps').queueRolls(r), rolls);
  const game = async () => (await h.readState()).game;
  const bal = async () => (await h.readState()).balance;
  const chip = async (v) => { await h.clickAt(CHIP[v], CHIP_Y); };
  const click = async (k, button) => { await h.clickAt(SPOT[k].x, SPOT[k].y, button ? { button } : undefined); await h.step(60); };
  const roll = async () => {
    const before = (await game()).rounds;
    await h.pressKey('Space');
    const st = await h.waitFor(s => s.game && !s.game.rolling && s.game.queued === 0, 9000, 200);
    return { st, rounds: st.game.rounds - before };
  };

  let g = await game();
  h.assert(g.phase === 'comeout' && g.puck === 'off', `starts on the come-out (${g.phase})`);
  h.assert(g.phaseLine === 'Come-out roll — bet the Pass Line', `phase line: ${g.phaseLine}`);
  const b0 = await bal();

  // Roll with nothing on the table: refused
  await h.pressKey('Space');
  h.assert(!(await game()).rolling, 'no roll without a bet');

  // --- pass 10 + field 5 by clicking ---
  await chip(5);
  await click('pass'); await click('pass'); await click('field');
  g = await game();
  h.assert(g.bets.pass === 10 && g.bets.field === 5, `bets placed ${JSON.stringify(g.bets)}`);
  h.assert((await bal()) === b0 - 15, 'chips left the balance');
  // odds before a point: refused
  await click('odds');
  h.assert((await game()).bets.odds === 0, 'no odds on the come-out');

  // --- come-out 6: point set, field loses ---
  await queue([[2, 4]]);
  let r = await roll();
  g = r.st.game;
  h.assert(g.total === 6 && g.phase === 'point' && g.point === 6 && g.puck === 'on', `point 6 set (${g.phase} ${g.point} ${g.puck})`);
  h.assert(g.dice[0] === 2 && g.dice[1] === 4, `dice land on the result ${g.dice}`);
  h.assert(r.rounds === 1 && g.last.wagered === 5 && g.last.paid === 0, `field settled alone ${JSON.stringify(g.last)}`);
  h.assert(g.bets.pass === 10 && g.bets.field === 0 && r.st.inPlay === 10, 'pass stays working');
  h.assert((await bal()) === b0 - 15, 'balance after field loss');
  h.assert(g.phaseLine === 'Point is 6 — roll a 6 before a 7', `phase line: ${g.phaseLine}`);
  h.assert(g.lastRolls[0] === 6, 'history');

  // pass can't be added to or taken down now
  await click('pass');
  await click('pass', 'right');
  h.assert((await game()).bets.pass === 10, 'pass locked while the point is on');

  // --- odds: 1 chip rounds up to 5 (6 pays 6:5), 25 more caps at 3x = 30 ---
  await chip(1);
  await click('odds');
  h.assert((await game()).bets.odds === 5, `odds rounded up to 5 (${(await game()).bets.odds})`);
  await chip(25);
  await click('odds');
  h.assert((await game()).bets.odds === 30, `odds capped at 30 (${(await game()).bets.odds})`);
  await click('odds');
  h.assert((await game()).bets.odds === 30, 'odds over 3x refused');
  await click('odds', 'right');
  h.assert((await game()).bets.odds === 5, 'right-click takes the last odds chip down');
  await h.pressKey('c');
  g = await game();
  h.assert(g.bets.odds === 0 && g.bets.pass === 10, 'Clear takes odds down, pass stays');
  h.assert((await bal()) === b0 - 15, 'odds refunds are exact');
  await click('odds');
  h.assert((await game()).bets.odds === 25, 'odds 25');

  // leaving is refused while the pass bet works
  const left = await h.backToLobby();
  h.assert(!left && (await h.readState()).scene === 'Craps', 'cannot leave with a working pass bet');

  // --- roll 4: no action ---
  await queue([[1, 3]]);
  r = await roll();
  h.assert(r.rounds === 0 && r.st.game.bets.pass === 10 && r.st.game.bets.odds === 25 && r.st.game.point === 6, 'roll 4 = no action');
  h.assert((await bal()) === b0 - 40, 'no money moves on a no-action roll');

  // --- roll 6: pass 10 pays 20, odds 25 pays 25 + 30 ---
  await queue([[3, 3]]);
  r = await roll();
  g = r.st.game;
  h.assert(g.phase === 'comeout' && g.puck === 'off', 'point made, puck off');
  h.assert(g.last.wagered === 35 && g.last.paid === 75, `pass + odds settled ${JSON.stringify(g.last)}`);
  h.assert((await bal()) === b0 + 35, `balance after point made (${(await bal()) - b0})`);
  h.assert(r.st.inPlay === 0, 'nothing in play');

  // --- Rebet restores pass 10 + field 5; point 8 then seven out ---
  await h.pressKey('r');
  g = await game();
  h.assert(g.bets.pass === 10 && g.bets.field === 5 && g.bets.odds === 0, `rebet ${JSON.stringify(g.bets)}`);
  await queue([[4, 4]]);
  r = await roll();
  h.assert(r.st.game.point === 8 && r.st.game.phaseLine === 'Point is 8 — roll an 8 before a 7', 'point 8');
  await chip(5);
  await click('odds');
  h.assert((await game()).bets.odds === 5, 'odds 5 on 8');
  await queue([[3, 4]]);
  r = await roll();
  g = r.st.game;
  h.assert(g.phase === 'comeout' && g.total === 7 && g.last.wagered === 15 && g.last.paid === 0, `seven out ${JSON.stringify(g.last)}`);
  h.assert((await bal()) === b0 + 35 - 20, `balance after seven out (${(await bal()) - b0})`);
  h.assert(g.lastRolls.slice(0, 3).join(',') === '7,8,6', `history ${g.lastRolls}`);

  // --- Yo 11: 5 pays 80, big-win banner ---
  await click('yo');
  await queue([[5, 6]]);
  await h.pressKey('Space');
  const bst = await h.waitFor(s => s.game.banner, 6000, 100);
  h.assert(bst.game.banner === 'big', `yo banner (${bst.game.banner})`);
  await h.clickAt(640, 360); await h.clickAt(640, 360);
  r = { st: await h.waitFor(s => !s.game.rolling && !s.game.banner, 9000, 200) };
  await h.step(400); // the banner's dim layer fades out (still catches clicks)
  g = r.st.game;
  h.assert(g.last.wagered === 5 && g.last.paid === 80, `yo paid ${JSON.stringify(g.last)}`);
  h.assert((await bal()) === b0 + 15 + 75, `balance after yo (${(await bal()) - b0})`);

  // --- Don't Pass bar 12: push ---
  await click('dontPass');
  await queue([[6, 6]]);
  r = await roll();
  g = r.st.game;
  h.assert(g.last.wagered === 5 && g.last.paid === 5 && g.last.outcome === 'push', `bar 12 push ${JSON.stringify(g.last)}`);
  h.assert((await bal()) === b0 + 90, 'push returns the stake');

  // --- props on the come-out come back when leaving ---
  await click('any7');
  await click('anyCraps');
  h.assert((await bal()) === b0 + 80, 'two props placed');
  h.assert(await h.backToLobby(), 'can leave with only props on the table');
  const st = await h.readState();
  h.assert(st.balance === b0 + 90 && st.inPlay === 0, `props refunded on leave (${st.balance - b0}, in play ${st.inPlay})`);
  h.log(`craps: net +${st.balance - b0} over the scripted hands`);
}
