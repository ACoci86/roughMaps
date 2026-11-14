import rough from 'roughjs';
import { union, type Geom } from 'polyclip-ts';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { Map as MapLibreMap, GeoJSONFeature } from 'maplibre-gl';
import type { Geometry, Polygon, Position } from 'geojson';
import { POI_ICONS, type MapFeatures } from './features';
import type { AreaPaint, StyleSpec } from './styles';
import { Placer, layoutLabels, drawLabel, loadLabelFonts, loadMapFont } from './labels';
import { treeSpots, tree, icon, ICON_RADIUS, type Doodle } from './doodles';
import { drawPosterTitle, drawBorder, loadTitleFont, posterLayout, type Rect, type TitleLayout } from './poster';
import { drawCompass, drawScaleBar, furnitureBoxes } from './furniture';
import { drawPin, loadPinFonts, pinBoxes, type PlacedPin } from './pins';
import { drawRoute, type PlacedRoute } from './routes';
import { drawProfile, profileBox, type Profile } from './profile';
import { fillOffset, inkLines, onlyFill, onlyLines } from './ink';
import { hatchAngle, mainAngle, ringArea, simplifyShape, splitPieces } from './shapes';
import { resolveOptions, roughPath } from './roughpath';
import { makeShapes } from './shapepool';
import type { Town } from './countries';
import { gridNote, gridNumber, prepareGrid, type KmGrid } from './kmgrid';
import { bandColor, contourLines, hachureStrokes, heightBands, TERRAIN_CREDIT, type Contour, type Hachure, type Terrain, type TerrainMode } from './terrain';

export type Point = [number, number];
type Line = { points: Point[]; closed: boolean; key?: number };
type Shape = Line[];
type Road = { shape: Shape; kind: string };
export type Label = { name: string; kind: string; points: Point[]; spots?: Point[] };
export type Poi = { name: string; icon: string; rank: number; point: Point };
export type Peak = { name: string; ele: number | null; kind: 'peak' | 'saddle'; point: Point };

const DEV = import.meta.env.DEV;
const ms = (time: number) => `${Math.round(time)} ms`;

export type Scene = {
  width: number;
  height: number;
  zoom: number;
  bearing: number;
  center: [number, number];
  title: string;
  pins: PlacedPin[];
  routes: PlacedRoute[];
  highlights: { point: Point; color: string }[];
  trim?: number;
  profile?: Profile | null;
  water: Shape[];
  waterParts: Shape[];
  green: Shape[];
  forest: Shape[];
  sand: Shape[];
  ice: Shape[];
  rock: Shape[];
  lifts: Shape[];
  buildings: Shape[];
  bridges: Shape[];
  roads: Road[];
  railways: Shape[];
  streetNames: Label[];
  places: Label[];
  waterNames: Label[];
  pois: Poi[];
  peaks: Peak[];
  terrain?: Terrain | null;
  kmGrid?: KmGrid | null;
  land: Shape[];
  focus: number;
  lakes: Shape[];
  rivers: { shape: Shape; rank: number }[];
  towns: Town[];
  islets: Point[];
};

const MIN_GREEN_AREA = 60;
const FOCUS_COLORS = ['#f2b134', '#e4572e', '#5fae6e', '#4a7fd4', '#c75fb0'];

function rgb(hex: string): number[] {
  return /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [128, 128, 128];
}

function focusColor(style: StyleSpec): string {
  const avoid = [style.ink, style.text ?? style.ink, style.paper, style.water.color, style.water.patternColor ?? style.water.color].map(rgb);
  const score = (hex: string) => Math.min(...avoid.map((c) => Math.hypot(...rgb(hex).map((v, i) => v - c[i]))));
  return FOCUS_COLORS.reduce((best, c) => (score(c) > score(best) + 20 ? c : best));
}
const ROAD_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'path'];
const PATH_KINDS = ['path', 'track', 'ferry'];
const CREDIT_WIDTH = 165;

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 8,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  minor: 4,
  service: 2.5,
  path: 1.2,
};

function area(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function coordKey(position: Position | undefined): number {
  if (!position) return 0;
  const a = Math.imul(Math.round(position[0] * 1e6), 73856093);
  const b = Math.imul(Math.round(position[1] * 1e6), 19349663);
  return ((a ^ b) >>> 0) % 1000003;
}

function toShape(map: MapLibreMap, geometry: Geometry, minArea = 0): Shape {
  const project = (coords: Position[]): Point[] =>
    coords.map((p) => {
      const { x, y } = map.project([p[0], p[1]]);
      return [x, y];
    });

  const polygon = (rings: Position[][]): Line[] => {
    const lines: Line[] = rings.map((ring) => ({ points: project(ring), closed: true }));
    lines[0].key = coordKey(rings[0][0]);
    return area(lines[0].points) < minArea ? [] : lines;
  };

  switch (geometry.type) {
    case 'LineString':
      return [{ points: project(geometry.coordinates), closed: false, key: coordKey(geometry.coordinates[0]) }];
    case 'MultiLineString':
      return geometry.coordinates.map((c) => ({ points: project(c), closed: false, key: coordKey(c[0]) }));
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return geometry.coordinates.flatMap(polygon);
    default:
      return [];
  }
}

type Patch = { geometry: Geometry; polygons: Position[][][]; box: [number, number, number, number]; mark: string; cut: boolean };
type Merge = { polygons: Position[][][] | null; used: number };
const merges = new Map<string, Merge>();
const KEEP_MERGES = 3;
let mergeRound = 0;

type MergeView = { box: [number, number, number, number]; squeeze: number; tolerance: number; pixel: number };

function clipRing(ring: Position[], [w, s, e, n]: [number, number, number, number]): Position[] {
  const edges: [(p: Position) => boolean, (a: Position, b: Position) => Position][] = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ];
  let points = ring;
  for (const [inside, cross] of edges) {
    if (!points.length) break;
    const out: Position[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const ina = inside(a);
      const inb = inside(b);
      if (ina) out.push(a);
      if (ina !== inb) out.push(cross(a, b));
    }
    points = out;
  }
  if (points.length && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1])) {
    points.push(points[0]);
  }
  return points;
}

function mergeDetail(zoom: number): number {
  return 0.35 + 1.15 * Math.min(1, Math.max(0, (13 - zoom) / 3));
}

function thinned(polygons: Position[][][], view: MergeView): Position[][][] {
  const { squeeze, tolerance } = view;
  return polygons.flatMap((rings) => {
    const kept = rings.flatMap((ring, k) => {
      const clipped = clipRing(ring, view.box);
      if (clipped.length < 4) return k === 0 ? [null] : [];
      const line = { points: clipped.map(([x, y]): Point => [x * squeeze, y]), closed: true };
      const [simple] = simplifyShape([line], tolerance);
      return [(simple ?? line).points.map(([x, y]) => [x / squeeze, y])];
    });
    return kept[0] ? [kept as Position[][]] : [];
  });
}

function patchOf(geometry: Geometry, view: MergeView): Patch | null {
  const raw =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!raw) return null;
  const polygons = raw;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  let count = 0;
  let sum = 0;
  let cut = false;
  const longX = view.pixel * 2;
  const longY = longX * view.squeeze;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let k = 1; !cut && k < ring.length; k++) {
        const [ax, ay] = ring[k - 1];
        const [bx, by] = ring[k];
        if ((ax === bx && Math.abs(by - ay) > longY) || (ay === by && Math.abs(bx - ax) > longX)) cut = true;
      }
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sum += x * 3 + y;
        count++;
      }
    }
  }
  if (!count) return null;
  const [w, south, e, north] = view.box;
  if (maxX < w || minX > e || maxY < south || minY > north) return null;
  const simple = thinned(polygons, view);
  if (!simple.length) return null;
  return {
    cut,
    geometry: { type: 'MultiPolygon', coordinates: simple },
    polygons: simple,
    box: [minX, minY, maxX, maxY],
    mark: `${count}|${minX}|${minY}|${maxX}|${maxY}|${sum}`,
  };
}

