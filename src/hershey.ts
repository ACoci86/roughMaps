type Glyph = { left: number; right: number; strokes: number[][] };
type Shaped = { width: number; strokes: number[][] };
type Face = { glyphs: Map<string, Glyph>; shaped: Map<string, Shaped | null> };

const FAMILIES: Record<string, { regular: string[]; bold?: string[]; note: string }> = {
  'Hershey Sans': { regular: ['futural', 'greeks'], bold: ['futuram', 'greekc'], note: 'Single line, for pen plotters' },
  'Hershey Serif': { regular: ['timesr', 'timesg'], bold: ['timesrb', 'timesg'], note: 'Plotter serif, drawn with lines' },
  'Hershey Italic': { regular: ['timesi', 'timesg'], bold: ['timesib', 'timesg'], note: 'Plotter italic, drawn with lines' },
  'Hershey Script': { regular: ['scripts', 'greeks'], bold: ['scriptc', 'greekc'], note: 'Single line handwriting' },
  'Hershey Cursive': { regular: ['cursive', 'greeks'], note: 'Rounder single line handwriting' },
  'Hershey Gothic': { regular: ['gothiceng', 'greekc'], note: 'English blackletter, drawn with lines' },
  'Hershey Gothic German': { regular: ['gothicger', 'greekc'], note: 'German blackletter, drawn with lines' },
  'Hershey Gothic Italian': { regular: ['gothicita', 'greekc'], note: 'Italian blackletter, drawn with lines' },
};
const SHARED = ['cyrillic'];

export const HERSHEY_FONTS = Object.keys(FAMILIES);
export const HERSHEY_NOTES: Record<string, string> = Object.fromEntries(
  Object.entries(FAMILIES).map(([family, { note }]) => [family, note]),
);

const EM = 32;
const BASELINES: Record<string, number> = { alphabetic: 9, middle: 0, top: -16, hanging: -12, bottom: 16, ideographic: 16 };

const SWAP: Record<string, string> = {
  ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ĳ: 'ij', Ĳ: 'IJ',
  '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"', '„': '"',
  '\u2013': '-', '\u2014': '-', '−': '-', '…': '...', '·': '.', '×': 'x',
  '′': "'", '″': '"', ς: 'σ', І: 'I', і: 'i', Ј: 'J', ј: 'j', Ѕ: 'S', ѕ: 's', Ґ: 'Г', ґ: 'г', ' ': ' ', ' ': ' ',
};

const dot = (x: number, y: number) => [x, y - 1, x - 1, y, x, y + 1, x + 1, y, x, y - 1];
const ring = (x: number, y: number, r: number) =>
  Array.from({ length: 9 }, (_, i) => [x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * r]).flat();

const ABOVE: Record<string, (t: number) => number[][]> = {
  '̀': (t) => [[1, t + 1, -2, t - 3]],
  '́': (t) => [[-1, t + 1, 2, t - 3]],
  '̂': (t) => [[-3, t + 1, 0, t - 2, 3, t + 1]],
  '̃': (t) => [[-4, t, -3, t - 1.5, -1.5, t - 1.5, 1.5, t, 3, t, 4, t - 1.5]],
  '̄': (t) => [[-3, t - 0.5, 3, t - 0.5]],
  '̆': (t) => [[-3, t - 2, -2, t, 0, t + 0.7, 2, t, 3, t - 2]],
  '̇': (t) => [dot(0, t - 0.5)],
  '̈': (t) => [dot(-2.5, t - 0.5), dot(2.5, t - 0.5)],
  '̊': (t) => [ring(0, t - 1, 1.6)],
  '̋': (t) => [[-3, t + 1, -1, t - 3], [1, t + 1, 3, t - 3]],
  '̌': (t) => [[-3, t - 2, 0, t + 1, 3, t - 2]],
};

const BELOW: Record<string, number[][]> = {
  '̣': [dot(0, 12)],
  '̦': [[0.5, 11, 0, 13, -1, 14]],
  '̧': [[0, 9, 0, 11, 2, 12, 1.5, 13.5, -1, 14]],
  '̨': [[2, 9, 0, 11, 1, 13, 3, 13]],
};

const BARRED: Record<string, [string, (strokes: number[][]) => number[]]> = {
  ø: ['o', (s) => ((b) => [b.x0 - 1, 10, b.x1 + 1, -6])(box(s))],
  Ø: ['O', (s) => ((b) => [b.x0 - 1, 10, b.x1 + 1, -14])(box(s))],
  ł: ['l', (s) => ((x) => [x - 3, 1, x + 3, -3])(crossing(s, -1, Math.min))],
  Ł: ['L', (s) => ((x) => [x - 3, 1, x + 3, -3])(crossing(s, -1, Math.min))],
  đ: ['d', (s) => ((x) => [x - 3, -9, x + 2, -9])(crossing(s, -9, Math.max))],
  Đ: ['D', (s) => ((x) => [x - 3, -1, x + 4, -1])(crossing(s, -1, Math.min))],
};

