// Three-directions demo.
//
// The layers are built once and the styles are applied on top, so switching direction never
// rebuilds the map: no listener, source or DOM node is accumulated by a switch. The data is
// the same file the case uses, read byte for byte; only the presentation differs.
//
// The mobile popup geometry is the logic the case already proved: the application owns the
// sheet-aware pan, because Leaflet's auto-pan only knows the map viewport.
import { refine } from './refinements.js';

const params = new URLSearchParams(location.search);

const STYLE_LOADERS = {
  'light-operations': () => import('./styles/light-operations.js'),
  'warm-city-guide': () => import('./styles/warm-city-guide.js'),
  'dark-monitoring': () => import('./styles/dark-monitoring.js'),
};
const STYLE_ORDER = ['light-operations', 'warm-city-guide', 'dark-monitoring'];

const loaded = Object.fromEntries(await Promise.all(
  STYLE_ORDER.map(async id => [id, refine(await STYLE_LOADERS[id](), id)])));

let activeId = STYLE_ORDER.includes(params.get('style')) ? params.get('style') : STYLE_ORDER[0];
let style = loaded[activeId];

const query = name => document.querySelector(`[data-testid="${name}"]`);
const readout = (name, value) => { query(name).textContent = String(value); };

const AREA = { lon: [121.43, 121.447], lat: [31.22, 31.233] };
const BOUNDS = L.latLngBounds([AREA.lat[0], AREA.lon[0]], [AREA.lat[1], AREA.lon[1]]);
const toLatLng = coordinates => L.latLng(coordinates[1], coordinates[0]);

const LAYER_FILES = ['context', 'sites', 'route', 'districts', 'labels'];
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

const dataSha = {};
const data = Object.fromEntries(await Promise.all(LAYER_FILES.map(async name => {
  const response = await fetch(`../three-directions/data/${name}.geojson`);
  if (!response.ok) throw new Error(`Failed to load ${name}.geojson`);
  const text = await response.text();
  dataSha[`${name}.geojson`] = await digest(text);
  return [name, JSON.parse(text)];
})));

const map = L.map('map', { attributionControl: true, minZoom: 13, maxZoom: 17,
  zoomSnap: .25, zoomDelta: .5 })
  .fitBounds(BOUNDS, { padding: [32, 32] });

// The tile layer is kept as a reference raster, so the vector basemap below can be compared
// against the pixels it replaces. It is off by default: the raster cannot be recoloured per
// feature, which is exactly the limitation this round set out to remove.
const basemapLayer = L.tileLayer('../three-directions/tiles/{z}/{x}/{y}.png', {
  // 15 is the deepest zoom the generator produces; above it Leaflet overzooms these tiles
  // instead of asking for files that do not exist.
  bounds: BOUNDS, minZoom: 13, maxZoom: 17, minNativeZoom: 14, maxNativeZoom: 15,
  opacity: 1,
  attribution: '合成栅格底图（本地生成，非真实地点）',
});
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.setPosition('topright');
map.attributionControl.addAttribution('合成数据（非真实地点）');

const { createVectorBasemap, applyVectorBasemap } = await import('./vector-basemap.js');
const vectorBasemap = createVectorBasemap(map, data.context, data.labels);

// Panes are created once; a direction only changes their z-index. The vector basemap gets
// panes of its own, created with it, so the street grid sits under the business layers.
//
// The basemap pane order is structural rather than stylistic: it fixes the order in which the
// ground, the street grid and the place names are read. The three directions differ in the
// colours of those layers, not in their order.
const PANE_NAMES = ['districts', 'casing', 'route', 'sites', 'labels', 'selection'];
const paneOf = name => (style.panes[name] ? name : 'overlayPane');

const values = data.districts.features.map(feature => feature.properties.value).filter(value => value !== null);
const mean = values.reduce((total, value) => total + value, 0) / values.length;
// Class breaks are computed from the data and stated in the legend, so a restyle cannot move a
// district between classes.
const classOf = value => (value === null ? -1
  : value < style.districts.breaks[0] ? 0
  : value < style.districts.breaks[1] ? 1
  : value < style.districts.breaks[2] ? 2 : 3);
const deviationClassOf = value => {
  if (value === null) return -1;
  const difference = (value - mean) / mean;
  return difference < -0.4 ? 0 : difference < -0.05 ? 1 : difference <= 0.05 ? 2 : difference <= 0.4 ? 3 : 4;
};

