// =============================================================================
// Reel — one spinning column of the Golden Paw cabinet.
//
// The reel scrolls a "tape" of symbols downward. Tape index j sits at screen
// row (2 - j + d) where d is the scroll in cells (row 0 = top of the window).
// At rest d = 0: tape[2] top row, tape[1] middle, tape[0] bottom, tape[3] is
// hidden above and tape[-1] below. Unknown tape entries continue the physical
// strip, so a spinning reel shows the real strip order.
//
// Landing: when a stop is requested the reel writes the target column into
// tape[D..D+2] (plus strip neighbours) at least one cell above anything
// visible, brakes so d reaches D + overshoot with a continuous velocity, then
// springs back to exactly D. The final rows always equal the logic's outcome.
//
// Symbols outside the window are cropped (setCrop) — no masks needed.
// =============================================================================

import { CELL_W, CELL_H, SYM_SIZE } from './textures.js';

const mod = (a, n) => ((a % n) + n) % n;

const V_MAX = 26;          // cells / s at full speed
const V_ANTICIPATE = 13;   // slower, dramatic spin while waiting for a 3rd scatter
const ACCEL = 90;          // cells / s^2
const KICK_AMT = 0.22;     // upward kick (cells)
const OVERSHOOT = 0.13;    // landing overshoot (cells)
const SETTLE_S = 0.2;
const BLUR_V = 7;          // above this speed the blur textures show

