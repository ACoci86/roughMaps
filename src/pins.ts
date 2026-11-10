import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { fontFamily } from './labels';
import type { Point } from './sketch';

export type PinIcon = 'pin' | 'heart' | 'star' | 'house' | 'cross';
export type Pin = { lngLat: [number, number]; note: string; color: string; icon: PinIcon };
export type PlacedPin = { point: Point; note: string; color: string; icon: PinIcon };

export const PIN_COLOR = '#e4572e';
export const PIN_ICONS: { id: PinIcon; label: string }[] = [
  { id: 'pin', label: 'Pin' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'house', label: 'House' },
  { id: 'cross', label: 'Cross' },
];

type Box = [number, number, number, number];
type Colors = { paper: string; ink: string };

const HEAD = 9;
const RISE = 24;
const SIZE = 11;
const NOTE_SIZE = 18;
const GAP = 6;

function font(note: string, center: [number, number]): string {
  return `700 ${NOTE_SIZE}px "${fontFamily(note, center)}", "Gaegu", sans-serif`;
}

function middle(pin: PlacedPin): number {
  const y = pin.point[1];
  if (pin.icon === 'pin') return y - RISE;
  if (pin.icon === 'cross') return y;
  return y - SIZE;
}

export async function loadPinFonts(pins: PlacedPin[], center: [number, number]): Promise<void> {
  await Promise.all(
    pins
      .filter((p) => p.note)
      .map((p) => document.fonts.load(font(p.note, center), p.note).catch(() => [])),
  );
}

function noteSide(ctx: CanvasRenderingContext2D, pin: PlacedPin, center: [number, number], width: number) {
  ctx.font = font(pin.note, center);
  const w = ctx.measureText(pin.note).width;
  const [x] = pin.point;
  const right = x + SIZE + GAP + w < width - 8;
  return { w, right };
}

export function pinBoxes(
  ctx: CanvasRenderingContext2D,
  pins: PlacedPin[],
  center: [number, number],
  width: number,
): Box[] {
  return pins.flatMap((pin) => {
    const [x, y] = pin.point;
    const cy = middle(pin);
    const boxes: Box[] = [[x - SIZE - 3, cy - SIZE - 3, x + SIZE + 3, Math.max(y, cy + SIZE) + 3]];
    if (pin.note) {
      const { w, right } = noteSide(ctx, pin, center, width);
      const x0 = right ? x + SIZE + GAP : x - SIZE - GAP - w;
      boxes.push([x0 - 2, cy - NOTE_SIZE * 0.6, x0 + w + 2, cy + NOTE_SIZE * 0.6]);
    }
    return boxes;
  });
}

function star(x: number, c: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? SIZE * 0.5 : SIZE * 1.15;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    return [x + Math.cos(a) * r, c + 1 + Math.sin(a) * r];
  });
}

function drawIcon(rc: RoughCanvas, pin: PlacedPin, seed: number, colors: Colors, wobble: Options): void {
  const [x, y] = pin.point;
  const c = middle(pin);
  const s = SIZE;
  const fill = pin.color || colors.ink;
  const look = { ...wobble, stroke: colors.ink, strokeWidth: 1.5, fill, fillStyle: 'solid' };

  if (pin.icon === 'cross') {
    for (const [dx, k] of [[1, 0], [-1, 1]] as const) {
      const line = [x - s * 0.8 * dx, c - s * 0.8, x + s * 0.8 * dx, c + s * 0.8] as const;
      rc.line(...line, { ...wobble, seed: seed + k, stroke: colors.ink, strokeWidth: 7, disableMultiStroke: true });
      rc.line(...line, { ...wobble, seed: seed + k, stroke: fill, strokeWidth: 4, disableMultiStroke: true });
    }
    return;
  }

  if (pin.icon !== 'heart') rc.ellipse(x, y, 12, 3.5, { ...wobble, seed, stroke: colors.ink, strokeWidth: 1 });

  if (pin.icon === 'pin') {
    const shape =
      `M${x} ${y} C${x - 3} ${y - 8} ${x - HEAD} ${c + HEAD * 0.9} ${x - HEAD} ${c} ` +
      `A${HEAD} ${HEAD} 0 1 1 ${x + HEAD} ${c} C${x + HEAD} ${c + HEAD * 0.9} ${x + 3} ${y - 8} ${x} ${y} Z`;
    rc.path(shape, { ...look, seed: seed + 1 });
    rc.circle(x, c, HEAD * 0.8, { ...look, seed: seed + 2, strokeWidth: 1, fill: colors.paper });
  } else if (pin.icon === 'heart') {
    const shape =
      `M${x} ${c + s} C${x - s * 1.5} ${c + s * 0.05} ${x - s * 1.15} ${c - s * 1.15} ${x} ${c - s * 0.4} ` +
      `C${x + s * 1.15} ${c - s * 1.15} ${x + s * 1.5} ${c + s * 0.05} ${x} ${c + s} Z`;
    rc.path(shape, { ...look, seed: seed + 1 });
  } else if (pin.icon === 'star') {
    rc.polygon(star(x, c), { ...look, seed: seed + 1 });
  } else {
    rc.polygon(
      [
        [x - s * 0.85, c + s],
        [x - s * 0.85, c - s * 0.05],
        [x - s * 1.1, c - s * 0.05],
        [x, c - s],
        [x + s * 1.1, c - s * 0.05],
        [x + s * 0.85, c - s * 0.05],
        [x + s * 0.85, c + s],
      ],
      { ...look, seed: seed + 1 },
    );
    rc.rectangle(x - s * 0.25, c + s * 0.3, s * 0.5, s * 0.7, { ...look, seed: seed + 2, strokeWidth: 1, fill: colors.paper });
  }
}

export function drawPin(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  pin: PlacedPin,
  index: number,
  center: [number, number],
  width: number,
  colors: Colors,
  wobble: Options,
): void {
  drawIcon(rc, pin, 101 + index * 3, colors, wobble);
  if (!pin.note) return;
  const [x] = pin.point;
  const { right } = noteSide(ctx, pin, center, width);
  ctx.save();
  ctx.font = font(pin.note, center);
  ctx.textAlign = right ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  const tx = right ? x + SIZE + GAP : x - SIZE - GAP;
  const ty = middle(pin);
  ctx.strokeText(pin.note, tx, ty);
  ctx.fillText(pin.note, tx, ty);
  ctx.restore();
}

export function pinAt(pins: PlacedPin[], [px, py]: Point): number {
  for (let i = pins.length - 1; i >= 0; i--) {
    const [x, y] = pins[i].point;
    const cy = middle(pins[i]);
    if (Math.abs(px - x) <= SIZE + 4 && py >= cy - SIZE - 4 && py <= Math.max(y, cy + SIZE) + 4) return i;
  }
  return -1;
}
