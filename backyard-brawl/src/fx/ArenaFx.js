// =============================================================================
// ArenaFx — every Arena juice effect, driven by EventBus `sim:<type>` events
// (forwarded by ArenaScene.flushEvents) plus a per-frame update(world, dtMs).
//
// Owns: player marker (ground ring, 1 px rim, hurt flash, dash ring), damage
// numbers, particle bursts, camera shake, hit-stop, level-up intro, wave
// sweep, boss intro (darken + name card), off-screen arrows, low-HP vignette,
// magnet streaks, kibble twinkles, death beat (desaturate, slow FX, fade).
//
// Timing: everything counts the frame delta it is given (never wall time),
// so the deterministic test clock sees the same effects every run.
// ArenaScene asks:  consumeHitStop(dt)  -> true while the sim should hold
//                   levelUpGate(dt)     -> true when the card overlay may open
//                   enemyScale(e)       -> squash factors for a hit enemy
//                   spotlit(e)          -> boss drawn above the intro darkening
// =============================================================================

import Phaser from 'phaser';
import { FX, GAME, UI, COLORS, ENEMY, PLAYER, RENDER, DEPTH } from '../core/Constants.js';
import { eventBus } from '../core/EventBus.js';
import { ensureFxTextures, FXT } from './textures.js';
import { DamageNumbers } from './DamageNumbers.js';
import { Particles } from './Particles.js';

const BOSS_SUB = { 'boss-cat': 'The neighbourhood bully', 'boss-vac': 'It cleans. It hunts.' };
const MAX_ARROWS = 5;

export class ArenaFx {
  constructor(scene) {
    this.scene = scene;
    ensureFxTextures(scene);
    this.numbers = new DamageNumbers(scene);
    this.parts = new Particles(scene);

    // Player marker
    this.ring = scene.add.image(0, 0, FXT.RING).setDepth(FX.DEPTH.PLAYER_RING)
      .setTint(FX.RING_COLOR).setAlpha(FX.RING_ALPHA);
    this.outline = scene.textures.exists(FXT.OUTLINE)
      ? scene.add.image(0, 0, FXT.OUTLINE, 0).setOrigin(0.5, 1).setDepth(FX.DEPTH.PLAYER - 0.1)
        .setTint(FX.OUTLINE_COLOR).setAlpha(FX.OUTLINE_ALPHA)
      : null;
    this.dashGfx = scene.add.graphics().setDepth(FX.DEPTH.PLAYER_RING + 0.1);
    this.worldGfx = scene.add.graphics().setDepth(FX.DEPTH.PARTICLES - 2); // sweeps, bursts rings
    this.streakGfx = scene.add.graphics().setDepth(DEPTH.PICKUP - 0.5);

    // Screen space
    const W = GAME.WIDTH;
    const H = GAME.HEIGHT;
    this.vignette = scene.add.image(0, 0, FXT.VIGNETTE).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(FX.DEPTH.VIGNETTE).setTint(FX.VIGNETTE_TINT).setAlpha(0);
    this.flashRect = scene.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(FX.DEPTH.VIGNETTE + 1).setAlpha(0);
    this.darken = scene.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(FX.DEPTH.SPOTLIGHT).setAlpha(0);
    this.nameCard = this.makeNameCard();
    this.arrows = [];
    for (let i = 0; i < MAX_ARROWS; i++) {
      this.arrows.push(scene.add.image(0, 0, FXT.ARROW).setScrollFactor(0).setDepth(FX.DEPTH.ARROWS).setVisible(false));
    }

    this.hitStopMs = 0;
    this.levelUpWait = 0;
    this.hurtMs = 1e9;
    this.flashMs = 0;
    this.flashDur = 1;
    this.flashAlpha = 0;
    this.vigHurt = 0;
    this.spotMs = 0;
    this.sweeps = [];
    this.dying = false;
    this.deathMs = 0;
    this.fadeStarted = false;
    this.cm = null;
    this.lastBossShake = -1e9;
    this.clockMs = 0;
    this.sparkleMs = 0;
    this.blipBudget = FX.PICKUP_BLIP_MAX;
    this.blipMs = 0;
    this.dashReadyMs = 1e9;
    this.prevDashCd = 0;
    this.bossPrev = new Map();
    this.bookerTint = 'none';
    this.spawnPuffs = 0;

    this.handlers = {
      'sim:hit': (e) => this.onHit(e),
      'sim:kill': (e) => this.onKill(e),
      'sim:pop': (e) => this.onPop(e),
      'sim:spawn': (e) => this.onSpawn(e),
      'sim:pickup': (e) => this.onPickup(e),
      'sim:levelUpOpen': () => this.onLevelUp(),
      'sim:playerHurt': (e) => this.onHurt(e),
      'sim:playerDeath': (e) => this.onDeath(e),
      'sim:waveEnd': () => this.onWaveEnd(),
      'sim:bossSpawn': (e) => this.onBossSpawn(e),
      'sim:bossDeath': (e) => this.onBossDeath(e),
      'sim:bossCharge': (e) => this.onBossCharge(e),
      'sim:bossPhase2': (e) => this.onBossPhase2(e),
      'sim:bossBounce': (e) => this.parts.dustAt(e.x, e.y + 14, 4),
      'sim:dash': (e) => this.parts.dustAt(e.x, e.y + RENDER.FEET.booker - 2, 5),
      'sim:victory': () => this.onVictory(),
    };
    for (const [k, fn] of Object.entries(this.handlers)) eventBus.on(k, fn);
    scene.events.once('shutdown', () => this.destroy());
  }

