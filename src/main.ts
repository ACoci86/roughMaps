import { createPicker } from './picker';
import { readFeatures } from './features';
import 'wired-elements/lib/wired-slider.js';
import 'wired-elements/lib/wired-checkbox.js';
import 'wired-elements/lib/wired-card.js';
import { prepareScene, drawSketch, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import { STYLES } from './styles';
import { searchPlaces, suggestPlaces, type Place } from './search';
import { roughScrollbar } from './scrollbar';
import { setupSteps, setSummary, buildSwatches, selectSwatch } from './panel';
import { PIN_COLOR, PIN_ICONS, type Pin, type PinIcon } from './pins';
import { TITLE_FONTS, TITLE_LAYOUTS, type TitleLayout } from './poster';
import { ROUTE_COLOR, type Route } from './routes';
import { pinAt } from './pins';
import {
  SIZES,
  DPI_OPTIONS,
  DEFAULT_SIZE,
  DEFAULT_DPI,
  pixelSize,
  renderPng,
  renderSvg,
  renderPdf,
  download,
  slug,
  parseConfig,
  type Config,
} from './export';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const sketchCanvas = document.querySelector<HTMLCanvasElement>('#map')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const styleNote = document.querySelector<HTMLParagraphElement>('#style-note')!;
const fillStyleSelect = document.querySelector<HTMLSelectElement>('#fill-style')!;
const sliders = document.querySelectorAll<HTMLElement & { value: number; wiredRender?: (force?: boolean) => void }>(
  'wired-slider[data-setting]',
);
const toggles = document.querySelectorAll<HTMLElement & { checked: boolean }>('wired-checkbox[data-setting]');
const sketchButton = document.querySelector<HTMLButtonElement>('#sketch-button')!;
const moveButton = document.querySelector<HTMLButtonElement>('#move-button')!;
const loading = document.querySelector<HTMLParagraphElement>('#loading')!;
const searchForm = document.querySelector<HTMLFormElement>('#search-form')!;
const searchInput = document.querySelector<HTMLInputElement>('#search')!;
const searchStatus = document.querySelector<HTMLParagraphElement>('#search-status')!;
const searchResults = document.querySelector<HTMLUListElement>('#search-results')!;
const suggestionList = document.querySelector<HTMLUListElement>('#suggestions')!;
const frame = document.querySelector<HTMLDivElement>('#frame')!;
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
for (const font of TITLE_FONTS) titleFont.add(new Option(font, font));
for (const layout of TITLE_LAYOUTS) titleLayout.add(new Option(layout.label, layout.id));
const pinStatus = document.querySelector<HTMLParagraphElement>('#pin-status')!;
const pinList = document.querySelector<HTMLUListElement>('#pin-list')!;
const PIN_HINT = pinStatus.textContent ?? '';

type Toggle = 'labels' | 'doodles' | 'poster' | 'compass' | 'border';

const map = createPicker(pickerBox);
let scene: Scene | null = null;
const settings: SketchSettings = { ...DEFAULT_SETTINGS };
let redrawTimer = 0;
let placeName = 'Dublin';
let pins: Pin[] = [];
let placingNote: string | null = null;
titleInput.value = placeName;

function placedPins() {
  return pins.map((pin) => {
    const { x, y } = map.project(pin.lngLat);
    return { point: [x, y] as [number, number], note: pin.note, color: pin.color, icon: pin.icon };
  });
}

function makeScene(): Scene {
  const made = prepareScene(map, readFeatures(map), titleInput.value);
  made.pins = placedPins();
  made.routes = placedRoutes();
  return made;
}

sketchButton.disabled = true;
map.once('load', () => (sketchButton.disabled = false));

for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));
const styleGrid = document.querySelector<HTMLElement>('#style-grid')!;
buildSwatches(styleGrid, STYLES, (id) => {
  styleSelect.value = id;
  styleSelect.dispatchEvent(new Event('change'));
});

function currentStyle() {
  return STYLES.find((s) => s.id === styleSelect.value) ?? STYLES[0];
}

