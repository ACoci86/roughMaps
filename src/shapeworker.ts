import type { Drawable } from 'roughjs/bin/core';
import { roughPath } from './roughpath';
import { packDrawables, packJobs, unpackJobs, type Reply, type Request, type ShapeJob } from './shapewire';

type Scope = {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply, transfer: Transferable[]): void;
};

const scope = self as unknown as Scope;

function sketchAll(request: Request): Float64Array {
  const drawables = unpackJobs(request).map(({ lines, options }): Drawable | null => {
    try {
      return roughPath(lines, options);
    } catch {
      return null;
    }
  });
  return packDrawables(drawables);
}

function practice(): void {
  const jobs: ShapeJob[] = [];
  for (let k = 0; k < 300; k++) {
    const sides = 4 + (k % 7);
    const points: [number, number][] = [];
    for (let p = 0; p < sides; p++) {
      const angle = (p / sides) * Math.PI * 2;
      points.push([200 + Math.cos(angle) * (12 + (k % 9)), 200 + Math.sin(angle) * (10 + (k % 13))]);
    }
    points.push([points[0][0], points[0][1]]);
    const wobble = { roughness: 1, bowing: 1, seed: k + 1 };
    const ring = [{ points, closed: true }];
    jobs.push(
      { lines: ring, options: { ...wobble, stroke: '#000', disableMultiStroke: true, fill: '#000', fillStyle: 'solid' } },
      { lines: ring, options: { ...wobble, stroke: 'none', fill: '#000', fillStyle: 'hachure', hachureGap: 3, hachureAngle: k * 7 } },
      { lines: [{ points, closed: false }], options: { ...wobble, stroke: '#000', disableMultiStroke: true, preserveVertices: true } },
    );
  }
  sketchAll(packJobs(jobs));
}

scope.onmessage = (event) => {
  const data = sketchAll(event.data);
  scope.postMessage({ data }, [data.buffer]);
};

practice();
