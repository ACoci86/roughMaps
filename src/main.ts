import { createPicker } from './picker';
import { readFeatures } from './features';
import { prepareScene, drawSketch, type Scene } from './sketch';
import { STYLES } from './styles';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const sketchSvg = document.querySelector<SVGSVGElement>('#map')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const styleNote = document.querySelector<HTMLParagraphElement>('#style-note')!;
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
  drawSketch(sketchSvg, scene, currentStyle());
  showSketch(true);
});

styleSelect.addEventListener('change', () => {
  showNote();
  if (scene) drawSketch(sketchSvg, scene, currentStyle());
});

backButton.addEventListener('click', () => showSketch(false));
