// =============================================================================
// WinBanner — the celebration overlay.
//
//   await this.banner.show({ amount: 1250, wagered: 25 });          // tier from paid / wagered
//   await this.banner.show({ amount: 300, tier: 'win' });           // force a tier
//   await this.banner.show({ amount: 25, wagered: 10, title: 'BLACKJACK!' }); // custom title
//   this.banner.active   // true while showing
//   WinBanner.tierFor(paid, wagered) -> 'win' | 'big' | 'mega'
//
// Tiers: WIN (any), BIG WIN (paid >= 10x), MEGA WIN (paid >= 50x). Each has a
// counter roll-up, a coin shower, a sunburst, and (big/mega) a small camera
// shake. A click skips: first click finishes the count, second hides. The
// promise resolves when the banner is gone. A new show() while one is up
// replaces it only if the new tier is higher (otherwise it resolves at once).
// The dim layer stops catching clicks the moment hide() starts (its fade-out
// never eats a click meant for the table).
// =============================================================================

import { COLORS, DEPTH, ECONOMY, FONT, GAME, TIMING } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { playSfx } from '../audio/sfx.js';
import { text, fmt } from './theme.js';

const RANK = { win: 1, big: 2, mega: 3 };
const TITLES = { win: 'WIN!', big: 'BIG WIN!', mega: 'MEGA WIN!' };

