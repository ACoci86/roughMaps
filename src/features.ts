import type { Map, GeoJSONFeature, FilterSpecification } from 'maplibre-gl';

export type MapFeatures = {
  water: GeoJSONFeature[];
  parks: GeoJSONFeature[];
  roads: GeoJSONFeature[];
  buildings: GeoJSONFeature[];
};

const SOURCE = 'openmaptiles';

function read(map: Map, sourceLayer: string, filter?: FilterSpecification): GeoJSONFeature[] {
  return map.querySourceFeatures(SOURCE, { sourceLayer, filter });
}

export function readFeatures(map: Map): MapFeatures {
  return {
    water: read(map, 'water'),
    parks: [
      ...read(map, 'park'),
      ...read(map, 'landcover', ['match', ['get', 'class'], ['grass', 'wood'], true, false]),
    ],
    roads: read(map, 'transportation', ['!=', ['get', 'class'], 'rail']),
    buildings: read(map, 'building'),
  };
}
