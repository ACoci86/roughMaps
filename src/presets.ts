export type Preset = {
  place: string;
  center: [number, number];
  zoom: number;
  style: string;
  roughness: number;
  bearing?: number;
};

export const PRESETS: Preset[] = [
  { place: 'Venice', center: [12.3358, 45.4372], zoom: 15.2, style: 'vintage-paper', roughness: 2.75 },
  { place: 'Kyoto', center: [135.7727, 35.0037], zoom: 15.4, style: 'ukiyo-e', roughness: 2.25 },
  { place: 'Shibuya', center: [139.7016, 35.6595], zoom: 15.6, style: 'neon', roughness: 2 },
  { place: 'Amsterdam', center: [4.8897, 52.3731], zoom: 15.2, style: 'risograph', roughness: 2.75 },
  { place: 'Paris', center: [2.3442, 48.8556], zoom: 15, style: 'newsprint', roughness: 2.25 },
  { place: 'Manhattan', center: [-73.9855, 40.758], zoom: 15, style: 'blueprint', roughness: 1.5, bearing: 29 },
  { place: 'Lisbon', center: [-9.1393, 38.7107], zoom: 15.4, style: 'mediterranean', roughness: 2.75 },
  { place: 'Santorini', center: [25.3756, 36.4618], zoom: 15.6, style: 'mediterranean', roughness: 2.25 },
  { place: 'Stockholm', center: [18.0711, 59.3251], zoom: 15, style: 'nordic', roughness: 2 },
  { place: 'Copenhagen', center: [12.5853, 55.6794], zoom: 15.2, style: 'swiss', roughness: 1.5 },
  { place: 'Zürich', center: [8.5417, 47.3717], zoom: 15.2, style: 'swiss', roughness: 1.5 },
  { place: 'Dessau', center: [12.2283, 51.8388], zoom: 15.4, style: 'bauhaus', roughness: 2 },
  { place: 'Berlin', center: [13.4049, 52.5192], zoom: 15, style: 'concrete', roughness: 2 },
  { place: 'London', center: [-0.1195, 51.5033], zoom: 15, style: 'fire-insurance', roughness: 2.25 },
  { place: 'Edinburgh', center: [-3.1955, 55.9497], zoom: 15.2, style: 'charcoal', roughness: 3.25 },
  { place: 'Dublin', center: [-6.2603, 53.3498], zoom: 15, style: 'roughviz-pastel', roughness: 2.25 },
  { place: 'Moscow', center: [37.6173, 55.7539], zoom: 15, style: 'red-star', roughness: 2.25 },
  { place: 'Marrakesh', center: [-7.9893, 31.6258], zoom: 15.6, style: 'desert', roughness: 3.25 },
  { place: 'Arles', center: [4.6278, 43.6766], zoom: 15.6, style: 'starry-night', roughness: 3.5 },
  { place: 'Miami Beach', center: [-80.1324, 25.7826], zoom: 15, style: 'synthwave', roughness: 2 },
  { place: 'Las Vegas', center: [-115.1728, 36.1147], zoom: 15, style: 'night-city', roughness: 2 },
  { place: 'Hong Kong', center: [114.1694, 22.2855], zoom: 15.4, style: 'night-city', roughness: 2 },
  { place: 'Barcelona', center: [2.1686, 41.3874], zoom: 15, style: 'stained-glass', roughness: 2.25 },
  { place: 'Singapore', center: [103.8636, 1.2834], zoom: 15, style: 'solarpunk', roughness: 2.25 },
  { place: 'Uji', center: [135.8077, 34.8891], zoom: 15.6, style: 'matcha', roughness: 2.25 },
  { place: 'Tokyo, Ueno', center: [139.7741, 35.7148], zoom: 15.4, style: 'sakura', roughness: 2.25 },
  { place: 'Cambridge', center: [0.1172, 52.2043], zoom: 15.4, style: 'cyanotype', roughness: 2.25 },
  { place: 'Oxford', center: [-1.2544, 51.7548], zoom: 15.6, style: 'ballpoint', roughness: 2.75 },
  { place: 'Rome', center: [12.4823, 41.8955], zoom: 15.2, style: 'watercolor', roughness: 2.75 },
  { place: 'Prague', center: [14.4176, 50.0865], zoom: 15.4, style: 'linocut', roughness: 2.75 },
  { place: 'Florence', center: [11.2558, 43.7696], zoom: 15.6, style: 'kraft', roughness: 3.25 },
  { place: 'Chicago', center: [-87.6298, 41.8838], zoom: 15, style: 'art-deco', roughness: 2 },
  { place: 'Brooklyn', center: [-73.9903, 40.7033], zoom: 15.2, style: 'pop-art', roughness: 2.25 },
  { place: 'Seoul', center: [126.978, 37.5665], zoom: 15, style: 'transit', roughness: 1.5 },
  { place: 'Cape Town', center: [18.4194, -33.9061], zoom: 15, style: 'survey', roughness: 2.25 },
  { place: 'Rio de Janeiro', center: [-43.1844, -22.9722], zoom: 15, style: 'highlighter', roughness: 2.75 },
  { place: 'Sydney', center: [151.2122, -33.8587], zoom: 15, style: 'pop-pastel', roughness: 2.25 },
  { place: 'Reykjavík', center: [-21.9387, 64.1466], zoom: 15.4, style: 'nord', roughness: 2 },
];

const LAST = 'roughmaps:last-preset';

export function pickPreset(): Preset {
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST) ?? -1);
  } catch {
    last = -1;
  }
  let index = Math.floor(Math.random() * PRESETS.length);
  if (index === last) index = (index + 1 + Math.floor(Math.random() * (PRESETS.length - 1))) % PRESETS.length;
  try {
    localStorage.setItem(LAST, String(index));
  } catch {
    return PRESETS[index];
  }
  return PRESETS[index];
}
