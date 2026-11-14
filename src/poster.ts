import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import { chosenFamily } from './labels';

export type PosterColors = { paper: string; ink: string };
export type TitleLayout = 'bottom' | 'top' | 'corner';
export type Rect = { x0: number; y0: number; x1: number; y1: number };
type Box = [number, number, number, number];

export const TITLE_FONTS = ['Gaegu', 'Kalam', 'Patrick Hand', 'Pangolin', 'Itim', 'Arima', 'Arimo', 'Tinos', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'Playfair Display', 'Merriweather', 'Stardos Stencil'];
export const TITLE_FONT_NOTES: Record<string, string> = {
  Gaegu: 'Soft, friendly handwriting',
  Kalam: 'Quick pen handwriting',
  'Patrick Hand': 'Neat, upright print',
  Pangolin: 'Round, playful letters',
  Itim: 'Clean, rounded letters',
  Arima: 'Classic serif, like old maps',
  Arimo: 'Plain and clear, like Arial',
  Tinos: 'Book serif, like Times New Roman',
  Montserrat: 'Modern geometric sans',
  Roboto: 'Neat, everyday sans',
  'Open Sans': 'Friendly, open sans',
  Lato: 'Warm, rounded sans',
  'Playfair Display': 'Elegant, high-contrast serif',
  Merriweather: 'Sturdy book serif',
  'Stardos Stencil': 'Army stencil lettering',
};

export const TITLE_LAYOUTS: { id: TitleLayout; label: string; note: string }[] = [
  { id: 'bottom', label: 'Bottom strip', note: 'A band under the map' },
  { id: 'top', label: 'Top strip', note: 'A band above the map' },
  { id: 'corner', label: 'Corner label', note: 'A small box in the top-left corner' },
];

export function layoutIcon(layout: TitleLayout): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 28 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('layout-icon');
  const rect = (x: number, y: number, w: number, h: number, kind: string) => {
    const r = document.createElementNS(ns, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx: 1 })) r.setAttribute(k, String(v));
    r.classList.add(kind);
    svg.append(r);
  };
  rect(0.75, 0.75, 26.5, 18.5, 'sheet');
  if (layout === 'bottom') rect(2.5, 13.5, 23, 4, 'band');
  else if (layout === 'top') rect(2.5, 2.5, 23, 4, 'band');
  else rect(2.5, 2.5, 11, 4.5, 'band');
  return svg;
}

export type PosterOptions = {
  title: string;
  layout: TitleLayout;
  font: string;
  border: boolean;
  coordsFont?: string;
};

export type PosterLayout = {
  inner: Rect;
  map: Rect;
  title: Rect | null;
  band: Rect | null;
  reserved: Box[];
};

export function formatCoordinates([lng, lat]: [number, number]): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}   ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

function bandHeight(height: number): number {
  return Math.round(Math.min(220, Math.max(Math.min(80, height * 0.28), height * 0.15)));
}

export function borderWidth(width: number, height: number): number {
  return Math.round(Math.max(14, Math.min(width, height) * 0.035));
}

export function posterLayout(width: number, height: number, border: boolean, title: PosterOptions | null): PosterLayout {
  const m = border ? borderWidth(width, height) : 0;
  const inner: Rect = { x0: m, y0: m, x1: width - m, y1: height - m };
  const reserved: Box[] = m
    ? [
        [0, 0, width, m],
        [0, height - m, width, height],
        [0, 0, m, height],
        [width - m, 0, width, height],
      ]
    : [];
  const map = { ...inner };
  if (!title) return { inner, map, title: null, band: null, reserved };

  const innerHeight = inner.y1 - inner.y0;
  const innerWidth = inner.x1 - inner.x0;
  const band = bandHeight(innerHeight);
  const inset = Math.max(10, band * 0.12);
  let box: Rect;
  let paper: Rect | null = null;

  if (title.layout === 'top') {
    box = { x0: inner.x0 + inset, y0: inner.y0 + inset, x1: inner.x1 - inset, y1: inner.y0 + band };
    paper = { x0: inner.x0, y0: inner.y0, x1: inner.x1, y1: inner.y0 + band + inset * 0.5 };
    map.y0 = inner.y0 + band;
  } else if (title.layout === 'corner') {
    const w = Math.min(innerWidth * 0.55, Math.max(220, innerWidth * 0.36));
    const h = band * 0.85;
    const x0 = inner.x0 + inset * 1.5;
    const y0 = inner.y0 + inset * 1.5;
    box = { x0, y0, x1: x0 + w, y1: y0 + h };
  } else {
    box = { x0: inner.x0 + inset, y0: inner.y1 - band, x1: inner.x1 - inset, y1: inner.y1 - inset };
    paper = { x0: inner.x0, y0: inner.y1 - band - inset * 0.5, x1: inner.x1, y1: inner.y1 };
    map.y1 = inner.y1 - band;
  }
  const keep = paper ?? box;
  reserved.push([keep.x0 - 4, keep.y0 - 4, keep.x1 + 4, keep.y1 + 4]);
  return { inner, map, title: box, band: paper, reserved };
}

