import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Point } from './sketch';
import { simplifyShape } from './shapes';

export type TerrainMode = 'none' | 'contours' | 'hachures' | 'both';

export const TERRAIN_MODES: { id: TerrainMode; label: string; note: string }[] = [
  { id: 'none', label: 'Off', note: 'No hills or mountains' },
  { id: 'contours', label: 'Contour lines', note: 'Lines of equal height, like a hiking map' },
  { id: 'hachures', label: 'Hachures', note: 'Strokes down the slopes, like an old military map' },
  { id: 'both', label: 'Contours and hachures', note: 'Both together' },
];

export const TERRAIN_HINTS: Record<TerrainMode, string> = {
  none: 'Show hills and mountains. Best for outdoor and mountain maps.',
  contours: 'Lines of equal height, with heights written on every fifth line.',
  hachures: 'Short strokes down the slopes, darker where it is steep.',
  both: 'Contour lines with hachures underneath.',
};

export const TERRAIN_CREDIT = 'Elevation: Mapzen, USGS and others';

export type Terrain = { cols: number; rows: number; step: number; heights: Float32Array; metres: number };
export type Contour = { points: Point[]; closed: boolean; height: number; major: boolean };
export type Hachure = { from: Point; to: Point; weight: number };

const TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const TILE = 256;
const MAX_DEM_ZOOM = 15;
const MIN_MAP_ZOOM = 8;
const MAX_TILES = 40;
const MAX_CACHED = 120;
const STEP = 3;
const EARTH = 40075016.686;
const NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const MIN_CONTOUR_LENGTH = 18;

const cache = new Map<string, Promise<Float32Array | null>>();

async function decode(url: string): Promise<Float32Array | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, TILE, TILE);
  const heights = new Float32Array(TILE * TILE);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = Math.max(0, data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768);
  }
  return heights;
}

function readTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const url = TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  let request = cache.get(url);
  if (!request) {
    request = decode(url).catch(() => null);
    request.then((tile) => {
      if (!tile) cache.delete(url);
    });
    cache.set(url, request);
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  return request;
}

function smooth(values: Float32Array, cols: number, rows: number): void {
  const copy = new Float32Array(values);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols) continue;
          sum += copy[rr * cols + cc];
          count++;
        }
      }
      values[r * cols + c] = sum / count;
    }
  }
}

export async function loadTerrain(map: MapLibreMap): Promise<Terrain | null> {
  const zoom = map.getZoom();
  if (zoom < MIN_MAP_ZOOM) return null;
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const z = Math.min(MAX_DEM_ZOOM, Math.max(0, Math.round(zoom)));
  const n = 2 ** z;
  const world = (x: number, y: number): Point => {
    const { lng, lat } = map.unproject([x, y]);
    const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return [((lng + 180) / 360) * n * TILE, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * TILE];
  };
  const origin = world(0, 0);
  const right = world(width, 0);
  const down = world(0, height);
  const ax = (right[0] - origin[0]) / width;
  const ay = (right[1] - origin[1]) / width;
  const bx = (down[0] - origin[0]) / height;
  const by = (down[1] - origin[1]) / height;
  const at = (x: number, y: number): Point => [origin[0] + ax * x + bx * y, origin[1] + ay * x + by * y];

  const corners = [at(0, 0), at(width, 0), at(0, height), at(width, height)];
  const x0 = Math.floor((Math.min(...corners.map((p) => p[0])) - 2) / TILE);
  const x1 = Math.floor((Math.max(...corners.map((p) => p[0])) + 2) / TILE);
  const y0 = Math.max(0, Math.floor((Math.min(...corners.map((p) => p[1])) - 2) / TILE));
  const y1 = Math.min(n - 1, Math.floor((Math.max(...corners.map((p) => p[1])) + 2) / TILE));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return null;

  const keys: string[] = [];
  const requests: Promise<Float32Array | null>[] = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      keys.push(`${tx}|${ty}`);
      requests.push(readTile(z, ((tx % n) + n) % n, ty));
    }
  }
  const loaded = await Promise.all(requests);
  if (loaded.some((tile) => !tile)) return null;
  const tiles = new Map(keys.map((key, i) => [key, loaded[i]!]));

  const pixel = (x: number, y: number): number => {
    const tx = Math.floor(x / TILE);
    const ty = Math.min(y1, Math.max(y0, Math.floor(y / TILE)));
    const tile = tiles.get(`${tx}|${ty}`);
    if (!tile) return 0;
    const px = x - tx * TILE;
    const py = Math.min(TILE - 1, Math.max(0, y - ty * TILE));
    return tile[py * TILE + px];
  };
  const sample = (wx: number, wy: number): number => {
    const px = wx - 0.5;
    const py = wy - 0.5;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const top = pixel(ix, iy) * (1 - fx) + pixel(ix + 1, iy) * fx;
    const bottom = pixel(ix, iy + 1) * (1 - fx) + pixel(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };

  const cols = Math.ceil(width / STEP) + 1;
  const rows = Math.ceil(height / STEP) + 1;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [wx, wy] = at(c * STEP, r * STEP);
      heights[r * cols + c] = sample(wx, wy);
    }
  }
  smooth(heights, cols, rows);
  smooth(heights, cols, rows);
  const lat = map.getCenter().lat;
  const metres = (EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return { cols, rows, step: STEP, heights, metres };
}

