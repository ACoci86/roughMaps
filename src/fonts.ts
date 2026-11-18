export type WebFont = [family: string, category: string, weights: number[]];

const CSS = 'https://fonts.googleapis.com/css2';
const loading = new Map<string, Promise<void>>();
const previewed = new Set<string>();
let catalog: Promise<WebFont[]> | null = null;
let builtIn: Set<string> | null = null;

export function isFontName(name: string): boolean {
  return /^[A-Za-z0-9 ]{1,64}$/.test(name);
}

function builtInFonts(): Set<string> {
  if (builtIn) return builtIn;
  builtIn = new Set();
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css2"]');
  if (link) for (const family of new URL(link.href).searchParams.getAll('family')) builtIn.add(family.split(':')[0]);
  return builtIn;
}

export function googleFonts(): Promise<WebFont[]> {
  catalog ??= fetch('/google-fonts.json')
    .then((res) => (res.ok ? (res.json() as Promise<WebFont[]>) : Promise.reject(new Error(String(res.status)))))
    .catch(() => {
      catalog = null;
      return [];
    });
  return catalog;
}

function stylesheet(href: string, preview: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (preview) link.dataset.preview = '';
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.append(link);
  });
}

const param = (family: string) => family.replace(/ /g, '+');

export function loadFont(family: string): Promise<void> {
  if (!isFontName(family) || builtInFonts().has(family)) return Promise.resolve();
  let job = loading.get(family);
  if (!job) {
    job = googleFonts().then(async (fonts) => {
      const weights = fonts.find((font) => font[0] === family)?.[2];
      if (!weights) return void loading.delete(family);
      const axis = weights.length === 1 && weights[0] === 400 ? '' : `:wght@${weights.join(';')}`;
      if (!(await stylesheet(`${CSS}?family=${param(family)}${axis}&display=swap`, false))) loading.delete(family);
    });
    loading.set(family, job);
  }
  return job;
}

export function previewFont(family: string): void {
  if (!isFontName(family) || builtInFonts().has(family) || loading.has(family) || previewed.has(family)) return;
  previewed.add(family);
  void stylesheet(`${CSS}?family=${param(family)}&text=${encodeURIComponent(family)}&display=swap`, true);
}
