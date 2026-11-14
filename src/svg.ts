import { outlines } from './terrain';

type Matrix = [number, number, number, number, number, number];
type Laser = { paper: string };

const LASER_LINE = 0.5;
const TEXT_SCALE = 6;
const PAPER_GAP = 48;

function rgba(colour: string): [number, number, number, number] | null {
  const hex = colour.trim().match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const v = [0, 2, 4, 6].map((i) => parseInt(full.slice(i, i + 2) || 'ff', 16));
    return [v[0], v[1], v[2], v[3] / 255];
  }
  const fn = colour.match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (!fn) return null;
  const [r, g, b, a = 1] = fn.split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
}

function paperLike(colour: string, paper: string): boolean {
  const c = rgba(colour);
  const p = rgba(paper);
  if (!c || !p) return false;
  if (c[3] < 0.2) return true;
  return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) < PAPER_GAP;
}

type Run = { points: number[]; attrs: string; order: number };
type Mask = { rings: number[][]; order: number };

const COVER_SCALE = 0.2;
const COVER_STEP = 2.5;

function clipSegment(ax: number, ay: number, bx: number, by: number, w: number, h: number): number[] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax],
    [dx, w - ax],
    [-dy, ay],
    [dy, h - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}

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

type Op = { cmd: 'M' | 'L' | 'C' | 'Z'; at: number[] };
type Piece = { ops: Op[]; x0: number; y0: number; x1: number; y1: number };

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

function tenths(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const whole = Math.floor(a / 10);
  const part = a % 10;
  if (!part) return sign + whole;
  return `${sign}${whole || ''}.${part}`;
}

