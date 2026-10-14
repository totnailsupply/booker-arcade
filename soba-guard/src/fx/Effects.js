import Phaser from 'phaser';
import {
  FX, FX_COLORS, FX_PARTICLES, COLORS, DEPTH, GAME, GRID, UI, VIEW, SOBA, MECHANIC, SCOOTER, ECONOMY,
} from '../core/Constants.js';
import { META_FONT } from '../core/MetaConstants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { ITEM } from '../core/Assets.js';
import { rowTop, rowCenterY, tileCenterX } from '../sim/Grid.js';
import { BARK_RANGE_X } from '../sim/Soba.js';
import { FXK, ensureFxTextures } from './FxTextures.js';
import { flickerGlows, addConfetti } from './Ambient.js';

// =============================================================================
// Effects — game feel for the battle (Step 3a). Purely visual: it listens to
// the sim's events on the EventBus (sim:*) and reads the Battle for positions,
// and never changes the simulation.
//
//   hit        white flash + squash on the critter, steam puff / lid clang
//   kill       the critter flattens and fades, dust + pixels, "+10"
//   lid off    the lid tumbles away spinning, clang sparks
//   hop        crow take-off dust + a feather or two, landing dust
//   coins      drop sparkle + landing bounce, glints, collect -> flies to the
//              counter (the counter bumps)
//   defenders  place pop + dust ring, idle breathing, shoot recoil + steam,
//              cat hop on a coin, bitten flicker (white/red), crumble on loss
//   scooter    shake, speed lines, exhaust puffs
//   bark       sound rings along the row, "WOOF!", stunned critters shake
//   zoomies    afterimage trail, dust, impact sparks
//   huge wave  banner slides in with a flag pop
//   win        confetti, flash, Soba hops, slow-motion feel
//   loss       the screen darkens and desaturates
//
// All moving pieces are pooled and capped (FX.CAP_*, FX.*_POOL). Time comes
// from the frame delta (scaled by the win slow motion), so pause and the
// deterministic test clock both behave.
//
// BattleScene uses: update(dt), styleUnit/styleEnemy/styleSoba (render-layer
// juice on top of the sim's pose), coinDy(c), destroy().
// =============================================================================

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const backOut = Phaser.Math.Easing.Back.Out;

/** Fixed-size pool: reuses a free item, else the one closest to done. */
class Pool {
  constructor(cap, make) {
    this.cap = cap;
    this.make = make;
    this.items = [];
  }

  get() {
    let best = null;
    for (const it of this.items) {
      if (!it.fxOn) return it;
      if (!best || it.fxLeft < best.fxLeft) best = it;
    }
    if (this.items.length < this.cap) {
      const it = this.make();
      this.items.push(it);
      return it;
    }
    return best;
  }

  each(fn) {
    for (const it of this.items) if (it.fxOn) fn(it);
  }
}