let measure = 'absolute';
let selectedId = null;
const tally = { layersAdded: 0, listenersBound: 0, restyles: 0, popupsBound: 0, listRebuilds: 0 };

const districtLayers = data.districts.features.map(feature => {
  const layer = L.polygon(feature.geometry.coordinates[0].map(toLatLng), { pane: 'overlayPane' });
  layer.feature = feature.properties;
  tally.layersAdded += 1;
  return layer.addTo(map);
});

const routePoints = data.route.features[0].geometry.coordinates.map(toLatLng);
const casing = L.polyline(routePoints, { pane: 'overlayPane', lineCap: 'round' }).addTo(map);
const routeLine = L.polyline(routePoints, { pane: 'overlayPane', lineCap: 'round' }).addTo(map);
tally.layersAdded += 2;

// Rank of each station by throughput, so a direction can keep the names that matter first.
const stationRank = new Map();
data.sites.features
  .slice()
  .sort((a, b) => b.properties.throughput - a.properties.throughput)
  .forEach((feature, index) => stationRank.set(feature.properties.site_id, index));

const labelLayers = data.labels.features.map(feature => {
  const name = feature.properties.name;
  const span = document.createElement('span');
  span.textContent = name;
  span.title = name;
  const marker = L.marker(toLatLng(feature.geometry.coordinates), {
    pane: 'overlayPane', interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'map-label', html: span }),
  });
  marker.properties = feature.properties;
  marker.name = name;
  tally.layersAdded += 1;
  return marker;
});

const halo = L.circleMarker([0, 0], { pane: 'overlayPane', interactive: false, fill: false });

const siteLayers = data.sites.features.map(feature => {
  const properties = feature.properties;
  const marker = L.circleMarker(toLatLng(feature.geometry.coordinates), {
    pane: 'overlayPane', radius: 5, interactive: true,
  });
  marker.feature = properties;
  marker.baseRadius = 5;
  tally.layersAdded += 1;
  marker.bindPopup(() => style.popup.render(marker.feature), {
    autoPan: true, autoPanPadding: [24, 24], offset: [0, -6], className: '', closeButton: true,
  });
  tally.popupsBound += 1;
  marker.on('click', () => selectSite(properties.site_id));
  marker.on('mouseover', () => { if (selectedId !== properties.site_id && style.site.hover) marker.setStyle(style.site.hover); });
  marker.on('mouseout', () => paintSite(marker));
  tally.listenersBound += 3;
  return marker.addTo(map);
});

// ---------------------------------------------------------------- styling

function applyPanes() {
  PANE_NAMES.forEach(name => {
    const target = style.panes[name];
    let pane = map.getPane(name);
    if (target === null || target === undefined) return;
    if (!pane) {
      pane = map.createPane(name);
      pane.style.pointerEvents = name === 'labels' ? 'none' : '';
    }
    pane.style.zIndex = target;
    if (name === 'labels') pane.style.pointerEvents = 'none';
  });
}

function applyBasemap() {
  // The raster reference is off unless the reader asks for it; the vector basemap carries the
  // design. Both can be shown at once, which is how the difference between them is inspected.
  const showRaster = style.basemap.rasterReference === true;
  if (showRaster) {
    if (!map.hasLayer(basemapLayer)) basemapLayer.addTo(map);
    basemapLayer.setOpacity(style.basemap.rasterOpacity ?? 1);
    const container = basemapLayer.getContainer();
    container.style.filter = style.basemap.rasterFilter || '';
  } else {
    if (map.hasLayer(basemapLayer)) basemapLayer.remove();
  }
  map.getContainer().style.background = style.basemap.background || '';
  applyVectorBasemap(vectorBasemap, style, { metersPerPixel: metersPerPixel() });
}

function applyRoute() {
  const casingOn = style.route.casingWeight > 0 && style.route.casingColor;
  casing.setStyle({
    color: style.route.casingColor || 'transparent',
    weight: style.route.casingWeight || 0,
    opacity: style.route.casingOpacity ?? 1,
    dashArray: style.route.casingDashArray || null,
  });
  if (casingOn) { if (!map.hasLayer(casing)) casing.addTo(map); }
  else casing.remove();
  routeLine.setStyle({
    color: style.route.color,
    weight: style.route.weight,
    opacity: style.route.opacity ?? 1,
    dashArray: style.route.dashArray || null,
  });
}

