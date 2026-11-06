// Case app. The wiring is shared by every variant so that the only difference between
// "before" and "after" is the styling module, which is what the committed patch shows.
const params = new URLSearchParams(location.search);
const requested = params.get('variant') || 'baseline';

function withBasemapOverride(style, override) {
  return { ...style, basemap: { ...style.basemap, ...override } };
}

const modules = {
  baseline: () => import('./style-baseline.js'),
  improved: () => import('./style-improved.js'),
  // Exploratory raster-only variants. They affect the whole basemap rather than
  // individual roads; application-owned business layers are outside the filter.
  'attempt-filter': async () => withBasemapOverride(await import('./style-improved.js'),
      { opacity: 1, className: 'basemap-desaturate' }),
  'attempt-opacity': async () => withBasemapOverride(await import('./style-improved.js'),
      { opacity: 0.45, className: undefined }),
};

if (!modules[requested]) throw new Error(`unknown variant ${requested}`);
const style = await modules[requested]();

const query = name => document.querySelector(`[data-testid="${name}"]`);
const readout = (name, value) => { query(name).textContent = String(value); };

document.body.classList.add(`variant-${requested}`);
query('variant-label').textContent = style.label;

const AREA = { lon: [121.43, 121.447], lat: [31.22, 31.233] };
const BOUNDS = L.latLngBounds([AREA.lat[0], AREA.lon[0]], [AREA.lat[1], AREA.lon[1]]);
const toLatLng = coordinates => L.latLng(coordinates[1], coordinates[0]);

const LAYER_FILES = ['context', 'sites', 'route', 'districts', 'labels'];
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

// Hashes prove which input bytes were read, not that in-memory data was left intact.
// The verifier separately compares rendered feature geometry and properties.
const dataSha = {};
const data = Object.fromEntries(await Promise.all(LAYER_FILES.map(async name => {
  const response = await fetch(`/cases/leaflet-raster/data/${name}.geojson`);
  const text = await response.text();
  dataSha[`${name}.geojson`] = await digest(text);
  return [name, JSON.parse(text)];
})));

const map = L.map('map', { attributionControl: true, minZoom: 13, maxZoom: 17 })
  .fitBounds(BOUNDS, { padding: [24, 24] });
const basemapLayer = L.tileLayer('/cases/leaflet-raster/tiles/{z}/{x}/{y}.png', {
  // 15 is the deepest zoom the generator produces; above it Leaflet overzooms
  // these tiles instead of asking for files that do not exist.
  bounds: BOUNDS, minZoom: 13, maxZoom: 17, minNativeZoom: 14, maxNativeZoom: 15,
  opacity: style.basemap.opacity, className: style.basemap.className,
  attribution: '合成栅格底图（本地生成，非真实地点）',
}).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.setPosition('topright');

Object.entries(style.panes).forEach(([name, zIndex]) => {
  if (zIndex === null) return;
  const pane = map.createPane(name);
  pane.style.zIndex = zIndex;
  if (name === 'labels') pane.style.pointerEvents = 'none';
});
// Leaflet's getPane() returns undefined for an absent pane name, which breaks marker
// icon insertion, so "no custom pane" has to name the default one rather than omit it.
const paneOf = name => (style.panes[name] ? name : 'overlayPane');

// Class breaks are computed once from the data and stated in the legend, so a restyle
// cannot move a district between classes.
const values = data.districts.features.map(feature => feature.properties.value).filter(value => value !== null);
const mean = values.reduce((total, value) => total + value, 0) / values.length;
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
const tally = { layersAdded: 0, listenersBound: 0, restyles: 0, popupsBound: 0 };

const districtLayers = data.districts.features.map(feature => {
  const layer = L.polygon(feature.geometry.coordinates[0].map(toLatLng), { pane: paneOf('districts') });
  layer.feature = feature.properties;
  tally.layersAdded += 1;
  return layer.addTo(map);
});

const routePoints = data.route.features[0].geometry.coordinates.map(toLatLng);
const casing = style.route.casingWeight > 0
  ? L.polyline(routePoints, { pane: paneOf('casing'), color: style.route.casingColor,
                              weight: style.route.casingWeight, opacity: 1, lineCap: 'round' }).addTo(map)
  : null;
