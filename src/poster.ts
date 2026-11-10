import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { fontFamily } from './labels';

export type PosterColors = { paper: string; ink: string };

export function formatCoordinates([lng, lat]: [number, number]): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}   ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

export function bandHeight(height: number): number {
  return Math.round(Math.min(220, Math.max(80, height * 0.15)));
}

export async function loadTitleFont(title: string, center: [number, number]): Promise<void> {
  const family = fontFamily(title, center);
  await Promise.all([
    document.fonts.load(`700 40px "${family}"`, title).catch(() => []),
    document.fonts.load(`400 20px "Gaegu"`, '0123456789.° NSEW').catch(() => []),
  ]);
}

function setTitleFont(ctx: CanvasRenderingContext2D, family: string, size: number): void {
  ctx.font = `700 ${size}px "${family}", "Gaegu", sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.08)}px`;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, start: number, maxWidth: number): number {
  let size = Math.round(start);
  setTitleFont(ctx, family, size);
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    setTitleFont(ctx, family, size);
  }
  return size;
}

export function drawPosterTitle(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  title: string,
  center: [number, number],
  size: { width: number; height: number },
  colors: PosterColors,
  wobble: Options,
): void {
  const { width, height } = size;
  const band = bandHeight(height);
  const top = height - band;
  const inset = Math.max(10, band * 0.12);

  ctx.save();
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, top - inset * 0.5, width, band + inset * 0.5);
  ctx.restore();

  rc.rectangle(inset, top, width - inset * 2, band - inset, {
    ...wobble,
    seed: 7,
    stroke: colors.ink,
    strokeWidth: 2,
    fill: colors.paper,
    fillStyle: 'solid',
  });

  const family = fontFamily(title, center);
  const name = /^[\p{Script=Latin}\s\p{P}\d]+$/u.test(title) ? title.toUpperCase() : title;
  const nameY = top + (band - inset) * 0.52;

  ctx.save();
  const nameSize = fitFont(ctx, name, family, band * 0.42, width - inset * 6);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, width / 2, nameY);
  const nameWidth = Math.min(ctx.measureText(name).width, width - inset * 6);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const lineY = nameY + nameSize * 0.22;
  rc.line(width / 2 - nameWidth / 2, lineY, width / 2 + nameWidth / 2, lineY, {
    ...wobble,
    seed: 11,
    stroke: colors.ink,
    strokeWidth: 1.5,
  });

  const coordSize = Math.max(11, Math.round(band * 0.14));
  ctx.font = `400 ${coordSize}px "Gaegu", sans-serif`;
  ctx.fillText(formatCoordinates(center), width / 2, lineY + coordSize * 1.25);
  ctx.restore();
}
