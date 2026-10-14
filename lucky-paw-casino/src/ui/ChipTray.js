// =============================================================================
// ChipTray — pick the active chip (1, 5, 25, 100, 500).
//
//   this.tray = new ChipTray(scene, 640, 664, { keys: false, onChange: (v) => {} });
//   this.tray.value          the selected chip value
//   this.tray.setValue(25)
//   this.tray.chipPos(v)     {x, y} of a chip in game px (BetSpot flies chips from here)
//   this.tray.refresh()      re-check which chips are affordable (automatic on wallet events)
//   this.tray.setEnabled(false)  grey out during a round
//
// Options: values (default all five), size (64), gap (12), keys (true binds
//   1-5 to the chips; OFF by default because games may want number keys),
//   maxBet (number | () => number) overrides the VIP table limit for the
//   "too big" check, depth.
// Chips above the balance or the table limit are dimmed and can't be picked;
// if the selected chip becomes unaffordable the tray drops to the largest one
// that still fits.
// =============================================================================

import Phaser from 'phaser';
import { CHIPS, CHIP_VALUES, CHIP_SIZE, COLORS } from '../core/Constants.js';
import { Events, eventBus, listen } from '../core/EventBus.js';
import { wallet } from '../core/Casino.js';
import { playSfx } from '../audio/sfx.js';
import { modalOpen } from './theme.js';

const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

export class ChipTray extends Phaser.GameObjects.Container {
  constructor(scene, x, y, o = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.o = o;
    this.values = o.values ?? CHIP_VALUES;
    this.size = o.size ?? CHIP_SIZE;
    this.gap = o.gap ?? 12;
    this.enabled = true;
    this.onChange = o.onChange || null;
    this.chips = [];

    const n = this.values.length;
    const total = n * this.size + (n - 1) * this.gap;
    this.width = total;
    const plate = scene.add.graphics();
    plate.fillStyle(0x000000, 0.35);
    plate.fillRoundedRect(-total / 2 - 14, -this.size / 2 - 8, total + 28, this.size + 22, 18);
    plate.lineStyle(2, COLORS.BRASS_DARK, 0.8);
    plate.strokeRoundedRect(-total / 2 - 14, -this.size / 2 - 8, total + 28, this.size + 22, 18);
    this.add(plate);
    this.ring = scene.add.graphics();
    this.add(this.ring);

    this.values.forEach((v, i) => {
      const def = CHIPS.find(c => c.value === v);
      const cx = -total / 2 + this.size / 2 + i * (this.size + this.gap);
      const img = scene.add.image(cx, 0, def.key).setDisplaySize(this.size, this.size);
      img.setInteractive(new Phaser.Geom.Circle(img.width / 2, img.height / 2, img.width / 2), Phaser.Geom.Circle.Contains);
      img.input.cursor = 'pointer';
      img.on('pointerdown', () => this.pick(v, true));
      img.on('pointerover', () => { if (this.canUse(v) && v !== this.value) scene.tweens.add({ targets: img, y: -5, duration: 100 }); });
      img.on('pointerout', () => { if (v !== this.value) scene.tweens.add({ targets: img, y: 0, duration: 100 }); });
      this.add(img);
      this.chips.push({ v, img, baseX: cx });
    });

    this.keyHandlers = [];
    if (o.keys) {
      this.values.forEach((v, i) => {
        const ev = `keydown-${KEY_NAMES[i]}`;
        const fn = () => { if (!modalOpen(scene)) this.pick(v, true); };
        scene.input.keyboard?.on(ev, fn);
        this.keyHandlers.push([ev, fn]);
      });
    }
    this.once('destroy', () => {
      for (const [ev, fn] of this.keyHandlers) scene.input?.keyboard?.off(ev, fn);
    });

    listen(this, Events.BALANCE_CHANGED, () => this.refresh());
    listen(this, Events.VIP_UP, () => this.refresh());

    if (o.depth !== undefined) this.setDepth(o.depth);
    this.value = this.values.find(v => v === (o.value ?? 5)) ?? this.values[0];
    this.refresh();
    this.drawSelection(false);
  }

  maxBet() {
    const m = this.o.maxBet;
    return typeof m === 'function' ? m() : (m ?? wallet.maxBet());
  }

  canUse(v) {
    return this.enabled && v <= wallet.balance && v <= this.maxBet();
  }

  pick(v, user = false) {
    if (!this.canUse(v)) {
      if (user) playSfx('error', { gain: 0.5 });
      return false;
    }
    if (v === this.value) return true;
    this.value = v;
    if (user) playSfx('chip');
    this.drawSelection(true);
    eventBus.emit(Events.CHIP_SELECTED, { value: v });
    this.onChange?.(v);
    return true;
  }

  setValue(v) {
    if (this.values.includes(v)) {
      this.value = v;
      this.drawSelection(false);
    }
    return this;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.refresh();
    return this;
  }

  refresh() {
    for (const c of this.chips) {
      const ok = this.canUse(c.v);
      c.img.setAlpha(ok ? 1 : 0.32);
      if (ok) c.img.clearTint(); else c.img.setTint(0x8a8a8a);
    }
    if (!this.canUse(this.value)) {
      const fits = this.values.filter(v => this.canUse(v));
      if (fits.length) {
        this.value = fits[fits.length - 1];
        this.onChange?.(this.value);
      }
    }
    this.drawSelection(false);
  }

  drawSelection(animate) {
    const r = this.ring;
    r.clear();
    for (const c of this.chips) {
      const sel = c.v === this.value;
      const y = sel ? -10 : 0;
      if (animate) this.scene.tweens.add({ targets: c.img, y, duration: 140, ease: 'Back.easeOut' });
      else c.img.y = y;
      if (sel) {
        r.fillStyle(COLORS.GOLD, 0.25);
        r.fillCircle(c.baseX, -10, this.size / 2 + 9);
        r.lineStyle(3, COLORS.GOLD, 1);
        r.strokeCircle(c.baseX, -10, this.size / 2 + 4);
        r.fillStyle(COLORS.GOLD, 1);
        r.fillTriangle(c.baseX - 7, this.size / 2 + 2, c.baseX + 7, this.size / 2 + 2, c.baseX, this.size / 2 - 6);
      }
    }
  }

  /** World position of a chip (where BetSpot animations start). */
  chipPos(v = this.value) {
    const c = this.chips.find(ch => ch.v === v) || this.chips[0];
    const m = this.getWorldTransformMatrix();
    return { x: m.tx + c.baseX * m.a, y: m.ty + c.img.y * m.d };
  }
}
