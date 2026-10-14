import Phaser from 'phaser';
import {
  GAME, WORLD, PARALLAX, DEPTH, OBSTACLE, BARREL, BONE, STEAK, PLATFORM, STEAM, ENEMY, WALL,
  HAZARD, BREAKABLE, FX,
} from '../core/Constants.js';
import { ANIMS } from '../core/Assets.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState, MODES } from '../core/GameState.js';
import {
  createMoverStates, createSteamStates, stepMover, stepSteam, steamPhase,
} from './LevelModel.js';
import { ensureFxTextures } from '../fx/textures.js';
import { SteamView } from '../fx/SteamView.js';
import { UpdraftView } from '../fx/UpdraftView.js';

// =============================================================================
// LevelWorld — builds a level's Phaser objects from its LevelModel and steps
// the moving parts each frame. Level 1 objects (backgrounds, ground, obstacles,
// barrels, bones, steak) are built exactly as before the Levels 2-6 work.
//
// Moving hazards and enemies are kinematic: their position comes from the
// shared stepMover() (also used by the bot's simulator); their Arcade bodies
// have moves = false and just follow the sprite. Barrels still roll with
// Arcade velocity (unchanged Level 1 behaviour; the simulator mirrors it).
//
// Steam vents and updrafts are drawn by src/fx/SteamView.js and UpdraftView.js
// (visual only; this class keeps the clocks, bodies and STEAM_* events).
// =============================================================================

const G = WORLD.GROUND_Y;

