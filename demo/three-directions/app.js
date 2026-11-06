// Three-directions demo.
//
// The layers are built once and the styles are applied on top, so switching direction never
// rebuilds the map: no listener, source or DOM node is accumulated by a switch. The data is
// the same file the case uses, read byte for byte; only the presentation differs.
//
// The mobile popup geometry is the logic the case already proved: the application owns the
// sheet-aware pan, because Leaflet's auto-pan only knows the map viewport.
const params = new URLSearchParams(location.search);

const STYLE_LOADERS = {
  'light-operations': () => import('./styles/light-operations.js'),
  'warm-city-guide': () => import('./styles/warm-city-guide.js'),
  'dark-monitoring': () => import('./styles/dark-monitoring.js'),
};
const STYLE_ORDER = ['light-operations', 'warm-city-guide', 'dark-monitoring'];

const loaded = Object.fromEntries(await Promise.all(
  STYLE_ORDER.map(async id => [id, await STYLE_LOADERS[id]()])));

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
  const response = await fetch(`./data/${name}.geojson`);
  const text = await response.text();
  dataSha[`${name}.geojson`] = await digest(text);
  return [name, JSON.parse(text)];
})));

const map = L.map('map', { attributionControl: true, minZoom: 13, maxZoom: 17 })
  .fitBounds(BOUNDS, { padding: [24, 24] });

// The tile layer is kept as a reference raster, so the vector basemap below can be compared
// against the pixels it replaces. It is off by default: the raster cannot be recoloured per
// feature, which is exactly the limitation this round set out to remove.
const basemapLayer = L.tileLayer('./tiles/{z}/{x}/{y}.png', {
  // 15 is the deepest zoom the generator produces; above it Leaflet overzooms these tiles
  // instead of asking for files that do not exist.
  bounds: BOUNDS, minZoom: 13, maxZoom: 17, minNativeZoom: 14, maxNativeZoom: 15,
  opacity: 1,
  attribution: '合成栅格底图（本地生成，非真实地点）',
});
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.setPosition('topright');

// The data source is named on the map itself, not on the tile layer. The raster is
// only a comparison aid and is not shown by default, so an attribution that lived
// on that layer would never be seen — the map would carry the engine's name and
// nothing else.
const attribution = L.control.attribution({ position: 'bottomright', prefix: false })
  .addTo(map);
attribution.addAttribution('合成数据 · 非真实地点 · 底图取自 cases/leaflet-raster/data');

const { createVectorBasemap, applyVectorBasemap } = await import('./vector-basemap.js');
const vectorBasemap = createVectorBasemap(map, data.context, data.labels);

// Panes are created once; a direction only changes their z-index. The vector basemap gets
// panes of its own, created with it, so the street grid sits under the business layers.
//
// The basemap pane order is structural rather than stylistic: it fixes the order in which the
// ground, the street grid and the place names are read. The three directions differ in the
// colours of those layers, not in their order.
const PANE_NAMES = ['districts', 'boundary', 'casing', 'route', 'glow', 'sites', 'labels', 'selection'];
const paneOf = name => (style.panes[name] ? name : 'overlayPane');
// A Leaflet layer binds to its pane when it is created, so the panes must exist
// before the first polygon. Creating them after the layers left every business
// layer in overlayPane and made pane-based checks (including the skill's
// opaque-fill rule) inspect an empty pane.
ensurePanes();

const values = data.districts.features.map(feature => feature.properties.value).filter(value => value !== null);
const mean = values.reduce((total, value) => total + value, 0) / values.length;
// Class breaks are fixed per direction and stated in the legend, so a restyle cannot move a
// district between classes. They are not recomputed from the data at runtime.
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

