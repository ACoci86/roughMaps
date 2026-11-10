import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { Map, GeoJSONFeature } from 'maplibre-gl';
import type { Geometry, Position } from 'geojson';
import type { MapFeatures } from './features';

const INK = '#000';

const WATER: Options = {
  stroke: INK,
  strokeWidth: 1,
  fill: '#87ceeb',
  fillStyle: 'hachure',
  hachureGap: 6,
};

const PARK: Options = {
  stroke: INK,
  strokeWidth: 1,
  fill: '#9bd39b',
  fillStyle: 'hachure',
  hachureGap: 6,
  hachureAngle: 60,
};

const BUILDING: Options = {
  stroke: INK,
  strokeWidth: 0.6,
  roughness: 0.8,
  fill: '#f6d2b8',
  fillStyle: 'solid',
};

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 4,
  trunk: 3.5,
  primary: 3,
  secondary: 2.5,
  tertiary: 2,
  minor: 1.5,
  service: 1,
  path: 0.8,
  track: 0.8,
};

function toPath(map: Map, geometry: Geometry): string {
  const point = (p: Position) => {
    const { x, y } = map.project([p[0], p[1]]);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const line = (coords: Position[], close: boolean) =>
    'M' + coords.map(point).join('L') + (close ? 'Z' : '');

  switch (geometry.type) {
    case 'LineString':
      return line(geometry.coordinates, false);
    case 'MultiLineString':
      return geometry.coordinates.map((c) => line(c, false)).join('');
    case 'Polygon':
      return geometry.coordinates.map((ring) => line(ring, true)).join('');
    case 'MultiPolygon':
      return geometry.coordinates.flat().map((ring) => line(ring, true)).join('');
    default:
      return '';
  }
}

export function drawSketch(svg: SVGSVGElement, map: Map, features: MapFeatures): void {
  const { clientWidth, clientHeight } = map.getContainer();
  svg.setAttribute('viewBox', `0 0 ${clientWidth} ${clientHeight}`);
  svg.replaceChildren();

  const rc = rough.svg(svg);

  const draw = (list: GeoJSONFeature[], style: (f: GeoJSONFeature) => Options) => {
    list.forEach((feature, i) => {
      const d = toPath(map, feature.geometry);
      if (d) svg.append(rc.path(d, { ...style(feature), seed: i + 1 }));
    });
  };

  draw(features.water, () => WATER);
  draw(features.parks, () => PARK);
  draw(features.buildings, () => BUILDING);
  draw(features.roads, (f) => ({
    stroke: INK,
    strokeWidth: ROAD_WIDTHS[f.properties.class] ?? 1,
  }));
}
