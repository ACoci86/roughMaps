import type { Point } from './sketch';
import { smoothLine, trace } from './terrain';

export type Ripple = { points: Point[]; closed: boolean; ring: number };

const CELL = 2;
const RINGS = [4, 9, 15];
const MIN_LENGTH = 30;
const FAR = 1e12;

function rasterise(shapes: Point[][][], cols: number, rows: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / CELL, 1 / CELL);
  ctx.fillStyle = '#fff';
  for (const rings of shapes) {
    ctx.beginPath();
    for (const ring of rings) {
      if (ring.length < 3) continue;
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) ctx.lineTo(ring[k][0], ring[k][1]);
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const inside = new Uint8Array(cols * rows);
  for (let i = 0; i < inside.length; i++) inside[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return inside;
}

function spread(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function distances(inside: Uint8Array, cols: number, rows: number): Float32Array {
  const grid = new Float64Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = inside[i] ? FAR : 0;
  const n = Math.max(cols, rows);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) f[r] = grid[r * cols + c];
    spread(f, rows, out, v, z);
    for (let r = 0; r < rows; r++) grid[r * cols + c] = out[r];
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) f[c] = grid[r * cols + c];
    spread(f, cols, out, v, z);
    for (let c = 0; c < cols; c++) grid[r * cols + c] = out[c];
  }
  const result = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) result[i] = Math.sqrt(grid[i]) * CELL;
  return result;
}

function ringIndex(d: number): number {
  if (d <= 0) return 0;
  let from = 0;
  for (let k = 0; k < RINGS.length; k++) {
    if (d <= RINGS[k]) return k + (d - from) / (RINGS[k] - from);
    from = RINGS[k];
  }
  return RINGS.length + 0.5;
}

function lineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

export function rippleLines(shapes: Point[][][], width: number, height: number, sea = false): Ripple[] {
  const cols = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(height / CELL) + 1;
  const inside = rasterise(shapes, cols, rows);
  if (sea) for (let i = 0; i < inside.length; i++) inside[i] = inside[i] ? 0 : 1;
  let any = false;
  for (let i = 0; i < inside.length && !any; i++) any = inside[i] === 0;
  if (!any) return [];
  const field = distances(inside, cols, rows).map(ringIndex);
  return trace(field, cols, rows, CELL, 0, 1, 1).flatMap(({ level, points, closed }): Ripple[] => {
    if (lineLength(points) < MIN_LENGTH) return [];
    const smooth = smoothLine(points, closed);
    return smooth && smooth.length > 1 ? [{ points: smooth, closed, ring: level }] : [];
  });
}
