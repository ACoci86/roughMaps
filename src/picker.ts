import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const START_CENTER: [number, number] = [-6.2603, 53.3498];
const START_ZOOM = 15;
export const MIN_ZOOM = 13;
export const MAX_ZOOM = 18;
export const COUNTRY_MIN_ZOOM = 2;
export const COUNTRY_MAX_ZOOM = 10;

export function createPicker(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: START_CENTER,
    zoom: START_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  });

  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  return map;
}