  destroy() {
    if (!this.handlers) return;
    for (const [k, fn] of Object.entries(this.handlers)) eventBus.off(k, fn);
    this.handlers = null;
  }

  get world() {
    return this.scene.world;
  }

  // --- hooks used by ArenaScene -----------------------------------------------------

  /** True while the sim should hold (hit-stop). Counts frame delta. */
  consumeHitStop(dtMs) {
    if (this.hitStopMs <= 0) return false;
    this.hitStopMs -= dtMs;
    return true;
  }

  hitStop(ms) {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
  }

  /** Called every frame while the sim waits on a level-up and the overlay is closed. */
  levelUpGate(dtMs) {
    if (this.levelUpWait <= 0) return true;
    this.levelUpWait -= dtMs;
    return this.levelUpWait <= 0;
  }

  /** 0..1 squash amount while the sim's hit flash runs (ArenaScene scales by FX.SQUASH_X/Y). */
  enemyScale(e) {
    if (!(e.flash > 0) || e.boss) return 1;
    return Math.min(1, e.flash / ENEMY.FLASH_S);
  }

  spotlit(e) {
    return this.spotMs > 0 && e.boss;
  }

  shake([ms, k]) {
    this.scene.cameras.main.shake(ms, k);
  }

  screenFlash(color, alpha, ms) {
    this.flashRect.setFillStyle(color, 1);
    this.flashAlpha = alpha;
    this.flashMs = ms;
    this.flashDur = ms;
  }

  // --- sim events -----------------------------------------------------------------

  onHit(ev) {
    this.numbers.spawn(ev);
    if (ev.enemy === 'boss-cat' || ev.enemy === 'boss-vac') {
      if (this.clockMs - this.lastBossShake > FX.SHAKE_BOSS_HIT_GAP_MS) {
        this.lastBossShake = this.clockMs;
        this.shake(FX.SHAKE_BOSS_HIT);
      }
    }
  }

  onKill(ev) {
    if (ev.boss) return; // bossDeath does the big one
    const colors = FX.ENEMY_COLORS[ev.enemy] || [0xffffff, 0xcccccc];
    const fy = ev.y - 2;
    if (ev.elite) {
      this.parts.burst(ev.x, fy, colors, FX.PUFF_ELITE_COUNT);
      this.parts.sparkleAt(ev.x, fy, 8, FX.GOLD);
      this.sweeps.push({ x: ev.x, y: ev.y, r0: 4, r1: 26, ms: 0, dur: 260, color: FX.GOLD, w: 2 });
    } else {
      this.parts.burst(ev.x, fy, colors, FX.PUFF_COUNT);
    }
  }

