import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { loadCountries } from './countries';
import type { Rect } from './poster';
import { simplifyShape } from './shapes';

type Ring = [number, number][];
type Polygon = Ring[];
type Box = [number, number, number, number];
type Pt = [number, number];
type Colors = { paper: string; ink: string };

export type Locator = { home: Polygon[]; others: Polygon[]; bounds: Box; point: Pt };

const NEAR = 0.12;
const WRAPS = 180;
const FAR_ISLAND = 3;
const NEARBY = 1.5;
const PAD = 0.14;
const SQUARE = 0.6;

function inRing([x, y]: Pt, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function inPolygon(point: Pt, polygon: Polygon): boolean {
  return inRing(point, polygon[0]) && !polygon.slice(1).some((hole) => inRing(point, hole));
}

function extent(polygons: Polygon[]): Box {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(sum) / 2;
}

function ringDistance([x, y]: Pt, ring: Ring): number {
  const squeeze = Math.cos((y * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - x) * squeeze;
    const ay = ring[j][1] - y;
    const bx = (ring[i][0] - x) * squeeze;
    const by = ring[i][1] - y;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
  }
  return best;
}

function gap(a: Box, b: Box): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export async function findLocator(point: Pt): Promise<Locator | null> {
  const countries = await loadCountries();
  const spot: Box = [point[0], point[1], point[0], point[1]];
  let country = countries.find((c) => c.shapes.some((polygon) => inPolygon(point, polygon)));
  let own = country?.shapes.find((polygon) => inPolygon(point, polygon));
  if (!country || !own) {
    let best = NEARBY;
    for (const c of countries) {
      for (const polygon of c.shapes) {
        if (gap(extent([polygon]), spot) >= best) continue;
        const distance = ringDistance(point, polygon[0]);
        if (distance < best) {
          best = distance;
          country = c;
          own = polygon;
        }
      }
    }
  }
  if (!country || !own) return null;
  const largest = country.shapes.reduce((best, polygon) => (ringArea(polygon[0]) > ringArea(best[0]) ? polygon : best));
  const reachOf = (box: Box) => Math.max(box[2] - box[0], box[3] - box[1]) * NEAR;
  const largestBox = extent([largest]);
  const main = gap(extent([own]), largestBox) <= reachOf(largestBox) * FAR_ISLAND ? largest : own;
  const mainBox = extent([main]);
  const reach = reachOf(mainBox);
  const home = country.shapes.filter((polygon) => {
    if (polygon === main || polygon === own) return true;
    const box = extent([polygon]);
    return box[2] - box[0] < WRAPS && gap(box, mainBox) <= reach;
  });
  let [x0, y0, x1, y1] = extent(home);
  const squeeze = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const wide = (x1 - x0) * squeeze;
  const tall = y1 - y0;
  if (wide < tall * SQUARE) {
    const grow = (tall * SQUARE - wide) / squeeze / 2;
    x0 -= grow;
    x1 += grow;
  } else if (tall < wide * SQUARE) {
    const grow = (wide * SQUARE - tall) / 2;
    y0 -= grow;
    y1 += grow;
  }
  const padX = (x1 - x0) * PAD;
  const padY = (y1 - y0) * PAD;
  const bounds: Box = [x0 - padX, y0 - padY, x1 + padX, y1 + padY];
  const others = countries
    .filter((c) => c !== country)
    .flatMap((c) =>
      c.shapes.filter((polygon) => {
        const box = extent([polygon]);
        return box[2] - box[0] < WRAPS && overlaps(box, bounds);
      }),
    );
  return { home, others, bounds, point };
}

export function locatorBox(area: Rect, locator: Locator, below: number): Box {
  const [w, s, e, n] = locator.bounds;
  const squeeze = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const ratio = ((e - w) * squeeze) / (n - s);
  const longest = Math.min(150, Math.max(84, (area.x1 - area.x0) * 0.2));
  const width = ratio >= 1 ? longest : longest * ratio;
  const height = ratio >= 1 ? longest / ratio : longest;
  const x0 = area.x0 + 14;
  const y0 = Math.max(area.y0 + 14, below + 12);
  return [x0, y0, x0 + width, y0 + height];
}

function clip(ring: Pt[], [x0, y0, x1, y1]: Box): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let points = ring;
  for (const [inside, cross] of edges) {
    if (!points.length) break;
    const out: Pt[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) out.push(cross(a, b));
    }
    points = out;
  }
  return points;
}

export function drawLocator(
  rc: RoughCanvas,
  locator: Locator,
  box: Box,
  colors: Colors,
  wobble: Options,
  accent: string,
  faint: string,
  shade: string,
): void {
  const [bx0, by0, bx1, by1] = box;
  const [w, s, e, n] = locator.bounds;
  const toBox = ([lng, lat]: [number, number]): Pt => [
    bx0 + ((lng - w) / (e - w)) * (bx1 - bx0),
    by0 + ((n - lat) / (n - s)) * (by1 - by0),
  ];
  const inner: Box = [bx0 + 1.5, by0 + 1.5, bx1 - 1.5, by1 - 1.5];
  const rings = (polygons: Polygon[]) =>
    polygons.flatMap((polygon) => {
      const clipped = clip(polygon[0].map(toBox), inner);
      if (clipped.length < 3) return [];
      const [simple] = simplifyShape([{ points: clipped, closed: true }], 0.5);
      return simple && simple.points.length >= 3 ? [simple.points] : [];
    });
  const line = { ...wobble, roughness: 0.6 * Number(wobble.roughness ?? 1), bowing: 0.5 * Number(wobble.bowing ?? 1) };

  rc.rectangle(bx0, by0, bx1 - bx0, by1 - by0, { ...line, seed: 61, stroke: colors.ink, strokeWidth: 1.2, fill: colors.paper, fillStyle: 'solid' });
  rings(locator.others).forEach((ring, i) =>
    rc.polygon(ring, { ...line, seed: 71 + i, stroke: faint, strokeWidth: 0.7, disableMultiStroke: true }),
  );
  rings(locator.home).forEach((ring, i) =>
    rc.polygon(ring, { ...line, seed: 171 + i, stroke: colors.ink, strokeWidth: 1, fill: shade, fillStyle: 'hachure', hachureGap: 3, fillWeight: 0.7 }),
  );
  const [x, y] = toBox(locator.point);
  rc.circle(x, y, 9, { ...line, seed: 271, stroke: colors.ink, strokeWidth: 1.1, fill: accent, fillStyle: 'solid' });
}