function touching(patches: Patch[]): Patch[][] {
  const order = patches
    .map((_, i) => i)
    .sort((a, b) => patches[a].box[0] - patches[b].box[0] || patches[a].box[1] - patches[b].box[1]);
  const parent = patches.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let a = 0; a < order.length; a++) {
    if (!patches[order[a]].cut) continue;
    const p = patches[order[a]].box;
    for (let b = a + 1; b < order.length; b++) {
      if (!patches[order[b]].cut) continue;
      const q = patches[order[b]].box;
      if (q[0] > p[2]) break;
      if (q[1] <= p[3] && q[3] >= p[1]) parent[find(order[a])] = find(order[b]);
    }
  }
  const groups = new Map<number, Patch[]>();
  for (const i of order) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(patches[i]);
    else groups.set(root, [patches[i]]);
  }
  return [...groups.values()];
}

function mergeAreas(list: GeoJSONFeature[], view: MergeView): Geometry[] {
  if (list.length < 2) return list.map((f) => f.geometry);
  const seen = new Set<string>();
  const patches: Patch[] = [];
  for (const feature of list) {
    const patch = patchOf(feature.geometry, view);
    if (!patch || seen.has(patch.mark)) continue;
    seen.add(patch.mark);
    patches.push(patch);
  }
  return touching(patches).flatMap((group): Geometry[] => {
    if (group.length === 1) return [group[0].geometry];
    group.sort((a, b) => (a.mark < b.mark ? -1 : a.mark > b.mark ? 1 : 0));
    const key = `${view.tolerance}|${view.box.join(',')}|${group.map((patch) => patch.mark).join(';')}`;
    let merge = merges.get(key);
    if (!merge) {
      merge = { polygons: null, used: mergeRound };
      try {
        const [first, ...rest] = group.map((patch) => patch.polygons as Geom);
        merge.polygons = union(first, ...rest);
      } catch {
        merge.polygons = null;
      }
      merges.set(key, merge);
    }
    merge.used = mergeRound;
    return merge.polygons ? [{ type: 'MultiPolygon', coordinates: merge.polygons }] : group.map((patch) => patch.geometry);
  });
}

function forgetOldMerges(): void {
  for (const [key, merge] of merges) if (merge.used <= mergeRound - KEEP_MERGES) merges.delete(key);
}

function splitPolygons(list: { geometry: Geometry }[]): Polygon[] {
  return list.flatMap((f): Polygon[] => {
    const g = f.geometry;
    if (g.type === 'Polygon') return [g];
    if (g.type === 'MultiPolygon') return g.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
    return [];
  });
}

function roadKind(cls: string): string {
  const base = cls.replace(/_construction$/, '');
  if (PATH_KINDS.includes(base)) return 'path';
  return ROAD_KINDS.includes(base) ? base : 'service';
}

function insideShape([x, y]: Point, shape: Shape): boolean {
  let hit = false;
  for (const { points: ring } of shape) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export function highlightShapes(scene: Scene): Shape[] {
  return scene.land.length ? scene.land : scene.buildings;
}

export function buildingAt(scene: Scene, point: Point): number {
  let best = -1;
  let bestArea = Infinity;
  highlightShapes(scene).forEach((shape, i) => {
    if (!shape.length || !insideShape(point, shape)) return;
    const size = shape.reduce((sum, l) => sum + ringArea(l.points), 0);
    if (size < bestArea) {
      bestArea = size;
      best = i;
    }
  });
  return best;
}

export function prepareScene(map: MapLibreMap, features: MapFeatures, title = ''): Scene {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const margin = 30;
  const onScreen = (shape: Shape) => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { points } of shape) {
      for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX >= -margin && minX <= width + margin && maxY >= -margin && minY <= height + margin;
  };
  const shapes = (geometries: Geometry[], minArea = 0) =>
    geometries.map((g) => toShape(map, g, minArea)).filter((s) => s.length > 0 && onScreen(s));
  const geometries = (list: GeoJSONFeature[]) => list.map((f) => f.geometry);
  const started = performance.now();
  let merging = 0;
  mergeRound++;
  const bounds = map.getBounds();
  const stepLng = (bounds.getEast() - bounds.getWest()) / 4;
  const stepLat = (bounds.getNorth() - bounds.getSouth()) / 4;
  const snap = (v: number, step: number, up: boolean) => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;
  const squeeze = Math.cos((map.getCenter().lat * Math.PI) / 180);
  const view: MergeView = {
    box: [
      snap(bounds.getWest() - stepLng * 0.4, stepLng, false),
      snap(bounds.getSouth() - stepLat * 0.4, stepLat, false),
      snap(bounds.getEast() + stepLng * 0.4, stepLng, true),
      snap(bounds.getNorth() + stepLat * 0.4, stepLat, true),
    ],
    squeeze,
    pixel: 360 / (512 * 2 ** map.getZoom()),
    tolerance: Number(((mergeDetail(map.getZoom()) * 360 * squeeze) / (512 * 2 ** map.getZoom())).toPrecision(3)),
  };
  const merged = (list: GeoJSONFeature[]) => {
    const from = performance.now();
    const result = mergeAreas(list, view);
    merging += performance.now() - from;
    return result;
  };

  const scene: Scene = {
    width,
    height,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    center: map.getCenter().toArray() as [number, number],
    title,
    pins: [],
    routes: [],
    highlights: [],
    water: shapes(merged(features.water)),
    waterParts: shapes(splitPolygons(features.water)),
    green: shapes(merged(features.green), MIN_GREEN_AREA),
    forest: shapes(merged(features.forest), MIN_GREEN_AREA),
    sand: shapes(merged(features.sand)),
    ice: shapes(merged(features.ice)),
    rock: shapes(merged(features.rock)),
    lifts: shapes(geometries(features.lifts)),
    buildings: shapes(splitPolygons(features.buildings)),
    bridges: shapes(geometries(features.bridges)),
    roads: features.roads
      .map((f) => ({ shape: toShape(map, f.geometry), kind: roadKind(String(f.properties.class)) }))
      .filter((r) => onScreen(r.shape)),
    railways: shapes(geometries(features.railways)),
    ...prepareNames(map, features, width, height),
    kmGrid: prepareGrid(map, width, height),
    land: [],
    focus: -1,
    lakes: [],
    rivers: [],
    towns: [],
    islets: [],
  };
  forgetOldMerges();
  if (DEV) {
    const total = ms(performance.now() - started);
    const sizes = `${scene.buildings.length} buildings, ${scene.roads.length} roads`;
    console.info(`[sketch] scene ready in ${total}, merging areas ${ms(merging)}, ${sizes}`);
  }
  return scene;
}

