import rough from 'roughjs/bundled/rough.esm.js';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'public/logo.svg';
const g = rough.generator();
const ink = '#1a1a1a';
const sky = '#87ceeb';
const coral = '#ff6f61';
const base = { stroke: ink, strokeWidth: 2.2, roughness: 1.1, bowing: 1.2 };

const panels = [
  [[8, 18], [34, 10], [34, 82], [8, 90]],
  [[34, 10], [62, 18], [62, 90], [34, 82]],
  [[62, 18], [88, 10], [88, 82], [62, 90]],
];
const fills = [
  { fill: '#ffffff', fillStyle: 'solid' },
  { fill: sky, fillStyle: 'hachure', hachureGap: 4.5, fillWeight: 1.6, hachureAngle: -50 },
  { fill: '#ffffff', fillStyle: 'solid' },
];

const shapes = [];
const dashed = new Set();
panels.forEach((p, i) => shapes.push(g.polygon(p, { ...base, ...fills[i], seed: 11 + i })));
dashed.add(shapes.length);
shapes.push(
  g.curve(
    [[14, 70], [26, 58], [40, 64], [52, 48], [66, 52], [76, 38]],
    { ...base, strokeWidth: 2, strokeLineDash: [5, 4], seed: 21, roughness: 0.6 },
  ),
);
shapes.push(
  g.path('M76 40 C66 28 64 18 76 12 C88 18 86 28 76 40 Z', {
    ...base,
    fill: coral,
    fillStyle: 'solid',
    seed: 31,
    roughness: 0.7,
  }),
);
shapes.push(g.circle(76, 22, 6.5, { ...base, fill: '#ffffff', fillStyle: 'solid', strokeWidth: 1.8, seed: 41, roughness: 0.5 }));

const paths = shapes
  .flatMap((shape, i) => g.toPaths(shape).map((p) => ({ ...p, dash: dashed.has(i) })))
  .map(({ d, stroke, strokeWidth, fill, dash: isDashed }) => {
    const dash = isDashed ? ' stroke-dasharray="5 4"' : '';
    return `<path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill ?? 'none'}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  })
  .join('\n  ');

writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 100" width="96" height="100">\n  ${paths}\n</svg>\n`,
);
console.log('wrote', out);