  onPop(ev) {
    const colors = FX.ENEMY_COLORS[ev.enemy] || [0xffffff, 0xcccccc];
    this.parts.burst(ev.x, ev.y - 2, colors, FX.PUFF_POP_COUNT);
    this.parts.sparkleAt(ev.x, ev.y - 2, 1, COLORS.XP);
  }

  onSpawn(ev) {
    // rate-limited: at most a few spawn puffs per frame
    if (this.spawnPuffs > 3) return;
    this.spawnPuffs += 1;
    if (ev.enemy === 'boss-cat' || ev.enemy === 'boss-vac') return;
    this.parts.dustAt(ev.x, ev.y + 6, 3, 0xd8c8a0);
  }

  onPickup(ev) {
    const p = this.world.player;
    if (ev.kind === 'kibble') {
      if (this.blipBudget <= 0) return;
      this.blipBudget -= 1;
      const tint = ev.size === 'L' ? FX.GOLD : COLORS.XP;
      this.parts.sparkleAt(p.x, p.y - 4, ev.size === 'S' ? 1 : 3, tint);
      return;
    }
    if (ev.kind === 'heart') {
      this.parts.sparkleAt(p.x, p.y - 6, 10, 0xff7a9a);
      this.numbers.spawn({ id: -2, enemy: 'heart', x: p.x, y: p.y - 10, dmg: ev.heal ?? 3, crit: false, heal: true });
      this.vigHurt = 0;
    } else if (ev.kind === 'magnet') {
      this.sweeps.push({ x: p.x, y: p.y, r0: 6, r1: 260, ms: 0, dur: 420, color: 0x9adfff, w: 2 });
      this.screenFlash(0x9adfff, 0.18, 160);
    } else if (ev.kind === 'goldenBone') {
      this.parts.sparkleAt(p.x, p.y - 6, 14, FX.GOLD);
      this.sweeps.push({ x: p.x, y: p.y, r0: 4, r1: 30, ms: 0, dur: 300, color: FX.GOLD, w: 2 });
    }
  }

  onLevelUp() {
    if (this.scene.scene.isActive('LevelUpScene') || this.levelUpWait > 0) return;
    const p = this.world.player;
    this.levelUpWait = FX.LEVELUP_INTRO_MS;
    this.parts.sparkleAt(p.x, p.y - 8, FX.LEVELUP_BURST, FX.GOLD);
    this.parts.sparkleAt(p.x, p.y - 8, 8, 0xffffff);
    this.sweeps.push({ x: p.x, y: p.y, r0: 6, r1: 70, ms: 0, dur: FX.LEVELUP_INTRO_MS, color: FX.GOLD, w: 3 });
    this.screenFlash(0xffe08a, 0.3, FX.LEVELUP_INTRO_MS);
    this.scene.hud?.flashXp();
  }

  onHurt(ev) {
    this.hurtMs = 0;
    this.vigHurt = FX.VIGNETTE_HURT;
    this.shake(FX.SHAKE_HURT);
    this.hitStop(FX.HITSTOP_HURT_MS);
    this.parts.burst(ev.x, ev.y - 4, [0xff5a4a, 0xffffff], 6);
  }

  onDeath(ev) {
    this.dying = true;
    this.deathMs = 0;
    this.parts.setTimeScale(FX.DEATH_SLOWMO);
    this.parts.burst(ev.x, ev.y - 6, [0xe0b070, 0xffffff], 14);
    this.screenFlash(0xffffff, 0.5, 200);
    const cam = this.scene.cameras.main;
    if (this.scene.game.renderer.type === Phaser.WEBGL && cam.filters) {
      try {
        this.cm = cam.filters.external.addColorMatrix();
      } catch {
        this.cm = null;
      }
    }
  }

