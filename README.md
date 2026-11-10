# roughMaps

Turn any place into a hand-drawn, doodle-style map.

Pick an area, and roughMaps pulls the streets, buildings, parks and water from OpenStreetMap and redraws them with a sketchy, hand-drawn look. Download the result as SVG or PNG.

## How it works

- **Data:** OpenStreetMap via the Overpass API, place search via Nominatim
- **Drawing:** d3-geo for the projection, Rough.js for the hand-drawn look
- **App:** static site built with Vite, hosted on Cloudflare Pages

Everything runs in the browser, so there's no backend.

## Status

Early days, nothing to run yet.

## Credits

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL.
