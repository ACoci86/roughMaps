import type { Drawable } from 'roughjs/bin/core';

type Pt = [number, number];

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function fillOffset(index: number, roughness: number): Pt {
  const reach = Math.min(3, 0.5 + 0.55 * roughness);
  const angle = hash(index) * Math.PI * 2;
  const amount = reach * (0.5 + 0.5 * hash(index + 0.5));
  return [Math.cos(angle) * amount, Math.sin(angle) * amount];
}

export function onlyFill(drawable: Drawable): Drawable {
  return { ...drawable, sets: drawable.sets.filter((s) => s.type !== 'path') };
}

export function onlyLines(drawable: Drawable): Drawable {
  return { ...drawable, sets: drawable.sets.filter((s) => s.type === 'path') };
}

function strokes(drawable: Drawable): Pt[][] {
  const list: Pt[][] = [];
  for (const set of drawable.sets) {
    if (set.type !== 'path') continue;
    let current: Pt[] = [];
    for (const { op, data } of set.ops) {
      if (op === 'move') {
        if (current.length > 1) list.push(current);
        current = [[data[0], data[1]]];
      } else if (op === 'lineTo') {
        current.push([data[0], data[1]]);
      } else if (current.length) {
        const [x0, y0] = current[current.length - 1];
        for (let k = 1; k <= 5; k++) {
          const t = k / 5;
          const u = 1 - t;
          current.push([
            u * u * u * x0 + 3 * u * u * t * data[0] + 3 * u * t * t * data[2] + t * t * t * data[4],
            u * u * u * y0 + 3 * u * u * t * data[1] + 3 * u * t * t * data[3] + t * t * t * data[5],
          ]);
        }
      }
    }
    if (current.length > 1) list.push(current);
  }
  return list;
}

export function inkLines(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable,
  color: string,
  width: number,
  seed: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const points of strokes(drawable)) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = lengths[lengths.length - 1];
    if (total < 0.5) continue;
    const phase = hash(seed) * Math.PI * 2;
    const half = (i: number) => {
      const t = lengths[i] / total;
      const taper = Math.min(1, 0.35 + 2.6 * Math.min(t, 1 - t));
      const nib = 0.8 + 0.45 * Math.sin(phase + lengths[i] / 11);
      return (width / 2) * taper * nib;
    };
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[Math.max(0, i - 1)];
      const [bx, by] = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const h = half(i);
      left.push([points[i][0] + nx * h, points[i][1] + ny * h]);
      right.push([points[i][0] - nx * h, points[i][1] - ny * h]);
    }
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  }
  ctx.fill('nonzero');
  ctx.restore();
}