if (casing) tally.layersAdded += 1;
const routeLine = L.polyline(routePoints, { pane: paneOf('route'), color: style.route.color,
                                           weight: style.route.weight, opacity: style.route.opacity,
                                           lineCap: 'round' }).addTo(map);
tally.layersAdded += 1;

const labelLayers = data.labels.features.map(feature => {
  const name = feature.properties.name;
  const shown = style.labels.shorten(name);
  const span = document.createElement('span');
  span.textContent = shown;
  span.title = name;
  const width = Math.max(60, Math.ceil(shown.length * style.labels.sizePx * 1.05));
  const height = style.labels.sizePx + 8;
  // A label for a point must sit above the point. Anchoring the box at the point puts
  // the glyphs on top of the symbol they name, which is the defect this fixes.
  const anchor = feature.properties.site_id ? [width / 2, height + 2] : [width / 2, height / 2];
  const marker = L.marker(toLatLng(feature.geometry.coordinates), {
    pane: paneOf('labels'), interactive: false, keyboard: false,
    icon: L.divIcon({ className: `map-label${feature.properties.tier === 0 ? ' tier-0' : ''}`,
                     html: span, iconSize: [width, height], iconAnchor: anchor }),
  });
  marker.properties = feature.properties;
  tally.layersAdded += 1;
  return marker;
});

const halo = L.circleMarker([0, 0], { pane: paneOf('selection'), interactive: false, fill: false });

const siteLayers = data.sites.features.map(feature => {
  const properties = feature.properties;
  const radius = typeof style.site.radiusBy === 'function'
    ? style.site.radiusBy(properties.throughput) : style.site.radius;
  const marker = L.circleMarker(toLatLng(feature.geometry.coordinates), {
    pane: paneOf('sites'), radius, interactive: true,
  });
  marker.feature = properties;
  marker.baseRadius = radius;
  tally.layersAdded += 1;
  // Bound once, at creation. Re-binding on every selection is how popups and listeners
  // accumulate in a real application.
  marker.bindPopup(() => popupContent(marker.feature), {
    autoPan: style.popup.autoPan, autoPanPadding: style.popup.autoPanPadding,
    offset: style.popup.offset, className: style.popup.className, closeButton: true,
  });
  tally.popupsBound += 1;
  marker.on('click', () => selectSite(properties.site_id));
  marker.on('mouseover', () => { if (selectedId !== properties.site_id && style.site.hover) marker.setStyle(style.site.hover); });
  marker.on('mouseout', () => paintSite(marker));
  tally.listenersBound += 3;
  return marker.addTo(map);
});

function popupContent(properties) {
  const element = document.createElement('div');
  element.className = 'site-popup-body';
  const title = document.createElement('strong');
  title.textContent = properties.name;
  const meta = document.createElement('p');
  meta.textContent = `${properties.class_name} · ${properties.status === 'alert' ? '异常' : '正常'} · ${properties.throughput} 件`;
  const id = document.createElement('small');
  id.textContent = `站点编号 ${properties.site_id}`;
  element.append(title, meta, id);
  return element;
}

function paintDistricts() {
  const ramp = measure === 'deviation' ? style.districts.deviation.ramp : style.districts.ramp;
  const pick = measure === 'deviation' ? deviationClassOf : classOf;
  districtLayers.forEach(layer => {
    const index = pick(layer.feature.value);
    if (index === -1) {
      layer.setStyle({
        fillColor: style.districts.missing.fillColor, fillOpacity: style.districts.missing.fillOpacity,
        color: style.districts.boundary.color ?? style.districts.missing.fillColor,
        weight: style.districts.boundary.weight || 1,
        dashArray: null,
      });
      applyMissingPattern(layer);
      return;
    }
    layer.setStyle({
      fillColor: ramp[Math.min(index, ramp.length - 1)], fillOpacity: style.districts.fillOpacity,
      color: style.districts.boundary.color ?? ramp[Math.min(index, ramp.length - 1)],
      weight: style.districts.boundary.weight || 0, dashArray: null,
    });
  });
  tally.restyles += 1;
}

