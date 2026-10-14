import { GRID } from '../core/Constants.js';

// The 9 x rows garden grid: tile geometry and occupancy (unit id or 0).

export function tileCenterX(col) {
  return GRID.X + col * GRID.TILE + GRID.TILE / 2;
}

export function rowCenterY(row) {
  return GRID.Y + row * GRID.TILE + GRID.TILE / 2;
}

export function rowTop(row) {
  return GRID.Y + row * GRID.TILE;
}

/** Tile under (x, y), or null outside the grid. rows limits the active rows. */
export function cellAt(x, y, rows = GRID.ROWS) {
  if (x < GRID.X || x >= GRID.RIGHT || y < GRID.Y || y >= GRID.Y + rows * GRID.TILE) return null;
  return {
    row: Math.floor((y - GRID.Y) / GRID.TILE),
    col: Math.floor((x - GRID.X) / GRID.TILE),
  };
}

export class Grid {
  constructor(rows = GRID.ROWS, cols = GRID.COLS) {
    this.rows = rows;
    this.cols = cols;
    this.cells = Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  inside(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  get(row, col) {
    return this.inside(row, col) ? this.cells[row][col] : 0;
  }

  isFree(row, col) {
    return this.inside(row, col) && this.cells[row][col] === 0;
  }

  set(row, col, id) {
    if (this.inside(row, col)) this.cells[row][col] = id;
  }

  clear(row, col) {
    this.set(row, col, 0);
  }
}
