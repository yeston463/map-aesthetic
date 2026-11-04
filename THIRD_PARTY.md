# Third-party notices

Original skill instructions, theme tokens, synthetic fixtures, and demo code in
this repository are distributed under the root [MIT license](LICENSE).

The demo imports Leaflet 1.9.4, licensed under BSD-2-Clause. Its copyright notice
and license are retained by the package and copied to the demo's public assets.
The authoritative source is [Leaflet LICENSE](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE).
The demo retains Leaflet attribution. It uses no third-party basemap data or tiles.

Development tools include Vite (MIT), Playwright (Apache-2.0), PyYAML (MIT), and
jsonschema (MIT). Their packages retain their own notices. Consult the versions
resolved in `package-lock.json` and `requirements-dev.txt` when redistributing them.

Names and references to ArcGIS, Mapbox, AMap, Baidu, and other providers identify
compatibility guidance. Their SDKs and service assets are not bundled here.
Using a provider in another application requires its own permitted SDK, service,
data, and account configuration; this repository grants no rights to those assets.

The local vector case imports MapLibre GL JS 6.16.0 (BSD-3-Clause), which is installed through npm and is not Mapbox GL JS. Pillow is a development dependency used for generated raster assets and screenshot measurements; its package retains its own license notices. CJK system fonts are not bundled; availability and rasterization vary by host.
