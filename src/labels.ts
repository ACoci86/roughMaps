import type { Label, Point, Scene } from './sketch';

export const LABEL_FONT = 'Gaegu';

type Box = [number, number, number, number];
type Glyph = { char: string; x: number; y: number; angle: number };

export type PlacedLabel = {
  glyphs: Glyph[];
  size: number;
  bold: boolean;
  role: 'place' | 'street' | 'water';
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

function font(size: number, bold: boolean): string {
  return `${bold ? 700 : 400} ${size}px ${LABEL_FONT}`;
}

function glyphBoxes(glyphs: Glyph[], size: number): Box[] {
  const half = size * 0.45;
  return glyphs.map(({ x, y }) => [x - half, y - half, x + half, y + half]);
}

function straight(ctx: CanvasRenderingContext2D, text: string, [x, y]: Point): Glyph[] {
  const total = ctx.measureText(text).width;
  let cursor = x - total / 2;
  return [...text].map((char) => {
    const w = ctx.measureText(char).width;
    const glyph = { char, x: cursor + w / 2, y, angle: 0 };
    cursor += w;
    return glyph;
  });
}

function along(ctx: CanvasRenderingContext2D, text: string, points: Point[]): Glyph[] | null {
  const pts = points[points.length - 1][0] < points[0][0] ? [...points].reverse() : points;
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const length = cumulative[cumulative.length - 1];
  const widths = [...text].map((char) => ctx.measureText(char).width);
  const total = widths.reduce((a, b) => a + b, 0);
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

  const glyphs: Glyph[] = [];
  let cursor = (length - total) / 2;
  for (const [i, char] of [...text].entries()) {
    const { x, y, angle } = at(cursor + widths[i] / 2);
    const previous = glyphs[glyphs.length - 1];
    if (previous) {
      const bend = Math.abs(Math.atan2(Math.sin(angle - previous.angle), Math.cos(angle - previous.angle)));
      if (bend > MAX_BEND) return null;
    }
    glyphs.push({ char, x, y, angle });
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

export function layoutLabels(ctx: CanvasRenderingContext2D, scene: Scene, placer: Placer): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  const placePoint = (label: Label, size: number, bold: boolean, role: PlacedLabel['role']) => {
    ctx.font = font(size, bold);
    const glyphs = straight(ctx, label.name, label.points[0]);
    if (placer.tryAdd(glyphBoxes(glyphs, size))) placed.push({ glyphs, size, bold, role });
  };

  const placeLines = (labels: Label[], size: (l: Label) => number, role: PlacedLabel['role']) => {
    const centres = new Map<string, Point[]>();
    for (const label of labels) {
      const s = size(label);
      ctx.font = font(s, false);
      const glyphs = along(ctx, label.name, label.points);
      if (!glyphs) continue;
      const middle = glyphs[Math.floor(glyphs.length / 2)];
      const same = centres.get(label.name) ?? [];
      if (same.some(([x, y]) => Math.hypot(x - middle.x, y - middle.y) < SAME_NAME_GAP)) continue;
      if (!placer.tryAdd(glyphBoxes(glyphs, s))) continue;
      centres.set(label.name, [...same, [middle.x, middle.y]]);
      placed.push({ glyphs, size: s, bold: false, role });
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

export function drawLabel(ctx: CanvasRenderingContext2D, label: PlacedLabel, ink: string, halo: string): void {
  ctx.save();
  ctx.font = font(label.size, label.bold);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, label.size * 0.22);
  ctx.strokeStyle = halo;
  ctx.fillStyle = ink;
  for (const pass of ['halo', 'ink'] as const) {
    for (const { char, x, y, angle } of label.glyphs) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (pass === 'ink') ctx.fillText(char, 0, 0);
      else if (char !== ' ') ctx.strokeText(char, 0, 0);
      else {
        const w = ctx.measureText(' ').width + ctx.lineWidth;
        ctx.fillStyle = halo;
        ctx.fillRect(-w / 2, -label.size * 0.25, w, label.size * 0.5);
        ctx.fillStyle = ink;
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