function pathData(pieces: Piece[]): string {
  let out = '';
  let last = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const put = (cmd: string, values: number[]) => {
    if (cmd !== last) out += cmd;
    else if (values[0] >= 0) out += ' ';
    values.forEach((v, i) => {
      if (i > 0 && v >= 0) out += ' ';
      out += tenths(v);
    });
    last = cmd === 'm' ? 'l' : cmd;
  };
  for (const piece of pieces) {
    for (const { cmd, at } of piece.ops) {
      if (cmd === 'Z') {
        out += 'z';
        last = 'z';
        x = startX;
        y = startY;
        continue;
      }
      const relative = at.map((v, i) => v - (i % 2 ? y : x));
      put(cmd.toLowerCase(), relative);
      x = at[at.length - 2];
      y = at[at.length - 1];
      if (cmd === 'M') {
        startX = x;
        startY = y;
      }
    }
  }
  return out;
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
  private pieces: Piece[] = [];
  private group = '';
  private measurer = document.createElement('canvas').getContext('2d')!;
  readonly parts: string[] = [];
  readonly families = new Set<string>();
  readonly chars = new Set<number>();

  readonly textParts: string[] = [];
  private runs: Run[] = [];
  private masks: Mask[] = [];
  private order = 0;
  private outliner: HTMLCanvasElement | null = null;

  constructor(
    private size: () => [number, number],
    private laser: Laser | null = null,
  ) {}

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

  private zoom(): number {
    const [a, b, c, d] = this.state.matrix;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  private add(cmd: 'M' | 'L' | 'C', coords: number[]): void {
    const [a, b, c, d, e, f] = this.state.matrix;
    const at: number[] = [];
    for (let i = 0; i < coords.length; i += 2) {
      const [x, y] = [coords[i], coords[i + 1]];
      at.push(Math.round((a * x + c * y + e) * 10), Math.round((b * x + d * y + f) * 10));
    }
    let piece = this.pieces[this.pieces.length - 1];
    if (cmd === 'M' || !piece) {
      piece = { ops: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      this.pieces.push(piece);
      cmd = 'M';
      at.splice(0, at.length - 2);
    }
    piece.ops.push({ cmd, at });
    for (let i = 0; i < at.length; i += 2) {
      if (at[i] < piece.x0) piece.x0 = at[i];
      if (at[i] > piece.x1) piece.x1 = at[i];
      if (at[i + 1] < piece.y0) piece.y0 = at[i + 1];
      if (at[i + 1] > piece.y1) piece.y1 = at[i + 1];
    }
  }

  private onFrame(reach: number): Piece[] {
    const [width, height] = this.size();
    const m = Math.ceil(reach * 10) + 10;
    const w = width * 10;
    const h = height * 10;
    return this.pieces.filter((p) => p.x1 >= -m && p.x0 <= w + m && p.y1 >= -m && p.y0 <= h + m);
  }

  private emit(attrs: string, element: string): void {
    if (attrs !== this.group) {
      if (this.group) this.parts.push('</g>');
      if (attrs) this.parts.push(`<g ${attrs}>`);
      this.group = attrs;
    }
    this.parts.push(element);
  }

  finish(): void {
    this.emit('', '');
  }

  beginPath(): void {
    this.pieces = [];
  }

  moveTo(x: number, y: number): void {
    this.add('M', [x, y]);
  }

  lineTo(x: number, y: number): void {
    this.add('L', [x, y]);
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.add('C', [x1, y1, x2, y2, x, y]);
  }

  closePath(): void {
    this.pieces[this.pieces.length - 1]?.ops.push({ cmd: 'Z', at: [] });
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
    if (this.laser) {
      if (visible(this.state.fillStyle) && this.covers(this.state.fillStyle)) this.addMask(this.flatRings());
      return;
    }
    if (!visible(this.state.fillStyle)) return;
    const pieces = this.onFrame(0);
    if (!pieces.length) return;
    const ruleAttr = rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    this.emit(`fill="${escape(this.state.fillStyle)}"${ruleAttr}`, `<path d="${pathData(pieces)}"/>`);
  }

  private laserLines(): number[][] {
    const [width, height] = this.size();
    const w = width * 10;
    const h = height * 10;
    const runs: number[][] = [];
    for (const piece of this.pieces) {
      let run: number[] = [];
      let x = 0;
      let y = 0;
      let sx = 0;
      let sy = 0;
      const to = (nx: number, ny: number) => {
        const cut = clipSegment(x, y, nx, ny, w, h);
        if (cut) {
          const joined = run.length && run[run.length - 2] === cut[0] && run[run.length - 1] === cut[1];
          if (!joined) {
            if (run.length >= 4) runs.push(run);
            run = [cut[0], cut[1]];
          }
          run.push(cut[2], cut[3]);
        }
        x = nx;
        y = ny;
      };
      for (const { cmd, at } of piece.ops) {
        if (cmd === 'M') {
          [x, y] = at;
          [sx, sy] = at;
        } else if (cmd === 'L') {
          to(at[0], at[1]);
        } else if (cmd === 'C') {
          const [x0, y0] = [x, y];
          for (let k = 1; k <= 6; k++) {
            const t = k / 6;
            const u = 1 - t;
            to(
              u * u * u * x0 + 3 * u * u * t * at[0] + 3 * u * t * t * at[2] + t * t * t * at[4],
              u * u * u * y0 + 3 * u * u * t * at[1] + 3 * u * t * t * at[3] + t * t * t * at[5],
            );
          }
        } else {
          to(sx, sy);
        }
      }
      if (run.length >= 4) runs.push(run);
    }
    return runs;
  }

  private flatRings(): number[][] {
    const rings: number[][] = [];
    for (const piece of this.pieces) {
      let ring: number[] = [];
      let x = 0;
      let y = 0;
      for (const { cmd, at } of piece.ops) {
        if (cmd === 'M') {
          if (ring.length >= 6) rings.push(ring);
          ring = [at[0], at[1]];
          [x, y] = at;
        } else if (cmd === 'L') {
          ring.push(at[0], at[1]);
          [x, y] = at;
        } else if (cmd === 'C') {
          for (let k = 1; k <= 4; k++) {
            const t = k / 4;
            const u = 1 - t;
            ring.push(
              u * u * u * x + 3 * u * u * t * at[0] + 3 * u * t * t * at[2] + t * t * t * at[4],
              u * u * u * y + 3 * u * u * t * at[1] + 3 * u * t * t * at[3] + t * t * t * at[5],
            );
          }
          [x, y] = [at[4], at[5]];
        }
      }
      if (ring.length >= 6) rings.push(ring);
    }
    return rings;
  }

  private addMask(rings: number[][]): void {
    if (!rings.length) return;
    this.masks.push({ rings, order: this.order++ });
  }

  private covers(colour: string): boolean {
    const c = rgba(colour);
    return !!c && c[3] >= 0.5;
  }

  private coverage(): { order: Int32Array; cols: number; rows: number } {
    const [width, height] = this.size();
    const cols = Math.ceil(width * 10 * COVER_SCALE);
    const rows = Math.ceil(height * 10 * COVER_SCALE);
    const order = new Int32Array(cols * rows).fill(-1);
    if (!this.masks.length || !cols || !rows) return { order, cols, rows };
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(COVER_SCALE, 0, 0, COVER_SCALE, 0, 0);
    this.masks.forEach((mask, i) => {
      const code = i + 1;
      g.fillStyle = `rgb(${(code >> 16) & 255}, ${(code >> 8) & 255}, ${code & 255})`;
      g.beginPath();
      for (const ring of mask.rings) {
        g.moveTo(ring[0], ring[1]);
        for (let k = 2; k < ring.length; k += 2) g.lineTo(ring[k], ring[k + 1]);
        g.closePath();
      }
      g.fill('evenodd');
    });
    const data = g.getImageData(0, 0, cols, rows).data;
    for (let i = 0; i < order.length; i++) {
      const code = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
      order[i] = code ? (this.masks[code - 1]?.order ?? -1) : -1;
    }
    return { order, cols, rows };
  }

  laserPaths(): string[] {
    const { order, cols, rows } = this.coverage();
    const hidden = (x: number, y: number, after: number) => {
      const c = Math.floor(x * COVER_SCALE);
      const r = Math.floor(y * COVER_SCALE);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      return order[r * cols + c] > after;
    };
    const calls = new Map<string, { attrs: string; pieces: Piece[] }>();
    for (const run of this.runs) {
      const key = `${run.order}|${run.attrs}`;
      let call = calls.get(key);
      if (!call) calls.set(key, (call = { attrs: run.attrs, pieces: [] }));
      let ops: Op[] = [];
      const flush = () => {
        if (ops.length > 1) call!.pieces.push({ ops, x0: 0, y0: 0, x1: 0, y1: 0 });
        ops = [];
      };
      const visit = (x: number, y: number) => {
        const at = [Math.round(x), Math.round(y)];
        const last = ops[ops.length - 1]?.at;
        if (last && last[0] === at[0] && last[1] === at[1]) return;
        ops.push({ cmd: ops.length ? 'L' : 'M', at });
      };
      const p = run.points;
      let shown = !hidden(p[0], p[1], run.order);
      if (shown) visit(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) {
        const [ax, ay, bx, by] = [p[i - 2], p[i - 1], p[i], p[i + 1]];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / COVER_STEP));
        for (let k = 1; k <= steps; k++) {
          const x = ax + ((bx - ax) * k) / steps;
          const y = ay + ((by - ay) * k) / steps;
          const now = !hidden(x, y, run.order);
          if (now !== shown) {
            if (now) visit(x, y);
            else flush();
            shown = now;
          } else if (now && k === steps) {
            visit(x, y);
          }
        }
      }
      flush();
    }
    const groups = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const { attrs, pieces } of calls.values()) {
      const d = pathData(pieces);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const list = groups.get(attrs);
      if (list) list.push(`<path d="${d}"/>`);
      else groups.set(attrs, [`<path d="${d}"/>`]);
    }
    return [...groups].flatMap(([attrs, paths]) => [`<g ${attrs}>`, ...paths, '</g>']);
  }

  stroke(): void {
    if (this.laser) {
      if (!visible(this.state.strokeStyle)) return;
      if (paperLike(this.state.strokeStyle, this.laser.paper)) return;
      const dash = this.state.lineDash.length ? ` stroke-dasharray="${this.state.lineDash.map((v) => num(v * this.zoom())).join(' ')}"` : '';
      const attrs = `fill="none" stroke="#000000" stroke-width="${LASER_LINE}" stroke-linecap="round" stroke-linejoin="round"${dash}`;
      const order = this.order++;
      for (const points of this.laserLines()) this.runs.push({ points, attrs, order });
      return;
    }
    if (!visible(this.state.strokeStyle)) return;
    const pieces = this.onFrame(this.state.lineWidth * this.zoom());
    if (!pieces.length) return;
    this.emit(this.strokeAttrs(), `<path d="${pathData(pieces)}"/>`);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.laser) {
      if (!visible(this.state.fillStyle) || !this.covers(this.state.fillStyle)) return;
      const [a, b, c, d, e, f] = this.state.matrix;
      const at = (px: number, py: number) => [(a * px + c * py + e) * 10, (b * px + d * py + f) * 10];
      this.addMask([[...at(x, y), ...at(x + w, y), ...at(x + w, y + h), ...at(x, y + h)]]);
      return;
    }
    if (!visible(this.state.fillStyle)) return;
    const saved = this.pieces;
    this.pieces = [];
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.fill();
    this.pieces = saved;
  }

  private text(text: string, x: number, y: number, paint: string): void {
    const s = this.state;
    const family = s.font.match(/"([^"]+)"/)?.[1];
    if (family) this.families.add(family);
    for (const char of text) this.chars.add(char.codePointAt(0)!);
    const [a, b, c, d, e, f] = s.matrix;
    const font = s.font.replace(/"/g, "'");
    const spacing = parseFloat(s.letterSpacing) ? ` letter-spacing="${escape(s.letterSpacing)}"` : '';
    this.emit(
      '',
      `<text transform="matrix(${[a, b, c, d, e, f].map(num).join(' ')})" x="${num(x)}" y="${num(y)}" ` +
        `style="font: ${escape(font)}; white-space: pre" text-anchor="${ANCHORS[s.textAlign] ?? 'start'}" ` +
        `dominant-baseline="${BASELINES[s.textBaseline] ?? 'alphabetic'}"${spacing} ${paint}>${escape(text)}</text>`,
    );
  }

  private outline(text: string, x: number, y: number): string {
    const s = this.state;
    const canvas = (this.outliner ??= document.createElement('canvas'));
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    const setup = () => {
      g.font = s.font;
      if ('letterSpacing' in g) g.letterSpacing = s.letterSpacing;
      g.textAlign = s.textAlign;
      g.textBaseline = s.textBaseline;
    };
    setup();
    const m = g.measureText(text);
    const left = m.actualBoundingBoxLeft;
    const up = m.actualBoundingBoxAscent;
    const pad = 3;
    const w = Math.ceil((left + m.actualBoundingBoxRight) * TEXT_SCALE) + pad * 2;
    const h = Math.ceil((up + m.actualBoundingBoxDescent) * TEXT_SCALE) + pad * 2;
    if (w < 4 || h < 4 || w * h > 6e6) return '';
    canvas.width = w;
    canvas.height = h;
    setup();
    g.setTransform(TEXT_SCALE, 0, 0, TEXT_SCALE, pad + left * TEXT_SCALE, pad + up * TEXT_SCALE);
    g.fillStyle = '#000';
    g.fillText(text, 0, 0);
    const alpha = g.getImageData(0, 0, w, h).data;
    const cols = w + 2;
    const values = new Float32Array(cols * (h + 2));
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) values[(row + 1) * cols + col + 1] = alpha[(row * w + col) * 4 + 3] / 256;
    }
    const [a, b, c, d, e, f] = s.matrix;
    const halo = 1.5;
    const corner = (cx: number, cy: number) => {
      const tx = x + cx;
      const ty = y + cy;
      return [(a * tx + c * ty + e) * 10, (b * tx + d * ty + f) * 10];
    };
    const [l, r, t, bo] = [-left - halo, m.actualBoundingBoxRight + halo, -up - halo, m.actualBoundingBoxDescent + halo];
    this.addMask([[...corner(l, t), ...corner(r, t), ...corner(r, bo), ...corner(l, bo)]]);
    return outlines(values, cols, h + 2, 0.4)
      .map((ring) =>
        ring
          .map(([cx, cy], i) => {
            const tx = x + (cx - pad - left * TEXT_SCALE) / TEXT_SCALE;
            const ty = y + (cy - pad - up * TEXT_SCALE) / TEXT_SCALE;
            return `${i ? 'L' : 'M'}${num(a * tx + c * ty + e)} ${num(b * tx + d * ty + f)}`;
          })
          .join('') + 'Z',
      )
      .join('');
  }

  fillText(text: string, x: number, y: number): void {
    if (!visible(this.state.fillStyle)) return;
    if (this.laser) {
      if (paperLike(this.state.fillStyle, this.laser.paper) || !text.trim()) return;
      const d = this.outline(text, x, y);
      if (d) this.textParts.push(`<path d="${d}"/>`);
      return;
    }
    this.text(text, x, y, `fill="${escape(this.state.fillStyle)}"`);
  }

  strokeText(text: string, x: number, y: number): void {
    if (this.laser || !visible(this.state.strokeStyle)) return;
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

export function svgCanvas(laser: (Laser & { trim: number }) | null = null): SvgCanvas {
  const target = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new SvgContext(() => [target.width, target.height], laser);
  return {
    canvas: target as unknown as HTMLCanvasElement,
    toSvg: async ({ width, height }) => {
      ctx.finish();
      if (laser) {
        const t = laser.trim;
        return [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${target.width} ${target.height}">`,
          `<g id="engrave-lines">`,
          ...ctx.laserPaths(),
          `</g>`,
          `<g id="engrave-text" fill="none" stroke="#0000ff" stroke-width="${LASER_LINE}">`,
          ...ctx.textParts,
          `</g>`,
          `<g id="cut" fill="none" stroke="#ff0000" stroke-width="${LASER_LINE}">`,
          `<rect x="${num(t)}" y="${num(t)}" width="${num(target.width - t * 2)}" height="${num(target.height - t * 2)}"/>`,
          `</g>`,
          `</svg>`,
        ].join('\n');
      }
      const fonts = await embeddedFonts(ctx.families, ctx.chars);
      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${target.width} ${target.height}">`,
        fonts ? `<style><![CDATA[${fonts}]]></style>` : '',
        `<clipPath id="frame"><rect width="${target.width}" height="${target.height}"/></clipPath>`,
        `<g clip-path="url(#frame)">`,
        ...ctx.parts.filter(Boolean),
        `</g>`,
        `</svg>`,
      ].join('\n');
    },
  };
}
