import rough from 'roughjs';
import { union, type Geom } from 'polyclip-ts';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { Map as MapLibreMap, GeoJSONFeature } from 'maplibre-gl';
import type { Geometry, Polygon, Position } from 'geojson';
import type { MapFeatures } from './features';
import type { AreaPaint, StyleSpec } from './styles';

type Point = [number, number];
type Line = { points: Point[]; closed: boolean };
type Shape = Line[];
type Road = { shape: Shape; kind: string };

export type Scene = {
  width: number;
  height: number;
  zoom: number;
  water: Shape[];
  green: Shape[];
  forest: Shape[];
  sand: Shape[];
  buildings: Shape[];
  bridges: Shape[];
  roads: Road[];
  railways: Shape[];
};

const MIN_GREEN_AREA = 60;
const ROAD_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'path'];
const PATH_KINDS = ['path', 'track', 'ferry'];
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

function toShape(map: MapLibreMap, geometry: Geometry, minArea = 0): Shape {
  const project = (coords: Position[]): Point[] =>
    coords.map((p) => {
      const { x, y } = map.project([p[0], p[1]]);
      return [x, y];
    });

  const polygon = (rings: Position[][]): Line[] => {
    const lines = rings.map((ring) => ({ points: project(ring), closed: true }));
    return area(lines[0].points) < minArea ? [] : lines;
  };

  switch (geometry.type) {
    case 'LineString':
      return [{ points: project(geometry.coordinates), closed: false }];
    case 'MultiLineString':
      return geometry.coordinates.map((c) => ({ points: project(c), closed: false }));
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return geometry.coordinates.flatMap(polygon);
    default:
      return [];
  }
}

function mergeAreas(list: GeoJSONFeature[]): Geometry[] {
  const shapes = list
    .map((f) => f.geometry)
    .filter((g) => g.type === 'Polygon' || g.type === 'MultiPolygon')
    .map((g) => g.coordinates as Geom);
  if (shapes.length < 2) return list.map((f) => f.geometry);
  try {
    return [{ type: 'MultiPolygon', coordinates: union(shapes[0], ...shapes.slice(1)) }];
  } catch {
    return list.map((f) => f.geometry);
  }
}

