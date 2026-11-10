type Matrix = [number, number, number, number, number, number];

type State = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineDash: number[];
  lineDashOffset: number;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  letterSpacing: string;
  matrix: Matrix;
};

const ANCHORS: Record<string, string> = { left: 'start', start: 'start', center: 'middle', right: 'end', end: 'end' };
const BASELINES: Record<string, string> = {
  top: 'text-before-edge',
  hanging: 'hanging',
  middle: 'central',
  alphabetic: 'alphabetic',
  ideographic: 'ideographic',
  bottom: 'text-after-edge',
};

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function visible(colour: string): boolean {
  return colour !== '' && colour !== 'none' && colour !== 'transparent';
}

class SvgContext {
  private state: State = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineDash: [],
    lineDashOffset: 0,
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    matrix: [1, 0, 0, 1, 0, 0],
  };
  private stack: State[] = [];
  private path: string[] = [];
  private measurer = document.createElement('canvas').getContext('2d')!;
  readonly parts: string[] = [];
  readonly families = new Set<string>();
  readonly chars = new Set<number>();

  get fillStyle() { return this.state.fillStyle; }
  set fillStyle(v: string) { this.state.fillStyle = String(v); }
  get strokeStyle() { return this.state.strokeStyle; }
  set strokeStyle(v: string) { this.state.strokeStyle = String(v); }
  get lineWidth() { return this.state.lineWidth; }
  set lineWidth(v: number) { this.state.lineWidth = v; }
  get lineDashOffset() { return this.state.lineDashOffset; }
  set lineDashOffset(v: number) { this.state.lineDashOffset = v; }
  get lineJoin() { return this.state.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { this.state.lineJoin = v; }
  get font() { return this.state.font; }
  set font(v: string) { this.state.font = v; }
  get textAlign() { return this.state.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.state.textAlign = v; }
  get textBaseline() { return this.state.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.state.textBaseline = v; }
  get letterSpacing() { return this.state.letterSpacing; }
  set letterSpacing(v: string) { this.state.letterSpacing = v; }

  save(): void {
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash], matrix: [...this.state.matrix] });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous) this.state = previous;
  }

  setLineDash(dash: number[]): void {
    this.state.lineDash = [...dash];
  }

  getLineDash(): number[] {
    return [...this.state.lineDash];
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.matrix = [a, b, c, d, e, f];
  }

  translate(x: number, y: number): void {
    const m = this.state.matrix;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }

  rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.state.matrix;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.state.matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
  }

  scale(x: number, y: number): void {
    const m = this.state.matrix;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }

  private point(x: number, y: number): string {
    const [a, b, c, d, e, f] = this.state.matrix;
    return `${num(a * x + c * y + e)} ${num(b * x + d * y + f)}`;
  }

  private zoom(): number {
    const [a, b, c, d] = this.state.matrix;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  beginPath(): void {
    this.path = [];
  }

  moveTo(x: number, y: number): void {
    this.path.push(`M${this.point(x, y)}`);
  }

  lineTo(x: number, y: number): void {
    this.path.push(`L${this.point(x, y)}`);
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.path.push(`C${this.point(x1, y1)} ${this.point(x2, y2)} ${this.point(x, y)}`);
  }

  closePath(): void {
    this.path.push('Z');
  }

  private strokeAttrs(): string {
    const z = this.zoom();
    const s = this.state;
    let attrs = `fill="none" stroke="${escape(s.strokeStyle)}" stroke-width="${num(s.lineWidth * z)}" stroke-linecap="round" stroke-linejoin="${s.lineJoin}"`;
    if (s.lineDash.length) attrs += ` stroke-dasharray="${s.lineDash.map((v) => num(v * z)).join(' ')}"`;
    if (s.lineDashOffset) attrs += ` stroke-dashoffset="${num(s.lineDashOffset * z)}"`;
    return attrs;
  }

  fill(rule?: CanvasFillRule): void {
    if (!this.path.length || !visible(this.state.fillStyle)) return;
    const ruleAttr = rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    this.parts.push(`<path d="${this.path.join('')}" fill="${escape(this.state.fillStyle)}"${ruleAttr}/>`);
  }

  stroke(): void {
    if (!this.path.length || !visible(this.state.strokeStyle)) return;
    this.parts.push(`<path d="${this.path.join('')}" ${this.strokeAttrs()}/>`);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (!visible(this.state.fillStyle)) return;
    const d = `M${this.point(x, y)}L${this.point(x + w, y)}L${this.point(x + w, y + h)}L${this.point(x, y + h)}Z`;
    this.parts.push(`<path d="${d}" fill="${escape(this.state.fillStyle)}"/>`);
  }

  private text(text: string, x: number, y: number, paint: string): void {
    const s = this.state;
    const family = s.font.match(/"([^"]+)"/)?.[1];
    if (family) this.families.add(family);
    for (const char of text) this.chars.add(char.codePointAt(0)!);
    const [a, b, c, d, e, f] = s.matrix;
    const font = s.font.replace(/"/g, "'");
    const spacing = parseFloat(s.letterSpacing) ? ` letter-spacing="${escape(s.letterSpacing)}"` : '';
    this.parts.push(
      `<text transform="matrix(${[a, b, c, d, e, f].map(num).join(' ')})" x="${num(x)}" y="${num(y)}" ` +
        `style="font: ${escape(font)}; white-space: pre" text-anchor="${ANCHORS[s.textAlign] ?? 'start'}" ` +
        `dominant-baseline="${BASELINES[s.textBaseline] ?? 'alphabetic'}"${spacing} ${paint}>${escape(text)}</text>`,
    );
  }

  fillText(text: string, x: number, y: number): void {
    if (visible(this.state.fillStyle)) this.text(text, x, y, `fill="${escape(this.state.fillStyle)}"`);
  }

  strokeText(text: string, x: number, y: number): void {
    if (!visible(this.state.strokeStyle)) return;
    const s = this.state;
    this.text(
      text,
      x,
      y,
      `fill="none" stroke="${escape(s.strokeStyle)}" stroke-width="${num(s.lineWidth)}" stroke-linejoin="${s.lineJoin}"`,
    );
  }

  measureText(text: string): TextMetrics {
    this.measurer.font = this.state.font;
    if ('letterSpacing' in this.measurer) this.measurer.letterSpacing = this.state.letterSpacing;
    return this.measurer.measureText(text);
  }
}

