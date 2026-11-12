import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl';
import type { Feature } from 'geojson';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const SOURCE = 'openmaptiles';
const DETAIL_ZOOM = 14;
const FROM_ZOOM = 13;
const MAX_TILES = 48;
const MAX_CACHED = 240;

const cache = new Map<string, Promise<Feature[] | null>>();

function tileX(lng: number, n: number): number {
  return Math.floor(((lng + 180) / 360) * n);
}

function tileY(lat: number, n: number): number {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
}

function readTile(template: string, x: number, y: number): Promise<Feature[] | null> {
  const url = template.replace('{z}', String(DETAIL_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
  let request = cache.get(url);
  if (!request) {
    request = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => {
        if (!buffer) return null;
        const layer = new VectorTile(new PbfReader(new Uint8Array(buffer))).layers.building;
        const features: Feature[] = [];
        for (let i = 0; layer && i < layer.length; i++) features.push(layer.feature(i).toGeoJSON(x, y, DETAIL_ZOOM));
        return features;
      })
      .catch(() => null);
    request.then((features) => {
      if (!features) cache.delete(url);
    });
    cache.set(url, request);
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  return request;
}

export async function loadHouses(map: MapLibreMap): Promise<Feature[] | null> {
  const zoom = map.getZoom();
  if (zoom >= DETAIL_ZOOM || zoom < FROM_ZOOM) return null;
  const template = (map.getSource(SOURCE) as VectorTileSource | undefined)?.tiles?.[0];
  if (!template) return null;
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => map.unproject([x, y]));
  const n = 2 ** DETAIL_ZOOM;
  const xs = corners.map((c) => tileX(c.lng, n));
  const ys = corners.map((c) => tileY(c.lat, n));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return null;
  const requests: Promise<Feature[] | null>[] = [];
  for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) {
    for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) requests.push(readTile(template, x, y));
  }
  const tiles = await Promise.all(requests);
  if (tiles.some((t) => t === null)) return null;
  return (tiles as Feature[][]).flat();
}
