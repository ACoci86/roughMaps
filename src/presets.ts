export type Preset = {
  place: string;
  center: [number, number];
  zoom: number;
  style: string;
  roughness: number;
  bearing?: number;
  tint?: string;
};

export const PRESETS: Preset[] = [
  { place: 'Venice', center: [12.3358, 45.4372], zoom: 15.2, style: 'vintage-paper', roughness: 2.75 },
  { place: 'Kyoto', center: [135.7727, 35.0037], zoom: 15.4, style: 'ukiyo-e', roughness: 2.25 },
  { place: 'Shibuya', center: [139.7016, 35.6595], zoom: 15.6, style: 'paint-pens', roughness: 2 },
  { place: 'Amsterdam', center: [4.8897, 52.3731], zoom: 15.2, style: 'risograph', roughness: 2.75 },
  { place: 'Paris', center: [2.3442, 48.8556], zoom: 15, style: 'newsprint', roughness: 2.25 },
  { place: 'Manhattan', center: [-73.9855, 40.758], zoom: 15, style: 'blueprint', roughness: 1.5, bearing: 29 },
  { place: 'Lisbon', center: [-9.1393, 38.7107], zoom: 15.4, style: 'mediterranean', roughness: 2.75 },
  { place: 'Santorini', center: [25.3756, 36.4618], zoom: 15.6, style: 'mediterranean', roughness: 2.25 },
  { place: 'Stockholm', center: [18.0711, 59.3251], zoom: 15, style: 'nautical-chart', roughness: 2 },
  { place: 'Copenhagen', center: [12.5853, 55.6794], zoom: 15.2, style: 'pen-and-ink', roughness: 1.5 },
  { place: 'Zürich', center: [8.5417, 47.3717], zoom: 15.2, style: 'survey', roughness: 1.5 },
  { place: 'Dessau', center: [12.2283, 51.8388], zoom: 15.4, style: 'bauhaus', roughness: 2 },
  { place: 'Berlin', center: [13.4049, 52.5192], zoom: 15, style: 'newsprint', roughness: 2 },
  { place: 'London', center: [-0.1195, 51.5033], zoom: 15, style: 'fire-insurance', roughness: 2.25 },
  { place: 'Edinburgh', center: [-3.1955, 55.9497], zoom: 15.2, style: 'charcoal', roughness: 3.25 },
  { place: 'Dublin', center: [-6.2603, 53.3498], zoom: 15, style: 'roughviz-pastel', roughness: 2.25 },
  { place: 'Moscow', center: [37.6173, 55.7539], zoom: 15, style: 'red-star', roughness: 2.25 },
  { place: 'Marrakesh', center: [-7.9893, 31.6258], zoom: 15.6, style: 'treasure-map', roughness: 3.25 },
  { place: 'Arles', center: [4.6278, 43.6766], zoom: 15.6, style: 'starry-night', roughness: 3.5 },
  { place: 'Miami Beach', center: [-80.1324, 25.7826], zoom: 15, style: 'pop-pastel', roughness: 2 },
  { place: 'Las Vegas', center: [-115.1728, 36.1147], zoom: 15, style: 'art-deco', roughness: 2 },
  { place: 'Hong Kong', center: [114.1694, 22.2855], zoom: 15.4, style: 'ink-brush', roughness: 2 },
  { place: 'Barcelona', center: [2.1686, 41.3874], zoom: 15, style: 'stained-glass', roughness: 2.25 },
  { place: 'Singapore', center: [103.8636, 1.2834], zoom: 15, style: 'solarpunk', roughness: 2.25 },
  { place: 'Uji', center: [135.8077, 34.8891], zoom: 15.6, style: 'coloured-pencil', roughness: 2.25, tint: '#5f8f3e' },
  { place: 'Tokyo, Ueno', center: [139.7741, 35.7148], zoom: 15.4, style: 'coloured-pencil', roughness: 2.25, tint: '#c2557a' },
  { place: 'Cambridge', center: [0.1172, 52.2043], zoom: 15.4, style: 'graph-paper', roughness: 2.25 },
  { place: 'Oxford', center: [-1.2544, 51.7548], zoom: 15.6, style: 'ballpoint', roughness: 2.75 },
  { place: 'Rome', center: [12.4823, 41.8955], zoom: 15.2, style: 'watercolor', roughness: 2.75 },
  { place: 'Prague', center: [14.4176, 50.0865], zoom: 15.4, style: 'guidebook', roughness: 2.75 },
  { place: 'Florence', center: [11.2558, 43.7696], zoom: 15.6, style: 'illuminated', roughness: 3.25 },
  { place: 'Chicago', center: [-87.6298, 41.8838], zoom: 15, style: 'art-deco', roughness: 2 },
  { place: 'Brooklyn', center: [-73.9903, 40.7033], zoom: 15.2, style: 'pop-art', roughness: 2.25 },
  { place: 'Seoul', center: [126.978, 37.5665], zoom: 15, style: 'highlighter', roughness: 1.5 },
  { place: 'Cape Town', center: [18.4194, -33.9061], zoom: 15, style: 'survey', roughness: 2.25 },
  { place: 'Rio de Janeiro', center: [-43.1844, -22.9722], zoom: 15, style: 'highlighter', roughness: 2.75 },
  { place: 'Sydney', center: [151.2122, -33.8587], zoom: 15, style: 'pop-pastel', roughness: 2.25 },
  { place: 'Reykjavík', center: [-21.9387, 64.1466], zoom: 15.4, style: 'cyanotype', roughness: 2 },
  { place: 'Istanbul', center: [28.9784, 41.0082], zoom: 15.4, style: 'stained-glass', roughness: 2.25 },
  { place: 'Cairo', center: [31.2623, 30.0459], zoom: 15.4, style: 'kraft', roughness: 3.25 },
  { place: 'Jaipur', center: [75.8267, 26.9239], zoom: 15.4, style: 'pop-pastel', roughness: 2.25 },
  { place: 'Varanasi', center: [83.0104, 25.3109], zoom: 15.6, style: 'watercolor', roughness: 2.75 },
  { place: 'Bangkok', center: [100.4936, 13.75], zoom: 15.2, style: 'highlighter', roughness: 2.25 },
  { place: 'Hanoi', center: [105.852, 21.034], zoom: 15.6, style: 'linocut', roughness: 2.75 },
  { place: 'Taipei', center: [121.5645, 25.033], zoom: 15.2, style: 'starry-night', roughness: 2 },
  { place: 'Osaka', center: [135.5013, 34.6687], zoom: 15.6, style: 'sashiko', roughness: 2 },
  { place: 'Nara', center: [135.8398, 34.6851], zoom: 15.4, style: 'ink-brush', roughness: 2.25 },
  { place: 'Akihabara', center: [139.773, 35.6984], zoom: 15.6, style: 'risograph', roughness: 2 },
  { place: 'Shenzhen', center: [114.0579, 22.5431], zoom: 15, style: 'blueprint', roughness: 1.5 },
  { place: 'Beijing', center: [116.3972, 39.9163], zoom: 15, style: 'red-star', roughness: 2.25 },
  { place: 'Shanghai', center: [121.4903, 31.2397], zoom: 15.2, style: 'art-deco', roughness: 2 },
  { place: 'Dubai Marina', center: [55.139, 25.08], zoom: 15, style: 'art-deco', roughness: 2 },
  { place: 'Tbilisi', center: [44.801, 41.692], zoom: 15.4, style: 'watercolor', roughness: 2.5 },
  { place: 'Mexico City', center: [-99.1695, 19.4115], zoom: 15.2, style: 'risograph', roughness: 2.25 },
  { place: 'Havana', center: [-82.353, 23.138], zoom: 15.6, style: 'paper-cut', roughness: 2.75 },
  { place: 'Buenos Aires', center: [-58.372, -34.621], zoom: 15.2, style: 'newsprint', roughness: 2.25 },
  { place: 'Valparaíso', center: [-71.627, -33.041], zoom: 15.4, style: 'stained-glass', roughness: 2.75 },
  { place: 'Cusco', center: [-71.9785, -13.5165], zoom: 15.6, style: 'treasure-map', roughness: 2.75 },
  { place: 'New Orleans', center: [-90.065, 29.958], zoom: 15.4, style: 'crayon', roughness: 2.25 },
  { place: 'San Francisco', center: [-122.4083, 37.788], zoom: 15, style: 'yellow-trace', roughness: 2 },
  { place: 'Seattle', center: [-122.342, 47.609], zoom: 15, style: 'red-blue-pencil', roughness: 2 },
  { place: 'Portland', center: [-122.6765, 45.523], zoom: 15, style: 'solarpunk', roughness: 2.25 },
  { place: 'Montréal', center: [-73.554, 45.507], zoom: 15.4, style: 'chalkboard', roughness: 2.25 },
  { place: 'Toronto', center: [-79.3832, 43.6532], zoom: 15, style: 'pen-and-ink', roughness: 2 },
  { place: 'Boston', center: [-71.0675, 42.3585], zoom: 15.4, style: 'whiteboard', roughness: 2.25 },
  { place: 'Washington', center: [-77.0365, 38.8977], zoom: 15, style: 'survey', roughness: 2 },
  { place: 'Austin', center: [-97.7431, 30.2672], zoom: 15, style: 'crayon', roughness: 2 },
  { place: 'Venice Beach', center: [-118.4695, 33.985], zoom: 15.2, style: 'pavement-chalk', roughness: 2 },
  { place: 'Vienna', center: [16.3713, 48.2082], zoom: 15.2, style: 'engraving', roughness: 2.25 },
  { place: 'Budapest', center: [19.0402, 47.4979], zoom: 15, style: 'yellow-trace', roughness: 2.25 },
  { place: 'Kraków', center: [19.937, 50.0614], zoom: 15.4, style: 'linocut', roughness: 2.75 },
  { place: 'Bruges', center: [3.2247, 51.2093], zoom: 15.6, style: 'hand-coloured', roughness: 2.75 },
  { place: 'Porto', center: [-8.611, 41.141], zoom: 15.4, style: 'mediterranean', roughness: 2.75 },
  { place: 'Seville', center: [-5.993, 37.386], zoom: 15.4, style: 'kraft', roughness: 3 },
  { place: 'Dubrovnik', center: [18.11, 42.641], zoom: 15.8, style: 'mediterranean', roughness: 2.25 },
  { place: 'Athens', center: [23.73, 37.971], zoom: 15.4, style: 'greek-vase', roughness: 3 },
  { place: 'Naples', center: [14.255, 40.85], zoom: 15.4, style: 'vintage-paper', roughness: 2.75 },
  { place: 'Milan', center: [9.19, 45.4642], zoom: 15.2, style: 'fire-insurance', roughness: 2 },
  { place: 'Lyon', center: [4.8357, 45.764], zoom: 15.2, style: 'charcoal', roughness: 3 },
  { place: 'Hamburg', center: [9.9937, 53.5511], zoom: 15.2, style: 'pencil-only', roughness: 2.25 },
  { place: 'Rotterdam', center: [4.4777, 51.9244], zoom: 15.2, style: 'delft-tile', roughness: 1.5 },
  { place: 'Helsinki', center: [24.945, 60.169], zoom: 15.2, style: 'red-blue-pencil', roughness: 2 },
  { place: 'Oslo', center: [10.746, 59.911], zoom: 15.2, style: 'nautical-chart', roughness: 2 },
  { place: 'Bergen', center: [5.324, 60.396], zoom: 15.4, style: 'cyanotype', roughness: 2.25 },
  { place: 'Tallinn', center: [24.745, 59.437], zoom: 15.6, style: 'charcoal', roughness: 3 },
  { place: 'Bath', center: [-2.359, 51.381], zoom: 15.4, style: 'soft-greys', roughness: 2.25 },
  { place: 'Melbourne', center: [144.9631, -37.8136], zoom: 15, style: 'picture-book', roughness: 2 },
  { place: 'Wellington', center: [174.7762, -41.2865], zoom: 15.2, style: 'chalkboard', roughness: 2.25 },
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
