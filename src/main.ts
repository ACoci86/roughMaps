import { createPicker } from './picker';
import { readFeatures } from './features';
import { prepareScene, drawSketch, type Scene } from './sketch';
import { STYLES } from './styles';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const sketchSvg = document.querySelector<SVGSVGElement>('#map')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const styleNote = document.querySelector<HTMLParagraphElement>('#style-note')!;
const roughnessInput = document.querySelector<HTMLInputElement>('#roughness')!;
const roughnessValue = document.querySelector<HTMLSpanElement>('#roughness-value')!;
const sketchButton = document.querySelector<HTMLButtonElement>('#sketch-button')!;
const backButton = document.querySelector<HTMLButtonElement>('#back-button')!;

const map = createPicker(pickerBox);
let scene: Scene | null = null;

sketchButton.disabled = true;
map.once('load', () => (sketchButton.disabled = false));

for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));

function currentStyle() {
  return STYLES.find((s) => s.id === styleSelect.value) ?? STYLES[0];
}

function redraw(): void {
  if (scene) drawSketch(sketchSvg, scene, currentStyle(), Number(roughnessInput.value));
}

function showNote(): void {
  styleNote.textContent = currentStyle().note;
}

function showSketch(on: boolean): void {
  pickerBox.hidden = on;
  sketchSvg.toggleAttribute('hidden', !on);
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

roughnessInput.addEventListener('input', () => (roughnessValue.textContent = roughnessInput.value));
roughnessInput.addEventListener('change', redraw);

backButton.addEventListener('click', () => showSketch(false));
