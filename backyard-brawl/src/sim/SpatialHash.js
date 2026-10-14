// Uniform-grid spatial hash over the arena. Rebuilt every step (clear + insert);
// query(x, y, r) returns the items whose cell overlaps the circle's box.
// Callers do the exact distance test. Arrays are reused, so no per-step garbage.

export class SpatialHash {
  constructor(width, height, cell) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.used = [];
    this.out = [];
  }

  clear() {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  cellIndex(cx, cy) {
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  insert(item) {
    const i = this.cellIndex(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
    const c = this.cells[i];
    if (c.length === 0) this.used.push(i);
    c.push(item);
  }

  /** Items near (x, y) within r (+ one cell of slack). The returned array is reused. */
  query(x, y, r, out = this.out) {
    out.length = 0;
    const s = this.cell;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cy = Math.max(0, y0); cy <= Math.min(this.rows - 1, y1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(this.cols - 1, x1); cx++) {
        const c = this.cells[cy * this.cols + cx];
        for (let k = 0; k < c.length; k++) out.push(c[k]);
      }
    }
    return out;
  }
}
