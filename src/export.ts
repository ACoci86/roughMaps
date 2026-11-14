import { drawSketch, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import type { StyleSpec } from './styles';
import { PIN_COLOR, PIN_ICONS, type Pin } from './pins';
import { TITLE_FONTS, TITLE_LAYOUTS } from './poster';
import { svgCanvas } from './svg';
import { imagePdf } from './pdf';
import { ROUTE_COLOR, type Route } from './routes';
import { TERRAIN_MODES } from './terrain';

export const CUSTOM_SIZE = 'custom';

export type OutputSize = {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: 'mm' | 'in' | 'px';
  group: string;
};

export const SIZES: OutputSize[] = [
  { id: 'a5', label: 'A5', width: 148, height: 210, unit: 'mm', group: 'Print' },
  { id: 'a4', label: 'A4', width: 210, height: 297, unit: 'mm', group: 'Print' },
  { id: 'a3', label: 'A3', width: 297, height: 420, unit: 'mm', group: 'Print' },
  { id: 'a2', label: 'A2', width: 420, height: 594, unit: 'mm', group: 'Print' },
  { id: 'postcard', label: 'Postcard', width: 105, height: 148, unit: 'mm', group: 'Print' },
  { id: 'square', label: 'Square 30 cm', width: 300, height: 300, unit: 'mm', group: 'Print' },
  { id: 'letter', label: 'US Letter', width: 8.5, height: 11, unit: 'in', group: 'Print (US)' },
  { id: 'tabloid', label: 'Tabloid', width: 11, height: 17, unit: 'in', group: 'Print (US)' },
  { id: 'postcard-us', label: 'Postcard 4 × 6', width: 4, height: 6, unit: 'in', group: 'Print (US)' },
  { id: 'frame-30x40', label: 'Frame 30 × 40 cm', width: 300, height: 400, unit: 'mm', group: 'Frames' },
  { id: 'frame-50x70', label: 'Frame 50 × 70 cm', width: 500, height: 700, unit: 'mm', group: 'Frames' },
  { id: 'frame-18x24', label: 'Frame 18 × 24 in', width: 18, height: 24, unit: 'in', group: 'Frames' },
  { id: 'frame-24x36', label: 'Frame 24 × 36 in', width: 24, height: 36, unit: 'in', group: 'Frames' },
  { id: CUSTOM_SIZE, label: 'Custom size', width: 200, height: 280, unit: 'mm', group: 'Custom' },
  { id: 'insta-post', label: 'Instagram post', width: 1080, height: 1350, unit: 'px', group: 'Social' },
  { id: 'insta-story', label: 'Instagram story', width: 1080, height: 1920, unit: 'px', group: 'Social' },
  { id: 'insta-square', label: 'Square post', width: 1080, height: 1080, unit: 'px', group: 'Social' },
  { id: 'iphone-pro-max', label: 'iPhone 16 Pro Max', width: 1320, height: 2868, unit: 'px', group: 'iPhone' },
  { id: 'iphone-pro', label: 'iPhone 16 Pro', width: 1206, height: 2622, unit: 'px', group: 'iPhone' },
  { id: 'phone', label: 'iPhone 15 Pro Max', width: 1290, height: 2796, unit: 'px', group: 'iPhone' },
  { id: 'iphone', label: 'iPhone 15 and 16', width: 1179, height: 2556, unit: 'px', group: 'iPhone' },
  { id: 'iphone-se', label: 'iPhone SE', width: 750, height: 1334, unit: 'px', group: 'iPhone' },
  { id: 'galaxy-ultra', label: 'Galaxy S24 Ultra', width: 1440, height: 3120, unit: 'px', group: 'Android' },
  { id: 'galaxy', label: 'Galaxy S24', width: 1080, height: 2340, unit: 'px', group: 'Android' },
  { id: 'pixel-xl', label: 'Pixel 9 Pro XL', width: 1344, height: 2992, unit: 'px', group: 'Android' },
  { id: 'pixel', label: 'Pixel 9', width: 1080, height: 2424, unit: 'px', group: 'Android' },
  { id: 'android', label: 'Most Android phones', width: 1080, height: 2400, unit: 'px', group: 'Android' },
  { id: 'ipad', label: 'iPad', width: 2048, height: 2732, unit: 'px', group: 'Screen' },
  { id: 'desktop-1080', label: 'Desktop 1080p', width: 1920, height: 1080, unit: 'px', group: 'Screen' },
  { id: 'desktop-1440', label: 'Desktop 1440p', width: 2560, height: 1440, unit: 'px', group: 'Screen' },
  { id: 'desktop', label: 'Desktop 4K', width: 3840, height: 2160, unit: 'px', group: 'Screen' },
];

export type Orientation = 'portrait' | 'landscape';
export type CustomSize = { width: number; height: number; unit: 'mm' | 'in' };

export const CUSTOM_LIMITS: Record<CustomSize['unit'], [number, number]> = { mm: [25, 1000], in: [1, 40] };

export function naturalOrientation(size: OutputSize): Orientation {
  return size.width > size.height ? 'landscape' : 'portrait';
}

export function oriented(size: OutputSize, orientation: Orientation): OutputSize {
  if (size.width === size.height || naturalOrientation(size) === orientation) return size;
  return { ...size, id: `${size.id}-${orientation}`, label: `${size.label} ${orientation}`, width: size.height, height: size.width };
}

export function customSize(custom: CustomSize): OutputSize {
  const [min, max] = CUSTOM_LIMITS[custom.unit];
  const fit = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const width = fit(custom.width);
  const height = fit(custom.height);
  return { id: `${CUSTOM_SIZE}-${width}x${height}${custom.unit}`, label: `${width} × ${height} ${custom.unit}`, width, height, unit: custom.unit, group: 'Custom' };
}

export const BLEED_MM = 3;

export function withBleed(size: OutputSize): OutputSize {
  if (size.unit === 'px') return size;
  const extra = size.unit === 'in' ? (BLEED_MM * 2) / 25.4 : BLEED_MM * 2;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { ...size, id: `${size.id}-bleed`, label: `${size.label} + bleed`, width: round(size.width + extra), height: round(size.height + extra) };
}

export function bleedShare(size: OutputSize): number {
  if (size.unit === 'px') return 0;
  return (size.unit === 'in' ? BLEED_MM / 25.4 : BLEED_MM) / size.width;
}

export const DPI_OPTIONS = [150, 200, 300];
export const DEFAULT_SIZE = 'desktop';
export const DEFAULT_DPI = 300;
export const PHONE_SIZE = 'a3';
export const PHONE_DPI = 200;

export function pixelSize(size: OutputSize, dpi: number): { width: number; height: number } {
  if (size.unit === 'px') return { width: size.width, height: size.height };
  const perUnit = size.unit === 'in' ? dpi : dpi / 25.4;
  return { width: Math.round(size.width * perUnit), height: Math.round(size.height * perUnit) };
}

export async function renderPng(
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings,
  output: { width: number; height: number },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await drawSketch(canvas, scene, style, settings, output);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png'),
  );
}