function titleText(title: string): string {
  return /^[\p{Script=Latin}\s\p{P}\p{N}\p{S}]+$/u.test(title) ? title.toUpperCase() : title;
}

export async function loadTitleFont(options: PosterOptions, center: [number, number]): Promise<void> {
  const family = chosenFamily(options.title, center, options.font);
  const text = titleText(options.title);
  await Promise.all([
    document.fonts.load(`700 40px "${family}"`, text).catch(() => []),
    document.fonts.load(`400 40px "${family}"`, text).catch(() => []),
    document.fonts.load(`400 20px "${options.coordsFont ?? 'Gaegu'}"`, '0123456789.° NSEW').catch(() => []),
  ]);
}

function setTitleFont(ctx: CanvasRenderingContext2D, family: string, size: number): void {
  ctx.font = `700 ${size}px "${family}", "Gaegu", sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.08)}px`;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, start: number, maxWidth: number): number {
  let size = Math.round(start);
  setTitleFont(ctx, family, size);
  while (size > 6 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    setTitleFont(ctx, family, size);
  }
  return size;
}

export function drawBorder(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  width: number,
  height: number,
  layout: PosterLayout,
  colors: PosterColors,
  wobble: Options,
): void {
  const m = layout.inner.x0;
  if (!m) return;
  ctx.save();
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, m);
  ctx.fillRect(0, height - m, width, m);
  ctx.fillRect(0, 0, m, height);
  ctx.fillRect(width - m, 0, m, height);
  ctx.restore();
  rc.rectangle(m, m, width - m * 2, height - m * 2, { ...wobble, seed: 51, stroke: colors.ink, strokeWidth: 1.6 });
  rc.rectangle(m * 0.45, m * 0.45, width - m * 0.9, height - m * 0.9, {
    ...wobble,
    seed: 52,
    stroke: colors.ink,
    strokeWidth: 1,
  });
}

export function drawPosterTitle(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  options: PosterOptions,
  center: [number, number],
  layout: PosterLayout,
  colors: PosterColors,
  wobble: Options,
  coords = true,
): void {
  const box = layout.title;
  if (!box) return;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;

  if (layout.band) {
    const b = layout.band;
    ctx.save();
    ctx.fillStyle = colors.paper;
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.restore();
  }

  rc.rectangle(box.x0, box.y0, w, h, {
    ...wobble,
    seed: 7,
    stroke: colors.ink,
    strokeWidth: 2,
    fill: colors.paper,
    fillStyle: 'solid',
  });

  const family = chosenFamily(options.title, center, options.font);
  const name = titleText(options.title);
  const cx = (box.x0 + box.x1) / 2;
  const nameY = box.y0 + h * (coords ? 0.56 : 0.64);

  ctx.save();
  const nameSize = fitFont(ctx, name, family, h * 0.46, w * 0.86);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, cx, nameY);
  const nameWidth = Math.min(ctx.measureText(name).width, w * 0.86);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const lineY = nameY + nameSize * 0.22;
  rc.line(cx - nameWidth / 2, lineY, cx + nameWidth / 2, lineY, {
    ...wobble,
    seed: 11,
    stroke: colors.ink,
    strokeWidth: 1.5,
  });

  if (!coords) {
    ctx.restore();
    return;
  }
  const coordText = formatCoordinates(center);
  const coordFamily = options.coordsFont ?? 'Gaegu';
  let coordSize = Math.max(Math.min(11, h * 0.2), Math.round(h * 0.16));
  ctx.font = `400 ${coordSize}px "${coordFamily}", "Gaegu", sans-serif`;
  while (coordSize > 5 && ctx.measureText(coordText).width > w * 0.9) {
    coordSize -= 1;
    ctx.font = `400 ${coordSize}px "${coordFamily}", "Gaegu", sans-serif`;
  }
  ctx.fillText(coordText, cx, Math.min(lineY + coordSize * 1.25, box.y1 - 4));
  ctx.restore();
}
