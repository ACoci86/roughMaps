import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Point } from './sketch';

export type GridLine = { from: Point; to: Point; value: number; axis: 'east' | 'north' };
export type KmGrid = { lines: GridLine[]; zone: string; spacing: number };

const SPACINGS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const MIN_GAP = 90;
const RADIUS = 6378137;
const FLAT = 1 / 298.257223563;
const SCALE = 0.9996;

function toUtm(lng: number, lat: number, zone: number, south: boolean): [number, number] {
  const e2 = FLAT * (2 - FLAT);
  const ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180;
  const centre = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = RADIUS / Math.sqrt(1 - e2 * sin * sin);
  const t = tan * tan;
  const c = ep2 * cos * cos;
  const a = cos * ((lng * Math.PI) / 180 - centre);
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const m =
    RADIUS *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));
  const easting =
    SCALE * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * a ** 5) / 120) + 500000;
  const northing =
    SCALE *
    (m +
      n *
        tan *
        ((a * a) / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * a ** 6) / 720));
  return [easting, south ? northing + 10000000 : northing];
}

export function prepareGrid(map: MapLibreMap, width: number, height: number): KmGrid | null {
  const middle = map.getCenter();
  if (Math.abs(middle.lat) > 84) return null;
  const zone = Math.min(60, Math.max(1, Math.floor((((middle.lng + 180) % 360) + 360) % 360 / 6) + 1));
  const south = middle.lat < 0;
  const utm = (x: number, y: number) => {
    const { lng, lat } = map.unproject([x, y]);
    return toUtm(lng, lat, zone, south);
  };
  const origin = utm(0, 0);
  const right = utm(width, 0);
  const down = utm(0, height);
  const ax = (right[0] - origin[0]) / width;
  const ay = (right[1] - origin[1]) / width;
  const bx = (down[0] - origin[0]) / height;
  const by = (down[1] - origin[1]) / height;
  const det = ax * by - bx * ay;
  if (!det) return null;
  const toScreen = (e: number, n: number): Point => {
    const du = e - origin[0];
    const dv = n - origin[1];
    return [(du * by - bx * dv) / det, (ax * dv - ay * du) / det];
  };
  const corners = [origin, right, down, utm(width, height)];
  const perPixel = Math.hypot(ax, ay);
  const spacing = SPACINGS.find((s) => s / perPixel >= MIN_GAP) ?? SPACINGS[SPACINGS.length - 1];
  const [minE, maxE] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const [minN, maxN] = [Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1]))];
  const lines: GridLine[] = [];
  for (let e = Math.ceil(minE / spacing) * spacing; e <= maxE; e += spacing) {
    lines.push({ from: toScreen(e, minN), to: toScreen(e, maxN), value: e, axis: 'east' });
  }
  for (let n = Math.ceil(minN / spacing) * spacing; n <= maxN; n += spacing) {
    lines.push({ from: toScreen(minE, n), to: toScreen(maxE, n), value: n, axis: 'north' });
  }
  return { lines, zone: `${zone}${south ? 'S' : 'N'}`, spacing };
}

export function gridNumber(value: number): string {
  return String(Math.floor(Math.round(value) / 1000) % 100).padStart(2, '0');
}

export function gridNote(grid: KmGrid): string {
  return `UTM zone ${grid.zone}, ${grid.spacing / 1000} km squares`;
}