function prepareNames(map: MapLibreMap, features: MapFeatures, width: number, height: number) {
  const margin = 40;
  const visible = ([x, y]: Point) => x > -margin && y > -margin && x < width + margin && y < height + margin;
  const name = (f: GeoJSONFeature) => String(f.properties.name ?? '').trim();
  const project = (p: Position): Point => {
    const { x, y } = map.project([p[0], p[1]]);
    return [x, y];
  };
  const lines = (list: GeoJSONFeature[]): Label[] =>
    list.flatMap((f) =>
      toShape(map, f.geometry)
        .filter((l) => l.points.length > 1 && l.points.some(visible))
        .map((l) => ({ name: name(f), kind: String(f.properties.class), points: l.points })),
    );
  const points = (list: GeoJSONFeature[]): Label[] => {
    const seen = new Set<string>();
    return list.flatMap((f) => {
      if (f.geometry.type !== 'Point' || seen.has(name(f))) return [];
      const point = project(f.geometry.coordinates);
      if (!visible(point)) return [];
      seen.add(name(f));
      return [{ name: name(f), kind: String(f.properties.class), points: [point] }];
    });
  };

  const seenPoi = new Set<string>();
  const pois = features.pois
    .flatMap((f): Poi[] => {
      if (f.geometry.type !== 'Point') return [];
      const point = project(f.geometry.coordinates);
      const key = `${name(f)}|${Math.round(point[0] / 20)}|${Math.round(point[1] / 20)}`;
      if (!visible(point) || seenPoi.has(key)) return [];
      seenPoi.add(key);
      const sub = String(f.properties.subclass);
      const icon = (sub === 'alpine_hut' || sub === 'wilderness_hut' ? POI_ICONS[sub] : POI_ICONS[String(f.properties.class)]) ?? 'star';
      return [{ name: name(f), icon, rank: Number(f.properties.rank ?? 99), point }];
    })
    .sort((a, b) => a.rank - b.rank);

  const seenPeak = new Set<string>();
  const peaks = features.peaks.flatMap((f): Peak[] => {
    if (f.geometry.type !== 'Point') return [];
    const ele = Number(f.properties.ele);
    const known = f.properties.ele !== undefined && Number.isFinite(ele);
    if (!name(f) && !known) return [];
    const point = project(f.geometry.coordinates);
    const key = `${Math.round(point[0] / 4)}|${Math.round(point[1] / 4)}`;
    if (!visible(point) || seenPeak.has(key)) return [];
    seenPeak.add(key);
    return [{ name: name(f), ele: known ? Math.round(ele) : null, kind: f.properties.class === 'saddle' ? 'saddle' : 'peak', point }];
  });

  return {
    streetNames: lines(features.streetNames).filter((l) => l.name),
    places: points(features.places),
    waterNames: [
      ...points(features.waterNames.filter((f) => f.geometry.type === 'Point')),
      ...lines(features.waterNames.filter((f) => f.geometry.type !== 'Point')),
    ],
    pois,
    peaks,
  };
}

export type SketchSettings = {
  roughness: number;
  fillStyle: string;
  strokeWidth: number;
  innerStrokeWidth: number;
  fillWeight: number;
  labels: boolean;
  doodles: boolean;
  poster: boolean;
  compass: boolean;
  border: boolean;
  coords: boolean;
  labelScale: number;
  labelFont: string;
  inked: boolean;
  wobblyLabels: boolean;
  titleFont: string;
  titleLayout: TitleLayout;
  coordsFont: string;
  terrain: TerrainMode;
  profile: boolean;
};

export const DEFAULT_SETTINGS: SketchSettings = {
  roughness: 1,
  fillStyle: 'default',
  strokeWidth: 1,
  innerStrokeWidth: 1,
  fillWeight: 1,
  labels: true,
  doodles: true,
  poster: true,
  compass: true,
  border: false,
  coords: true,
  labelScale: 1,
  labelFont: 'Gaegu',
  inked: true,
  wobblyLabels: true,
  titleFont: 'Gaegu',
  titleLayout: 'bottom',
  coordsFont: 'Gaegu',
  terrain: 'none',
  profile: true,
};

function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

function isDark(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return r * 0.3 + g * 0.59 + b * 0.11 < 110;
}

export function terrainInk(style: StyleSpec): string {
  if (style.relief) return style.relief;
  const ink = style.text ?? style.ink;
  if (isDark(style.paper) || !/^#[0-9a-f]{6}$/i.test(ink)) return mix(ink, style.paper, 0.35);
  return mix(mix(ink, '#9a5b26', 0.6), style.paper, 0.2);
}

const contourCache = new WeakMap<Terrain, Contour[]>();
const bandCache = new WeakMap<Terrain, ReturnType<typeof heightBands>>();

function sceneBands(scene: Scene): ReturnType<typeof heightBands> | null {
  const terrain = scene.terrain;
  if (!terrain) return null;
  let bands = bandCache.get(terrain);
  if (!bands) bandCache.set(terrain, (bands = heightBands(terrain)));
  return bands;
}

function pylons(points: Point[], gap: number): Point[] {
  const spots: Point[] = [];
  let left = gap / 2;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const span = Math.hypot(bx - ax, by - ay);
    let at = left;
    while (at <= span) {
      spots.push([ax + ((bx - ax) * at) / span, ay + ((by - ay) * at) / span]);
      at += gap;
    }
    left = at - span;
  }
  return spots;
}
const hachureCache = new WeakMap<Terrain, Hachure[]>();

export function sceneContours(scene: Scene): Contour[] {
  const terrain = scene.terrain;
  if (!terrain) return [];
  let lines = contourCache.get(terrain);
  if (!lines) contourCache.set(terrain, (lines = contourLines(terrain)));
  return lines;
}

function sceneHachures(scene: Scene): Hachure[] {
  const terrain = scene.terrain;
  if (!terrain) return [];
  let strokes = hachureCache.get(terrain);
  if (!strokes) hachureCache.set(terrain, (strokes = hachureStrokes(terrain)));
  return strokes;
}