  onWaveEnd() {
    const p = this.world.player;
    // The pop-to-XP sweep: a ring rolling out across the whole yard
    this.sweeps.push({ x: p.x, y: p.y, r0: 8, r1: 520, ms: 0, dur: FX.SWEEP_MS, color: 0xfff6e0, w: 3 });
    this.sweeps.push({ x: p.x, y: p.y, r0: 4, r1: 420, ms: -70, dur: FX.SWEEP_MS, color: COLORS.XP, w: 2 });
    this.screenFlash(0xffffff, 0.22, 200);
  }

  onBossSpawn(ev) {
    this.spotMs = FX.BOSS_INTRO_MS;
    this.shake(FX.SHAKE_BOSS_LAND);
    this.parts.dustAt(ev.x, ev.y + 16, 16, 0xd8c8a0);
    this.sweeps.push({ x: ev.x, y: ev.y + 10, r0: 10, r1: 70, ms: 0, dur: 360, color: 0xfff6e0, w: 2 });
    this.showNameCard(ev.name || 'BOSS', BOSS_SUB[ev.enemy] || '');
  }

  onBossDeath(ev) {
    this.hitStop(FX.HITSTOP_BOSS_DEATH_MS);
    this.shake(FX.SHAKE_BOSS_DEATH);
    const colors = FX.ENEMY_COLORS[ev.enemy] || [0xffffff, 0xcccccc];
    for (let i = 0; i < 3; i++) this.parts.burst(ev.x + (i - 1) * 10, ev.y - 6 + (i % 2) * 6, colors, 26);
    this.parts.burst(ev.x, ev.y - 6, [0xffd44a, 0xff8a3a], 30);
    this.parts.confettiAt(ev.x, ev.y - 10);
    this.sweeps.push({ x: ev.x, y: ev.y, r0: 10, r1: 160, ms: 0, dur: 500, color: 0xffd44a, w: 4 });
    this.sweeps.push({ x: ev.x, y: ev.y, r0: 6, r1: 110, ms: 80, dur: 420, color: 0xffffff, w: 2 });
    this.screenFlash(0xffffff, 0.55, 260);
  }

  onBossCharge(ev) {
    this.shake(FX.SHAKE_CHARGE);
    this.parts.dustAt(ev.x - ev.dx * 16, ev.y + 16, 8, 0xd8c8a0);
  }

  onBossPhase2(ev) {
    this.shake(FX.SHAKE_PHASE2);
    this.sweeps.push({ x: ev.x, y: ev.y, r0: 20, r1: 90, ms: 0, dur: 400, color: 0xff3a6a, w: 3 });
    this.screenFlash(0xff3a6a, 0.2, 220);
  }

  onVictory() {
    const p = this.world.player;
    this.parts.confettiAt(p.x - 40, p.y - 30, 50);
    this.parts.confettiAt(p.x + 40, p.y - 30, 50);
    this.screenFlash(0xfff6e0, 0.4, 300);
  }

  // --- boss name card ---------------------------------------------------------------