function splitPolygons(list: GeoJSONFeature[]): Polygon[] {
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

export function prepareScene(map: MapLibreMap, features: MapFeatures): Scene {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const shapes = (geometries: Geometry[], minArea = 0) =>
    geometries.map((g) => toShape(map, g, minArea)).filter((s) => s.length > 0);
  const geometries = (list: GeoJSONFeature[]) => list.map((f) => f.geometry);

  return {
    width,
    height,
    zoom: map.getZoom(),
    water: shapes(mergeAreas(features.water)),
    green: shapes(mergeAreas(features.green), MIN_GREEN_AREA),
    forest: shapes(mergeAreas(features.forest), MIN_GREEN_AREA),
    sand: shapes(mergeAreas(features.sand)),
    buildings: shapes(splitPolygons(features.buildings)),
    bridges: shapes(geometries(features.bridges)),
    roads: features.roads.map((f) => ({
      shape: toShape(map, f.geometry),
      kind: roadKind(String(f.properties.class)),
    })),
    railways: shapes(geometries(features.railways)),
  };
}

function toPath(shape: Shape): string {
  return shape
    .map(({ points, closed }) => {
      const d = points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
      return 'M' + d + (closed ? 'Z' : '');
    })
    .join('');
}

function patternFill(paint: AreaPaint): Options {
  const gap = paint.gap ?? 5;
  const weight = paint.weight ?? 0.8;
  switch (paint.pattern) {
    case 'cross':
      return { fillStyle: 'cross-hatch', hachureGap: gap, fillWeight: weight };
    case 'lines':
      return { fillStyle: 'hachure', hachureGap: gap, fillWeight: weight, hachureAngle: 0 };
    case 'dots':
      return { fillStyle: 'dots', hachureGap: gap, fillWeight: weight };
    case 'waves':
      return { fillStyle: 'zigzag-line', hachureGap: gap, fillWeight: weight, zigzagOffset: gap / 2 };
    default:
      return { fillStyle: 'hachure', hachureGap: gap, fillWeight: weight };
  }
}

type Step = () => void;

const generator = rough.generator();
const shapeCache = new WeakMap<Scene, Map<string, Drawable[]>>();
let currentJob = 0;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function drawSketch(
  canvas: HTMLCanvasElement,
  scene: Scene,
  style: StyleSpec,
  roughness = 1,
): Promise<void> {
  const job = ++currentJob;
  const { width, height } = scene;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = style.paper;
  ctx.fillRect(0, 0, width, height);

  if (!shapeCache.has(scene)) shapeCache.set(scene, new Map());
  const cache = shapeCache.get(scene)!;
  const shaped = (key: string, i: number, make: () => Drawable): Drawable => {
    let list = cache.get(key);
    if (!list) cache.set(key, (list = []));
    return (list[i] ??= make());
  };
  const paint = (drawable: Drawable, options: Options) =>
    rc.draw({ ...drawable, options: { ...drawable.options, ...options } });

  const wobble = { roughness, bowing: roughness };
  const hasOutline = style.outline > 0;
  const steps: Step[] = [];

  const areas = (layer: string, list: Shape[], look: (i: number) => AreaPaint) => {
    const baseKey = `${layer}|base|${hasOutline}|${roughness}`;
    list.forEach((shape, i) => {
      steps.push(() => {
        const p = look(i);
        const base = shaped(baseKey, i, () =>
          generator.path(toPath(shape), {
            ...wobble,
            roughness: 0.8 * roughness,
            seed: i + 1,
            stroke: hasOutline ? '#000' : 'none',
            disableMultiStroke: true,
            fill: '#000',
            fillStyle: 'solid',
          }),
        );
        paint(base, { stroke: hasOutline ? style.ink : 'none', strokeWidth: style.outline, fill: p.color });
        if (!p.pattern || !p.patternColor) return;
        const fill = patternFill(p);
        const patternKey = `${layer}|${fill.fillStyle}|${fill.hachureGap}|${fill.fillWeight}|${roughness}`;
        const overlay = shaped(patternKey, i, () =>
          generator.path(toPath(shape), { ...wobble, ...fill, seed: i + 1, stroke: 'none', fill: '#000' }),
        );
        paint(overlay, { fill: p.patternColor });
      });
    });
  };

  const lineKey = (layer: string) => `${layer}|line|${roughness}`;
  const line = (layer: string, shape: Shape, i: number) =>
    shaped(lineKey(layer), i, () =>
      generator.path(toPath(shape), {
        ...wobble,
        seed: i + 1,
        stroke: '#000',
        disableMultiStroke: true,
        preserveVertices: true,
      }),
    );

  areas('sand', scene.sand, () => style.sand);
  areas('green', scene.green, () => style.park);
  areas('forest', scene.forest, () => style.wood);
  areas('water', scene.water, () => style.water);
  areas('buildings', scene.buildings, (i) => ({
    ...style.buildingPattern,
    color: style.buildings[i % style.buildings.length],
  }));
  areas('bridges', scene.bridges, () => ({ color: style.paper }));

  scene.railways.forEach((shape, i) => {
    steps.push(() => paint(line('rail', shape, i), { stroke: style.rail, strokeWidth: 1.5, strokeLineDash: [8, 4] }));
  });

  const road = style.road;
  const scale = 2 ** (scene.zoom - 16);
  const roadWidth = (kind: string) => Math.max(0.6, (ROAD_WIDTHS[kind] ?? 1) * scale);
  const roads = scene.roads
    .map((r, i) => ({ ...r, i, width: roadWidth(r.kind) }))
    .sort((a, b) => a.width - b.width);

  for (const r of roads) {
    if (r.kind === 'path') {
      steps.push(() =>
        paint(line('road', r.shape, r.i), { stroke: road.path, strokeWidth: r.width, strokeLineDash: [4, 3] }),
      );
    } else if (road.edgeRatio > 0) {
      steps.push(() =>
        paint(line('road', r.shape, r.i), { stroke: road.edge, strokeWidth: r.width * (1 + 2 * road.edgeRatio) }),
      );
    }
  }
  for (const r of roads) {
    if (r.kind === 'path') continue;
    steps.push(() =>
      paint(line('road', r.shape, r.i), { stroke: road.colors?.[r.kind] ?? road.fill, strokeWidth: r.width }),
    );
  }

  steps.push(() =>
    rc.rectangle(2, 2, width - 4, height - 4, { ...wobble, stroke: style.ink, strokeWidth: 2, seed: 1 }),
  );

  let i = 0;
  while (i < steps.length) {
    const until = performance.now() + 12;
    while (i < steps.length && performance.now() < until) steps[i++]();
    if (i < steps.length) {
      await nextFrame();
      if (job !== currentJob) return;
    }
  }
}
