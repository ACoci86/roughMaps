export type Choice = {
  value: string;
  label: string;
  note?: string;
  font?: string;
  icon?: () => Element;
};

export type DropdownSearch = {
  placeholder: string;
  empty: string;
  find: (query: string) => Promise<Choice[]>;
};

const CHEVRON =
  '<svg class="dropdown-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">' +
  '<path d="M6 8l4 4 4-4"/></svg>';

let closeOpen: (() => void) | null = null;

export function dropdown(
  select: HTMLSelectElement,
  choices: () => Choice[],
  search?: DropdownSearch,
): { element: HTMLElement; refresh: () => void } {
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

  let query = '';
  let found: Choice[] = [];
  let asked = 0;
  let timer = 0;
  let input: HTMLInputElement | null = null;
  let searchItem: HTMLLIElement | null = null;
  if (search) {
    list.classList.add('searchable');
    input = document.createElement('input');
    input.type = 'search';
    input.placeholder = search.placeholder;
    input.setAttribute('aria-label', search.placeholder);
    input.autocomplete = 'off';
    input.spellcheck = false;
    searchItem = document.createElement('li');
    searchItem.className = 'dropdown-search';
    searchItem.setAttribute('role', 'presentation');
    searchItem.append(input);
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void find(input!.value.trim()), 150);
    });
  }

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

  async function find(text: string): Promise<void> {
    const ask = ++asked;
    const results = text ? await search!.find(text) : [];
    if (ask !== asked) return;
    query = text;
    found = results;
    fill();
  }

  function fill(): void {
    const shown = query ? found : choices();
    const items: HTMLLIElement[] = shown.map((choice) => {
      const item = document.createElement('li');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.setAttribute('role', 'option');
      pick.setAttribute('aria-selected', String(choice.value === select.value));
      pick.append(...face(choice, true));
      pick.addEventListener('click', () => choose(choice));
      item.append(pick);
      return item;
    });
    if (query && !shown.length) {
      const empty = document.createElement('li');
      empty.className = 'dropdown-empty';
      empty.textContent = search!.empty;
      items.push(empty);
    }
    if (!searchItem) return list.replaceChildren(...items);
    if (list.firstChild !== searchItem) list.prepend(searchItem);
    while (searchItem.nextSibling) searchItem.nextSibling.remove();
    list.append(...items);
  }

  function refresh(): void {
    const all = choices();
    const current = all.find((choice) => choice.value === select.value) ?? all[0];
    button.replaceChildren(...face(current, false));
    button.insertAdjacentHTML('beforeend', CHEVRON);
    fill();
  }

  function close(): void {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (closeOpen === close) closeOpen = null;
    window.removeEventListener('scroll', scrolled, true);
    window.removeEventListener('resize', close);
    document.removeEventListener('pointerdown', outside, true);
    window.clearTimeout(timer);
    asked++;
    if (input && (query || input.value)) {
      input.value = '';
      query = '';
      fill();
    }
  }

  function scrolled(event: Event): void {
    if (event.target !== list) close();
  }

  function outside(event: PointerEvent): void {
    if (!wrap.contains(event.target as Node)) close();
  }

  function open(): void {
    closeOpen?.();
    const box = button.getBoundingClientRect();
    list.hidden = false;
    const width = Math.max(box.width, list.scrollWidth, search ? 260 : 160);
    const left = Math.min(box.left, window.innerWidth - width - 8);
    list.style.left = `${Math.max(8, left)}px`;
    list.style.minWidth = `${Math.min(width, window.innerWidth - 16)}px`;
    const below = box.bottom + 4;
    const fits = below + list.offsetHeight < window.innerHeight - 8;
    list.style.top = `${fits ? below : Math.max(8, box.top - 4 - list.offsetHeight)}px`;
    button.setAttribute('aria-expanded', 'true');
    closeOpen = close;
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', outside, true);
    const picked = list.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (picked) {
      const item = picked.closest('li') ?? picked;
      list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
    }
    if (input && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    else picked?.focus({ preventScroll: true });
  }

  function choose(choice: Choice): void {
    if (![...select.options].some((option) => option.value === choice.value)) select.add(new Option(choice.label, choice.value));
    select.value = choice.value;
    close();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refresh();
    button.focus();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  list.addEventListener('keydown', (event) => {
    const options = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (at < 0 && step < 0) options[options.length - 1]?.focus();
      else options[(at + step + options.length) % options.length]?.focus();
    } else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      options[0]?.click();
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