// The fill and its boundary are two layers, not one polygon with a stroke. The
// boundary lives in its own pane above the fill, so a neighbouring fill can
// never muddy the outline (anti-patterns 3.1).
const districtLayers = data.districts.features.map(feature => {
  const layer = L.polygon(feature.geometry.coordinates[0].map(toLatLng), {
    pane: paneOf('districts'), stroke: false, weight: 0,
  });
  layer.feature = feature.properties;
  tally.layersAdded += 1;
  return layer.addTo(map);
});
const districtBoundaries = data.districts.features.map(feature => {
  const layer = L.polyline(feature.geometry.coordinates[0].map(toLatLng), {
    pane: paneOf('boundary'), interactive: false, fill: false, lineJoin: 'round',
  });
  layer.feature = feature.properties;
  tally.layersAdded += 1;
  return layer.addTo(map);
});

// Hover is a state, not a restyle: the class colour and the class breaks stay put.
// Inline style is used rather than setStyle, because Leaflet's setStyle writes SVG
// presentation attributes, which CSS cannot transition. 140ms in / 200ms out are
// the motion tokens from references/interaction.md.
function setDistrictHover(index, active) {
  const fill = districtLayers[index].getElement();
  const line = districtBoundaries[index].getElement();
  const duration = active ? '140ms' : '200ms';
  if (fill) {
    fill.style.transition = `fill-opacity ${duration} ease`;
    fill.style.fillOpacity = active ? '0.65' : '';
  }
  if (line) {
    line.style.transition = `stroke-width ${duration} ease, stroke ${duration} ease`;
    line.style.strokeWidth = active ? '2.5' : '';
    line.style.stroke = active ? 'var(--accent, #ffffff)' : '';
  }
}
districtLayers.forEach((layer, index) => {
  layer.on('mouseover', () => setDistrictHover(index, true));
  layer.on('mouseout', () => setDistrictHover(index, false));
});

const routePoints = data.route.features[0].geometry.coordinates.map(toLatLng);
const casing = L.polyline(routePoints, { pane: paneOf('casing'), lineCap: 'round' }).addTo(map);
const routeLine = L.polyline(routePoints, { pane: paneOf('route'), lineCap: 'round' }).addTo(map);
tally.layersAdded += 2;

// Rank of each station by throughput, so a direction can keep the names that matter first.
const stationRank = new Map();
data.sites.features
  .slice()
  .sort((a, b) => b.properties.throughput - a.properties.throughput)
  .forEach((feature, index) => stationRank.set(feature.properties.site_id, index));

const halo = L.circleMarker([0, 0], { pane: paneOf('selection'), interactive: false, fill: false });

// Every label on the map, in one ordered system: the basemap names and the station names are
// placed together, so a place name and a station name no longer compete for the same space.
//
// The panes are created before the annotations, because a Leaflet marker binds to its pane
// when it is created; a marker created before its pane exists falls back to another one.
const { createAnnotations, applyAnnotationPolicy, placeAnnotations, attachMap } =
  await import('./annotations.js');
const { createHud } = await import('./hud.js');
const hud = createHud();
ensurePanes();
const annotationEngine = attachMap(
  createAnnotations(map, data, stationRank), map);
let lastAnnotationOutcome = { placed: [], dropped: [] };

