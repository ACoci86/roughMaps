import type { StyleSpec } from './styles';
import { styleSwatch } from './swatch';
import { LOOK_KINDS } from './kinds';

const MOVES: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
const folding = window.matchMedia('(max-width: 900px) and (orientation: portrait)');

let openTab: (name: string) => void = () => {};

export function setupSteps(onOpen: () => void): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.rail-tab')];
  const steps = [...document.querySelectorAll<HTMLElement>('.step')];
  const panel = document.querySelector<HTMLElement>('#panel')!;

  const title = document.querySelector<HTMLElement>('#sheet-title')!;
  document.querySelector('#sheet-close')!.addEventListener('click', () => document.body.classList.remove('sheet-open'));

  const open = (name: string, focus = false) => {
    document.body.classList.add('sheet-open');
    for (const tab of tabs) {
      const on = tab.dataset.step === name;
      if (on) title.textContent = tab.textContent!.trim();
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }
    for (const step of steps) step.hidden = step.dataset.step !== name;
    panel.dataset.step = name;
    panel.scrollTop = 0;
    for (const grid of document.querySelectorAll<HTMLElement>(`#step-${name} .swatches`)) {
      const picked = grid.querySelector<HTMLElement>('.swatch[aria-selected="true"]');
      if (picked) revealSwatch(grid, picked);
    }
    onOpen();
  };
  openTab = open;
  panel.dataset.step = 'place';

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      const shut = folding.matches && document.body.classList.contains('sheet-open') && panel.dataset.step === tab.dataset.step;
      if (shut) document.body.classList.remove('sheet-open');
      else open(tab.dataset.step!);
    });
    tab.addEventListener('keydown', (event) => {
      const move = MOVES[event.key];
      if (!move) return;
      event.preventDefault();
      open(tabs[(i + move + tabs.length) % tabs.length].dataset.step!, true);
    });
  });
}

export function openStep(name: string): void {
  openTab(name);
}

export function setSummary(name: string, text: string): void {
  const el = document.querySelector<HTMLElement>(`#summary-${name}`);
  if (el) el.textContent = text;
}

function swatch(style: StyleSpec): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.style = style.id;
  button.title = style.note;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', 'false');
  const chip = document.createElement('span');
  chip.className = 'chip photo';
  const picture = document.createElement('img');
  picture.src = `/looks/${style.id}.webp`;
  picture.alt = '';
  picture.width = 360;
  picture.height = 270;
  picture.loading = 'lazy';
  picture.decoding = 'async';
  picture.addEventListener('error', () => {
    chip.classList.remove('photo');
    chip.innerHTML = styleSwatch(style);
  });
  chip.append(picture);
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = style.name;
  button.append(chip, name);
  return button;
}

function buildKinds(container: HTMLElement): void {
  const bar = document.querySelector<HTMLElement>('#look-kinds');
  if (!bar) return;
  const kinds = [{ name: 'All', looks: [] as string[] }, ...LOOK_KINDS];
  const chips = kinds.map((kind, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'kind';
    chip.textContent = kind.name;
    chip.setAttribute('aria-pressed', String(i === 0));
    chip.addEventListener('click', () => {
      for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
      for (const button of container.querySelectorAll<HTMLButtonElement>('.swatch')) {
        button.hidden = i > 0 && !kind.looks.includes(button.dataset.style!);
      }
      container.scrollTop = 0;
      container.scrollLeft = 0;
      const picked = container.querySelector<HTMLElement>('.swatch[aria-selected="true"]:not([hidden])');
      if (picked) revealSwatch(container, picked);
    });
    return chip;
  });
  bar.replaceChildren(...chips);
}

export function buildSwatches(container: HTMLElement, styles: StyleSpec[], onPick: (id: string) => void): void {
  container.replaceChildren(...styles.map((style) => swatch(style)));
  buildKinds(container);
  container.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.swatch');
    if (button?.dataset.style) onPick(button.dataset.style);
  });
}

function revealSwatch(container: HTMLElement, button: HTMLElement): void {
  const top = button.offsetTop - container.offsetTop;
  if (top < container.scrollTop || top + button.offsetHeight > container.scrollTop + container.clientHeight) {
    container.scrollTop = top - container.clientHeight / 2 + button.offsetHeight / 2;
  }
  const left = button.offsetLeft - container.offsetLeft;
  if (left < container.scrollLeft || left + button.offsetWidth > container.scrollLeft + container.clientWidth) {
    container.scrollLeft = left - container.clientWidth / 2 + button.offsetWidth / 2;
  }
}

export function selectSwatch(container: HTMLElement, id: string): void {
  for (const button of container.querySelectorAll<HTMLButtonElement>('.swatch')) {
    const on = button.dataset.style === id;
    button.setAttribute('aria-selected', String(on));
    if (on && container.clientHeight) revealSwatch(container, button);
  }
}
