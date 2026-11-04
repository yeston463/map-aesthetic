// Vector-style case. Runs offline on MapLibre GL JS against two local classic-style
// JSON files, and exercises the part that is shared with Mapbox GL JS: a style
// replacement drops runtime sources and layers, so the application has to bring its own
// back in dependency order, keep selection, and not accumulate duplicates.
//
// mapbox-gl-variant.js is an unverified Mapbox integration example, not runtime evidence.
// This fixture runs MapLibre only. See README.md and REMAINING_STEPS.md.
import * as maplibregl from '/node_modules/maplibre-gl/dist/maplibre-gl.mjs';
import { attachRestoration } from './restore.js';
import dayTheme from '/skills/map-aesthetic/assets/themes/quiet-analysis.json' with { type: 'json' };
import nightTheme from '/skills/map-aesthetic/assets/themes/night-operations.json' with { type: 'json' };

const query = name => document.querySelector(`[data-testid="${name}"]`);
const readout = (name, value) => { query(name).textContent = String(value); };
const themes = { day: dayTheme, night: nightTheme };
const BREAKS = [400, 800, 1200];
const CENTER = [121.4385, 31.2265];

const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

const response = await fetch('/cases/mapbox-style/data/business.geojson');
const sourceText = await response.text();
const sourceHash = await digest(sourceText);
const raw = JSON.parse(sourceText);

// This fixture derives IDs for a fixed data snapshot. The input hash identifies the
// source bytes; the verifier separately compares the features used by the app.
const features = raw.features.map((feature, index) => ({
  ...feature,
  properties: { ...feature.properties, uid: feature.id ?? feature.properties.uid ?? `u${index}` },
}));
const split = kind => ({
  type: 'FeatureCollection',
  features: features.filter(feature => kind === 'zones' ? feature.geometry.type === 'Polygon'
    : kind === 'route' ? feature.geometry.type === 'LineString' : feature.geometry.type === 'Point'),
});

let current = 'day';
let selectedUid = null;
let activePopup = null;
let switching = false;
const tally = { listenersBound: 0, popupsOpened: 0 };

const map = new maplibregl.Map({
  container: 'map',
  style: `/cases/mapbox-style/styles/${current}.json`,
  center: CENTER,
  zoom: 14,
  localIdeographFontFamily: 'sans-serif',
  attributionControl: { compact: false },
});
map.addControl(new maplibregl.AttributionControl({ customAttribution: '合成本地数据 · 无外部请求' }));
map.getContainer().append(query('legend'));

// Four classes, three breaks: below the first break takes the lightest stop, and each
// further break steps up the ramp. Class boundaries come from the data, not from colour.
const zoneColour = theme => {
  const ramp = theme.cartography.sequential.slice(0, 4);
  return ['case', ['==', ['get', 'value'], null], theme.cartography.missing.color,
    ['step', ['get', 'value'], ramp[0], BREAKS[0], ramp[1], BREAKS[1], ramp[2], BREAKS[2], ramp[3]]];
};

