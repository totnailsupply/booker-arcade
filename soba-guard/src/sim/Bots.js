import { Rng } from './Rng.js';
import { UNITS } from '../data/units.js';
import { ENEMY, GRID, SIM, BOTS } from '../core/Constants.js';

const { NOVICE, SMART } = BOTS;
import { BARK_RANGE_X, barkReady, zoomiesReady, barkTargets, barkLidTargets } from './Soba.js';

// Decision bots that drive a Battle through the same commands a player sends.
// Used headless by scripts/sim-level.mjs and in the browser by ?autoplay=1.
// Deterministic: they read the battle state and (novice) a bot RNG seeded from
// the battle seed, so Node and the browser make the same choices.
//
//   idle          never places, never collects
//   steamers      steamers only (no cats, no walls): collects every coin at
//                 once, places a steamer whenever it can afford one
//   cats-steamers the Step 1 bot: 5 cats in column 0, then steamers
//   novice        acts every 0.5 s, collects coins 1.5 s after they land, a few
//                 cats and steamers in random rows (reacts to a row that is
//                 attacked with no steamer), the odd wall; never uses Soba's
//                 abilities, never upgrades
//   novice-skip   novice that never builds in row 4 (checks every row matters)
//   smart         two columns of cats, steamers in front, walls on pressure,
//                 barks at lids, zoomies, upgrades, wall upkeep

export const BOT_NAMES = ['idle', 'steamers', 'cats-steamers', 'novice', 'novice-skip', 'smart'];

const ROW_ORDER = [2, 1, 3, 0, 4];
const VIEW_X = ENEMY.FIRE_RANGE_X;          // enemies a player can see in the garden
const ALLEY_X = ENEMY.SPAWN_X + ENEMY.SPAWN_X_JITTER;

function liveUnits(b, key = null, row = null) {
  return b.units.filter(u => u.alive && (key === null || u.key === key) && (row === null || u.row === row));
}

function enemiesInRow(b, row, maxX = ALLEY_X) {
  return b.enemies.filter(e => e.alive && e.row === row && e.x <= maxX);
}

function rowThreat(b, row, maxX = ALLEY_X) {
  let hp = 0;
  for (const e of enemiesInRow(b, row, maxX)) hp += e.hp + e.lid;
  return hp;
}

function firstFreeCol(b, row, from, to = GRID.COLS - 1) {
  for (let col = from; col <= to; col++) if (b.grid.isFree(row, col)) return col;
  return -1;
}

function ready(b, key, coins) {
  const c = b.card(key);
  return !!c && c.rechargeLeft <= 0 && coins >= c.cost;
}

function collectAll(b, cmds) {
  let coins = b.coins;
  for (const c of b.coinsField) {
    if (!c.alive || c.fetch) continue;
    cmds.push({ type: 'collect', id: c.id });
    coins += c.value;
  }
  return coins;
}

// --- steamers-only -------------------------------------------------------------