async function redraw(): Promise<void> {
  if (scene) await drawSketch(sketchCanvas, scene, currentStyle(), settings);
}

function redrawSoon(): void {
  clearTimeout(redrawTimer);
  redrawTimer = window.setTimeout(redraw, 250);
}

function showNote(): void {
  styleNote.textContent = currentStyle().note;
  selectSwatch(styleGrid, currentStyle().id);
  setSummary('look', currentStyle().name);
}

function showSummaries(): void {
  setSummary('place', placeName);
  setSummary('decorate', [settings.poster && titleInput.value.trim(), pins.length && `${pins.length} pin${pins.length === 1 ? '' : 's'}`, routes.length && `${routes.length} route${routes.length === 1 ? '' : 's'}`].filter(Boolean).join(', '));
}

function showSketch(on: boolean): void {
  sketchCanvas.hidden = !on;
  frame.classList.toggle('sketching', on);
  sketchButton.hidden = on;
  moveButton.hidden = !on;
}

function sketchingMode(): boolean {
  return !sketchCanvas.hidden;
}

showNote();

let sketchRun = 0;

async function sketch(): Promise<void> {
  const run = ++sketchRun;
  loading.hidden = false;
  showSketch(true);
  scene = makeScene();
  await redraw();
  if (run === sketchRun) loading.hidden = true;
}

function sketchWhenReady(): void {
  loading.hidden = false;
  showSketch(true);
  map.off('idle', sketch);
  map.once('idle', sketch);
  map.triggerRepaint();
}

map.once('load', sketchWhenReady);

sketchButton.addEventListener('click', sketchWhenReady);

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

fillStyleSelect.addEventListener('change', () => {
  settings.fillStyle = fillStyleSelect.value;
  redraw();
});

sliders.forEach((slider) => {
  const key = slider.dataset.setting as SliderKey;
  const label = document.querySelector<HTMLSpanElement>(`[data-value="${key}"]`)!;
  slider.addEventListener('change', () => {
    settings[key] = Number(slider.value);
    label.textContent = String(settings[key]);
    redrawSoon();
  });
});

toggles.forEach((toggle) => {
  const key = toggle.dataset.setting as Toggle;
  toggle.addEventListener('change', () => {
    settings[key] = toggle.checked;
    showSummaries();
    redraw();
  });
});

moveButton.addEventListener('click', () => {
  stopPlacing(PIN_HINT);
  finishRoute();
  showSketch(false);
});

titleInput.addEventListener('input', () => {
  if (!scene) return;
  scene.title = titleInput.value;
  redrawSoon();
});

function updateCursor(): void {
  frame.classList.toggle('placing', placingNote !== null || draft !== null);
}

function stopPlacing(message: string): void {
  placingNote = null;
  updateCursor();
  pinStatus.textContent = message;
}