function applyDistricts() {
  const ramp = measure === 'deviation' ? style.districts.deviation.ramp : style.districts.ramp;
  const pick = measure === 'deviation' ? deviationClassOf : classOf;
  districtLayers.forEach(layer => {
    const index = pick(layer.feature.value);
    if (index === -1) {
      layer.setStyle({
        fillColor: style.districts.missing.fillColor, fillOpacity: style.districts.missing.fillOpacity,
        color: style.districts.boundary.color ?? style.districts.missing.fillColor,
        weight: style.districts.boundary.weight || 1,
        dashArray: style.districts.boundary.dashArray || null,
      });
      applyMissingPattern(layer);
      return;
    }
    const fill = ramp[Math.min(index, ramp.length - 1)];
    layer.setStyle({
      fillColor: fill, fillOpacity: style.districts.fillOpacity,
      color: style.districts.boundary.color ?? fill,
      weight: style.districts.boundary.weight || 0,
      dashArray: style.districts.boundary.dashArray || null,
    });
  });
  tally.restyles += 1;
}

// The missing value carries a texture, so "no data" cannot be mistaken for the lowest class.
let patternSerial = 0;
function applyMissingPattern(layer) {
  const path = layer.getElement();
  if (!path) return;
  const patternKind = style.districts.missing.pattern;
  if (!patternKind || patternKind === 'none') { path.removeAttribute('fill'); return; }
  const svg = path.ownerSVGElement;
  const namespace = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(namespace, 'defs'); svg.prepend(defs); }
  const id = `missing-hatch-${style.variant}-${patternSerial += 1}`;
  const pattern = document.createElementNS(namespace, 'pattern');
  pattern.id = id;
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', '14'); pattern.setAttribute('height', '14');
  const background = document.createElementNS(namespace, 'rect');
  background.setAttribute('width', '14'); background.setAttribute('height', '14');
  background.setAttribute('fill', style.districts.missing.fillColor);
  const hatch = document.createElementNS(namespace, 'path');
  hatch.setAttribute('d', patternKind === 'cross-hatch'
    ? 'M0 0L14 14M0 14L14 0' : 'M-2 2L2-2M0 14L14 0M12 16L16 12');
  hatch.setAttribute('stroke', style.districts.missing.hatchColor || style.labels.color);
  hatch.setAttribute('stroke-width', '.8');
  hatch.setAttribute('stroke-opacity', '.55');
  pattern.append(background, hatch); defs.append(pattern);
  path.setAttribute('fill', `url(#${id})`);
}

function paintSite(marker) {
  const properties = marker.feature;
  const isSelected = properties.site_id === selectedId;
  const classColor = style.site.fillBy({ properties });
  const alert = properties.status === 'alert';
  const ring = style.site.statusRing;
  // A direction may own the outline itself, which is how the guide direction keeps the class
  // in the ring and gives the alert state to the fill.
  const stroke = isSelected ? style.site.selected.strokeColor
    : style.site.strokeBy ? style.site.strokeBy({ properties })
      : alert && ring ? ring.alert : style.site.strokeColor ?? classColor;
  const weight = isSelected ? style.site.selected.strokeWidth
    : style.site.strokeBy ? (style.site.strokeWeightBy ? style.site.strokeWeightBy({ properties })
      : style.site.strokeWidth || 2)
      : alert && ring ? ring.alertWeight : style.site.strokeWidth || 0;
  const radius = marker.baseRadius + (isSelected ? style.site.selected.radiusStep || 0 : 0);
  marker.setStyle({
    fillColor: isSelected && style.site.selected.fillColor ? style.site.selected.fillColor : classColor,
    fillOpacity: style.site.fillOpacity ?? 1,
    color: stroke, weight, radius,
  });
  if (isSelected && style.site.selected.haloWidth) {
    halo.setLatLng(marker.getLatLng()).setRadius(radius + style.site.selected.haloWidth + 2)
      .setStyle({ color: style.site.selected.haloColor, weight: style.site.selected.haloWidth, fill: false }).addTo(map);
  }
}

function paintSites() {
  siteLayers.forEach(paintSite);
  if (!selectedId) halo.remove();
}

function metersPerPixel() {
  return 156543.03392 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom();
}

