import rough from 'roughjs';
import type { Drawable, Op, OpSet, Options, ResolvedOptions } from 'roughjs/bin/core';

type Pt = [number, number];
export type PathLine = { points: Pt[]; closed: boolean };

const generator = rough.generator();

class Dice {
  private seed: number;
  private idle = 0;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    if (this.idle > 0) {
      this.idle--;
      return 0.5;
    }
    return this.seed ? ((2 ** 31 - 1) & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31 : Math.random();
  }

  skip(count: number): void {
    if (!this.seed) return;
    for (let i = 0; i < count; i++) this.seed = Math.imul(48271, this.seed);
  }

  rest(count: number): void {
    this.idle = count;
  }
}

type Diced = Options & { randomizer: { next(): number } };

const edgeDraws = new Map<string, number>();

function drawsPerEdge(options: ResolvedOptions): number {
  const { disableMultiStroke, preserveVertices } = options;
  const key = `${disableMultiStroke}|${preserveVertices}`;
  let draws = edgeDraws.get(key);
  if (draws === undefined) {
    let calls = 0;
    const counter = {
      next: () => {
        calls++;
        return 0.5;
      },
    };
    generator.polygon(
      [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      { disableMultiStroke, preserveVertices, stroke: '#000', randomizer: counter } as Diced,
    );
    draws = calls / 3;
    edgeDraws.set(key, draws);
  }
  return draws;
}

export function toPath(lines: PathLine[]): string {
  return lines
    .map(({ points, closed }) => {
      const d = points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
      return 'M' + d + (closed ? 'Z' : '');
    })
    .join('');
}

function rounded(points: Pt[]): Pt[] {
  return points.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]);
}

function squared(a: Pt, b: Pt): number {
  return Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2);
}

function offLine(p: Pt, a: Pt, b: Pt): number {
  const span = squared(a, b);
  if (span === 0) return squared(p, a);
  const along = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / span));
  return squared(p, [a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along]);
}

function simplified(points: Pt[], tolerance: number, from = 0, to = points.length, kept: Pt[] = []): Pt[] {
  const first = points[from];
  const last = points[to - 1];
  let far = 0;
  let split = 1;
  for (let i = from + 1; i < to - 1; i++) {
    const distance = offLine(points[i], first, last);
    if (distance > far) {
      far = distance;
      split = i;
    }
  }
  if (Math.sqrt(far) > tolerance) {
    simplified(points, tolerance, from, split + 1, kept);
    simplified(points, tolerance, split, to, kept);
  } else {
    if (!kept.length) kept.push(first);
    kept.push(last);
  }
  return kept;
}

function fits(lines: PathLine[], filled: boolean): boolean {
  if (filled) return lines.length === 1 && lines[0].closed && lines[0].points.length >= 3;
  return lines.length > 0 && lines.every(({ points, closed }) => points.length >= (closed ? 3 : 1));
}

function edgeOps(points: Pt[], closed: boolean, options: Options): Op[] {
  return (closed ? generator.polygon(points, options) : generator.linearPath(points, options)).sets[0].ops;
}

export function resolveOptions(options: Options): ResolvedOptions {
  return { ...generator.defaultOptions, ...options };
}

export function roughPath(lines: PathLine[], options: Options): Drawable {
  const resolved = resolveOptions(options);
  const filled = !!resolved.fill && resolved.fill !== 'transparent' && resolved.fill !== 'none';
  const stroked = resolved.stroke !== 'none';
  if (!fits(lines, filled)) return generator.path(toPath(lines), options);

  const dice = new Dice(resolved.seed || 0);
  const shared: Diced = { ...options, randomizer: dice };
  const pen: Diced = { ...shared, fill: undefined, stroke: '#000' };
  const rings = lines.map(({ points, closed }) => ({ points: rounded(points), closed }));
  const sets: OpSet[] = [];
  const outline: Op[] = [];

  if (stroked) {
    for (const { points, closed } of rings) {
      for (const op of edgeOps(points, closed, pen)) outline.push(op);
    }
  } else {
    const edges = rings.reduce((sum, { points, closed }) => sum + (closed ? points.length : points.length - 1), 0);
    dice.skip(edges * drawsPerEdge(resolved));
  }

  if (filled) {
    const ring = rings[0].points;
    if (resolved.fillStyle === 'solid') {
      const ops = edgeOps(ring, true, {
        ...pen,
        disableMultiStroke: true,
        roughness: resolved.roughness ? resolved.roughness + resolved.fillShapeRoughnessGain : 0,
      });
      sets.push({ type: 'fillPath', ops: ops.filter((op, i) => i === 0 || op.op !== 'move') });
    } else {
      const closing: Pt = [ring[0][0], ring[0][1]];
      const loop = simplified([...ring.map(([x, y]): Pt => [x, y]), closing], (1 + resolved.roughness) / 2);
      const edges = loop.length > 2 ? loop.length : loop.length === 2 ? 1 : 0;
      dice.rest(edges * drawsPerEdge(resolved));
      sets.push(generator.polygon(loop, { ...shared, stroke: 'none' }).sets[0]);
    }
  }

  if (stroked) sets.push({ type: 'path', ops: outline });
  return { shape: 'path', sets, options: resolved };
}
