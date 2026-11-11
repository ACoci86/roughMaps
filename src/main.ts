import { LngLat } from 'maplibre-gl';
import { createPicker, MIN_ZOOM, MAX_ZOOM, COUNTRY_MIN_ZOOM, COUNTRY_MAX_ZOOM } from './picker';
import { readFeatures } from './features';
import { prepareScene, drawSketch, cancelSketch, buildingAt, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import { STYLES, tinted } from './styles';
import { searchPlaces, suggestPlaces, matchCities, loadCities, samePlace, type Place } from './search';
import { loadCountries, loadCountryData, loadDetails, matchCountries, findCountry, countryPlace, prepareCountryScene, type Country } from './countries';
import { pickPreset, PRESETS, type Preset } from './presets';
import { sketchingAnimation } from './sketching';
import { setupSteps, setSummary, buildSwatches, selectSwatch } from './panel';
import { styleSwatch } from './swatch';
import { PIN_COLOR, PIN_ICONS, type Pin, type PinIcon } from './pins';
import { TITLE_FONTS, TITLE_LAYOUTS, posterLayout, type TitleLayout } from './poster';
import { ROUTE_COLOR, type Route } from './routes';
import { pinAt } from './pins';
import { iconPicker } from './iconpicker';
import {
  SIZES,
  DPI_OPTIONS,
  DEFAULT_SIZE,
  DEFAULT_DPI,
  pixelSize,
  renderPng,
  renderSvg,
  renderPdf,
  HIGHLIGHT_COLOR,
  download,
  slug,
  parseConfig,
  type Config,
} from './export';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const paper = document.querySelector<HTMLDivElement>('#paper')!;
const sheets = [...document.querySelectorAll<HTMLCanvasElement>('#paper .sheet')];
const frameCanvas = document.querySelector<HTMLCanvasElement>('#map-frame')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const styleNote = document.querySelector<HTMLParagraphElement>('#style-note')!;
const tintRow = document.querySelector<HTMLDivElement>('#tint-row')!;
const tintInput = document.querySelector<HTMLInputElement>('#tint')!;
const fillStyleSelect = document.querySelector<HTMLSelectElement>('#fill-style')!;
const sliders = document.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]');
const toggles = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-setting]');
const loading = document.querySelector<HTMLDivElement>('#loading')!;
const viewButton = document.querySelector<HTMLButtonElement>('#view-button')!;
const searchForm = document.querySelector<HTMLFormElement>('#search-form')!;
const searchInput = document.querySelector<HTMLInputElement>('#search')!;
const searchStatus = document.querySelector<HTMLParagraphElement>('#search-status')!;
const searchResults = document.querySelector<HTMLUListElement>('#search-results')!;
const suggestionList = document.querySelector<HTMLUListElement>('#suggestions')!;
const frame = document.querySelector<HTMLDivElement>('#frame')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const sizeSelect = document.querySelector<HTMLSelectElement>('#size')!;
const dpiSelect = document.querySelector<HTMLSelectElement>('#dpi')!;
const pixelsNote = document.querySelector<HTMLParagraphElement>('#pixels')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const saveConfigButton = document.querySelector<HTMLButtonElement>('#save-config')!;
const loadConfigButton = document.querySelector<HTMLButtonElement>('#load-config')!;
const configFile = document.querySelector<HTMLInputElement>('#config-file')!;
const exportStatus = document.querySelector<HTMLParagraphElement>('#export-status')!;
const downloadSvgButton = document.querySelector<HTMLButtonElement>('#download-svg')!;
const titleInput = document.querySelector<HTMLInputElement>('#title')!;
const pinForm = document.querySelector<HTMLFormElement>('#pin-form')!;
const pinNote = document.querySelector<HTMLInputElement>('#pin-note')!;
const pinColor = document.querySelector<HTMLInputElement>('#pin-color')!;
pinColor.value = PIN_COLOR;
const pinIcon = document.querySelector<HTMLSelectElement>('#pin-icon')!;
const pinGhost = document.querySelector<HTMLDivElement>('#pin-ghost')!;
const routeColor = document.querySelector<HTMLInputElement>('#route-color')!;
const routeButton = document.querySelector<HTMLButtonElement>('#route-button')!;
const routeCancel = document.querySelector<HTMLButtonElement>('#route-cancel')!;
const routeStatus = document.querySelector<HTMLParagraphElement>('#route-status')!;
const routeList = document.querySelector<HTMLUListElement>('#route-list')!;
const downloadPdfButton = document.querySelector<HTMLButtonElement>('#download-pdf')!;
const ROUTE_HINT = routeStatus.textContent ?? '';
routeColor.value = ROUTE_COLOR;

type SliderKey = 'roughness' | 'strokeWidth' | 'innerStrokeWidth' | 'fillWeight' | 'labelScale';
const titleFont = document.querySelector<HTMLSelectElement>('#title-font')!;
const titleLayout = document.querySelector<HTMLSelectElement>('#title-layout')!;
const framing = document.querySelector<HTMLDivElement>('#framing')!;
const fitAreaButton = document.querySelector<HTMLButtonElement>('#fit-area')!;
const closeUpButton = document.querySelector<HTMLButtonElement>('#close-up')!;

function iconOptions(select: HTMLSelectElement, value: PinIcon): void {
  for (const icon of PIN_ICONS) select.add(new Option(icon.label, icon.id));
  select.value = value;
}

iconOptions(pinIcon, 'pin');
const pinPicker = iconPicker(pinIcon, () => pinColor.value);
pinColor.addEventListener('input', pinPicker.refresh);
for (const font of TITLE_FONTS) titleFont.add(new Option(font, font));
for (const layout of TITLE_LAYOUTS) titleLayout.add(new Option(layout.label, layout.id));
const pinStatus = document.querySelector<HTMLParagraphElement>('#pin-status')!;
const pinList = document.querySelector<HTMLUListElement>('#pin-list')!;
const PIN_HINT = pinStatus.textContent ?? '';