function heightAt(t: Terrain, x: number, y: number): number {
  const gx = Math.min(t.cols - 1.001, Math.max(0, x / t.step));
  const gy = Math.min(t.rows - 1.001, Math.max(0, y / t.step));
  const c = Math.floor(gx);
  const r = Math.floor(gy);
  const fx = gx - c;
  const fy = gy - r;
  const i = r * t.cols + c;
  const h = t.heights;
  const top = h[i] * (1 - fx) + h[i + 1] * fx;
  const bottom = h[i + t.cols] * (1 - fx) + h[i + t.cols + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function slopes(t: Terrain): number[] {
  const { cols, rows, step, heights: h } = t;
  const list: number[] = [];
  for (let r = 1; r < rows - 1; r += 3) {
    for (let c = 1; c < cols - 1; c += 3) {
      const i = r * cols + c;
      list.push(Math.hypot(h[i + 1] - h[i - 1], h[i + cols] - h[i - cols]) / (2 * step));
    }
  }
  return list.sort((a, b) => a - b);
}

export function contourSpacing(t: Terrain): { interval: number; major: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const v of t.heights) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const steep = slopes(t);
  const g = steep[Math.floor(steep.length * 0.9)] ?? 0;
  const want = Math.max(g * 7, (high - low) / 45);
  const interval = NICE.find((v) => v >= want) ?? NICE[NICE.length - 1];
  return { interval, major: interval * (interval === 25 || interval === 250 ? 4 : 5) };
}

function chaikin(points: Point[], closed: boolean): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = closed ? [] : [points[0]];
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  if (!closed) out.push(points[points.length - 1]);
  return out;
}

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

type Traced = { level: number; points: Point[]; closed: boolean };

