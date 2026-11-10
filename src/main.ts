import { createPicker } from './picker';
import { readFeatures } from './features';
import { drawSketch } from './sketch';

const pickerBox = document.querySelector<HTMLDivElement>('#picker')!;
const sketchSvg = document.querySelector<SVGSVGElement>('#map')!;
const sketchButton = document.querySelector<HTMLButtonElement>('#sketch-button')!;
const backButton = document.querySelector<HTMLButtonElement>('#back-button')!;

const map = createPicker(pickerBox);

function showSketch(on: boolean): void {
  pickerBox.hidden = on;
  sketchSvg.toggleAttribute('hidden', !on);
  sketchButton.hidden = on;
  backButton.hidden = !on;
}

sketchButton.addEventListener('click', () => {
  drawSketch(sketchSvg, map, readFeatures(map));
  showSketch(true);
});

backButton.addEventListener('click', () => showSketch(false));
