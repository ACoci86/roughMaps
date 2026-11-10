import { createPicker } from './picker';
import { readFeatures } from './features';
import 'wired-elements/lib/wired-slider.js';
import { prepareScene, drawSketch, DEFAULT_SETTINGS, type Scene, type SketchSettings } from './sketch';
import { STYLES } from './styles';
import { searchPlaces, type Place } from './search';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const sketchCanvas = document.querySelector<HTMLCanvasElement>('#map')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const styleNote = document.querySelector<HTMLParagraphElement>('#style-note')!;
const fillStyleSelect = document.querySelector<HTMLSelectElement>('#fill-style')!;
const sliders = document.querySelectorAll<HTMLElement & { value: number }>('wired-slider[data-setting]');
const sketchButton = document.querySelector<HTMLButtonElement>('#sketch-button')!;
const backButton = document.querySelector<HTMLButtonElement>('#back-button')!;
const searchForm = document.querySelector<HTMLFormElement>('#search-form')!;
const searchInput = document.querySelector<HTMLInputElement>('#search')!;
const searchStatus = document.querySelector<HTMLParagraphElement>('#search-status')!;
const searchResults = document.querySelector<HTMLUListElement>('#search-results')!;

const map = createPicker(pickerBox);
let scene: Scene | null = null;
const settings: SketchSettings = { ...DEFAULT_SETTINGS };
let redrawTimer = 0;

sketchButton.disabled = true;
map.once('load', () => (sketchButton.disabled = false));

for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));

function currentStyle() {
  return STYLES.find((s) => s.id === styleSelect.value) ?? STYLES[0];
}

function redraw(): void {
  if (scene) drawSketch(sketchCanvas, scene, currentStyle(), settings);
}

function redrawSoon(): void {
  clearTimeout(redrawTimer);
  redrawTimer = window.setTimeout(redraw, 250);
}

function showNote(): void {
  styleNote.textContent = currentStyle().note;
}

function showSketch(on: boolean): void {
  pickerBox.hidden = on;
  sketchCanvas.hidden = !on;
  sketchButton.hidden = on;
  backButton.hidden = !on;
}

showNote();

sketchButton.addEventListener('click', () => {
  scene = prepareScene(map, readFeatures(map));
  redraw();
  showSketch(true);
});

styleSelect.addEventListener('change', () => {
  showNote();
  redraw();
});

fillStyleSelect.addEventListener('change', () => {
  settings.fillStyle = fillStyleSelect.value;
  redraw();
});

sliders.forEach((slider) => {
  const key = slider.dataset.setting as keyof Omit<SketchSettings, 'fillStyle'>;
  const label = document.querySelector<HTMLSpanElement>(`[data-value="${key}"]`)!;
  slider.addEventListener('change', () => {
    settings[key] = Number(slider.value);
    label.textContent = String(settings[key]);
    redrawSoon();
  });
});

backButton.addEventListener('click', () => showSketch(false));

const SEARCH_MIN_ZOOM = 15;
const SEARCH_MAX_ZOOM = 17;

function goTo(place: Place): void {
  showSketch(false);
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
