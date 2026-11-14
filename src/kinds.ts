export const CITY_SAMPLE = "Every preview shows Bern's old town, in the bend of the Aare.";
export const ALL_SAMPLE = "City looks show Bern's old town. Outdoor looks show Zermatt, under the Matterhorn.";

export const LOOK_KINDS: { name: string; looks: string[]; sample?: string }[] = [
  {
    name: 'Pen and pencil',
    looks: ['pen-and-ink', 'pencil-only', 'ballpoint', 'coloured-pencil', 'red-blue-pencil', 'charcoal', 'engraving', 'linocut', 'ink-brush', 'graph-paper', 'yellow-trace', 'kraft'],
  },
  {
    name: 'Colour',
    looks: ['watercolor', 'crayon', 'highlighter', 'picture-book', 'paper-cut', 'pop-art', 'pop-pastel', 'roughviz-pastel', 'soft-greys', 'solarpunk', 'mediterranean', 'whiteboard'],
  },
  {
    name: 'Print',
    looks: ['risograph', 'newsprint', 'bauhaus', 'ukiyo-e', 'delft-tile', 'greek-vase', 'cyanotype'],
  },
  {
    name: 'Old maps',
    looks: ['vintage-paper', 'treasure-map', 'nautical-chart', 'survey', 'fire-insurance', 'guidebook', 'hand-coloured', 'illuminated', 'red-star'],
  },
  {
    name: 'Outdoors',
    looks: ['trekking', 'military', 'orienteering', 'field-notebook', 'alpine', 'ski', 'atlas'],
    sample: 'Every preview shows Zermatt, under the Matterhorn.',
  },
  {
    name: 'Dark',
    looks: ['blueprint', 'chalkboard', 'starry-night', 'art-deco', 'sashiko', 'paint-pens', 'pavement-chalk', 'stained-glass'],
  },
];