export class WinBanner {
  static tierFor(paid, wagered) {
    const x = wagered > 0 ? paid / wagered : 0;
    if (x >= ECONOMY.MEGA_WIN_X) return 'mega';
    if (x >= ECONOMY.BIG_WIN_X) return 'big';
    return 'win';
  }

  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.tier = null;
    this.resolve = null;
    scene.events.once('shutdown', () => this.hide(true));
  }

  get active() { return !!this.root; }

  show({ amount = 0, wagered = 0, tier = null, title: titleStr = null } = {}) {
    const s = this.scene;
    tier = tier || WinBanner.tierFor(amount, wagered);
    if (this.root) {
      if (RANK[tier] <= RANK[this.tier]) return Promise.resolve(false);
      this.hide(true);
    }
    this.tier = tier;
    this.amount = amount;
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2 - 10;
    const root = s.add.container(0, 0).setDepth(DEPTH.BANNER);
    this.root = root;

    const dim = s.add.rectangle(cx, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, 0x000000, tier === 'win' ? 0.35 : 0.55).setInteractive();
    dim.on('pointerdown', () => this.skip());
    root.add(dim);
    this.dim = dim;

    // sunburst
    const rays = s.add.graphics({ x: cx, y: cy });
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + Math.PI / n;
      rays.fillStyle(i % 2 ? COLORS.GOLD : COLORS.GOLD_LIGHT, 0.12);
      rays.fillTriangle(0, 0, Math.cos(a0) * 700, Math.sin(a0) * 700, Math.cos(a1) * 700, Math.sin(a1) * 700);
    }
    root.add(rays);
    s.tweens.add({ targets: rays, angle: 360, duration: 24000, repeat: -1 });

    const glow = s.add.image(cx, cy, 'ui-glow').setScale(tier === 'win' ? 4 : 6).setTint(COLORS.GOLD).setAlpha(0.5).setBlendMode('ADD');
    root.add(glow);

    // title first (measured), then a ribbon wide enough for it
    const label = titleStr || TITLES[tier];
    const title = text(s, cx, cy - 60, label, {
      size: tier === 'win' ? 84 : FONT.SIZE.MEGA, weight: FONT.WEIGHT.BOLD, color: COLORS.GOLD_LIGHT, stroke: COLORS.INK, strokeW: 10, shadow: true,
    });
    if (title.width > 820) title.setScale(820 / title.width);
    const fitK = title.scaleX;
    const rib = s.add.graphics({ x: cx, y: cy - 60 });
    const rw = Math.max(tier === 'mega' ? 700 : tier === 'big' ? 600 : 420, Math.min(900, title.displayWidth + 90));
    rib.fillStyle(0x000000, 0.4);
    rib.fillRoundedRect(-rw / 2 + 4, -58, rw, 124, 26);
    rib.fillStyle(tier === 'mega' ? 0x7b3fc4 : tier === 'big' ? 0xb8322a : 0x1f6a46, 1);
    rib.fillRoundedRect(-rw / 2, -62, rw, 124, 26);
    rib.lineStyle(5, COLORS.GOLD, 1);
    rib.strokeRoundedRect(-rw / 2, -62, rw, 124, 26);
    root.add(rib);
    root.add(title);
    this.counterText = text(s, cx, cy + 62, '0', {
      size: tier === 'win' ? 56 : 72, num: true, color: COLORS.CREAM, stroke: COLORS.INK, strokeW: 9,
    });
    root.add(this.counterText);
    if (wagered > 0) {
      root.add(text(s, cx, cy + 124, `${(amount / wagered).toFixed(amount / wagered >= 10 ? 0 : 1)}x your bet`, {
        size: FONT.SIZE.BODY, color: COLORS.GOLD_LIGHT, stroke: COLORS.INK, strokeW: 5, num: true,
      }));
    }
    root.add(text(s, cx, GAME.HEIGHT - 40, 'Click to continue', { size: FONT.SIZE.SMALL, color: COLORS.TEXT_DIM }).setAlpha(0.8));

    // entrance
    title.setScale(0.2 * fitK);
    s.tweens.add({ targets: title, scale: fitK, duration: 420, ease: 'Back.easeOut' });
    s.tweens.add({ targets: title, angle: { from: -2, to: 2 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    rib.setScale(0.4, 0.2);
    s.tweens.add({ targets: rib, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.easeOut' });
    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 140 });

    // coin shower
    this.shower = s.add.particles(cx, -30, 'particle-coin', {
      x: { min: -GAME.WIDTH / 2, max: GAME.WIDTH / 2 },
      speedY: { min: 120, max: 320 }, speedX: { min: -80, max: 80 },
      gravityY: 520, rotate: { min: 0, max: 360 }, lifespan: 2400,
      scale: { min: 0.8, max: 1.3 },
      frequency: tier === 'win' ? 90 : tier === 'big' ? 45 : 30,
      quantity: tier === 'mega' ? 3 : tier === 'big' ? 2 : 1,
    });
    this.sparks = s.add.particles(cx, cy - 40, 'particle-spark', {
      speed: { min: 200, max: 520 }, lifespan: 700, scale: { start: 1.2, end: 0 }, blendMode: 'ADD', emitting: false,
      tint: [COLORS.GOLD_LIGHT, 0xffffff, COLORS.GOLD],
    });
    // coins fall behind the ribbon and the counter
    root.addAt(this.shower, root.getIndex(glow) + 1);
    root.addAt(this.sparks, root.getIndex(glow) + 1);
    this.sparks.explode(tier === 'win' ? 24 : 60);

    playSfx(tier === 'win' ? 'win' : 'bigWin');
    if (tier !== 'win') {
      s.cameras.main.shake(tier === 'mega' ? 450 : 260, tier === 'mega' ? 0.008 : 0.004);
      eventBus.emit(Events.BANNER_SHOW, { tier, amount });
    }

    // roll-up
    const ms = TIMING.BANNER_MS[tier === 'win' ? 'WIN' : tier === 'big' ? 'BIG' : 'MEGA'];
    const c = { v: 0 };
    let ticks = 0;
    this.countTween = s.tweens.add({
      targets: c, v: amount, duration: ms * 0.55, ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.counterText.setText(fmt(c.v));
        if (++ticks % 4 === 0) playSfx('coin', { index: ticks / 4, gain: 0.5 });
      },
      onComplete: () => { this.counterText.setText(fmt(amount)); this.pop(); },
    });
    this.hideTimer = s.time.delayedCall(ms, () => this.hide());
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  pop() {
    if (!this.counterText?.active) return;
    this.scene.tweens.add({ targets: this.counterText, scale: 1.18, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  skip() {
    if (!this.root) return;
    if (this.countTween && this.countTween.isPlaying()) {
      this.countTween.stop();
      this.counterText.setText(fmt(this.amount));
      this.pop();
      return;
    }
    this.hide();
  }

  hide(instant = false) {
    if (!this.root) return;
    const root = this.root;
    const shower = this.shower;
    const sparks = this.sparks;
    this.root = null;
    this.tier = null;
    // stop catching clicks now, not when the fade-out ends
    if (this.dim?.input) this.dim.disableInteractive();
    this.dim = null;
    this.hideTimer?.remove(false);
    this.countTween?.stop();
    shower?.stop();
    const done = () => root.destroy(); // emitters live inside root
    if (instant || !this.scene.sys.isActive()) done();
    else {
      this.scene.tweens.add({ targets: root, alpha: 0, duration: 220, onComplete: done });
    }
    const r = this.resolve;
    this.resolve = null;
    r?.(true);
  }
}
