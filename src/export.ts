import { drawSketch, type Scene, type SketchSettings } from './sketch';
import type { StyleSpec } from './styles';

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
  center: [number, number];
  zoom: number;
  style: string;
  settings: SketchSettings;
  size: string;
  dpi: number;
};

export function parseConfig(text: string): Config {
  const data = JSON.parse(text) as Partial<Config>;
  if (data.app !== 'roughMaps' || data.version !== 1) throw new Error('This is not a roughMaps config file');
  if (!Array.isArray(data.center) || typeof data.zoom !== 'number' || typeof data.style !== 'string') {
    throw new Error('This config file is incomplete');
  }
  return data as Config;
}