function fade(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function patternFill(paint: AreaPaint, forced: string | null, weightScale: number): Options {
  const gap = paint.gap ?? 5;
  const weight = (paint.weight ?? 0.8) * weightScale;
  if (forced) {
    return { fillStyle: forced, hachureGap: gap, fillWeight: weight, zigzagOffset: gap / 2, dashGap: gap / 2, dashOffset: gap / 2 };
  }
  switch (paint.pattern) {
    case 'cross':
      return { fillStyle: 'cross-hatch', hachureGap: gap, fillWeight: weight };
    case 'lines':
      return { fillStyle: 'hachure', hachureGap: gap, fillWeight: weight, hachureAngle: 0 };
    case 'dots':
      return { fillStyle: 'dots', hachureGap: gap, fillWeight: weight };
    case 'waves':
      return { fillStyle: 'zigzag-line', hachureGap: gap, fillWeight: weight, zigzagOffset: gap / 2 };
    case 'scribble':
      return { fillStyle: 'zigzag', hachureGap: gap, fillWeight: weight };
    case 'stitch':
      return { fillStyle: 'dashed', hachureGap: gap, fillWeight: weight, dashOffset: gap * 0.9, dashGap: gap * 0.7 };
    default:
      return { fillStyle: 'hachure', hachureGap: gap, fillWeight: weight };
  }
}

type Step = () => void;

const shapeCache = new WeakMap<Scene, Map<string, Placed[]>>();
const doodleCache = new WeakMap<Scene, Map<string, Doodle[][]>>();
const treeCache = new WeakMap<Scene, { green: Point[]; forest: Point[] }>();
type Prepared = { shape: Shape; angle: number | undefined; small: boolean; size: number };
const simplifiedCache = new WeakMap<Scene, Map<string, (Prepared | null)[]>>();
const MIN_BUILDING_AREA = 1;
const SMALL_BUILDING_AREA = 45;
const SMALL_BATCH = 1500;
const TINY_BUILDING_AREA = 22;
const MIN_HOLE_AREA = 80;
const MAX_ICONS = 40;
const ICON_SPACING = 34;
const jobs = new WeakMap<HTMLCanvasElement, number>();

export function cancelSketch(canvas: HTMLCanvasElement): void {
  jobs.set(canvas, (jobs.get(canvas) ?? 0) + 1);
}

export type SketchPart = 'all' | 'map' | 'frame';

type Placed = Drawable & { shift?: Point };
type Wanted = { key: string; i: number; shape: Shape; options: Options };
const BLANK: Placed = { shape: 'path', sets: [], options: resolveOptions({}) };
const HELPER_MIN = 250;
type Kept = { shape: Shape; drawable: Drawable; used: number };
const kept = new Map<string, Map<number, Kept[]>>();
const keptView = { zoom: NaN, bearing: NaN, scenes: 0 };
const sceneNumbers = new WeakMap<Scene, number>();
const KEEP_SCENES = 2;
const KEEP_PER_SHAPE = 4;
const SAME_SPOT = 0.01;

function sceneNumber(scene: Scene): number {
  const known = sceneNumbers.get(scene);
  if (known !== undefined) return known;
  const number = ++keptView.scenes;
  sceneNumbers.set(scene, number);
  if (scene.zoom !== keptView.zoom || scene.bearing !== keptView.bearing) {
    kept.clear();
    keptView.zoom = scene.zoom;
    keptView.bearing = scene.bearing;
    return number;
  }
  for (const byShape of kept.values()) {
    for (const [id, list] of byShape) {
      const recent = list.filter((entry) => entry.used >= number - KEEP_SCENES);
      if (recent.length) byShape.set(id, recent);
      else byShape.delete(id);
    }
  }
  return number;
}

function offsetBetween(from: Shape, to: Shape): Point | null {
  const start = from[0]?.points[0];
  const end = to[0]?.points[0];
  if (!start || !end || from.length !== to.length) return null;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  for (let r = 0; r < from.length; r++) {
    const a = from[r].points;
    const b = to[r].points;
    if (a.length !== b.length || from[r].closed !== to[r].closed) return null;
    for (let k = 0; k < a.length; k++) {
      if (Math.abs(b[k][0] - a[k][0] - dx) > SAME_SPOT || Math.abs(b[k][1] - a[k][1] - dy) > SAME_SPOT) return null;
    }
  }
  return [dx, dy];
}

type Yielding = { yield?: () => Promise<void> };

function pause(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Yielding }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

export async function drawSketch(
  canvas: HTMLCanvasElement,
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings = DEFAULT_SETTINGS,
  output?: { width: number; height: number },
  part: SketchPart = 'all',
): Promise<boolean> {
  const job = output ? null : (jobs.get(canvas) ?? 0) + 1;
  if (job !== null) jobs.set(canvas, job);
  const cancelled = () => job !== null && jobs.get(canvas) !== job;
  const started = performance.now();
  const { roughness } = settings;
  const { width, height } = scene;
  const ratio = output ? Math.min(output.width / width, output.height / height) : window.devicePixelRatio || 1;
  canvas.width = output ? output.width : Math.round(width * ratio);
  canvas.height = output ? output.height : Math.round(height * ratio);

  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  if (part !== 'frame') {
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  if (!shapeCache.has(scene)) shapeCache.set(scene, new Map());
  const cache = shapeCache.get(scene)!;
  const number = sceneNumber(scene);
  let shapeTime = 0;
  let made = 0;
  let reused = 0;
  let helped = 0;
  let helperTime = 0;
  let planning = false;
  const wanted: Wanted[] = [];
  const asked = new Set<string>();
  const found = (key: string, shape: Shape): Placed | undefined => {
    const id = shape[0]?.key;
    const list = id === undefined ? undefined : kept.get(key)?.get(id);
    for (const entry of list ?? []) {
      const offset = offsetBetween(entry.shape, shape);
      if (!offset) continue;
      entry.used = Math.max(entry.used, number);
      return offset[0] || offset[1] ? { ...entry.drawable, shift: offset } : entry.drawable;
    }
    return undefined;
  };
  const remember = (key: string, shape: Shape, drawable: Drawable) => {
    const id = shape[0]?.key;
    if (id === undefined) return;
    let byShape = kept.get(key);
    if (!byShape) kept.set(key, (byShape = new Map()));
    const list = byShape.get(id);
    const entry = { shape, drawable, used: number };
    if (!list) byShape.set(id, [entry]);
    else if (list.push(entry) > KEEP_PER_SHAPE) list.shift();
  };
  const shaped = (key: string, i: number, shape: Shape, options: Options): Placed => {
    let list = cache.get(key);
    if (!list) cache.set(key, (list = []));
    const ready = list[i];
    if (ready) return ready;
    const known = found(key, shape);
    if (known) {
      reused++;
      return (list[i] = known);
    }
    if (planning) {
      const mark = `${key}#${i}`;
      if (!asked.has(mark)) {
        asked.add(mark);
        wanted.push({ key, i, shape, options });
      }
      return BLANK;
    }
    const from = performance.now();
    const drawable = roughPath(shape, options);
    shapeTime += performance.now() - from;
    made++;
    remember(key, shape, drawable);
    return (list[i] = drawable);
  };
  const moved = (drawable: Placed, draw: () => void) => {
    if (planning) return;
    const shift = drawable.shift;
    if (!shift) return draw();
    ctx.save();
    ctx.translate(shift[0], shift[1]);
    draw();
    ctx.restore();
  };
  const paint = (drawable: Placed, options: Options) =>
    moved(drawable, () => rc.draw({ ...drawable, options: { ...drawable.options, ...options } }));
  const ink = (drawable: Placed, pen: number, seed: number) =>
    moved(drawable, () => inkLines(ctx, onlyLines(drawable), style.ink, pen, seed));

  const wobble = { roughness, bowing: roughness };
  const decor: Options = { roughness: 1, bowing: 1 };
  const text = style.text ?? style.ink;
  const outlineWidth = style.outline * settings.strokeWidth;
  const hasOutline = outlineWidth > 0;
  const forced = settings.fillStyle === 'default' ? null : settings.fillStyle;
  const steps: Step[] = [];
  const shapeSteps: Step[] = [];
  const sketched = (step: Step) => {
    shapeSteps.push(step);
    steps.push(step);
  };
  const fixedSteps = new Set<Step>();
  const fixed = (step: Step) => {
    if (part === 'map') return;
    fixedSteps.add(step);
    steps.push(step);
  };

  const inked = settings.inked;
  const flows = scene.waterNames.filter((l) => l.points.length > 1).map((l) => l.points);
  const flowAngle = (part: Shape): number | undefined => {
    const inside = part.flatMap((l) => l.points).filter(([x, y]) => x >= 0 && y >= 0 && x <= width && y <= height);
    if (!inside.length || !flows.length) return undefined;
    const cx = inside.reduce((a, p) => a + p[0], 0) / inside.length;
    const cy = inside.reduce((a, p) => a + p[1], 0) / inside.length;
    let best = Infinity;
    let angle: number | undefined;
    for (const points of flows) {
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1];
        const [bx, by] = points[i];
        const d = Math.hypot((ax + bx) / 2 - cx, (ay + by) / 2 - cy);
        if (d < best) {
          best = d;
          angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
        }
      }
    }
    return best < Math.max(width, height) * 0.35 ? angle : undefined;
  };
  const marker = inked && forced !== 'solid' && !style.flat;
  const prepared = (layer: string, list: Shape[]): Prepared[] => {
    const buildings = layer === 'buildings';
    if (!inked && !buildings) return list.map((shape) => ({ shape, angle: undefined, small: false, size: 0 }));
    const key = `${layer}|simple|${inked}`;
    let cached = simplifiedCache.get(scene)?.get(key);
    if (!cached) {
      const pieces = buildings || layer === 'bridges' || !inked ? list : list.flatMap(splitPieces);
      cached = pieces.map((shape): Prepared | null => {
        const size = buildings ? ringArea(shape[0]?.points ?? []) : 0;
        if (buildings && size < MIN_BUILDING_AREA) return null;
        if (buildings && size < SMALL_BUILDING_AREA) return { shape: [shape[0]], angle: undefined, small: true, size };
        if (!inked) return { shape, angle: undefined, small: false, size };
        const kept = buildings ? shape.filter((ring, k) => k === 0 || ringArea(ring.points) >= MIN_HOLE_AREA) : shape;
        const simple = simplifyShape(kept, buildings ? 1.9 : 0.8);
        return { shape: simple, angle: mainAngle(simple), small: false, size };
      });
      if (!simplifiedCache.has(scene)) simplifiedCache.set(scene, new Map());
      simplifiedCache.get(scene)!.set(key, cached);
    }
    return cached.map((c) => c ?? { shape: [] as Shape, angle: undefined, small: false, size: 0 });
  };

  type SmallBatch = { fill: string; pen: number; rings: Point[][] };
  const smallBatches = new Map<string, SmallBatch>();
  const smallFills = new Map<string, string>();
  const smallFill = (p: AreaPaint): string => {
    const known = smallFills.get(p.color);
    if (known) return known;
    const made = smallTone(p);
    smallFills.set(p.color, made);
    return made;
  };
  const smallTone = (p: AreaPaint): string => {
    const patterned = forced !== 'solid' && settings.fillWeight > 0 && (forced || (p.pattern && p.patternColor));
    if (!patterned) return p.color;
    const fill = patternFill(p, forced, settings.fillWeight);
    const strokes = fill.fillStyle === 'cross-hatch' ? 2 : fill.fillStyle === 'dots' ? 0.5 : 1;
    const cover = Math.min(0.6, Math.max(0.15, (strokes * 1.4 * (fill.fillWeight ?? 1)) / (fill.hachureGap ?? 4)));
    return mix(p.color, p.patternColor ?? mix(p.color, style.ink, 0.45), cover);
  };
  const drawSmall = (batch: SmallBatch) => {
    ctx.save();
    ctx.beginPath();
    for (const points of batch.rings) {
      const n = points.length;
      let turn = 0;
      for (let k = 0; k < n; k++) {
        const from = points[k];
        const to = points[k + 1 === n ? 0 : k + 1];
        turn += from[0] * to[1] - to[0] * from[1];
      }
      if (turn < 0) {
        ctx.moveTo(points[n - 1][0], points[n - 1][1]);
        for (let k = n - 2; k >= 0; k--) ctx.lineTo(points[k][0], points[k][1]);
      } else {
        ctx.moveTo(points[0][0], points[0][1]);
        for (let k = 1; k < n; k++) ctx.lineTo(points[k][0], points[k][1]);
      }
      ctx.closePath();
    }
    ctx.fillStyle = batch.fill;
    ctx.fill();
    if (batch.pen > 0) {
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = batch.pen;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  };
  const tinyFills = new Map<string, string>();
  const tinyFill = (fill: string): string => {
    let made = tinyFills.get(fill);
    if (!made) tinyFills.set(fill, (made = hasOutline ? mix(fill, style.ink, 0.25) : fill));
    return made;
  };
  const addSmall = (points: Point[], size: number, p: AreaPaint) => {
    const tiny = size < TINY_BUILDING_AREA;
    const fill = tiny ? tinyFill(smallFill(p)) : smallFill(p);
    const pen = hasOutline && !tiny ? Math.round(Math.max(0.8, outlineWidth * 1.3) * 75) / 100 : 0;
    const key = `${fill}|${pen}`;
    let batch = smallBatches.get(key);
    if (!batch || batch.rings.length >= SMALL_BATCH) {
      const made: SmallBatch = { fill, pen, rings: [] };
      smallBatches.set(key, made);
      steps.push(() => drawSmall(made));
      batch = made;
    }
    batch.rings.push(points);
  };

  const areas = (layer: string, list: Shape[], look: (i: number) => AreaPaint, parts?: Shape[]) => {
    const split = inked && parts !== undefined && parts.length > 0;
    const mode = inked ? 'inked' : 'plain';
    const baseKey = `${layer}|base|${hasOutline}|${roughness}|${mode}`;
    const shapes = prepared(layer, list);
    shapes.forEach(({ shape, angle, small, size }, i) => {
      if (!shape.length) return;
      const id = shape[0]?.key ?? i;
      if (small) {
        addSmall(shape[0].points, size, look(id));
        return;
      }
      sketched(() => {
        const p = look(id);
        const base = shaped(baseKey, i, shape, {
          ...wobble,
          roughness: 0.8 * roughness,
          seed: id + 1,
          stroke: hasOutline ? '#000' : 'none',
          disableMultiStroke: true,
          fill: '#000',
          fillStyle: 'solid',
        });
        const tilt = angle === undefined ? undefined : angle + ((id * 37) % 17) - 8;
        const [dx, dy] = inked ? fillOffset(id + layer.length * 101, roughness) : [0, 0];
        ctx.save();
        ctx.translate(dx, dy);
        if (marker) {
          const gap = layer === 'buildings' ? 2.6 : 3.4;
          const strokes = shaped(`${layer}|marker|${roughness}`, i, shape, {
            ...wobble,
            roughness: Math.min(1.6, 0.6 + 0.4 * roughness),
            seed: id + 11,
            stroke: 'none',
            fill: '#000',
            fillStyle: 'hachure',
            hachureGap: gap,
            fillWeight: gap * 1.45,
            hachureAngle: tilt === undefined ? -41 : hatchAngle(tilt + 30),
          });
          paint(onlyFill(base), { stroke: 'none', fill: fade(p.color, 0.45) });
          paint(strokes, { fill: fade(p.color, 0.6), fillWeight: gap * 1.45 });
        } else {
          paint(onlyFill(base), { stroke: 'none', fill: p.color });
        }
        const patterned = !split && forced !== 'solid' && settings.fillWeight > 0 && (forced || (p.pattern && p.patternColor));
        if (patterned) {
          const fill = patternFill(p, forced, settings.fillWeight);
          if (tilt !== undefined && fill.fillStyle !== 'dots') fill.hachureAngle = hatchAngle(tilt);
          const dotSize = fill.fillStyle === 'dots' ? fill.fillWeight : 0;
          const patternKey = `${layer}|${fill.fillStyle}|${tilt === undefined ? fill.hachureAngle : 'along'}|${fill.hachureGap}|${dotSize}|${roughness}`;
          const overlay = shaped(patternKey, i, shape, { ...wobble, ...fill, seed: id + 1, stroke: 'none', fill: '#000' });
          paint(overlay, { fill: p.patternColor ?? mix(p.color, style.ink, 0.45), fillWeight: fill.fillWeight });
        }
        ctx.restore();
        if (!hasOutline) return;
        const pen = layer === 'buildings' ? Math.max(0.8, outlineWidth * 1.3) : Math.max(1.1, outlineWidth * 1.9);
        if (inked) ink(base, pen, id + 7);
        else paint(onlyLines(base), { stroke: style.ink, strokeWidth: outlineWidth });
      });
    });
    if (!split) return;
    const p = look(0);
    if (forced === 'solid' || settings.fillWeight <= 0 || (!forced && (!p.pattern || !p.patternColor))) return;
    const [dx, dy] = fillOffset(layer.length * 101, roughness);
    parts.forEach((part, k) => {
      sketched(() => {
        const fill = patternFill(p, forced, settings.fillWeight);
        if (fill.fillStyle !== 'dots') fill.hachureAngle = hatchAngle((flowAngle(part) ?? mainAngle(part)) + ((k * 37) % 11) - 5);
        const overlay = shaped(`${layer}|parts|${fill.fillStyle}|${fill.hachureGap}|${roughness}`, k, part, { ...wobble, ...fill, seed: k + 1, stroke: 'none', fill: '#000' });
        ctx.save();
        ctx.translate(dx, dy);
        paint(overlay, { fill: p.patternColor ?? mix(p.color, style.ink, 0.45), fillWeight: fill.fillWeight });
        ctx.restore();
      });
    });
  };

  const lineKey = (layer: string) => `${layer}|line|${roughness}`;
  const line = (layer: string, shape: Shape, i: number) =>
    shaped(lineKey(layer), i, shape, {
      ...wobble,
      seed: (shape[0]?.key ?? i) + 1,
      stroke: '#000',
      disableMultiStroke: true,
      preserveVertices: true,
    });

  const relief = scene.terrain && !scene.land.length ? settings.terrain : 'none';
  const reliefInk = terrainInk(style);
  const showContours = relief === 'contours' || relief === 'both';
  const stops = style.bands;
  const banded = relief !== 'none' && stops?.length ? sceneBands(scene) : null;
  if (banded && stops) {
    steps.push(() => {
      ctx.save();
      ctx.fillStyle = bandColor(stops, banded.base + banded.interval / 2);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    });
    for (const { level, top, rings } of banded.bands) {
      steps.push(() => {
        ctx.save();
        ctx.beginPath();
        for (const ring of rings) {
          ctx.moveTo(ring[0][0], ring[0][1]);
          for (let k = 1; k < ring.length; k++) ctx.lineTo(ring[k][0], ring[k][1]);
          ctx.closePath();
        }
        ctx.fillStyle = bandColor(stops, (level + top) / 2);
        ctx.fill('evenodd');
        ctx.restore();
      });
    }
  }

  const icePaint: AreaPaint = style.ice ?? {
    color: mix(style.paper, '#ffffff', 0.5),
    pattern: 'lines',
    patternColor: mix(style.water.patternColor ?? style.water.color, style.paper, 0.35),
    gap: 7,
    weight: 0.6,
  };
  const rockPaint = style.rock;
  if (rockPaint) areas('rock', scene.rock, () => rockPaint);
  areas('sand', scene.sand, () => style.sand);
  areas('green', scene.green, () => style.park);
  areas('forest', scene.forest, () => style.wood);
  areas('ice', scene.ice, () => icePaint);
  areas('water', scene.water, () => style.water, scene.waterParts);

  if (relief === 'hachures' || relief === 'both') {
    const buckets = new Map<number, Hachure[]>();
    for (const stroke of sceneHachures(scene)) {
      const weight = Math.round(stroke.weight * 4) / 4;
      const list = buckets.get(weight);
      if (list) list.push(stroke);
      else buckets.set(weight, [stroke]);
    }
    const thinner = relief === 'both' ? 0.7 : 1;
    for (const [weight, list] of buckets) {
      steps.push(() => {
        ctx.save();
        ctx.strokeStyle = reliefInk;
        ctx.lineWidth = weight * thinner;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const { from, to } of list) {
          ctx.moveTo(from[0], from[1]);
          ctx.lineTo(to[0], to[1]);
        }
        ctx.stroke();
        ctx.restore();
      });
    }
  }
  if (showContours) {
    sceneContours(scene).forEach((contour, i) => {
      sketched(() =>
        paint(line('contour', [{ points: contour.points, closed: contour.closed }], i), {
          stroke: reliefInk,
          strokeWidth: contour.major ? 1.1 : 0.55,
        }),
      );
    });
  }

  const targets = highlightShapes(scene);
  const highlight = (index: number, color: string, k: number) => {
    const shape = targets[index];
    sketched(() => {
      const body = shaped(`highlight|${scene.land.length ? 'land' : 'building'}|${roughness}`, index, shape, {
        ...wobble,
        roughness: 0.8 * roughness,
        seed: index + 1,
        stroke: '#000',
        disableMultiStroke: true,
        fill: '#000',
        fillStyle: 'solid',
      });
      const [dx, dy] = inked ? fillOffset(index + 977, roughness) : [0, 0];
      ctx.save();
      ctx.translate(dx, dy);
      paint(onlyFill(body), { stroke: 'none', fill: color });
      const hatch = shaped(`highlight-hatch|${scene.land.length ? 'land' : 'building'}|${roughness}`, index, shape, {
        ...wobble,
        seed: index + 5,
        stroke: 'none',
        fill: '#000',
        fillStyle: 'hachure',
        hachureGap: 3.2,
        hachureAngle: inked ? hatchAngle(mainAngle(shape) + 30) : -41,
      });
      paint(hatch, { fill: mix(color, style.ink, 0.35), fillWeight: 0.9 });
      ctx.restore();
      const pen = scene.land.length ? Math.max(1.8, outlineWidth * 2.2) : Math.max(2.2, outlineWidth * 2.6);
      if (inked) ink(body, pen, index + k + 7);
      else paint(onlyLines(body), { stroke: style.ink, strokeWidth: pen * 0.8 });
    });
  };
  const highlightAll = () => {
    if (scene.focus >= 0) highlight(scene.focus, focusColor(style), 0);
    scene.highlights.forEach(({ point, color }, k) => {
      const index = buildingAt(scene, point);
      if (index >= 0) highlight(index, color, k + 1);
    });
  };
  const countryMode = scene.land.length > 0;
  if (countryMode) {
    scene.land.forEach((shape, i) => {
      sketched(() => {
        const base = shaped(`land|${roughness}`, i, shape, {
          ...wobble,
          roughness: 0.8 * roughness,
          seed: i + 1,
          stroke: '#000',
          disableMultiStroke: true,
          fill: '#000',
          fillStyle: 'solid',
        });
        paint(onlyFill(base), { stroke: 'none', fill: style.paper });
        if (!hasOutline) return;
        const pen = Math.max(1, outlineWidth * 1.5);
        if (inked) ink(base, pen, i + 7);
        else paint(onlyLines(base), { stroke: style.ink, strokeWidth: outlineWidth });
      });
    });
    highlightAll();
    const ring = focusColor(style);
    scene.islets.forEach(([x, y], i) => {
      steps.push(() => {
        rc.circle(x, y, 15, { ...decor, seed: i + 301, stroke: style.ink, strokeWidth: 1.2 });
        rc.circle(x, y, 5, { ...decor, seed: i + 401, stroke: style.ink, strokeWidth: 0.8, fill: ring, fillStyle: 'solid' });
      });
    });
    areas('lakes', scene.lakes, () => style.water);
    const riverInk = style.water.patternColor ?? mix(style.water.color, style.ink, 0.45);
    scene.rivers.forEach(({ shape, rank }, i) => {
      const width = Math.max(0.7, 2.4 - rank * 0.22) * Math.max(0.4, settings.innerStrokeWidth);
      sketched(() => paint(line('river', shape, i), { stroke: riverInk, strokeWidth: width }));
    });
    scene.towns.forEach(({ point: [x, y], capital }, i) => {
      steps.push(() => {
        const dot = { ...decor, seed: i + 41, stroke: text, strokeWidth: 1.3 };
        if (capital) {
          rc.circle(x, y, 13, { ...dot, fill: style.paper, fillStyle: 'solid' });
          rc.circle(x, y, 5, { ...dot, fill: text, fillStyle: 'solid' });
        } else {
          rc.circle(x, y, 7, { ...dot, fill: text, fillStyle: 'solid' });
        }
      });
    });
  }

  if (!doodleCache.has(scene)) doodleCache.set(scene, new Map());
  const doodles = doodleCache.get(scene)!;
  const doodled = (key: string, i: number, make: () => Doodle[]): Doodle[] => {
    let list = doodles.get(key);
    if (!list) doodles.set(key, (list = []));
    return (list[i] ??= make());
  };
  const paintDoodle = (items: Doodle[], fill: string, stroke: string) => {
    for (const { drawable, role } of items) {
      if (role === 'badge') paint(drawable, { stroke, strokeWidth: 1, fill: style.paper });
      else if (role === 'canopy') paint(drawable, { stroke, strokeWidth: 0.6, fill, fillWeight: 0.8 });
      else paint(drawable, { stroke, strokeWidth: 1.1, fill });
    }
  };

  if (settings.doodles) {
    if (!treeCache.has(scene)) {
      const rings = (list: Shape[]) => list.map((shape) => shape.map((l) => l.points));
      const water = rings(scene.water);
      const size: [number, number] = [width, height];
      const green = treeSpots(rings(scene.green), 24, 7, size, 900, water);
      const forest = treeSpots(rings(scene.forest), 16, 11, size, 900 - green.length, water);
      treeCache.set(scene, { green, forest });
    }
    const cached = treeCache.get(scene)!;
    const trees = style.trees ?? 'all';
    const spots = { green: trees === 'all' ? cached.green : [], forest: trees === 'none' ? [] : cached.forest };
    const treeColor = (paint: AreaPaint) => paint.patternColor ?? mix(paint.color, style.ink, 0.45);
    for (const [kind, list, colour] of [
      ['green', spots.green, treeColor(style.park)],
      ['forest', spots.forest, treeColor(style.wood)],
    ] as const) {
      list.forEach((spot, i) => {
        steps.push(() => {
          const size = 8 + ((i * 7) % 5);
          paintDoodle(doodled(`tree|${kind}|${roughness}`, i, () => tree(spot, size, i + 1, wobble)), colour, style.ink);
        });
      });
    }
  }

  areas('buildings', scene.buildings, (i) => ({
    ...style.buildingPattern,
    color: style.buildings[i % style.buildings.length],
  }));
  if (!scene.land.length) highlightAll();

  areas('bridges', scene.bridges, () => ({ color: style.paper }));

  const inner = settings.innerStrokeWidth;
  if (inner > 0) {
    scene.railways.forEach((shape, i) => {
      sketched(() =>
        paint(line('rail', shape, i), { stroke: style.rail, strokeWidth: 1.5 * inner, strokeLineDash: [8, 4] }),
      );
    });
  }

  const road = style.road;
  const blank = !scene.buildings.length && road.edgeRatio <= 0 && !road.colors && road.fill.toLowerCase() === style.paper.toLowerCase();
  const roadFill = blank ? mix(style.ink, style.paper, 0.3) : null;
  const scale = 2 ** (scene.zoom - 16);
  const roadWidth = (kind: string) =>
    kind === 'path' && road.trail
      ? Math.max(road.trail, ROAD_WIDTHS.path * scale) * inner
      : Math.max(0.6, (ROAD_WIDTHS[kind] ?? 1) * scale) * inner * (road.scale ?? 1);
  const trailDash = road.trail ? [road.trail * 3.5, road.trail * 2.2] : [4, 3];
  const roads = scene.roads
    .filter(() => inner > 0)
    .map((r, i) => ({ ...r, i, width: roadWidth(r.kind) }))
    .sort((a, b) => a.width - b.width);

  for (const r of roads) {
    if (r.kind === 'path') {
      sketched(() =>
        paint(line('road', r.shape, r.i), { stroke: road.path, strokeWidth: r.width, strokeLineDash: trailDash }),
      );
    } else if (road.edgeRatio > 0) {
      sketched(() =>
        paint(line('road', r.shape, r.i), { stroke: road.edge, strokeWidth: r.width * (1 + 2 * road.edgeRatio) }),
      );
    }
  }
  for (const r of roads) {
    if (r.kind === 'path') continue;
    sketched(() =>
      paint(line('road', r.shape, r.i), {
        stroke: roadFill ?? road.colors?.[r.kind] ?? road.fill,
        strokeWidth: r.width,
        strokeLineDash: road.dash,
      }),
    );
  }

  const gridInk = style.kmGrid;
  const kmGrid = gridInk && scene.kmGrid && !scene.land.length ? scene.kmGrid : null;
  kmGrid?.lines.forEach(({ from, to }, i) => {
    steps.push(() =>
      rc.line(from[0], from[1], to[0], to[1], {
        ...decor,
        roughness: 0.5,
        bowing: 0.3,
        seed: i + 701,
        stroke: gridInk,
        strokeWidth: 0.8,
        disableMultiStroke: true,
      }),
    );
  });

  const liftInk = style.lift ?? style.ink;
  scene.lifts.forEach((shape, i) => {
    sketched(() => paint(line('lift', shape, i), { stroke: liftInk, strokeWidth: 1.2 }));
    steps.push(() => {
      shape.flatMap((l) => pylons(l.points, 26)).forEach(([x, y], k) => {
        rc.circle(x, y, 4, { ...decor, seed: i * 31 + k + 901, stroke: liftInk, strokeWidth: 0.8, fill: liftInk, fillStyle: 'solid' });
      });
    });
  });

  const grid = style.grid;
  if (grid) {
    steps.push(() => {
      const cell = Math.max(10, Math.round(Math.min(width, height) / 30));
      const rule = (every: number, alpha: number, weight: number) => {
        ctx.save();
        ctx.strokeStyle = fade(grid, alpha);
        ctx.lineWidth = weight;
        ctx.beginPath();
        for (let x = 0; x <= width; x += cell * every) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += cell * every) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
        ctx.restore();
      };
      rule(1, 0.6, 0.7);
      rule(5, 0.9, 1.1);
    });
  }

  let helpers: Promise<void> | null = null;
  if (part !== 'frame') {
    planning = true;
    try {
      for (const step of shapeSteps) step();
    } finally {
      planning = false;
    }
    if (wanted.length >= HELPER_MIN) {
      const sent = performance.now();
      helpers = makeShapes(
        wanted.map(({ shape, options }) => ({ lines: shape, options })),
        (index, drawable) => {
          const { key, i, shape } = wanted[index];
          cache.get(key)![i] = drawable;
          remember(key, shape, drawable);
          helped++;
        },
      ).then(() => {
        helperTime = performance.now() - sent;
      });
    }
  }

  const title =
    settings.poster && scene.title.trim()
      ? { title: scene.title.trim(), layout: settings.titleLayout, font: settings.titleFont, border: settings.border, coordsFont: settings.coordsFont }
      : null;
  const trim = scene.trim ?? 0;
  const sheetW = width - trim * 2;
  const sheetH = height - trim * 2;
  const sheet = posterLayout(sheetW, sheetH, settings.border, title);
  const moveRect = (r: Rect): Rect => ({ x0: r.x0 + trim, y0: r.y0 + trim, x1: r.x1 + trim, y1: r.y1 + trim });
  const layout = {
    ...sheet,
    inner: moveRect(sheet.inner),
    map: moveRect(sheet.map),
    reserved: sheet.reserved.map(([a, b, c, d]): [number, number, number, number] => [a + trim, b + trim, c + trim, d + trim]),
  };
  const area = layout.map;
  const onSheet = (draw: () => void) => () => {
    ctx.save();
    ctx.translate(trim, trim);
    draw();
    ctx.restore();
  };
  const colors = { paper: style.paper, ink: text };
  const pins = scene.pins.filter(
    ({ point: [x, y] }) => x > area.x0 && y > area.y0 && x < area.x1 && y < area.y1,
  );
  const credit = [area.x1 - 10, area.y1 - 7] as const;

  await loadPinFonts(pins, scene.center);
  if (cancelled()) return false;
  const placer = new Placer(width, height);
  placer.add(layout.reserved);
  if (trim) {
    placer.add([
      [0, 0, width, trim + 4],
      [0, height - trim - 4, width, height],
      [0, 0, trim + 4, height],
      [width - trim - 4, 0, width, height],
    ]);
  }
  const creditLines = [
    '© OpenStreetMap contributors',
    ...(relief === 'none' ? [] : [TERRAIN_CREDIT]),
    ...(kmGrid ? [gridNote(kmGrid)] : []),
  ];
  placer.add([[credit[0] - (creditLines.length > 1 ? 215 : 175), credit[1] - 16 * creditLines.length, credit[0], credit[1]]]);
  if (settings.compass) placer.add(furnitureBoxes(sheetW, sheetH, area, scene.bearing));
  const profile = settings.profile && !scene.land.length ? scene.profile : null;
  const profileArea = profile ? profileBox(area, settings.compass) : null;
  if (profileArea) placer.add([profileArea]);
  placer.add(pinBoxes(ctx, pins, scene.center, area.x1));
  placer.add(scene.towns.map(({ point: [x, y] }) => [x - 7, y - 7, x + 7, y + 7] as [number, number, number, number]));

  if (kmGrid && gridInk && part !== 'frame') {
    const gridFont = `700 11px "${settings.labelFont}", "Gaegu", sans-serif`;
    ctx.save();
    ctx.font = gridFont;
    for (const { from, to, value, axis } of kmGrid.lines) {
      const east = axis === 'east';
      const span = east ? to[1] - from[1] : to[0] - from[0];
      if (!span) continue;
      const fixedAt = east ? area.y0 + 13 : area.x0 + 14;
      const t = (fixedAt - (east ? from[1] : from[0])) / span;
      const at: Point = east ? [from[0] + t * (to[0] - from[0]), fixedAt] : [fixedAt, from[1] + t * (to[1] - from[1])];
      if (at[0] < area.x0 + 8 || at[0] > area.x1 - 8 || at[1] < area.y0 + 6 || at[1] > area.y1 - 8) continue;
      const label = gridNumber(value);
      const half = ctx.measureText(label).width / 2 + 2;
      if (!placer.tryAdd([[at[0] - half, at[1] - 7, at[0] + half, at[1] + 7]])) continue;
      steps.push(() => {
        ctx.save();
        ctx.font = gridFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = style.paper;
        ctx.fillStyle = gridInk;
        ctx.strokeText(label, at[0], at[1]);
        ctx.fillText(label, at[0], at[1]);
        ctx.restore();
      });
    }
    ctx.restore();
  }

  scene.routes.forEach((route, i) => steps.push(() => drawRoute(rc, route, i, colors, decor)));

  if (part !== 'frame' && (settings.labels || settings.doodles)) {
    if (settings.labels) {
      await loadLabelFonts(scene, settings.labelFont);
      if (cancelled()) return false;
    }
    const contourLabels = showContours
      ? sceneContours(scene)
          .filter((c) => c.major)
          .map((c): Label => ({ name: String(c.height), kind: 'contour', points: c.points }))
      : [];
    const labels = settings.labels ? layoutLabels(ctx, scene, placer, settings.labelScale, settings.labelFont, contourLabels) : [];

    if (settings.doodles) {
      const r = ICON_RADIUS + 1;
      const kept: Point[] = [];
      const shown = scene.pois
        .map((poi, i) => ({ poi, i }))
        .filter(({ poi: { point: [x, y] } }) => {
          if (kept.length >= MAX_ICONS) return false;
          if (kept.some(([kx, ky]) => Math.hypot(kx - x, ky - y) < ICON_SPACING * 2)) return false;
          if (!placer.tryAdd([[x - r, y - r, x + r, y + r]])) return false;
          kept.push([x, y]);
          return true;
        });
      for (const { poi, i } of shown) {
        steps.push(() =>
          paintDoodle(doodled(`icon|${roughness}`, i, () => icon(poi.icon, poi.point, i + 1, wobble)), text, text),
        );
      }
    }

    const waterInk = style.water.patternColor ? mix(style.water.patternColor, text, 0.35) : text;
    labels.forEach((label, i) => {
      const mark = label.mark;
      if (!mark) return;
      steps.push(() => {
        const [x, y] = mark.point;
        const pen = { ...decor, seed: i + 501, stroke: text, strokeWidth: 1.2 };
        if (mark.kind === 'saddle') {
          rc.arc(x - 4.5, y, 7, 13, -Math.PI / 2, Math.PI / 2, false, pen);
          rc.arc(x + 4.5, y, 7, 13, Math.PI / 2, (Math.PI * 3) / 2, false, pen);
        } else {
          rc.polygon([[x, y - 6], [x + 6.5, y + 4.5], [x - 6.5, y + 4.5]], { ...pen, fill: text, fillStyle: 'solid' });
        }
      });
    });
    const labelInk = (role: string) => (role === 'water' ? waterInk : role === 'terrain' ? reliefInk : text);
    for (const label of labels) {
      steps.push(() =>
        drawLabel(ctx, label, labelInk(label.role), style.paper, settings.wobblyLabels ? Math.min(1.8, 0.7 + roughness * 0.4) : 0),
      );
    }
  }

  await loadMapFont(settings.labelFont);
  if (cancelled()) return false;
  if (settings.compass) {
    fixed(() => drawCompass(ctx, rc, sheetW, sheetH, area, colors, decor, scene.bearing, settings.labelFont));
    fixed(() => drawScaleBar(ctx, rc, area, scene.zoom, scene.center[1], colors, decor, settings.labelFont));
  }

  if (profile && profileArea) fixed(() => drawProfile(ctx, rc, profile, profileArea, colors, decor, settings.labelFont));

  pins.forEach((pin, i) => steps.push(() => drawPin(ctx, rc, pin, i, scene.center, area.x1, colors, decor)));

  if (trim) {
    fixed(() => {
      const map = sheet.map;
      ctx.save();
      ctx.fillStyle = style.paper;
      if (settings.border || map.y0 > 0) ctx.fillRect(0, 0, width, trim);
      if (settings.border || map.y1 < sheetH) ctx.fillRect(0, height - trim, width, trim);
      if (settings.border || map.x0 > 0) ctx.fillRect(0, 0, trim, height);
      if (settings.border || map.x1 < sheetW) ctx.fillRect(width - trim, 0, trim, height);
      if (sheet.band) {
        const top = sheet.band.y0 + trim;
        const tall = sheet.band.y1 - sheet.band.y0;
        ctx.fillRect(0, top, trim, tall);
        ctx.fillRect(width - trim, top, trim, tall);
      }
      ctx.restore();
    });
  }

  fixed(onSheet(() => drawBorder(ctx, rc, sheetW, sheetH, sheet, colors, decor)));

  if (title) {
    await loadTitleFont(title, scene.center);
    if (cancelled()) return false;
    fixed(onSheet(() => drawPosterTitle(ctx, rc, title, scene.center, sheet, colors, decor, settings.coords)));
  }


  fixed(onSheet(() => rc.rectangle(2, 2, sheetW - 4, sheetH - 4, { ...decor, stroke: text, strokeWidth: 2, seed: 1 })));
  if (trim && !output) {
    fixed(() => {
      ctx.save();
      ctx.strokeStyle = fade(text, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(trim, trim, sheetW, sheetH);
      ctx.restore();
    });
  }
  fixed(() => {
    const note = creditLines[0];
    const family = `"${settings.labelFont}", "Gaegu", sans-serif`;
    ctx.save();
    ctx.font = `13px ${family}`;
    const size = Math.min(13, (13 * CREDIT_WIDTH) / ctx.measureText(note).width);
    ctx.font = `${Math.round(size * 10) / 10}px ${family}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.paper;
    ctx.fillStyle = text;
    creditLines.forEach((line, k) => {
      const at = [credit[0], credit[1] - size * 1.25 * k] as const;
      ctx.strokeText(line, ...at);
      ctx.fillText(line, ...at);
    });
    ctx.restore();
  });

  if (helpers) {
    await helpers;
    if (cancelled()) return false;
  }

  const todo = part === 'frame' ? steps.filter((step) => fixedSteps.has(step)) : steps;
  const looping = performance.now();
  let working = 0;
  let i = 0;
  while (i < todo.length) {
    const from = performance.now();
    const until = from + 12;
    while (i < todo.length && performance.now() < until) todo[i++]();
    working += performance.now() - from;
    if (i < todo.length) {
      await pause();
      if (cancelled()) return false;
    }
  }
  if (DEV && part !== 'frame') {
    const ended = performance.now();
    console.info(
      `[sketch] ${output ? 'export' : 'preview'} took ${ms(ended - started)}: ` +
        `setup ${ms(looping - started)}, helpers ${ms(helperTime)} (${helped} shapes), ` +
        `shapes here ${ms(shapeTime)} (${made} made, ${reused} reused), ` +
        `painting ${ms(working - shapeTime)}, waiting ${ms(ended - looping - working)}`,
    );
  }
  return true;
}