const owned = {
  sources: [
    { id: 'zones', value: { type: 'geojson', data: split('zones'), promoteId: 'uid' } },
    { id: 'delivery-route', value: { type: 'geojson', data: split('route'), promoteId: 'uid' } },
    { id: 'stations', value: { type: 'geojson', data: split('stations'), promoteId: 'uid' } },
  ],
  layers: [
    { id: 'zone-fill', before: 'road-casing', value: { id: 'zone-fill', type: 'fill', source: 'zones',
      paint: { 'fill-color': '#888888', 'fill-opacity': 0.4 } } },
    { id: 'zone-boundary', before: 'road-casing', value: { id: 'zone-boundary', type: 'line', source: 'zones',
      paint: { 'line-color': '#888888', 'line-width': 1 } } },
    { id: 'route-casing', before: 'place-name', value: { id: 'route-casing', type: 'line', source: 'delivery-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7 } } },
    { id: 'route-line', before: 'place-name', value: { id: 'route-line', type: 'line', source: 'delivery-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#137c6c', 'line-width': 4 } } },
    { id: 'station-point', value: { id: 'station-point', type: 'circle', source: 'stations',
      paint: { 'circle-color': '#888888', 'circle-radius': 6,
               'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } } },
    { id: 'station-selected', value: { id: 'station-selected', type: 'circle', source: 'stations',
      paint: { 'circle-color': 'rgba(0, 0, 0, 0)', 'circle-radius': 0,
               'circle-stroke-color': 'rgba(0, 0, 0, 0)', 'circle-stroke-width': 3 } } },
  ],
};

function applyTheme() {
  // Business paint follows the active theme; the basemap paint comes from the style JSON.
  const theme = themes[current];
  const cartography = theme.cartography;
  restoration.applyPaint([
    { id: 'zone-fill', target: 'paint', values: { 'fill-color': zoneColour(theme), 'fill-opacity': cartography.area.fillOpacity } },
    { id: 'zone-boundary', target: 'paint', values: { 'line-color': cartography.area.boundaryColor,
                                                      'line-width': cartography.area.boundaryWidthPx } },
    { id: 'route-casing', target: 'paint', values: { 'line-color': cartography.route.casingColor,
                                                     'line-width': cartography.route.casingWidthPx } },
    { id: 'route-line', target: 'paint', values: { 'line-color': cartography.route.color,
                                                   'line-width': cartography.route.widthPx } },
    { id: 'station-point', target: 'paint', values: {
      'circle-color': ['match', ['get', 'class_name'],
        ...cartography.classes.flatMap(item => [item.id, item.color]), '#888888'],
      'circle-radius': ['step', ['get', 'throughput'], 5, 600, 7, 1200, 9],
      'circle-stroke-color': cartography.site.strokeColor,
      'circle-stroke-width': cartography.site.strokeWidthPx } },
    // Selection adds a ring and keeps the class colour, so an emphasized station does
    // not stop saying which kind of station it is.
    { id: 'station-selected', target: 'paint', values: {
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], cartography.selection.color, ['rgba', 0, 0, 0, 0]],
      'circle-stroke-width': cartography.selection.widthPx,
      'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 12, 0] } },
  ]);
  readout('style-readout', `${current} · ${theme.id}`);
  renderLegend(theme);
}

function reapplySelection() {
  if (!selectedUid) return;
  const feature = features.find(item => item.properties.uid === selectedUid);
  if (!feature) return;
  map.setFeatureState({ source: 'stations', id: selectedUid }, { selected: true });
}

owned.onRestore = () => { applyTheme(); reapplySelection(); };

const restoration = attachRestoration(map, owned);
restoration.reapplySelection = reapplySelection;

map.on('load', () => {
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  tally.listenersBound += 1;
});

map.on('click', 'station-point', event => {
  const properties = event.features?.[0]?.properties;
  if (!properties) return;
  select(properties.uid, event.features[0]);
  tally.popupsOpened += 1;
});
tally.listenersBound += 1;

function select(uid, feature) {
  if (selectedUid) map.removeFeatureState({ source: 'stations', id: selectedUid }, 'selected');
  selectedUid = uid;
  map.setFeatureState({ source: 'stations', id: uid }, { selected: true });
  const properties = feature.properties;
  activePopup?.remove();
  const content = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = properties.name;
  const description = document.createElement('span');
  description.textContent = `${properties.class_name} · ${properties.throughput ?? properties.value ?? ''}`;
  content.append(title, description);
  activePopup = new maplibregl.Popup({ offset: 12, closeButton: true, className: 'ml-pop' })
    .setLngLat(feature.geometry.coordinates)
    .setDOMContent(content)
    .addTo(map);
  readout('selection-readout', properties.name);
}

function counts() {
  const style = map.getStyle();
  const ownedIds = owned.layers.map(layer => layer.id);
  return {
    layers: style.layers.length,
    sources: Object.keys(style.sources).length,
    owned: ownedIds.filter(id => Boolean(map.getLayer(id))).length,
    duplicates: ownedIds.length - new Set(style.layers.filter(layer => ownedIds.includes(layer.id)).map(layer => layer.id)).size,
  };
}

function report() {
  const value = counts();
  readout('layer-readout', `${value.layers} (owned ${value.owned})`);
  readout('source-readout', value.sources);
  readout('load-readout', restoration.counters.styleLoads);
  query('ready').dataset.state = 'styling';
  query('ready').textContent = '渲染中…';
}

map.on('idle', () => {
  query('ready').dataset.state = switching ? 'switching' : 'ready';
  query('ready').textContent = switching ? '连续切换中…' : '就绪';
});

function setTheme(theme) {
  current = theme;
  query('theme-select').value = current;
  query('ready').dataset.state = 'loading';
  query('ready').textContent = '载入样式…';
  map.setStyle(`/cases/mapbox-style/styles/${current}.json`);
}

map.on('style.load', report);
tally.listenersBound += 1;

function renderLegend(theme) {
  const list = query('legend');
  const ramp = theme.cartography.sequential.slice(0, 4);
  list.innerHTML = '';
  const items = [
    ...theme.cartography.classes.map(item => ({ color: item.color, text: item.id })),
    { color: theme.cartography.route.color, text: '主配送线', casing: theme.cartography.route.casingColor },
    { color: theme.cartography.selection.color, text: '选中（外环）', ring: true },
    ...ramp.map((color, index) => ({ color, text: index === 0 ? `< ${BREAKS[0]}`
      : index === 3 ? `≥ ${BREAKS[2]}` : `${BREAKS[index - 1]}–${BREAKS[index]}`, area: true })),
  ];
  const ul = document.createElement('ul');
  items.forEach(item => {
    const li = document.createElement('li');
    const swatch = document.createElement('i');
    swatch.style.background = item.color;
    if (item.ring) {
      swatch.style.background = theme.cartography.land;
      swatch.style.border = `2px solid ${item.color}`;
    }
    if (item.casing) swatch.style.boxShadow = `0 0 0 1px ${item.casing}`;
    if (!item.area) swatch.style.borderRadius = '50%';
    li.append(swatch, document.createTextNode(item.text));
    li.dataset.color = item.color;
    li.dataset.kind = item.ring ? 'ring' : item.area ? 'area' : 'feature';
    ul.append(li);
  });
  list.append(ul);
}

query('theme-select').addEventListener('change', event => setTheme(event.target.value));
query('switch').addEventListener('click', () => {
  setTheme(current === 'day' ? 'night' : 'day');
});
query('switch-x8').addEventListener('click', async () => {
  if (switching) return;
  switching = true;
  query('switch-x8').disabled = true;
  query('ready').dataset.state = 'switching';
  for (let index = 0; index < 8; index += 1) {
    const loaded = new Promise(resolve => map.once('idle', resolve));
    setTheme(current === 'day' ? 'night' : 'day');
    await loaded;
  }
  switching = false;
  query('switch-x8').disabled = false;
  query('ready').dataset.state = 'ready';
  query('ready').textContent = '就绪';
});

window.__case = {
  engine: 'maplibre-gl',
  engineVersion: maplibregl.getVersion(),
  switching: () => switching,
  map,
  features,
  sourceHash,
  restoration,
  tally,
  counts,
  select: uid => {
    const f = features.find(item => item.properties.uid === uid);
    if (f) select(uid, f);
  },
  selected: () => selectedUid,
  current: () => current,
  theme: () => themes[current],
  routeDeclared: () => themes[current].cartography.route.color,
  stationDeclared: uid => {
    const item = themes[current].cartography.classes.find(entry => entry.id === features.find(f => f.properties.uid === uid)?.properties.class_name);
    return item?.color ?? null;
  },
  // Screen position of a feature, so a pixel sample can be taken from the screenshot.
  screenPoint: uid => {
    const feature = features.find(item => item.properties.uid === uid);
    if (!feature) return null;
    const point = map.project(feature.geometry.coordinates);
    return { x: Math.round(point.x), y: Math.round(point.y) };
  },
  routeMidScreen: () => {
    const route = features.find(item => item.geometry.type === 'LineString');
    const coordinates = route.geometry.coordinates;
    const middle = coordinates[Math.floor(coordinates.length / 2)];
    const point = map.project(middle);
    return { x: Math.round(point.x), y: Math.round(point.y) };
  },
  layerIds: () => map.getStyle().layers.map(layer => layer.id),
};
