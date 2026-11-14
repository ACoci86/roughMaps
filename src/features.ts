import type { Map, GeoJSONFeature, FilterSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { Feature } from 'geojson';

export type MapFeatures = {
  water: GeoJSONFeature[];
  green: GeoJSONFeature[];
  forest: GeoJSONFeature[];
  sand: GeoJSONFeature[];
  ice: GeoJSONFeature[];
  rock: GeoJSONFeature[];
  lifts: GeoJSONFeature[];
  buildings: Feature[];
  bridges: GeoJSONFeature[];
  roads: GeoJSONFeature[];
  railways: GeoJSONFeature[];
  streetNames: GeoJSONFeature[];
  places: GeoJSONFeature[];
  waterNames: GeoJSONFeature[];
  pois: GeoJSONFeature[];
  peaks: GeoJSONFeature[];
};

const SOURCE = 'openmaptiles';

const RAIL = ['rail', 'transit'];
const NOT_ROADS = [...RAIL, 'aerialway'];

export const POI_ICONS: Record<string, string> = {
  cafe: 'cafe',
  ice_cream: 'cafe',
  bakery: 'cafe',
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  bar: 'bar',
  beer: 'bar',
  place_of_worship: 'worship',
  museum: 'museum',
  art_gallery: 'museum',
  castle: 'museum',
  monument: 'museum',
  hospital: 'hospital',
  school: 'school',
  college: 'school',
  library: 'school',
  attraction: 'star',
  theatre: 'star',
  cinema: 'star',
  campsite: 'tent',
  alpine_hut: 'hut',
  wilderness_hut: 'hut',
};

const HUTS = ['alpine_hut', 'wilderness_hut'];

const isLine: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const isArea: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const isRail: ExpressionSpecification = ['match', ['get', 'class'], RAIL, true, false];
const notRail: ExpressionSpecification = ['match', ['get', 'class'], NOT_ROADS, false, true];
const isLift: ExpressionSpecification = ['==', ['get', 'class'], 'aerialway'];

function read(map: Map, sourceLayer: string, filter?: FilterSpecification): GeoJSONFeature[] {
  return map.querySourceFeatures(SOURCE, { sourceLayer, filter });
}

function landcover(map: Map, classes: string[]): GeoJSONFeature[] {
  return read(map, 'landcover', ['match', ['get', 'class'], classes, true, false]);
}

export function readFeatures(map: Map): MapFeatures {
  return {
    water: read(map, 'water'),
    green: [...read(map, 'park', ['==', ['get', 'class'], 'nature_reserve']), ...landcover(map, ['grass'])],
    forest: landcover(map, ['wood']),
    sand: landcover(map, ['sand']),
    ice: landcover(map, ['ice']),
    rock: landcover(map, ['rock']),
    lifts: read(map, 'transportation', ['all', isLine, isLift]),
    buildings: read(map, 'building'),
    bridges: read(map, 'transportation', isArea),
    roads: read(map, 'transportation', ['all', isLine, notRail]),
    railways: read(map, 'transportation', ['all', isLine, isRail]),
    streetNames: read(map, 'transportation_name', ['has', 'name']),
    places: read(map, 'place', ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood'], true, false]),
    waterNames: [...read(map, 'water_name', ['has', 'name']), ...read(map, 'waterway', ['all', ['has', 'name'], isLine])],
    pois: read(map, 'poi', [
      'all',
      ['has', 'name'],
      ['any', ['match', ['get', 'class'], Object.keys(POI_ICONS), true, false], ['match', ['get', 'subclass'], HUTS, true, false]],
    ]),
    peaks: read(map, 'mountain_peak', ['match', ['get', 'class'], ['peak', 'volcano', 'saddle'], true, false]),
  };
}