function inRange(range: string, chars: Set<number>): boolean {
  return range.split(',').some((part) => {
    const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-');
    const low = parseInt(from.replace(/\?/g, '0'), 16);
    const high = parseInt(to.replace(/\?/g, 'F'), 16);
    for (const c of chars) if (c >= low && c <= high) return true;
    return false;
  });
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function embeddedFonts(families: Set<string>, chars: Set<number>): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css2"]');
  if (!link || !chars.size) return '';
  try {
    const css = await (await fetch(link.href)).text();
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    const wanted = faces.filter((face) => {
      const family = face.match(/font-family:\s*'([^']+)'/)?.[1] ?? '';
      const range = face.match(/unicode-range:\s*([^;]+);/)?.[1];
      return families.has(family) && (!range || inRange(range, chars));
    });
    const embedded = await Promise.all(
      wanted.map(async (face) => {
        const url = face.match(/url\(([^)]+)\)/)?.[1];
        return url ? face.replace(url, await toDataUrl(url)) : face;
      }),
    );
    return embedded.join('\n');
  } catch {
    return `@import url('${link.href}');`;
  }
}

export type SvgCanvas = {
  canvas: HTMLCanvasElement;
  toSvg: (size: { width: string; height: string }) => Promise<string>;
};

export function svgCanvas(): SvgCanvas {
  const ctx = new SvgContext();
  const target = { width: 0, height: 0, getContext: () => ctx };
  return {
    canvas: target as unknown as HTMLCanvasElement,
    toSvg: async ({ width, height }) => {
      const fonts = await embeddedFonts(ctx.families, ctx.chars);
      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${target.width} ${target.height}">`,
        fonts ? `<style><![CDATA[${fonts}]]></style>` : '',
        ...ctx.parts,
        `</svg>`,
      ].join('\n');
    },
  };
}
