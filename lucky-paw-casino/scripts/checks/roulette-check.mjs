// Roulette browser check: place chips by clicking the layout, Undo / right-click /
// Clear / Rebet / Double, spin (Space), skip the ball, verify every payout against
// the rules module, leave refused while spinning, unplayed chips refunded on leave.
// The next result is predicted from a clone of the game's RNG stream (the spin
// draws exactly one rng.int(37)), so no debug hook is needed; with ?debug=1 the
// __CASINO__.force.roulette hook is exercised too.
import { settleBets, totalOf, colorOf } from '../../src/games/roulette/logic.js';

export const name = 'Roulette';

const TRAY_X = 470;
const chipX = (i) => TRAY_X - 184 + 32 + i * 76; // tray chips 1, 5, 25, 100, 500
const BTN = { undo: [730, 660], clear: [822, 660], rebet: [914, 660], double: [1006, 660], spin: [1172, 660] };

export default async function rouletteCheck(page, h) {
  const game = async () => (await h.readState()).game;
  const center = (id) => h.evaluate((i) => window.__GAME__.scene.getScene('Roulette').cellCenter(i), id);
  const predict = () => h.evaluate(() => {
    const r = window.__GAME__.scene.getScene('Roulette').rng;
    const c = Object.assign(Object.create(Object.getPrototypeOf(r)), r);
    return c.int(37);
  });
  const clickCell = async (id, opts) => { const c = await center(id); await h.clickAt(c.x, c.y, opts); };
  const books = async (msg) => {
    const w = await h.wallet();
    h.assert(w.conservationError === 0, `${msg}: wallet books off by ${w.conservationError}`);
    return w;
  };
  const dozenOf = (n) => (n === 0 ? 'dozen1' : `dozen${Math.ceil(n / 12)}`);
  const colOf = (n) => (n === 0 ? 'col1' : `col${((n - 1) % 3) + 1}`);

  await h.openGame('Roulette');
  let st = await h.readState();
  h.assert(st.game.phase === 'betting' && st.game.totalBet === 0, 'opens in betting with an empty layout');
  const max = st.maxBet;

  // --- pick the 5 chip, place a straight, red, a dozen and a column -----------------
  await h.clickAt(chipX(1), 664);
  h.assert((await game()).chip === 5, 'tray picked 5');
  let n = await predict();
  const b0 = (await h.readState()).balance;
  const ids = [String(n), 'red', dozenOf(n), colOf(n)];
  for (const id of ids) await clickCell(id);
  st = await h.readState();
  h.assert(st.game.totalBet === 20 && st.balance === b0 - 20, `4 chips of 5 placed (total ${st.game.totalBet}, balance ${st.balance})`);
  for (const id of ids) h.assert(st.game.bets[id] === 5, `bet on ${id}`);

  // right-click takes back that cell's chip; Undo takes back the last action
  await clickCell(colOf(n), { button: 'right' });
  st = await h.readState();
  h.assert(!st.game.bets[colOf(n)] && st.balance === b0 - 15, `right-click undo (balance ${st.balance})`);
  await clickCell(colOf(n));
  await clickCell('red');
  h.assert((await game()).bets.red === 10, 'stacked a second chip on red');
  await h.clickAt(...BTN.undo);
  st = await h.readState();
  h.assert(st.game.bets.red === 5 && st.balance === b0 - 20, `Undo button removed the last chip (red ${st.game.bets.red})`);
  // Clear refunds everything
  await h.clickAt(...BTN.clear);
  st = await h.readState();
  h.assert(st.game.totalBet === 0 && st.balance === b0 && st.inPlay === 0, `Clear refunds all (balance ${st.balance})`);
  await books('after clear');

  // table limit: the total of all bets on one spin
  await h.clickAt(chipX(3), 664); // 100
  await clickCell('black');
  await clickCell('red');
  st = await h.readState();
  h.assert(st.game.totalBet === Math.min(100, max) && st.game.bets.black === 100 && !st.game.bets.red, `table limit ${max} applies to the total (total ${st.game.totalBet})`);
  await h.pressKey('c');
  h.assert((await game()).totalBet === 0, 'C clears');

  // --- round 1: place, spin, refuse to leave, skip, verify the payout -----------------
  await h.clickAt(chipX(1), 664);
  for (const id of ids) await clickCell(id);
  const bets1 = (await game()).bets;
  const before1 = (await h.readState()).balance;
  await h.pressKey('Space');
  st = await h.readState();
  h.assert(st.game.phase === 'spinning' && st.game.spinning, 'Space spins');
  h.assert(st.game.marquee === 'NO MORE BETS', 'marquee calls no more bets');
  await clickCell('black'); // bets are closed: this click only skips the ball
  st = await h.readState();
  h.assert(!st.game.bets.black, 'no bets while spinning');
  h.assert(!st.game.spinning, 'click skipped the ball');
  h.assert(!(await h.backToLobby()), 'leave refused while the round runs');
  st = await h.readState();
  h.assert(st.scene === 'Roulette', 'still at the table');
  st = await h.waitFor(s => s.game?.phase === 'result', 6000, 200);
  const want1 = settleBets(bets1, n);
  h.assert(st.game.lastNumber === n, `result ${st.game.lastNumber} = predicted ${n}`);
  h.assert(st.game.lastColor === colorOf(n), 'colour reported');
  h.assert(st.balance === before1 + want1.paid && before1 === b0 - 20, `wallet delta: ${st.balance} = ${b0} - 20 + ${want1.paid}`);
  h.assert(st.game.history[0] === n && st.game.totalBet === 0 && st.inPlay === 0, 'layout cleared, history updated');
  h.assert(st.game.banner === 'win' || st.game.banner === 'big' || st.game.banner === 'mega', `straight hit shows the banner (${st.game.banner})`);
  h.log(`round 1: ${n} ${colorOf(n)}, paid ${want1.paid} on 20`);
  await books('after round 1');
  await h.step(3500); // banner gone
  await h.clickAt(640, 690);

  // --- Rebet + Double + Undo of the double ---------------------------------------------
  await h.pressKey('r');
  st = await h.readState();
  h.assert(JSON.stringify(st.game.bets) === JSON.stringify(bets1) && st.game.totalBet === 20, 'Rebet restores the last layout');
  await h.clickAt(...BTN.double);
  st = await h.readState();
  h.assert(st.game.totalBet === 40 && Object.values(st.game.bets).every(v => v === 10), `Double doubles every bet (${st.game.totalBet})`);
  await h.pressKey('z');
  st = await h.readState();
  h.assert(st.game.totalBet === 20, 'Undo takes the whole double back');
  await h.pressKey('d');
  h.assert((await game()).totalBet === 40, 'D doubles');
  await books('rebet/double');

  // --- round 2: the full animation (no skip) ---------------------------------------
  n = await predict();
  let bets = (await game()).bets;
  let before = (await h.readState()).balance;
  await h.clickAt(...BTN.spin);
  st = await h.waitFor(s => s.game?.phase === 'result', 9000, 250);
  let want = settleBets(bets, n);
  h.assert(st.game.lastNumber === n && st.balance === before + want.paid, `full spin pays ${want.paid} on ${n} (balance ${st.balance})`);
  await books('round 2');

  // --- force hook (only with ?debug=1) --------------------------------------------------
  const hasForce = await h.evaluate(() => !!window.__CASINO__.force?.roulette);
  if (hasForce) {
    await h.evaluate(() => window.__CASINO__.force.roulette(0));
    await h.pressKey('r');
    bets = (await game()).bets;
    before = (await h.readState()).balance;
    await h.pressKey('Space');
    await h.pressKey('Space');
    st = await h.waitFor(s => s.game?.phase === 'result', 6000, 200);
    want = settleBets(bets, 0);
    h.assert(st.game.lastNumber === 0 && st.balance === before + want.paid, 'forced zero');
  } else {
    h.log('force hook needs ?debug=1 (skipped)');
  }

  // --- more rounds: mixed layouts, rebet, skip ----------------------------------------
  const layouts = [
    { black: 5, odd: 5, high: 5 },
    { 0: 1, 32: 1, 15: 1, 19: 1, 26: 1 },
    { dozen3: 25, col2: 5 },
    { red: 25, black: 25 },
    { low: 5, even: 5, 7: 5, 36: 5 },
    { dozen1: 5, dozen2: 5, dozen3: 5 },
    { 17: 5, red: 5 },
    { col1: 5, col3: 5, 0: 5 },
  ];
  const CHIP_INDEX = { 1: 0, 5: 1, 25: 2 };
  let rounds = 2;
  for (const lay of layouts) {
    for (const [id, amount] of Object.entries(lay)) {
      await h.clickAt(chipX(CHIP_INDEX[amount]), 664);
      await clickCell(id);
    }
    bets = (await game()).bets;
    h.assert(totalOf(bets) === totalOf(lay), `layout placed ${JSON.stringify(bets)}`);
    n = await predict();
    before = (await h.readState()).balance;
    await h.pressKey('Space');
    await h.step(400);
    await h.pressKey('Space'); // skip
    st = await h.waitFor(s => s.game?.phase === 'result', 6000, 200);
    want = settleBets(bets, n);
    h.assert(st.game.lastNumber === n && st.balance === before + want.paid, `round ${rounds + 1}: ${n} pays ${want.paid} (balance ${st.balance}, expected ${before + want.paid})`);
    await books(`round ${rounds + 1}`);
    rounds++;
    if (st.game.banner) { await h.step(3500); await h.clickAt(640, 690); }
  }
  st = await h.readState();
  h.assert(st.game.rounds >= 10 && st.game.history.length >= 10, `played ${st.game.rounds} rounds`);
  h.log(`${st.game.rounds} rounds, history ${st.game.history.join(' ')}`);

  // --- leaving with chips on the layout refunds them -----------------------------------
  await h.clickAt(chipX(1), 664);
  await clickCell('red');
  await clickCell('5');
  const withBets = await h.readState();
  h.assert(withBets.inPlay === 10, 'chips on the layout are in play');
  h.assert(await h.backToLobby(), 'can leave between spins');
  st = await h.readState();
  h.assert(st.balance === withBets.balance + 10 && st.inPlay === 0, `unplayed chips refunded on leave (${st.balance})`);
  await books('after leave');
}