type Toggle = 'labels' | 'doodles' | 'poster' | 'compass' | 'border' | 'inked' | 'coords';

const preset = pickPreset();
const map = createPicker(pickerBox);
map.jumpTo({ center: preset.center, zoom: preset.zoom, bearing: preset.bearing ?? 0 });
let scene: Scene | null = null;
let shownScene: Scene | null = null;
let liveSheet = sheets[0];
let stale = false;
let fresh = true;
let normalMap = false;

type Anchor = { x: number; y: number; here: LngLat; east: LngLat };
const ANCHOR_SPAN = 100;
const sceneAnchors = new WeakMap<Scene, Anchor>();
const sheetAnchors = new WeakMap<HTMLCanvasElement, Anchor>();

function anchorHere(): Anchor {
  const x = pickerBox.clientWidth / 2;
  const y = pickerBox.clientHeight / 2;
  return { x, y, here: map.unproject([x, y]), east: map.unproject([x + ANCHOR_SPAN, y]) };
}

function follow(): void {
  for (const sheet of sheets) {
    const anchor = sheetAnchors.get(sheet);
    if (!anchor) continue;
    const p = map.project(anchor.here);
    const q = map.project(anchor.east);
    const a = (q.x - p.x) / ANCHOR_SPAN;
    const b = (q.y - p.y) / ANCHOR_SPAN;
    const tx = p.x - (a * anchor.x - b * anchor.y);
    const ty = p.y - (b * anchor.x + a * anchor.y);
    const still = Math.abs(a - 1) < 1e-4 && Math.abs(b) < 1e-4 && Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05;
    sheet.style.transform = still ? '' : `matrix(${a}, ${b}, ${-b}, ${a}, ${tx}, ${ty})`;
  }
}

map.on('move', follow);
const settings: SketchSettings = { ...DEFAULT_SETTINGS, roughness: preset.roughness, ...preset.settings };
let redrawTimer = 0;
let placeName = preset.place;
let pins: Pin[] = [];
let placingNote: string | null = null;
let countryMode = false;
let focusCountry: string | null = null;
let focusCapital: Country['capital'] = null;
titleInput.value = placeName;

function placedPins() {
  return pins.map((pin) => {
    const { x, y } = map.project(pin.lngLat);
    return { point: [x, y] as [number, number], note: pin.note, color: pin.color, icon: pin.icon };
  });
}

function makeScene(): Scene {
  const made = countryMode
    ? prepareCountryScene(map, focusCountry, titleInput.value)
    : prepareScene(map, readFeatures(map), titleInput.value);
  made.pins = placedPins();
  made.routes = placedRoutes();
  made.highlights = placedHighlights();
  sceneAnchors.set(made, anchorHere());
  return made;
}

for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));
if (STYLES.some((s) => s.id === preset.style)) styleSelect.value = preset.style;
if (preset.tint) tintInput.value = preset.tint;
const styleGrid = document.querySelector<HTMLElement>('#style-grid')!;
buildSwatches(styleGrid, STYLES, (id) => {
  styleSelect.value = id;
  styleSelect.dispatchEvent(new Event('change'));
});

function currentStyle() {
  const style = STYLES.find((s) => s.id === styleSelect.value) ?? STYLES[0];
  return style.tint ? tinted(style, tintInput.value) : style;
}

tintInput.addEventListener('input', () => redrawSoon());

let fadeTimer = 0;

function showScene(shown: Scene, sheet: HTMLCanvasElement): void {
  shownScene = shown;
  const anchor = sceneAnchors.get(shown);
  if (anchor) sheetAnchors.set(sheet, anchor);
  follow();
  if (sheet === liveSheet) return;
  const old = liveSheet;
  liveSheet = sheet;
  sheet.classList.remove('old');
  sheet.classList.add('live');
  old.classList.replace('live', 'old');
  clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => old.classList.remove('old'), 400);
}

async function redraw(): Promise<void> {
  frame.classList.toggle('title-top', settings.poster && settings.titleLayout === 'top' && titleInput.value.trim() !== '');
  if (!scene || stale) return;
  const drawn = scene;
  const style = currentStyle();
  const drawFrame = () => drawSketch(frameCanvas, drawn, style, settings, undefined, 'frame');
  paper.style.background = style.paper;
  if (drawn === shownScene) {
    await Promise.all([drawSketch(liveSheet, drawn, style, settings, undefined, 'map'), drawFrame()]);
    return;
  }
  const next = sheets.find((sheet) => sheet !== liveSheet)!;
  const done = await drawSketch(next, drawn, style, settings, undefined, 'map');
  if (!done || stale || scene !== drawn) return;
  showScene(drawn, next);
  await drawFrame();
}

function redrawSoon(): void {
  clearTimeout(redrawTimer);
  redrawTimer = window.setTimeout(redraw, 250);
}

function showNote(): void {
  styleNote.textContent = currentStyle().note;
  tintRow.hidden = !currentStyle().tint;
  selectSwatch(styleGrid, currentStyle().id);
  setSummary('look', currentStyle().name);
}

function showSummaries(): void {
  setSummary('place', placeName);
  setSummary('decorate', [settings.poster && titleInput.value.trim(), pins.length && `${pins.length} pin${pins.length === 1 ? '' : 's'}`, routes.length && `${routes.length} route${routes.length === 1 ? '' : 's'}`].filter(Boolean).join(', '));
}

showNote();

let sketchRun = 0;

async function sketch(): Promise<void> {
  const run = ++sketchRun;
  if (countryMode) await loadDetails(map);
  if (run !== sketchRun) return;
  scene = makeScene();
  stale = false;
  if (fresh || !shownScene) showScene(scene, liveSheet);
  fresh = false;
  await redraw();
  if (run === sketchRun) loading.hidden = true;
}

