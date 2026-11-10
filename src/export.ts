import { drawSketch, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import type { StyleSpec } from './styles';
import { PIN_COLOR, PIN_ICONS, type Pin } from './pins';
import { TITLE_FONTS, TITLE_LAYOUTS } from './poster';
import { svgCanvas } from './svg';
import { imagePdf } from './pdf';
import { ROUTE_COLOR, type Route } from './routes';

export type OutputSize = {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: 'mm' | 'px';
};

export const SIZES: OutputSize[] = [
  { id: 'a4', label: 'A4 portrait', width: 210, height: 297, unit: 'mm' },
  { id: 'a3', label: 'A3 portrait', width: 297, height: 420, unit: 'mm' },
  { id: 'square', label: 'Square 30 cm', width: 300, height: 300, unit: 'mm' },
  { id: 'phone', label: 'Phone wallpaper', width: 1290, height: 2796, unit: 'px' },
  { id: 'desktop', label: 'Desktop 4K', width: 3840, height: 2160, unit: 'px' },
];

export const DPI_OPTIONS = [150, 200, 300];
export const DEFAULT_SIZE = 'desktop';
export const DEFAULT_DPI = 300;

export function pixelSize(size: OutputSize, dpi: number): { width: number; height: number } {
  if (size.unit === 'px') return { width: size.width, height: size.height };
  const perMm = dpi / 25.4;
  return { width: Math.round(size.width * perMm), height: Math.round(size.height * perMm) };
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
): Promise<Blob> {
  const target = svgCanvas();
  await drawSketch(target.canvas, scene, style, settings, { width: scene.width, height: scene.height });
  const unit = size.unit === 'mm' ? 'mm' : '';
  const svg = await target.toSvg({ width: `${size.width}${unit}`, height: `${size.height}${unit}` });
  return new Blob([svg], { type: 'image/svg+xml' });
}

export async function renderPdf(
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings,
  size: OutputSize,
  output: { width: number; height: number },
  title: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await drawSketch(canvas, scene, style, settings, output);
  const toPoints = size.unit === 'mm' ? 72 / 25.4 : 0.75;
  return imagePdf(canvas, { width: size.width * toPoints, height: size.height * toPoints }, title);
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
  center: [number, number];
  zoom: number;
  style: string;
  settings: SketchSettings;
  size: string;
  dpi: number;
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
    return [{ points: points.slice(0, 500).map(([lng, lat]: [number, number]) => [lng, lat]), color: validColor(route.color, ROUTE_COLOR) }];
  });
}

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
    center: [lng, lat],
    zoom: data.zoom,
    style: String(data.style ?? ''),
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
      border: s.border === true,
      labelScale: clamp(s.labelScale, 0.5, 2, DEFAULT_SETTINGS.labelScale),
      inked: s.inked !== false,
      titleFont: TITLE_FONTS.includes(String(s.titleFont)) ? String(s.titleFont) : DEFAULT_SETTINGS.titleFont,
      titleLayout: TITLE_LAYOUTS.find((l) => l.id === s.titleLayout)?.id ?? DEFAULT_SETTINGS.titleLayout,
    },
    size: String(data.size ?? ''),
    dpi: Number(data.dpi),
  };
}