function steamersBot() {
  return {
    name: 'steamers',
    decide(b) {
      const cmds = [];
      const coins = collectAll(b, cmds);
      if (!ready(b, 'steamer', coins)) return cmds;
      const rows = ROW_ORDER.filter(r => r < b.rows);
      let best = -1;
      let bestScore = -Infinity;
      for (const r of rows) {
        if (firstFreeCol(b, r, 0) < 0) continue;
        const s = liveUnits(b, 'steamer', r).length;
        const score = (s === 0 && enemiesInRow(b, r).length ? 100 : 0) + enemiesInRow(b, r).length * 2 - s * 3;
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (best >= 0) cmds.push({ type: 'place', unit: 'steamer', row: best, col: firstFreeCol(b, best, 0) });
      return cmds;
    },
  };
}

// --- cats-steamers (Step 1) -------------------------------------------------------

function catsSteamersBot(opts = {}) {
  const cats = opts.cats ?? 5;
  const maxSteamers = opts.maxSteamersPerRow ?? 4;
  return {
    name: 'cats-steamers',
    decide(b) {
      const cmds = [];
      const coins = collectAll(b, cmds);
      const rows = ROW_ORDER.filter(r => r < b.rows);
      if (ready(b, 'steamer', coins)) {
        const urgent = rows.find(r => enemiesInRow(b, r).length > 0 && liveUnits(b, 'steamer', r).length === 0);
        if (urgent !== undefined) {
          const col = firstFreeCol(b, urgent, 1);
          if (col >= 0) {
            cmds.push({ type: 'place', unit: 'steamer', row: urgent, col });
            return cmds;
          }
        }
      }
      if (liveUnits(b, 'luckycat').length < cats && ready(b, 'luckycat', coins)) {
        const row = rows.find(r => b.grid.isFree(r, 0));
        if (row !== undefined) {
          cmds.push({ type: 'place', unit: 'luckycat', row, col: 0 });
          return cmds;
        }
      }
      if (ready(b, 'steamer', coins)) {
        let best = -1;
        let bestScore = -Infinity;
        for (const r of rows) {
          const s = liveUnits(b, 'steamer', r).length;
          if (s >= maxSteamers || firstFreeCol(b, r, 1) < 0) continue;
          const score = enemiesInRow(b, r).length * 2 - s;
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        if (best >= 0) cmds.push({ type: 'place', unit: 'steamer', row: best, col: firstFreeCol(b, best, 1) });
      }
      return cmds;
    },
  };
}

// --- novice ----------------------------------------------------------------------


function randomFreeCol(b, rng, row, from, to) {
  const free = [];
  for (let c = from; c <= to; c++) if (b.grid.isFree(row, c)) free.push(c);
  return free.length ? free[rng.int(free.length)] : -1;
}

function noviceBot(seed, { skipRows = [] } = {}) {
  const rng = new Rng((seed ^ 0x5eed1234) >>> 0);
  const thinkFrames = Math.round(NOVICE.THINK_EVERY / SIM.DT);
  return {
    name: skipRows.length ? 'novice-skip' : 'novice',
    decide(b) {
      const cmds = [];
      let coins = b.coins;
      for (const c of b.coinsField) {
        if (c.alive && !c.fetch && c.landed && c.age >= NOVICE.COLLECT_DELAY) {
          cmds.push({ type: 'collect', id: c.id, by: 'bot' });
          coins += c.value;
        }
      }
      if (b.frame % thinkFrames !== 0) return cmds;
      const rows = [];
      for (let r = 0; r < b.rows; r++) if (!skipRows.includes(r)) rows.push(r);
      // 1. A row under attack (enemy in the garden) with no steamer gets one
      const urgent = rows.filter(r => enemiesInRow(b, r, VIEW_X).length && !liveUnits(b, 'steamer', r).length);
      if (urgent.length) {
        if (ready(b, 'steamer', coins)) {
          const r = urgent[rng.int(urgent.length)];
          const col = randomFreeCol(b, rng, r, NOVICE.STEAMER_COLS[0], NOVICE.STEAMER_COLS[1]);
          if (col >= 0) cmds.push({ type: 'place', unit: 'steamer', row: r, col });
        }
        return cmds;
      }
      // 2. A few Lucky Cats in the back columns
      if (liveUnits(b, 'luckycat').length < NOVICE.CATS && ready(b, 'luckycat', coins)) {
        const r = rows[rng.int(rows.length)];
        const col = randomFreeCol(b, rng, r, 0, 1);
        if (col >= 0) {
          cmds.push({ type: 'place', unit: 'luckycat', row: r, col });
          return cmds;
        }
      }
      // 3. A wall in front of a row that has a lid rat coming
      if (ready(b, 'onigiri', coins)) {
        const r = rows.find(row => enemiesInRow(b, row, VIEW_X).some(e => e.key === 'lidrat')
          && !liveUnits(b, 'onigiri', row).length && b.grid.isFree(row, NOVICE.WALL_COL));
        if (r !== undefined) {
          cmds.push({ type: 'place', unit: 'onigiri', row: r, col: NOVICE.WALL_COL });
          return cmds;
        }
      }
      // 4. Steamers in random rows
      if (ready(b, 'steamer', coins)) {
        const open = rows.filter(r => liveUnits(b, 'steamer', r).length < NOVICE.MAX_STEAMERS_PER_ROW);
        if (open.length) {
          const r = open[rng.int(open.length)];
          const col = randomFreeCol(b, rng, r, NOVICE.STEAMER_COLS[0], NOVICE.STEAMER_COLS[1]);
          if (col >= 0) cmds.push({ type: 'place', unit: 'steamer', row: r, col });
        }
      }
      return cmds;
    },
  };
}

// --- smart -----------------------------------------------------------------------


function smartBot() {
  return {
    name: 'smart',
    decide(b) {
      const cmds = [];
      const coins = collectAll(b, cmds);
      const rows = ROW_ORDER.filter(r => r < b.rows);
      const cats = liveUnits(b, 'luckycat');

      // Soba: bark at lids and at critters chewing a defender near the porch
      if (barkReady(b) && !b.soba.pending.length && !b.soba.zoomies) {
        let best = -1;
        let bestScore = 0;
        for (const r of rows) {
          let score = 3 * barkLidTargets(b, r).length;
          for (const e of barkTargets(b, r)) {
            if (e.state === 'hop') continue;
            const u = e.state === 'bite' ? b.unitById(e.target) : null;
            if (u && u.key !== 'onigiri' && u.hp < u.maxHp * SMART.UNIT_SAVE_FRAC) score += 2;
            if (e.x - ENEMY.HALF_W <= GRID.X + GRID.TILE) score += 2;
          }
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        if (best >= 0) {
          cmds.push({ type: 'sobaMove', row: best }, { type: 'bark' });
          return cmds;
        }
      }
      if (zoomiesReady(b) && !b.soba.pending.length) {
        let best = -1;
        let bestHp = SMART.ZOOMIES_MIN_HP - 1;
        for (const r of rows) {
          const hp = rowThreat(b, r, GRID.RIGHT);
          if (hp > bestHp) {
            bestHp = hp;
            best = r;
          }
        }
        if (best >= 0) {
          cmds.push({ type: 'sobaMove', row: best }, { type: 'zoomies' });
          return cmds;
        }
      }

      // Wall upkeep: heal with the nori wrap, swap a worn-out tier-2 wall
      for (const w of liveUnits(b, 'onigiri')) {
        if (w.tier === 1 && w.hp < w.maxHp * SMART.WALL_HEAL_FRAC && coins >= UNITS.onigiri.tier2.cost) {
          cmds.push({ type: 'upgrade', row: w.row, col: w.col });
          return cmds;
        }
        if (w.tier === 2 && w.hp < w.maxHp * SMART.WALL_SWAP_FRAC && ready(b, 'onigiri', coins)) {
          cmds.push({ type: 'recall', row: w.row, col: w.col }, { type: 'place', unit: 'onigiri', row: w.row, col: w.col });
          return cmds;
        }
      }

      // 1. Any row with critters and no steamer
      const urgent = rows.filter(r => enemiesInRow(b, r).length && !liveUnits(b, 'steamer', r).length);
      if (urgent.length) {
        if (ready(b, 'steamer', coins)) {
          const r = urgent[0];
          const col = firstFreeCol(b, r, SMART.STEAMER_COLS[0], SMART.STEAMER_COLS[1]);
          if (col >= 0) cmds.push({ type: 'place', unit: 'steamer', row: r, col });
        }
        if (cats.length >= SMART.CATS_FIRST) return cmds;
      }
      // 2. The first column of cats
      if (cats.length < SMART.CATS_FIRST) {
        if (ready(b, 'luckycat', coins)) {
          const r = rows.find(row => b.grid.isFree(row, 0));
          if (r !== undefined) cmds.push({ type: 'place', unit: 'luckycat', row: r, col: 0 });
        }
        return cmds;
      }
      // 3. Walls in front of rows under pressure (a lid rat, or 2+ critters)
      if (ready(b, 'onigiri', coins)) {
        const r = rows.find(row => {
          const es = enemiesInRow(b, row);
          return (es.some(e => e.lid > 0) || es.length >= 2) && b.grid.isFree(row, SMART.WALL_COL)
            && !liveUnits(b, 'onigiri', row).length;
        });
        if (r !== undefined) {
          cmds.push({ type: 'place', unit: 'onigiri', row: r, col: SMART.WALL_COL });
          return cmds;
        }
      }
      // 4. A second steamer where the critters are
      const spare = coins - SMART.RESERVE;
      const threatened = rows
        .filter(r => rowThreat(b, r) > 0 && liveUnits(b, 'steamer', r).length < SMART.STEAMERS_PER_ROW)
        .sort((a, c) => rowThreat(b, c) - rowThreat(b, a));
      if (threatened.length) {
        if (ready(b, 'steamer', spare)) {
          const col = firstFreeCol(b, threatened[0], SMART.STEAMER_COLS[0], SMART.STEAMER_COLS[1]);
          if (col >= 0) cmds.push({ type: 'place', unit: 'steamer', row: threatened[0], col });
        }
        return cmds;
      }
      // 5. The second column of cats
      if (cats.length < SMART.CATS) {
        if (ready(b, 'luckycat', spare)) {
          const r = rows.find(row => b.grid.isFree(row, 1));
          if (r !== undefined) cmds.push({ type: 'place', unit: 'luckycat', row: r, col: 1 });
        }
        return cmds;
      }
      // 6. Every row gets its pair of steamers
      const thin = rows.filter(r => liveUnits(b, 'steamer', r).length < SMART.STEAMERS_PER_ROW
        && firstFreeCol(b, r, SMART.STEAMER_COLS[0], SMART.STEAMER_COLS[1]) >= 0);
      if (thin.length) {
        if (ready(b, 'steamer', spare)) {
          cmds.push({ type: 'place', unit: 'steamer', row: thin[0], col: firstFreeCol(b, thin[0], SMART.STEAMER_COLS[0], SMART.STEAMER_COLS[1]) });
        }
        return cmds;
      }
      // 7. Upgrades: cats first (more coins), then steamers (bursts)
      for (const key of ['luckycat', 'steamer']) {
        const u = liveUnits(b, key).find(x => x.tier === 1);
        if (u) {
          if (spare >= UNITS[key].tier2.cost) cmds.push({ type: 'upgrade', row: u.row, col: u.col });
          return cmds;
        }
      }
      return cmds;
    },
  };
}

export function createBot(name = 'idle', opts = {}) {
  const seed = opts.seed ?? 1;
  switch (name) {
    case 'idle': return { name, decide: () => [] };
    case 'steamers': return steamersBot();
    case 'cats-steamers': return catsSteamersBot(opts);
    case 'novice': return noviceBot(seed);
    case 'novice-skip': return noviceBot(seed, { skipRows: [4] });
    case 'smart': return smartBot();
    default: throw new Error(`unknown bot "${name}" (${BOT_NAMES.join(' | ')})`);
  }
}

export { BARK_RANGE_X };