let settleTimer = 0;

function resketch(): void {
  clearTimeout(settleTimer);
  map.off('idle', sketch);
  map.once('idle', sketch);
  map.triggerRepaint();
}

function setNormalMap(on: boolean): void {
  normalMap = on;
  paper.hidden = on;
  frame.classList.toggle('sketching', !on);
  viewButton.textContent = on ? 'Show sketch' : 'Show plain map';
}

function sketchWhenReady(): void {
  setNormalMap(false);
  fresh = true;
  loading.hidden = false;
  resketch();
}

map.on('movestart', () => {
  stale = true;
  sketchRun++;
  if (!fresh) loading.hidden = true;
  for (const sheet of sheets) if (sheet !== liveSheet) cancelSketch(sheet);
  clearTimeout(settleTimer);
  map.off('idle', sketch);
});

map.on('moveend', () => {
  clearTimeout(settleTimer);
  if (normalMap) return;
  settleTimer = window.setTimeout(() => {
    loading.hidden = false;
    resketch();
  }, 150);
});

viewButton.addEventListener('click', () => {
  if (normalMap) {
    if (stale || !scene) sketchWhenReady();
    else setNormalMap(false);
    return;
  }
  stopPlacing(PIN_HINT);
  finishRoute();
  if (highlighting) stopHighlighting(highlightHint());
  setNormalMap(true);
  loading.hidden = true;
  clearTimeout(settleTimer);
  map.off('idle', sketch);
  sketchRun++;
});

map.once('load', sketchWhenReady);

styleSelect.addEventListener('change', () => {
  showNote();
  redraw();
});

titleFont.value = settings.titleFont;
titleLayout.value = settings.titleLayout;

titleFont.addEventListener('change', () => {
  settings.titleFont = titleFont.value;
  redraw();
});

titleLayout.addEventListener('change', () => {
  settings.titleLayout = titleLayout.value as TitleLayout;
  redraw();
});

fillStyleSelect.value = settings.fillStyle;

fillStyleSelect.addEventListener('change', () => {
  settings.fillStyle = fillStyleSelect.value;
  redraw();
});

sliders.forEach((slider) => {
  const key = slider.dataset.setting as SliderKey;
  const label = document.querySelector<HTMLSpanElement>(`[data-value="${key}"]`)!;
  slider.value = String(settings[key]);
  label.textContent = String(settings[key]);
  slider.addEventListener('input', () => {
    settings[key] = Number(slider.value);
    label.textContent = String(settings[key]);
    redrawSoon();
  });
});

toggles.forEach((toggle) => {
  const key = toggle.dataset.setting as Toggle;
  toggle.checked = settings[key];
  toggle.addEventListener('change', () => {
    settings[key] = toggle.checked;
    showSummaries();
    redraw();
  });
});

titleInput.addEventListener('input', () => {
  if (!scene) return;
  scene.title = titleInput.value;
  redrawSoon();
});

function updateCursor(): void {
  const tool = placingNote !== null || draft !== null || highlighting;
  frame.classList.toggle('placing', tool);
  if (tool) map.doubleClickZoom.disable();
  else map.doubleClickZoom.enable();
}

type Highlight = { lngLat: [number, number]; color: string };
const highlightColor = document.querySelector<HTMLInputElement>('#highlight-color')!;
const highlightButton = document.querySelector<HTMLButtonElement>('#highlight-button')!;
const highlightStatus = document.querySelector<HTMLParagraphElement>('#highlight-status')!;
const highlightList = document.querySelector<HTMLUListElement>('#highlight-list')!;
const HIGHLIGHT_HINT = highlightStatus.textContent ?? '';
const highlightHint = () => HIGHLIGHT_HINT.replaceAll('building', highlightWord());
highlightColor.value = HIGHLIGHT_COLOR;
let highlights: Highlight[] = [];
let highlighting = false;

function placedHighlights() {
  return highlights.map((h) => {
    const { x, y } = map.project(h.lngLat);
    return { point: [x, y] as [number, number], color: h.color };
  });
}

function highlightWord(): string {
  return countryMode ? 'country' : 'building';
}

function stopHighlighting(message: string): void {
  highlighting = false;
  highlightButton.textContent = `Highlight a ${highlightWord()}`;
  highlightStatus.textContent = message;
  updateCursor();
}

function refreshHighlights(): void {
  renderHighlightList();
  showSummaries();
  if (!scene) return;
  scene.highlights = placedHighlights();
  redraw();
}

function renderHighlightList(): void {
  highlightList.replaceChildren(
    ...highlights.map((h, i) => {
      const name = document.createElement('span');
      name.textContent = `Highlight ${i + 1}`;
      const color = document.createElement('input');
      color.type = 'color';
      color.value = h.color;
      color.title = 'Highlight colour';
      color.setAttribute('aria-label', `Colour of highlight ${i + 1}`);
      color.addEventListener('input', () => {
        h.color = color.value;
        if (!scene) return;
        scene.highlights = placedHighlights();
        redrawSoon();
      });
      const remove = removeButton(`Remove highlight ${i + 1}`, () => {
        highlights.splice(i, 1);
        refreshHighlights();
      });
      const item = document.createElement('li');
      item.append(color, name, remove);
      return item;
    }),
  );
}

highlightButton.addEventListener('click', () => {
  if (highlighting) {
    stopHighlighting(highlightHint());
    return;
  }
  if (!scene || normalMap) {
    highlightStatus.textContent = `Sketch the map first, then pick a ${highlightWord()}.`;
    return;
  }
  stopPlacing(PIN_HINT);
  finishRoute();
  highlighting = true;
  highlightButton.textContent = 'Cancel';
  highlightStatus.textContent = `Now click a ${highlightWord()} on the map. Esc cancels.`;
  updateCursor();
});

