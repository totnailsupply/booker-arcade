// Plinko browser check (run by scripts/casino-check.mjs --only plinko).
// Lobby -> Plinko; single drops (Space tap, Drop button click), leave refused
// while balls fly, risk locked in flight, risk change by key and by click,
// bet +/-, Auto x10, hold-Space repeat; the balance change must equal the sum
// of (payout - bet) over every ball, and each payout must be bet x multiplier.

export const name = 'Plinko';

const RISK_BTN = { low: { x: 138, y: 170 }, medium: { x: 138, y: 240 }, high: { x: 138, y: 310 } };
const DROP_BTN = { x: 990, y: 664 };

export default async function plinkoCheck(page, h) {
  let st = await h.openGame('Plinko');
  h.assert(st.game && st.game.game === 'plinko', 'Plinko scene snapshot');
  h.assert(st.game.inFlight === 0, 'nothing in flight on entry');
  h.assert(Array.isArray(st.game.multipliers) && st.game.multipliers.length === 13, 'multipliers in snapshot');
  const b0 = st.balance;
  const rounds0 = st.stats.games.plinko.rounds;
  const landed = () => h.waitFor(s => s.game.inFlight === 0 && s.game.auto === 0, 15000, 250);

  // --- single drop by Space tap ---
  const bet0 = st.game.bet;
  await h.pressKey('Space');
  st = await h.readState();
  h.assert(st.game.inFlight === 1, `Space drops one ball (in flight ${st.game.inFlight})`);
  h.assert(st.balance === b0 - bet0, `bet taken on drop (${b0} -> ${st.balance})`);
  h.assert(st.game.roundActive === true, 'round active while a ball flies');

  // --- leave refused while it flies; risk locked ---
  const riskBefore = st.game.risk;
  const left = await h.backToLobby();
  h.assert(!left, 'leaving is refused while a ball is in flight');
  st = await h.readState();
  h.assert(st.scene === 'Plinko' && st.mode === 'game', 'still in Plinko');
  await h.pressKey('r');
  st = await h.readState();
  h.assert(st.game.risk === riskBefore, 'risk cannot change while balls fly');
  st = await landed();
  h.assert(st.game.lastResults.length === 1, 'first result recorded');
  h.assert(st.game.roundActive === false, 'round over after landing');

  // --- Drop button click ---
  await h.clickAt(DROP_BTN.x, DROP_BTN.y);
  st = await h.readState();
  h.assert(st.game.inFlight === 1, 'Drop button drops a ball');
  await landed();

  // --- risk: R cycles, click picks ---
  st = await h.readState();
  const order = ['low', 'medium', 'high'];
  await h.pressKey('r');
  st = await h.readState();
  h.assert(st.game.risk === order[(order.indexOf(riskBefore) + 1) % 3], `R cycles risk (${riskBefore} -> ${st.game.risk})`);
  await h.clickAt(RISK_BTN.high.x, RISK_BTN.high.y);
  st = await h.readState();
  h.assert(st.game.risk === 'high', `click High (risk ${st.game.risk})`);
  h.assert(st.game.multipliers[0] === 170 && st.game.multipliers[6] === 0.2, 'High multipliers');
  await h.clickAt(RISK_BTN.low.x, RISK_BTN.low.y);
  st = await h.readState();
  h.assert(st.game.risk === 'low' && st.game.multipliers[0] === 10, 'click Low');

  // --- bet selector: + twice, - once (within the table limit) ---
  await h.pressKey('ArrowRight');
  await h.pressKey('ArrowRight');
  st = await h.readState();
  h.assert(st.game.bet === 50, `bet 10 -> 50 with + (${st.game.bet})`);
  await h.pressKey('ArrowLeft');
  st = await h.readState();
  h.assert(st.game.bet === 20, `bet 50 -> 20 with - (${st.game.bet})`);
  for (let i = 0; i < 8; i++) await h.pressKey('ArrowRight');
  st = await h.readState();
  h.assert(st.game.bet <= st.maxBet, `bet capped by the table limit (${st.game.bet} <= ${st.maxBet})`);
  for (let i = 0; i < 2; i++) await h.pressKey('ArrowLeft');
  st = await h.readState();
  const autoBet = st.game.bet;

  // --- Medium for the auto run ---
  await h.clickAt(RISK_BTN.medium.x, RISK_BTN.medium.y);

  // --- Auto x10 ---
  const ballsBefore = st.game.totals.balls;
  const balBefore = st.balance;
  await h.pressKey('a');
  await h.step(400);
  st = await h.readState();
  h.assert(st.game.inFlight >= 2, `auto is dropping (in flight ${st.game.inFlight})`);
  h.assert(st.game.risk === 'medium', 'risk medium for auto');
  st = await landed();
  h.assert(st.game.totals.balls - ballsBefore === 10, `Auto x10 dropped 10 balls (${st.game.totals.balls - ballsBefore})`);
  const autoResults = st.game.lastResults; // exactly the 10 auto balls, newest first
  h.assert(autoResults.length === 10, 'history holds the last 10');
  const autoNet = autoResults.reduce((n, r) => n + r.paid - r.bet, 0);
  h.assert(autoResults.every(r => r.bet === autoBet), 'auto balls used the bet');
  h.assert(st.balance - balBefore === autoNet, `auto: balance change ${st.balance - balBefore} == sum(payout - bet) ${autoNet}`);

  // --- hold Space: auto-repeat ---
  const heldBefore = st.game.totals.balls;
  await page.keyboard.down('Space');
  for (let i = 0; i < 20; i++) await h.step(60);
  await page.keyboard.up('Space');
  await h.step();
  st = await h.readState();
  const held = st.game.totals.balls - heldBefore;
  h.assert(held >= 3 && held <= 10, `holding Space repeats drops (${held})`);
  st = await landed();

  // --- every result pays bet x multiplier (whole chips) ---
  for (const r of st.game.lastResults) {
    h.assert(Number.isInteger(r.paid), `integer payout ${r.paid}`);
    h.assert(r.paid === Math.round(r.bet * r.mult), `paid ${r.paid} == ${r.bet} x ${r.mult}`);
    h.assert(r.bin >= 0 && r.bin <= 12, 'bin 0..12');
  }

  // --- whole-visit books: balance change == sum(payout - bet) ---
  const t = st.game.totals;
  h.assert(st.balance - b0 === t.paid - t.wagered, `balance change ${st.balance - b0} == paid ${t.paid} - wagered ${t.wagered}`);
  h.assert(st.stats.games.plinko.rounds - rounds0 === t.balls, `one wallet round per ball (${st.stats.games.plinko.rounds - rounds0} vs ${t.balls})`);
  h.assert(st.inPlay === 0, 'nothing in play after the balls land');
  h.log(`plinko: ${t.balls} balls, wagered ${t.wagered}, paid ${t.paid}, net ${t.paid - t.wagered}`);

  // --- leave allowed once everything has landed ---
  h.assert(await h.backToLobby(), 'leave allowed after the balls land');
  st = await h.readState();
  h.assert(st.mode === 'lobby', 'back in the lobby');
}
