// Lobby check — the example every <game>-check.mjs can copy.
// Runs inside scripts/casino-check.mjs (starts in the lobby, fresh save, seed 7).
//
//   export const name = 'Lobby';
//   export default async function (page, h) { ... throw to fail ... }
//
// Covers: daily bonus claim, Stats open/close, card click, rules panel + Esc
// order, mute, leave-refusal mid-round, and 25 lobby <-> game switches with
// no listener/object growth.

export const name = 'Lobby';

const CARD = { 1: [586, 211], 2: [860, 211], 3: [1134, 211], 4: [586, 483], 5: [860, 483] };
const CASHIER_BTN = [1134, 564];
const KEYS = ['Plinko', 'Blackjack', 'Craps', 'Roulette', 'Slots'];

async function leakProbe(page) {
  return page.evaluate(() => {
    const game = window.__GAME__;
    const lobby = game.scene.getScene('Lobby');
    const ev = lobby.sys.events;
    const evCount = ev.eventNames().reduce((n, e) => n + ev.listenerCount(e), 0);
    return {
      bus: window.__EVENT_BUS__.total(),
      lobbyObjects: lobby.children.length,
      lobbyEvents: evCount,
      tweens: lobby.tweens.getTweens().length,
      gameEvents: game.events.eventNames().reduce((n, e) => n + game.events.listenerCount(e), 0),
    };
  });
}

export default async function lobbyCheck(page, h) {
  let st = await h.readState();
  h.assert(st.mode === 'lobby', 'starts in the lobby');
  h.assert(st.daily === true, 'daily bonus available on a fresh save');

  // Daily bonus via the cashier card
  const b0 = st.balance;
  await h.clickAt(...CASHIER_BTN);
  await h.step(800);
  st = await h.readState();
  h.assert(st.balance === b0 + 250, `daily bonus pays 250 (balance ${b0} -> ${st.balance})`);
  h.assert(st.daily === false, 'daily bonus gone after claiming');
  h.log(`daily bonus claimed -> ${st.balance}`);

  // Stats (S) and back (Esc)
  await h.pressKey('s');
  st = await h.waitFor(s => s.mode === 'stats', 1000);
  h.assert(st.paused.includes('Lobby'), 'lobby paused under stats');
  await h.pressKey('Escape');
  st = await h.waitFor(s => s.mode === 'lobby' && !s.paused.includes('Lobby'), 1000);
  h.log('stats open/close ok');

  // Click a card
  await h.clickAt(...CARD[4]);
  st = await h.waitFor(s => s.scene === 'Roulette', 2000);
  await h.step(300);

  // Rules panel: '?' opens; the first Esc closes it and must NOT leave the game
  await h.clickAt(1182, 32);
  st = await h.readState();
  h.assert(st.game.rules === true, 'rules panel open');
  await h.pressKey('Escape');
  await h.step(200);
  st = await h.readState();
  h.assert(st.mode === 'game' && st.game.rules === false, 'Esc closed the rules and stayed in the game');

  // Leaving mid-round is refused
  await h.evaluate(() => window.__GAME__.scene.getScene('Roulette').beginRound());
  await h.pressKey('Escape');
  await h.step(400);
  st = await h.readState();
  h.assert(st.mode === 'game', 'cannot leave mid-round');
  await h.evaluate(() => window.__GAME__.scene.getScene('Roulette').endRound());
  h.assert(await h.backToLobby(), 'Esc returns to the lobby after the round');
  h.log('rules + leave-refusal ok');

  // Mute (M) toggles and is reported
  await h.pressKey('m');
  st = await h.readState();
  h.assert(st.isMuted === true, 'M mutes');
  await h.pressKey('m');
  st = await h.readState();
  h.assert(st.isMuted === false, 'M unmutes');

  // 25 lobby <-> game switches: no growth in listeners / objects / tweens
  await h.openGame('Plinko');
  await h.backToLobby();
  await h.step(500);
  const base = await leakProbe(page);
  for (let i = 0; i < 25; i++) {
    await h.openGame(KEYS[i % KEYS.length]);
    if (i % 5 === 4) {
      await h.pressKey('s'); // also cycle stats from the lobby side below
    }
    h.assert(await h.backToLobby(), `back to lobby (switch ${i + 1})`);
    if (i % 5 === 4) {
      await h.pressKey('s');
      await h.waitFor(s => s.mode === 'stats', 1000);
      await h.pressKey('Escape');
      await h.waitFor(s => s.mode === 'lobby' && !s.paused.includes('Lobby'), 1000);
    }
  }
  await h.step(500);
  const end = await leakProbe(page);
  h.log(`leak probe start ${JSON.stringify(base)}`);
  h.log(`leak probe end   ${JSON.stringify(end)}`);
  for (const k of ['bus', 'lobbyObjects', 'lobbyEvents', 'gameEvents']) {
    h.assert(end[k] <= base[k], `${k} grew over 25 switches (${base[k]} -> ${end[k]})`);
  }
  h.assert(end.tweens <= base.tweens + 4, `lobby tweens grew (${base.tweens} -> ${end.tweens})`);
}