function stopPlacing(message: string): void {
  placingNote = null;
  updateCursor();
  pinStatus.textContent = message;
}

function lngLatAt(point: [number, number]): [number, number] {
  const { lng, lat } = map.unproject(point);
  return [lng, lat];
}

let routes: Route[] = [];
let draft: Route | null = null;

function placedRoutes() {
  return [...routes, ...(draft ? [draft] : [])].map((route) => ({
    color: route.color,
    points: route.points.map((p) => {
      const { x, y } = map.project(p);
      return [x, y] as [number, number];
    }),
  }));
}

function refreshRoutes(): void {
  renderRouteList();
  showSummaries();
  if (!scene) return;
  scene.routes = placedRoutes();
  redraw();
}

function routeUi(): void {
  routeButton.textContent = draft ? 'Finish route' : 'Draw a route';
  routeCancel.hidden = !draft;
  updateCursor();
}

function finishRoute(): void {
  if (!draft) return;
  if (draft.points.length >= 2) routes.push(draft);
  routeStatus.textContent = draft.points.length >= 2 ? ROUTE_HINT : 'A route needs at least two points.';
  draft = null;
  routeUi();
  refreshRoutes();
}

function cancelRoute(): void {
  if (!draft) return;
  draft = null;
  routeStatus.textContent = ROUTE_HINT;
  routeUi();
  refreshRoutes();
}

routeButton.addEventListener('click', () => {
  if (draft) {
    finishRoute();
    return;
  }
  if (!scene || normalMap) {
    routeStatus.textContent = 'Sketch the map first, then draw on it.';
    return;
  }
  stopPlacing(PIN_HINT);
  if (highlighting) stopHighlighting(highlightHint());
  draft = { points: [], color: routeColor.value };
  routeStatus.textContent = 'Click the map to add points. Press Finish route when done, Esc cancels.';
  routeUi();
});

routeCancel.addEventListener('click', cancelRoute);

routeColor.addEventListener('input', () => {
  if (!draft) return;
  draft.color = routeColor.value;
  refreshRoutes();
});

function renderRouteList(): void {
  routeList.replaceChildren(
    ...routes.map((route, i) => {
      const name = document.createElement('span');
      name.textContent = `Route ${i + 1}, ${route.points.length} points`;
      const color = document.createElement('input');
      color.type = 'color';
      color.value = route.color;
      color.title = 'Route colour';
      color.setAttribute('aria-label', `Colour of route ${i + 1}`);
      color.addEventListener('input', () => {
        route.color = color.value;
        if (!scene) return;
        scene.routes = placedRoutes();
        redrawSoon();
      });
      const remove = removeButton(`Remove route ${i + 1}`, () => {
        routes.splice(i, 1);
        refreshRoutes();
      });
      const item = document.createElement('li');
      item.append(color, name, remove);
      return item;
    }),
  );
}

let dragging = -1;
const mapSurface = map.getCanvasContainer();

function moveGhost(event: PointerEvent): void {
  const box = frame.getBoundingClientRect();
  pinGhost.style.left = `${event.clientX - box.left}px`;
  pinGhost.style.top = `${event.clientY - box.top}px`;
}

function mapPoint(event: PointerEvent): [number, number] {
  const box = map.getCanvas().getBoundingClientRect();
  return [event.clientX - box.left, event.clientY - box.top];
}

function usingTool(): boolean {
  return placingNote !== null || draft !== null || highlighting;
}

mapSurface.addEventListener(
  'pointerdown',
  (event) => {
    if (!scene || normalMap || usingTool() || event.button !== 0) return;
    const index = pinAt(placedPins(), mapPoint(event));
    if (index < 0) return;
    map.dragPan.disable();
    dragging = index;
    mapSurface.setPointerCapture(event.pointerId);
    mapSurface.style.cursor = '';
    frame.classList.add('dragging');
    pinGhost.style.background = pins[index].color;
    moveGhost(event);
    pinGhost.hidden = false;
    scene.pins = placedPins().filter((_, i) => i !== index);
    redraw();
  },
  true,
);

mapSurface.addEventListener('pointermove', (event) => {
  if (dragging >= 0) {
    moveGhost(event);
    return;
  }
  const overPin = scene && !normalMap && !usingTool() && pinAt(placedPins(), mapPoint(event)) >= 0;
  mapSurface.style.cursor = overPin ? 'pointer' : '';
});

function endDrag(event: PointerEvent, keep: boolean): void {
  if (dragging < 0) return;
  const pin = pins[dragging];
  dragging = -1;
  pinGhost.hidden = true;
  frame.classList.remove('dragging');
  map.dragPan.enable();
  if (keep && pin) pin.lngLat = lngLatAt(mapPoint(event));
  refreshPins();
}

mapSurface.addEventListener('pointerup', (event) => endDrag(event, true));
mapSurface.addEventListener('pointercancel', (event) => endDrag(event, false));

const CROSS =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">' +
  '<path d="M4.6 4.2 C7.8 7.6 11.4 11.6 15.6 15.8"/><path d="M15.9 4.4 C12.2 7.9 8.6 11.9 4.3 15.5"/></svg>';

function removeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove';
  button.innerHTML = CROSS;
  button.title = 'Remove';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function refreshPins(): void {
  renderPinList();
  showSummaries();
  if (!scene) return;
  scene.pins = placedPins();
  redraw();
}

