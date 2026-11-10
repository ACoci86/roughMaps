import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { fontFamily } from './labels';
import type { Point } from './sketch';

export type Pin = { lngLat: [number, number]; note: string };
export type PlacedPin = { point: Point; note: string };

type Box = [number, number, number, number];
type Colors = { paper: string; ink: string };

const HEAD = 9;
const RISE = 24;
const NOTE_SIZE = 18;
const GAP = 6;

function font(note: string, center: [number, number]): string {
  return `700 ${NOTE_SIZE}px "${fontFamily(note, center)}", "Gaegu", sans-serif`;
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
  const right = x + HEAD + GAP + w < width - 8;
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
    const boxes: Box[] = [[x - HEAD - 2, y - RISE - HEAD - 2, x + HEAD + 2, y + 2]];
    if (pin.note) {
      const { w, right } = noteSide(ctx, pin, center, width);
      const cy = y - RISE;
      const x0 = right ? x + HEAD + GAP : x - HEAD - GAP - w;
      boxes.push([x0 - 2, cy - NOTE_SIZE * 0.6, x0 + w + 2, cy + NOTE_SIZE * 0.6]);
    }
    return boxes;
  });
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
  const [x, y] = pin.point;
  const top = y - RISE;
  const shape =
    `M${x} ${y} C${x - 3} ${y - 8} ${x - HEAD} ${top + HEAD * 0.9} ${x - HEAD} ${top} ` +
    `A${HEAD} ${HEAD} 0 1 1 ${x + HEAD} ${top} C${x + HEAD} ${top + HEAD * 0.9} ${x + 3} ${y - 8} ${x} ${y} Z`;
  const seed = 101 + index * 3;
  rc.ellipse(x, y, 10, 3, { ...wobble, seed, stroke: colors.ink, strokeWidth: 1 });
  rc.path(shape, { ...wobble, seed: seed + 1, stroke: colors.ink, strokeWidth: 1.5, fill: colors.ink, fillStyle: 'solid' });
  rc.circle(x, top, HEAD * 0.8, { ...wobble, seed: seed + 2, stroke: colors.ink, strokeWidth: 1, fill: colors.paper, fillStyle: 'solid' });

  if (!pin.note) return;
  const { right } = noteSide(ctx, pin, center, width);
  ctx.save();
  ctx.font = font(pin.note, center);
  ctx.textAlign = right ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  const tx = right ? x + HEAD + GAP : x - HEAD - GAP;
  ctx.strokeText(pin.note, tx, top);
  ctx.fillText(pin.note, tx, top);
  ctx.restore();
}