function crossing(strokes: number[][], y: number, pick: (...xs: number[]) => number): number {
  const xs: number[] = [];
  for (const s of strokes) {
    for (let i = 2; i < s.length; i += 2) {
      const [x0, y0, x1, y1] = [s[i - 2], s[i - 1], s[i], s[i + 1]];
      if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
      xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
  }
  return xs.length ? pick(...xs) : 0;
}

type Box = { x0: number; x1: number; y0: number; y1: number };

function box(strokes: number[][]): Box {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const s of strokes) {
    for (let i = 0; i < s.length; i += 2) {
      b.x0 = Math.min(b.x0, s[i]);
      b.x1 = Math.max(b.x1, s[i]);
      b.y0 = Math.min(b.y0, s[i + 1]);
      b.y1 = Math.max(b.y1, s[i + 1]);
    }
  }
  return b;
}

function parseGlyph(code: string): Glyph {
  const left = code.charCodeAt(0) - 82;
  const right = code.charCodeAt(1) - 82;
  const strokes: number[][] = [];
  let stroke: number[] = [];
  for (let i = 2; i < code.length; i += 2) {
    if (code[i] === ' ' && code[i + 1] === 'R') {
      if (stroke.length) strokes.push(stroke);
      stroke = [];
    } else stroke.push(code.charCodeAt(i) - 82 - left, code.charCodeAt(i + 1) - 82);
  }
  if (stroke.length) strokes.push(stroke);
  return { left: 0, right: right - left, strokes };
}

function compose(face: Face, char: string): Shaped | null {
  const plain = face.glyphs.get(char);
  if (plain) return { width: plain.right, strokes: plain.strokes };
  if (char === '°') return { width: 8, strokes: [ring(4, -10, 2.2)] };
  const barred = BARRED[char];
  if (barred) {
    const base = face.glyphs.get(barred[0]);
    if (!base) return null;
    return { width: base.right, strokes: [...base.strokes, barred[1](base.strokes)] };
  }
  const [first, ...marks] = [...char.normalize('NFD')];
  const base = SWAP[first] ?? first;
  const glyph = face.glyphs.get(base);
  if (!glyph || !marks.length || marks.some((m) => !ABOVE[m] && !BELOW[m])) return null;
  const dotless = base === 'i' || base === 'j';
  const strokes = dotless ? glyph.strokes.filter((s) => box([s]).y1 > -6) : glyph.strokes;
  const b = box(glyph.strokes);
  const middle = (b.x0 + b.x1) / 2;
  let top = base !== base.toLowerCase() || /[bdfhklt]/.test(base) ? -15 : -8;
  const added: number[][] = [];
  for (const mark of marks) {
    const shapes = ABOVE[mark]?.(top) ?? BELOW[mark];
    added.push(...shapes.map((s) => s.map((v, i) => (i % 2 ? v : v + middle))));
    if (ABOVE[mark]) top -= 4;
  }
  return { width: glyph.right, strokes: [...strokes, ...added] };
}

let sources: Map<string, Map<string, Glyph>> | null = null;
const merged = new Map<string, Face>();

function faceFor(names: string[]): Face | null {
  if (!sources) return null;
  const key = names.join(' ');
  let face = merged.get(key);
  if (!face) {
    const glyphs = new Map<string, Glyph>();
    for (const name of [...names, ...SHARED]) for (const [char, glyph] of sources.get(name) ?? []) if (!glyphs.has(char)) glyphs.set(char, glyph);
    face = { glyphs, shaped: new Map() };
    merged.set(key, face);
  }
  return face;
}
let loading: Promise<void> | null = null;

export function isHershey(family: string): boolean {
  return Object.hasOwn(FAMILIES, family);
}