export class Reel {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} index  0..4
   * @param {object} o { x (centre), top (window top y), strip, depth, onLand(reel) }
   */
  constructor(scene, index, o) {
    this.scene = scene;
    this.index = index;
    this.x = o.x;
    this.top = o.top;
    this.bottom = o.top + CELL_H * 3;
    this.strip = o.strip;
    this.onLand = o.onLand || (() => {});
    this.stripTop = o.stop ?? 0;
    this.tape = new Map();
    this.d = 0;
    this.v = 0;
    this.state = 'idle';
    this.vTarget = V_MAX;
    this.free = false;
    this.cells = [];
    for (let c = 0; c < 5; c++) {
      const panel = scene.add.image(this.x, 0, 'slot-cell').setDepth(o.depth);
      const sym = scene.add.image(this.x, 0, 'sym-bowl').setDepth(o.depth + 1);
      this.cells.push({ panel, sym, j: null });
    }
    this.symScale = SYM_SIZE / 128;
    if (o.grid) this.setColumn(o.grid, o.stop ?? null);
    this.layout();
  }

  // --- tape --------------------------------------------------------------------------

  tapeAt(j) {
    if (this.tape.has(j)) return this.tape.get(j);
    return this.strip[mod(this.stripTop + 2 - j, this.strip.length)];
  }

  /** Show a column at rest (col = [top, mid, bottom]); stop = strip index of the top row or null. */
  setColumn(col, stop = null) {
    this.tape.clear();
    this.d = 0;
    if (stop !== null && stop !== undefined) this.stripTop = stop;
    this.tape.set(2, col[0]);
    this.tape.set(1, col[1]);
    this.tape.set(0, col[2]);
    this.layout();
  }

  /** Symbol ids currently at rest, [top, mid, bottom]. */
  column() {
    return [this.tapeAt(2), this.tapeAt(1), this.tapeAt(0)];
  }

  // --- motion --------------------------------------------------------------------------

  /** Start spinning after `delay` s. The target is given later with stopAt(). */
  start(delay = 0, kickS = 0.13) {
    this.state = 'wait';
    this.wait = delay;
    this.kickS = kickS;
    this.t = 0;
    this.v = 0;
    this.vTarget = V_MAX;
    this.target = null;
    this.stopRequested = false;
  }

  /** Request the stop: col = [top, mid, bottom], stop = strip index or null. fast = slam. */
  requestStop(col, stop = null, fast = false) {
    this.target = { col, stop };
    this.stopRequested = true;
    this.fast = fast;
    if (this.state === 'spin') this.beginBrake();
  }

  setAnticipation(on) {
    this.vTarget = on ? V_ANTICIPATE : V_MAX;
  }

  get spinning() { return this.state !== 'idle'; }
  get braking() { return this.state === 'brake' || this.state === 'settle' || this.state === 'idle'; }

  beginBrake() {
    const base = Math.floor(this.d);
    const D = base + 6;
    const { col, stop } = this.target;
    const L = this.strip.length;
    // target rows + neighbours (all >= base + 4, so nothing visible changes)
    this.tape.set(D + 2, col[0]);
    this.tape.set(D + 1, col[1]);
    this.tape.set(D, col[2]);
    if (stop !== null && stop !== undefined) {
      this.tape.set(D + 3, this.strip[mod(stop - 1, L)]);
      this.tape.set(D - 1, this.strip[mod(stop + 3, L)]);
      this.tape.set(D - 2, this.strip[mod(stop + 4, L)]);
    }
    this.D = D;
    this.b0 = this.d;
    this.bT = D + OVERSHOOT;
    const v = Math.max(4, this.v);
    // quad ease-out keeps the start velocity: duration = 2 * distance / v
    this.bDur = this.fast ? 0.2 : Math.min(1.6, (2 * (this.bT - this.b0)) / v);
    this.bU = 0;
    this.state = 'brake';
  }

  update(dt) {
    switch (this.state) {
      case 'idle': return;
      case 'wait':
        this.wait -= dt;
        if (this.wait <= 0) { this.state = 'kick'; this.t = 0; }
        return;
      case 'kick': {
        this.t += dt;
        const u = Math.min(1, this.t / this.kickS);
        this.d = -KICK_AMT * Math.sin(Math.PI * u);
        if (u >= 1) { this.d = 0; this.state = 'spin'; this.v = V_MAX * 0.3; }
        break;
      }
      case 'spin': {
        const dv = ACCEL * dt;
        if (this.v < this.vTarget) this.v = Math.min(this.vTarget, this.v + dv);
        else this.v = Math.max(this.vTarget, this.v - dv * 0.6);
        this.d += this.v * dt;
        if (this.stopRequested) this.beginBrake();
        break;
      }
      case 'brake': {
        this.bU = Math.min(1, this.bU + dt / this.bDur);
        const e = 1 - (1 - this.bU) * (1 - this.bU);
        this.d = this.b0 + (this.bT - this.b0) * e;
        this.v = (2 * (this.bT - this.b0) * (1 - this.bU)) / this.bDur;
        if (this.bU >= 1) { this.state = 'settle'; this.t = 0; this.v = 0; }
        break;
      }
      case 'settle': {
        this.t += dt;
        const u = Math.min(1, this.t / SETTLE_S);
        // spring back up with a tiny wobble
        this.d = this.D + OVERSHOOT * (1 - u) * Math.cos(u * Math.PI * 1.5);
        if (u >= 1) this.land();
        break;
      }
      default: break;
    }
    this.layout();
  }

  land() {
    const { col, stop } = this.target;
    this.state = 'idle';
    this.v = 0;
    this.setColumn(col, stop ?? null);
    if (stop === null || stop === undefined) {
      // forced grid: keep the strip continuation from where it was
    }
    this.onLand(this);
  }

  // --- drawing ----------------------------------------------------------------------------

  /** Cell image for a resting row (0 top .. 2 bottom). */
  cellAt(row) {
    const j = 2 - row;
    return this.cells.find(c => c.j === j) || null;
  }

  layout() {
    const base = Math.floor(this.d);
    const blur = this.v > BLUR_V;
    const stretch = blur ? 1 + Math.min(0.18, this.v / 140) : 1;
    for (let c = 0; c < 5; c++) {
      const cell = this.cells[c];
      const j = base - 1 + c;
      cell.j = j;
      const row = 2 - j + this.d;
      const cy = this.top + row * CELL_H + CELL_H / 2;
      const id = this.tapeAt(j);
      const key = blur ? `sym-${id}-blur` : `sym-${id}`;
      if (cell.sym.texture.key !== key) cell.sym.setTexture(key);
      cell.sym.setScale(this.symScale, this.symScale * stretch);
      cell.sym.y = cy;
      cell.sym.x = this.x;
      cell.panel.y = cy;
      this.crop(cell.panel, cy);
      this.crop(cell.sym, cy);
    }
  }

  crop(img, cy) {
    const fw = img.frame.width;
    const fh = img.frame.height;
    const dispH = fh * Math.abs(img.scaleY);
    const t = cy - dispH / 2;
    const b = cy + dispH / 2;
    const vt = Math.max(t, this.top);
    const vb = Math.min(b, this.bottom);
    if (vb - vt <= 0.5) {
      img.setVisible(false);
      return;
    }
    img.setVisible(true);
    if (vt === t && vb === b) {
      if (img.isCropped) img.setCrop();
      return;
    }
    const k = fh / dispH;
    img.setCrop(0, (vt - t) * k, fw, (vb - vt) * k);
  }

  /** Tint the light panels (free spins = lavender). */
  setPanelTint(color) {
    for (const c of this.cells) {
      if (color === null) c.panel.clearTint();
      else c.panel.setTint(color);
    }
  }

  destroy() {
    for (const c of this.cells) { c.panel.destroy(); c.sym.destroy(); }
    this.cells = [];
  }
}

export { CELL_W, CELL_H };
