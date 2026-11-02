// Read-only evaluation fixture. Mapbox GL JS 3.x, custom classic styles.
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/example-team/day-style',
  center: [121.47, 31.23],
  zoom: 12,
});
map.on('load', () => {
  map.addSource('delivery-route', {
    type: 'geojson',
    data: { type: 'Feature', properties: { id: 'r1' }, geometry: {
      type: 'LineString', coordinates: [[121.45, 31.22], [121.49, 31.24]],
    } },
  });
  map.addLayer({
    id: 'delivery-route', type: 'line', source: 'delivery-route',
    paint: { 'line-color': '#177c6f', 'line-width': 4 },
  });
});
document.querySelector('#night').addEventListener('click', () => {
  map.setStyle('mapbox://styles/example-team/night-style');
});
