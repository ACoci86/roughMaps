import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { AreaPaint, StyleSpec } from './styles';
import { patternFill } from './sketch';

const W = 80;
const H = 60;
const generator = rough.generator();
const cache = new Map<string, string>();

const RIVER = 'M-2 40 C12 42 22 34 38 32 C52 30 62 24 82 26 L82 36 C64 34 54 40 40 42 C26 44 14 52 -2 50 Z';
const PARK = 'M54 6 C60 1 74 3 78 10 C81 18 74 25 64 24 C55 23 50 13 54 6 Z';
const ROAD = 'M32 -2 C36 14 42 24 47 36 C51 46 55 54 60 62';
const STREET = 'M-2 22 C10 20 22 24 40 21';
const PATH = 'M52 23 C56 30 58 36 70 40';
const BUILDINGS: [number, number, number, number][] = [
  [6, 8, 10, 9],
  [19, 6, 8, 11],
  [8, 27, 12, 9],
  [23, 28, 7, 7],
  [63, 43, 13, 10],
  [66, 2, 8, 3],
  [40, 46, 6, 7],
  [10, 52, 12, 6],
];

function toSvg(drawable: Drawable, dash = ''): string {
  const extra = dash ? ` stroke-dasharray="${dash}"` : '';
  return generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}"${extra} stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
}

export function styleSwatch(style: StyleSpec): string {
  const key = `${style.id}|${style.tint ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const ink = style.ink;
  const wobble: Options = { roughness: 0.9, bowing: 0.8 };
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${style.paper}"/>`];
  const outline = style.outline > 0;

  const area = (d: string, paint: AreaPaint, seed: number, pattern = true) => {
    parts.push(
      toSvg(
        generator.path(d, {
          ...wobble,
          seed,
          stroke: outline ? ink : 'none',
          strokeWidth: 0.9,
          fill: paint.color,
          fillStyle: 'solid',
          disableMultiStroke: true,
        }),
      ),
    );
    if (!pattern || !paint.pattern || !paint.patternColor) return;
    const fill = patternFill(paint, null, 1);
    parts.push(
      toSvg(
        generator.path(d, {
          ...wobble,
          ...fill,
          hachureGap: (fill.hachureGap ?? 5) * 0.55,
          fillWeight: (fill.fillWeight ?? 0.8) * 0.7,
          seed: seed + 1,
          stroke: 'none',
          fill: paint.patternColor,
        }),
      ),
    );
  };

  area(RIVER, style.water, 3);
  area(PARK, style.park, 5);

  BUILDINGS.forEach(([x, y, w, h], i) => {
    const color = style.buildings[i % style.buildings.length];
    const paint: AreaPaint = { ...style.buildingPattern, color };
    area(`M${x} ${y} h${w} v${h} h${-w} Z`, paint, 20 + i * 3, true);
  });

  const line = (d: string, stroke: string, strokeWidth: number, seed: number, dash = '') =>
    parts.push(
      toSvg(
        generator.path(d, {
          ...wobble,
          seed,
          stroke,
          strokeWidth,
          disableMultiStroke: true,
          preserveVertices: true,
        }),
        dash,
      ),
    );

  const road = style.road;
  if (road.edgeRatio > 0) {
    line(STREET, road.edge, 2.6 * (1 + 2 * road.edgeRatio), 41);
    line(ROAD, road.edge, 4.6 * (1 + 2 * road.edgeRatio), 43);
  }
  const thin = road.scale ?? 1;
  const dash = road.dash ? road.dash.map((n) => n * 0.5).join(' ') : '';
  line(STREET, road.colors?.secondary ?? road.fill, 2.6 * thin, 45, dash);
  line(ROAD, road.colors?.primary ?? road.fill, 4.6 * thin, 47, dash);
  line(PATH, road.path, 0.9, 49, '2.4 1.8');

  parts.push(
    toSvg(
      generator.rectangle(1.2, 1.2, W - 2.4, H - 2.4, {
        ...wobble,
        seed: 1,
        stroke: style.text ?? ink,
        strokeWidth: 1.3,
        disableMultiStroke: true,
      }),
    ),
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`;
  cache.set(key, svg);
  return svg;
}