export function loadHershey(): Promise<void> {
  loading ??= fetch('/hershey.json')
    .then((res) => (res.ok ? (res.json() as Promise<{ fonts: Record<string, Record<string, string>> }>) : Promise.reject(new Error(String(res.status)))))
    .then(({ fonts }) => {
      sources = new Map(
        Object.entries(fonts).map(([name, codes]) => [name, new Map(Object.entries(codes).map(([char, code]) => [char, parseGlyph(code)]))]),
      );
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function hersheyName(family: string): SVGSVGElement | null {
  const face = isHershey(family) ? faceFor(FAMILIES[family].regular) : null;
  const chars = face && shape(face, family);
  if (!chars) return null;
  let cursor = 0;
  let d = '';
  for (const char of chars) {
    for (const s of char.strokes) {
      d += `M${s[0] + cursor} ${s[1]}`;
      for (let i = 2; i < s.length; i += 2) d += `L${s[i] + cursor} ${s[i + 1]}`;
    }
    cursor += char.width;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `-1 -14 ${cursor + 2} 31`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', family);
  svg.style.height = '1.05em';
  svg.style.verticalAlign = 'middle';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

type Pen = { family: string; size: number; heavy: boolean; face: Face };

function pen(font: string): Pen | null {
  const match = font.match(/(?:^|\s)(\d*\.?\d+)px(?:\s*\/\s*\S+)?\s+["']?([^"',]+?)["']?\s*(?:,|$)/);
  if (!match || !isHershey(match[2])) return null;
  const family = FAMILIES[match[2]];
  const bold = /(?:^|\s)(bold|bolder|[6-9]00)\s/.test(font);
  const face = faceFor((bold && family.bold) || family.regular);
  return face ? { family: match[2], size: Number(match[1]), heavy: bold && !family.bold, face } : null;
}

function shape(face: Face, text: string): Shaped[] | null {
  const chars = [...[...text].map((c) => SWAP[c] ?? c).join('')];
  const out: Shaped[] = [];
  for (const char of chars) {
    if (!face.shaped.has(char)) face.shaped.set(char, compose(face, char));
    const shaped = face.shaped.get(char);
    if (!shaped) return null;
    out.push(shaped);
  }
  return out;
}

function spacing(ctx: CanvasRenderingContext2D): number {
  return 'letterSpacing' in ctx ? parseFloat(ctx.letterSpacing) || 0 : 0;
}

function measure(ctx: CanvasRenderingContext2D, p: Pen, chars: Shaped[]): number {
  return chars.reduce((sum, c) => sum + c.width, 0) * (p.size / EM) + spacing(ctx) * chars.length;
}

function trace(ctx: CanvasRenderingContext2D, p: Pen, chars: Shaped[], x: number, y: number): void {
  const scale = p.size / EM;
  const width = measure(ctx, p, chars);
  const align = ctx.textAlign;
  let cursor = align === 'center' ? x - width / 2 : align === 'right' || align === 'end' ? x - width : x;
  const base = BASELINES[ctx.textBaseline] ?? 9;
  const gap = spacing(ctx);
  ctx.beginPath();
  for (const char of chars) {
    for (const s of char.strokes) {
      ctx.moveTo(cursor + s[0] * scale, y + (s[1] - base) * scale);
      for (let i = 2; i < s.length; i += 2) ctx.lineTo(cursor + s[i] * scale, y + (s[i + 1] - base) * scale);
    }
    cursor += char.width * scale + gap;
  }
}

function ink(p: Pen): number {
  return Math.max(0.6, p.size * (p.heavy ? 0.095 : 0.07));
}

function withoutHershey(font: string, family: string): string {
  return font.replace(new RegExp(`["']?${family}["']?\\s*,\\s*`), '');
}

const patched = new WeakSet<object>();

export function strokeFonts(ctx: CanvasRenderingContext2D): void {
  if (patched.has(ctx)) return;
  patched.add(ctx);
  const fill = ctx.fillText.bind(ctx);
  const outline = ctx.strokeText.bind(ctx);
  const metrics = ctx.measureText.bind(ctx);

  const fallback = <T>(p: Pen, run: () => T): T => {
    const font = ctx.font;
    ctx.font = withoutHershey(font, p.family);
    const result = run();
    ctx.font = font;
    return result;
  };

  const draw = (text: string, x: number, y: number, halo: boolean, plain: () => void) => {
    const p = pen(ctx.font);
    if (!p) return plain();
    const chars = shape(p.face, text);
    if (!chars) return fallback(p, plain);
    ctx.save();
    if (!halo) ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = halo ? ctx.lineWidth + ink(p) : ink(p);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    trace(ctx, p, chars, x, y);
    ctx.stroke();
    ctx.restore();
  };

  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) =>
    draw(text, x, y, false, () => (maxWidth === undefined ? fill(text, x, y) : fill(text, x, y, maxWidth)));
  ctx.strokeText = (text: string, x: number, y: number, maxWidth?: number) =>
    draw(text, x, y, true, () => (maxWidth === undefined ? outline(text, x, y) : outline(text, x, y, maxWidth)));
  ctx.measureText = (text: string) => {
    const p = pen(ctx.font);
    if (!p) return metrics(text);
    const chars = shape(p.face, text);
    if (!chars) return fallback(p, () => metrics(text));
    const width = measure(ctx, p, chars);
    const scale = p.size / EM;
    const base = BASELINES[ctx.textBaseline] ?? 9;
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: (base + 12) * scale,
      actualBoundingBoxDescent: (16 - base) * scale,
      fontBoundingBoxAscent: (base + 16) * scale,
      fontBoundingBoxDescent: (16 - base) * scale,
    } as TextMetrics;
  };
}
