import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';

type Box = [number, number, number, number];
export type Colors = { paper: string; ink: string };

const EARTH = 40075016.686;
const MARGIN = 22;

export function compassRadius(width: number, height: number): number {
  return Math.round(Math.min(38, Math.max(18, Math.min(width, height) * 0.04)));
}

function compassCenter(width: number, height: number): [number, number] {
  const r = compassRadius(width, height);
  return [width - MARGIN - r, MARGIN + r + 16];
}

function scaleLength(zoom: number, lat: number, maxPx: number): { px: number; label: string } {
  const metresPerPx = (EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const target = metresPerPx * maxPx;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [5, 2, 1].find((n) => n * power <= target) ?? 1;
  const metres = step * power;
  return { px: metres / metresPerPx, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m` };
}

export function furnitureBoxes(width: number, height: number, bottom: number): Box[] {
  const r = compassRadius(width, height);
  const [cx, cy] = compassCenter(width, height);
  return [
    [cx - r - 4, cy - r - 22, cx + r + 4, cy + r + 4],
    [MARGIN - 6, bottom - MARGIN - 34, MARGIN + width * 0.24, bottom - MARGIN + 8],
  ];
}

export function drawCompass(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  width: number,
  height: number,
  colors: Colors,
  wobble: Options,
): void {
  const r = compassRadius(width, height);
  const [x, y] = compassCenter(width, height);
  const line = { ...wobble, stroke: colors.ink, strokeWidth: 1.4 };
  rc.circle(x, y, r * 2, { ...line, seed: 21, fill: colors.paper, fillStyle: 'solid' });
  rc.circle(x, y, r * 1.55, { ...line, seed: 22, strokeWidth: 0.8 });

  for (const angle of [0, 90, 180, 270]) {
    const a = (angle * Math.PI) / 180;
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    rc.line(x + sx * r * 0.78, y + sy * r * 0.78, x + sx * r, y + sy * r, { ...line, seed: 23 + angle });
  }

  const tip = r * 0.82;
  const side = r * 0.24;
  const solid = { ...line, fill: colors.ink, fillStyle: 'solid' };
  rc.polygon([[x, y - tip], [x - side, y], [x, y]], { ...solid, seed: 31 });
  rc.polygon([[x, y - tip], [x + side, y], [x, y]], { ...line, seed: 32 });
  rc.polygon([[x, y + tip], [x + side, y], [x, y]], { ...solid, seed: 33 });
  rc.polygon([[x, y + tip], [x - side, y], [x, y]], { ...line, seed: 34 });

  ctx.save();
  ctx.font = `700 ${Math.round(r * 0.6 + 6)}px "Gaegu", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  ctx.strokeText('N', x, y - r - 1);
  ctx.fillText('N', x, y - r - 1);
  ctx.restore();
}

export function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  width: number,
  bottom: number,
  zoom: number,
  lat: number,
  colors: Colors,
  wobble: Options,
): void {
  const { px, label } = scaleLength(zoom, lat, width * 0.22);
  const x = MARGIN;
  const y = bottom - MARGIN - 8;
  const h = 7;
  const parts = 4;
  const piece = px / parts;
  const line = { ...wobble, roughness: Number(wobble.roughness ?? 1) * 0.6, stroke: colors.ink, strokeWidth: 1.2 };

  for (let i = 0; i < parts; i++) {
    rc.rectangle(x + i * piece, y, piece, h, {
      ...line,
      seed: 41 + i,
      fill: i % 2 ? colors.paper : colors.ink,
      fillStyle: 'solid',
    });
  }

  ctx.save();
  ctx.font = '400 15px "Gaegu", sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  for (const [text, at, align] of [
    ['0', x, 'center'],
    [label, x + px, 'center'],
  ] as const) {
    ctx.textAlign = align;
    ctx.strokeText(text, at, y - 3);
    ctx.fillText(text, at, y - 3);
  }
  ctx.restore();
}
