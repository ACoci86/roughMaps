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
      if (!step.classList.contains('open')) return;
      const view = step.parentElement!;
      const room = view.scrollHeight > view.clientHeight + 1 ? view.clientHeight : window.innerHeight / 2;
      step.scrollIntoView({ block: step.offsetHeight > room ? 'start' : 'nearest', behavior: 'smooth' });
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
      const left = button.offsetLeft - container.offsetLeft;
      if (left < container.scrollLeft || left + button.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = left - container.clientWidth / 2 + button.offsetWidth / 2;
      }
    }
  }
}