function paintLabels() {
  const resolution = metersPerPixel();
  // Re-evaluate the actual visible place labels on every view change.
  vectorBasemap.placeLayers.forEach(marker => {
    const span = marker.getElement()?.querySelector('span');
    if (!span) return;
    span.style.visibility = '';
    span.style.display = style.basemap.placeLabels.visible(marker.properties, resolution) ? '' : 'none';
  });
  // A narrow map cannot carry twelve station names. The direction decides how many it keeps;
  // the context tells it how narrow the map is and how large each station is.
  const narrow = map.getContainer().getBoundingClientRect().width < 560;
  const candidates = labelLayers.filter(marker => marker.properties.site_id === selectedId
    || style.labels.visible(marker.properties, resolution, selectedId, {
      narrow, rank: stationRank.get(marker.properties.site_id) ?? 99,
    }));
  candidates.forEach(marker => {
    if (!map.hasLayer(marker)) marker.addTo(map);
    styleLabel(marker);
  });
  labelLayers.filter(marker => !candidates.includes(marker)).forEach(marker => marker.remove());
  if (style.labels.declutter) declutter(candidates);
  const visible = labelLayers.filter(marker => map.hasLayer(marker));
  readout('label-readout', visible.length);
}

// Leaflet has no label collision engine, so this is an application-side approximation: a greedy
// pass in a stated priority order, recomputed on every view change.
function declutter(candidates) {
  // Measure the text itself, not Leaflet's fixed-size icon container.
  const places = vectorBasemap.placeLayers.filter(marker => map.hasLayer(marker))
    .map(marker => ({ marker, kind: 'place', span: marker.getElement()?.querySelector('span') }))
    .filter(item => item.span && item.span.style.display !== 'none');
  const sites = candidates.map(marker => ({ marker, kind: 'site', span: marker.getElement()?.querySelector('span') }))
    .filter(item => item.span);
  const rank = item => {
    const properties = item.marker.properties;
    if (properties.site_id === selectedId) return -100;
    if (item.kind === 'place' && properties.tier === 0) return 0;
    if (item.kind === 'site') return 10 + (stationRank.get(properties.site_id) ?? 99) / 100;
    return 20 + (properties.tier ?? 0);
  };
  const ordered = [...places, ...sites].sort((a, b) => rank(a) - rank(b)
    || a.marker.name.localeCompare(b.marker.name, 'zh-CN'));
  const mapBox = map.getContainer().getBoundingClientRect();
  const placed = [];
  ordered.forEach(item => {
    const rect = item.span.getBoundingClientRect();
    if (!rect) return;
    const box = { left: rect.left - 2, right: rect.right + 2, top: rect.top - 2, bottom: rect.bottom + 2 };
    const outside = box.left < mapBox.left || box.right > mapBox.right
      || box.top < mapBox.top || box.bottom > mapBox.bottom;
    const collides = placed.some(other => Math.min(box.right, other.right) > Math.max(box.left, other.left)
      && Math.min(box.bottom, other.bottom) > Math.max(box.top, other.top));
    if ((outside || collides) && item.kind === 'place') item.span.style.visibility = 'hidden';
    else if (outside || collides) item.marker.remove();
    else placed.push(box);
  });
}

function styleLabel(marker) {
  const element = marker.getElement()?.querySelector('span');
  if (!element) return;
  // A long name is abbreviated with the direction's own documented rule; the full name stays
  // in the title attribute, in the popup and in the site list.
  element.textContent = style.labels.shorten(marker.name);
  element.title = marker.name;
  element.style.fontSize = `${style.labels.sizePx}px`;
  element.style.color = style.labels.color;
  element.style.fontWeight = String(style.labels.weight);
  element.style.letterSpacing = style.labels.letterSpacing;
  element.style.fontFamily = style.labels.fontFamily || '';
  element.style.opacity = String(style.labels.opacity ?? 1);
  const width = style.labels.haloWidthPx;
  element.style.textShadow = width > 0
    ? [[0, width], [0, -width], [width, 0], [-width, 0]]
        .map(([x, y]) => `${x}px ${y}px 0 ${style.labels.haloColor}`).join(', ')
    : 'none';
  element.className = style.labels.tierClass
    ? `map-label-text ${style.labels.tierClass(marker.properties)}` : 'map-label-text';
}

// The legend is generated from the same objects the map paints from, so a colour change cannot
// leave it describing the previous map. It also receives how many districts fall in each class,
// because "how many" is part of what an operations reader checks.
function legendContext() {
  const classCounts = [0, 0, 0, 0];
  let missingCount = 0;
  data.districts.features.forEach(feature => {
    const value = feature.properties.value;
    if (value === null) { missingCount += 1; return; }
    classCounts[classOf(value)] += 1;
  });
  return { classCounts, missingCount, classCount: classCounts.length };
}

