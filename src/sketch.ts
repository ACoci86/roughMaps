import rough from 'roughjs';
import { union, type Geom } from 'polyclip-ts';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { Map as MapLibreMap, GeoJSONFeature } from 'maplibre-gl';
import type { Geometry, Polygon, Position } from 'geojson';
import { POI_ICONS, type MapFeatures } from './features';
import type { AreaPaint, StyleSpec } from './styles';
import { Placer, layoutLabels, drawLabel, loadLabelFonts } from './labels';
import { treeSpots, tree, icon, ICON_RADIUS, type Doodle } from './doodles';
import { drawPosterTitle, drawBorder, loadTitleFont, posterLayout, type TitleLayout } from './poster';
import { drawCompass, drawScaleBar, furnitureBoxes } from './furniture';
import { drawPin, loadPinFonts, pinBoxes, type PlacedPin } from './pins';
import { drawRoute, type PlacedRoute } from './routes';

export type Point = [number, number];
type Line = { points: Point[]; closed: boolean };
type Shape = Line[];
type Road = { shape: Shape; kind: string };
export type Label = { name: string; kind: string; points: Point[] };
export type Poi = { name: string; icon: string; rank: number; point: Point };

export type Scene = {
  width: number;
  height: number;
  zoom: number;
  center: [number, number];
  title: string;
  pins: PlacedPin[];
  routes: PlacedRoute[];
  water: Shape[];
  green: Shape[];
  forest: Shape[];
  sand: Shape[];
  buildings: Shape[];
  bridges: Shape[];
  roads: Road[];
  railways: Shape[];
  streetNames: Label[];
  places: Label[];
  waterNames: Label[];
  pois: Poi[];
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

  return {
    width,
    height,
    zoom: map.getZoom(),
    center: map.getCenter().toArray() as [number, number],
    title,
    pins: [],
    routes: [],
    water: shapes(mergeAreas(features.water)),
    green: shapes(mergeAreas(features.green), MIN_GREEN_AREA),
    forest: shapes(mergeAreas(features.forest), MIN_GREEN_AREA),
    sand: shapes(mergeAreas(features.sand)),
    buildings: shapes(splitPolygons(features.buildings)),
    bridges: shapes(geometries(features.bridges)),
    roads: features.roads
      .map((f) => ({ shape: toShape(map, f.geometry), kind: roadKind(String(f.properties.class)) }))
      .filter((r) => onScreen(r.shape)),
    railways: shapes(geometries(features.railways)),
    ...prepareNames(map, features, width, height),
  };
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
      const icon = POI_ICONS[String(f.properties.class)] ?? 'star';
      return [{ name: name(f), icon, rank: Number(f.properties.rank ?? 99), point }];
    })
    .sort((a, b) => a.rank - b.rank);

  return {
    streetNames: lines(features.streetNames).filter((l) => l.name),
    places: points(features.places),
    waterNames: [
      ...points(features.waterNames.filter((f) => f.geometry.type === 'Point')),
      ...lines(features.waterNames.filter((f) => f.geometry.type !== 'Point')),
    ],
    pois,
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
  labelScale: number;
  titleFont: string;
  titleLayout: TitleLayout;
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
  labelScale: 1,
  titleFont: 'Gaegu',
  titleLayout: 'bottom',
};

function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

function patternFill(paint: AreaPaint, forced: string | null, weightScale: number): Options {
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
    default:
      return { fillStyle: 'hachure', hachureGap: gap, fillWeight: weight };
  }
}

type Step = () => void;