function renderPinList(): void {
  pinList.replaceChildren(
    ...pins.map((pin, i) => {
      const note = document.createElement('span');
      note.textContent = pin.note || '(no note)';
      note.title = note.textContent;
      const color = document.createElement('input');
      color.type = 'color';
      color.value = pin.color;
      color.title = 'Pin colour';
      color.setAttribute('aria-label', `Colour of ${note.textContent}`);
      color.addEventListener('input', () => {
        pin.color = color.value;
        picker.refresh();
        if (!scene) return;
        scene.pins = placedPins();
        redrawSoon();
      });
      const shape = document.createElement('select');
      shape.setAttribute('aria-label', `Shape of ${note.textContent}`);
      iconOptions(shape, pin.icon);
      shape.addEventListener('change', () => {
        pin.icon = shape.value as PinIcon;
        refreshPins();
      });
      const picker = iconPicker(shape, () => pin.color);
      const remove = removeButton(`Remove ${note.textContent}`, () => {
        pins.splice(i, 1);
        refreshPins();
      });
      const item = document.createElement('li');
      item.append(color, picker.element, note, remove);
      return item;
    }),
  );
}

pinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  finishRoute();
  if (highlighting) stopHighlighting(highlightHint());
  if (!scene || normalMap) {
    pinStatus.textContent = 'Sketch the map first, then add pins to it.';
    return;
  }
  placingNote = pinNote.value.trim();
  updateCursor();
  pinStatus.textContent = 'Now click the map where the pin goes. Esc cancels.';
});

map.on('click', (event) => {
  if (!scene || normalMap) return;
  const point: [number, number] = [event.point.x, event.point.y];
  if (draft) {
    draft.points.push(lngLatAt(point));
    const count = draft.points.length;
    routeStatus.textContent = `${count} point${count === 1 ? '' : 's'}. Keep clicking, then press Finish route.`;
    refreshRoutes();
    return;
  }
  if (highlighting) {
    if (stale) {
      highlightStatus.textContent = 'Wait for the sketch to catch up, then click again.';
      return;
    }
    if (buildingAt(scene, point) < 0) {
      highlightStatus.textContent = `No ${highlightWord()} there. Try clicking right inside one.`;
      return;
    }
    highlights.push({ lngLat: lngLatAt(point), color: highlightColor.value });
    stopHighlighting(highlightHint());
    refreshHighlights();
    return;
  }
  if (placingNote === null) return;
  const lngLat = lngLatAt(point);
  pins.push({ lngLat, note: placingNote, color: pinColor.value, icon: pinIcon.value as PinIcon });
  pinNote.value = '';
  stopPlacing(PIN_HINT);
  refreshPins();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (placingNote !== null) stopPlacing(PIN_HINT);
  if (highlighting) stopHighlighting(highlightHint());
  cancelRoute();
});

const AREA_MIN_ZOOM = 13;
const SEARCH_MAX_ZOOM = 17;
const CLOSE_UP_ZOOM = 16;
let lastPlace: Place | null = null;

function flyTo(center: [number, number], zoom: number): void {
  setNormalMap(false);
  fresh = true;
  loading.hidden = false;
  const here = map.getCenter();
  const same = Math.abs(here.lng - center[0]) < 1e-6 && Math.abs(here.lat - center[1]) < 1e-6;
  if (same && Math.abs(map.getZoom() - zoom) < 0.01) {
    sketchWhenReady();
    return;
  }
  map.flyTo({ center, zoom, duration: 1500 });
}

function setMode(country: boolean): void {
  if (country === countryMode) return;
  countryMode = country;
  scene = null;
  if (!country) {
    focusCountry = null;
    focusCapital = null;
  }
  if (country) {
    map.setMinZoom(COUNTRY_MIN_ZOOM);
    map.setMaxZoom(COUNTRY_MAX_ZOOM);
  } else {
    map.setMaxZoom(MAX_ZOOM);
    map.setMinZoom(MIN_ZOOM);
  }
  const projection = () => map.setProjection({ type: country ? 'globe' : 'mercator' });
  if (map.isStyleLoaded()) projection();
  else map.once('load', projection);
  if (!highlighting) {
    highlightButton.textContent = `Highlight a ${highlightWord()}`;
    highlightStatus.textContent = highlightHint();
  }
  closeUpButton.textContent = country ? 'Capital close up' : 'Close up';
}

function frameArea(place: Place): void {
  if (countryMode) {
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const title = settings.poster && titleInput.value.trim()
      ? { title: titleInput.value.trim(), layout: settings.titleLayout, font: settings.titleFont, border: settings.border }
      : null;
    const { map: area } = posterLayout(width, height, settings.border, title);
    const room = 24;
    const padding = {
      top: area.y0 + room,
      bottom: height - area.y1 + room,
      left: area.x0 + room,
      right: width - area.x1 + room,
    };
    const camera = map.cameraForBounds(place.bounds, { padding });
    const zoom = Math.min(COUNTRY_MAX_ZOOM, Math.max(COUNTRY_MIN_ZOOM, camera?.zoom ?? 5));
    const center = camera?.center ? (LngLat.convert(camera.center).toArray() as [number, number]) : place.center;
    flyTo(center, zoom);
    return;
  }
  const fit = map.cameraForBounds(place.bounds, { padding: 20 })?.zoom ?? CLOSE_UP_ZOOM;
  flyTo(place.center, Math.min(SEARCH_MAX_ZOOM, Math.max(AREA_MIN_ZOOM, fit)));
}

function setPlace(place: Place): void {
  placeName = place.name;
  titleInput.value = place.name;
  showSummaries();
  lastPlace = place;
  framing.hidden = false;
}

async function enterCountry(country: Country): Promise<void> {
  loading.hidden = false;
  await loadCountryData();
  const place = countryPlace(country);
  setPlace(place);
  setMode(true);
  focusCountry = country.names[0];
  focusCapital = country.capital;
  frameArea(place);
}

