export type Choice = {
  value: string;
  label: string;
  note?: string;
  font?: string;
  icon?: () => Element;
};

const CHEVRON =
  '<svg class="dropdown-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">' +
  '<path d="M6 8l4 4 4-4"/></svg>';

let closeOpen: (() => void) | null = null;

export function dropdown(select: HTMLSelectElement, choices: () => Choice[]): { element: HTMLElement; refresh: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'dropdown';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dropdown-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', select.getAttribute('aria-label') ?? '');
  const list = document.createElement('ul');
  list.className = 'dropdown-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  if (select.parentNode) select.replaceWith(wrap);
  select.hidden = true;
  wrap.append(select, button, list);

  const face = (choice: Choice, withNote: boolean): Node[] => {
    const parts: Node[] = [];
    if (choice.icon) parts.push(choice.icon());
    const text = document.createElement('span');
    text.className = 'dropdown-text';
    const label = document.createElement('span');
    label.className = 'dropdown-label';
    label.textContent = choice.label;
    if (choice.font) label.style.fontFamily = `"${choice.font}", cursive`;
    text.append(label);
    if (withNote && choice.note) {
      const note = document.createElement('small');
      note.textContent = choice.note;
      text.append(note);
    }
    parts.push(text);
    return parts;
  };

  function refresh(): void {
    const all = choices();
    const current = all.find((choice) => choice.value === select.value) ?? all[0];
    button.replaceChildren(...face(current, false));
    button.insertAdjacentHTML('beforeend', CHEVRON);
    list.replaceChildren(
      ...all.map((choice) => {
        const item = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.setAttribute('role', 'option');
        pick.setAttribute('aria-selected', String(choice.value === current.value));
        pick.append(...face(choice, true));
        pick.addEventListener('click', () => choose(choice.value));
        item.append(pick);
        return item;
      }),
    );
  }

  function close(): void {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (closeOpen === close) closeOpen = null;
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
    document.removeEventListener('pointerdown', outside, true);
  }

  function outside(event: PointerEvent): void {
    if (!wrap.contains(event.target as Node)) close();
  }

  function open(): void {
    closeOpen?.();
    const box = button.getBoundingClientRect();
    list.hidden = false;
    const width = Math.max(box.width, list.scrollWidth, 160);
    const left = Math.min(box.left, window.innerWidth - width - 8);
    list.style.left = `${Math.max(8, left)}px`;
    list.style.minWidth = `${box.width}px`;
    const below = box.bottom + 4;
    const fits = below + list.offsetHeight < window.innerHeight - 8;
    list.style.top = `${fits ? below : Math.max(8, box.top - 4 - list.offsetHeight)}px`;
    button.setAttribute('aria-expanded', 'true');
    closeOpen = close;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', outside, true);
    list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }

  function choose(value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refresh();
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

  refresh();
  return { element: wrap, refresh };
}