function renderLegend() {
  const list = query('legend');
  list.replaceChildren();
  style.legend.entries(measure, legendContext()).forEach(entry => {
    const item = document.createElement('li');
    if (entry.className) item.className = entry.className;
    const swatch = document.createElement('i');
    swatch.classList.add(`swatch-${entry.kind}`);
    if (entry.color && entry.kind !== 'ring') swatch.style.background = entry.color;
    if (entry.kind === 'ring') swatch.style.border = `3px solid ${entry.color}`;
    if (entry.kind === 'line' && entry.casing) swatch.style.boxShadow = `0 0 0 1px ${entry.casing}`;
    if (entry.kind === 'missing') swatch.classList.add('missing-swatch');
    item.append(swatch, document.createTextNode(entry.text));
    if (entry.value !== undefined) {
      const value = document.createElement('span');
      value.className = 'legend-value';
      value.textContent = entry.value;
      item.append(value);
    }
    item.dataset.color = entry.color ?? '';
    list.append(item);
  });
}

// The layer switcher follows webgis-history's layer panel: each group is named for what it
// shows, and the state is applied to the real Leaflet objects, so a hidden layer is really
// removed from the map rather than only faded.
const LAYER_GROUPS = [
  { id: 'blocks', name: '街区面', kind: 'basemap' },
  { id: 'water', name: '水系', kind: 'basemap' },
  { id: 'roads', name: '道路', kind: 'basemap' },
  { id: 'place-labels', name: '地名注记', kind: 'basemap' },
  { id: 'districts', name: '片区色带', kind: 'business' },
  { id: 'route', name: '主配送线', kind: 'business' },
  { id: 'sites', name: '站点', kind: 'business' },
  { id: 'site-labels', name: '站点名', kind: 'business' },
];

const layerState = Object.fromEntries(LAYER_GROUPS.map(group => [group.id, true]));

function basemapGroupVisible(id) {
  if (id === 'blocks') return vectorBasemap.blockLayers.some(layer => map.hasLayer(layer));
  if (id === 'water') return vectorBasemap.waterLayers.some(layer => map.hasLayer(layer));
  if (id === 'roads') return vectorBasemap.arterials.some(entry => map.hasLayer(entry.casing));
  if (id === 'place-labels') return vectorBasemap.placeLayers.some(marker => map.hasLayer(marker));
  return true;
}

function setBasemapGroupVisible(id, visible) {
  if (id === 'blocks') vectorBasemap.blockLayers.forEach(layer => (visible ? layer.addTo(map) : layer.remove()));
  if (id === 'water') vectorBasemap.waterLayers.forEach(layer => (visible ? layer.addTo(map) : layer.remove()));
  if (id === 'roads') {
    vectorBasemap.arterials.forEach(entry => {
      (visible ? entry.casing.addTo(map) : entry.casing.remove());
      (visible ? entry.core.addTo(map) : entry.core.remove());
    });
    vectorBasemap.locals.forEach(entry => {
      (visible ? entry.casing.addTo(map) : entry.casing.remove());
      (visible ? entry.core.addTo(map) : entry.core.remove());
    });
  }
  if (id === 'place-labels') {
    vectorBasemap.placeLayers.forEach(marker => (visible ? marker.addTo(map) : marker.remove()));
  }
}

function setBusinessGroupVisible(id, visible) {
  if (id === 'districts') {
    districtLayers.forEach(layer => (visible ? layer.addTo(map) : layer.remove()));
  }
  if (id === 'route') {
    (visible ? routeLine.addTo(map) : routeLine.remove());
    if (visible && style.route.casingWeight > 0 && style.route.casingColor) casing.addTo(map);
    else casing.remove();
  }
  if (id === 'sites') {
    siteLayers.forEach(marker => (visible ? marker.addTo(map) : marker.remove()));
    if (!visible) halo.remove();
  }
  if (id === 'site-labels') {
    if (visible) paintLabels();
    else labelLayers.forEach(marker => marker.remove());
    readout('label-readout', visible ? labelLayers.filter(marker => map.hasLayer(marker)).length : 0);
  }
}

function applyLayerState() {
  LAYER_GROUPS.forEach(group => {
    const visible = layerState[group.id];
    if (group.kind === 'basemap') setBasemapGroupVisible(group.id, visible);
    else setBusinessGroupVisible(group.id, visible);
  });
}