const siteLayers = data.sites.features.map(feature => {
  const properties = feature.properties;
  const marker = L.circleMarker(toLatLng(feature.geometry.coordinates), {
    pane: paneOf('sites'), radius: 5, interactive: true,
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

// Two layers per point (anti-patterns 3.2): a soft glow that gives the site a
// presence on a busy ground, and a crisp core whose radius carries throughput.
// The glow is decorative and never takes a click.
const siteGlows = data.sites.features.map(feature => {
  const glow = L.circleMarker(toLatLng(feature.geometry.coordinates), {
    pane: paneOf('glow'), radius: 12, interactive: false, stroke: false,
    fillOpacity: 0.2,
  });
  glow.feature = feature.properties;
  tally.layersAdded += 1;
  return glow.addTo(map);
});

// ---------------------------------------------------------------- styling

// The panes the business layers use. They are created once, before anything is drawn into
// them, because a Leaflet layer binds to its pane at creation time.
function ensurePanes() {
  PANE_NAMES.forEach(name => {
    const target = style.panes[name];
    if (target === null || target === undefined) return;
    let pane = map.getPane(name);
    if (!pane) {
      pane = map.createPane(name);
    }
    pane.style.zIndex = target;
    // The boundary and glow layers are decorative: they must never swallow a
    // click meant for the polygon or the site underneath them.
    pane.style.pointerEvents = ['labels', 'boundary', 'glow'].includes(name) ? 'none' : '';
  });
}

function applyPanes() {
  ensurePanes();
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
  applyVectorBasemap(vectorBasemap, style);
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
  const boundary = style.districts.boundary ?? {};
  districtLayers.forEach((layer, index) => {
    const classIndex = pick(layer.feature.value);
    const missing = classIndex === -1;
    const fill = missing ? style.districts.missing.fillColor
      : ramp[Math.min(classIndex, ramp.length - 1)];
    layer.setStyle({
      fillColor: fill,
      fillOpacity: missing ? style.districts.missing.fillOpacity : style.districts.fillOpacity,
      stroke: false, weight: 0,
    });
    if (missing) applyMissingPattern(layer);
    // The outline is a separate line layer above the fill. The theme supplies a
    // tuned boundary colour; where it is absent, the fill is lightened 25%.
    districtBoundaries[index].setStyle({
      color: boundary.color || lighten(fill, 0.25),
      weight: boundary.weight ?? 1.2,
      opacity: boundary.opacity ?? 0.9,
      dashArray: boundary.dashArray || null,
    });
  });
  tally.restyles += 1;
}

// Mix a hex colour toward white. Used only as the fallback boundary tone; every
// shipped direction states its own boundary colour in the style object.
function lighten(hex, amount) {
  const value = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const channels = [0, 2, 4].map(offset => {
    const channel = parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * amount)
      .toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
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
  pattern.setAttribute('width', '10'); pattern.setAttribute('height', '10');
  const background = document.createElementNS(namespace, 'rect');
  background.setAttribute('width', '10'); background.setAttribute('height', '10');
  background.setAttribute('fill', style.districts.missing.fillColor);
  const hatch = document.createElementNS(namespace, 'path');
  hatch.setAttribute('d', patternKind === 'cross-hatch'
    ? 'M0 0L10 10M0 10L10 0' : 'M-2 2L2-2M0 10L10 0M8 12L12 8');
  hatch.setAttribute('stroke', style.districts.missing.hatchColor
    || style.annotations?.classes?.street?.color || '#888');
  hatch.setAttribute('stroke-width', '1');
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
    fillOpacity: style.site.fillOpacity ?? 0.95,
    color: stroke, weight: weight || 1, radius,
  });
  // The glow follows the core's colour and radius but stays translucent and
  // larger (10-16px). It never changes the value the core encodes.
  const glow = siteGlows.find(item => item.feature.site_id === properties.site_id);
  if (glow) glow.setStyle({
    fillColor: classColor,
    fillOpacity: style.site.glowOpacity ?? 0.2,
    radius: Math.max(10, Math.min(16, radius + 7)),
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

// The annotation engine owns every label on the map: the basemap names and the station names
// are one ordered set, not two layers that compete for the same space.
function paintLabels() {
  const resolution = metersPerPixel();
  const narrow = map.getContainer().getBoundingClientRect().width < 560;
  // The markers are obstacles for the labels: a place name must not land on top of a site.
  //
  // The obstacle is the marker's visual circle, not its DOM box. A Leaflet circleMarker
  // element is a square that is much larger than the dot it draws, so using the box would
  // push every place name away from stations that are nowhere near it.
  const markerBoxes = siteLayers.map(marker => {
    const rect = marker.getElement()?.getBoundingClientRect();
    if (!rect) return null;
    const centreX = (rect.left + rect.right) / 2;
    const centreY = (rect.top + rect.bottom) / 2;
    // The circle is drawn in SVG pixels; the DOM box may be scaled by the device pixel ratio,
    // so the radius is taken from the element's own width rather than from the drawn radius.
    const radius = Math.max(6, rect.width * 0.22);
    return { left: centreX - radius, right: centreX + radius,
      top: centreY - radius, bottom: centreY + radius,
      centreX, centreY, radius, siteId: marker.feature.site_id };
  }).filter(Boolean);
  const context = { metersPerPixel: resolution, narrow, selectedId, siteRank: stationRank,
    markerBoxes };

  applyAnnotationPolicy(annotationEngine, style.annotations, context);
  const outcome = placeAnnotations(annotationEngine, style.annotations, context);

  const visible = annotationEngine.annotations.filter(annotation => map.hasLayer(annotation));
  readout('label-readout', visible.length);
  lastAnnotationOutcome = {
    placed: visible.map(annotation => ({
      text: annotation.annotation.element.textContent,
      cls: annotation.annotation.cls,
    })),
    dropped: outcome.dropped,
  };
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
  const context = legendContext();
  hud.update(style, style.legend.entries(measure, context), context, measure);
}

// The layer switcher follows webgis-history's layer panel: each group is named for what it
// shows, and the state is applied to the real Leaflet objects, so a hidden layer is really
// removed from the map rather than only faded.
// The layer switches. The annotations are switched by class rather than by kind, because the
// annotation system is one ordered set: asking for "the place names" while the station names
// are on would break the priority order the direction states.
const LAYER_GROUPS = [
  { id: 'blocks', name: '街区面', kind: 'basemap' },
  { id: 'water', name: '水系', kind: 'basemap' },
  { id: 'roads', name: '道路', kind: 'basemap' },
  { id: 'anno-area', name: '片区注记', kind: 'annotation', cls: 'area' },
  { id: 'anno-water', name: '水系注记', kind: 'annotation', cls: 'water' },
  { id: 'anno-street', name: '街巷注记', kind: 'annotation', cls: 'street' },
  { id: 'anno-site', name: '站点注记', kind: 'annotation', cls: 'site' },
  { id: 'districts', name: '片区色带', kind: 'business' },
  { id: 'route', name: '主配送线', kind: 'business' },
  { id: 'sites', name: '站点', kind: 'business' },
];

const layerState = Object.fromEntries(LAYER_GROUPS.map(group => [group.id, true]));

function basemapGroupVisible(id) {
  if (id === 'blocks') return vectorBasemap.blockLayers.some(layer => map.hasLayer(layer));
  if (id === 'water') return vectorBasemap.waterLayers.some(layer => map.hasLayer(layer));
  if (id === 'roads') return vectorBasemap.arterials.some(entry => map.hasLayer(entry.casing));
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
}

// The annotation classes are switched on the engine. A class that is switched off is removed
// from the map, and switching it back on re-runs the whole placement, because the order in
// which the labels compete for space depends on which classes are present.
function setAnnotationClassVisible(cls, visible) {
  annotationEngine.annotations
    .filter(annotation => annotation.annotation.cls === cls)
    .forEach(annotation => {
      if (visible) annotation.addTo(map);
      else annotation.remove();
    });
}

function setBusinessGroupVisible(id, visible) {
  if (id === 'districts') {
    districtLayers.forEach(layer => (visible ? layer.addTo(map) : layer.remove()));
    districtBoundaries.forEach(layer => (visible ? layer.addTo(map) : layer.remove()));
  }
  if (id === 'route') {
    (visible ? routeLine.addTo(map) : routeLine.remove());
    if (visible && style.route.casingWeight > 0 && style.route.casingColor) casing.addTo(map);
    else casing.remove();
  }
  if (id === 'sites') {
    siteLayers.forEach(marker => (visible ? marker.addTo(map) : marker.remove()));
    siteGlows.forEach(glow => (visible ? glow.addTo(map) : glow.remove()));
    if (!visible) halo.remove();
  }
}

function applyLayerState() {
  LAYER_GROUPS.forEach(group => {
    const visible = layerState[group.id];
    if (group.kind === 'basemap') setBasemapGroupVisible(group.id, visible);
    else if (group.kind === 'annotation') setAnnotationClassVisible(group.cls, visible);
    else setBusinessGroupVisible(group.id, visible);
  });
  // The placement is recomputed after the switches, because removing one class frees space
  // that another class may now take.
  paintLabels();
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
      button.addEventListener('click', () => selectSite(properties.site_id));
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
  syncHudWithPopup();
}

// Leaflet's mapPane is a transformed stacking context, so a popup can never be
// layered above a sibling HUD. Instead of clipping the detail card, the HUD
// yields: if the open popup intersects the legend, the legend folds to its
// header and unfolds again once the popup goes away.
let hudYielded = false;
function syncHudWithPopup() {
  requestAnimationFrame(() => {
    const popup = document.querySelector('.leaflet-popup');
    const legend = document.querySelector('.hud-legend');
    if (!popup || !legend) { restoreHud(); return; }
    const p = popup.getBoundingClientRect();
    const l = legend.getBoundingClientRect();
    const overlaps = Math.min(p.right, l.right) > Math.max(p.left, l.left)
      && Math.min(p.bottom, l.bottom) > Math.max(p.top, l.top);
    if (overlaps && !hud.isCollapsed()) {
      hud.setCollapsed(true);
      hudYielded = true;
    } else if (!overlaps && hudYielded) {
      restoreHud();
    }
  });
}
function restoreHud() {
  if (!hudYielded) return;
  hud.setCollapsed(hud.defaultCollapsed());
  hudYielded = false;
}
map.on('popupclose', restoreHud);
window.addEventListener('resize', () => { if (hudYielded) syncHudWithPopup(); });

// ---------------------------------------------------------------- direction switching

function applyStyle(id) {
  style = loaded[id];
  activeId = id;
  document.body.className = `theme-${id}`;
  document.title = `江岸片区配送地图 · ${style.label}`;
  query('variant-label').textContent = style.label;
  query('intent-text').textContent = style.intent;
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
// A camera tour is a transition, not a jump. Leaflet's flyTo takes seconds,
// Mapbox/MapLibre take milliseconds — the unit belongs to the SDK. `essential`
// does not exist in Leaflet, so reduced motion is handled by shortening the
// duration here. The instant pans inside selectSite/revealAboveSheet are
// boundary corrections, which the guidance explicitly allows to be instant.
function cameraSeconds() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1.6;
}
function flyToZoom(zoom) {
  map.flyTo(map.getCenter(), zoom, { duration: cameraSeconds() });
}
query('zoom-overview').addEventListener('click', () => flyToZoom(14));
query('zoom-street').addEventListener('click', () => flyToZoom(16));
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
query('sheet-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sheet-collapsed');
  query('sheet-toggle').setAttribute('aria-expanded', String(!document.body.classList.contains('sheet-collapsed')));
  const marker = siteLayers.find(item => item.feature.site_id === selectedId);
  if (marker?.getPopup()?.isOpen()) { marker.closePopup(); openSitePopup(marker); }
  revealAboveSheet(marker);
  paintLabels();
});
map.on('zoomend moveend', () => { paintLabels(); readout('zoom-readout', map.getZoom()); });
tally.listenersBound += 5;

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
  counts: { sites: siteLayers.length, districts: districtLayers.length,
    boundaries: districtBoundaries.length, glows: siteGlows.length,
    annotations: annotationEngine.annotations.length,
    routePoints: routePoints.length, context: data.context.features.length,
    ...vectorBasemap.counts },
  layerState: () => ({ ...layerState }),
  visibleAnnotations: () => annotationEngine.annotations
    .filter(annotation => map.hasLayer(annotation))
    .map(annotation => ({
      cls: annotation.annotation.cls,
      text: annotation.annotation.element.textContent,
    })),
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
  labelBoxes: () => annotationEngine.annotations
    .filter(annotation => map.hasLayer(annotation))
    .map(annotation => {
      const rect = annotation.annotation.element.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        cls: annotation.annotation.cls, siteId: annotation.annotation.siteId ?? null,
        text: annotation.annotation.element.textContent } : null;
    }).filter(Boolean),
  annotationOutcome: () => lastAnnotationOutcome,
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

// Optional deep link: ?site=S01 selects a station on load, so an automated
// checker can exercise the popup geometry rules without scripting a click.
// Unknown ids are ignored rather than reported as a page error.
const initialSite = params.get('site');
if (initialSite && siteLayers.some(marker => marker.feature.site_id === initialSite)) {
  selectSite(initialSite);
}
