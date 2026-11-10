import type { Label, Point, Scene } from './sketch';

const LATIN_FONT = 'Gaegu';
const FALLBACK = `"${LATIN_FONT}", "Patrick Hand", "LXGW WenKai TC", sans-serif`;

const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30ff\u31f0-\u31ff]/, 'Yomogi'],
  [/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/, LATIN_FONT],
  [/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/, 'Aref Ruqaa'],
  [/[\u0590-\u05ff\ufb1d-\ufb4f]/, 'Gveret Levin'],
  [/[\u0400-\u052f\u1c80-\u1c8f\ua640-\ua69f]/, 'Pangolin'],
  [/[\u0370-\u03ff\u1f00-\u1fff]/, 'Arima'],
  [/[\u0b80-\u0bff\u0d00-\u0d7f]/, 'Arima'],
  [/[\u0980-\u09ff]/, 'Galada'],
  [/[\u0e00-\u0e7f]/, 'Itim'],
  [/[\u0900-\u097f]/, 'Kalam'],
  [/[\u00c0-\u024f\u1e00-\u1eff]/, 'Patrick Hand'],
];
const JOINED = /[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0fff\u1000-\u109f\u1780-\u17ff\ufb1d-\ufeff]/;
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;

type Area = [number, number, number, number];
const TRADITIONAL: Area[] = [
  [119, 21.5, 122.5, 25.6],
  [113.4, 22.1, 114.5, 22.6],
];
const JAPAN: Area[] = [[122.5, 24, 154, 46]];

function within([lng, lat]: [number, number], areas: Area[]): boolean {
  return areas.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n);
}

export function fontFamily(text: string, center: [number, number]): string {
  for (const [pattern, family] of SCRIPTS) if (pattern.test(text)) return family;
  if (HAN.test(text)) {
    if (within(center, TRADITIONAL)) return 'LXGW WenKai TC';
    if (within(center, JAPAN)) return 'Yomogi';
    return 'ZCOOL KuaiLe';
  }
  return LATIN_FONT;
}

function allLabels(scene: Scene): string[] {
  return [...scene.places, ...scene.waterNames, ...scene.streetNames].map((l) => l.name);
}

export async function loadLabelFonts(scene: Scene): Promise<void> {
  const byFamily = new Map<string, Set<string>>();
  for (const text of allLabels(scene)) {
    const family = fontFamily(text, scene.center);
    if (!byFamily.has(family)) byFamily.set(family, new Set());
    for (const char of text) byFamily.get(family)!.add(char);
  }
  byFamily.set(LATIN_FONT, new Set([...(byFamily.get(LATIN_FONT) ?? []), ...'Aa']));
  await Promise.all(
    [...byFamily].flatMap(([family, chars]) => {
      const sample = [...chars].join('');
      return [400, 700].map((weight) => document.fonts.load(`${weight} 16px "${family}"`, sample).catch(() => []));
    }),
  );
}

type Box = [number, number, number, number];
type Glyph = { char: string; x: number; y: number; angle: number; width: number };

export type PlacedLabel = {
  glyphs: Glyph[];
  size: number;
  bold: boolean;
  role: 'place' | 'street' | 'water';
  family: string;
};

const PLACE_SIZES: Record<string, number> = {
  city: 30,
  town: 26,
  village: 22,
  suburb: 22,
  quarter: 19,
  neighbourhood: 18,
};

const STREET_SIZES: Record<string, number> = {
  motorway: 15,
  trunk: 15,
  primary: 15,
  secondary: 15,
  tertiary: 14,
  minor: 13,
  service: 12,
};

const SAME_NAME_GAP = 260;
const MAX_BEND = 0.6;

export class Placer {
  private boxes: Box[] = [];

  constructor(private width: number, private height: number) {}