function applyMissingPattern(layer) {
  const patternKind = style.districts.missing.pattern;
  const path = layer.getElement();
  if (!path || !patternKind || patternKind === 'none') return;
  const svg = path.ownerSVGElement;
  const namespace = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(namespace, 'defs');
    svg.prepend(defs);
  }
  const id = 'case-missing-hatch';
  if (!defs.querySelector(`#${id}`)) {
    const pattern = document.createElementNS(namespace, 'pattern');
    pattern.id = id;
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8'); pattern.setAttribute('height', '8');
    const background = document.createElementNS(namespace, 'rect');
    background.setAttribute('width', '8'); background.setAttribute('height', '8');
    background.setAttribute('fill', style.districts.missing.fillColor);
    const hatch = document.createElementNS(namespace, 'path');
    hatch.setAttribute('d', patternKind === 'cross-hatch'
      ? 'M0 0L8 8M0 8L8 0' : 'M-2 2L2-2M0 8L8 0M6 10L10 6');
    hatch.setAttribute('stroke', style.labels.color);
    hatch.setAttribute('stroke-width', '1');
    pattern.append(background, hatch); defs.append(pattern);
  }
  path.setAttribute('fill', `url(#${id})`);
}

function paintSite(marker) {
  const properties = marker.feature;
  const isSelected = properties.site_id === selectedId;
  const classColor = style.site.fillBy({ properties });
  const alert = properties.status === 'alert';
  const ring = style.site.statusRing;
  const stroke = isSelected ? style.site.selected.strokeColor
    : alert && ring ? ring.alert : style.site.strokeColor ?? classColor;
  const weight = isSelected ? style.site.selected.strokeWidth
    : alert && ring ? ring.alertWeight : style.site.strokeWidth || 0;
  const radius = marker.baseRadius + (isSelected ? style.site.selected.radiusStep || 0 : 0);
  marker.setStyle({ fillColor: isSelected && style.site.selected.fillColor ? style.site.selected.fillColor : classColor,
                    fillOpacity: 1, color: stroke, weight, radius });
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
  const candidates = labelLayers.filter(marker => marker.properties.site_id === selectedId
    || style.labels.visible(marker.properties, resolution));
  candidates.forEach(marker => { if (!map.hasLayer(marker)) marker.addTo(map); });
  labelLayers.filter(marker => !candidates.includes(marker)).forEach(marker => marker.remove());
  if (style.labels.declutter) declutter(candidates);
  const visible = labelLayers.filter(marker => map.hasLayer(marker));
  visible.forEach(marker => styleLabel(marker));
  readout('label-readout', visible.length);
}

// Leaflet has no label collision engine, so this is an application-side approximation:
// a greedy pass in a stated priority order, recomputed on every view change. It costs
// O(n²) per frame, which is fine for 24 labels and wrong for thousands; the honest
// alternatives are a collision plugin or provider-side placement.
function declutter(candidates) {
  const rank = marker => {
    const properties = marker.properties;
    if (properties.site_id === selectedId) return -1;
    return properties.tier === 0 ? 0 : properties.site_id ? 1 : 2 + properties.tier;
  };
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b)
    || (a.properties.name > b.properties.name ? 1 : -1));
  const placed = [];
  ordered.forEach(marker => {
    const rect = marker.getElement()?.getBoundingClientRect();
    if (!rect) return;
    const box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    const collides = placed.some(other => Math.min(box.right, other.right) - Math.max(box.left, other.left) > 2
      && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 2);
    if (collides) marker.remove();
    else placed.push(box);
  });
}

function styleLabel(marker) {
  const element = marker.getElement()?.querySelector('span');
  if (!element) return;
  element.style.fontSize = `${style.labels.sizePx}px`;
  element.style.color = style.labels.color;
  element.style.fontWeight = String(style.labels.weight);
  element.style.letterSpacing = style.labels.letterSpacing;
  const width = style.labels.haloWidthPx;
  element.style.textShadow = width > 0
    ? [[0, width], [0, -width], [width, 0], [-width, 0]]
        .map(([x, y]) => `${x}px ${y}px 0 ${style.labels.haloColor}`).join(', ')
    : 'none';
}

