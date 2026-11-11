import { PIN_ICONS, pinIconSvg, type PinIcon } from './pins';

const CHEVRON =
  '<svg class="icon-picker-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">' +
  '<path d="M6 8l4 4 4-4"/></svg>';

let openPicker: (() => void) | null = null;

export function iconPicker(select: HTMLSelectElement, color: () => string): { element: HTMLElement; refresh: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'icon-picker';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-picker-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', select.getAttribute('aria-label') ?? 'Pin shape');
  const list = document.createElement('ul');
  list.className = 'icon-picker-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  select.replaceWith(wrap);
  select.hidden = true;
  wrap.append(select, button, list);

  const face = (id: PinIcon, label: string) => {
    const text = document.createElement('span');
    text.textContent = label;
    return [pinIconSvg(id, color()), text];
  };

  function render(): void {
    const current = PIN_ICONS.find((item) => item.id === select.value) ?? PIN_ICONS[0];
    button.replaceChildren(...face(current.id, current.label));
    button.insertAdjacentHTML('beforeend', CHEVRON);
    list.replaceChildren(
      ...PIN_ICONS.map((item) => {
        const option = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.setAttribute('role', 'option');
        pick.setAttribute('aria-selected', String(item.id === current.id));
        pick.append(...face(item.id, item.label));
        pick.addEventListener('click', () => choose(item.id));
        option.append(pick);
        return option;
      }),
    );
  }

  function close(): void {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (openPicker === close) openPicker = null;
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  }

  function open(): void {
    openPicker?.();
    const box = button.getBoundingClientRect();
    list.style.left = `${box.left}px`;
    list.style.minWidth = `${Math.max(box.width, 150)}px`;
    list.hidden = false;
    const below = box.bottom + 4;
    const fits = below + list.offsetHeight < window.innerHeight - 8;
    list.style.top = `${fits ? below : box.top - 4 - list.offsetHeight}px`;
    button.setAttribute('aria-expanded', 'true');
    openPicker = close;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }

  function choose(id: PinIcon): void {
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    render();
    close();
    button.focus();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  list.addEventListener('keydown', (event) => {
    const options = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(at + step + options.length) % options.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      button.focus();
    } else if (event.key === 'Tab') {
      close();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(event.target as Node)) close();
  });

  render();
  return { element: wrap, refresh: render };
}
