import type { Map, GeoJSONFeature, FilterSpecification, ExpressionSpecification } from 'maplibre-gl';

export type MapFeatures = {
  water: GeoJSONFeature[];
  green: GeoJSONFeature[];
  forest: GeoJSONFeature[];
  sand: GeoJSONFeature[];
  buildings: GeoJSONFeature[];
  bridges: GeoJSONFeature[];
  roads: GeoJSONFeature[];
  railways: GeoJSONFeature[];
};

const SOURCE = 'openmaptiles';

const RAIL = ['rail', 'transit'];

const isLine: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const isArea: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const isRail: ExpressionSpecification = ['match', ['get', 'class'], RAIL, true, false];
const notRail: ExpressionSpecification = ['match', ['get', 'class'], RAIL, false, true];

function read(map: Map, sourceLayer: string, filter?: FilterSpecification): GeoJSONFeature[] {
  return map.querySourceFeatures(SOURCE, { sourceLayer, filter });
}

function landcover(map: Map, classes: string[]): GeoJSONFeature[] {
  return read(map, 'landcover', ['match', ['get', 'class'], classes, true, false]);
}

export function readFeatures(map: Map): MapFeatures {
  return {
    water: read(map, 'water'),
    green: [...read(map, 'park'), ...landcover(map, ['grass'])],
    forest: landcover(map, ['wood']),
    sand: landcover(map, ['sand']),
    buildings: read(map, 'building'),
    bridges: read(map, 'transportation', isArea),
    roads: read(map, 'transportation', ['all', isLine, notRail]),
    railways: read(map, 'transportation', ['all', isLine, isRail]),
  };
}