function renderLegend() {
  const list = query('legend');
  list.replaceChildren();
  style.legend.entries(measure).forEach(entry => {
    const item = document.createElement('li');
    const swatch = document.createElement('i');
    if (entry.className) item.className = entry.className;
    swatch.classList.add(`swatch-${entry.kind}`);
    if (entry.color && entry.kind !== 'ring') swatch.style.background = entry.color;
    if (entry.kind === 'missing') swatch.classList.add('missing-swatch');
    if (entry.kind === 'ring') swatch.style.border = `3px solid ${entry.color}`;
    if (entry.kind === 'line' && entry.casing) swatch.style.boxShadow = `0 0 0 1px ${entry.casing}`;
    item.append(swatch, document.createTextNode(entry.text));
    item.dataset.color = entry.color ?? '';
    list.append(item);
  });
}

function renderSites() {
  // Two lists, two id prefixes: duplicate test ids would let a check pass while the
  // element it names is ambiguous.
  const lists = [[query('site-list'), 'site-'], [query('site-list-sheet'), 'site-sheet-']];
  lists.forEach(([list, prefix]) => {
    list.replaceChildren();
    data.sites.features.forEach(feature => {
      const properties = feature.properties;
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.site = properties.site_id;
      button.dataset.testid = `${prefix}${properties.site_id}`;
      button.setAttribute('aria-pressed', String(properties.site_id === selectedId));
      const name = document.createElement('strong');
      name.textContent = properties.name;
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = `${properties.class_name} · ${properties.throughput} 件`;
      button.append(name, kind);
      button.addEventListener('click', () => selectSite(properties.site_id));
      tally.listenersBound += 1;
      item.append(button);
      list.append(item);
    });
  });
}

// Leaflet's popup auto-pan only knows the map viewport. When a mobile sheet is
// present it can undo our sheet-aware pan, so the application owns both adjustments.
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
  marker.openPopup();
}

