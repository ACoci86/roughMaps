import type { SketchSettings } from './sketch';

export type Preset = {
  place: string;
  center: [number, number];
  zoom: number;
  style: string;
  roughness: number;
  bearing?: number;
  tint?: string;
  settings?: Partial<SketchSettings>;
};

export const PRESETS: Preset[] = [
  { place: 'Burano', center: [12.4167, 45.4854], zoom: 16, style: 'roughviz-pastel', roughness: 2.25 },
  { place: 'Notting Hill', center: [-0.205, 51.515], zoom: 15.6, style: 'roughviz-pastel', roughness: 2.25 },
  { place: 'Oxford', center: [-1.254, 51.7534], zoom: 15.8, style: 'pencil-only', roughness: 1.5, settings: { titleFont: 'Patrick Hand' } },
  { place: 'Bath', center: [-2.3655, 51.3862], zoom: 15.8, style: 'pencil-only', roughness: 1.5, settings: { titleFont: 'Patrick Hand' } },
  { place: 'Barcelona', center: [2.165, 41.3917], zoom: 15.4, style: 'graph-paper', roughness: 1.25, bearing: 45, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Manhattan', center: [-73.9832, 40.7536], zoom: 15, style: 'graph-paper', roughness: 1.25, bearing: 29, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Edinburgh', center: [-3.19, 55.9495], zoom: 15.6, style: 'pen-and-ink', roughness: 1.75, settings: { titleFont: 'Kalam' } },
  { place: 'Keswick', center: [-3.1347, 54.6013], zoom: 14.8, style: 'pen-and-ink', roughness: 1.75, settings: { titleFont: 'Kalam' } },
  { place: 'Cambridge', center: [0.1166, 52.2043], zoom: 15.6, style: 'ballpoint', roughness: 2.25, settings: { titleFont: 'Kalam' } },
  { place: 'Bologna', center: [11.343, 44.4938], zoom: 15.6, style: 'ballpoint', roughness: 2.25, settings: { titleFont: 'Kalam' } },
  { place: 'Washington', center: [-77.03, 38.904], zoom: 15, style: 'red-blue-pencil', roughness: 2 },
  { place: 'Paris', center: [2.347, 48.855], zoom: 15.6, style: 'red-blue-pencil', roughness: 2 },
  { place: 'Toulouse', center: [1.444, 43.6045], zoom: 15.4, style: 'coloured-pencil', roughness: 2.25, tint: '#c9627f' },
  { place: 'Jodhpur', center: [73.0235, 26.295], zoom: 15.6, style: 'coloured-pencil', roughness: 2.25, tint: '#2f6fc0' },
  { place: 'Savannah', center: [-81.093, 32.077], zoom: 15.4, style: 'coloured-pencil', roughness: 2.25, tint: '#3f8f4f' },
  { place: 'La Boca', center: [-58.3625, -34.6392], zoom: 15.6, style: 'crayon', roughness: 3, settings: { fillWeight: 1.4, titleFont: 'Pangolin' } },
  { place: 'Guanajuato', center: [-101.255, 21.017], zoom: 15.8, style: 'crayon', roughness: 3, settings: { fillWeight: 1.4, titleFont: 'Pangolin' } },
  { place: 'Shinjuku', center: [139.7005, 35.69], zoom: 15, style: 'highlighter', roughness: 2, settings: { titleFont: 'Patrick Hand' } },
  { place: "King's Cross", center: [-0.1238, 51.5308], zoom: 15, style: 'highlighter', roughness: 2, settings: { titleFont: 'Patrick Hand' } },
  { place: 'Stanford', center: [-122.169, 37.429], zoom: 14.8, style: 'whiteboard', roughness: 2.25, settings: { titleFont: 'Patrick Hand', titleLayout: 'top' } },
  { place: 'MIT', center: [-71.0921, 42.3601], zoom: 15.2, style: 'whiteboard', roughness: 2.25, settings: { titleFont: 'Patrick Hand', titleLayout: 'top' } },
  { place: 'Glasgow', center: [-4.2502, 55.8612], zoom: 15.2, style: 'charcoal', roughness: 3 },
  { place: 'Pittsburgh', center: [-80.003, 40.441], zoom: 14.8, style: 'charcoal', roughness: 3 },
  { place: 'Heidelberg', center: [8.71, 49.412], zoom: 15.4, style: 'chalkboard', roughness: 2.5, settings: { titleLayout: 'top' } },
  { place: 'Princeton', center: [-74.6593, 40.3487], zoom: 15.4, style: 'chalkboard', roughness: 2.5, settings: { titleLayout: 'top' } },
  { place: 'Williamsburg', center: [-73.957, 40.717], zoom: 15.2, style: 'pavement-chalk', roughness: 3, settings: { titleFont: 'Pangolin' } },
  { place: 'Fitzroy', center: [144.978, -37.799], zoom: 15.4, style: 'pavement-chalk', roughness: 3, settings: { titleFont: 'Pangolin' } },
  { place: 'Shibuya', center: [139.7005, 35.6595], zoom: 15.8, style: 'paint-pens', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Wynwood', center: [-80.199, 25.801], zoom: 15.4, style: 'paint-pens', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Jerusalem', center: [35.232, 31.777], zoom: 15.6, style: 'kraft', roughness: 2.5 },
  { place: 'Matera', center: [16.61, 40.666], zoom: 15.8, style: 'kraft', roughness: 2.5 },
  { place: 'Brasília', center: [-47.8828, -15.794], zoom: 13.4, style: 'yellow-trace', roughness: 1.75, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Chicago', center: [-87.63, 41.88], zoom: 14.8, style: 'yellow-trace', roughness: 1.75, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Venice', center: [12.3358, 45.438], zoom: 15.4, style: 'watercolor', roughness: 2.25, settings: { titleFont: 'Kalam' } },
  { place: 'Bruges', center: [3.2243, 51.2088], zoom: 15.4, style: 'watercolor', roughness: 2.25, settings: { titleFont: 'Kalam' } },
  { place: 'Kyoto', center: [135.778, 35.0037], zoom: 15.4, style: 'ink-brush', roughness: 2.75 },
  { place: 'Bukchon', center: [126.985, 37.582], zoom: 15.8, style: 'ink-brush', roughness: 2.75 },
  { place: 'Montmartre', center: [2.3431, 48.8867], zoom: 15.6, style: 'picture-book', roughness: 1.75, settings: { titleFont: 'Pangolin' } },
  { place: 'Stockholm', center: [18.071, 59.325], zoom: 15.4, style: 'picture-book', roughness: 1.75, settings: { titleFont: 'Pangolin' } },
  { place: 'Nice', center: [7.276, 43.696], zoom: 15.2, style: 'paper-cut', roughness: 2.25, settings: { titleFont: 'Itim' } },
  { place: 'Havana', center: [-82.35, 23.136], zoom: 15.4, style: 'paper-cut', roughness: 2.25, settings: { titleFont: 'Itim' } },
  { place: 'Prague', center: [14.4213, 50.0875], zoom: 15.6, style: 'linocut', roughness: 2.5 },
  { place: 'Tallinn', center: [24.7453, 59.4372], zoom: 15.6, style: 'linocut', roughness: 2.5 },
  { place: 'Rome', center: [12.4769, 41.8986], zoom: 16, style: 'engraving', roughness: 1.25, settings: { titleFont: 'Arima', border: true } },
  { place: 'Vienna', center: [16.3731, 48.2085], zoom: 15.4, style: 'engraving', roughness: 1.25, settings: { titleFont: 'Arima', border: true } },
  { place: 'Amsterdam', center: [4.887, 52.372], zoom: 15.2, style: 'hand-coloured', roughness: 1.25, settings: { titleFont: 'Arima', border: true } },
  { place: 'Antwerp', center: [4.3997, 51.2213], zoom: 15.4, style: 'hand-coloured', roughness: 1.25, settings: { titleFont: 'Arima', border: true } },
  { place: 'Kreuzberg', center: [13.416, 52.502], zoom: 15.2, style: 'risograph', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Shimokitazawa', center: [139.668, 35.6615], zoom: 16, style: 'risograph', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Fleet Street', center: [-0.108, 51.514], zoom: 15.8, style: 'newsprint', roughness: 1.5, settings: { titleFont: 'Arima', titleLayout: 'top' } },
  { place: 'Wall Street', center: [-74.009, 40.707], zoom: 15.6, style: 'newsprint', roughness: 1.5, settings: { titleFont: 'Arima', titleLayout: 'top' } },
  { place: 'Las Vegas', center: [-115.172, 36.115], zoom: 14.4, style: 'pop-art', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Hollywood', center: [-118.327, 34.1016], zoom: 15, style: 'pop-art', roughness: 2, settings: { titleFont: 'Itim' } },
  { place: 'Dessau', center: [12.2274, 51.8393], zoom: 15.4, style: 'bauhaus', roughness: 1.25, settings: { titleLayout: 'corner' } },
  { place: 'Tel Aviv', center: [34.774, 32.0779], zoom: 15.4, style: 'bauhaus', roughness: 1.25, settings: { titleLayout: 'corner' } },
  { place: 'Asakusa', center: [139.7967, 35.7148], zoom: 15.6, style: 'ukiyo-e', roughness: 2.25 },
  { place: 'Kanazawa', center: [136.6665, 36.5725], zoom: 16, style: 'ukiyo-e', roughness: 2.25 },
  { place: 'Chartres', center: [1.4878, 48.4477], zoom: 15.8, style: 'stained-glass', roughness: 2 },
  { place: 'Cologne', center: [6.9583, 50.9413], zoom: 15.6, style: 'stained-glass', roughness: 2 },
  { place: 'Takayama', center: [137.26, 36.141], zoom: 15.6, style: 'sashiko', roughness: 1.75 },
  { place: 'Kurashiki', center: [133.772, 34.596], zoom: 15.8, style: 'sashiko', roughness: 1.75 },
  { place: 'Athens', center: [23.73, 37.973], zoom: 15.6, style: 'greek-vase', roughness: 2, settings: { titleFont: 'Arima', border: true } },
  { place: 'Rhodes', center: [28.227, 36.444], zoom: 15.8, style: 'greek-vase', roughness: 2, settings: { titleFont: 'Arima', border: true } },
  { place: 'Delft', center: [4.359, 52.0116], zoom: 15.6, style: 'delft-tile', roughness: 2, settings: { titleFont: 'Kalam' } },
  { place: 'Porto', center: [-8.613, 41.141], zoom: 15.6, style: 'delft-tile', roughness: 2, settings: { titleFont: 'Kalam' } },
  { place: 'Canberra', center: [149.13, -35.3], zoom: 13.4, style: 'blueprint', roughness: 1, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Palmanova', center: [13.31, 45.9054], zoom: 15, style: 'blueprint', roughness: 1, settings: { titleLayout: 'corner', titleFont: 'Patrick Hand' } },
  { place: 'Reykjavík', center: [-21.933, 64.146], zoom: 15.2, style: 'cyanotype', roughness: 2 },
  { place: 'Bergen', center: [5.324, 60.3975], zoom: 15.4, style: 'cyanotype', roughness: 2 },
  { place: 'Istanbul', center: [28.977, 41.007], zoom: 15.2, style: 'vintage-paper', roughness: 2.5, settings: { titleFont: 'Arima', border: true } },
  { place: 'Cartagena', center: [-75.551, 10.4236], zoom: 15.6, style: 'vintage-paper', roughness: 2.5, settings: { titleFont: 'Arima', border: true } },
  { place: 'Valletta', center: [14.514, 35.899], zoom: 14.8, style: 'treasure-map', roughness: 3, settings: { titleFont: 'Kalam', border: true } },
  { place: 'Dubrovnik', center: [18.11, 42.641], zoom: 15.8, style: 'treasure-map', roughness: 3, settings: { titleFont: 'Kalam', border: true } },
  { place: 'Siena', center: [11.3316, 43.3183], zoom: 15.8, style: 'illuminated', roughness: 1.75, settings: { titleFont: 'Arima', border: true } },
  { place: 'Canterbury', center: [1.0828, 51.2798], zoom: 15.6, style: 'illuminated', roughness: 1.75, settings: { titleFont: 'Arima', border: true } },
  { place: 'Sydney', center: [151.211, -33.859], zoom: 14.2, style: 'nautical-chart', roughness: 1.5, settings: { titleLayout: 'corner', titleFont: 'Arima' } },
  { place: 'Hong Kong', center: [114.165, 22.287], zoom: 13.6, style: 'nautical-chart', roughness: 1.5, settings: { titleLayout: 'corner', titleFont: 'Arima' } },
  { place: 'Florence', center: [11.255, 43.77], zoom: 15.4, style: 'guidebook', roughness: 1.25, settings: { titleFont: 'Arima' } },
  { place: 'Salzburg', center: [13.045, 47.799], zoom: 15.4, style: 'guidebook', roughness: 1.25, settings: { titleFont: 'Arima' } },
  { place: 'York', center: [-1.082, 53.961], zoom: 15.4, style: 'survey', roughness: 1.25 },
  { place: 'Bern', center: [7.448, 46.948], zoom: 15, style: 'survey', roughness: 1.25 },
  { place: 'Boston', center: [-71.0545, 42.365], zoom: 15.8, style: 'fire-insurance', roughness: 1.5 },
  { place: 'New Orleans', center: [-90.0644, 29.9584], zoom: 15.6, style: 'fire-insurance', roughness: 1.5 },
  { place: 'Moscow', center: [37.6175, 55.752], zoom: 14.6, style: 'red-star', roughness: 1.75 },
  { place: 'Tbilisi', center: [44.808, 41.691], zoom: 15.2, style: 'red-star', roughness: 1.75 },
  { place: 'Miami Beach', center: [-80.131, 25.781], zoom: 15.2, style: 'pop-pastel', roughness: 2.25, settings: { titleFont: 'Pangolin' } },
  { place: 'Nyhavn', center: [12.591, 55.6798], zoom: 15.6, style: 'pop-pastel', roughness: 2.25, settings: { titleFont: 'Pangolin' } },
  { place: 'Oia', center: [25.3753, 36.4618], zoom: 16, style: 'mediterranean', roughness: 2.25 },
  { place: 'Naples', center: [14.256, 40.849], zoom: 15.6, style: 'mediterranean', roughness: 2.25 },
  { place: 'Singapore', center: [103.86, 1.283], zoom: 14.4, style: 'solarpunk', roughness: 2 },
  { place: 'Freiburg', center: [7.825, 47.976], zoom: 15.6, style: 'solarpunk', roughness: 2 },
  { place: 'Zürich', center: [8.542, 47.372], zoom: 15.2, style: 'soft-greys', roughness: 1.5 },
  { place: 'Helsinki', center: [24.952, 60.1695], zoom: 15, style: 'soft-greys', roughness: 1.5 },
  { place: 'Napier', center: [176.918, -39.49], zoom: 15.6, style: 'art-deco', roughness: 1.5, settings: { titleFont: 'Arima', border: true } },
  { place: 'Shanghai', center: [121.488, 31.24], zoom: 14.8, style: 'art-deco', roughness: 1.5, settings: { titleFont: 'Arima', border: true } },
  { place: 'Arles', center: [4.631, 43.6777], zoom: 15.6, style: 'starry-night', roughness: 3.25, settings: { titleFont: 'Kalam' } },
  { place: 'Saint-Rémy', center: [4.832, 43.789], zoom: 15.8, style: 'starry-night', roughness: 3.25, settings: { titleFont: 'Kalam' } },
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
