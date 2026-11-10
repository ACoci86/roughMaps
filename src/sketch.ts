import rough from 'roughjs';
import { union, type Geom } from 'polyclip-ts';
import type { Options } from 'roughjs/bin/core';
import type { Map, GeoJSONFeature } from 'maplibre-gl';
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

function toShape(map: Map, geometry: Geometry, minArea = 0): Shape {
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

export function prepareScene(map: Map, features: MapFeatures): Scene {
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

export function drawSketch(svg: SVGSVGElement, scene: Scene, style: StyleSpec): void {
  const { width, height } = scene;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const paper = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  paper.setAttribute('width', String(width));
  paper.setAttribute('height', String(height));
  paper.setAttribute('fill', style.paper);
  svg.append(paper);

  const rc = rough.svg(svg);
  const outline = style.outline > 0 ? style.ink : 'none';

  const drawAreas = (list: Shape[], paint: (i: number) => AreaPaint) => {
    list.forEach((shape, i) => {
      const d = toPath(shape);
      const seed = i + 1;
      const p = paint(i);
      svg.append(
        rc.path(d, {
          seed,
          stroke: outline,
          strokeWidth: style.outline,
          roughness: 0.8,
          disableMultiStroke: true,
          fill: p.color,
          fillStyle: 'solid',
        }),
      );
      if (p.pattern && p.patternColor) {
        svg.append(rc.path(d, { seed, stroke: 'none', fill: p.patternColor, ...patternFill(p) }));
      }
    });
  };

  const building = (i: number): AreaPaint => ({
    ...style.buildingPattern,
    color: style.buildings[i % style.buildings.length],
  });

  drawAreas(scene.sand, () => style.sand);
  drawAreas(scene.green, () => style.park);
  drawAreas(scene.forest, () => style.wood);
  drawAreas(scene.water, () => style.water);
  drawAreas(scene.buildings, building);
  drawAreas(scene.bridges, () => ({ color: style.paper }));

  const lineStyle: Options = { roughness: 1, disableMultiStroke: true, preserveVertices: true };

  scene.railways.forEach((shape, i) => {
    svg.append(
      rc.path(toPath(shape), {
        ...lineStyle,
        seed: i + 1,
        stroke: style.rail,
        strokeWidth: 1.5,
        strokeLineDash: [8, 4],
      }),
    );
  });

  const { road: paint } = style;
  const scale = 2 ** (scene.zoom - 16);
  const roadWidth = (kind: string) => Math.max(0.6, (ROAD_WIDTHS[kind] ?? 1) * scale);
  const roads = scene.roads
    .map((road, i) => ({ ...road, seed: i + 1, width: roadWidth(road.kind) }))
    .sort((a, b) => a.width - b.width);

  for (const road of roads) {
    if (road.kind === 'path') {
      svg.append(
        rc.path(toPath(road.shape), {
          ...lineStyle,
          seed: road.seed,
          stroke: paint.path,
          strokeWidth: road.width,
          strokeLineDash: [4, 3],
        }),
      );
    } else if (paint.edgeRatio > 0) {
      svg.append(
        rc.path(toPath(road.shape), {
          ...lineStyle,
          seed: road.seed,
          stroke: paint.edge,
          strokeWidth: road.width * (1 + 2 * paint.edgeRatio),
        }),
      );
    }
  }

  for (const road of roads) {
    if (road.kind === 'path') continue;
    svg.append(
      rc.path(toPath(road.shape), {
        ...lineStyle,
        seed: road.seed,
        stroke: paint.colors?.[road.kind] ?? paint.fill,
        strokeWidth: road.width,
      }),
    );
  }

  svg.append(rc.rectangle(2, 2, width - 4, height - 4, { stroke: style.ink, strokeWidth: 2, roughness: 1, seed: 1 }));
}