function revealAboveSheet(marker) {
  const reservedTop = sheetReservedTop();
  if (reservedTop === null || !marker) return null;
  const mapBox = map.getContainer().getBoundingClientRect();
  const boxes = [marker.getElement()?.getBoundingClientRect(),
    marker.getPopup()?.getElement()?.getBoundingClientRect()].filter(Boolean);
  if (!boxes.length) return null;

  // Fit the entire popup (including its tip) and marker within the unobstructed
  // part of the map. Pan the map, not the popup offset, to keep the tip anchored.
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
  // If the available area is too small for both bounds, retain the upper edge.
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

query('measure-select').addEventListener('change', event => {
  measure = event.target.value;
  paintDistricts();
  renderLegend();
});
query('zoom-overview').addEventListener('click', () => map.setZoom(14, { animate: false }));
query('zoom-street').addEventListener('click', () => map.setZoom(16, { animate: false }));
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

renderSites();
paintDistricts();
paintSites();
paintLabels();
renderLegend();
readout('zoom-readout', map.getZoom());
readout('attribution-readout', map.attributionControl.getContainer().textContent.trim().slice(0, 48));

window.__case = {
  variant: requested,
  style,
  map,
  basemapLayer,
  dataSha,
  tally,
  mean,
  counts: { sites: siteLayers.length, districts: districtLayers.length, labels: labelLayers.length,
            routePoints: routePoints.length, context: data.context.features.length },
  selected: () => selectedId,
  measure: () => measure,
  metersPerPixel,
  labelBoxes: () => labelLayers.filter(marker => map.hasLayer(marker)).map(marker => {
    // DOMRect exposes its edges on the prototype, so spreading it yields nothing.
    const rect = marker.getElement()?.getBoundingClientRect();
    return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    tier: marker.properties.tier, siteId: marker.properties.site_id ?? null } : null;
  }).filter(Boolean),
  sheetBox: () => document.querySelector('[data-testid="sheet"]')?.getBoundingClientRect() ?? null,
  popupBox: () => document.querySelector('.leaflet-popup-content')?.getBoundingClientRect() ?? null,
  clearSelection: () => selectSite(null),
  // Geometry in container pixels, so a measurement can be taken the way the feature is
  // actually drawn: along a line, inside an area, over a glyph.
  probeGeometry: () => {
    const container = map.getContainer().getBoundingClientRect();
    const local = point => ({ x: Math.round(point.x), y: Math.round(point.y) });
    const routeLine = routePoints.map(latlng => local(map.latLngToContainerPoint(latlng)));
    const region = id => {
      const layer = districtLayers.find(item => item.feature.district_id === id);
      if (!layer) return null;
      const bounds = layer.getBounds();
      const northWest = local(map.latLngToContainerPoint(bounds.getNorthWest()));
      const southEast = local(map.latLngToContainerPoint(bounds.getSouthEast()));
      return { x0: northWest.x, y0: northWest.y, x1: southEast.x, y1: southEast.y };
    };
    const labelRegion = tier => {
      const marker = labelLayers.find(item => item.properties.tier === tier && map.hasLayer(item));
      const rect = marker?.getElement()?.getBoundingClientRect();
      return rect ? { x0: Math.round(rect.left - container.left), y0: Math.round(rect.top - container.top),
                      x1: Math.round(rect.right - container.left), y1: Math.round(rect.bottom - container.top) } : null;
    };
    return {
      routeLine,
      site: local(map.latLngToContainerPoint(siteLayers.find(item => item.feature.site_id === 'S06').getLatLng())),
      district: region('D1'), districtMissing: region('D4'),
      // Every class needs its own region, so ordering can be judged on painted pixels.
      districts: districtLayers.map(layer => ({
        id: layer.feature.district_id, value: layer.feature.value,
        paintedClass: layer.feature.value === null ? null : (layer.options.fillColor ?? null),
        region: region(layer.feature.district_id),
      })),
      label: labelRegion(0),
      ground: local(map.latLngToContainerPoint(L.latLng(AREA.lat[0] + 0.0004, AREA.lon[0] + 0.0004))),
    };
  },
  markerBox: id => siteLayers.find(item => item.feature.site_id === id)?.getElement()?.getBoundingClientRect() ?? null,
  legendColors: () => [...document.querySelectorAll('[data-testid="legend"] li')].map(item => ({
    text: item.textContent.trim(), color: getComputedStyle(item.querySelector('i')).backgroundColor,
    // Present only when the entry was built from the style object rather than from a
    // CSS class, which is the difference between a legend that tracks the map and one
    // that merely happens to match it today.
    bound: item.dataset.color || null,
  })),
  siteStyleAt: id => {
    const marker = siteLayers.find(item => item.feature.site_id === id);
    return marker ? { fill: marker.options.fillColor, stroke: marker.options.color,
                      weight: marker.options.weight, radius: marker.options.radius } : null;
  },
  districtStyleAt: id => districtLayers.find(layer => layer.feature.district_id === id)?.options ?? null,
  districtElementAt: id => districtLayers.find(layer => layer.feature.district_id === id)?.getElement() ?? null,
  renderedData: () => ({
    sites: siteLayers.map(marker => ({ properties: marker.feature, coordinates: [marker.getLatLng().lng, marker.getLatLng().lat] })),
    districts: districtLayers.map(layer => ({ properties: layer.feature, coordinates: layer.getLatLngs()[0].map(point => [point.lng, point.lat]) })),
    route: routeLine.getLatLngs().map(point => [point.lng, point.lat]),
  }),
  siteLatLng: id => siteLayers.find(item => item.feature.site_id === id)?.getLatLng() ?? null,
  districtCentroid: id => districtLayers.find(layer => layer.feature.district_id === id)?.getBounds().getCenter() ?? null,
  routeMidpoint: () => routePoints[Math.floor(routePoints.length / 2)],
};
query('ready').dataset.state = 'ready';
query('ready').textContent = `就绪 · ${requested}`;
