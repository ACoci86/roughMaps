import rough from 'roughjs';

const SIZE = 800;

const svg = document.querySelector<SVGSVGElement>('#map')!;
svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

const rc = rough.svg(svg);

// A fixed seed keeps the wobble the same on every reload.
const seed = 42;
const ink = { seed, stroke: '#000', strokeWidth: 1 };

// Hand-drawn frame around the map
svg.append(rc.rectangle(10, 10, SIZE - 20, SIZE - 20, { ...ink, roughness: 1.5 }));

// Placeholder sketch to check Rough.js works. Real map drawing comes next.
svg.append(
  // A park
  rc.rectangle(120, 140, 260, 200, {
    ...ink,
    roughness: 2.5,
    fill: '#9bd39b',
    fillStyle: 'hachure',
    hachureGap: 8,
  }),
  // A lake
  rc.ellipse(560, 260, 240, 150, {
    ...ink,
    fill: '#87ceeb',
    fillStyle: 'zigzag',
  }),
  // A road
  rc.curve(
    [
      [60, 560],
      [260, 480],
      [480, 600],
      [740, 520],
    ],
    { ...ink, strokeWidth: 3 },
  ),
  // A building
  rc.polygon(
    [
      [520, 640],
      [640, 640],
      [640, 740],
      [520, 740],
    ],
    { ...ink, fill: 'coral', fillStyle: 'cross-hatch' },
  ),
);
