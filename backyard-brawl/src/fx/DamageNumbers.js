// Pooled damage numbers (pixel RetroFont, no per-hit canvas redraw).
// At most FX.NUMBERS_MAX on screen. A hit on an enemy that already has a
// young number adds to it (frisbee / zoomies tick fast); when the pool is
// full, new numbers are skipped (crits and boss hits replace the oldest).

import { FX } from '../core/Constants.js';
import { FXT } from './textures.js';

export class DamageNumbers {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.skipped = 0;
  }

  make() {
    const t = this.scene.add.bitmapText(0, 0, FXT.FONT, '0').setOrigin(0.5, 1).setDepth(FX.DEPTH.NUMBERS);
    t.fx = { id: -1, age: 0, value: 0, x: 0, y: 0, crit: false, vx: 0 };
    return t;
  }

  spawn(ev) {
    const big = ev.crit;
    const boss = ev.enemy === 'boss-cat' || ev.enemy === 'boss-vac';
    // merge into a young number on the same enemy
    for (let i = 0; !ev.heal && i < this.active.length; i++) {
      const n = this.active[i];
      if (n.fx.id === ev.id && n.fx.age < FX.NUMBER_MERGE_MS && n.fx.crit === big) {
        n.fx.value += ev.dmg;
        n.fx.age = Math.min(n.fx.age, 60);
        n.setText(this.label(n.fx.value, big));
        n.fx.punch = 1;
        return;
      }
    }
    let n;
    if (this.active.length >= FX.NUMBERS_MAX) {
      if (!big && !boss) {
        this.skipped += 1;
        return;
      }
      n = this.active.shift(); // recycle the oldest
    } else {
      n = this.pool.pop() || this.make();
    }
    const f = n.fx;
    f.id = ev.id;
    f.age = 0;
    f.value = ev.dmg;
    f.crit = big;
    f.punch = 1;
    f.x = ev.x + (Math.random() * 8 - 4);
    f.y = ev.y - 8;
    f.vx = (Math.random() - 0.5) * 12;
    f.id = ev.heal ? -1 : ev.id;
    n.setText(ev.heal ? `+${Math.round(ev.dmg)}` : this.label(f.value, big));
    n.setTint(ev.heal ? FX.NUMBER_HEAL_TINT : (big ? FX.NUMBER_CRIT_TINT : (boss ? FX.NUMBER_BOSS_TINT : FX.NUMBER_TINT)));
    n.setVisible(true).setAlpha(1);
    this.active.push(n);
  }

  label(v, crit) {
    const s = `${Math.max(1, Math.round(v))}`;
    return crit ? `${s}!` : s;
  }

  update(dtMs) {
    let k = 0;
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i];
      const f = n.fx;
      f.age += dtMs;
      if (f.age >= FX.NUMBER_LIFE_MS) {
        n.setVisible(false);
        this.pool.push(n);
        continue;
      }
      this.active[k++] = n;
      const u = f.age / FX.NUMBER_LIFE_MS;
      const rise = FX.NUMBER_RISE * (1 - (1 - u) * (1 - u)); // ease-out
      f.punch = Math.max(0, f.punch - dtMs / 120);
      const base = f.crit ? FX.NUMBER_CRIT_SCALE : 1;
      // pop in: 1.6x -> 1x in 120 ms (integer-ish scales keep the pixels crisp)
      n.setScale(base * (1 + 0.6 * f.punch * f.punch));
      n.setPosition(Math.round(f.x + f.vx * u), Math.round(f.y - rise));
      n.setAlpha(u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
    }
    this.active.length = k;
  }

  clear() {
    for (const n of this.active) {
      n.setVisible(false);
      this.pool.push(n);
    }
    this.active.length = 0;
  }
}
