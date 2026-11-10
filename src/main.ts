import { createPicker } from './picker';
import { readFeatures } from './features';
import 'wired-elements/lib/wired-slider.js';
import 'wired-elements/lib/wired-checkbox.js';
import 'wired-elements/lib/wired-card.js';
import { prepareScene, drawSketch, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import { STYLES } from './styles';
import { searchPlaces, type Place } from './search';
import { roughScrollbar } from './scrollbar';
import { PIN_COLOR, type Pin } from './pins';
import {
  SIZES,
  DPI_OPTIONS,
  DEFAULT_SIZE,
  DEFAULT_DPI,
  pixelSize,
  renderPng,
  renderSvg,
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
const pinStatus = document.querySelector<HTMLParagraphElement>('#pin-status')!;
const pinList = document.querySelector<HTMLUListElement>('#pin-list')!;
const PIN_HINT = pinStatus.textContent ?? '';

type Toggle = 'labels' | 'doodles' | 'poster' | 'compass';

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
    return { point: [x, y] as [number, number], note: pin.note, color: pin.color };
  });
}

function makeScene(): Scene {
  const made = prepareScene(map, readFeatures(map), titleInput.value);
  made.pins = placedPins();
  return made;
}

sketchButton.disabled = true;
map.once('load', () => (sketchButton.disabled = false));

for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));

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

fillStyleSelect.addEventListener('change', () => {
  settings.fillStyle = fillStyleSelect.value;
  redraw();
});

sliders.forEach((slider) => {
  const key = slider.dataset.setting as 'roughness' | 'strokeWidth' | 'innerStrokeWidth' | 'fillWeight';
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
    redraw();
  });
});

moveButton.addEventListener('click', () => {
  stopPlacing(PIN_HINT);
  showSketch(false);
});

titleInput.addEventListener('input', () => {
  if (!scene) return;
  scene.title = titleInput.value;
  redrawSoon();
});

function stopPlacing(message: string): void {
  placingNote = null;
  frame.classList.remove('placing');
  pinStatus.textContent = message;
}

function refreshPins(): void {
  renderPinList();
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
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        pins.splice(i, 1);
        refreshPins();
      });
      const item = document.createElement('li');
      item.append(color, note, remove);
      return item;
    }),
  );
}

pinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!scene || !sketchingMode()) {
    pinStatus.textContent = 'Sketch the map first, then add pins to it.';
    return;
  }
  placingNote = pinNote.value.trim();
  frame.classList.add('placing');
  pinStatus.textContent = 'Now click the map where the pin goes. Esc cancels.';
});

sketchCanvas.addEventListener('click', (event) => {
  if (placingNote === null || !scene) return;
  const scale = scene.width / sketchCanvas.clientWidth;
  const { lng, lat } = map.unproject([event.offsetX * scale, event.offsetY * scale]);
  pins.push({ lngLat: [lng, lat], note: placingNote, color: pinColor.value });
  pinNote.value = '';
  stopPlacing(PIN_HINT);
  refreshPins();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && placingNote !== null) stopPlacing(PIN_HINT);
});

const SEARCH_MIN_ZOOM = 15;
const SEARCH_MAX_ZOOM = 17;

function goTo(place: Place): void {
  placeName = place.name;
  titleInput.value = place.name;
  loading.hidden = false;
  showSketch(true);
  map.off('moveend', sketchWhenReady);
  map.once('moveend', sketchWhenReady);
  const fit = map.cameraForBounds(place.bounds, { padding: 20 })?.zoom ?? SEARCH_MIN_ZOOM;
  const zoom = Math.min(SEARCH_MAX_ZOOM, Math.max(SEARCH_MIN_ZOOM, fit));
  map.flyTo({ center: place.center, zoom, duration: 1500 });
}

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

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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

async function exportFile(format: 'png' | 'svg'): Promise<void> {
  if (!scene || !sketchingMode()) {
    if (!map.isStyleLoaded()) {
      exportStatus.textContent = 'The map is still loading. Try again in a moment.';
      return;
    }
    scene = makeScene();
  }
  const output = outputPixels();
  const buttons = [downloadButton, downloadSvgButton];
  buttons.forEach((b) => (b.disabled = true));
  exportStatus.textContent = 'Drawing...';
  const started = performance.now();
  try {
    const name = `${slug(placeName)}-${currentStyle().id}`;
    if (format === 'png') {
      const blob = await renderPng(scene, currentStyle(), settings, output);
      download(blob, `${name}-${output.width}x${output.height}.png`);
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

saveConfigButton.addEventListener('click', () => {
  const { lng, lat } = map.getCenter();
  const config: Config = {
    app: 'roughMaps',
    version: 1,
    place: placeName,
    title: titleInput.value,
    pins: pins.map((pin) => ({ ...pin })),
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
    sliders.forEach((slider) => {
      const key = slider.dataset.setting as 'roughness' | 'strokeWidth' | 'innerStrokeWidth' | 'fillWeight';
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
    stopPlacing(PIN_HINT);
    showNote();
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
