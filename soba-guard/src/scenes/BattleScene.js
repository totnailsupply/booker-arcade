import Phaser from 'phaser';
import {
  GAME, GRID, LAYOUT, SIM, VIEW, DEPTH, COLORS, UI, ECONOMY, ENEMY, SCOOTER, TRANSITION, SOBA, MECHANIC, FX, FX_COLORS, SCENERY,
} from '../core/Constants.js';
import { eventBus, Events, SIM_EVENTS } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import { makeBattleConfig } from '../core/BattleConfig.js';
import { getDebugOptions } from '../core/Debug.js';
import { ITEM, TILE, UNIT_FRAMES, ENEMY_FRAMES, SOBA_FRAMES } from '../core/Assets.js';
import { getLevel } from '../data/levels/index.js';
import { UNITS } from '../data/units.js';
import { Battle } from '../sim/Battle.js';
import { createBot } from '../sim/Bots.js';
import { BARK_RANGE_X } from '../sim/Soba.js';
import { cellAt, rowTop, rowCenterY, tileCenterX } from '../sim/Grid.js';
import { Hud } from '../ui/Hud.js';
import { textStyle } from '../ui/Button.js';
import { Effects } from '../fx/Effects.js';
import { drawHedgeBand, drawPlankEdge } from '../fx/Scenery.js';
import { addFireflies, addGlows } from '../fx/Ambient.js';

// =============================================================================
// BattleScene — renders a Battle (src/sim) and turns input into commands.
// All rules live in the sim; this scene only:
//   - steps the sim at a fixed 1/60 s with an accumulator (max 5 steps/frame),
//   - forwards the sim's events to the EventBus,
//   - draws sim entities with pooled sprites (id -> sprite maps),
//   - owns UI state: selected card, tool (upgrade / recall), tile cursor, pause.
// Game feel (particles, squash, flashes, banners) lives in src/fx/Effects.js,
// which listens to the same sim:* events; the scene only asks it to style
// each sprite after placing it where the sim says.
// Scene data: { config } from makeBattleConfig() (core/BattleConfig.js).
// =============================================================================

