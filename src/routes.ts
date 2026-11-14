import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import type { Point } from './sketch';

export type Route = { points: [number, number][]; color: string; ele?: number[] };
export type PlacedRoute = { points: Point[]; color: string };

export const ROUTE_COLOR = '#2a6fdb';

type Colors = { paper: string; ink: string };

export function drawRoute(
  rc: RoughCanvas,
  route: PlacedRoute,
  index: number,
  colors: Colors,
  wobble: Options,
): void {
  const { points, color } = route;
  if (!points.length) return;
  const seed = 301 + index * 5;
  const calm = { ...wobble, roughness: Number(wobble.roughness ?? 1) * 0.6, bowing: 0 };

  if (points.length > 1) {
    const draw = (options: Options) =>
      points.length === 2
        ? rc.line(points[0][0], points[0][1], points[1][0], points[1][1], options)
        : rc.curve(points, options);
    draw({ ...calm, seed, stroke: colors.paper, strokeWidth: 7, disableMultiStroke: true });
    draw({ ...calm, seed, stroke: color, strokeWidth: 3.2, strokeLineDash: [10, 7], disableMultiStroke: true });
  }

  const [sx, sy] = points[0];
  rc.circle(sx, sy, 11, { ...calm, seed: seed + 1, stroke: colors.ink, strokeWidth: 1.4, fill: color, fillStyle: 'solid' });
  if (points.length > 1) {
    const [ex, ey] = points[points.length - 1];
    rc.circle(ex, ey, 11, { ...calm, seed: seed + 2, stroke: color, strokeWidth: 2.4, fill: colors.paper, fillStyle: 'solid' });
  }
}
