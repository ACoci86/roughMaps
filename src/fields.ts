import type { Point } from './sketch';
import { outlines, smoothLine } from './terrain';
import { ringArea } from './shapes';

type Line = { points: Point[]; closed: boolean; key?: number };
type Shape = Line[];

const CELL = 2;
const BIG = 0.015;
const CUT = 3;
const MIN_PIECE = 60;
const KEY_GRID = 40;

function inside([x, y]: Point, ring: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export type FieldView = { width: number; height: number; zoom: number; bearing: number; center: [number, number] };

function keyMaker({ width, height, zoom, bearing, center }: FieldView): (p: Point) => number {
  const world = 512 * 2 ** zoom;
  const rad = (center[1] * Math.PI) / 180;
  const cx = ((center[0] + 180) / 360) * world;
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * world;
  const turn = (bearing * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return ([x, y]) => {
    const dx = x - width / 2;
    const dy = y - height / 2;
    const wx = Math.round((cx + dx * cos - dy * sin) / KEY_GRID);
    const wy = Math.round((cy + dx * sin + dy * cos) / KEY_GRID);
    return ((Math.imul(wx, 73856093) ^ Math.imul(wy, 19349663)) >>> 0) % 1000003;
  };
}

export function splitFields(fields: Shape[], cuts: Point[][], view: FieldView): Shape[] {
  const { width, height } = view;
  const limit = width * height * BIG;
  const big = fields.filter((shape) => ringArea(shape[0]?.points ?? []) > limit);
  if (!big.length) return fields;
  const kept = fields.filter((shape) => !big.includes(shape));

  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / CELL, 1 / CELL);
  ctx.fillStyle = '#000';
  for (const shape of big) {
    ctx.beginPath();
    for (const { points } of shape) {
      ctx.moveTo(points[0][0], points[0][1]);
      for (let k = 1; k < points.length; k++) ctx.lineTo(points[k][0], points[k][1]);
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = CUT;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const line of cuts) {
    if (line.length < 2) continue;
    ctx.moveTo(line[0][0], line[0][1]);
    for (let k = 1; k < line.length; k++) ctx.lineTo(line[k][0], line[k][1]);
  }
  ctx.stroke();

  const alpha = ctx.getImageData(0, 0, cols, rows).data;
  const wide = cols + 2;
  const values = new Float32Array(wide * (rows + 2));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) values[(r + 1) * wide + c + 1] = alpha[(r * cols + c) * 4 + 3] / 255;
  }
  const rings = outlines(values, wide, rows + 2, 0.5)
    .map((ring) => smoothLine(ring.map(([x, y]): Point => [x * CELL, y * CELL]), true))
    .filter((ring): ring is Point[] => ring !== null && ring.length >= 3)
    .map((points) => ({ points, area: ringArea(points) }))
    .filter((ring) => ring.area >= MIN_PIECE)
    .sort((a, b) => b.area - a.area);

  const key = keyMaker(view);
  const pieces: { outer: Point[]; holes: Point[][] }[] = [];
  for (const ring of rings) {
    const around = pieces.filter((piece) => inside(ring.points[0], piece.outer));
    const owner = around[around.length - 1];
    if (owner && around.length % 2 === 1) owner.holes.push(ring.points);
    else pieces.push({ outer: ring.points, holes: [] });
  }
  return [
    ...kept,
    ...pieces.map(({ outer, holes }): Shape => {
      const middle = outer.reduce((sum, [x, y]): Point => [sum[0] + x / outer.length, sum[1] + y / outer.length], [0, 0]);
      return [{ points: outer, closed: true, key: key(middle) }, ...holes.map((points) => ({ points, closed: true }))];
    }),
  ];
}