function clickPoint(event: MouseEvent): [number, number] {
  const scale = scene ? scene.width / sketchCanvas.clientWidth : 1;
  return [event.offsetX * scale, event.offsetY * scale];
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
  if (!scene || !sketchingMode()) {
    routeStatus.textContent = 'Sketch the map first, then draw on it.';
    return;
  }
  stopPlacing(PIN_HINT);
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

function moveGhost(event: PointerEvent): void {
  const box = frame.getBoundingClientRect();
  pinGhost.style.left = `${event.clientX - box.left}px`;
  pinGhost.style.top = `${event.clientY - box.top}px`;
}

sketchCanvas.addEventListener('pointerdown', (event) => {
  if (!scene || placingNote !== null || draft || event.button !== 0) return;
  const index = pinAt(placedPins(), clickPoint(event));
  if (index < 0) return;
  event.preventDefault();
  dragging = index;
  sketchCanvas.setPointerCapture(event.pointerId);
  frame.classList.add('dragging');
  pinGhost.style.background = pins[index].color;
  moveGhost(event);
  pinGhost.hidden = false;
  scene.pins = placedPins().filter((_, i) => i !== index);
  redraw();
});

sketchCanvas.addEventListener('pointermove', (event) => {
  if (dragging >= 0) {
    moveGhost(event);
    return;
  }
  if (!scene || placingNote !== null || draft) return;
  sketchCanvas.style.cursor = pinAt(scene.pins, clickPoint(event)) >= 0 ? 'grab' : '';
});

function endDrag(event: PointerEvent, keep: boolean): void {
  if (dragging < 0) return;
  const pin = pins[dragging];
  dragging = -1;
  pinGhost.hidden = true;
  frame.classList.remove('dragging');
  if (keep && pin) {
    const box = sketchCanvas.getBoundingClientRect();
    const scale = scene ? scene.width / sketchCanvas.clientWidth : 1;
    const x = (event.clientX - box.left - sketchCanvas.clientLeft) * scale;
    const y = (event.clientY - box.top - sketchCanvas.clientTop) * scale;
    pin.lngLat = lngLatAt([x, y]);
  }
  refreshPins();
}

sketchCanvas.addEventListener('pointerup', (event) => endDrag(event, true));
sketchCanvas.addEventListener('pointercancel', (event) => endDrag(event, false));

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
      const remove = removeButton(`Remove ${note.textContent}`, () => {
        pins.splice(i, 1);
        refreshPins();
      });
      const item = document.createElement('li');
      item.append(color, shape, note, remove);
      return item;
    }),
  );
}

pinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  finishRoute();
  if (!scene || !sketchingMode()) {
    pinStatus.textContent = 'Sketch the map first, then add pins to it.';
    return;
  }
  placingNote = pinNote.value.trim();
  updateCursor();
  pinStatus.textContent = 'Now click the map where the pin goes. Esc cancels.';
});

sketchCanvas.addEventListener('click', (event) => {
  if (!scene) return;
  if (draft) {
    draft.points.push(lngLatAt(clickPoint(event)));
    const count = draft.points.length;
    routeStatus.textContent = `${count} point${count === 1 ? '' : 's'}. Keep clicking, then press Finish route.`;
    refreshRoutes();
    return;
  }
  if (placingNote === null) return;
  const lngLat = lngLatAt(clickPoint(event));
  pins.push({ lngLat, note: placingNote, color: pinColor.value, icon: pinIcon.value as PinIcon });
  pinNote.value = '';
  stopPlacing(PIN_HINT);
  refreshPins();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (placingNote !== null) stopPlacing(PIN_HINT);
  cancelRoute();
});

const AREA_MIN_ZOOM = 13;
const SEARCH_MAX_ZOOM = 17;
const CLOSE_UP_ZOOM = 16;
let lastPlace: Place | null = null;

function flyTo(center: [number, number], zoom: number): void {
  loading.hidden = false;
  showSketch(true);
  map.off('moveend', sketchWhenReady);
  const here = map.getCenter();
  const same = Math.abs(here.lng - center[0]) < 1e-6 && Math.abs(here.lat - center[1]) < 1e-6;
  if (same && Math.abs(map.getZoom() - zoom) < 0.01) {
    sketchWhenReady();
    return;
  }
  map.once('moveend', sketchWhenReady);
  map.flyTo({ center, zoom, duration: 1500 });
}

function frameArea(place: Place): void {
  const fit = map.cameraForBounds(place.bounds, { padding: 20 })?.zoom ?? CLOSE_UP_ZOOM;
  flyTo(place.center, Math.min(SEARCH_MAX_ZOOM, Math.max(AREA_MIN_ZOOM, fit)));
}

function goTo(place: Place): void {
  placeName = place.name;
  titleInput.value = place.name;
  showSummaries();
  lastPlace = place;
  framing.hidden = false;
  frameArea(place);
}

fitAreaButton.addEventListener('click', () => lastPlace && frameArea(lastPlace));
closeUpButton.addEventListener('click', () => lastPlace && flyTo(lastPlace.center, CLOSE_UP_ZOOM));

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