const generator = rough.generator();
const shapeCache = new WeakMap<Scene, Map<string, Drawable[]>>();
const doodleCache = new WeakMap<Scene, Map<string, Doodle[][]>>();
const treeCache = new WeakMap<Scene, { green: Point[]; forest: Point[] }>();
const MAX_ICONS = 40;
const ICON_SPACING = 34;
let currentJob = 0;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function drawSketch(
  canvas: HTMLCanvasElement,
  scene: Scene,
  style: StyleSpec,
  settings: SketchSettings = DEFAULT_SETTINGS,
  output?: { width: number; height: number },
): Promise<void> {
  const job = output ? null : ++currentJob;
  const cancelled = () => job !== null && job !== currentJob;
  const { roughness } = settings;
  const { width, height } = scene;
  const ratio = output ? Math.min(output.width / width, output.height / height) : window.devicePixelRatio || 1;
  canvas.width = output ? output.width : Math.round(width * ratio);
  canvas.height = output ? output.height : Math.round(height * ratio);

  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = style.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

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
  const text = style.text ?? style.ink;
  const outlineWidth = style.outline * settings.strokeWidth;
  const hasOutline = outlineWidth > 0;
  const forced = settings.fillStyle === 'default' ? null : settings.fillStyle;
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
        paint(base, { stroke: hasOutline ? style.ink : 'none', strokeWidth: outlineWidth, fill: p.color });
        if (forced === 'solid' || settings.fillWeight <= 0) return;
        if (!forced && (!p.pattern || !p.patternColor)) return;
        const fill = patternFill(p, forced, settings.fillWeight);
        const dotSize = fill.fillStyle === 'dots' ? fill.fillWeight : 0;
        const patternKey = `${layer}|${fill.fillStyle}|${fill.hachureAngle}|${fill.hachureGap}|${dotSize}|${roughness}`;
        const overlay = shaped(patternKey, i, () =>
          generator.path(toPath(shape), { ...wobble, ...fill, seed: i + 1, stroke: 'none', fill: '#000' }),
        );
        paint(overlay, { fill: p.patternColor ?? mix(p.color, style.ink, 0.45), fillWeight: fill.fillWeight });
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
    const spots = treeCache.get(scene)!;
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
  areas('bridges', scene.bridges, () => ({ color: style.paper }));

  const inner = settings.innerStrokeWidth;
  if (inner > 0) {
    scene.railways.forEach((shape, i) => {
      steps.push(() =>
        paint(line('rail', shape, i), { stroke: style.rail, strokeWidth: 1.5 * inner, strokeLineDash: [8, 4] }),
      );
    });
  }

  const road = style.road;
  const scale = 2 ** (scene.zoom - 16);
  const roadWidth = (kind: string) => Math.max(0.6, (ROAD_WIDTHS[kind] ?? 1) * scale) * inner;
  const roads = scene.roads
    .filter(() => inner > 0)
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

  const title =
    settings.poster && scene.title.trim()
      ? { title: scene.title.trim(), layout: settings.titleLayout, font: settings.titleFont, border: settings.border }
      : null;
  const layout = posterLayout(width, height, settings.border, title);
  const area = layout.map;
  const colors = { paper: style.paper, ink: text };
  const pins = scene.pins.filter(
    ({ point: [x, y] }) => x > area.x0 && y > area.y0 && x < area.x1 && y < area.y1,
  );
  const credit = [area.x1 - 10, area.y1 - 7] as const;

  await loadPinFonts(pins, scene.center);
  if (cancelled()) return;
  const placer = new Placer(width, height);
  placer.add(layout.reserved);
  placer.add([[credit[0] - 175, credit[1] - 16, credit[0], credit[1]]]);
  if (settings.compass) placer.add(furnitureBoxes(width, height, area));
  placer.add(pinBoxes(ctx, pins, scene.center, area.x1));

  scene.routes.forEach((route, i) => steps.push(() => drawRoute(rc, route, i, colors, wobble)));

  if (settings.labels || settings.doodles) {
    if (settings.labels) {
      await loadLabelFonts(scene);
      if (cancelled()) return;
    }
    const labels = settings.labels ? layoutLabels(ctx, scene, placer, settings.labelScale) : [];

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
    for (const label of labels) {
      steps.push(() => drawLabel(ctx, label, label.role === 'water' ? waterInk : text, style.paper));
    }
  }

  if (settings.compass) {
    steps.push(() => drawCompass(ctx, rc, width, height, area, colors, wobble));
    steps.push(() => drawScaleBar(ctx, rc, area, scene.zoom, scene.center[1], colors, wobble));
  }

  pins.forEach((pin, i) => steps.push(() => drawPin(ctx, rc, pin, i, scene.center, area.x1, colors, wobble)));

  steps.push(() => drawBorder(ctx, rc, width, height, layout, colors, wobble));

  if (title) {
    await loadTitleFont(title, scene.center);
    if (cancelled()) return;
    steps.push(() => drawPosterTitle(ctx, rc, title, scene.center, layout, colors, wobble));
  }


  steps.push(() =>
    rc.rectangle(2, 2, width - 4, height - 4, { ...wobble, stroke: text, strokeWidth: 2, seed: 1 }),
  );
  steps.push(() => {
    const note = '© OpenStreetMap contributors';
    ctx.save();
    ctx.font = '13px "Gaegu", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.paper;
    ctx.fillStyle = text;
    ctx.strokeText(note, ...credit);
    ctx.fillText(note, ...credit);
    ctx.restore();
  });

  let i = 0;
  while (i < steps.length) {
    const until = performance.now() + 12;
    while (i < steps.length && performance.now() < until) steps[i++]();
    if (i < steps.length) {
      await nextFrame();
      if (cancelled()) return;
    }
  }
}