function renderLayerList() {
  const list = query('layer-list');
  list.replaceChildren();
  LAYER_GROUPS.forEach(group => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.layer = group.id;
    button.dataset.testid = `layer-${group.id}`;
    button.setAttribute('aria-pressed', String(layerState[group.id]));
    const dot = document.createElement('span');
    dot.className = 'layer-dot';
    dot.dataset.kind = group.kind;
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = group.name;
    button.append(dot, name);
    button.addEventListener('click', () => {
      layerState[group.id] = !layerState[group.id];
      button.setAttribute('aria-pressed', String(layerState[group.id]));
      applyLayerState();
    });
    item.append(button);
    list.append(item);
  });
}

function renderSites() {
  const lists = [[query('site-list'), 'site-'], [query('site-list-sheet'), 'site-sheet-']];
  lists.forEach(([list, prefix]) => {
    // The list is rebuilt as a whole, so the old buttons and their listeners go with it.
    list.replaceChildren();
    tally.listRebuilds += 1;
    data.sites.features.forEach(feature => {
      const properties = feature.properties;
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.site = properties.site_id;
      button.dataset.testid = `${prefix}${properties.site_id}`;
      button.setAttribute('aria-pressed', String(properties.site_id === selectedId));
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = style.site.dotColor
        ? style.site.dotColor({ properties }) : style.site.fillBy({ properties });
      dot.style.boxShadow = properties.status === 'alert'
        ? `0 0 0 2px ${style.site.statusRing?.alert ?? 'transparent'}` : 'none';
      const text = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = properties.name;
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = `${properties.class_name} · ${properties.status === 'alert' ? '异常' : '正常'}`;
      const throughput = document.createElement('span');
      throughput.className = 'throughput';
      throughput.textContent = `${properties.throughput} 件`;
      text.append(name, kind);
      button.append(dot, text, throughput);
      button.addEventListener('click', () => {
        if (prefix === 'site-sheet-' && window.matchMedia('(max-width: 760px)').matches) setSheetExpanded(false);
        selectSite(properties.site_id);
      });
      item.append(button);
      list.append(item);
    });
  });
}

// ---------------------------------------------------------------- interaction

// Leaflet's popup auto-pan only knows the map viewport. When a mobile sheet is present it can
// undo the sheet-aware pan, so the application owns both adjustments.
function sheetReservedTop() {
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  if (!narrow || !style.sheet.collapsible) return null;
  const sheet = query('sheet');
  if (!sheet || getComputedStyle(sheet).display === 'none') return null;
  return sheet.getBoundingClientRect().top;
}

function openSitePopup(marker) {
  const popup = marker.getPopup();
  if (!popup) return;
  popup.options.autoPan = sheetReservedTop() === null ? style.popup.autoPan : false;
  popup.options.autoPanPadding = style.popup.autoPanPadding;
  popup.options.offset = style.popup.offset;
  popup.setContent(style.popup.render(marker.feature));
  marker.openPopup();
}

function revealAboveSheet(marker) {
  const reservedTop = sheetReservedTop();
  if (reservedTop === null || !marker) return null;
  const mapBox = map.getContainer().getBoundingClientRect();
  const boxes = [marker.getElement()?.getBoundingClientRect(),
    marker.getPopup()?.getElement()?.getBoundingClientRect()].filter(Boolean);
  if (!boxes.length) return null;

  // Fit the entire popup (including its tip) and marker within the unobstructed part of the map.
  // Pan the map, not the popup offset, to keep the tip anchored.
  const left = Math.min(...boxes.map(box => box.left));
  const right = Math.max(...boxes.map(box => box.right));
  const top = Math.min(...boxes.map(box => box.top));
  const bottom = Math.max(...boxes.map(box => box.bottom));
  const margin = 8;
  const safeLeft = mapBox.left + margin;
  const safeRight = mapBox.right - margin;
  const safeTop = mapBox.top + margin;
  const safeBottom = Math.min(reservedTop, mapBox.bottom) - margin;
  let x = left < safeLeft ? left - safeLeft : right > safeRight ? right - safeRight : 0;
  let y = bottom > safeBottom ? bottom - safeBottom : top < safeTop ? top - safeTop : 0;
  if (top - y < safeTop) y = top - safeTop;
  const awayFromZero = value => value > 0 ? Math.ceil(value) : Math.floor(value);
  x = awayFromZero(x);
  y = awayFromZero(y);
  if (x || y) map.panBy([x, y], { animate: false });
  return { x, y };
}