export async function renderSvg(
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings,
  size: OutputSize,
  compressed = false,
  laser = false,
): Promise<Blob> {
  const target = svgCanvas(laser ? { paper: style.paper, trim: scene.trim ?? 0 } : null);
  await drawSketch(target.canvas, scene, style, settings, { width: scene.width, height: scene.height });
  const unit = size.unit === 'px' ? '' : size.unit;
  const svg = await target.toSvg({ width: `${size.width}${unit}`, height: `${size.height}${unit}` });
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  if (!compressed) return blob;
  const packed = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return new Blob([packed], { type: 'image/svg+xml' });
}

export async function renderPdf(
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings,
  size: OutputSize,
  output: { width: number; height: number },
  title: string,
  bleed = 0,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await drawSketch(canvas, scene, style, settings, output);
  const toPoints = size.unit === 'mm' ? 72 / 25.4 : size.unit === 'in' ? 72 : 0.75;
  const width = size.width * toPoints;
  return imagePdf(canvas, { width, height: size.height * toPoints }, title, bleed * width);
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'map'
  );
}

export type Config = {
  app: 'roughMaps';
  version: 1;
  place: string;
  title: string;
  pins: Pin[];
  routes: Route[];
  highlights: { lngLat: [number, number]; color: string }[];
  center: [number, number];
  zoom: number;
  bearing: number;
  style: string;
  tint?: string;
  settings: SketchSettings;
  size: string;
  dpi: number;
  orientation?: Orientation;
  custom?: CustomSize;
  bleed?: boolean;
  country?: string;
};

