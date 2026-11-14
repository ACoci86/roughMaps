import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Label, Point, Scene } from './sketch';
import { loadCities, type City, type Place } from './search';
import { simplifyShape } from './shapes';

type Ring = [number, number][];
type Polygon = Ring[];
type Line = { points: Point[]; closed: boolean };
type Shape = Line[];

export type Country = {
  index: number;
  extent: [number, number, number, number];
  names: string[];
  short: string;
  capital: [string, number, number] | null;
  label: [number, number];
  bounds: [number, number, number, number];
  shapes: Polygon[];
};

type CountryRow = [string[], string, [string, number, number] | null, [number, number], [number, number, number, number], Polygon[]];
type Nature = { lakes: [string, Polygon[]][]; rivers: [string, number, Ring[]][] };

export type Town = { point: Point; capital: boolean };

let countryList: Promise<Country[]> | null = null;
let natureData: Promise<Nature> | null = null;
let ready: { countries: Country[]; nature: Nature; cities: City[] } | null = null;

export function loadCountries(): Promise<Country[]> {
  countryList ??= fetch('/countries.json')
    .then((r) => (r.ok ? (r.json() as Promise<CountryRow[]>) : []))
    .then((rows) =>
      rows.map(([names, short, capital, label, bounds, shapes], index) => ({
        index,
        extent: extentOf(shapes),
        names,
        short,
        capital,
        label,
        bounds,
        shapes,
      })),
    )
    .catch(() => []);
  return countryList;
}

function loadNature(): Promise<Nature> {
  natureData ??= fetch('/nature.json')
    .then((r) => (r.ok ? (r.json() as Promise<Nature>) : { lakes: [], rivers: [] }))
    .catch(() => ({ lakes: [], rivers: [] }));
  return natureData;
}