export class Effects {
  /**
   * @param {Phaser.Scene} scene BattleScene
   * @param {import('../sim/Battle.js').Battle} battle
   * @param {{ hud, soba: Phaser.GameObjects.Sprite, spriteOf: (kind, id) => any, glows: any[] }} opts
   */
  constructor(scene, battle, { hud, soba, spriteOf, glows = [] }) {
    this.scene = scene;
    this.battle = battle;
    this.hud = hud;
    this.soba = soba;
    this.spriteOf = spriteOf;
    this.glows = glows;
    ensureFxTextures(scene);
    Effects.resetTimeScales(scene);

    this.time = 0;              // effect time (s), slowed by the win slow motion
    this.scale = 1;             // current effect time scale
    this.juice = new Map();     // 'u12' / 'e7' -> timers
    this.later = [];            // [{ t, fn }] delayed one-shots (effect time)
    this.bark = null;           // { row, t }
    this.afterT = 0;
    this.zoomDustT = 0;
    this.trailT = 0;
    this.scooterT = new Map();  // row -> { line, puff }
    this.glintT = new Map();    // coin id -> seconds to the next glint
    this.end = null;            // { won, t }
    this.flash = null;          // { color, alpha, t, dur }

    this.makeEmitters();
    this.makePools();
    this.g = scene.add.graphics().setDepth(DEPTH.FX);
    this.flashRect = scene.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, FX_COLORS.FLASH_WIN, 1)
      .setOrigin(0, 0).setDepth(DEPTH.HUD - 1).setAlpha(0);
    this.darkRect = scene.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, FX_COLORS.LOSS_DARK, 1)
      .setOrigin(0, 0).setDepth(DEPTH.HUD - 2).setAlpha(0);
    this.colorFilter = null;
    this.banner = null;

    const on = (name, fn) => this.on.push([name, fn]);
    this.on = [];
    on(Events.SIM_HIT, e => this.onHit(e));
    on(Events.SIM_KILL, e => this.onKill(e));
    on(Events.SIM_LID_OFF, e => this.onLidOff(e));
    on(Events.SIM_HOP, e => this.onHop(e));
    on(Events.SIM_COIN_DROP, e => this.onCoinDrop(e));
    on(Events.SIM_COIN_COLLECT, e => this.onCoinCollect(e));
    on(Events.SIM_COIN_EXPIRE, e => this.puff(e.x, e.y, 4, FX_COLORS.DUST));
    on(Events.SIM_PLACE, e => this.onPlace(e));
    on(Events.SIM_SHOOT, e => this.onShoot(e));
    on(Events.SIM_UNIT_LOST, e => this.onUnitLost(e));
    on(Events.SIM_UPGRADE, e => this.onUpgrade(e));
    on(Events.SIM_RECALL, e => this.onRecall(e));
    on(Events.SIM_SCOOTER, e => this.onScooter(e));
    on(Events.SIM_BARK, e => this.onBark(e));
    on(Events.SIM_ZOOMIES, () => this.shake(FX.ZOOM_SHAKE_MS, FX.ZOOM_SHAKE));
    on(Events.SIM_ZOOMIES_READY, () => this.hudSparkle(UI.ZOOMIES_X, UI.ABILITY_Y, 10));
    on(Events.SIM_SOBA_MOVE, () => this.puff(battle.soba.x, battle.soba.y + VIEW.SOBA_FOOT_DY, 3, FX_COLORS.DUST));
    on(Events.SIM_EMBER, e => this.onEmber(e));
    on(Events.SIM_HUGE_WAVE, e => this.showBanner(e.final ? 'Final wave!' : 'A big wave is coming!'));
    on(Events.SIM_CARD_UNLOCK, () => this.later.push({ t: 0.05, fn: () => this.cardSparkle(this.battle.cards.length - 1) }));
    on(Events.SIM_HOUSE_HIT, () => this.onHouseHit());
    on(Events.SIM_WIN, () => this.onWin());
    on(Events.SIM_LOSE, () => this.onLose());
    for (const [ev, fn] of this.on) eventBus.on(ev, fn);
  }

  static resetTimeScales(scene) {
    scene.tweens.timeScale = 1;
    scene.time.timeScale = 1;
  }

  // --- setup -------------------------------------------------------------------------

  makeEmitters() {
    const s = this.scene;
    const P = (tex, cfg, cap, depth = DEPTH.FX) => s.add.particles(0, 0, tex, {
      emitting: false, maxAliveParticles: cap, ...cfg,
    }).setDepth(depth);
    const X = FX_PARTICLES;
    const add = Phaser.BlendModes.ADD;
    this.dust = P(FXK.DUST, X.DUST, FX.CAP_DUST);
    this.pixels = P(FXK.PIXEL, X.PIXELS, FX.CAP_PIXELS);
    this.sparks = P(FXK.SPARK, { ...X.SPARKS, blendMode: add }, FX.CAP_SPARKS, DEPTH.FX_TOP);
    this.feathers = P('items', { ...X.FEATHERS, frame: ITEM.FEATHER }, FX.CAP_FEATHERS, DEPTH.FX_TOP);
    this.lines = P(FXK.LINE, X.LINES, FX.CAP_LINES);
    this.trail = P(FXK.DUST, X.TRAIL, FX.CAP_TRAIL);
    this.confetti = addConfetti(s, DEPTH.OVERLAY - 1);
    this.hudSparks = P(FXK.SPARK, { ...X.HUD_SPARKS, tint: FX_COLORS.COIN_SPARK, blendMode: add }, FX.CAP_HUD_SPARKS, DEPTH.HUD_FX);
    this.emitters = [this.dust, this.pixels, this.sparks, this.feathers, this.lines, this.trail, this.confetti, this.hudSparks];
  }

  makePools() {
    const s = this.scene;
    this.ghosts = new Pool(FX.GHOST_POOL, () => s.add.image(0, 0, 'items', 0).setVisible(false));
    this.lids = new Pool(FX.LID_POOL, () => s.add.image(0, 0, 'items', ITEM.LID).setDepth(DEPTH.FX).setVisible(false));
    this.coins = new Pool(FX.FLY_COIN_POOL, () => s.add.image(0, 0, 'items', ITEM.COIN).setDepth(DEPTH.HUD_FX).setVisible(false));
    this.afters = new Pool(FX.AFTERIMAGE_POOL, () => s.add.image(0, 0, 'soba', 0).setOrigin(0.5, 1)
      .setDepth(DEPTH.SOBA - 1).setVisible(false));
    this.pops = new Pool(FX.POP_POOL, () => s.add.text(0, 0, '', {
      fontFamily: META_FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, fontStyle: 'bold',
      color: FX_COLORS.POP_TEXT, stroke: '#1a1220', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.FX_TOP).setVisible(false));
  }

  // --- small helpers -------------------------------------------------------------------

  /** Timers for one entity ('u' unit / 'e' enemy), created on demand. */
  j(kind, id, create = false) {
    const key = kind + id;
    let t = this.juice.get(key);
    if (!t && create) {
      t = { pop: 0, squash: 0, recoil: 0, hop: 0, jitter: 0, glow: 0 };
      this.juice.set(key, t);
    }
    return t;
  }

  shake(ms, intensity) {
    this.scene.cameras.main.shake(ms, intensity);
  }

  puff(x, y, n, tint) {
    this.dust.setParticleTint(tint);
    for (let i = 0; i < n; i++) this.dust.emitParticleAt(x + rand(-FX.PUFF_JITTER_X, FX.PUFF_JITTER_X), y + rand(-FX.PUFF_JITTER_Y, FX.PUFF_JITTER_Y), 1);
  }

  burst(emitter, n, x, y, tint) {
    emitter.setParticleTint(tint);
    emitter.explode(n, x, y);
  }

  hudSparkle(x, y, n = FX.COIN_ARRIVE_SPARKS) {
    this.hudSparks.explode(n, x, y);
  }

  cardSparkle(index) {
    if (index < 0) return;
    const x = UI.CARD_X + index * (UI.CARD_W + UI.CARD_GAP) + UI.CARD_W / 2;
    this.hudSparkle(x, UI.CARD_Y + UI.CARD_H / 2, FX.CARD_UNLOCK_SPARKS);
  }

  feetY(row) {
    return rowTop(row) + VIEW.ENEMY_FOOT_Y;
  }

  /** A number/word that pops big, settles, rises and fades. */
  pop(x, y, text, color = FX_COLORS.POP_TEXT, dur = FX.POP_S, rise = FX.POP_RISE) {
    const t = this.pops.get();
    t.setText(text).setColor(color).setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1).setScale(FX.POP_SCALE);
    t.fxOn = true;
    t.fxLeft = dur;
    t.fxDur = dur;
    t.fxY = Math.round(y);
    t.fxRise = rise;
  }

  /** A copy of a sprite that flattens (death) or sinks (crumble) and fades. */
  ghost(src, mode, dur) {
    if (!src) return null;
    const gimg = this.ghosts.get();
    gimg.setTexture(src.texture.key, src.frame.name).setOrigin(0.5, 1).setFlipX(src.flipX)
      .setPosition(src.x, src.y).setDepth(src.depth).setVisible(true).setAlpha(1).setScale(1).setAngle(0);
    gimg.fxOn = true;
    gimg.fxLeft = dur;
    gimg.fxDur = dur;
    gimg.fxMode = mode;
    gimg.fxX = src.x;
    return gimg;
  }

  // --- sim events ------------------------------------------------------------------------

  onHit(e) {
    const j = this.j('e', e.enemy, true);
    j.squash = FX.HIT_SQUASH_S;
    const y = rowCenterY(e.row) + VIEW.PROJECTILE_Y;
    const front = e.x - GRID.TILE / 4;
    if (e.cause === 'dumpling') {
      if (e.lid) {
        this.burst(this.sparks, FX.LID_HIT_SPARKS, front, y, FX_COLORS.CLANG);
      } else {
        this.puff(front, y, FX.HIT_PUFF, FX_COLORS.STEAM);
        this.burst(this.pixels, FX.HIT_CRUMBS, front, y, FX_COLORS.DOUGH);
      }
    } else if (e.cause === 'zoomies') {
      this.burst(this.sparks, FX.ZOOM_SPARKS, e.x, y, FX_COLORS.SPARK);
      this.shake(FX.ZOOM_SHAKE_MS, FX.ZOOM_SHAKE);
    } else if (e.cause === 'ember') {
      this.burst(this.sparks, 3, e.x, y, FX_COLORS.GLOW);
    }
  }

  onKill(e) {
    const src = this.spriteOf('e', e.enemy);
    const g = this.ghost(src, 'squish', FX.KILL_SQUISH_S);
    if (g) g.setTint(FX_COLORS.WHITE).setTintMode(Phaser.TintModes.FILL);
    const feet = this.feetY(e.row);
    const color = FX_COLORS.ENEMY_DEBRIS[e.key] ?? FX_COLORS.DUST;
    this.puff(e.x, feet - FX.BODY_DY / 2, FX.KILL_DUST, FX_COLORS.DUST);
    this.burst(this.pixels, FX.KILL_PIXELS, e.x, feet - FX.BODY_DY, color);
    if (e.key === 'crow') this.burst(this.feathers, FX.HOP_FEATHERS, e.x, feet - FX.BODY_DY, FX_COLORS.WHITE);
    this.pop(e.x, feet + FX.POP_DY, `+${e.points}`);
    this.juice.delete(`e${e.enemy}`);
  }

  onLidOff(e) {
    const lid = this.lids.get();
    const y = this.feetY(e.row) - GRID.TILE / 2;
    lid.setPosition(e.x, y).setVisible(true).setAlpha(1).setAngle(0);
    lid.fxOn = true;
    lid.fxLeft = FX.LID_S;
    lid.fxX = e.x;
    lid.fxY = y;
    lid.fxFloor = this.feetY(e.row) - VIEW.ENEMY_FOOT_Y / 4;
    this.burst(this.sparks, FX.LID_CLANG_SPARKS, e.x - FX.LID_CLANG_DX, y, FX_COLORS.CLANG);
    if (e.cause === 'bark') this.shake(FX.LID_SHAKE_MS, FX.LID_SHAKE);
  }

  onHop(e) {
    const feet = this.feetY(e.row);
    this.puff(e.from, feet - 2, FX.HOP_DUST, FX_COLORS.DUST);
    this.burst(this.feathers, FX.HOP_FEATHERS, e.from, feet - FX.BODY_DY, FX_COLORS.WHITE);
    this.later.push({ t: MECHANIC.HOP_S, fn: () => this.puff(e.to, feet - 2, FX.HOP_DUST, FX_COLORS.DUST) });
  }

  onCoinDrop(e) {
    if (e.source === 'cat' && e.unit) {
      const j = this.j('u', e.unit, true);
      j.hop = FX.CAT_HOP_S;
    }
    this.burst(this.sparks, FX.COIN_DROP_SPARKS, e.x, e.y, FX_COLORS.COIN_SPARK);
  }

  onCoinCollect(e) {
    let x = e.x;
    let y = e.y;
    if (e.by === 'fetch') {
      x = this.battle.soba.x;
      y = this.battle.soba.y;
    }
    this.burst(this.sparks, FX.COIN_DROP_SPARKS, x, y, FX_COLORS.COIN_SPARK);
    const c = this.coins.get();
    c.setPosition(x, y).setVisible(true).setScale(1).setAlpha(1);
    c.fxOn = true;
    c.fxLeft = FX.COIN_FLY_S;
    c.fx0 = { x, y };
    if (c.fxPending) this.arrive();   // recycled mid-flight: still bump
    c.fxPending = true;
  }

  arrive() {
    this.hud?.bumpCoins?.();
    this.hudSparkle(UI.COIN_TEXT_X, UI.COIN_ICON_Y);
  }

  onPlace(e) {
    const j = this.j('u', e.unit, true);
    j.pop = FX.PLACE_POP_S;
    const x = tileCenterX(e.col);
    const y = rowTop(e.row) + VIEW.UNIT_FOOT_Y;
    this.dust.setParticleTint(FX_COLORS.DUST);
    for (let i = 0; i < FX.PLACE_RING; i++) {
      const a = (i / FX.PLACE_RING) * TAU;
      this.dust.emitParticleAt(x + Math.cos(a) * FX.PLACE_RING_RX, y + Math.sin(a) * FX.PLACE_RING_RY, 1);
    }
  }

  onShoot(e) {
    const j = this.j('u', e.unit, true);
    j.recoil = FX.SHOOT_RECOIL_S;
    this.puff(e.x - 4, rowCenterY(e.row) - 10, FX.SHOOT_STEAM, FX_COLORS.STEAM);
  }

  onUnitLost(e) {
    const src = this.spriteOf('u', e.unit);
    this.ghost(src, 'crumble', FX.CRUMBLE_S);
    const x = tileCenterX(e.col);
    const y = rowTop(e.row) + VIEW.UNIT_FOOT_Y;
    const color = FX_COLORS.UNIT_DEBRIS[e.key] ?? FX_COLORS.DUST;
    this.dust.setParticleTint(FX_COLORS.DUST);
    for (let i = 0; i < FX.CRUMBLE_DUST; i++) this.dust.emitParticleAt(x + rand(-FX.CRUMBLE_W, FX.CRUMBLE_W), y - rand(0, FX.CRUMBLE_H / 4), 1);
    this.pixels.setParticleTint(color);
    for (let i = 0; i < FX.CRUMBLE_DEBRIS; i++) this.pixels.emitParticleAt(x + rand(-FX.CRUMBLE_W, FX.CRUMBLE_W), y - rand(FX.CRUMBLE_H / 4, FX.CRUMBLE_H), 1);
    this.juice.delete(`u${e.unit}`);
  }

  onUpgrade(e) {
    const j = this.j('u', e.unit, true);
    j.pop = FX.UPGRADE_POP_S;
    j.glow = FX.UPGRADE_POP_S;
    const x = tileCenterX(e.col);
    const y = rowTop(e.row) + VIEW.UNIT_FOOT_Y - GRID.TILE / 3;
    this.burst(this.sparks, FX.UPGRADE_SPARKS, x, y, FX_COLORS.SPARK);
    this.pop(x, y - FX.UPGRADE_POP_DY, 'UP!', FX_COLORS.POP_TEXT);
  }

  onRecall(e) {
    const x = tileCenterX(e.col);
    const y = rowTop(e.row) + VIEW.UNIT_FOOT_Y;
    this.puff(x, y - 10, FX.RECALL_DUST, FX_COLORS.DUST);
    this.pop(x, y - GRID.TILE / 2 - 4, `+${e.refund}`, FX_COLORS.POP_REFUND);
    this.juice.delete(`u${e.unit}`);
  }

  onScooter(e) {
    this.shake(FX.SCOOTER_SHAKE_MS, FX.SCOOTER_SHAKE);
    this.scooterT.set(e.row, { line: 0, puff: 0 });
    this.puff(SCOOTER.X - FX.SCOOTER_PUFF_DX, rowTop(e.row) + VIEW.UNIT_FOOT_Y - FX.EXHAUST_DY, FX.SCOOTER_LAUNCH_PUFFS, FX_COLORS.EXHAUST);
  }

  onBark(e) {
    this.bark = { row: e.row, t: 0 };
    this.shake(FX.BARK_SHAKE_MS, FX.BARK_SHAKE);
    this.pop(SOBA.X + FX.WOOF_DX, rowTop(e.row) + 2, 'WOOF!', FX_COLORS.WOOF, FX.WOOF_S, FX.WOOF_RISE);
    for (const en of this.battle.enemies) {
      if (!en.alive || en.row !== e.row || en.stunLeft <= 0) continue;
      this.j('e', en.id, true).jitter = FX.BARK_JITTER_S;
    }
  }

  onEmber(e) {
    const y = rowCenterY(e.row);
    this.sparks.setParticleTint(FX_COLORS.GLOW);
    for (let x = e.x + GRID.TILE / 2; x < e.toX; x += GRID.TILE / 4) this.sparks.emitParticleAt(x, y + rand(-FX.EMBER_SPREAD, FX.EMBER_SPREAD), 1);
  }

  onHouseHit() {
    this.shake(FX.HOUSE_SHAKE_MS, FX.HOUSE_SHAKE);
    this.flash = { color: FX_COLORS.FLASH_HURT, alpha: FX.HOUSE_FLASH_ALPHA, t: 0, dur: FX.HOUSE_FLASH_S };
  }

  onWin() {
    this.end = { won: true, t: 0 };
    this.flash = { color: FX_COLORS.FLASH_WIN, alpha: FX.WIN_FLASH_ALPHA, t: 0, dur: FX.WIN_FLASH_S };
    this.confetti.explode(FX.WIN_CONFETTI, 0, 0);
    this.later.push({ t: FX.WIN_CONFETTI_DELAY_S, fn: () => this.confetti.explode(FX.WIN_CONFETTI_2, 0, 0) });
    const s = this.battle.soba;
    this.burst(this.sparks, FX.UPGRADE_SPARKS, s.x, s.y, FX_COLORS.SPARK);
  }

  onLose() {
    this.end = { won: false, t: 0 };
    try {
      this.colorFilter = this.scene.cameras.main.filters.internal.addColorMatrix();
    } catch {
      this.colorFilter = null;    // the dark overlay alone still reads as a loss
    }
  }

  // --- huge-wave banner ----------------------------------------------------------------

  showBanner(text) {
    if (!this.banner) {
      const s = this.scene;
      const c = s.add.container(0, FX.BANNER_Y).setDepth(DEPTH.OVERLAY);
      const g = s.add.graphics();
      const h = FX.BANNER_H;
      g.fillStyle(FX_COLORS.BANNER_EDGE, 1).fillRect(-GAME.WIDTH / 2, -h / 2 - 2, GAME.WIDTH, h + 4);
      g.fillStyle(FX_COLORS.BANNER, 1).fillRect(-GAME.WIDTH / 2, -h / 2, GAME.WIDTH, h);
      g.fillStyle(FX_COLORS.BANNER_STRIPE, 1).fillRect(-GAME.WIDTH / 2, -h / 2 + 3, GAME.WIDTH, FX.BANNER_STRIPE - 2)
        .fillRect(-GAME.WIDTH / 2, h / 2 - 4, GAME.WIDTH, FX.BANNER_STRIPE - 2);
      const label = s.add.text(0, 0, '', {
        fontFamily: META_FONT, fontSize: `${FX.BANNER_TEXT_SIZE}px`, fontStyle: 'bold',
        color: '#fff6e0', stroke: '#1a1220', strokeThickness: 4,
      }).setOrigin(0.5);
      const flag = s.add.graphics();
      const F = FX.BANNER_FLAG;
      flag.fillStyle(FX_COLORS.FLAG_POLE, 1).fillRect(-1, F.TOP, 2, F.POLE_H);
      flag.fillStyle(FX_COLORS.FLAG, 1).fillTriangle(1, F.TOP, 1 + F.W, F.TOP + F.H / 2, 1, F.TOP + F.H);
      flag.lineStyle(1, COLORS.OUTLINE, 1).strokeTriangle(1, F.TOP, 1 + F.W, F.TOP + F.H / 2, 1, F.TOP + F.H);
      c.add([g, label, flag]);
      this.banner = { c, label, flag, t: 0, on: false };
    }
    const b = this.banner;
    b.label.setText(text);
    b.flag.setPosition(Math.round(-b.label.width / 2 - FX.BANNER_FLAG.GAP), 0);
    b.t = 0;
    b.on = true;
    b.c.setVisible(true);
  }

  updateBanner(dt) {
    const b = this.banner;
    if (!b || !b.on) return;
    b.t += dt;
    const tIn = FX.BANNER_IN_S;
    const tHold = tIn + FX.BANNER_HOLD_S;
    const tOut = tHold + FX.BANNER_OUT_S;
    let x;
    if (b.t < tIn) x = GAME.WIDTH + GAME.WIDTH / 2 - GAME.WIDTH * backOut(b.t / tIn);
    else if (b.t < tHold) x = GAME.WIDTH / 2;
    else if (b.t < tOut) x = GAME.WIDTH / 2 - GAME.WIDTH * Phaser.Math.Easing.Quadratic.In((b.t - tHold) / FX.BANNER_OUT_S);
    else {
      b.on = false;
      b.c.setVisible(false);
      return;
    }
    b.c.setX(Math.round(x));
    // the flag pops in once the banner lands, then flutters
    const k = Phaser.Math.Clamp((b.t - tIn * 0.6) / FX.BANNER_FLAG_POP_S, 0, 1);
    const flutter = 1 + 0.12 * Math.sin(b.t * FX.BANNER_FLAG_WAVE_HZ * TAU);
    b.flag.setScale(backOut(k) * flutter, backOut(k));
  }

  // --- render-layer juice (BattleScene calls these per sprite) ---------------------------

  /** Breathing, place pop, recoil, cat hop, upgrade glow and the bitten flicker. */
  styleUnit(s, u, t) {
    let sx = 1;
    let sy = 1 + FX.BREATH_AMP * Math.sin((t + u.id * 0.37) * FX.BREATH_HZ * TAU);
    let dy = 0;
    const j = this.j('u', u.id);
    if (j) {
      if (j.pop > 0) {
        const dur = j.glow > 0 ? FX.UPGRADE_POP_S : FX.PLACE_POP_S;
        const from = j.glow > 0 ? 1 - FX.SHOOT_RECOIL : FX.PLACE_POP_FROM;
        const k = from + (1 - from) * backOut(1 - j.pop / dur);
        sx *= k;
        sy *= k;
      }
      if (j.recoil > 0) {
        const k = j.recoil / FX.SHOOT_RECOIL_S;
        sx *= 1 + FX.SHOOT_RECOIL * k;
        sy *= 1 - FX.SHOOT_RECOIL * k;
      }
      if (j.hop > 0) dy = -Math.round(Math.sin((1 - j.hop / FX.CAT_HOP_S) * Math.PI) * FX.CAT_HOP_PX);
    }
    let mode = 0;   // 0 none, 1 white, 2 red, 3 upgrade glow
    if (t - u.lastHit < FX.BITTEN_S && !this.battle.outcome) {
      const ph = (t * FX.BITE_FLICKER_HZ + u.id * 0.37) % 1;
      if (ph < FX.BITE_WHITE) {
        mode = 1;
        sx *= 1 + FX.BITE_WOBBLE;
        sy *= 1 - FX.BITE_WOBBLE;
      } else if (ph < FX.BITE_RED) mode = 2;
    } else if (j && j.glow > 0) mode = 3;
    s.setScale(sx, sy);
    if (dy) s.y += dy;
    if (mode === 1) s.setTint(FX_COLORS.WHITE).setTintMode(Phaser.TintModes.FILL);
    else if (mode === 2) s.setTint(FX_COLORS.BITE_RED).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (mode === 3) s.setTint(FX_COLORS.SPARK).setTintMode(Phaser.TintModes.ADD);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  /** Walk bob, bite lunge, hit squash + white flash, bark jitter, stun tint. */
  styleEnemy(s, e, t, airborne, biteFrame) {
    let sx = 1;
    let sy = 1;
    let dx = 0;
    let dy = 0;
    if (!airborne && e.stunLeft <= 0) {
      if (e.state === 'walk') dy = -Math.round(Math.abs(Math.sin((t * VIEW.WALK_FPS + e.id) * Math.PI)) * FX.WALK_BOB_PX);
      else if (e.state === 'bite' && biteFrame === 1) dx = -FX.BITE_NIBBLE_PX;
    }
    const j = this.j('e', e.id);
    if (j) {
      if (j.squash > 0) {
        const k = j.squash / FX.HIT_SQUASH_S;
        sx = 1 + FX.HIT_SQUASH * k;
        sy = 1 - FX.HIT_SQUASH * k;
      }
      if (j.jitter > 0) dx += Math.round(Math.sin(this.time * FX.BARK_JITTER_HZ * TAU + e.id) * FX.BARK_JITTER_PX * (j.jitter / FX.BARK_JITTER_S));
    }
    s.setScale(sx, sy);
    if (dx || dy) s.setPosition(s.x + dx, s.y + dy);
    if (t - e.lastHit < FX.HIT_WHITE_S && !this.battle.outcome) s.setTint(FX_COLORS.WHITE).setTintMode(Phaser.TintModes.FILL);
    else if (e.stunLeft > 0) s.setTint(COLORS.STUN_TINT).setTintMode(Phaser.TintModes.MULTIPLY);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  /** Bark squash, win hops. */
  styleSoba(s) {
    const b = this.battle;
    let sx = 1;
    let sy = 1;
    if (b.soba.state === 'bark' && this.bark) {
      const k = Math.max(0, 1 - this.bark.t / FX.BARK_S);
      sx = 1 + FX.BARK_SQUASH * k;
      sy = 1 - FX.BARK_SQUASH * k;
    }
    if (b.outcome === 'won') s.y -= Math.round(Math.abs(Math.sin(this.time * FX.WIN_HOP_HZ * Math.PI)) * FX.WIN_HOP_PX);
    s.setScale(sx, sy);
  }

  /** Landing bounce of a coin (px up), from its age since landing. */
  coinDy(c) {
    if (!c.landed || c.fetch) return 0;
    let age = c.age;
    if (c.source === 'cat') age -= ECONOMY.CAT_COIN_HOP_S;
    if (age < 0 || age >= FX.COIN_BOUNCE_S) return 0;
    const k = age / FX.COIN_BOUNCE_S;
    // two hops, the second smaller
    const hop = k < 0.6 ? Math.sin((k / 0.6) * Math.PI) : 0.4 * Math.sin(((k - 0.6) / 0.4) * Math.PI);
    return -Math.round(hop * FX.COIN_BOUNCE_PX);
  }

  // --- per frame --------------------------------------------------------------------------

  /** Advances every effect. dt: real frame seconds (0 while paused). */
  update(realDt) {
    const dt = realDt * this.timeScale(realDt);
    this.time += dt;

    for (const [key, j] of this.juice) {
      j.pop = Math.max(0, j.pop - dt);
      j.squash = Math.max(0, j.squash - dt);
      j.recoil = Math.max(0, j.recoil - dt);
      j.hop = Math.max(0, j.hop - dt);
      j.jitter = Math.max(0, j.jitter - dt);
      j.glow = Math.max(0, j.glow - dt);
      if (!j.pop && !j.squash && !j.recoil && !j.hop && !j.jitter && !j.glow) this.juice.delete(key);
    }
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      l.t -= dt;
      if (l.t <= 0) {
        this.later.splice(i, 1);
        l.fn();
      }
    }

    this.updateGhosts(dt);
    this.updateLids(dt);
    this.updateCoins(dt);
    this.updatePops(dt);
    this.updateField(dt);
    this.drawBark(dt);
    this.updateBanner(dt);
    this.updateEnd(dt);
    flickerGlows(this.glows, this.time);
  }

  /** Effect time scale: the win slow motion eases from FX.WIN_SLOWMO back to 1. */
  timeScale(realDt) {
    let k = 1;
    if (this.end && this.end.won) {
      this.end.slowT = (this.end.slowT || 0) + realDt;
      const f = Math.min(1, this.end.slowT / FX.WIN_SLOWMO_S);
      k = FX.WIN_SLOWMO + (1 - FX.WIN_SLOWMO) * f * f;
    }
    if (k !== this.scale) {
      this.scale = k;
      this.scene.tweens.timeScale = k;
      for (const e of this.emitters) if (e !== this.confetti) e.timeScale = k;
    }
    return k;
  }

  updateGhosts(dt) {
    this.ghosts.each((g) => {
      g.fxLeft -= dt;
      if (g.fxLeft <= 0) {
        g.fxOn = false;
        g.setVisible(false).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        return;
      }
      const k = 1 - g.fxLeft / g.fxDur;
      if (g.fxMode === 'squish') {
        if (k > 0.25) g.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        g.setScale(1 + 0.25 * k, Math.max(0.05, 1 - k)).setAlpha(1 - k * k);
      } else {
        // crumble: shakes, sinks into the ground, fades
        g.setX(Math.round(g.fxX + Math.sin(k * FX.CRUMBLE_SHAKE_HZ * TAU) * FX.CRUMBLE_SHAKE_PX));
        g.setScale(1 + 0.1 * k, Math.max(0.05, 1 - k)).setAlpha(1 - k);
      }
    });
  }

  updateLids(dt) {
    this.lids.each((l) => {
      l.fxLeft -= dt;
      if (l.fxLeft <= 0) {
        l.fxOn = false;
        l.setVisible(false);
        return;
      }
      const k = 1 - l.fxLeft / FX.LID_S;
      l.x = Math.round(l.fxX + FX.LID_DX * k);
      l.y = Math.round(l.fxY - Math.sin(Math.min(1, k * FX.LID_ARC_SPEED) * Math.PI) * FX.LID_UP + (l.fxFloor - l.fxY) * k * k);
      l.angle = FX.LID_SPIN * k;
      l.alpha = k < 0.6 ? 1 : (1 - k) / 0.4;
    });
  }

  updateCoins(dt) {
    const tx = UI.COIN_TEXT_X;
    const ty = UI.COIN_ICON_Y;
    this.coins.each((c) => {
      c.fxLeft -= dt;
      if (c.fxLeft <= 0) {
        c.fxOn = false;
        c.fxPending = false;
        c.setVisible(false);
        this.arrive();
        return;
      }
      const k = Phaser.Math.Easing.Quadratic.In(1 - c.fxLeft / FX.COIN_FLY_S);
      const mx = (c.fx0.x + tx) / 2;
      const my = Math.min(c.fx0.y, ty) - FX.COIN_FLY_ARC;
      const u = 1 - k;
      c.setPosition(Math.round(u * u * c.fx0.x + 2 * u * k * mx + k * k * tx), Math.round(u * u * c.fx0.y + 2 * u * k * my + k * k * ty));
      c.setScale(1 + Math.sin(k * Math.PI) * 0.6);
    });
  }

  updatePops(dt) {
    this.pops.each((p) => {
      p.fxLeft -= dt;
      if (p.fxLeft <= 0) {
        p.fxOn = false;
        p.setVisible(false);
        return;
      }
      const age = p.fxDur - p.fxLeft;
      const k = age / p.fxDur;
      const pin = Math.min(1, age / FX.POP_IN_S);
      p.setScale(FX.POP_SCALE + (1 - FX.POP_SCALE) * backOut(pin));
      p.setY(Math.round(p.fxY - p.fxRise * Phaser.Math.Easing.Quadratic.Out(k)));
      p.setAlpha(k < 0.6 ? 1 : (1 - k) / 0.4);
    });
  }

  /** Continuous emitters: scooters, zoomies afterimages and dust, dumpling trails, coin glints. */
  updateField(dt) {
    const b = this.battle;
    // scooters: speed lines + exhaust while driving
    for (const sc of b.scooters) {
      const st = this.scooterT.get(sc.row);
      if (!st) continue;
      if (sc.state !== 'active') {
        this.scooterT.delete(sc.row);
        continue;
      }
      const y = rowTop(sc.row) + VIEW.UNIT_FOOT_Y;
      st.line -= dt;
      st.puff -= dt;
      if (st.line <= 0) {
        st.line += FX.SCOOTER_LINE_EVERY_S;
        this.lines.setParticleTint(FX_COLORS.SPEED_LINE);
        this.lines.emitParticleAt(sc.x - FX.SCOOTER_LINE_DX, y - rand(FX.SCOOTER_LINE_Y[0], FX.SCOOTER_LINE_Y[1]), 1);
      }
      if (st.puff <= 0) {
        st.puff += FX.SCOOTER_PUFF_EVERY_S;
        this.trail.setParticleTint(FX_COLORS.EXHAUST);
        this.trail.emitParticleAt(sc.x - FX.SCOOTER_PUFF_DX, y - FX.EXHAUST_DY, 1);
      }
    }

    // zoomies: afterimages + dust at her paws
    const s = b.soba;
    if (s.zoomies && this.soba) {
      this.afterT -= dt;
      if (this.afterT <= 0) {
        this.afterT += FX.AFTERIMAGE_EVERY_S;
        const a = this.afters.get();
        a.setTexture('soba', this.soba.frame.name).setFlipX(this.soba.flipX).setPosition(this.soba.x, this.soba.y)
          .setTint(FX_COLORS.ZOOM_GHOST).setTintMode(Phaser.TintModes.FILL).setAlpha(FX.AFTERIMAGE_ALPHA).setVisible(true);
        a.fxOn = true;
        a.fxLeft = FX.AFTERIMAGE_S;
      }
      this.zoomDustT -= dt;
      if (this.zoomDustT <= 0) {
        this.zoomDustT += FX.ZOOM_DUST_EVERY_S;
        this.puff(s.x, s.y + VIEW.SOBA_FOOT_DY - 2, 1, FX_COLORS.DUST);
      }
    }
    this.afters.each((a) => {
      a.fxLeft -= dt;
      if (a.fxLeft <= 0) {
        a.fxOn = false;
        a.setVisible(false);
        return;
      }
      a.setAlpha(FX.AFTERIMAGE_ALPHA * (a.fxLeft / FX.AFTERIMAGE_S));
    });

    if (b.outcome) return;
    // dumpling steam trails (one puff per projectile per interval, capped by the emitter)
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT += FX.DUMPLING_TRAIL_EVERY_S;
      this.trail.setParticleTint(FX_COLORS.STEAM);
      for (const p of b.projectiles) {
        if (p.alive) this.trail.emitParticleAt(p.x - FX.TRAIL_DX, rowCenterY(p.row) + VIEW.PROJECTILE_Y, 1);
      }
    }
    // coins: sparkle while a lantern coin falls, a glint now and then once landed
    for (const c of b.coinsField) {
      if (!c.alive || c.fetch) continue;
      let left = this.glintT.get(c.id);
      if (left === undefined) left = rand(0, FX.COIN_GLINT_EVERY_S);
      left -= dt;
      if (left <= 0) {
        left += c.landed ? FX.COIN_GLINT_EVERY_S : FX.COIN_FALL_SPARK_EVERY_S;
        this.sparks.setParticleTint(FX_COLORS.COIN_SPARK);
        this.sparks.emitParticleAt(c.x + rand(-FX.GLINT_SPREAD, FX.GLINT_SPREAD), c.y + rand(-FX.GLINT_SPREAD, FX.GLINT_SPREAD / 2), 1);
      }
      this.glintT.set(c.id, left);
    }
    if (this.glintT.size > b.coinsField.length + FX.GLINT_SWEEP_SLACK) {
      const live = new Set(b.coinsField.filter(c => c.alive).map(c => c.id));
      for (const id of this.glintT.keys()) if (!live.has(id)) this.glintT.delete(id);
    }
  }

  drawBark(dt) {
    const g = this.g;
    g.clear();
    if (!this.bark) return;
    this.bark.t += dt;
    const k = this.bark.t / FX.BARK_S;
    if (k >= 1) {
      this.bark = null;
      return;
    }
    const row = this.bark.row;
    const top = rowTop(row);
    const cy = rowCenterY(row);
    // the stun range flashes, rings sweep out along the row
    g.fillStyle(FX_COLORS.BARK_RING, (1 - k) * FX.BARK_FILL_ALPHA).fillRect(GRID.X, top, BARK_RANGE_X - GRID.X, GRID.TILE);
    const reach = (BARK_RANGE_X - SOBA.X) * Phaser.Math.Easing.Quadratic.Out(k);
    for (let i = 0; i < FX.BARK_RINGS; i++) {
      const r = reach - i * FX.BARK_RING_GAP;
      if (r <= 4) continue;
      const a = Math.asin(Math.min(1, (GRID.TILE / 2 - 2) / r));
      g.lineStyle(i === 0 ? 3 : 2, FX_COLORS.BARK_RING, (1 - k) * (1 - i * 0.25));
      g.beginPath();
      g.arc(SOBA.X, cy, r, -a, a, false);
      g.strokePath();
    }
  }

  updateEnd(dt) {
    if (this.flash) {
      const f = this.flash;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.flash = null;
        this.flashRect.setAlpha(0);
      } else {
        this.flashRect.setFillStyle(f.color, 1).setAlpha(f.alpha * (1 - k));
      }
    }
    if (!this.end) return;
    this.end.t += dt;
    if (!this.end.won) {
      const k = Math.min(1, this.end.t / FX.LOSS_FADE_S);
      this.darkRect.setAlpha(FX.LOSS_DARK_ALPHA * k);
      if (this.colorFilter) this.colorFilter.colorMatrix.saturate(FX.LOSS_SATURATE * k);
    }
  }

  destroy() {
    for (const [ev, fn] of this.on) eventBus.off(ev, fn);
    this.on = [];
    if (this.colorFilter) {
      try {
        this.scene.cameras.main.filters.internal.remove(this.colorFilter);
      } catch {
        // camera already gone with the scene
      }
      this.colorFilter = null;
    }
    this.juice.clear();
    this.later.length = 0;
    Effects.resetTimeScales(this.scene);
  }
}
