import type { StyleSpec } from './styles';
import { styleSwatch } from './swatch';

export function setupSteps(onOpen: () => void): void {
  const steps = [...document.querySelectorAll<HTMLElement>('.step')];
  for (const step of steps) {
    const head = step.querySelector<HTMLButtonElement>('.step-head')!;
    head.addEventListener('click', () => {
      const opening = !step.classList.contains('open');
      for (const other of steps) {
        const open = other === step && opening;
        other.classList.toggle('open', open);
        other.querySelector('.step-head')!.setAttribute('aria-expanded', String(open));
      }
      if (opening) requestAnimationFrame(() => step.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
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
