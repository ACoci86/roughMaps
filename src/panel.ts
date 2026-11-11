import rough from 'roughjs';
import type { StyleSpec } from './styles';
import { styleSwatch } from './swatch';

const ARROW =
  '<svg class="arrow" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">' +
  '<path d="M4.2 7.4 C6.6 9.6 8.4 11.6 10.1 13.6 C12 11.4 13.8 9.5 15.9 7.2"/></svg>';

export function setupSteps(onOpen: () => void): void {
  const steps = [...document.querySelectorAll<HTMLElement>('.step')];
  for (const step of steps) {
    const body = step.querySelector<HTMLElement>('.step-body')!;
    const inner = document.createElement('div');
    inner.className = 'step-inner';
    inner.append(...body.childNodes);
    body.append(inner);
    body.addEventListener('transitionend', (event) => {
      if (event.target !== body || event.propertyName !== 'grid-template-rows') return;
      onOpen();
      if (step.classList.contains('open')) step.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    const head = step.querySelector<HTMLButtonElement>('.step-head')!;
    head.insertAdjacentHTML('beforeend', ARROW);
    head.addEventListener('click', () => {
      const opening = !step.classList.contains('open');
      for (const other of steps) {
        const open = other === step && opening;
        other.classList.toggle('open', open);
        other.querySelector('.step-head')!.setAttribute('aria-expanded', String(open));
      }
      onOpen();
    });
  }
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
  chip.className = 'chip';
  chip.innerHTML = styleSwatch(style);
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = style.name;
  button.append(chip, name);
  return button;
}

export function buildSwatches(container: HTMLElement, styles: StyleSpec[], onPick: (id: string) => void): void {
  container.replaceChildren(...styles.map(swatch));
  container.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.swatch');
    if (button?.dataset.style) onPick(button.dataset.style);
  });
}

export function selectSwatch(container: HTMLElement, id: string): void {
  for (const button of container.querySelectorAll<HTMLButtonElement>('.swatch')) {
    const on = button.dataset.style === id;
    button.setAttribute('aria-selected', String(on));
    if (on && container.clientHeight) {
      const top = button.offsetTop - container.offsetTop;
      if (top < container.scrollTop || top + button.offsetHeight > container.scrollTop + container.clientHeight) {
        container.scrollTop = top - container.clientHeight / 2 + button.offsetHeight / 2;
      }
    }
  }
}

export function roughFrame(target: HTMLElement): void {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('rough-frame');
  svg.setAttribute('aria-hidden', 'true');
  target.prepend(svg);
  const draw = () => {
    const pad = 7;
    const w = target.offsetWidth + pad * 2;
    const h = target.offsetHeight + pad * 2;
    if (w <= pad * 2) return;
    svg.setAttribute('width', String(w + 6));
    svg.setAttribute('height', String(h + 6));
    svg.setAttribute('viewBox', `0 0 ${w + 6} ${h + 6}`);
    const rc = rough.svg(svg);
    const shadow = rc.rectangle(6, 6, w - 3, h - 3, {
      stroke: 'none',
      fill: '#1a1a1a',
      fillStyle: 'zigzag',
      hachureGap: 3,
      fillWeight: 1,
      roughness: 1.4,
      seed: 9,
    });
    shadow.classList.add('shadow');
    const frame = rc.rectangle(2, 2, w - 4, h - 4, {
      stroke: '#1a1a1a',
      strokeWidth: 1.6,
      roughness: 1.3,
      seed: 4,
      fill: '#ffdd00',
      fillStyle: 'solid',
    });
    frame.classList.add('frame-line');
    const inner = rc.rectangle(4, 3.5, w - 7, h - 6, { stroke: '#1a1a1a', strokeWidth: 0.8, roughness: 1.6, seed: 5 });
    inner.classList.add('frame-line');
    svg.replaceChildren(shadow, frame, inner);
  };
  draw();
  new ResizeObserver(draw).observe(target);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function openStep(name: string): void {
  const step = document.querySelector<HTMLElement>(`.step[data-step="${name}"]`);
  if (!step) return;
  if (!step.classList.contains('open')) step.querySelector<HTMLButtonElement>('.step-head')!.click();
  else step.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function roughBox(target: HTMLElement, seed: number, strokeWidth = 1.6): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('rough-box');
  svg.setAttribute('aria-hidden', 'true');
  target.prepend(svg);
  const draw = () => {
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    if (!w || !h) return;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const rc = rough.svg(svg);
    const box = rc.rectangle(2, 2, w - 4, h - 4, { stroke: '#1a1a1a', strokeWidth, roughness: 1.1, bowing: 0.8, seed });
    svg.replaceChildren(box);
  };
  draw();
  new ResizeObserver(draw).observe(target);
}

export function roughRule(target: HTMLElement, seed: number): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  target.replaceChildren(svg);
  const draw = () => {
    const w = target.offsetWidth;
    if (!w) return;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', '8');
    svg.setAttribute('viewBox', `0 0 ${w} 8`);
    const rc = rough.svg(svg);
    svg.replaceChildren(rc.line(2, 4, w - 2, 4, { stroke: '#1a1a1a', strokeWidth: 1.6, roughness: 1.2, bowing: 0.6, seed }));
  };
  draw();
  new ResizeObserver(draw).observe(target);
}