const SUGGEST_DELAY = 300;
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
  if (query.trim().length < 3) {
    hideSuggestions();
    return;
  }
  suggestTimer = window.setTimeout(async () => {
    const request = new AbortController();
    suggestRequest = request;
    try {
      const places = await suggestPlaces(query, request.signal);
      if (request.signal.aborted || searchInput.value !== query) return;
      suggestions = places;
      activeSuggestion = -1;
      showSuggestions();
    } catch {
      if (!request.signal.aborted) hideSuggestions();
    }
  }, SUGGEST_DELAY);
});

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

for (const size of SIZES) sizeSelect.add(new Option(size.label, size.id));
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

function fitPreview(): boolean {
  const before = `${pickerBox.style.width} ${pickerBox.style.height}`;
  const { width, height } = outputPixels();
  frame.style.height = narrow.matches
    ? `${Math.min((frame.clientWidth * height) / width, window.innerHeight * 0.75)}px`
    : '';
  const scale = Math.min(frame.clientWidth / width, frame.clientHeight / height);
  for (const el of [pickerBox, sketchCanvas]) {
    el.style.width = `${Math.floor(width * scale)}px`;
    el.style.height = `${Math.floor(height * scale)}px`;
  }
  map.resize();
  return before !== `${pickerBox.style.width} ${pickerBox.style.height}`;
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
  if (sketchingMode() && map.isStyleLoaded()) sketchWhenReady();
}

let resizeTimer = 0;
function redrawControls(): void {
  sliders.forEach((slider) => slider.wiredRender?.(true));
}

function onWindowResize(): void {
  const changed = fitPreview();
  redrawControls();
  if (!changed) return;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (sketchingMode() && scene) sketchWhenReady();
  }, 400);
}

sizeSelect.addEventListener('change', reshape);
dpiSelect.addEventListener('change', showOutput);
window.addEventListener('resize', onWindowResize);
showOutput();
fitPreview();
requestAnimationFrame(redrawControls);
document.fonts.ready.then(redrawControls);

async function exportFile(format: 'png' | 'svg' | 'pdf'): Promise<void> {
  if (!scene || !sketchingMode()) {
    if (!map.isStyleLoaded()) {
      exportStatus.textContent = 'The map is still loading. Try again in a moment.';
      return;
    }
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
    center: [lng, lat],
    zoom: map.getZoom(),
    style: currentStyle().id,
    settings: { ...settings },
    size: sizeSelect.value,
    dpi: Number(dpiSelect.value),
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  download(blob, `${slug(placeName)}-${config.style}.json`);
  exportStatus.textContent = 'Config saved';
});

loadConfigButton.addEventListener('click', () => configFile.click());

configFile.addEventListener('change', async () => {
  const file = configFile.files?.[0];
  configFile.value = '';
  if (!file) return;
  try {
    const config = parseConfig(await file.text());
    Object.assign(settings, config.settings);
    styleSelect.value = STYLES.some((s) => s.id === config.style) ? config.style : STYLES[0].id;
    fillStyleSelect.value = settings.fillStyle;
    titleFont.value = settings.titleFont;
    titleLayout.value = settings.titleLayout;
    sliders.forEach((slider) => {
      const key = slider.dataset.setting as SliderKey;
      slider.value = settings[key];
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
    routeUi();
    renderRouteList();
    stopPlacing(PIN_HINT);
    showNote();
    showSummaries();
    showOutput();
    fitPreview();
    map.jumpTo({ center: config.center, zoom: config.zoom });
    sketchWhenReady();
    exportStatus.textContent = `Loaded ${placeName}`;
  } catch (error) {
    exportStatus.textContent = (error as Error).message;
  }
});

const panel = document.querySelector<HTMLElement>('#panel')!;
roughScrollbar(panel, document.querySelector<HTMLElement>('#rough-scrollbar')!);
new ResizeObserver(redrawControls).observe(panel);
setupSteps(() => requestAnimationFrame(redrawControls));
document.querySelector('#more-options')!.addEventListener('toggle', () => requestAnimationFrame(redrawControls));
titleInput.addEventListener('input', showSummaries);
showSummaries();