export class LevelWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} model  buildLevelModel(level)
   * @param {object} theme  registry theme (texture keys)
   * @param {number} startX bones before this x are skipped (debug starts)
   */
  constructor(scene, model, theme, startX) {
    this.scene = scene;
    this.model = model;
    this.level = model.level;
    this.theme = theme;
    this.startX = startX;
    ensureFxTextures(scene);

    this.moverStates = createMoverStates(model);
    this.steamStates = createSteamStates(model);
    this.breakableAlive = model.breakables.map(() => true);
    this.moverSprites = new Array(model.movers.length).fill(null);
    this.steamViews = [];
  }

  /** Builds everything in draw/collider order. */
  build() {
    this.buildBackgrounds();
    this.buildGround();
    this.buildPlatforms();
    this.buildWalls();
    this.buildUpdrafts();
    this.buildObstacles();
    this.buildHazards();
    this.buildEnemies();
    this.buildBreakables();
    this.buildSteam();
    this.buildBones();
    this.buildFinish();
  }

  // --- static scenery --------------------------------------------------------

  buildBackgrounds() {
    const scene = this.scene;
    const lv = this.level;
    // Registry override (theme.parallax, Level 1) > level data > defaults
    const pv = { ...lv.parallax, ...this.theme.parallax };
    const far = pv.far ?? Math.min(PARALLAX.FAR, PARALLAX.FAR_MAX_TRAVEL / lv.length);
    const mid = pv.mid ?? PARALLAX.MID;
    const near = pv.near ?? PARALLAX.NEAR;
    const add = (key, factor, depth) => {
      const ts = scene.add.tileSprite(0, 0, GAME.WIDTH, GAME.HEIGHT, key)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
      ts.parallax = factor;
      return ts;
    };
    this.bgLayers = [
      add(this.theme.bgFar, far, DEPTH.BG_FAR),
      add(this.theme.bgMid, mid, DEPTH.BG_MID),
      add(this.theme.bgNear, near, DEPTH.BG_NEAR),
    ];
  }

  /** Ground = level length minus gaps. One static body per solid segment. */
  buildGround() {
    const scene = this.scene;
    const lv = this.level;
    this.groundBodies = scene.physics.add.staticGroup();
    for (const [x0, x1] of this.model.segments) {
      // Visual: chunks so no TileSprite gets huge
      // The last segment (body and art) runs a screen past the level end, so the
      // run-out never shows a void and a jump over the finish lands on ground
      const artEnd = x1 >= lv.length ? Math.max(x1, lv.length + GAME.WIDTH) : x1;
      for (let cx = x0; cx < artEnd; cx += WORLD.GROUND_CHUNK_W) {
        const w = Math.min(WORLD.GROUND_CHUNK_W, artEnd - cx);
        scene.add.tileSprite(cx, G, w, GAME.HEIGHT - G, this.theme.ground)
          .setOrigin(0, 0).setDepth(DEPTH.GROUND)
          .setTilePosition(cx % WORLD.TILE, 0);
      }
      const zone = scene.add.zone(x0, G, x1 - x0, WORLD.TILE).setOrigin(0, 0);
      this.groundBodies.add(zone);
    }
    this.groundBodies.refresh();

    // What shows inside a pit (water, alley, glow). Level 1 shows the backdrop.
    if (this.theme.pit) {
      for (const g of this.model.gaps) {
        scene.add.tileSprite(g.x, G, g.width, GAME.HEIGHT - G, this.theme.pit)
          .setOrigin(0, 0).setDepth(DEPTH.PIT)
          .setTilePosition(g.x % WORLD.TILE, 0);
      }
    }
  }

  buildPlatforms() {
    const scene = this.scene;
    this.platformBodies = scene.physics.add.staticGroup();
    for (const p of this.model.platforms) {
      scene.add.tileSprite(p.x, p.y, p.w, PLATFORM.TILE_H, this.theme.platform)
        .setOrigin(0, 0).setDepth(DEPTH.PLATFORM)
        .setTilePosition(p.x % PLATFORM.TILE_W, 0);
      const zone = scene.add.zone(p.x, p.y, p.w, p.h).setOrigin(0, 0);
      this.platformBodies.add(zone);
      // One-way: only the top collides
      const cc = zone.body.checkCollision;
      cc.down = false;
      cc.left = false;
      cc.right = false;
    }
    this.platformBodies.refresh();
  }

  buildWalls() {
    const scene = this.scene;
    this.wallBodies = scene.physics.add.staticGroup();
    const tint = FX.WALL_TINTS[scene.entry?.number];   // visual only: fit the factory wall art to the level
    for (const w of this.model.walls) {
      const art = scene.add.tileSprite(w.x, w.top, w.w, G - w.top, this.theme.wall || WALL.KEY)
        .setOrigin(0, 0).setDepth(DEPTH.WALL)
        .setTilePosition(w.x % WALL.TILE, 0);
      if (tint !== undefined) art.setTint(tint);
      const zone = scene.add.zone(w.x, w.y, w.w, w.h).setOrigin(0, 0);
      this.wallBodies.add(zone);
    }
    this.wallBodies.refresh();
  }

  buildUpdrafts() {
    // Visual only: fill, dashed edges, rising streaks and leaves (src/fx/UpdraftView.js)
    this.updraftViews = this.model.updrafts.map(u => new UpdraftView(this.scene, u, this.model.gaps));
  }

  // --- deadly things ---------------------------------------------------------

  /** Level 1 obstacles (cone, crate, pallets, barrel). Unchanged behaviour. */
  buildObstacles() {
    const scene = this.scene;
    this.obstacles = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.barrelByDef = new Map();
    const list = [...(this.level.obstacles || [])].sort((a, b) => a.x - b.x);
    for (const def of list) {
      const spec = OBSTACLE[def.type];
      if (!spec) continue;
      const o = this.obstacles.create(def.x, G, def.type);
      o.setOrigin(0.5, 1).setDepth(DEPTH.OBSTACLE);
      // Barrels spin, so they need a centre origin (a bottom origin swings them into the ground)
      if (def.type === 'barrel') {
        o.setOrigin(0.5, 0.5).setY(G - spec.H / 2);
        this.barrelByDef.set(def, o);
      }
      o.body.setSize(spec.HIT_W, spec.HIT_H, false);
      o.body.setOffset(spec.HIT_X, spec.HIT_Y);
      o.body.reset(o.x, o.y);
      o.setData('type', def.type);
      o.setData('rolling', false);
    }
    this.obstacleList = this.obstacles.getChildren();
  }

  /** Static hazards + scuttling/flying ones. */
  buildHazards() {
    const scene = this.scene;
    this.hazards = scene.physics.add.group({ allowGravity: false, immovable: true });
    for (const h of this.model.statics) {
      if (OBSTACLE[h.type]) continue;               // Level 1 obstacles are in this.obstacles
      const spec = this.hazardSpec(h.type);
      if (!spec) continue;
      const base = G - (h.def.y || 0);
      const o = this.hazards.create(h.def.x, base, spec.key);
      o.setDepth(DEPTH.OBSTACLE);
      if (spec.spin) {
        o.setOrigin(0.5, 0.5).setY(base - spec.H / 2);
        scene.tweens.add({ targets: o, angle: 360, duration: 1200, repeat: -1 });
      } else {
        o.setOrigin(0.5, 1);
      }
      this.fitBody(o, spec);
      o.setData('type', h.type);
    }
    this.model.movers.forEach((m, i) => {
      if (m.kind !== 'scuttle' && m.kind !== 'fly') return;
      const spec = m.spec;
      const o = this.hazards.create(m.x0, m.base, spec.key);
      o.setDepth(DEPTH.OBSTACLE);
      if (m.kind === 'fly') {
        o.setOrigin(0.5, 0.5);
        if (scene.anims.exists(ANIMS.PIGEON)) o.play(ANIMS.PIGEON);
      } else {
        o.setOrigin(0.5, 1);
      }
      this.fitBody(o, spec);
      o.body.moves = false;
      o.setData('type', m.type);
      o.setData('mover', i);
      this.moverSprites[i] = o;
    });
    this.hazardList = this.hazards.getChildren();
  }

  buildEnemies() {
    const scene = this.scene;
    this.enemies = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.model.movers.forEach((m, i) => {
      if (m.kind !== 'enemy') return;
      const spec = m.spec;
      const o = this.enemies.create(m.x0, m.base, spec.key);
      o.setOrigin(0.5, spec.fly ? 0.5 : 1).setDepth(DEPTH.ENEMY);
      const anim = m.type === 'drone' ? ANIMS.DRONE : ANIMS.VACUUM;
      if (scene.anims.exists(anim)) o.play(anim);
      this.fitBody(o, spec);
      o.body.moves = false;
      o.setData('type', m.type);
      o.setData('mover', i);
      this.moverSprites[i] = o;
    });
  }

  buildBreakables() {
    const scene = this.scene;
    this.breakables = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.model.breakables.forEach((b, i) => {
      const spec = this.breakableSpec(b.type);
      const o = this.breakables.create(b.def.x, G - (b.def.y || 0), spec.key);
      o.setOrigin(0.5, 1).setDepth(DEPTH.OBSTACLE);
      this.fitBody(o, spec);
      o.setData('type', b.type);
      o.setData('index', i);
    });
  }

  buildSteam() {
    const scene = this.scene;
    this.steamBodies = scene.physics.add.staticGroup();
    this.model.steams.forEach((st, i) => {
      // Visual only: vent, wind-up glow and sputter, the column (src/fx/SteamView.js)
      this.steamViews.push(new SteamView(scene, st));
      const zone = scene.add.zone(st.rect.x, st.rect.y, st.rect.w, st.rect.h).setOrigin(0, 0);
      zone.setData('steam', i);
      this.steamBodies.add(zone);
    });
    this.steamBodies.refresh();
  }

  // --- pickups and the finish -------------------------------------------------

  buildBones() {
    const scene = this.scene;
    this.bones = scene.physics.add.group({ allowGravity: false, immovable: true });
    for (const def of this.level.bones || []) {
      if (def.x < this.startX) continue;
      const b = this.bones.create(def.x, G - def.h, 'bone');
      b.setDepth(DEPTH.PICKUP);
      b.body.setSize(BONE.HIT_W, BONE.HIT_H, false);
      b.body.setOffset((BONE.W - BONE.HIT_W) / 2, (BONE.H - BONE.HIT_H) / 2);
      b.body.reset(b.x, b.y);
    }
    // Gentle bob; Arcade re-syncs each body from its sprite every step
    scene.tweens.add({
      targets: this.bones.getChildren(),
      y: `-=${BONE.BOB_AMPLITUDE}`,
      duration: BONE.BOB_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  buildFinish() {
    const f = this.model.finish;
    const steak = this.scene.physics.add.image(this.level.finishX, G, f.key);
    steak.setOrigin(0.5, 1).setDepth(DEPTH.PICKUP);
    steak.body.setAllowGravity(false);
    steak.body.setImmovable(true);
    steak.body.setSize(f.W + STEAK.HIT_PAD * 2, f.H + STEAK.HIT_PAD * 2, false);
    steak.body.setOffset(-STEAK.HIT_PAD, -STEAK.HIT_PAD);
    steak.body.reset(steak.x, steak.y);
    this.steak = steak;
  }

  // --- helpers ---------------------------------------------------------------

  hazardSpec(type) {
    return HAZARD[type] || null;
  }

  breakableSpec(type) {
    return BREAKABLE[type];
  }

  fitBody(o, spec) {
    o.body.setSize(spec.HIT_W, spec.HIT_H, false);
    o.body.setOffset(spec.HIT_X, spec.HIT_Y);
    o.body.reset(o.x, o.y);
  }

  // --- per frame -----------------------------------------------------------------

  /**
   * @param {number} dt       ms
   * @param {number} playerX  Booker's sprite x
   * @param {boolean} playing gameplay frame (movers/steam advance only then)
   */
  update(dt, playerX, playing) {
    this.updateBarrels(dt, playerX);
    if (!playing) return;
    const model = this.model;
    for (let i = 0; i < model.movers.length; i++) {
      const m = model.movers[i];
      if (m.kind === 'barrel') continue;
      const s = this.moverStates[i];
      if (!s.alive) continue;
      stepMover(m, s, dt, playerX);
      const o = this.moverSprites[i];
      if (o) {
        o.x = s.x;
        o.y = s.y + s.bob;   // enemy art faces left (toward Booker) and is never flipped
      }
    }
    for (let i = 0; i < model.steams.length; i++) {
      const st = model.steams[i];
      const s = this.steamStates[i];
      stepSteam(st, s, dt, playerX);
      this.syncSteamView(i, steamPhase(st, s), dt);
    }
  }

  /** Level 1 barrel logic, unchanged. */
  updateBarrels(dt, px) {
    for (const o of this.obstacleList) {
      if (o.getData('type') !== 'barrel') continue;
      if (!o.getData('rolling') && o.x - px < BARREL.ACTIVATE_AHEAD && gameState.mode === MODES.PLAYING) {
        o.setData('rolling', true);
        o.body.setVelocityX(-BARREL.ROLL_SPEED);
      }
      if (o.getData('rolling')) {
        o.angle -= BARREL.ROLL_SPEED * (dt / 1000) * BARREL.SPIN_DEG_PER_PX;
      }
    }
  }

  syncSteamView(i, phase, dt = 0) {
    const v = this.steamViews[i];
    if (!v) return;
    const st = this.model.steams[i];
    if (v.phase !== phase) {
      v.setPhase(phase);
      if (phase === 'on') eventBus.emit(Events.STEAM_ON, { x: st.x });
      else if (phase === 'windup') eventBus.emit(Events.STEAM_WINDUP, { x: st.x });
    }
    // Visual only: wind-up progress 0..1 for the vent glow
    const s = this.steamStates[i];
    const p = ((s.clock + st.offset) % st.period + st.period) % st.period;
    v.update(dt, (p - (st.period - STEAM.WINDUP_MS)) / STEAM.WINDUP_MS);
  }

  isSteamOn(i) {
    return steamPhase(this.model.steams[i], this.steamStates[i]) === 'on';
  }

  /** A stomp: the enemy stops, flashes and squashes flat, then pops up and spins off-screen. */
  stompEnemy(o) {
    const i = o.getData('mover');
    if (i !== undefined) this.moverStates[i].alive = false;
    o.body.enable = false;
    // Visual only from here (the body is already off)
    o.anims?.pause();
    o.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.tweens.chain({
      targets: o,
      tweens: [
        {
          scaleX: FX.STOMP_SQUASH_X,
          scaleY: FX.STOMP_SQUASH_Y,
          duration: FX.STOMP_SQUASH_MS,
          ease: 'Quad.easeOut',
          onComplete: () => o.clearTint(),
        },
        {
          y: o.y - 60,
          angle: 540,
          alpha: 0,
          scaleX: 1,
          scaleY: 1,
          duration: ENEMY.POP_MS,
          ease: 'Quad.easeOut',
        },
      ],
      onComplete: () => o.setVisible(false),
    });
  }

  smashBreakable(o) {
    const i = o.getData('index');
    if (i !== undefined) this.breakableAlive[i] = false;
    o.body.enable = false;
    o.setVisible(false);
  }

  /** Runtime state for the bot's simulator (barrels read from their sprites). */
  simState() {
    const movers = this.model.movers.map((m, i) => {
      if (m.kind === 'barrel') {
        const o = this.barrelByDef.get(m.def);
        return { x: o ? o.x : m.x0, y: G, active: !!o?.getData('rolling'), alive: true, t: 0, dir: -1, bob: 0 };
      }
      return { ...this.moverStates[i] };
    });
    return {
      movers,
      steams: this.steamStates.map(s => ({ ...s })),
      breakables: this.breakableAlive.slice(),
    };
  }

  /** Nearby things ahead of x, for render_game_to_text(). */
  ahead(x, range = 600) {
    const near = (rx) => rx + 40 >= x && rx <= x + range;
    const r = (o) => ({ x: Math.round(o.x), y: Math.round(o.y), w: o.w, h: o.h });
    return {
      platforms: this.model.platforms.filter(p => near(p.x) || (p.x < x && p.x + p.w > x)).slice(0, 3).map(r),
      walls: this.model.walls.filter(w => near(w.x)).slice(0, 3).map(w => ({ ...r(w), h: G - w.top })),
      updrafts: this.model.updrafts.filter(u => near(u.x)).slice(0, 2).map(u => ({ ...r(u), strength: u.strength })),
      enemies: this.model.movers.map((m, i) => ({ m, s: this.moverStates[i] }))
        .filter(({ m, s }) => m.kind === 'enemy' && s.alive && near(s.x)).slice(0, 3)
        .map(({ m, s }) => ({ type: m.type, x: Math.round(s.x), y: Math.round(s.y + s.bob), active: s.active })),
      breakables: this.model.breakables.filter((b, i) => this.breakableAlive[i] && near(b.rect.x)).slice(0, 3)
        .map(b => ({ type: b.type, ...r(b.rect) })),
      hazards: [
        ...this.model.statics.filter(h => !OBSTACLE[h.type] && near(h.rect.x)).map(h => ({ type: h.type, ...r(h.rect) })),
        ...this.model.movers.map((m, i) => ({ m, s: this.moverStates[i] }))
          .filter(({ m, s }) => (m.kind === 'scuttle' || m.kind === 'fly') && s.alive && near(s.x))
          .map(({ m, s }) => ({ type: m.type, x: Math.round(s.x), y: Math.round(s.y), active: s.active })),
        ...this.model.steams.map((st, i) => ({ st, i })).filter(({ st }) => near(st.x))
          .map(({ st, i }) => ({ type: 'steam', x: st.x, phase: steamPhase(st, this.steamStates[i]) })),
      ].sort((a, b) => a.x - b.x).slice(0, 4),
    };
  }
}