function extentOf(shapes: Polygon[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of shapes) {
    for (const [x, y] of rings[0]) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

const DETAIL_ZOOM = 5.5;
const MAX_DETAIL_FILES = 40;
const details = new Map<number, Promise<Polygon[] | null>>();
const loadedDetails = new Map<number, Polygon[]>();

function inBounds(map: MapLibreMap, [w, s, e, n]: Country['extent']): boolean {
  const b = map.getBounds();
  if (n < b.getSouth() || s > b.getNorth()) return false;
  return [-360, 0, 360].some((shift) => e + shift >= b.getWest() && w + shift <= b.getEast());
}

export async function loadDetails(map: MapLibreMap): Promise<void> {
  if (!ready || map.getZoom() < DETAIL_ZOOM) return;
  const wanted = ready.countries.filter((c) => inBounds(map, c.extent)).slice(0, MAX_DETAIL_FILES);
  await Promise.all(
    wanted.map((c) => {
      let request = details.get(c.index);
      if (!request) {
        request = fetch(`/detail/${c.index}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<Polygon[]>) : null))
          .then((shapes) => {
            if (shapes) loadedDetails.set(c.index, shapes);
            return shapes;
          })
          .catch(() => null);
        details.set(c.index, request);
      }
      return request;
    }),
  );
}

export async function loadCountryData(): Promise<void> {
  const [countries, nature, cities] = await Promise.all([loadCountries(), loadNature(), loadCities()]);
  ready = { countries, nature, cities };
}

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function countryPlace(country: Country): Place {
  const [w, s, e, n] = country.bounds;
  const name = country.names[0];
  return {
    name,
    label: `${name} (whole country)`,
    center: [(w + e) / 2, (s + n) / 2],
    bounds: [
      [w, s],
      [e, n],
    ],
    country: name,
  };
}

export async function matchCountries(query: string, limit = 3): Promise<Place[]> {
  const q = fold(query);
  if (q.length < 2) return [];
  const countries = await loadCountries();
  const starts: Country[] = [];
  const words: Country[] = [];
  for (const country of countries) {
    const names = country.names.map(fold);
    if (names.some((n) => n.startsWith(q))) starts.push(country);
    else if (q.length > 2 && names.some((n) => n.includes(` ${q}`))) words.push(country);
  }
  return [...starts, ...words].slice(0, limit).map(countryPlace);
}

export async function findCountry(name: string): Promise<Country | null> {
  const q = fold(name);
  if (!q) return null;
  const countries = await loadCountries();
  return countries.find((c) => c.names.some((n) => fold(n) === q)) ?? null;
}

function facing(center: [number, number], limit: number) {
  const rad = Math.PI / 180;
  const [lng0, lat0] = center;
  const sin0 = Math.sin(lat0 * rad);
  const cos0 = Math.cos(lat0 * rad);
  return (lng: number, lat: number) =>
    sin0 * Math.sin(lat * rad) + cos0 * Math.cos(lat * rad) * Math.cos((lng - lng0) * rad) > limit;
}

const FOCUS_SIZE = 'nation-focus';

function findHorizon(
  [lng0, lat0]: [number, number],
  project: (lng: number, lat: number) => Point,
  [mx, my]: Point,
): { angle: number; radius: number } {
  const rad = Math.PI / 180;
  const phi = lat0 * rad;
  let best = { angle: Math.PI / 2, radius: 0 };
  for (let deg = 0.1; deg <= 90; deg = Math.min(deg * 1.04, deg + 0.5)) {
    const d = deg * rad;
    const lat = Math.asin(Math.sin(phi) * Math.cos(d) + Math.cos(phi) * Math.sin(d) * 0);
    const lng = lng0 * rad + Math.atan2(Math.sin(d) * Math.cos(phi), Math.cos(d) - Math.sin(phi) * Math.sin(lat));
    const [x, y] = project(lng / rad, lat / rad);
    const r = Math.hypot(x - mx, y - my);
    if (r < best.radius) break;
    best = { angle: d, radius: r };
  }
  return best;
}

function pieceSizes(shape: Shape): { point: Point; size: number }[] {
  return shape.map(({ points }) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { point: [(x0 + x1) / 2, (y0 + y1) / 2], size: Math.max(x1 - x0, y1 - y0) };
  });
}

function around([x, y]: Point, name: string, gap: number): Point[] {
  const half = name.length * 4.6 + 12;
  return [
    [x, y + gap],
    [x + half, y],
    [x - half, y],
  ];
}

function inside([x, y]: Point, shape: Shape): boolean {
  let hit = false;
  for (const { points } of shape) {
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

function freeSpot(start: Point, name: string, shape: Shape, towns: Town[]): Point {
  const halfWidth = name.length * 11 + 10;
  const halfHeight = 24;
  const clearOfTowns = ([x, y]: Point) =>
    towns.every(({ point: [tx, ty] }) => Math.abs(tx - x) > halfWidth + 8 || Math.abs(ty - y) > halfHeight + 8);
  for (const onLand of [true, false]) {
    for (let r = 0; r <= 160; r += 20) {
      for (let k = 0; k < Math.max(1, r / 5); k++) {
        const a = (k / Math.max(1, r / 5)) * Math.PI * 2;
        const point: Point = [start[0] + Math.cos(a) * r * 1.6, start[1] + Math.sin(a) * r];
        if ((!onLand || inside(point, shape)) && clearOfTowns(point)) return point;
      }
    }
  }
  return start;
}

export function prepareCountryScene(map: MapLibreMap, focus: string | null, title: string): Scene {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const center = map.getCenter().toArray() as [number, number];
  const zoom = map.getZoom();
  const margin = 40;
  const onScreen = ([x, y]: Point) => x > -margin && y > -margin && x < width + margin && y < height + margin;
  const project = (lng: number, lat: number): Point => {
    const { x, y } = map.project([lng, lat]);
    return [x, y];
  };
  const [mx, my] = project(center[0], center[1]);
  const { angle: horizon, radius } = findHorizon(center, project, [mx, my]);
  const visible = facing(center, Math.cos(horizon * 0.995));
  const clear = facing(center, Math.cos(horizon * 0.75));
  const projectRing = (ring: Ring, closed: boolean): Line | null => {
    const points = ring.filter(([lng, lat]) => visible(lng, lat)).map(([lng, lat]) => project(lng, lat));
    return points.length >= (closed ? 3 : 2) ? { points, closed } : null;
  };
  const inView = (shape: Shape) => shape.some((l) => l.points.some(onScreen)) || covers(shape);
  const covers = (shape: Shape) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { points } of shape) {
      for (const [x, y] of points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    return x0 < width && x1 > 0 && y0 < height && y1 > 0;
  };
  const toShape = (polygons: Polygon[]): Shape =>
    simplifyShape(
      polygons.flatMap((rings) => rings.map((r) => projectRing(r, true)).filter((l): l is Line => l !== null)),
      0.5,
    );

  const data = ready ?? { countries: [], nature: { lakes: [], rivers: [] }, cities: [] };
  const land: Shape[] = [];
  const places: Label[] = [];
  const towns: Town[] = [];
  const capitals: { name: string; point: Point; focus: boolean }[] = [];
  let focusIndex = -1;

  const detailed = zoom >= DETAIL_ZOOM;
  for (const country of data.countries) {
    const shape = toShape((detailed && loadedDetails.get(country.index)) || country.shapes);
    if (!shape.length || !inView(shape)) continue;
    const isFocus = focus !== null && country.names[0] === focus;
    if (isFocus) focusIndex = land.length;
    land.push(shape);
    const [lng, lat] = country.label;
    const point = clear(lng, lat) ? project(lng, lat) : null;
    if (point && onScreen(point)) places.push({ name: isFocus ? country.names[0] : country.short, kind: isFocus ? FOCUS_SIZE : 'nation', points: [point] });
    else if (isFocus) places.push({ name: country.names[0], kind: FOCUS_SIZE, points: [[width / 2, height / 2]] });
    if (country.capital) {
      const [name, clng, clat] = country.capital;
      const point = clear(clng, clat) ? project(clng, clat) : null;
      if (point && point[0] > 10 && point[1] > 10 && point[0] < width - 10 && point[1] < height - 10) {
        capitals.push({ name, point, focus: isFocus });
      }
    }
  }

  const crowded = ([x, y]: Point) => towns.some((t) => Math.hypot(t.point[0] - x, t.point[1] - y) < 36);
  capitals.sort((a, b) => Number(b.focus) - Number(a.focus));
  for (const { name, point, focus: isFocus } of capitals) {
    if (!isFocus && crowded(point)) continue;
    towns.push({ point, capital: true });
    places.push({ name, kind: 'capital', points: [[point[0], point[1] - 16]], spots: around(point, name, 16) });
  }

  const maxCities = Math.round(Math.min(40, Math.max(6, 6 + (zoom - 3.5) * 8)));
  let added = 0;
  for (const [name, , , , lng, lat] of data.cities) {
    if (added >= maxCities) break;
    if (!clear(lng, lat)) continue;
    const point = project(lng, lat);
    if (point[0] < 20 || point[1] < 20 || point[0] > width - 20 || point[1] > height - 20) continue;
    if (crowded(point)) continue;
    towns.push({ point, capital: false });
    places.push({ name, kind: 'city-dot', points: [[point[0], point[1] - 15]], spots: around(point, name, 15) });
    added++;
  }

  const focusLabel = places.find((p) => p.kind === FOCUS_SIZE);
  if (focusLabel && focusIndex >= 0) {
    const half = focusLabel.name.length * 11 + 16;
    const [x, y] = freeSpot(focusLabel.points[0], focusLabel.name, land[focusIndex], towns);
    focusLabel.points = [[Math.min(width - half, Math.max(half, x)), Math.min(height * 0.72, Math.max(50, y))]];
  }

  const islets: Point[] = [];
  const pieces = focusIndex >= 0 ? pieceSizes(land[focusIndex]) : [];
  if (pieces.length && Math.max(...pieces.map((p) => p.size)) < 60) {
    for (const { point, size } of pieces) {
      if (size >= 7 || !onScreen(point) || islets.length >= 60) continue;
      if (islets.some(([ix, iy]) => Math.hypot(ix - point[0], iy - point[1]) < 14)) continue;
      islets.push(point);
    }
  }

  const lakes: Shape[] = [];
  const waterNames: Label[] = [];
  for (const [name, polygons] of data.nature.lakes) {
    const shape = toShape(polygons);
    if (!shape.length || !inView(shape)) continue;
    lakes.push(shape);
    const outer = shape[0].points;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of outer) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (name && (x1 - x0) * (y1 - y0) > 4000) waterNames.push({ name, kind: 'lake', points: [[(x0 + x1) / 2, (y0 + y1) / 2]] });
  }

  const rivers: { shape: Shape; rank: number }[] = [];
  const minRank = zoom < 4 ? 4 : zoom < 5.5 ? 6 : 9;
  for (const [name, rank, parts] of data.nature.rivers) {
    if (rank > minRank) continue;
    const shape = simplifyShape(
      parts.map((p) => projectRing(p, false)).filter((l): l is Line => l !== null),
      0.5,
    );
    if (!shape.length || !shape.some((l) => l.points.some(onScreen))) continue;
    rivers.push({ shape, rank });
    if (name && rank <= 5) for (const l of shape) waterNames.push({ name, kind: 'river', points: l.points });
  }

  const pad = 30;
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => Math.hypot(x - mx, y - my));
  const globe = radius < Math.max(...corners);
  const sea: Shape = [
    {
      points: globe
        ? Array.from({ length: 96 }, (_, i): Point => {
            const a = (i / 96) * Math.PI * 2;
            return [mx + Math.cos(a) * radius, my + Math.sin(a) * radius];
          })
        : [
            [-pad, -pad],
            [width + pad, -pad],
            [width + pad, height + pad],
            [-pad, height + pad],
          ],
      closed: true,
    },
  ];

  return {
    width,
    height,
    zoom,
    bearing: map.getBearing(),
    center,
    title,
    pins: [],
    routes: [],
    highlights: [],
    water: [sea],
    waterParts: [],
    green: [],
    forest: [],
    sand: [],
    ice: [],
    rock: [],
    lifts: [],
    buildings: [],
    bridges: [],
    roads: [],
    railways: [],
    streetNames: [],
    places,
    waterNames,
    pois: [],
    peaks: [],
    land,
    focus: focusIndex,
    lakes,
    rivers,
    towns,
    islets,
  };
}
