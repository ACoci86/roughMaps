import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { chosenFamily, textFont } from './labels';
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

function font(note: string, center: [number, number], chosen: string, k: number): string {
  return textFont(NOTE_SIZE * k, true, chosenFamily(note, center, chosen));
}

function middle(pin: PlacedPin, k: number): number {
  const y = pin.point[1];
  if (pin.icon === 'pin') return y - RISE * k;
  if (pin.icon === 'cross') return y;
  return y - SIZE * k;
}

export async function loadPinFonts(pins: PlacedPin[], center: [number, number], chosen: string, k: number): Promise<void> {
  await Promise.all(
    pins
      .filter((p) => p.note)
      .map((p) => document.fonts.load(font(p.note, center, chosen, k), p.note).catch(() => [])),
  );
}

function noteSide(ctx: CanvasRenderingContext2D, pin: PlacedPin, center: [number, number], width: number, chosen: string, k: number) {
  ctx.font = font(pin.note, center, chosen, k);
  const w = ctx.measureText(pin.note).width;
  const [x] = pin.point;
  const right = x + (SIZE + GAP) * k + w < width - 8;
  return { w, right };
}

export function pinBoxes(
  ctx: CanvasRenderingContext2D,
  pins: PlacedPin[],
  center: [number, number],
  width: number,
  chosen: string,
  k: number,
): Box[] {
  return pins.flatMap((pin) => {
    const [x, y] = pin.point;
    const cy = middle(pin, k);
    const s = SIZE * k;
    const boxes: Box[] = [[x - s - 3, cy - s - 3, x + s + 3, Math.max(y, cy + s) + 3]];
    if (pin.note) {
      const { w, right } = noteSide(ctx, pin, center, width, chosen, k);
      const x0 = right ? x + s + GAP * k : x - s - GAP * k - w;
      boxes.push([x0 - 2, cy - NOTE_SIZE * k * 0.6, x0 + w + 2, cy + NOTE_SIZE * k * 0.6]);
    }
    return boxes;
  });
}

function star(x: number, c: number, s: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? s * 0.5 : s * 1.15;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    return [x + Math.cos(a) * r, c + (s / SIZE) + Math.sin(a) * r];
  });
}

function drawIcon(rc: RoughCanvas, pin: PlacedPin, seed: number, colors: Colors, wobble: Options, k = 1): void {
  const [x, y] = pin.point;
  const c = middle(pin, k);
  const s = SIZE * k;
  const head = HEAD * k;
  const fill = pin.color || colors.ink;
  const look = { ...wobble, stroke: colors.ink, strokeWidth: 1.5 * k, fill, fillStyle: 'solid' };

  if (pin.icon === 'cross') {
    for (const [dx, k] of [[1, 0], [-1, 1]] as const) {
      const line = [x - s * 0.8 * dx, c - s * 0.8, x + s * 0.8 * dx, c + s * 0.8] as const;
      rc.line(...line, { ...wobble, seed: seed + k, stroke: colors.ink, strokeWidth: 7 * k, disableMultiStroke: true });
      rc.line(...line, { ...wobble, seed: seed + k, stroke: fill, strokeWidth: 4 * k, disableMultiStroke: true });
    }
    return;
  }

  if (pin.icon !== 'heart') rc.ellipse(x, y, 12 * k, 3.5 * k, { ...wobble, seed, stroke: colors.ink, strokeWidth: k });

  if (pin.icon === 'pin') {
    const shape =
      `M${x} ${y} C${x - 3 * k} ${y - 8 * k} ${x - head} ${c + head * 0.9} ${x - head} ${c} ` +
      `A${head} ${head} 0 1 1 ${x + head} ${c} C${x + head} ${c + head * 0.9} ${x + 3 * k} ${y - 8 * k} ${x} ${y} Z`;
    rc.path(shape, { ...look, seed: seed + 1 });
    rc.circle(x, c, head * 0.8, { ...look, seed: seed + 2, strokeWidth: k, fill: colors.paper });
  } else if (pin.icon === 'heart') {
    const shape =
      `M${x} ${c + s} C${x - s * 1.5} ${c + s * 0.05} ${x - s * 1.15} ${c - s * 1.15} ${x} ${c - s * 0.4} ` +
      `C${x + s * 1.15} ${c - s * 1.15} ${x + s * 1.5} ${c + s * 0.05} ${x} ${c + s} Z`;
    rc.path(shape, { ...look, seed: seed + 1 });
  } else if (pin.icon === 'star') {
    rc.polygon(star(x, c, s), { ...look, seed: seed + 1 });
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
    rc.rectangle(x - s * 0.25, c + s * 0.3, s * 0.5, s * 0.7, { ...look, seed: seed + 2, strokeWidth: k, fill: colors.paper });
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
  chosen: string,
  k: number,
): void {
  drawIcon(rc, pin, 101 + index * 3, colors, wobble, k);
  if (!pin.note) return;
  const [x] = pin.point;
  const { right } = noteSide(ctx, pin, center, width, chosen, k);
  ctx.save();
  ctx.font = font(pin.note, center, chosen, k);
  ctx.textAlign = right ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  const tx = right ? x + (SIZE + GAP) * k : x - (SIZE + GAP) * k;
  const ty = middle(pin, k);
  ctx.strokeText(pin.note, tx, ty);
  ctx.fillText(pin.note, tx, ty);
  ctx.restore();
}

export function pinAt(pins: PlacedPin[], [px, py]: Point, k: number): number {
  const s = SIZE * k;
  for (let i = pins.length - 1; i >= 0; i--) {
    const [x, y] = pins[i].point;
    const cy = middle(pins[i], k);
    if (Math.abs(px - x) <= s + 4 && py >= cy - s - 4 && py <= Math.max(y, cy + s) + 4) return i;
  }
  return -1;
}

const ICON_VIEW: Record<PinIcon, string> = {
  pin: '-13 -35 26 39',
  heart: '-16 -24 32 32',
  star: '-15 -26 30 30',
  house: '-15 -24 30 30',
  cross: '-13 -13 26 26',
};

export function pinIconSvg(icon: PinIcon, color: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', ICON_VIEW[icon]);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pin-icon');
  const draw = rough.svg(svg);
  const keep = (node: SVGGElement) => {
    svg.append(node);
  };
  const rc = {
    line: (...a: Parameters<typeof draw.line>) => keep(draw.line(...a)),
    ellipse: (...a: Parameters<typeof draw.ellipse>) => keep(draw.ellipse(...a)),
    circle: (...a: Parameters<typeof draw.circle>) => keep(draw.circle(...a)),
    path: (...a: Parameters<typeof draw.path>) => keep(draw.path(...a)),
    polygon: (...a: Parameters<typeof draw.polygon>) => keep(draw.polygon(...a)),
    rectangle: (...a: Parameters<typeof draw.rectangle>) => keep(draw.rectangle(...a)),
  } as unknown as RoughCanvas;
  drawIcon(rc, { point: [0, 0], note: '', color, icon }, 7, { paper: '#ffffff', ink: '#1c1b19' }, { roughness: 0.9, bowing: 0.8 });
  return svg;
}
