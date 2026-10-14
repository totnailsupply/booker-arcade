import { ECONOMY, GRID, SCORE, SIM, SOBA } from '../core/Constants.js';
import { UNITS } from '../data/units.js';
import { Rng } from './Rng.js';
import { Grid } from './Grid.js';
import { Waves } from './Waves.js';
import { createUnit, updateUnits, upgradeUnit, recallUnit, canUpgrade, recallRefund } from './Units.js';
import { updateEnemies } from './Enemies.js';
import { updateProjectiles } from './Projectiles.js';
import { createScooters, updateScooters } from './Scooters.js';
import { updateCoins, collectCoin, coinAt, collectInTile } from './Coins.js';
import {
  createSoba, updateSoba, sobaMove, requestBark, requestZoomies, sobaOnKill, sobaMoving, BARK_RANGE_X,
} from './Soba.js';

// =============================================================================
// Battle — the whole rule set of one level, pure JavaScript (no Phaser), so the
// same code runs in the browser (BattleScene) and in Node (scripts/sim-level).
//
//   const b = new Battle({ level, seed, modifiers, cards });
//   b.step(1 / 60, { commands: [...], cursor: { row, col } | null });
//   b.drainEvents()  -> [{ type, ... }]   (the scene forwards them to the EventBus)
//
// Commands:
//   { type: 'place', unit, row, col }      { type: 'collect', id }
//   { type: 'collectAt', x, y }            { type: 'start' }  (skip the setup)
//   { type: 'sobaMove', row }              { type: 'bark' }   { type: 'zoomies' }
//   { type: 'upgrade', row, col }          { type: 'recall', row, col }
// `cursor` (keyboard tile cursor) collects every coin in that tile each step.
//
// modifiers (Treat Shop, see core/BattleConfig.js): startCoins (+N),
// barkCooldownS (-N s), dumplingDamagePct (+N %), catRatePct (+N % faster).
// =============================================================================

export const DEFAULT_MODIFIERS = Object.freeze({ startCoins: 0, barkCooldownS: 0, dumplingDamagePct: 0, catRatePct: 0 });