async function goTo(place: Place): Promise<void> {
  if (place.country !== undefined) {
    const country = await findCountry(place.country);
    if (country) {
      await enterCountry(country);
      return;
    }
  }
  setMode(false);
  setPlace(place);
  frameArea(place);
}

fitAreaButton.addEventListener('click', () => lastPlace && frameArea(lastPlace));
closeUpButton.addEventListener('click', () => {
  if (!lastPlace) return;
  if (!countryMode) {
    flyTo(lastPlace.center, CLOSE_UP_ZOOM);
    return;
  }
  const capital = focusCapital;
  setMode(false);
  if (!capital) {
    flyTo(lastPlace.center, CLOSE_UP_ZOOM);
    return;
  }
  const [name, lng, lat] = capital;
  setPlace({ name, label: name, center: [lng, lat], bounds: [[lng - 0.05, lat - 0.05], [lng + 0.05, lat + 0.05]] });
  flyTo([lng, lat], CLOSE_UP_ZOOM);
});

function showResults(places: Place[]): void {
  searchResults.replaceChildren(
    ...places.slice(1).map((place) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = place.label;
      button.title = place.label;
      button.addEventListener('click', () => {
        searchResults.replaceChildren();
        searchStatus.textContent = place.name;
        goTo(place);
      });
      const item = document.createElement('li');
      item.append(button);
      return item;
    }),
  );
}

const SUGGEST_DELAY = 200;
const MAX_SUGGESTIONS = 6;
let suggestTimer = 0;
let suggestRequest: AbortController | null = null;
let suggestions: Place[] = [];
let activeSuggestion = -1;

function hideSuggestions(): void {
  clearTimeout(suggestTimer);
  suggestRequest?.abort();
  suggestions = [];
  activeSuggestion = -1;
  suggestionList.replaceChildren();
  suggestionList.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
}

function pickSuggestion(place: Place): void {
  hideSuggestions();
  searchInput.value = place.name;
  searchResults.replaceChildren();
  searchStatus.textContent = place.label;
  goTo(place);
}

function showSuggestions(): void {
  suggestionList.replaceChildren(
    ...suggestions.map((place, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = place.label;
      button.title = place.label;
      button.className = i === activeSuggestion ? 'active' : '';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(i === activeSuggestion));
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => pickSuggestion(place));
      const item = document.createElement('li');
      item.append(button);
      return item;
    }),
  );
  suggestionList.hidden = suggestions.length === 0;
  searchInput.setAttribute('aria-expanded', String(suggestions.length > 0));
}

searchInput.addEventListener('input', () => {
  clearTimeout(suggestTimer);
  suggestRequest?.abort();
  const query = searchInput.value;
  if (query.trim().length < 2) {
    hideSuggestions();
    return;
  }
  let local: Place[] = [];
  Promise.all([matchCountries(query), matchCities(query)]).then(([countries, cities]) => {
    if (searchInput.value !== query) return;
    const nearby = [...countries, ...cities].slice(0, MAX_SUGGESTIONS);
    local = nearby;
    suggestions = nearby;
    activeSuggestion = -1;
    showSuggestions();
  });
  if (query.trim().length < 3) return;
  suggestTimer = window.setTimeout(async () => {
    const request = new AbortController();
    suggestRequest = request;
    try {
      const places = await suggestPlaces(query, request.signal);
      if (request.signal.aborted || searchInput.value !== query) return;
      const base = local.length ? local : suggestions;
      const extra = places.filter((p) => !base.some((c) => samePlace(c, p)));
      const merged = [...base, ...extra].slice(0, MAX_SUGGESTIONS);
      const active = suggestions[activeSuggestion];
      suggestions = merged;
      activeSuggestion = active ? merged.indexOf(active) : -1;
      showSuggestions();
    } catch {
      return;
    }
  }, SUGGEST_DELAY);
});

searchInput.addEventListener(
  'focus',
  () => {
    void loadCities();
    void loadCountries();
  },
  { once: true },
);

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideSuggestions();
    return;
  }
  if (!suggestions.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    activeSuggestion = (activeSuggestion + step + suggestions.length + 1) % (suggestions.length + 1);
    if (activeSuggestion === suggestions.length) activeSuggestion = -1;
    showSuggestions();
  } else if (event.key === 'Enter' && activeSuggestion >= 0) {
    event.preventDefault();
    pickSuggestion(suggestions[activeSuggestion]);
  }
});

searchInput.addEventListener('blur', hideSuggestions);

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideSuggestions();
  const query = searchInput.value;
  if (!query.trim()) return;
  searchStatus.textContent = 'Searching...';
  searchResults.replaceChildren();
  const country = await findCountry(query);
  if (country) {
    if (searchInput.value !== query) return;
    searchStatus.textContent = country.names[0];
    await enterCountry(country);
    return;
  }
  try {
    const places = await searchPlaces(query);
    if (searchInput.value !== query) return;
    if (!places.length) {
      searchStatus.textContent = 'No places found.';
      return;
    }
    searchStatus.textContent = places.length > 1 ? `${places[0].name}. Not it? Try one of these:` : places[0].name;
    showResults(places);
    goTo(places[0]);
  } catch {
    searchStatus.textContent = 'Search failed. Try again in a moment.';
  }
});

for (const size of SIZES) {
  let group = [...sizeSelect.querySelectorAll('optgroup')].find((g) => g.label === size.group);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = size.group;
    sizeSelect.append(group);
  }
  group.append(new Option(`${size.label}`, size.id));
}
for (const dpi of DPI_OPTIONS) dpiSelect.add(new Option(`${dpi} DPI`, String(dpi)));
sizeSelect.value = DEFAULT_SIZE;
dpiSelect.value = String(DEFAULT_DPI);

function currentSize() {
  return SIZES.find((s) => s.id === sizeSelect.value) ?? SIZES[0];
}