function trace(h: Float32Array, cols: number, rows: number, step: number, shift: number, interval: number, lowest = -Infinity): Traced[] {
  const levels = new Map<number, Map<number, number[]>>();
  const link = (k: number, a: number, b: number) => {
    let links = levels.get(k);
    if (!links) levels.set(k, (links = new Map()));
    const la = links.get(a);
    if (la) la.push(b);
    else links.set(a, [b]);
    const lb = links.get(b);
    if (lb) lb.push(a);
    else links.set(b, [a]);
  };

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      const a = h[i];
      const b = h[i + 1];
      const d = h[i + cols];
      const e = h[i + cols + 1];
      const low = Math.min(a, b, d, e);
      const high = Math.max(a, b, d, e);
      const top = 2 * i;
      const left = 2 * i + 1;
      const rightEdge = 2 * (i + 1) + 1;
      const bottom = 2 * (i + cols);
      for (let k = Math.max(lowest, Math.floor(low / interval) + 1); k * interval <= high; k++) {
        const level = k * interval;
        const [ua, ub, ud, ue] = [a >= level, b >= level, d >= level, e >= level];
        const crossed: number[] = [];
        if (ua !== ub) crossed.push(top);
        if (ub !== ue) crossed.push(rightEdge);
        if (ud !== ue) crossed.push(bottom);
        if (ua !== ud) crossed.push(left);
        if (crossed.length === 2) {
          link(k, crossed[0], crossed[1]);
        } else if (crossed.length === 4) {
          const middle = (a + b + d + e) / 4 >= level;
          if (ua !== middle) link(k, top, left);
          if (ub !== middle) link(k, top, rightEdge);
          if (ue !== middle) link(k, rightEdge, bottom);
          if (ud !== middle) link(k, left, bottom);
        }
      }
    }
  }

  const spot = (id: number, level: number): Point => {
    const j = id >> 1;
    const c = j % cols;
    const r = Math.floor(j / cols);
    const other = id & 1 ? j + cols : j + 1;
    const span = h[other] - h[j];
    const f = span ? Math.min(1, Math.max(0, (level - h[j]) / span)) : 0.5;
    return id & 1 ? [c * step + shift, (r + f) * step + shift] : [(c + f) * step + shift, r * step + shift];
  };

  const traced: Traced[] = [];
  for (const [k, links] of levels) {
    const level = k * interval;
    const used = new Set<number>();
    const walk = (start: number): void => {
      const ids = [start];
      used.add(start);
      let current = start;
      for (;;) {
        const next = links.get(current)!.find((id) => !used.has(id));
        if (next === undefined) break;
        used.add(next);
        ids.push(next);
        current = next;
      }
      const closed = ids.length > 2 && links.get(current)!.includes(start);
      traced.push({ level, points: ids.map((id) => spot(id, level)), closed });
    };
    for (const [id, list] of links) if (list.length === 1 && !used.has(id)) walk(id);
    for (const id of links.keys()) if (!used.has(id)) walk(id);
  }
  return traced;
}

function smoothLine(points: Point[], closed: boolean): Point[] | null {
  const [simple] = simplifyShape([{ points: chaikin(chaikin(points, closed), closed), closed }], 0.35);
  return simple ? simple.points : null;
}

export function contourLines(t: Terrain): Contour[] {
  const { interval, major } = contourSpacing(t);
  return trace(t.heights, t.cols, t.rows, t.step, 0, interval).flatMap(({ level, points, closed }): Contour[] => {
    if (length(points) < MIN_CONTOUR_LENGTH) return [];
    const smooth = smoothLine(points, closed);
    return smooth ? [{ points: smooth, closed, height: level, major: level % major === 0 }] : [];
  });
}

export type Band = { level: number; top: number; rings: Point[][] };
export type BandStop = { at: number; color: string };

export function heightBands(t: Terrain): { base: number; interval: number; bands: Band[] } {
  const { cols, rows, step, heights } = t;
  let low = Infinity;
  let high = -Infinity;
  for (const v of heights) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const interval = NICE.find((v) => v >= Math.max(20, (high - low) / 12)) ?? NICE[NICE.length - 1];
  const wide = cols + 2;
  const padded = new Float32Array(wide * (rows + 2)).fill(low - interval * 2);
  for (let r = 0; r < rows; r++) padded.set(heights.subarray(r * cols, (r + 1) * cols), (r + 1) * wide + 1);
  const lowest = Math.floor(low / interval) + 1;
  const byLevel = new Map<number, Point[][]>();
  for (const { level, points, closed } of trace(padded, wide, rows + 2, step, -step, interval, lowest)) {
    if (!closed || length(points) < 10) continue;
    const smooth = smoothLine(points, true);
    if (!smooth || smooth.length < 3) continue;
    const list = byLevel.get(level);
    if (list) list.push(smooth);
    else byLevel.set(level, [smooth]);
  }
  const bands = [...byLevel]
    .sort((a, b) => a[0] - b[0])
    .map(([level, rings]) => ({ level, top: level + interval, rings }));
  return { base: (lowest - 1) * interval, interval, bands };
}