export function normalizeModifiers(m = {}) {
  const out = { ...DEFAULT_MODIFIERS };
  for (const k of Object.keys(DEFAULT_MODIFIERS)) {
    const v = Number(m?.[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export class Battle {
  constructor({
    level, seed = 1, startWave = 1, startCoins = null, god = false, modifiers = null, cards = null, debug = false,
  } = {}) {
    this.level = level;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.god = !!god;
    this.debug = !!debug || this.god;
    this.mods = normalizeModifiers(modifiers);
    this.rows = level.rows ?? GRID.ROWS;
    this.time = 0;
    this.frame = 0;
    this.coins = (startCoins ?? level.startCoins ?? ECONOMY.START_COINS) + this.mods.startCoins;
    this.score = 0;
    this.kills = 0;
    this.coinsCollected = 0;
    this.unitsLost = 0;
    this.scootersUsed = 0;
    this.outcome = null;              // null | 'won' | 'lost'
    this.loseRow = -1;
    this.nextId = 1;
    this.events = [];
    this.hintsShown = [];
    this.grid = new Grid(this.rows);
    this.units = [];
    this.enemies = [];
    this.projectiles = [];
    this.coinsField = [];
    this.scooters = createScooters(this.rows);
    this.lanternTimer = ECONOMY.LANTERN_FIRST;
    this.soba = createSoba(this);
    this.waves = new Waves(this, level, startWave);
    this.cards = [];
    for (const key of (cards && cards.length ? cards : level.cards)) if (UNITS[key]) this.addCard(key);
    for (const u of level.unlocks || []) if (u.afterWave < this.waves.firstWave) this.addCard(u.card);
    if (this.waves.firstWave === 1) this.hint('cat');
  }

  newId() {
    return this.nextId++;
  }

  emit(type, data = {}) {
    this.events.push({ type, t: this.time, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** One-time teaching toast (level data `hints`); emitted once per battle. */
  hint(id) {
    const text = this.level.hints?.[id];
    if (!text || this.hintsShown.includes(id)) return;
    if (id === 'cat' && !this.card('luckycat')) return;
    this.hintsShown.push(id);
    this.emit('hint', { id, text });
  }

  // --- cards -----------------------------------------------------------------

  addCard(key) {
    if (this.cards.some(c => c.key === key)) return null;
    const def = UNITS[key];
    const card = { key, cost: def.cost, recharge: def.recharge, rechargeLeft: 0 };
    this.cards.push(card);
    return card;
  }

  unlockCard(key) {
    if (this.addCard(key)) {
      this.emit('cardUnlock', { key });
      this.hint(key);
    }
  }

  card(key) {
    return this.cards.find(c => c.key === key) || null;
  }

  /** Why a placement would fail ('' if it would succeed). */
  canPlace(key, row, col) {
    if (this.outcome) return 'over';
    const card = this.card(key);
    if (!card) return 'no_card';
    if (card.rechargeLeft > 0) return 'recharging';
    if (this.coins < card.cost) return 'coins';
    if (!this.grid.inside(row, col)) return 'outside';
    if (!this.grid.isFree(row, col)) return 'occupied';
    return '';
  }

  place(key, row, col) {
    const why = this.canPlace(key, row, col);
    if (why) {
      this.emit('placeFail', { key, row, col, reason: why });
      return false;
    }
    const card = this.card(key);
    this.coins -= card.cost;
    card.rechargeLeft = card.recharge;
    const unit = createUnit(this, key, row, col);
    this.units.push(unit);
    this.grid.set(row, col, unit.id);
    this.emit('place', { unit: unit.id, key, row, col, cost: card.cost, coins: this.coins });
    return true;
  }

  unitById(id) {
    for (const u of this.units) if (u.id === id) return u;
    return null;
  }

  unitAt(row, col) {
    const id = this.grid.get(row, col);
    return id ? this.unitById(id) : null;
  }

  /** '' if the unit on (row, col) can be upgraded now, else the reason. */
  canUpgradeAt(row, col) {
    return canUpgrade(this, this.unitAt(row, col));
  }

  /** What Recall on (row, col) would refund (0 if nothing is there). */
  refundAt(row, col) {
    const u = this.unitAt(row, col);
    return u ? recallRefund(u) : 0;
  }

  coinAt(x, y) {
    return coinAt(this, x, y);
  }

  // --- step --------------------------------------------------------------------

  applyInput(input) {
    if (!input) return;
    for (const cmd of input.commands || []) {
      if (this.outcome) break;
      switch (cmd.type) {
        case 'place': this.place(cmd.unit, cmd.row, cmd.col); break;
        case 'collect': collectCoin(this, this.coinsField.find(c => c.id === cmd.id), cmd.by || 'bot'); break;
        case 'collectAt': collectCoin(this, coinAt(this, cmd.x, cmd.y), 'tap'); break;
        case 'start': this.waves.skipSetup(); break;
        case 'sobaMove': sobaMove(this, cmd.row); break;
        case 'bark': requestBark(this); break;
        case 'zoomies': requestZoomies(this); break;
        case 'upgrade': upgradeUnit(this, this.unitAt(cmd.row, cmd.col)); break;
        case 'recall': recallUnit(this, this.unitAt(cmd.row, cmd.col)); break;
        default: break;
      }
    }
    if (input.cursor) collectInTile(this, input.cursor.row, input.cursor.col);
  }

  step(dt, input = null) {
    if (this.outcome) return;
    this.frame += 1;
    this.time += dt;
    this.applyInput(input);
    for (const c of this.cards) c.rechargeLeft = Math.max(0, c.rechargeLeft - dt);
    this.waves.update(dt);
    updateUnits(this, dt);
    updateProjectiles(this, dt);
    updateSoba(this, dt);
    updateEnemies(this, dt);
    if (this.outcome) return;
    updateScooters(this, dt);
    updateCoins(this, dt);
    this.prune();
    if (this.waves.finished()) this.win();
  }

  onKill() {
    sobaOnKill(this);
  }

  prune() {
    if (this.frame % SIM.PRUNE_EVERY !== 0) return;
    this.units = this.units.filter(u => u.alive);
    this.enemies = this.enemies.filter(e => e.alive);
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.coinsField = this.coinsField.filter(c => c.alive);
  }

  win() {
    if (this.outcome) return;
    this.outcome = 'won';
    this.soba.state = 'cheer';
    this.score += SCORE.WIN_BONUS;
    this.emit('win', { score: this.score, time: this.time });
  }

  lose(enemy) {
    if (this.outcome) return;
    this.outcome = 'lost';
    this.soba.state = 'sad';
    this.loseRow = enemy.row;
    this.emit('lose', { row: enemy.row, enemy: enemy.id, score: this.score, time: this.time });
  }

  // --- reporting ---------------------------------------------------------------

  /**
   * The result contract (ResultsScene, save, menus depend on it exactly):
   * { levelNumber, levelId, levelName, won, score, wave, wavesTotal, kills,
   *   scootersUsed, unitsLost, timeS, seed, debug,
   *   stars: [cleared, noScooterUsed, noDefenderLost] (all false on a loss),
   *   unlocks: unit keys unlocked by clearing (level.clearUnlocks; [] on a loss) }
   * plus `outcome` ('won' | 'lost' | null) and `time` (= timeS) for older readers.
   */
  result() {
    const won = this.outcome === 'won';
    const timeS = Math.round(this.time * 10) / 10;
    return {
      levelNumber: this.level.number,
      levelId: this.level.id,
      levelName: this.level.name,
      won,
      outcome: this.outcome,
      score: this.score,
      wave: this.waves.current,
      wavesTotal: this.waves.total,
      kills: this.kills,
      scootersUsed: this.scootersUsed,
      unitsLost: this.unitsLost,
      timeS,
      time: timeS,
      seed: this.seed,
      debug: this.debug,
      stars: [won, won && this.scootersUsed === 0, won && this.unitsLost === 0],
      unlocks: won ? [...(this.level.clearUnlocks || [])] : [],
    };
  }

  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const s = this.soba;
    return {
      phase: this.outcome ? 'over' : (this.waves.inSetup ? 'setup' : 'waves'),
      time: r1(this.time),
      score: this.score,
      coins: this.coins,
      wave: this.waves.current,
      wavesTotal: this.waves.total,
      setupLeft: r1(Math.max(0, this.waves.setupLeft)),
      cards: this.cards.map(c => ({
        key: c.key, cost: c.cost, ready: c.rechargeLeft <= 0, affordable: this.coins >= c.cost, rechargeLeft: r1(c.rechargeLeft),
      })),
      soba: {
        row: s.row,
        targetRow: s.targetRow,
        x: Math.round(s.x),
        y: Math.round(s.y),
        state: s.state,
        moving: sobaMoving(s),
        barkCooldown: r1(s.barkCooldown),
        barkCooldownMax: s.barkCooldownMax,
        barkRangeX: BARK_RANGE_X,
        zoomiesMeter: s.zoomiesMeter,
        zoomiesMax: SOBA.ZOOMIES_KILLS,
        barks: s.barks,
        zoomiesUsed: s.zoomiesUsed,
      },
      units: this.units.filter(u => u.alive).map(u => ({
        key: u.key, row: u.row, col: u.col, hp: Math.ceil(u.hp), maxHp: u.maxHp, tier: u.tier, paid: u.paid,
      })),
      enemies: this.enemies.filter(e => e.alive).map(e => ({
        key: e.key,
        row: e.row,
        x: Math.round(e.x),
        hp: Math.ceil(e.hp),
        lid: Math.ceil(e.lid),
        hopped: e.hopped,
        stunned: e.stunLeft > 0,
        state: e.stunLeft > 0 ? 'stunned' : e.state,
      })),
      projectiles: this.projectiles.filter(p => p.alive).length,
      coinsOnField: this.coinsField.filter(c => c.alive).map(c => ({
        id: c.id, x: Math.round(c.x), y: Math.round(c.y), value: c.value, landed: c.landed, fetching: !!c.fetch,
      })),
      scooters: this.scooters.map(sc => sc.state),
      hintsShown: [...this.hintsShown],
      modifiers: { ...this.mods },
      kills: this.kills,
      unitsLost: this.unitsLost,
      scootersUsed: this.scootersUsed,
      seed: this.seed,
      outcome: this.outcome,
    };
  }
}