  makeNameCard() {
    const s = this.scene;
    const g = s.add.graphics();
    const w = 200;
    const h = 38;
    g.fillStyle(0x1a1208, 0.92).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0xe0473a, 1).fillRect(-w / 2, -h / 2, w, 3).fillRect(-w / 2, h / 2 - 3, w, 3);
    g.fillStyle(0xffd44a, 1).fillRect(-w / 2, -h / 2, 3, h);
    const name = s.add.text(0, -5, '', {
      fontFamily: UI.FONT, fontSize: `${UI.HEADING_SIZE + 2}px`, fontStyle: 'bold', color: '#ffd44a',
      stroke: COLORS.STROKE, strokeThickness: 4,
    }).setOrigin(0.5);
    const sub = s.add.text(0, 11, '', {
      fontFamily: UI.FONT, fontSize: `${UI.SMALL_SIZE + 1}px`, fontStyle: 'bold', color: COLORS.UI_TEXT,
      stroke: COLORS.STROKE, strokeThickness: 3,
    }).setOrigin(0.5);
    const c = s.add.container(-200, GAME.HEIGHT * 0.62, [g, name, sub]).setScrollFactor(0)
      .setDepth(FX.DEPTH.SPOTLIGHT + 5).setVisible(false);
    c.nameText = name;
    c.subText = sub;
    return c;
  }

  showNameCard(name, sub) {
    const c = this.nameCard;
    const s = this.scene;
    c.nameText.setText(name);
    c.subText.setText(sub);
    c.setVisible(true).setPosition(-120, GAME.HEIGHT * 0.62).setAlpha(1);
    s.tweens.killTweensOf(c);
    s.tweens.chain({
      targets: c,
      tweens: [
        { x: GAME.WIDTH / 2, duration: 240, ease: 'Back.Out' },
        { x: GAME.WIDTH / 2 + 8, duration: FX.BOSS_INTRO_MS - 240, ease: 'Linear' },
        { x: GAME.WIDTH + 140, alpha: 0, duration: 220, ease: 'Quad.In' },
      ],
      onComplete: () => c.setVisible(false),
    });
  }

  // --- per frame --------------------------------------------------------------------

  /** world = the sim; booker = the player sprite (already positioned by ArenaScene). */
  update(w, dtMs, booker) {
    const fxDt = this.dying ? dtMs * FX.DEATH_SLOWMO : dtMs;
    this.clockMs += dtMs;
    this.spawnPuffs = 0;
    this.blipMs += dtMs;
    if (this.blipMs >= 100) {
      this.blipMs = 0;
      this.blipBudget = FX.PICKUP_BLIP_MAX;
    }
    this.numbers.update(fxDt);
    this.updatePlayer(w, dtMs, booker);
    this.updateWorldGfx(w, fxDt);
    this.updateStreaks(w);
    this.updateSparkles(w, dtMs);
    this.updateArrows(w);
    this.updateScreen(w, dtMs);
    this.updateBosses(w);
  }

  updatePlayer(w, dtMs, b) {
    const p = w.player;
    const feetY = Math.round(p.y + RENDER.FEET.booker);
    const x = Math.round(p.x);
    this.ring.setPosition(x, feetY);
    this.ring.setVisible(!this.dying);
    if (this.outline) {
      const fr = b.frame?.name;
      if (fr !== undefined && this.outline.frame.name !== fr && this.scene.textures.getFrame(FXT.OUTLINE, fr)) {
        this.outline.setFrame(fr);
      }
      this.outline.setPosition(b.x, b.y).setFlipX(b.flipX).setAngle(b.angle);
    }
    // Hurt: white flash, then a red tint. The flash and the death pose ignore the i-frame blink.
    this.hurtMs += dtMs;
    if (this.hurtMs < FX.HURT_FLASH_MS || this.dying) b.setAlpha(1);
    if (this.outline) this.outline.setAlpha(FX.OUTLINE_ALPHA * b.alpha);
    let tint = 'none';
    if (this.hurtMs < FX.HURT_FLASH_MS) tint = 'flash';
    else if (this.hurtMs < FX.HURT_TINT_MS || this.dying) tint = 'red';
    if (tint !== this.bookerTint) {
      this.bookerTint = tint;
      if (tint === 'flash') b.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (tint === 'red') b.setTint(FX.HURT_TINT).setTintMode(Phaser.TintModes.MULTIPLY);
      else b.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    // Dash cooldown ring (fills around the ground ring, pops when ready)
    const g = this.dashGfx;
    g.clear();
    const cd = p.dashCd;
    if (this.prevDashCd > 0 && cd <= 0) this.dashReadyMs = 0;
    this.prevDashCd = cd;
    this.dashReadyMs += dtMs;
    if (this.dying) return;
    const rx = 15;
    const ry = 6;
    if (cd > 0) {
      const f = 1 - cd / PLAYER.DASH_COOLDOWN_S;
      const segs = Math.max(1, Math.round(24 * f));
      g.lineStyle(1, FX.DASH_RING_COLOR, 0.75);
      g.beginPath();
      for (let i = 0; i <= segs; i++) {
        const a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * rx;
        const py = feetY + Math.sin(a) * ry;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    } else if (this.dashReadyMs < FX.DASH_READY_POP_MS) {
      const u = this.dashReadyMs / FX.DASH_READY_POP_MS;
      g.lineStyle(2, FX.DASH_RING_COLOR, 1 - u).strokeEllipse(x, feetY, (rx + 6 * u) * 2, (ry + 3 * u) * 2);
    }
  }

  updateWorldGfx(w, dtMs) {
    const g = this.worldGfx;
    g.clear();
    let k = 0;
    for (let i = 0; i < this.sweeps.length; i++) {
      const s = this.sweeps[i];
      s.ms += dtMs;
      if (s.ms >= s.dur) continue;
      this.sweeps[k++] = s;
      if (s.ms < 0) continue;
      const u = s.ms / s.dur;
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      const r = s.r0 + (s.r1 - s.r0) * e;
      g.lineStyle(s.w, s.color, 0.85 * (1 - u)).strokeCircle(s.x, s.y, r);
    }
    this.sweeps.length = k;
  }

  updateStreaks(w) {
    const g = this.streakGfx;
    g.clear();
    const p = w.player;
    let n = 0;
    g.lineStyle(1, 0xcfeeff, 0.7);
    for (let i = 0; i < w.pickups.length; i++) {
      const k = w.pickups[i];
      if (!k.pulled || k.speed < 140) continue;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const len = Math.min(22, k.speed * FX.STREAK_LEN_S);
      g.lineBetween(Math.round(k.x), Math.round(k.y), Math.round(k.x - (dx / d) * len), Math.round(k.y - (dy / d) * len));
      if (++n > 160) break;
    }
  }

  updateSparkles(w, dtMs) {
    this.sparkleMs += dtMs;
    if (this.sparkleMs < FX.SPARKLE_EVERY_MS || !w.pickups.length) return;
    this.sparkleMs = 0;
    // a random big pickup twinkles
    for (let tries = 0; tries < 4; tries++) {
      const k = w.pickups[(Math.random() * w.pickups.length) | 0];
      if (k.pulled) continue;
      if (k.kind !== 'kibble' || k.size !== 'S') {
        const tint = k.kind === 'goldenBone' ? FX.GOLD : (k.kind === 'heart' ? 0xff9ab0 : 0xffffff);
        this.parts.sparkle.setParticleTint(tint).emitParticleAt(k.x + (Math.random() * 6 - 3), k.y - 3, 1);
        return;
      }
    }
  }

  updateArrows(w) {
    const cam = this.scene.cameras.main;
    const W = GAME.WIDTH;
    const H = GAME.HEIGHT;
    let n = 0;
    const place = (x, y, color, big) => {
      if (n >= MAX_ARROWS) return;
      const sx = x - cam.scrollX;
      const sy = y - cam.scrollY;
      // a boss counts as on screen while a good part of its 64 px sprite shows (it stands on its feet)
      if (big ? (sx > -24 && sx < W + 24 && sy > -8 && sy < H + 36) : (sx > -4 && sx < W + 4 && sy > -4 && sy < H + 4)) return;
      const dx = sx - W / 2;
      const dy = sy - H / 2;
      const inset = FX.ARROW_INSET;
      const top = 30; // keep clear of the HUD's top rows
      const hx = W / 2 - inset;
      const hyDown = H / 2 - inset - 10;
      const hyUp = H / 2 - top;
      const sxk = Math.abs(dx) > 0 ? hx / Math.abs(dx) : Infinity;
      const syk = dy > 0 ? hyDown / dy : (dy < 0 ? hyUp / -dy : Infinity);
      const k = Math.min(sxk, syk);
      const a = this.arrows[n++];
      const pulse = 1 + 0.15 * Math.sin(this.clockMs / 90);
      a.setVisible(true)
        .setPosition(Math.round(W / 2 + dx * k), Math.round(H / 2 + dy * k))
        .setRotation(Math.atan2(dy, dx))
        .setTint(color)
        .setScale((big ? 1.5 : 1) * pulse);
    };
    for (const b of w.bosses) place(b.x, b.y, FX.ARROW_COLORS.boss, true);
    for (let i = 0; i < w.pickups.length && n < MAX_ARROWS; i++) {
      const k = w.pickups[i];
      if (k.kind === 'goldenBone' || k.kind === 'heart') place(k.x, k.y, FX.ARROW_COLORS[k.kind], false);
    }
    for (let i = n; i < MAX_ARROWS; i++) if (this.arrows[i].visible) this.arrows[i].setVisible(false);
  }

  updateScreen(w, dtMs) {
    const p = w.player;
    // Low-HP vignette pulse + a short flash on every hit
    this.vigHurt = Math.max(0, this.vigHurt - dtMs / 450);
    let va = this.vigHurt;
    if (!this.dying && p.hp > 0 && p.hp <= p.maxHp * FX.LOW_HP_FRAC) {
      const s = 0.5 + 0.5 * Math.sin((this.clockMs / 1000) * Math.PI * 2 * FX.VIGNETTE_PULSE_HZ);
      va = Math.max(va, FX.VIGNETTE_ALPHA[0] + (FX.VIGNETTE_ALPHA[1] - FX.VIGNETTE_ALPHA[0]) * s);
    }
    if (this.dying) va = Math.max(va, 0.5);
    this.vignette.setAlpha(va);

    // Screen flash
    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      const u = Math.max(0, this.flashMs / this.flashDur);
      this.flashRect.setAlpha(this.flashAlpha * u * u);
    } else if (this.flashRect.alpha !== 0) {
      this.flashRect.setAlpha(0);
    }

    // Boss intro darkening (0.8 s): fade in fast, hold, fade out
    if (this.spotMs > 0) {
      this.spotMs -= dtMs;
      const el = FX.BOSS_INTRO_MS - this.spotMs;
      const inA = Math.min(1, el / 120);
      const outA = Math.min(1, Math.max(0, this.spotMs) / 220);
      this.darken.setAlpha(FX.BOSS_DARKEN * Math.min(inA, outA));
    } else if (this.darken.alpha !== 0) {
      this.darken.setAlpha(0);
    }

    // Death beat: desaturate + darken, then fade to black just before Results
    if (this.dying) {
      this.deathMs += dtMs;
      const k = Math.min(1, this.deathMs / 400);
      if (this.cm) {
        this.cm.colorMatrix.saturate(-FX.DEATH_DESAT * k);
        this.cm.colorMatrix.brightness(1 - 0.3 * k, true);
      }
      if (!this.fadeStarted && w.deathLeft > 0 && w.deathLeft < FX.DEATH_FADE_S) {
        this.fadeStarted = true;
        this.scene.cameras.main.fadeOut(Math.round(w.deathLeft * 1000), 14, 10, 6);
      }
    }
  }

  updateBosses(w) {
    // Big Tom's charge ends (charge -> recover): impact
    for (const b of w.bosses) {
      const prev = this.bossPrev.get(b.id);
      if (prev === 'charge' && b.state === 'recover') {
        this.shake(FX.SHAKE_CHARGE_IMPACT);
        this.parts.dustAt(b.x, b.y + 18, 14, 0xd8c8a0);
        this.sweeps.push({ x: b.x, y: b.y + 16, r0: 10, r1: 48, ms: 0, dur: 300, color: 0xfff6e0, w: 2 });
      }
      this.bossPrev.set(b.id, b.state);
    }
  }

  /** Small summary for render_game_to_text(). */
  debugState() {
    return {
      numbers: this.numbers.active.length,
      numbersSkipped: this.numbers.skipped,
      particles: this.parts.count(),
      hitStopMs: Math.max(0, Math.round(this.hitStopMs)),
      levelUpWaitMs: Math.max(0, Math.round(this.levelUpWait)),
      bossIntroMs: Math.max(0, Math.round(this.spotMs)),
      arrows: this.arrows.filter(a => a.visible).length,
      vignette: Math.round(this.vignette.alpha * 100) / 100,
      dying: this.dying,
    };
  }
}