function hex(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

export function bandColor(stops: BandStop[], height: number): string {
  if (height <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const next = stops[i];
    if (height > next.at) continue;
    const prev = stops[i - 1];
    const f = (height - prev.at) / (next.at - prev.at);
    const [a, b] = [hex(prev.color), hex(next.color)];
    return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
  }
  return stops[stops.length - 1].color;
}

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hachureStrokes(t: Terrain): Hachure[] {
  const width = (t.cols - 1) * t.step;
  const height = (t.rows - 1) * t.step;
  const spacing = 7;
  const reach = spacing * 0.7;
  const rand = random(7);
  const strokes: Hachure[] = [];
  const probe = t.step;
  for (let row = 0, y = spacing / 2; y < height; y += spacing * 0.87, row++) {
    for (let x = row % 2 ? spacing / 2 : 0; x < width; x += spacing) {
      const px = x + (rand() - 0.5) * spacing * 0.5;
      const py = y + (rand() - 0.5) * spacing * 0.5;
      const gx = (heightAt(t, px + probe, py) - heightAt(t, px - probe, py)) / (2 * probe);
      const gy = (heightAt(t, px, py + probe) - heightAt(t, px, py - probe)) / (2 * probe);
      const g = Math.hypot(gx, gy);
      const slope = (Math.atan(g / t.metres) * 180) / Math.PI;
      if (slope < 5 || g === 0) continue;
      const dx = -gx / g;
      const dy = -gy / g;
      const strength = Math.min(1, slope / 60);
      const lit = (dx + dy) * -Math.SQRT1_2;
      const weight = (0.15 + 0.95 * strength) * (1 - 0.45 * lit);
      strokes.push({ from: [px - dx * reach, py - dy * reach], to: [px + dx * reach, py + dy * reach], weight });
    }
  }
  return strokes;
}

const SAMPLE_TILES = 36;

export async function sampleHeights(points: [number, number][]): Promise<number[] | null> {
  if (!points.length) return null;
  const project = ([lng, lat]: [number, number], n: number): Point => {
    const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return [((lng + 180) / 360) * n * TILE, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * TILE];
  };
  for (let z = 12; z >= 6; z--) {
    const n = 2 ** z;
    const spots = points.map((p) => project(p, n));
    const keys = new Map<string, [number, number]>();
    for (const [x, y] of spots) {
      const tx = Math.floor(x / TILE);
      const ty = Math.min(n - 1, Math.max(0, Math.floor(y / TILE)));
      keys.set(`${tx}|${ty}`, [tx, ty]);
    }
    if (keys.size > SAMPLE_TILES) continue;
    const loaded = await Promise.all([...keys.values()].map(([tx, ty]) => readTile(z, ((tx % n) + n) % n, ty)));
    if (loaded.some((tile) => !tile)) return null;
    const tiles = new Map([...keys.keys()].map((key, i) => [key, loaded[i]!]));
    return spots.map(([x, y]) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.min(n - 1, Math.max(0, Math.floor(y / TILE)));
      const tile = tiles.get(`${tx}|${ty}`)!;
      const px = Math.min(TILE - 1, Math.max(0, Math.floor(x - tx * TILE)));
      const py = Math.min(TILE - 1, Math.max(0, Math.floor(y - ty * TILE)));
      return Math.round(tile[py * TILE + px]);
    });
  }
  return null;
}

export function outlines(values: Float32Array, cols: number, rows: number, tolerance: number): Point[][] {
  return trace(values, cols, rows, 1, -1, 0.5, 1).flatMap(({ points, closed }) => {
    if (!closed || points.length < 3) return [];
    const [simple] = simplifyShape([{ points, closed: true }], tolerance);
    return simple && simple.points.length >= 3 ? [simple.points] : [];
  });
}
