import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// The look of the picker map. OpenFreeMap hosts this style and its data for free.
// "positron" is a pale grey style, so it stays calm next to the colourful sketch.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Where the map opens: central Dublin, as [longitude, latitude].
const START_CENTER: [number, number] = [-6.2603, 53.3498];
const START_ZOOM = 15;

// How far out you can zoom. Zoomed further out, the area would hold
// too many streets and buildings to sketch quickly.
const MIN_ZOOM = 13;
const MAX_ZOOM = 18;

// Creates the map inside the given element and returns it,
// so other files can later read what is on screen.
export function createPicker(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: START_CENTER,
    zoom: START_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  });

  // Keep north at the top. Our sketch is a flat drawing, so it can't be rotated or tilted.
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  // + and - buttons in the corner.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  return map;
}
