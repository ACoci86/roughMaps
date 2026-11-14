import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { Point } from './sketch';

export type Role = 'badge' | 'line' | 'accent' | 'canopy';
export type Doodle = { drawable: Drawable; role: Role };

type Ring = Point[];
type Box = [number, number, number, number];
type BoxedRing = { ring: Ring; box: Box };

const generator = rough.generator();
const MAX_TREES = 900;

function random(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function boxOf(ring: Ring): Box {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function boxed(rings: Ring[]): BoxedRing[] {
  return rings.map((ring) => ({ ring, box: boxOf(ring) }));
}

function inside([x, y]: Point, rings: BoxedRing[]): boolean {
  let hit = false;
  for (const { ring, box } of rings) {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export function treeSpots(
  areas: Ring[][],
  spacing: number,
  seed: number,
  [width, height]: [number, number],
  limit = MAX_TREES,
  avoidAreas: Ring[][] = [],
): Point[] {
  const rand = random(seed);
  const spots: Point[] = [];
  const avoid = avoidAreas.map(boxed);
  for (const area of areas) {
    const rings = boxed(area);
    const minX = Math.max(0, Math.min(...rings.map((r) => r.box[0])));
    const minY = Math.max(0, Math.min(...rings.map((r) => r.box[1])));
    const maxX = Math.min(width, Math.max(...rings.map((r) => r.box[2])));
    const maxY = Math.min(height, Math.max(...rings.map((r) => r.box[3])));
    const reach = spacing * 0.35;
    for (let row = 0, y = minY + spacing / 2; y < maxY; y += spacing * 0.87, row++) {
      for (let x = minX + (row % 2 ? spacing / 2 : 0); x < maxX; x += spacing) {
        const p: Point = [x + (rand() - 0.5) * spacing * 0.5, y + (rand() - 0.5) * spacing * 0.5];
        const around: Point[] = [p, [p[0] - reach, p[1]], [p[0] + reach, p[1]], [p[0], p[1] - reach], [p[0], p[1] + reach]];
        if (around.every((q) => inside(q, rings)) && !avoid.some((a) => inside(p, a))) spots.push(p);
        if (spots.length >= limit) return spots;
      }
    }
  }
  return spots;
}

export function tree([x, y]: Point, size: number, seed: number, wobble: Options): Doodle[] {
  return [
    { drawable: generator.line(x, y, x, y + size * 0.9, { ...wobble, seed, stroke: '#000' }), role: 'line' },
    {
      drawable: generator.circle(x, y, size, {
        ...wobble,
        seed,
        stroke: '#000',
        fill: '#000',
        fillStyle: 'hachure',
        hachureGap: 2.2,
      }),
      role: 'canopy',
    },
  ];
}

type Draw = (x: number, y: number, o: Options) => Drawable[];

const ICONS: Record<string, Draw> = {
  cafe: (x, y, o) => [
    generator.path(`M${x - 4} ${y - 2}L${x + 3} ${y - 2}L${x + 2} ${y + 4}L${x - 3} ${y + 4}Z`, o),
    generator.arc(x + 3, y + 0.5, 4, 4, -Math.PI / 2, Math.PI / 2, false, o),
    generator.line(x - 1.5, y - 6, x - 1, y - 3.5, o),
    generator.line(x + 1, y - 6, x + 1.5, y - 3.5, o),
  ],
  restaurant: (x, y, o) => [
    generator.line(x - 3, y - 5, x - 3, y + 5, o),
    generator.line(x - 5, y - 5, x - 5, y - 1.5, o),
    generator.line(x - 1, y - 5, x - 1, y - 1.5, o),
    generator.line(x - 5, y - 1.5, x - 1, y - 1.5, o),
    generator.path(`M${x + 3} ${y + 5}L${x + 3} ${y - 5}Q${x + 6} ${y - 2} ${x + 3} ${y}`, o),
  ],
  bar: (x, y, o) => [
    generator.path(`M${x - 4.5} ${y - 5}L${x + 4.5} ${y - 5}L${x} ${y}Z`, o),
    generator.line(x, y, x, y + 4.5, o),
    generator.line(x - 3, y + 5, x + 3, y + 5, o),
  ],
  worship: (x, y, o) => [
    generator.path(`M${x - 4} ${y + 5}L${x - 4} ${y - 1}L${x} ${y - 5.5}L${x + 4} ${y - 1}L${x + 4} ${y + 5}Z`, o),
    generator.line(x, y + 5, x, y + 1.5, o),
  ],
  museum: (x, y, o) => [
    generator.path(`M${x - 5.5} ${y - 2}L${x} ${y - 6}L${x + 5.5} ${y - 2}Z`, o),
    generator.line(x - 3.5, y - 1, x - 3.5, y + 4, o),
    generator.line(x, y - 1, x, y + 4, o),
    generator.line(x + 3.5, y - 1, x + 3.5, y + 4, o),
    generator.line(x - 5.5, y + 5, x + 5.5, y + 5, o),
  ],
  hospital: (x, y, o) => [
    generator.path(
      `M${x - 1.6} ${y - 5}L${x + 1.6} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y - 1.6}L${x + 5} ${y + 1.6}` +
        `L${x + 1.6} ${y + 1.6}L${x + 1.6} ${y + 5}L${x - 1.6} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y + 1.6}` +
        `L${x - 5} ${y - 1.6}L${x - 1.6} ${y - 1.6}Z`,
      o,
    ),
  ],
  school: (x, y, o) => [
    generator.path(`M${x} ${y - 3}L${x - 5} ${y - 4.5}L${x - 5} ${y + 3.5}L${x} ${y + 5}L${x + 5} ${y + 3.5}L${x + 5} ${y - 4.5}Z`, o),
    generator.line(x, y - 3, x, y + 5, o),
  ],
  tent: (x, y, o) => [
    generator.path(`M${x - 6} ${y + 4.5}L${x} ${y - 5.5}L${x + 6} ${y + 4.5}Z`, o),
    generator.path(`M${x} ${y - 5.5}L${x - 1.5} ${y + 4.5}M${x - 1.5} ${y + 4.5}L${x + 1.8} ${y + 0.5}L${x + 2.2} ${y + 4.5}`, o),
  ],
  hut: (x, y, o) => [
    generator.path(`M${x - 6} ${y - 0.5}L${x} ${y - 6}L${x + 6} ${y - 0.5}`, o),
    generator.path(`M${x - 4.5} ${y - 1.5}L${x - 4.5} ${y + 5}L${x + 4.5} ${y + 5}L${x + 4.5} ${y - 1.5}`, o),
    generator.path(`M${x - 1.5} ${y + 5}L${x - 1.5} ${y + 1}L${x + 1.5} ${y + 1}L${x + 1.5} ${y + 5}`, o),
  ],
  star: (x, y, o) => {
    const points: Point[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 2.4 : 5.8;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
    return [generator.polygon(points, o)];
  },
};

export const ICON_RADIUS = 10;

export function icon(name: string, [x, y]: Point, seed: number, wobble: Options): Doodle[] {
  const line: Options = {
    ...wobble,
    roughness: (wobble.roughness ?? 1) * 0.5,
    seed,
    stroke: '#000',
    disableMultiStroke: true,
  };
  const badge = generator.circle(x, y, ICON_RADIUS * 2, {
    ...wobble,
    roughness: (wobble.roughness ?? 1) * 0.6,
    seed,
    stroke: '#000',
    fill: '#000',
    fillStyle: 'solid',
    disableMultiStroke: true,
  });
  const marks = (ICONS[name] ?? ICONS.star)(x, y, line);
  return [{ drawable: badge, role: 'badge' }, ...marks.map((drawable) => ({ drawable, role: 'line' as Role }))];
}