  fits(boxes: Box[]): boolean {
    return boxes.every(
      ([x0, y0, x1, y1]) =>
        x0 >= 4 &&
        y0 >= 4 &&
        x1 <= this.width - 4 &&
        y1 <= this.height - 4 &&
        !this.boxes.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0),
    );
  }

  add(boxes: Box[]): void {
    this.boxes.push(...boxes);
  }

  tryAdd(boxes: Box[]): boolean {
    if (!this.fits(boxes)) return false;
    this.add(boxes);
    return true;
  }
}

const FONT_SCALE: Record<string, number> = { 'Aref Ruqaa': 1.25 };

function font(size: number, bold: boolean, family: string): string {
  return `${bold ? 700 : 400} ${size * (FONT_SCALE[family] ?? 1)}px "${family}", ${FALLBACK}`;
}

function glyphBoxes(glyphs: Glyph[], size: number): Box[] {
  const half = size * 0.45;
  return glyphs.flatMap(({ x, y, angle, width }) => {
    const steps = Math.max(1, Math.ceil(width / (half * 2)));
    return Array.from({ length: steps }, (_, i): Box => {
      const offset = steps === 1 ? 0 : (i / (steps - 1) - 0.5) * (width - half * 2);
      const cx = x + Math.cos(angle) * offset;
      const cy = y + Math.sin(angle) * offset;
      return [cx - half, cy - half, cx + half, cy + half];
    });
  });
}

function straight(ctx: CanvasRenderingContext2D, text: string, [x, y]: Point): Glyph[] {
  return [{ char: text, x, y, angle: 0, width: ctx.measureText(text).width }];
}

function along(ctx: CanvasRenderingContext2D, text: string, points: Point[], size: number): Glyph[] | null {
  const pts = points[points.length - 1][0] < points[0][0] ? [...points].reverse() : points;
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const length = cumulative[cumulative.length - 1];
  const widths = [...text].map((char) => ctx.measureText(char).width);
  const total = JOINED.test(text) ? ctx.measureText(text).width : widths.reduce((a, b) => a + b, 0);
  if (total > length * 0.85) return null;

  const at = (distance: number) => {
    let i = 1;
    while (i < pts.length - 1 && cumulative[i] < distance) i++;
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const span = cumulative[i] - cumulative[i - 1] || 1;
    const t = (distance - cumulative[i - 1]) / span;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) };
  };

  if (JOINED.test(text)) {
    const start = at((length - total) / 2);
    const end = at((length + total) / 2);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    for (let k = 1; k < 8; k++) {
      const p = at((length - total) / 2 + (total * k) / 8);
      const offLine = Math.abs((p.x - start.x) * Math.sin(angle) - (p.y - start.y) * Math.cos(angle));
      if (offLine > size * 0.4) return null;
    }
    return [{ char: text, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, angle, width: total }];
  }

  const glyphs: Glyph[] = [];
  let cursor = (length - total) / 2;
  for (const [i, char] of [...text].entries()) {
    const { x, y, angle } = at(cursor + widths[i] / 2);
    const previous = glyphs[glyphs.length - 1];
    if (previous) {
      const bend = Math.abs(Math.atan2(Math.sin(angle - previous.angle), Math.cos(angle - previous.angle)));
      if (bend > MAX_BEND) return null;
    }
    glyphs.push({ char, x, y, angle, width: widths[i] });
    cursor += widths[i];
  }
  return glyphs;
}

function lineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