function selectSite(id) {
  selectedId = id;
  paintSites();
  siteLayers.forEach(marker => {
    if (marker.feature.site_id === id) openSitePopup(marker);
    else if (marker.getPopup()?.isOpen()) marker.closePopup();
  });
  document.querySelectorAll('.sites button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.site === id)));
  readout('selection-readout', id ?? '无');
  const marker = siteLayers.find(item => item.feature.site_id === id);
  if (marker && !map.getBounds().pad(-0.12).contains(marker.getLatLng())) map.panTo(marker.getLatLng(), { animate: false });
  revealAboveSheet(marker);
  paintLabels();
}

// ---------------------------------------------------------------- direction switching

function applyStyle(id) {
  style = loaded[id];
  activeId = id;
  const collapsed = document.body.classList.contains('sheet-collapsed');
  document.body.className = `theme-${id}${collapsed ? ' sheet-collapsed' : ''}`;
  document.title = `江岸片区配送地图 · ${style.label}`;
  query('variant-label').textContent = style.label;
  query('intent-text').textContent = style.intent;
  if (query('ready').dataset.state === 'ready') query('ready').textContent = `就绪 · ${style.label}`;
  Object.entries(style.ui ?? {}).forEach(([name, value]) => {
    document.body.style.setProperty(name, value);
  });
  document.querySelectorAll('.switcher button').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.style === id));
  });

  applyPanes();
  applyBasemap();
  applyRoute();
  // The radius carries the throughput, so it is recomputed when the direction changes.
  siteLayers.forEach(marker => {
    marker.baseRadius = style.site.radiusBy(marker.feature.throughput);
  });
  siteLayers.forEach(marker => {
    const popup = marker.getPopup();
    popup.options.className = style.popup.className || '';
    if (popup.isOpen()) popup.setContent(style.popup.render(marker.feature));
  });
  applyDistricts();
  paintSites();
  paintLabels();
  renderLegend();
  renderSites();
  renderLayerList();
  applyLayerState();
  const selectedMarker = siteLayers.find(marker => marker.feature.site_id === selectedId);
  if (selectedMarker?.getPopup()?.isOpen()) revealAboveSheet(selectedMarker);
  readout('attribution-readout', map.attributionControl.getContainer().textContent.trim().slice(0, 48));
  const url = new URL(location.href);
  url.searchParams.set('style', id);
  history.replaceState(null, '', url);
}

document.querySelectorAll('.switcher button').forEach(button => {
  button.addEventListener('click', () => applyStyle(button.dataset.style));
});

query('measure-select').addEventListener('change', event => {
  measure = event.target.value;
  paintDistricts();
  renderLegend();
});
let userChangedView = false;
map.getContainer().addEventListener('pointerdown', () => { userChangedView = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userChangedView = true; }, { passive: true });
query('zoom-overview').addEventListener('click', () => { userChangedView = true; map.setZoom(14, { animate: false }); });
query('zoom-street').addEventListener('click', () => { userChangedView = true; map.setZoom(16, { animate: false }); });
query('raster-toggle').addEventListener('change', event => {
  // The raster reference is a comparison aid, not part of any direction's design. Turning it
  // on overlays the original pixels under the vector basemap.
  const show = event.target.checked;
  if (show) {
    if (!map.hasLayer(basemapLayer)) basemapLayer.addTo(map);
    basemapLayer.setOpacity(0.55);
    basemapLayer.getContainer().style.filter = 'none';
  } else {
    basemapLayer.remove();
  }
});
function setSheetExpanded(expanded) {
  document.body.classList.toggle('sheet-collapsed', !expanded);
  query('sheet-toggle').setAttribute('aria-expanded', String(expanded));
  query('sheet-toggle').querySelector('.sheet-toggle-state').textContent = expanded ? '收起 −' : '展开 +';
}

query('sheet-toggle').addEventListener('click', () => {
  setSheetExpanded(document.body.classList.contains('sheet-collapsed'));
  const marker = siteLayers.find(item => item.feature.site_id === selectedId);
  if (marker?.getPopup()?.isOpen()) { marker.closePopup(); openSitePopup(marker); }
  revealAboveSheet(marker);
  paintLabels();
});
map.on('zoomend moveend', () => { paintLabels(); readout('zoom-readout', map.getZoom()); });
tally.listenersBound += 5;

