type Pt = [number, number];
type Line = { points: Pt[]; closed: boolean };

export function ringArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function distanceToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplifyPoints(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function simplifyShape(shape: Line[], tolerance: number): Line[] {
  return shape
    .map((line) => {
      const points = simplifyPoints(line.points, tolerance);
      return { ...line, points: line.closed && points.length < 4 ? line.points : points };
    })
    .filter((line) => line.points.length > 1);
}

export function mainAngle(shape: Line[]): number {
  let n = 0;
  let mx = 0;
  let my = 0;
  for (const { points } of shape) {
    for (const [x, y] of points) {
      mx += x;
      my += y;
      n++;
    }
  }
  if (n < 3) return 0;
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const { points } of shape) {
    for (const [x, y] of points) {
      sxx += (x - mx) ** 2;
      syy += (y - my) ** 2;
      sxy += (x - mx) * (y - my);
    }
  }
  return (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
}

function signedArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function splitPieces(shape: Line[]): Line[][] {
  if (shape.length < 2 || !shape.every((l) => l.closed)) return [shape];
  const outer = Math.sign(signedArea(shape[0].points));
  const pieces: Line[][] = [];
  for (const ring of shape) {
    if (!pieces.length || Math.sign(signedArea(ring.points)) === outer) pieces.push([ring]);
    else pieces[pieces.length - 1].push(ring);
  }
  return pieces;
}

export function hatchAngle(direction: number): number {
  return -direction - 90;
}
