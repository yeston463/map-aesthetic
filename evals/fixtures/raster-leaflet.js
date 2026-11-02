// Read-only evaluation fixture. Leaflet 1.9.4, ordinary raster tiles.
// Reduced input: this is a code fragment, not the runnable local project that
// evals/cases.md Case 1 describes. The tile URL is the live OpenStreetMap tile
// service, so running it needs network and is subject to that provider's usage
// policy; nothing here is served locally. The recorded evaluation did not run it.
const map = L.map('map').setView([31.23, 121.47], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);
const statusColors = { normal: '#1c8b65', alert: '#c64040' };
const sites = [
  { id: 's1', coordinates: [31.23, 121.47], status: 'normal' },
  { id: 's2', coordinates: [31.24, 121.48], status: 'alert' },
];
sites.forEach(site => L.circleMarker(site.coordinates, {
  radius: 5,
  color: statusColors[site.status],
  fillColor: statusColors[site.status],
  fillOpacity: 0.8,
}).bindPopup(site.id).addTo(map));