const siteCount = data.sites.features.length;
const alertCount = data.sites.features.filter(feature => feature.properties.status === 'alert').length;
const districtCount = data.districts.features.length;
readout('metric-sites', siteCount);
readout('metric-districts', districtCount);
readout('panel-sites', siteCount);
readout('panel-alerts', alertCount);
readout('panel-districts', districtCount);
const compactViewport = window.matchMedia('(max-width: 760px)');
setSheetExpanded(!compactViewport.matches);
map.on('resize', () => {
  if (!userChangedView && !selectedId) map.fitBounds(BOUNDS, { padding: [32, 32], animate: false });
});
compactViewport.addEventListener('change', event => {
  setSheetExpanded(!event.matches);
  requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    if (!userChangedView && !selectedId) map.fitBounds(BOUNDS, { padding: [32, 32], animate: false });
    else revealAboveSheet(siteLayers.find(marker => marker.feature.site_id === selectedId));
  });
});
applyStyle(activeId);
readout('zoom-readout', map.getZoom());

// The verification surface. It exposes geometry, not opinions.
window.__demo = {
  get style() { return activeId; },
  styles: STYLE_ORDER,
  map,
  basemapLayer,
  vectorBasemap,
  dataSha,
  tally,
  mean,
  counts: { sites: siteLayers.length, districts: districtLayers.length, labels: labelLayers.length,
    routePoints: routePoints.length, context: data.context.features.length,
    ...vectorBasemap.counts },
  layerState: () => ({ ...layerState }),
  visiblePlaceLabels: () => vectorBasemap.placeLayers
    .filter(marker => {
      const span = marker.getElement()?.querySelector('span');
      return map.hasLayer(marker) && span && span.style.display !== 'none' && span.style.visibility !== 'hidden';
    })
    .map(marker => marker.name),
  basemapColors: () => {
    const block = vectorBasemap.blockLayers[0];
    const water = vectorBasemap.waterLayers[0];
    const arterial = vectorBasemap.arterials[0];
    const local = vectorBasemap.locals[0];
    return {
      ground: map.getContainer().style.background,
      block: block?.options.fillColor ?? null,
      water: water?.options.fillColor ?? null,
      arterialCasing: arterial?.casing.options.color ?? null,
      arterialCore: arterial?.core.options.color ?? null,
      localCore: local?.core.options.color ?? null,
    };
  },
  selected: () => selectedId,
  measure: () => measure,
  metersPerPixel,
  labelBoxes: () => [...labelLayers, ...vectorBasemap.placeLayers].filter(marker => map.hasLayer(marker)).map(marker => {
    const span = marker.getElement()?.querySelector('span');
    if (!span || span.style.display === 'none' || span.style.visibility === 'hidden') return null;
    const rect = span.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, text: span.textContent,
      tier: marker.properties.tier, siteId: marker.properties.site_id ?? null };
  }).filter(Boolean),
  sheetBox: () => document.querySelector('[data-testid="sheet"]')?.getBoundingClientRect() ?? null,
  popupBox: () => document.querySelector('.leaflet-popup-content')?.getBoundingClientRect() ?? null,
  popupFrameBox: () => document.querySelector('.leaflet-popup')?.getBoundingClientRect() ?? null,
  closeButtonBox: () => document.querySelector('.leaflet-popup-close-button')?.getBoundingClientRect() ?? null,
  tipBox: () => document.querySelector('.leaflet-popup-tip-container')?.getBoundingClientRect() ?? null,
  mapBox: () => map.getContainer().getBoundingClientRect(),
  markerBox: id => siteLayers.find(item => item.feature.site_id === id)?.getElement()?.getBoundingClientRect() ?? null,
  legendColors: () => [...document.querySelectorAll('[data-testid="legend"] li')].map(item => ({
    text: item.textContent.trim(), color: getComputedStyle(item.querySelector('i')).backgroundColor,
    bound: item.dataset.color || null,
  })),
  siteStyleAt: id => {
    const marker = siteLayers.find(item => item.feature.site_id === id);
    return marker ? { fill: marker.options.fillColor, stroke: marker.options.color,
      weight: marker.options.weight, radius: marker.options.radius } : null;
  },
  districtStyleAt: id => districtLayers.find(layer => layer.feature.district_id === id)?.options ?? null,
  renderedData: () => ({
    sites: siteLayers.map(marker => ({ properties: marker.feature, coordinates: [marker.getLatLng().lng, marker.getLatLng().lat] })),
    districts: districtLayers.map(layer => ({ properties: layer.feature, coordinates: layer.getLatLngs()[0].map(point => [point.lng, point.lat]) })),
    route: routeLine.getLatLngs().map(point => [point.lng, point.lat]),
  }),
  select: id => selectSite(id),
};
query('ready').dataset.state = 'ready';
query('ready').textContent = `就绪 · ${style.label}`;
