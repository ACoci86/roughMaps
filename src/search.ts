export type Place = {
  name: string;
  label: string;
  center: [number, number];
  bounds: [[number, number], [number, number]];
};

type NominatimResult = {
  name: string;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
};

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_GAP_MS = 1000;

const cache = new Map<string, Place[]>();
let lastRequest = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  const cached = cache.get(key);
  if (cached) return cached;

  const gap = Date.now() - lastRequest;
  if (gap < MIN_GAP_MS) await wait(MIN_GAP_MS - gap);
  lastRequest = Date.now();

  const params = new URLSearchParams({ q: query.trim(), format: 'jsonv2', limit: '5' });
  const response = await fetch(`${ENDPOINT}?${params}`, { headers: { 'Accept-Language': navigator.language } });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);

  const results = (await response.json()) as NominatimResult[];
  const places = results.map((r) => {
    const [south, north, west, east] = r.boundingbox.map(Number);
    return {
      name: r.name || r.display_name.split(',')[0],
      label: r.display_name,
      center: [Number(r.lon), Number(r.lat)] as [number, number],
      bounds: [
        [west, south],
        [east, north],
      ] as Place['bounds'],
    };
  });
  cache.set(key, places);
  return places;
}
