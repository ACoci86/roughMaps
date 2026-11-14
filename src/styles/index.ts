import type { TerrainMode } from '../terrain';

export type Pattern = 'hatch' | 'cross' | 'lines' | 'dots' | 'waves' | 'scribble' | 'stitch';

export type AreaPaint = {
  color: string;
  pattern?: Pattern;
  patternColor?: string;
  gap?: number;
  weight?: number;
};

export type RoadPaint = {
  fill: string;
  edge: string;
  edgeRatio: number;
  path: string;
  colors?: Record<string, string>;
  dash?: number[];
  scale?: number;
  trail?: number;
};

export type StyleSpec = {
  id: string;
  name: string;
  note: string;
  order: number;
  paper: string;
  ink: string;
  text?: string;
  outline: number;
  buildings: string[];
  buildingPattern?: AreaPaint;
  water: AreaPaint;
  park: AreaPaint;
  wood: AreaPaint;
  sand: AreaPaint;
  road: RoadPaint;
  rail: string;
  flat?: boolean;
  grid?: string;
  tint?: string;
  relief?: string;
  terrain?: TerrainMode;
  kmGrid?: string;
  titleFont?: string;
  ice?: AreaPaint;
  rock?: AreaPaint;
  lift?: string;
  bands?: { at: number; color: string }[];
  trees?: 'all' | 'forest' | 'none';
};

const files = import.meta.glob('./roughmaps/*.json', { eager: true, import: 'default' });


function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

const tintedCache = new Map<string, StyleSpec>();

export function tinted(style: StyleSpec, colour: string): StyleSpec {
  const tint = /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : style.tint;
  if (!tint) return style;
  const key = `${style.id}|${tint}`;
  const cached = tintedCache.get(key);
  if (cached) return cached;
  const paper = mix('#ffffff', tint, 0.05);
  const ink = mix(tint, '#000000', 0.5);
  const made: StyleSpec = {
    ...style,
    tint,
    paper,
    ink,
    buildings: [mix(paper, tint, 0.3), mix(paper, tint, 0.45)],
    water: { color: mix(paper, tint, 0.1), pattern: 'waves', patternColor: mix(tint, '#000000', 0.15), gap: 6, weight: 0.8 },
    park: { color: paper, pattern: 'hatch', patternColor: tint, gap: 5, weight: 0.8 },
    wood: { color: mix(paper, tint, 0.12), pattern: 'cross', patternColor: tint, gap: 6, weight: 0.7 },
    sand: { color: mix(paper, tint, 0.08) },
    road: { fill: '#ffffff', edge: ink, edgeRatio: 0.12, path: tint },
    rail: ink,
  };
  tintedCache.set(key, made);
  return made;
}

export const STYLES: StyleSpec[] = (Object.values(files) as StyleSpec[])
  .sort((a, b) => a.order - b.order)
  .map((style) => (style.tint ? tinted(style, style.tint) : style));
