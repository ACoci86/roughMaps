import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node scripts/countries.mjs <folder with Natural Earth geojson files>');
  process.exit(1);
}

const load = (name) => JSON.parse(readFileSync(join(folder, `${name}.geojson`), 'utf8')).features;
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const TOLERANCE = 0.012;
const DETAIL_TOLERANCE = 0.0015;

function away([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = away(points[i], points[first], points[last]);
      if (d > worst) [worst, index] = [d, i];
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ring(points, detail = false) {
  const out = [];
  const digits = detail ? 3 : 2;
  for (const [x, y] of simplify(points, detail ? DETAIL_TOLERANCE : TOLERANCE)) {
    const p = [round(x, digits), round(y, digits)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

function polygons(geometry, detail = false) {
  const list = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return list
    .map((rings) => rings.map((r) => ring(r, detail)).filter((r) => r.length >= 4))
    .filter((rings) => rings.length > 0);
}

function lines(geometry) {
  const list = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
  return list.map((l) => ring(l)).filter((l) => l.length >= 2);
}

function size(outer) {
  let sum = 0;
  let lat = 0;
  for (let i = 0; i < outer.length; i++) {
    const [x1, y1] = outer[i];
    const [x2, y2] = outer[(i + 1) % outer.length];
    sum += x1 * y2 - x2 * y1;
    lat += y1;
  }
  return (Math.abs(sum) / 2) * Math.cos(((lat / outer.length) * Math.PI) / 180);
}

function insideShapes([x, y], shapes) {
  return shapes.some((rings) => {
    let hit = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
    }
    return hit;
  });
}

function withCapital([w, s, e, n], capital, shapes) {
  if (!capital) return [w, s, e, n];
  const [, x, y] = capital;
  const grown = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  if (grown[2] - grown[0] <= Math.max(40, e - w)) return grown;
  const around = [x - 0.5, y - 0.5, x + 0.5, y + 0.5];
  for (const rings of shapes) {
    for (const [px, py] of rings[0]) {
      if (Math.abs(px - x) > 8 || Math.abs(py - y) > 8) continue;
      around[0] = Math.min(around[0], px);
      around[1] = Math.min(around[1], py);
      around[2] = Math.max(around[2], px);
      around[3] = Math.max(around[3], py);
    }
  }
  return around;
}

function boxOf(ring) {
  return ring.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
}

function anchorOf(shapes, sizes, capital) {
  if (!capital) return sizes.indexOf(Math.max(...sizes));
  const [, x, y] = capital;
  let best = 0;
  let bestDistance = Infinity;
  shapes.forEach((rings, i) => {
    const [w, s, e, n] = boxOf(rings[0]);
    const distance = Math.hypot(Math.max(w - x, 0, x - e), Math.max(s - y, 0, y - n));
    if (distance < bestDistance || (distance === bestDistance && sizes[i] > sizes[best])) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

function mainBounds(shapes, capital) {
  if (!shapes.length) return [0, 0, 0, 0];
  const sizes = shapes.map((rings) => size(rings[0]));
  const biggest = Math.max(...sizes);
  const [bw, bs, be, bn] = boxOf(shapes[anchorOf(shapes, sizes, capital)][0]);
  const close = ([w, s, e, n]) => w < be + 2.5 && e > bw - 2.5 && s < bn + 2.5 && n > bs - 2.5;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  shapes.forEach((rings, i) => {
    const large = sizes[i] >= biggest * 0.2 && sizes[i] >= 0.5;
    if (!large && !close(boxOf(rings[0]))) return;
    for (const [x, y] of rings[0]) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  });
  return [w, s, e, n];
}

const capitals = new Map();
const places = load('ne_10m_populated_places_simple');
const RANK = { 'Admin-0 capital': 3, 'Admin-0 capital alt': 2, 'Admin-0 region capital': 2, 'Admin-1 capital': 1, 'Admin-1 region capital': 1 };

function near([x, y], shapes, reach) {
  return shapes.some((rings) => {
    const [w, s, e, n] = rings[0].reduce((b, [px, py]) => [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)], [Infinity, Infinity, -Infinity, -Infinity]);
    return x >= w - reach && x <= e + reach && y >= s - reach && y <= n + reach;
  });
}

const MISSING_CAPITALS = {
  Jersey: ['Saint Helier', -2.107, 49.186],
  Guernsey: ['Saint Peter Port', -2.536, 49.455],
  Anguilla: ['The Valley', -63.057, 18.217],
  'British Virgin Islands': ['Road Town', -64.619, 18.428],
  Montserrat: ['Brades', -62.211, 16.792],
  Nauru: ['Yaren', 166.92, -0.547],
  'Norfolk Island': ['Kingston', 167.96, -29.056],
  'Pitcairn Islands': ['Adamstown', -130.101, -25.066],
  'Saint Barthélemy': ['Gustavia', -62.849, 17.896],
  'Saint Helena': ['Jamestown', -5.717, -15.925],
  'Saint Martin': ['Marigot', -63.083, 18.068],
  'Sint Maarten': ['Philipsburg', -63.046, 18.026],
  'Saint Pierre and Miquelon': ['Saint-Pierre', -56.177, 46.78],
  'Turks and Caicos Islands': ['Cockburn Town', -71.14, 21.462],
  'Wallis and Futuna': ['Mata-Utu', -176.174, -13.282],
  'Australian Indian Ocean Territories': ['Flying Fish Cove', 105.679, -10.422],
  'British Indian Ocean Territory': ['Diego Garcia', 72.411, -7.313],
  'French Southern and Antarctic Lands': ['Port-aux-Français', 70.22, -49.35],
};

function localCapital(shapes) {
  let best = null;
  for (const { properties: p } of places) {
    if (/station/i.test(p.featurecla)) continue;
    const point = [p.longitude, p.latitude];
    const inside = insideShapes(point, shapes);
    if (!inside && !near(point, shapes, 0.15)) continue;
    const score = (inside ? 1e12 : 0) + (RANK[p.featurecla] ?? 0) * 1e9 + (p.pop_max ?? 0);
    if (!best || score > best.score) best = { score, name: p.name.replace(/\s+/g, ' '), lng: round(p.longitude), lat: round(p.latitude) };
  }
  return best;
}

for (const { properties: p } of places) {
  if (p.featurecla !== 'Admin-0 capital') continue;
  const capital = { name: p.name.replace(/\s+/g, ' '), lng: round(p.longitude), lat: round(p.latitude), pop: p.pop_max ?? 0 };
  for (const key of [p.adm0_a3, p.adm0name]) {
    const best = capitals.get(key);
    if (!best || best.pop < capital.pop) capitals.set(key, capital);
  }
}

const details = new Map(load('ne_10m_admin_0_countries').map(({ properties: p, geometry }) => [p.ADMIN, polygons(geometry, true)]));

const NAME_KEYS = ['NAME_EN', 'NAME_LONG', 'ADMIN', 'NAME', 'NAME_CIAWF', 'NAME_SORT', 'NAME_ALT', 'FORMAL_EN'];

const countries = load('ne_50m_admin_0_countries')
  .map(({ properties: p, geometry }) => {
    const keys = [...NAME_KEYS, ...Object.keys(p).filter((k) => /^NAME_[A-Z]{2,3}$/.test(k) && !NAME_KEYS.includes(k))];
    const names = [...new Set(keys.map((k) => p[k]).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
    const shapes = polygons(geometry);
    const detail = details.get(p.ADMIN) ?? shapes;
    const found = capitals.get(p.ADM0_A3) ?? capitals.get(p.ADMIN) ?? capitals.get(p.NAME_LONG) ?? localCapital(detail);
    const missing = MISSING_CAPITALS[p.NAME_EN] ?? MISSING_CAPITALS[p.ADMIN];
    const capital = found ? [found.name, found.lng, found.lat] : missing ?? null;
    return [
      names,
      p.NAME ?? names[0],
      capital,
      [round(p.LABEL_X), round(p.LABEL_Y)],
      withCapital(mainBounds(detail, capital), capital, detail),
      shapes,
      detail,
    ];
  })
  .filter((c) => c[0].length && c[5].length)
  .sort((a, b) => a[0][0].localeCompare(b[0][0]));

const detailFolder = new URL('../public/detail/', import.meta.url);
mkdirSync(detailFolder, { recursive: true });
countries.forEach((country, i) => {
  writeFileSync(new URL(`${i}.json`, detailFolder), JSON.stringify(country.pop()));
});
for (const file of readdirSync(detailFolder)) {
  const index = Number(file.replace(/\.json$/, ''));
  if (!Number.isInteger(index) || index >= countries.length) rmSync(new URL(file, detailFolder));
}

const lakes = load('ne_50m_lakes')
  .map(({ properties: p, geometry }) => [p.name ?? '', polygons(geometry)])
  .filter(([, shapes]) => shapes.length);

const rivers = load('ne_50m_rivers_lake_centerlines')
  .filter(({ properties: p }) => p.featurecla !== 'Lake Centerline')
  .map(({ properties: p, geometry }) => [p.name ?? '', p.scalerank ?? 9, lines(geometry)])
  .filter(([, , parts]) => parts.length);

writeFileSync(new URL('../public/countries.json', import.meta.url), JSON.stringify(countries));
writeFileSync(new URL('../public/nature.json', import.meta.url), JSON.stringify({ lakes, rivers }));
console.log(`Wrote ${countries.length} countries, ${lakes.length} lakes, ${rivers.length} rivers`);