const FILL_STYLES = ['default', 'hachure', 'solid', 'cross-hatch', 'dashed', 'zigzag', 'zigzag-line', 'dots'];

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return isNumber(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function validColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function parseRoutes(value: unknown): Route[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((route): Route[] => {
    if (!Array.isArray(route?.points)) return [];
    const points = route.points.filter(
      (p: unknown): p is [number, number] =>
        Array.isArray(p) && isNumber(p[0]) && isNumber(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85,
    );
    if (points.length < 2) return [];
    const kept = points.slice(0, 500).map(([lng, lat]: [number, number]): [number, number] => [lng, lat]);
    const ele =
      Array.isArray(route.ele) && route.ele.length === route.points.length && route.ele.every(isNumber) && points.length === route.points.length
        ? { ele: route.ele.slice(0, 500).map((v: number) => Math.round(v)) }
        : {};
    return [{ points: kept, color: validColor(route.color, ROUTE_COLOR), ...ele }];
  });
}

function parseHighlights(value: unknown): { lngLat: [number, number]; color: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((h) => {
    const [lng, lat] = Array.isArray(h?.lngLat) ? h.lngLat : [];
    if (!isNumber(lng) || !isNumber(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return [];
    return [{ lngLat: [lng, lat] as [number, number], color: validColor(h.color, HIGHLIGHT_COLOR) }];
  });
}

export const HIGHLIGHT_COLOR = '#f2b134';

function parsePins(value: unknown): Pin[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((pin): Pin[] => {
    const [lng, lat] = Array.isArray(pin?.lngLat) ? pin.lngLat : [];
    if (!isNumber(lng) || !isNumber(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return [];
    const color = validColor(pin.color, PIN_COLOR);
    const icon = PIN_ICONS.find((i) => i.id === pin.icon)?.id ?? 'pin';
    return [{ lngLat: [lng, lat], note: typeof pin.note === 'string' ? pin.note.slice(0, 40) : '', color, icon }];
  });
}

export function parseConfig(text: string): Config {
  let data: Partial<Config> | null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a config file');
  }
  if (data?.app !== 'roughMaps' || data.version !== 1) throw new Error('This is not a roughMaps config file');
  const [lng, lat] = Array.isArray(data.center) ? data.center : [];
  if (!isNumber(lng) || !isNumber(lat) || !isNumber(data.zoom) || Math.abs(lng) > 180 || Math.abs(lat) > 85) {
    throw new Error('This config file is incomplete');
  }
  const s: Partial<SketchSettings> = data.settings ?? {};
  return {
    app: 'roughMaps',
    version: 1,
    place: typeof data.place === 'string' ? data.place : '',
    title: typeof data.title === 'string' ? data.title.slice(0, 80) : typeof data.place === 'string' ? data.place : '',
    pins: parsePins(data.pins),
    routes: parseRoutes(data.routes),
    highlights: parseHighlights(data.highlights),
    center: [lng, lat],
    zoom: data.zoom,
    bearing: isNumber(data.bearing) ? Math.max(-180, Math.min(180, data.bearing)) : 0,
    style: String(data.style ?? ''),
    ...(typeof data.tint === 'string' && /^#[0-9a-f]{6}$/i.test(data.tint) ? { tint: data.tint } : {}),
    settings: {
      roughness: clamp(s.roughness, 0, 5, DEFAULT_SETTINGS.roughness),
      strokeWidth: clamp(s.strokeWidth, 0, 5, DEFAULT_SETTINGS.strokeWidth),
      innerStrokeWidth: clamp(s.innerStrokeWidth, 0, 3, DEFAULT_SETTINGS.innerStrokeWidth),
      fillWeight: clamp(s.fillWeight, 0, 3, DEFAULT_SETTINGS.fillWeight),
      fillStyle: FILL_STYLES.includes(String(s.fillStyle)) ? String(s.fillStyle) : 'default',
      labels: s.labels !== false,
      doodles: s.doodles !== false,
      poster: s.poster !== false,
      compass: s.compass !== false,
      coords: s.coords !== false,
      border: s.border === true,
      labelScale: clamp(s.labelScale, 0.5, 2, DEFAULT_SETTINGS.labelScale),
      labelFont: TITLE_FONTS.includes(String(s.labelFont)) ? String(s.labelFont) : DEFAULT_SETTINGS.labelFont,
      inked: s.inked !== false,
      wobblyLabels: typeof s.wobblyLabels === 'boolean' ? s.wobblyLabels : s.inked !== false,
      titleFont: TITLE_FONTS.includes(String(s.titleFont)) ? String(s.titleFont) : DEFAULT_SETTINGS.titleFont,
      coordsFont: TITLE_FONTS.includes(String(s.coordsFont)) ? String(s.coordsFont) : DEFAULT_SETTINGS.coordsFont,
      titleLayout: TITLE_LAYOUTS.find((l) => l.id === s.titleLayout)?.id ?? DEFAULT_SETTINGS.titleLayout,
      terrain: TERRAIN_MODES.find((m) => m.id === s.terrain)?.id ?? DEFAULT_SETTINGS.terrain,
      profile: s.profile !== false,
    },
    size: String(data.size ?? ''),
    dpi: Number(data.dpi),
    ...(data.orientation === 'landscape' || data.orientation === 'portrait' ? { orientation: data.orientation } : {}),
    ...(data.bleed === true ? { bleed: true } : {}),
    ...(data.custom && isNumber(data.custom.width) && isNumber(data.custom.height) && (data.custom.unit === 'mm' || data.custom.unit === 'in')
      ? { custom: { width: data.custom.width, height: data.custom.height, unit: data.custom.unit } }
      : {}),
    ...(typeof data.country === 'string' ? { country: data.country.slice(0, 80) } : {}),
  };
}