function outputPixels() {
  return pixelSize(currentSize(), Number(dpiSelect.value));
}

const narrow = window.matchMedia('(max-width: 900px)');
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;

function steadyHeight(): number {
  const barOnly = narrow.matches && window.innerWidth === viewWidth && Math.abs(window.innerHeight - viewHeight) < 160;
  if (!barOnly) viewHeight = window.innerHeight;
  viewWidth = window.innerWidth;
  return viewHeight;
}

function mapPinned(): boolean {
  return narrow.matches && steadyHeight() >= 600;
}

function fitPreview(): boolean {
  const before = `${pickerBox.style.width} ${pickerBox.style.height}`;
  const { width, height } = outputPixels();
  const side = narrow.matches ? 12 : 40;
  const top = narrow.matches ? 12 : 32;
  const bottom = narrow.matches ? 56 : 76;
  const cap = steadyHeight() * (mapPinned() ? 0.36 : 0.62);
  frame.style.height = narrow.matches
    ? `${Math.round(Math.min(((frame.clientWidth - side * 2) * height) / width, cap)) + top + bottom}px`
    : '';
  const roomW = frame.clientWidth - side * 2;
  const roomH = frame.clientHeight - top - bottom;
  const scale = Math.min(roomW / width, roomH / height);
  const w = Math.floor(width * scale);
  const h = Math.floor(height * scale);
  for (const el of [pickerBox, paper]) {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }
  const y = Math.round(top + Math.max(0, roomH - h) / 2);
  frame.style.setProperty('--paper-top', `${y}px`);
  frame.style.setProperty('--paper-bottom', `${y + h}px`);
  document.documentElement.style.setProperty('--stuck', mapPinned() ? `${stage.offsetHeight}px` : '0px');
  const changed = before !== `${pickerBox.style.width} ${pickerBox.style.height}`;
  if (changed) map.resize();
  return changed;
}

function showOutput(): void {
  const { width, height } = outputPixels();
  dpiSelect.hidden = currentSize().unit !== 'mm';
  pixelsNote.textContent = `${width} × ${height} px`;
  const size = currentSize();
  setSummary('size', size.unit === 'mm' ? `${size.label}, ${dpiSelect.value} DPI` : size.label);
}

function reshape(): void {
  scene = null;
  showOutput();
  fitPreview();
  if (!normalMap && map.isStyleLoaded()) sketchWhenReady();
}

sizeSelect.addEventListener('change', reshape);
dpiSelect.addEventListener('change', showOutput);
window.addEventListener('resize', fitPreview);
showOutput();
fitPreview();

