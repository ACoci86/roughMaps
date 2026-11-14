export type GpxStop = { lngLat: [number, number]; name: string; ele: number | null };
export type GpxTrack = { points: [number, number][]; ele: number[] | null };
export type GpxTrip = { tracks: GpxTrack[]; stops: GpxStop[] };
type Fix = { lngLat: [number, number]; ele: number | null };

const MAX_POINTS = 500;
const MAX_TRACKS = 20;
const MAX_STOPS = 30;

function coordinate(node: Element): [number, number] | null {
  const lat = Number(node.getAttribute('lat'));
  const lng = Number(node.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return null;
  return [lng, lat];
}

function child(node: Element, name: string): string {
  for (const el of node.children) if (el.localName === name) return el.textContent?.trim() ?? '';
  return '';
}

function fixes(nodes: Element[]): Fix[] {
  return nodes.flatMap((node): Fix[] => {
    const lngLat = coordinate(node);
    if (!lngLat) return [];
    const raw = child(node, 'ele');
    const ele = Number(raw);
    return [{ lngLat, ele: raw && Number.isFinite(ele) ? ele : null }];
  });
}

function track(list: Fix[]): GpxTrack {
  const kept = thin(list);
  const heights = kept.every((f) => f.ele !== null);
  return { points: kept.map((f) => f.lngLat), ele: heights ? kept.map((f) => Math.round(f.ele!)) : null };
}

function distance([px, py]: number[], [ax, ay]: number[], [bx, by]: number[]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function keep(flat: number[][], tolerance: number): boolean[] {
  const kept = flat.map(() => false);
  kept[0] = true;
  kept[flat.length - 1] = true;
  const stack: [number, number][] = [[0, flat.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distance(flat[i], flat[first], flat[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index >= 0 && worst > tolerance) {
      kept[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return kept;
}

function thin(track: Fix[]): Fix[] {
  if (track.length <= MAX_POINTS) return track;
  const middle = track[Math.floor(track.length / 2)].lngLat[1];
  const squeeze = Math.cos((middle * Math.PI) / 180);
  const flat = track.map(({ lngLat: [lng, lat] }) => [lng * squeeze, lat]);
  let tolerance = 0.00001;
  for (;;) {
    const kept = keep(flat, tolerance);
    if (kept.filter(Boolean).length <= MAX_POINTS) return track.filter((_, i) => kept[i]);
    tolerance *= 1.6;
  }
}

export function parseGpx(text: string): GpxTrip {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx') {
    throw new Error('This is not a GPX file');
  }
  const all = (parent: Document | Element, name: string) => [...parent.getElementsByTagNameNS('*', name)];
  const tracks = [
    ...all(doc, 'trkseg').map((segment) => fixes(all(segment, 'trkpt'))),
    ...all(doc, 'rte').map((route) => fixes(all(route, 'rtept'))),
  ]
    .filter((list) => list.length >= 2)
    .slice(0, MAX_TRACKS)
    .map(track);
  const stops = all(doc, 'wpt')
    .flatMap((node): GpxStop[] => {
      const lngLat = coordinate(node);
      if (!lngLat) return [];
      const ele = Number(child(node, 'ele'));
      return [{ lngLat, name: child(node, 'name'), ele: child(node, 'ele') && Number.isFinite(ele) ? Math.round(ele) : null }];
    })
    .slice(0, MAX_STOPS);
  if (!tracks.length && !stops.length) throw new Error('No track or waypoints found in this GPX file');
  return { tracks, stops };
}

export function tripBounds(trip: GpxTrip): [[number, number], [number, number]] {
  const all = [...trip.tracks.flatMap((t) => t.points), ...trip.stops.map((s) => s.lngLat)];
  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