export function layoutLabels(ctx: CanvasRenderingContext2D, scene: Scene, placer: Placer, scale = 1): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  const placePoint = (label: Label, base: number, bold: boolean, role: PlacedLabel['role']) => {
    const size = Math.round(base * scale * 10) / 10;
    const family = fontFamily(label.name, scene.center);
    ctx.font = font(size, bold, family);
    const glyphs = straight(ctx, label.name, label.points[0]);
    if (placer.tryAdd(glyphBoxes(glyphs, size))) placed.push({ glyphs, size, bold, role, family });
  };

  const placeLines = (labels: Label[], size: (l: Label) => number, role: PlacedLabel['role']) => {
    const centres = new Map<string, Point[]>();
    for (const label of labels) {
      const s = Math.round(size(label) * scale * 10) / 10;
      const family = fontFamily(label.name, scene.center);
      ctx.font = font(s, false, family);
      const glyphs = along(ctx, label.name, label.points, s);
      if (!glyphs) continue;
      const middle = glyphs[Math.floor(glyphs.length / 2)];
      const same = centres.get(label.name) ?? [];
      if (same.some(([x, y]) => Math.hypot(x - middle.x, y - middle.y) < SAME_NAME_GAP)) continue;
      if (!placer.tryAdd(glyphBoxes(glyphs, s))) continue;
      centres.set(label.name, [...same, [middle.x, middle.y]]);
      placed.push({ glyphs, size: s, bold: false, role, family });
    }
  };

  [...scene.places]
    .sort((a, b) => (PLACE_SIZES[b.kind] ?? 18) - (PLACE_SIZES[a.kind] ?? 18))
    .forEach((label) => placePoint(label, PLACE_SIZES[label.kind] ?? 18, true, 'place'));

  scene.waterNames
    .filter((l) => l.points.length === 1)
    .forEach((label) => placePoint(label, 15, false, 'water'));
  placeLines(
    scene.waterNames.filter((l) => l.points.length > 1).sort((a, b) => lineLength(b.points) - lineLength(a.points)),
    () => 17,
    'water',
  );

  const streetRank = (kind: string) => STREET_SIZES[kind] ?? 0;
  placeLines(
    scene.streetNames
      .filter((l) => streetRank(l.kind) > 0)
      .sort((a, b) => streetRank(b.kind) - streetRank(a.kind) || lineLength(b.points) - lineLength(a.points)),
    (l) => streetRank(l.kind),
    'street',
  );

  return placed;
}

function wiggle(n: number): number {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function letters(ctx: CanvasRenderingContext2D, glyphs: Glyph[]): Glyph[] {
  return glyphs.flatMap((g) => {
    const chars = [...g.char];
    if (chars.length < 2 || JOINED.test(g.char)) return [g];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let cursor = -total / 2;
    return chars.map((char, i) => {
      const middle = cursor + widths[i] / 2;
      cursor += widths[i];
      return { char, x: g.x + Math.cos(g.angle) * middle, y: g.y + Math.sin(g.angle) * middle, angle: g.angle, width: widths[i] };
    });
  });
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: PlacedLabel,
  ink: string,
  halo: string,
  jitter = 0,
): void {
  ctx.save();
  ctx.font = font(label.size, label.bold, label.family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, label.size * 0.22);
  ctx.strokeStyle = halo;
  ctx.fillStyle = ink;
  const glyphs = jitter > 0 ? letters(ctx, label.glyphs) : label.glyphs;
  for (const pass of ['halo', 'ink'] as const) {
    glyphs.forEach(({ char, x, y, angle }, i) => {
      const seed = Math.round(x * 7 + y * 13) + i * 31;
      ctx.save();
      ctx.translate(x, y + wiggle(seed) * label.size * 0.08 * jitter);
      ctx.rotate(angle + wiggle(seed + 1) * 0.12 * jitter);
      const scale = 1 + wiggle(seed + 2) * 0.08 * jitter;
      ctx.scale(scale, scale);
      if (pass === 'ink') ctx.fillText(char, 0, 0);
      else if (char !== ' ') ctx.strokeText(char, 0, 0);
      else {
        const w = ctx.measureText(' ').width + ctx.lineWidth;
        ctx.fillStyle = halo;
        ctx.fillRect(-w / 2, -label.size * 0.25, w, label.size * 0.5);
        ctx.fillStyle = ink;
      }
      ctx.restore();
    });
  }
  ctx.restore();
}