async function exportFile(format: 'png' | 'svg' | 'pdf'): Promise<void> {
  if (!scene || stale) {
    if (!map.isStyleLoaded()) {
      exportStatus.textContent = 'The map is still loading. Try again in a moment.';
      return;
    }
    if (countryMode) await loadDetails(map);
    scene = makeScene();
  }
  const output = outputPixels();
  const buttons = [downloadButton, downloadSvgButton, downloadPdfButton];
  buttons.forEach((b) => (b.disabled = true));
  exportStatus.textContent = 'Drawing...';
  const started = performance.now();
  try {
    const name = `${slug(placeName)}-${currentStyle().id}`;
    if (format === 'png') {
      const blob = await renderPng(scene, currentStyle(), settings, output);
      download(blob, `${name}-${output.width}x${output.height}.png`);
      exportStatus.textContent = `Done in ${seconds(started)} s (${(blob.size / 1e6).toFixed(1)} MB)`;
    } else if (format === 'pdf') {
      const blob = await renderPdf(scene, currentStyle(), settings, currentSize(), output, titleInput.value || placeName);
      download(blob, `${name}-${currentSize().id}.pdf`);
      exportStatus.textContent = `Done in ${seconds(started)} s (${(blob.size / 1e6).toFixed(1)} MB)`;
    } else {
      const blob = await renderSvg(scene, currentStyle(), settings, currentSize());
      download(blob, `${name}-${currentSize().id}.svg`);
      exportStatus.textContent = `Done in ${seconds(started)} s (${(blob.size / 1e6).toFixed(1)} MB)`;
    }
  } catch (error) {
    exportStatus.textContent = `Export failed: ${(error as Error).message}`;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

function seconds(started: number): string {
  return ((performance.now() - started) / 1000).toFixed(1);
}

downloadButton.addEventListener('click', () => exportFile('png'));
downloadSvgButton.addEventListener('click', () => exportFile('svg'));
downloadPdfButton.addEventListener('click', () => exportFile('pdf'));

saveConfigButton.addEventListener('click', () => {
  const { lng, lat } = map.getCenter();
  const config: Config = {
    app: 'roughMaps',
    version: 1,
    place: placeName,
    title: titleInput.value,
    pins: pins.map((pin) => ({ ...pin })),
    routes: routes.map((route) => ({ ...route, points: route.points.map((p) => [...p] as [number, number]) })),
    highlights: highlights.map((h) => ({ ...h, lngLat: [...h.lngLat] as [number, number] })),
    center: [lng, lat],
    zoom: map.getZoom(),
    bearing: Math.round(map.getBearing()),
    style: currentStyle().id,
    ...(currentStyle().tint ? { tint: currentStyle().tint } : {}),
    settings: { ...settings },
    size: sizeSelect.value,
    dpi: Number(dpiSelect.value),
    ...(countryMode ? { country: focusCountry ?? '' } : {}),
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  download(blob, `${slug(placeName)}-${config.style}.json`);
  exportStatus.textContent = 'Config saved';
});

loadConfigButton.addEventListener('click', () => configFile.click());

async function applyConfig(config: Config): Promise<void> {
  Object.assign(settings, config.settings);
  styleSelect.value = STYLES.some((s) => s.id === config.style) ? config.style : STYLES[0].id;
  if (config.tint) tintInput.value = config.tint;
  fillStyleSelect.value = settings.fillStyle;
  titleFont.value = settings.titleFont;
  titleLayout.value = settings.titleLayout;
  sliders.forEach((slider) => {
    const key = slider.dataset.setting as SliderKey;
    slider.value = String(settings[key]);
    document.querySelector(`[data-value="${key}"]`)!.textContent = String(settings[key]);
  });
  toggles.forEach((toggle) => (toggle.checked = settings[toggle.dataset.setting as Toggle]));
  if (SIZES.some((s) => s.id === config.size)) sizeSelect.value = config.size;
  if (DPI_OPTIONS.includes(config.dpi)) dpiSelect.value = String(config.dpi);
  placeName = config.place || 'map';
  titleInput.value = config.title;
  pins = config.pins;
  renderPinList();
  draft = null;
  routes = config.routes;
  highlights = config.highlights;
  renderHighlightList();
  routeUi();
  renderRouteList();
  stopPlacing(PIN_HINT);
  showNote();
  showSummaries();
  showOutput();
  fitPreview();
  if (config.country !== undefined) {
    await loadCountryData();
    const country = config.country ? await findCountry(config.country) : null;
    setMode(true);
    focusCountry = country?.names[0] ?? null;
    focusCapital = country?.capital ?? null;
    lastPlace = country ? countryPlace(country) : null;
  } else {
    setMode(false);
  }
  framing.hidden = lastPlace === null;
  map.jumpTo({ center: config.center, zoom: config.zoom, bearing: config.bearing });
  showRotation();
  sketchWhenReady();
}

configFile.addEventListener('change', async () => {
  const file = configFile.files?.[0];
  configFile.value = '';
  if (!file) return;
  try {
    await applyConfig(parseConfig(await file.text()));
    exportStatus.textContent = `Loaded ${placeName}`;
  } catch (error) {
    exportStatus.textContent = (error as Error).message;
  }
});

const rotateSlider = document.querySelector<HTMLInputElement>('#rotate')!;
const rotateValue = document.querySelector<HTMLSpanElement>('#rotate-value')!;
const straightenButton = document.querySelector<HTMLButtonElement>('#straighten')!;
function showRotation(): void {
  const bearing = Math.round(map.getBearing());
  rotateSlider.value = String(bearing);
  rotateValue.textContent = `${bearing}°`;
  straightenButton.disabled = bearing === 0;
}

function rotateTo(bearing: number): void {
  map.jumpTo({ bearing });
  rotateValue.textContent = `${Math.round(bearing)}°`;
  straightenButton.disabled = Math.round(bearing) === 0;
}

rotateSlider.addEventListener('input', () => rotateTo(Number(rotateSlider.value)));
straightenButton.addEventListener('click', () => {
  rotateTo(0);
  showRotation();
});
requestAnimationFrame(showRotation);

sketchingAnimation(loading);

const panel = document.querySelector<HTMLElement>('#panel')!;
setupSteps(showNav);

const navLinks = [...document.querySelectorAll<HTMLButtonElement>('.nav-link')];
const galleryDialog = document.querySelector<HTMLDialogElement>('#gallery-dialog')!;
const aboutDialog = document.querySelector<HTMLDialogElement>('#about-dialog')!;
const galleryList = document.querySelector<HTMLUListElement>('#gallery-list')!;

function showNav(): void {
  const current = galleryDialog.open ? 'gallery' : aboutDialog.open ? 'about' : '';
  for (const link of navLinks) {
    const on = link.dataset.nav === current;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

for (const link of navLinks) {
  link.addEventListener('click', () => {
    const name = link.dataset.nav;
    if (name === 'gallery') {
      if (!galleryList.childElementCount) buildGallery();
      galleryDialog.showModal();
    } else if (name === 'about') {
      aboutDialog.showModal();
    }
    showNav();
  });
}

for (const dialog of [galleryDialog, aboutDialog]) {
  dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', showNav);
}

function presetStyle(preset: Preset) {
  const style = STYLES.find((s) => s.id === preset.style) ?? STYLES[0];
  return style.tint ? tinted(style, preset.tint ?? style.tint) : style;
}

function buildGallery(): void {
  galleryList.replaceChildren(
    ...PRESETS.map((preset) => {
      const style = presetStyle(preset);
      const button = document.createElement('button');
      button.type = 'button';
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = styleSwatch(style);
      const name = document.createElement('b');
      name.textContent = preset.place;
      const look = document.createElement('small');
      look.textContent = style.name;
      button.append(chip, name, look);
      button.addEventListener('click', () => openPreset(preset));
      const item = document.createElement('li');
      item.append(button);
      return item;
    }),
  );
}

async function openPreset(preset: Preset): Promise<void> {
  galleryDialog.close();
  await applyConfig({
    app: 'roughMaps',
    version: 1,
    place: preset.place,
    title: preset.place,
    pins,
    routes,
    highlights,
    center: preset.center,
    zoom: preset.zoom,
    bearing: preset.bearing ?? 0,
    style: preset.style,
    ...(preset.tint ? { tint: preset.tint } : {}),
    settings: { ...DEFAULT_SETTINGS, roughness: preset.roughness, ...preset.settings },
    size: sizeSelect.value,
    dpi: Number(dpiSelect.value),
  });
  exportStatus.textContent = `Opened ${preset.place}`;
  if (!mapPinned()) window.scrollTo({ top: 0, behavior: 'smooth' });
}

panel.addEventListener('focusin', (event) => {
  const typing = (event.target as HTMLElement).matches('input[type="search"], input[type="text"]');
  document.body.classList.toggle('typing', typing);
});
panel.addEventListener('focusout', () => document.body.classList.remove('typing'));

titleInput.addEventListener('input', showSummaries);
showSummaries();
