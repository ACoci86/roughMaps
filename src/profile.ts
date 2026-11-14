import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import type { Rect } from './poster';
import { formatHeight } from './labels';

export type Profile = { at: number[]; ele: number[]; color: string };
type Box = [number, number, number, number];
type Colors = { paper: string; ink: string };

const EARTH_RADIUS = 6371008.8;
const MAX_SAMPLES = 600;
const CLIMB_STEP = 8;

function metres([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distances(points: [number, number][]): number[] {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + metres(points[i - 1], points[i]));
  return at;
}

export function densify(points: [number, number][]): [number, number][] {
  const at = distances(points);
  const total = at[at.length - 1];
  if (!total) return points;
  const step = Math.max(100, total / MAX_SAMPLES);
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const span = at[i] - at[i - 1];
    const pieces = Math.max(1, Math.ceil(span / step));
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    for (let k = 1; k <= pieces; k++) out.push([ax + ((bx - ax) * k) / pieces, ay + ((by - ay) * k) / pieces]);
  }
  return out;
}

function climb(ele: number[]): number {
  let gain = 0;
  let base = ele[0];
  for (const v of ele) {
    if (v - base > CLIMB_STEP) {
      gain += v - base;
      base = v;
    } else if (base - v > CLIMB_STEP) {
      base = v;
    }
  }
  return Math.round(gain);
}

function distanceText(m: number): string {
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`;
}

export function profileBox(area: Rect, compass: boolean): Box {
  const width = Math.min(340, Math.max(170, (area.x1 - area.x0) * 0.3));
  const height = Math.min(110, Math.max(66, width * 0.34));
  const x0 = area.x0 + 14;
  const y1 = area.y1 - (compass ? 56 : 14);
  return [x0, y1 - height, x0 + width, y1];
}

export function drawProfile(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  profile: Profile,
  [x0, y0, x1, y1]: Box,
  colors: Colors,
  wobble: Options,
  family: string,
): void {
  const { at, ele, color } = profile;
  const total = at[at.length - 1];
  if (!total || ele.length < 2) return;
  rc.rectangle(x0, y0, x1 - x0, y1 - y0, { ...wobble, seed: 61, stroke: colors.ink, strokeWidth: 1.2, fill: colors.paper, fillStyle: 'solid' });

  const pad = 8;
  const top = Math.max(...ele);
  const low = Math.min(...ele);
  const note = `${distanceText(total)}  ·  +${formatHeight(climb(ele))}  ·  top ${formatHeight(top)}`;
  ctx.save();
  let size = 11;
  ctx.font = `${size}px "${family}", "Gaegu", sans-serif`;
  const room = x1 - x0 - pad * 2;
  const wide = ctx.measureText(note).width;
  if (wide > room) {
    size = Math.max(8, (size * room) / wide);
    ctx.font = `${size}px "${family}", "Gaegu", sans-serif`;
  }
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(note, x0 + pad, y0 + pad + size * 0.5);
  ctx.restore();

  const cx0 = x0 + pad;
  const cx1 = x1 - pad;
  const cy0 = y0 + pad + size + 8;
  const cy1 = y1 - pad;
  const span = Math.max(top - low, 40);
  const floor = low - span * 0.12;
  const ceiling = top + span * 0.06;
  const stride = Math.max(1, Math.ceil(ele.length / 140));
  const points: [number, number][] = [];
  let peak: [number, number] = [cx0, cy1];
  for (let i = 0; i < ele.length; i += stride) {
    const x = cx0 + ((cx1 - cx0) * at[i]) / total;
    const y = cy1 - ((cy1 - cy0) * (ele[i] - floor)) / (ceiling - floor);
    points.push([x, y]);
  }
  const last = ele.length - 1;
  if ((last % stride) !== 0) points.push([cx1, cy1 - ((cy1 - cy0) * (ele[last] - floor)) / (ceiling - floor)]);
  const highest = ele.indexOf(top);
  peak = [cx0 + ((cx1 - cx0) * at[highest]) / total, cy1 - ((cy1 - cy0) * (top - floor)) / (ceiling - floor)];

  rc.polygon([...points, [cx1, cy1], [cx0, cy1]], {
    ...wobble,
    seed: 62,
    stroke: 'none',
    fill: color,
    fillStyle: 'hachure',
    hachureGap: 3,
    fillWeight: 0.7,
    hachureAngle: -41,
  });
  rc.linearPath(points, { ...wobble, seed: 63, stroke: color, strokeWidth: 1.8 });
  rc.line(cx0, cy1, cx1, cy1, { ...wobble, seed: 64, stroke: colors.ink, strokeWidth: 1 });
  const [px, py] = peak;
  rc.polygon(
    [
      [px, py - 9],
      [px + 4.5, py - 2],
      [px - 4.5, py - 2],
    ],
    { ...wobble, seed: 65, stroke: colors.ink, strokeWidth: 1, fill: colors.ink, fillStyle: 'solid' },
  );
}
