// UI-kit check: drives the shared ChipTray / BetSpot / settle / WinBanner /
// refund-on-leave / bailout flows inside the empty Kit scene, so the framework is
// proven before the game agents build on it. (Game checks live in
// scripts/checks/<game>-check.mjs.)

export const name = 'UI kit';

export default async function kitCheck(page, h) {
  // The empty 'Kit' table (src/scenes/KitScene.js) is the sandbox
  await h.evaluate(() => window.__CASINO__.goto('Kit'));
  await h.waitFor(s => s.scene === 'Kit', 2000);
  await h.step(300);
  const spot = { x: 640, y: 380 };
  await h.evaluate(({ x, y }) => {
    const s = window.__GAME__.scene.getScene('Kit');
    s.__kitTray = s.chipTray || s.addChipTray({ x: 500, y: 664 });
    s.__kitSpot = s.addBetSpot(x, y, { label: 'KIT', payout: '1:1', w: 160, h: 100 });
    s.__kitSpot.setDepth(500);
  }, spot);
  await h.step(100);
  const b0 = (await h.readState()).balance;

  // Select the 25 chip by clicking it (tray chips at x = 500 - 184 + 32 + i*76)
  await h.clickAt(500 - 184 + 32 + 2 * 76, 664);
  let st = await h.readState();
  h.assert(st.game.chip === 25, `tray picked 25 (got ${st.game.chip})`);

  // Two clicks on the spot = 50 bet
  await h.clickAt(spot.x, spot.y);
  await h.clickAt(spot.x, spot.y);
  await h.step(300);
  st = await h.readState();
  h.assert(st.balance === b0 - 50, `bet 50 (balance ${b0} -> ${st.balance})`);
  h.assert(st.inPlay === 50, 'in play 50');

  // Undo one chip (right-click) then win even money on 25
  await h.clickAt(spot.x, spot.y, { button: 'right' });
  st = await h.readState();
  h.assert(st.balance === b0 - 25, `undo refunds the last chip (balance ${st.balance})`);
  await h.evaluate(() => {
    const s = window.__GAME__.scene.getScene('Kit');
    s.beginRound();
    const w = s.totalBet();
    s.settle(w, w * 2);
    s.__kitSpot.win(w * 2);
  });
  await h.step(1600);
  st = await h.readState();
  h.assert(st.balance === b0 + 25, `even-money win pays (balance ${st.balance})`);
  h.assert(st.inPlay === 0, 'nothing in play after settle');
  h.assert(st.game.last.outcome === 'win', 'outcome win');

  // Big win -> banner, click skips
  await h.evaluate(() => {
    const s = window.__GAME__.scene.getScene('Kit');
    s.__kitSpot.bet(5);
    s.beginRound();
    s.settle(5, 100);
    s.__kitSpot.win(100);
  });
  await h.step(400);
  st = await h.readState();
  h.assert(st.game.banner === 'big', `big-win banner (got ${st.game.banner})`);
  await h.clickAt(640, 360);
  await h.clickAt(640, 360);
  await h.step(600);
  st = await h.readState();
  h.assert(st.game.banner === null, 'banner skipped by clicks');

  // Table limit: a 100 chip on top of 25 exceeds max bet 100 (Puppy) -> refused + toast
  await h.evaluate(() => {
    const s = window.__GAME__.scene.getScene('Kit');
    s.__kitSpot.bet(25);
    s.__kitSpot.bet(100);
  });
  st = await h.readState();
  h.assert(st.inPlay === 25, `max bet enforced (in play ${st.inPlay})`);

  // Leaving with un-played chips refunds them
  const before = st.balance;
  h.assert(await h.backToLobby(), 'leave with an unplayed bet');
  st = await h.readState();
  h.assert(st.balance === before + 25 && st.inPlay === 0, `unplayed bet refunded on leave (${before} -> ${st.balance})`);

  // Bailout: broke + nothing in play -> cashier offers 500
  await h.evaluate(() => window.__CASINO__.wallet.setBalance(4));
  await h.step(200);
  st = await h.readState();
  h.assert(st.bailout === true, 'bailout offered under 10 chips');
  await h.pressKey('b');
  await h.step(600);
  st = await h.readState();
  h.assert(st.balance === 504 && st.stats.bailouts === 1, `bailout paid (balance ${st.balance})`);
  await h.evaluate((b) => window.__CASINO__.wallet.setBalance(b), before + 25);
  await h.step(100);
}