const PLACE_FAIL_TEXT = {
  coins: 'Not enough coins',
  recharging: 'Card is recharging',
  occupied: 'That tile is taken',
};
const UPGRADE_FAIL_TEXT = {
  coins: 'Not enough coins to upgrade',
  max_tier: 'Already upgraded',
  no_tier: 'This one has no upgrade',
};
const ABILITY_FAIL_TEXT = {
  cooldown: 'Bark is recharging',
  meter: 'Zoomies need more kills',
  active: 'Zoomies already running',
};

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.config = data?.config || gameState.battleConfig || makeBattleConfig();
  }

  create() {
    const cfg = this.config;
    gameState.battleConfig = cfg;
    gameState.result = null;
    gameState.mode = MODES.PLAYING;
    gameState.attempts += 1;

    this.level = getLevel(cfg.levelNumber);
    this.battle = new Battle({
      level: this.level,
      seed: cfg.seed,
      startWave: cfg.startWave,
      startCoins: cfg.startCoins,
      god: cfg.god,
      modifiers: cfg.modifiers,
      cards: cfg.cards,
      debug: cfg.debugRun,
    });
    this.bot = cfg.bot ? createBot(cfg.bot, { seed: cfg.seed }) : null;
    this.acc = 0;
    this.paused = false;
    this.externalPause = false;
    this.endTime = 0;
    this.leaving = false;
    this.selected = null;
    this.tool = null;
    this.cursor = { row: Math.floor(this.battle.rows / 2), col: 0 };
    this.keyboardCursor = false;
    this.commands = [];
    this.pools = new Map();     // texture key -> [inactive sprites]
    this.views = {
      units: new Map(), enemies: new Map(), projectiles: new Map(), coins: new Map(), badges: new Map(), stuns: new Map(),
    };

    this.glows = [];
    this.drawField();
    this.scooterSprites = this.battle.scooters.map(s => this.add.sprite(SCOOTER.X, rowTop(s.row) + VIEW.UNIT_FOOT_Y, 'scooter', 0)
      .setOrigin(0.5, 1).setDepth(DEPTH.SCOOTER));
    this.cursorGfx = this.add.graphics().setDepth(DEPTH.CURSOR);
    this.porchGfx = this.add.graphics().setDepth(DEPTH.CURSOR);
    this.ghost = this.add.image(0, 0, 'luckycat', 0).setOrigin(0.5, 1).setAlpha(FX.GHOST_ALPHA).setDepth(DEPTH.CURSOR).setVisible(false);
    this.toolIcon = this.add.image(0, 0, 'items', ITEM.STAR).setDepth(DEPTH.FX_TOP).setVisible(false);
    this.toolLabel = this.add.text(0, 0, '', textStyle(UI.SMALL_SIZE, COLORS.TEXT_GOLD, { strokeThickness: 3 }))
      .setOrigin(0.5).setDepth(DEPTH.HUD).setVisible(false);
    this.sobaSprite = this.add.sprite(SOBA.X, 0, 'soba', SOBA_FRAMES.IDLE[0]).setOrigin(0.5, 1);
    this.debugGfx = getDebugOptions().hitboxes ? this.add.graphics().setDepth(DEPTH.DEBUG) : null;

    this.hud = new Hud(this, this.battle, {
      onCard: (key) => this.selectCard(this.selected === key ? null : key),
      onStart: () => this.commands.push({ type: 'start' }),
      onPause: () => this.togglePause(),
      onTool: (tool) => this.selectTool(this.tool === tool ? null : tool),
      onBark: () => this.commands.push({ type: 'bark' }),
      onZoomies: () => this.commands.push({ type: 'zoomies' }),
    });
    this.pauseLayer = this.add.container(0, 0).setDepth(DEPTH.OVERLAY).setVisible(false);
    this.pauseLayer.add([
      this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, COLORS.OVERLAY, COLORS.OVERLAY_ALPHA).setOrigin(0, 0),
      this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 - 10, 'PAUSED', textStyle(UI.TITLE_SIZE, COLORS.TEXT, { strokeThickness: 5 })).setOrigin(0.5),
      this.add.text(GAME.WIDTH / 2, GAME.HEIGHT / 2 + UI.PAUSE_HINT_DY, 'P or tap to resume', textStyle(UI.BODY_SIZE, COLORS.TEXT_MUTED)).setOrigin(0.5),
    ]);

    this.fx = new Effects(this, this.battle, {
      hud: this.hud,
      soba: this.sobaSprite,
      glows: this.glows,
      spriteOf: (kind, id) => (kind === 'u' ? this.views.units : this.views.enemies).get(id) || null,
    });

    this.setupInput();
    this.onResume = () => {
      if (!this.externalPause) return;
      this.externalPause = false;
      gameState.mode = MODES.PLAYING;
      eventBus.emit(Events.GAME_RESUME);
    };
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.cameras.main.fadeIn(TRANSITION.RETRY_FADE_MS, 0, 0, 0);
    eventBus.emit(Events.GAME_START, { level: this.level.id, seed: cfg.seed, startWave: cfg.startWave });
    this.forwardEvents();       // hints queued by the constructor
    this.hud.update(0, null, null);
  }

  // --- static field --------------------------------------------------------------

  drawField() {
    const H = LAYOUT.HOUSE;
    const A = LAYOUT.ALLEY;
    const P = LAYOUT.PORCH;
    // night sky, fence, hedge and a lantern string between the top bar and the grid
    this.glows.push(...drawHedgeBand(this, P.X, H.Y, A.X - P.X, GRID.Y - H.Y, DEPTH.BACKGROUND));
    const gridBottom = GRID.Y + this.battle.rows * GRID.TILE;
    drawPlankEdge(this, P.X, gridBottom, A.X - P.X, LAYOUT.BOTTOM_BAR.Y - gridBottom, DEPTH.BACKGROUND);
    this.add.image(H.X, H.Y, 'house').setOrigin(0, 0).setDepth(DEPTH.BACKGROUND);
    this.add.image(A.X, A.Y, 'alley').setOrigin(0, 0).setDepth(DEPTH.BACKGROUND);
    // soft lantern light on the house and alley art, fireflies over the edges
    this.glows.push(...addGlows(this, H.X, H.Y, SCENERY.HOUSE_GLOWS, DEPTH.TILES));
    this.glows.push(...addGlows(this, A.X, A.Y, SCENERY.ALLEY_GLOWS, DEPTH.TILES));
    addFireflies(this, [
      { x: A.X, y: A.Y + GRID.TILE, w: A.W, h: A.H - GRID.TILE },
      { x: P.X, y: H.Y, w: A.X - P.X, h: GRID.Y - H.Y },
    ], DEPTH.SOBA + 1);
    for (let row = 0; row < this.battle.rows; row++) {
      this.add.image(P.X, rowTop(row), 'tiles', TILE.PORCH).setOrigin(0, 0).setDepth(DEPTH.TILES);
      for (let col = 0; col < GRID.COLS; col++) {
        const frame = (row + col) % 2 ? TILE.GARDEN_DARK : TILE.GARDEN_LIGHT;
        this.add.image(GRID.X + col * GRID.TILE, rowTop(row), 'tiles', frame).setOrigin(0, 0).setDepth(DEPTH.TILES);
      }
    }
  }

  // --- input -------------------------------------------------------------------

  setupInput() {
    const kb = this.input.keyboard;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.onKey = (event) => this.handleKey(event);
    kb.on('keydown', this.onKey);
    this.input.mouse?.disableContextMenu();
    this.onPointerDown = (p) => this.handlePointerDown(p);
    this.onPointerMove = (p) => {
      const cell = cellAt(p.x, p.y, this.battle.rows);
      if (cell) {
        this.cursor = cell;
        this.keyboardCursor = false;
      }
    };
    this.input.on('pointerdown', this.onPointerDown);
    this.input.on('pointermove', this.onPointerMove);
  }

  handleKey(event) {
    const code = event.code;
    if (code === 'KeyP') {
      if (!event.repeat) this.togglePause();
      return;
    }
    if (this.paused || this.battle.outcome) return;
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (digit) {
      const card = Number(digit[1]) <= UI.MAX_CARDS ? this.battle.cards[Number(digit[1]) - 1] : null;
      if (card) this.selectCard(this.selected === card.key ? null : card.key);
      return;
    }
    const move = {
      ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0],
      ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1],
    }[code];
    if (move) {
      this.cursor = {
        row: Phaser.Math.Clamp(this.cursor.row + move[0], 0, this.battle.rows - 1),
        col: Phaser.Math.Clamp(this.cursor.col + move[1], 0, GRID.COLS - 1),
      };
      this.keyboardCursor = true;
      eventBus.emit(Events.CURSOR_MOVE, { ...this.cursor });
      return;
    }
    if (event.repeat) return;
    switch (code) {
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        if (this.tool) this.applyTool(this.cursor.row, this.cursor.col);
        else if (this.selected) this.commands.push({ type: 'place', unit: this.selected, row: this.cursor.row, col: this.cursor.col });
        else if (this.battle.waves.inSetup) this.commands.push({ type: 'start' });
        break;
      case 'KeyB': this.commands.push({ type: 'bark' }); break;
      case 'KeyZ': this.commands.push({ type: 'zoomies' }); break;
      case 'KeyF': this.commands.push({ type: 'sobaMove', row: this.cursor.row }); break;
      case 'KeyU': this.selectTool(this.tool === 'upgrade' ? null : 'upgrade'); break;
      case 'KeyX': this.selectTool(this.tool === 'recall' ? null : 'recall'); break;
      case 'Escape':
        this.selectCard(null);
        this.selectTool(null);
        break;
      default: break;
    }
  }

  handlePointerDown(p) {
    if (this.paused) {
      this.togglePause();
      return;
    }
    if (this.battle.outcome) return;
    if (p.rightButtonDown()) {
      this.selectCard(null);
      this.selectTool(null);
      return;
    }
    if (this.battle.coinAt(p.x, p.y)) {
      this.commands.push({ type: 'collectAt', x: p.x, y: p.y });
      return;
    }
    // A tap on the porch moves Soba to that row
    const P = LAYOUT.PORCH;
    if (p.x >= P.X && p.x < GRID.X && p.y >= GRID.Y && p.y < GRID.Y + this.battle.rows * GRID.TILE) {
      this.commands.push({ type: 'sobaMove', row: Math.floor((p.y - GRID.Y) / GRID.TILE) });
      return;
    }
    const cell = cellAt(p.x, p.y, this.battle.rows);
    if (!cell) return;
    this.cursor = cell;
    this.keyboardCursor = false;
    if (this.tool) this.applyTool(cell.row, cell.col);
    else if (this.selected) this.commands.push({ type: 'place', unit: this.selected, row: cell.row, col: cell.col });
  }

  applyTool(row, col) {
    if (!this.battle.unitAt(row, col)) return;
    this.commands.push({ type: this.tool, row, col });
  }

  selectCard(key) {
    if (key) this.selectTool(null);
    if (this.selected === key) return;
    this.selected = key;
    eventBus.emit(Events.CARD_SELECT, { key });
  }

  selectTool(tool) {
    if (tool) this.selectCard(null);
    if (this.tool === tool) return;
    this.tool = tool;
    eventBus.emit(Events.TOOL_SELECT, { tool });
  }

  togglePause() {
    if (this.battle.outcome) return;
    if (!this.paused && this.scene.manager.keys.PauseScene) {
      // The menus agent's PauseScene takes over; it resumes this scene.
      this.externalPause = true;
      gameState.mode = MODES.PAUSED;
      eventBus.emit(Events.GAME_PAUSE);
      this.scene.launch('PauseScene', { from: 'BattleScene' });
      this.scene.pause();
      return;
    }
    this.paused = !this.paused;
    this.pauseLayer.setVisible(this.paused);
    gameState.mode = this.paused ? MODES.PAUSED : MODES.PLAYING;
    eventBus.emit(this.paused ? Events.GAME_PAUSE : Events.GAME_RESUME);
  }

  // --- loop --------------------------------------------------------------------

  update(_time, delta) {
    const dt = delta / 1000;
    if (this.battle.outcome) {
      this.endTime += dt;
      const delay = this.battle.outcome === 'won' ? VIEW.RESULTS_DELAY_WIN : VIEW.RESULTS_DELAY;
      if (this.endTime >= delay) this.goToResults();
    } else if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc + SIM.EPS >= SIM.DT && steps < SIM.MAX_STEPS_PER_FRAME) {
        let commands = this.commands;
        this.commands = [];
        if (this.bot) commands = commands.concat(this.bot.decide(this.battle));
        this.battle.step(SIM.DT, { commands, cursor: this.keyboardCursor ? this.cursor : null });
        this.forwardEvents();
        this.acc -= SIM.DT;
        steps += 1;
        if (this.battle.outcome) break;
      }
      if (steps >= SIM.MAX_STEPS_PER_FRAME) this.acc = Math.min(this.acc, SIM.DT); // drop the backlog
    }
    this.fx.update(this.paused ? 0 : dt);
    this.renderSim(dt);
    this.hud.update(dt, this.selected, this.tool);
  }

  forwardEvents() {
    for (const ev of this.battle.drainEvents()) {
      const name = SIM_EVENTS[ev.type];
      if (name) eventBus.emit(name, ev);
      switch (ev.type) {
        case 'place':
          this.selectCard(null);
          break;
        case 'placeFail':
          if (PLACE_FAIL_TEXT[ev.reason]) this.hud.toast(PLACE_FAIL_TEXT[ev.reason], UI.TOAST_SHORT_S);
          break;
        case 'upgrade':
        case 'recall':
          this.selectTool(null);
          break;
        case 'upgradeFail':
          if (UPGRADE_FAIL_TEXT[ev.reason]) this.hud.toast(UPGRADE_FAIL_TEXT[ev.reason], UI.TOAST_SHORT_S);
          break;
        case 'abilityFail':
          if (ABILITY_FAIL_TEXT[ev.reason]) this.hud.toast(ABILITY_FAIL_TEXT[ev.reason], UI.TOAST_SHORT_S);
          break;
        case 'hint':
          this.hud.hint(ev.id, ev.text);
          break;
        case 'waveStart':
          if (!ev.flag) this.hud.toast(`Wave ${ev.wave}`, UI.TOAST_WAVE_S);
          break;
        // hugeWave: Effects slides in a banner
        case 'push':
          this.hud.toast('Here comes the last push!');
          break;
        case 'cardUnlock':
          this.hud.toast(`New crew member: ${UNITS[ev.key].name}!`);
          break;
        case 'scooter':
          this.hud.toast('Delivery scooter!', UI.TOAST_SHORT_S);
          break;
        case 'win':
        case 'lose':
          this.finish();
          break;
        default:
          break;
      }
    }
  }

  finish() {
    const result = this.battle.result();
    gameState.result = result;
    gameState.mode = result.won ? MODES.WON : MODES.GAME_OVER;
    this.selectCard(null);
    this.selectTool(null);
    eventBus.emit(result.won ? Events.LEVEL_COMPLETE : Events.GAME_OVER, { result });
  }

  goToResults() {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.fadeOut(FX.RESULTS_FADE_MS, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('ResultsScene', { result: gameState.result }));
  }

  // --- rendering -----------------------------------------------------------------

  acquire(texture) {
    const pool = this.pools.get(texture);
    const s = pool && pool.length ? pool.pop() : this.add.sprite(0, 0, texture, 0);
    s.__texture = texture;
    return s.setVisible(true).setActive(true).setAlpha(1).setAngle(0).setScale(1).setFlipX(false).clearTint()
      .setTintMode(Phaser.TintModes.MULTIPLY);
  }

  release(sprite) {
    sprite.setVisible(false).setActive(false);
    if (!this.pools.has(sprite.__texture)) this.pools.set(sprite.__texture, []);
    this.pools.get(sprite.__texture).push(sprite);
  }

  /** Brings an id -> sprite map in line with the live entities. */
  sync(map, entities, texture, draw, keep = (e) => e.alive) {
    const seen = new Set();
    for (const e of entities) {
      if (!keep(e)) continue;
      seen.add(e.id);
      const want = typeof texture === 'function' ? texture(e) : texture;
      let s = map.get(e.id);
      if (s && s.__texture !== want) {
        this.release(s);
        s = null;
      }
      if (!s) {
        s = this.acquire(want);
        map.set(e.id, s);
      }
      draw(s, e);
    }
    for (const [id, s] of map) {
      if (!seen.has(id)) {
        this.release(s);
        map.delete(id);
      }
    }
  }

  renderSim(dt) {
    const b = this.battle;
    const t = b.time;
    const fx = this.fx;

    this.sync(this.views.units, b.units, (u) => u.key, (s, u) => {
      const def = UNITS[u.key];
      let frame;
      if (def.role === 'wall') {
        const frac = u.hp / u.maxHp;
        frame = Math.min(def.damageFrames - 1, Math.floor((1 - frac) * def.damageFrames));
      } else if (t - u.lastAction < VIEW.ACTION_FRAME_S) {
        frame = UNIT_FRAMES.ACTION;
      } else {
        frame = UNIT_FRAMES.IDLE[Math.floor(t * VIEW.IDLE_FPS + u.id) % 2];
      }
      s.setFrame(frame).setOrigin(0.5, 1).setPosition(u.x, rowTop(u.row) + VIEW.UNIT_FOOT_Y)
        .setDepth(DEPTH.ROW_BASE + u.row * DEPTH.ROW_STEP);
      fx.styleUnit(s, u, t);
    });
    // tier-2 star badge
    this.sync(this.views.badges, b.units, 'items', (s, u) => {
      s.setFrame(ITEM.STAR).setScale(VIEW.BADGE_SCALE).setOrigin(0.5)
        .setPosition(u.x + VIEW.BADGE_DX, rowTop(u.row) + VIEW.UNIT_FOOT_Y - VIEW.BADGE_DY)
        .setDepth(DEPTH.ROW_BASE + u.row * DEPTH.ROW_STEP + 2);
    }, (u) => u.alive && u.tier >= 2);

    // A lid rat that lost its lid is drawn with the plain rat sheet
    const enemyTexture = (e) => (e.key === 'lidrat' && e.lid <= 0 ? 'rat' : e.key);
    this.sync(this.views.enemies, b.enemies, enemyTexture, (s, e) => {
      let frame;
      let lift = 0;
      let biteFrame = -1;
      if (e.state === 'hop' && e.hop) {
        const k = Math.min(1, e.hop.t / MECHANIC.HOP_S);
        lift = Math.sin(k * Math.PI) * MECHANIC.HOP_HEIGHT;
        frame = ENEMY_FRAMES.WALK[1];
      } else if (e.stunLeft > 0) {
        frame = ENEMY_FRAMES.WALK[0];
      } else if (e.state === 'bite') {
        biteFrame = Math.floor(t * VIEW.BITE_FPS) % 2;
        frame = ENEMY_FRAMES.BITE[biteFrame];
      } else {
        frame = ENEMY_FRAMES.WALK[Math.floor(t * VIEW.WALK_FPS + e.id) % 2];
      }
      s.setFrame(frame).setOrigin(0.5, 1).setPosition(Math.round(e.x), Math.round(rowTop(e.row) + VIEW.ENEMY_FOOT_Y - lift))
        .setDepth(DEPTH.ROW_BASE + e.row * DEPTH.ROW_STEP + (lift > 0 ? DEPTH.ROW_STEP - 1 : 1));
      fx.styleEnemy(s, e, t, lift > 0, biteFrame);
    });
    // stun star circling a stunned critter's head
    this.sync(this.views.stuns, b.enemies, 'items', (s, e) => {
      const a = t * VIEW.STUN_ORBIT_HZ * Math.PI * 2 + e.id;
      s.setFrame(ITEM.STAR).setScale(VIEW.STUN_SCALE).setOrigin(0.5)
        .setPosition(Math.round(e.x + Math.cos(a) * VIEW.STUN_ORBIT_R), Math.round(rowTop(e.row) + VIEW.ENEMY_FOOT_Y - VIEW.STUN_Y + Math.sin(a) * 2))
        .setDepth(DEPTH.PROJECTILE);
    }, (e) => e.alive && e.stunLeft > 0);

    this.sync(this.views.projectiles, b.projectiles, 'items', (s, p) => {
      const bob = Math.round(Math.sin((p.x / GRID.TILE) * FX.DUMPLING_BOB_HZ * Math.PI) * FX.DUMPLING_BOB_PX);
      s.setFrame(ITEM.DUMPLING).setOrigin(0.5).setPosition(Math.round(p.x), rowCenterY(p.row) + VIEW.PROJECTILE_Y + bob)
        .setDepth(DEPTH.PROJECTILE);
    });

    const soba = b.soba;
    this.sync(this.views.coins, b.coinsField, 'items', (s, c) => {
      let x = c.x;
      let y = c.y;
      if (c.fetch) {
        const k = Math.min(1, c.fetch.t / SOBA.FETCH_FLIGHT_S);
        x = c.fetch.x0 + (soba.x - c.fetch.x0) * k;
        y = c.fetch.y0 + (soba.y - c.fetch.y0) * k - Math.sin(k * Math.PI) * VIEW.FETCH_ARC;
      } else if (c.source === 'cat' && c.age < ECONOMY.CAT_COIN_HOP_S) {
        const k = c.age / ECONOMY.CAT_COIN_HOP_S;
        x = c.fromX + (c.x - c.fromX) * k;
        y = c.fromY + (c.y - c.fromY) * k - Math.sin(k * Math.PI) * ECONOMY.CAT_COIN_HOP_PX;
      }
      const blink = !c.fetch && c.landed && c.age >= ECONOMY.COIN_BLINK_AT && Math.floor(c.age * VIEW.BLINK_HZ) % 2 === 1;
      s.setFrame(ITEM.COIN).setOrigin(0.5).setPosition(Math.round(x), Math.round(y) + fx.coinDy(c)).setDepth(DEPTH.COIN)
        .setAlpha(blink ? 0.35 : 1);
    });

    b.scooters.forEach((sc, i) => {
      const s = this.scooterSprites[i];
      s.setVisible(sc.state !== 'used');
      const driving = sc.state === 'active';
      const rattle = driving ? Math.floor(t * VIEW.WALK_FPS * 2) % 2 : 0;
      s.setPosition(Math.round(sc.x), rowTop(sc.row) + VIEW.UNIT_FOOT_Y - rattle * FX.SCOOTER_BOUNCE_PX);
      s.setFrame(rattle);
    });

    this.drawSoba(dt);
    this.drawCursor();
    if (this.debugGfx) this.drawDebug();
  }

  drawSoba() {
    const b = this.battle;
    const s = b.soba;
    const t = b.time;
    let frame;
    if (b.outcome === 'won') frame = SOBA_FRAMES.CHEER;
    else if (b.outcome === 'lost') frame = SOBA_FRAMES.SAD;
    else if (s.state === 'run' || s.state === 'zoomies') frame = SOBA_FRAMES.RUN[Math.floor(t * VIEW.RUN_FPS) % SOBA_FRAMES.RUN.length];
    else if (s.state === 'bark') frame = SOBA_FRAMES.BARK[Math.floor(t * VIEW.BARK_FPS) % 2];
    else frame = SOBA_FRAMES.IDLE[Math.floor(t * VIEW.IDLE_FPS) % 2];
    const back = !!s.zoomies && s.zoomies.t > SOBA.ZOOMIES_S / 2;
    this.sobaSprite.setFrame(frame).setFlipX(back)
      .setPosition(Math.round(s.x), Math.round(s.y + VIEW.SOBA_FOOT_DY))
      .setDepth(DEPTH.SOBA);
    this.fx.styleSoba(this.sobaSprite);

    // porch: Soba's row, and where she is heading
    const g = this.porchGfx;
    g.clear();
    const P = LAYOUT.PORCH;
    g.lineStyle(1, COLORS.SOBA_MARK, VIEW.PORCH_MARK_ALPHA).strokeRect(P.X + 1, rowTop(s.targetRow) + 1, P.W - 2, GRID.TILE - 2);
  }

  drawCursor() {
    const g = this.cursorGfx;
    g.clear();
    const { row, col } = this.cursor;
    const x = GRID.X + col * GRID.TILE;
    const y = rowTop(row);
    const show = (this.keyboardCursor || this.selected || this.tool) && !this.battle.outcome;
    this.toolLabel.setVisible(false);
    if (!show) {
      this.ghost.setVisible(false);
      this.toolIcon.setVisible(false);
      return;
    }
    let color = COLORS.CURSOR;
    if (this.tool) {
      const u = this.battle.unitAt(row, col);
      color = this.tool === 'upgrade' ? COLORS.TOOL_UPGRADE : COLORS.TOOL_RECALL;
      if (u) {
        let label;
        if (this.tool === 'recall') label = `+${this.battle.refundAt(row, col)}`;
        else {
          const why = this.battle.canUpgradeAt(row, col);
          const t2 = UNITS[u.key].tier2;
          label = why === 'max_tier' ? 'MAX' : (t2 ? `-${t2.cost}` : 'n/a');
          if (why) color = COLORS.CURSOR_BAD;
        }
        this.toolLabel.setText(label).setPosition(x + GRID.TILE / 2, y + UI.TOOL_LABEL_DY).setVisible(true);
      }
    } else if (this.selected && this.battle.canPlace(this.selected, row, col)) {
      color = COLORS.CURSOR_BAD;
    }
    const bad = color === COLORS.CURSOR_BAD;
    if (this.selected) {
      // ghost preview of the unit: green tile when it fits, red when it doesn't
      g.fillStyle(bad ? FX_COLORS.GHOST_BAD : FX_COLORS.GHOST_OK, FX.GHOST_TILE_ALPHA).fillRect(x, y, GRID.TILE, GRID.TILE);
      this.ghost.setTexture(this.selected, 0).setPosition(tileCenterX(col), y + VIEW.UNIT_FOOT_Y)
        .setDepth(DEPTH.ROW_BASE + row * DEPTH.ROW_STEP + DEPTH.ROW_STEP / 2).setVisible(true);
      if (bad) this.ghost.setTint(FX_COLORS.GHOST_BAD);
      else this.ghost.clearTint();
    } else {
      this.ghost.setVisible(false);
    }
    g.lineStyle(2, color, 1).strokeRect(x + 1, y + 1, GRID.TILE - 2, GRID.TILE - 2);
    // tool cursor icon (star = upgrade, coin = recall) bobbing at the tile corner
    if (this.tool) {
      const bob = Math.round(Math.sin(this.fx.time * FX.TOOL_ICON_BOB_HZ * Math.PI * 2) * FX.TOOL_ICON_BOB_PX);
      this.toolIcon.setFrame(this.tool === 'upgrade' ? ITEM.STAR : ITEM.COIN)
        .setPosition(x + FX.TOOL_ICON_DX, y + FX.TOOL_ICON_DY + bob).setVisible(true);
    } else {
      this.toolIcon.setVisible(false);
    }
  }

  drawDebug() {
    const g = this.debugGfx;
    const b = this.battle;
    g.clear();
    g.lineStyle(1, COLORS.DEBUG_GRID, 0.6);
    for (let c = 0; c <= GRID.COLS; c++) g.lineBetween(GRID.X + c * GRID.TILE, GRID.Y, GRID.X + c * GRID.TILE, GRID.Y + b.rows * GRID.TILE);
    for (let r = 0; r <= b.rows; r++) g.lineBetween(GRID.X, rowTop(r), GRID.RIGHT, rowTop(r));
    g.lineStyle(1, COLORS.DEBUG_REACH, 0.8).lineBetween(ENEMY.FIRE_RANGE_X, GRID.Y, ENEMY.FIRE_RANGE_X, GRID.BOTTOM);
    g.lineStyle(1, COLORS.BARK_WAVE, 0.8).lineBetween(BARK_RANGE_X, GRID.Y, BARK_RANGE_X, GRID.BOTTOM);
    for (const e of b.enemies) {
      if (!e.alive) continue;
      const cy = rowCenterY(e.row);
      g.lineStyle(1, COLORS.DEBUG_BOX, 1).strokeRect(e.x - ENEMY.HALF_W, cy - ENEMY.HALF_W, ENEMY.HALF_W * 2, ENEMY.HALF_W * 2);
      g.lineStyle(1, COLORS.DEBUG_REACH, 1).lineBetween(e.x - ENEMY.BITE_REACH, cy, e.x, cy);
    }
  }

  // --- test hook -----------------------------------------------------------------

  snapshot() {
    return {
      ...this.battle.snapshot(),
      level: this.level.id,
      levelNumber: this.level.number,
      selectedCard: this.selected,
      tool: this.tool,
      cursor: { ...this.cursor, keyboard: this.keyboardCursor },
      hintVisible: this.hud.hints.current,
      paused: this.paused || this.externalPause,
      bot: this.bot ? this.bot.name : null,
    };
  }

  cleanup() {
    this.input.keyboard?.off('keydown', this.onKey);
    this.input.off('pointerdown', this.onPointerDown);
    this.input.off('pointermove', this.onPointerMove);
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume);
    this.fx?.destroy();
    this.pools.clear();
    for (const m of Object.values(this.views)) m.clear();
  }
}
