<p align="center">
  <img src="public/logo.svg" alt="roughMaps logo" width="120" />
</p>

<h1 align="center">roughMaps</h1>

<p align="center">Turn any place into a hand-drawn, doodle-style map.</p>

Search for a place and roughMaps redraws its streets, buildings, parks and water as a sketch, with handwritten labels, little trees and doodled icons. Pick one of 48 styles, tune the roughness and line weights, and download it as a PNG for print or screen.

## Features

- Hand-drawn maps of anywhere, drawn with Rough.js
- 48 styles, from pencil, crayon and ink brush to linocut, Ukiyo-e and old map sheets
- Roughness, stroke, fill and fill style controls
- Street and place names in handwriting, for Latin, Cyrillic, Greek, Arabic, Hebrew, Chinese, Japanese, Korean, Thai, Hindi and Bengali
- Trees in parks and icons for cafés, restaurants, museums and more
- PNG export at A4, A3, square, phone and 4K sizes, up to 300 DPI
- Save and load your setup as a small config file
- Whole countries too: search one and get its outline, neighbours, capital, big cities, lakes and rivers

## How it works

- **Map data:** OpenStreetMap, served as vector tiles by OpenFreeMap
- **Countries:** outlines, lakes and rivers from Natural Earth, built with `node scripts/countries.mjs <folder>`. Detailed outlines live in `public/detail/` and only load when you zoom in
- **Map picker:** MapLibre GL
- **Drawing:** Rough.js on a canvas
- **Search:** Nominatim, with suggestions while typing from Photon
- **App:** a static site built with Vite and TypeScript

Everything runs in the browser, so there's no backend.

## Run it locally

```bash
npm install
npm run dev
```

`npm run build` makes a production build in `dist/`. `npm run logo` redraws the logo in `public/logo.svg`.

## Credits

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL. Tiles by [OpenFreeMap](https://openfreemap.org) © [OpenMapTiles](https://www.openmaptiles.org). Country outlines, cities, lakes and rivers from [Natural Earth](https://www.naturalearthdata.com) (public domain).

## License

roughMaps is released under the [MIT License](LICENSE).
