const get = selector => document.querySelector(selector);
const dataFor = async name => {
  const response = await fetch(`./data/${name}.geojson`);
  if (!response.ok) throw new Error(`无法读取 ${name} 数据`);
  return response.json();
};
const [context, sites, route, labels] = await Promise.all(['context', 'sites', 'route', 'labels'].map(dataFor));
const routeIds = ['S01', 'S10', 'S02', 'S03', 'S04', 'S05', 'S09'];
const routeOrder = Object.fromEntries(routeIds.map((id, i) => [id, i + 1]));
const mobile = matchMedia('(max-width: 820px)');
let selected = null;
let userMoved = false;

const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({
  land: 240, buildings: 260, roads: 280, route: 400, stops: 420, badge: 440, names: 500,
})) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  pane.style.pointerEvents = name === 'stops' || name === 'badge' ? '' : 'none';
}
const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);

/* ---------- basemap ---------- */
draw('water', 'land', { fillColor: '#c6dbd5', fillOpacity: .94, color: '#b5ceca', weight: .5 });
draw('park', 'land', { fillColor: '#dae3d4', fillOpacity: .9, color: '#c7d6c6', weight: .5 });
draw('building', 'buildings', { fillColor: '#e2e0d4', fillOpacity: .85, color: '#d8d8cd', opacity: .65, weight: .5 });
draw('minor-road', 'roads', { color: '#d3cec1', weight: 3.4, opacity: .75, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf3', weight: 2.2, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#cbbb9c', weight: 7.4, opacity: .92, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#fffdf5', weight: 5.2, opacity: 1, lineCap: 'round', lineJoin: 'round' });

/* ---------- route + stops ---------- */
const routeCoordinates = route.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
const routePolyline = L.layerGroup([
  L.polyline(routeCoordinates, { pane: 'route', color: '#fffdf7', opacity: 1, weight: 8, lineJoin: 'round', lineCap: 'round', interactive: false }),
  L.polyline(routeCoordinates, { pane: 'route', color: '#a9432f', opacity: .96, weight: 3.4, lineJoin: 'round', lineCap: 'round', interactive: false }),
]);
const stopBadges = L.layerGroup();
const badgeMarkers = [];
const routeLayers = L.layerGroup([routePolyline]).addTo(map);

const haversine = (a, b) => {
  const toRad = value => value * Math.PI / 180;
  const [x1, y1] = a, [x2, y2] = b;
  const dp = toRad(y2 - y1);
  const dl = toRad(x2 - x1);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(toRad(y1)) * Math.cos(toRad(y2)) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const distanceKm = route.features[0].geometry.coordinates.reduce((sum, point, i) =>
  sum + (i ? haversine(route.features[0].geometry.coordinates[i - 1], point) : 0), 0);
const distanceText = distanceKm.toFixed(1);
for (const node of document.querySelectorAll('[data-count="distance"]')) node.textContent = distanceText;

/* ---------- svg renderer for plain sites ---------- */
const siteRenderer = L.svg({ pane: 'stops' });

function popupContent(properties) {
  const container = document.createElement('div');
  container.className = 'site-popup';
  const head = document.createElement('div'); head.className = 'popup-head';
  const type = document.createElement('span'); type.className = 'popup-type'; type.textContent = properties.class_name;
  const status = document.createElement('span'); status.className = `popup-status${properties.status === 'alert' ? ' is-alert' : ''}`;
  status.textContent = properties.status === 'alert' ? '异常' : '正常';
  head.append(type, status);
  const title = document.createElement('strong'); title.className = 'popup-title'; title.textContent = properties.name;
  const facts = document.createElement('dl'); facts.className = 'popup-facts';
  const amount = document.createElement('div');
  const amountLabel = document.createElement('dt'); amountLabel.textContent = '业务量';
  const amountValue = document.createElement('dd');
  const value = document.createElement('span'); value.textContent = properties.throughput;
  const unit = document.createElement('small'); unit.textContent = '件';
  amountValue.append(value, unit); amount.append(amountLabel, amountValue);
  const identity = document.createElement('div');
  const idLabel = document.createElement('dt'); idLabel.textContent = '编号';
  const idValue = document.createElement('dd'); idValue.textContent = properties.site_id;
  identity.append(idLabel, idValue);
  facts.append(amount, identity);
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 不用于导航';
  container.append(head, title, facts, note);
  return container;
}

/* ---------- site markers + labels ---------- */
const markers = new Map();
const buttons = new Map();
const siteLayers = L.layerGroup();
const siteRenderer2 = siteRenderer;

const plainStyle = entry => ({
  radius: entry.selected ? 7 : 5.4,
  color: entry.selected ? '#7c3121' : entry.alert ? '#b34c33' : '#b0ae9e',
  weight: entry.selected ? 2.6 : 1.6,
  fillColor: entry.alert ? '#b34c33' : '#fffdf7',
  fillOpacity: 1,
});

for (const item of sites.features) {
  const p = item.properties;
  const latlng = [item.geometry.coordinates[1], item.geometry.coordinates[0]];
  const onRoute = routeOrder[p.site_id] !== undefined;
  const entry = { id: p.site_id, name: p.name, kind: null, alert: p.status === 'alert', order: routeOrder[p.site_id] };
  if (onRoute) entry.kind = 'badge'; else entry.kind = 'plain';
  let marker;
  if (entry.kind === 'badge') {
    const html = `<span class="visually-hidden">${p.name}，路线第 ${entry.order} 站</span><b aria-hidden="true">${entry.order}</b>`;
    marker = L.marker(latlng, { pane: 'badge', icon: L.divIcon({
      className: `stop-badge${entry.alert ? ' alert' : ''}`, html, iconSize: [22, 22], iconAnchor: [11, 11],
    }), keyboard: true, title: `${p.name}（线路第 ${entry.order} 站）` });
  } else {
    marker = L.circleMarker(latlng, { pane: 'stops', renderer: siteRenderer2, radius: 5.4,
      color: entry.alert ? '#b34c33' : '#b0ae9e', weight: 1.6, fillColor: entry.alert ? '#b34c33' : '#fffdf7', fillOpacity: 1 });
    entry.setStyle = style => marker.setStyle(style);
  }
  marker.bindPopup(popupContent(p), { autoPanPaddingTopLeft: [16, 84], autoPanPaddingBottomRight: [16, 24], maxWidth: 290, offset: [0, -2] });
  marker.on('click', () => selectSite(p.site_id));
  siteLayers.addLayer(marker);
  markers.set(p.site_id, entry);
  entry.marker = marker;
}

function updateMarkers() {
  markers.forEach(entry => {
    const active = entry.id === selected;
    if (entry.kind === 'badge') {
      entry.marker.getElement()?.classList.toggle('is-active', active);
    } else {
      entry.marker.setStyle(plainStyle({ selected: active, alert: entry.alert }));
    }
    buttons.get(entry.id)?.setAttribute('aria-pressed', String(active));
  });
}

/* labels */
function makeLabel(latlng, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  const marker = L.marker(latlng, { pane: 'names', interactive: false, keyboard: false,
    icon: L.divIcon({ className, html: span, iconSize: [1, 1], iconAnchor: [0, 0] }) });
  marker.addTo(map);
  return { marker, span };
}
const siteLabels = [];
for (const item of sites.features) {
  const p = item.properties;
  const latlng = [item.geometry.coordinates[1], item.geometry.coordinates[0]];
  const onRoute = routeOrder[p.site_id] !== undefined;
  const label = makeLabel(latlng, p.name.replace(/（.*?）/, ''),
    `marker-label ${onRoute ? 'is-route' : 'is-other'}${p.status === 'alert' ? ' is-alert' : ''}`);
  label.id = p.site_id; label.order = routeOrder[p.site_id] ?? 9; label.alert = p.status === 'alert';
  label.throughput = p.throughput; label.kind = 'site';
  siteLabels.push(label);
}
const roadLabels = labels.features.map(item => {
  const latlng = [item.geometry.coordinates[1], item.geometry.coordinates[0]];
  const label = makeLabel(latlng, item.properties.name,
    `road-label${['primary', 'secondary', 'tertiary'].includes(item.properties.highway ?? '') ? ' is-major' : ''}`);
  label.rank = item.properties.highway === 'primary' ? 0 : item.properties.highway === 'secondary' ? 1 : item.properties.highway === 'tertiary' ? 2 : 3;
  label.kind = 'road';
  return label;
});

const siteOffsets = {
  n: 'translate(-50%, calc(-100% - 10px))',
  s: 'translate(-50%, 10px)',
  e: 'translate(12px, -50%)',
  w: 'translate(calc(-100% - 12px), -50%)',
  ne: 'translate(10px, calc(-100% - 6px))',
  nw: 'translate(calc(-100% - 10px), calc(-100% - 6px))',
};

function placeLabels() {
  const mapBox = map.getContainer().getBoundingClientRect();
  const insets = mobile.matches ? 6 : 14;
  const bounds = { left: mapBox.left + insets, right: mapBox.right - insets, top: mapBox.top + insets, bottom: mapBox.bottom - insets };
  const inside = box => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const obstructed = [];
  for (const root of ['.map-bar', '.map-legend', '.leaflet-bottom.leaflet-right']) {
    const el = document.querySelector(root);
    if (el) obstructed.push(el.getBoundingClientRect());
  }
  const popup = document.querySelector('.leaflet-popup');
  if (popup) obstructed.push(popup.getBoundingClientRect());
  const markerBoxes = new Map();
  if (map.hasLayer(siteLayers)) markers.forEach(entry => {
    if (entry.marker.getElement()) markerBoxes.set(entry.id, entry.marker.getElement().getBoundingClientRect());
  });
  const occupied = [];
  for (const box of obstructed) occupied.push(box);

  const showSiteLabel = map.hasLayer(siteLayers);
  const candidates = mobile.matches ? ['n', 's', 'e', 'w'] : ['n', 's', 'e', 'w', 'ne', 'nw'];
  const ordered = siteLabels.slice().sort((a, b) =>
    (Number(b.id === selected) - Number(a.id === selected))
    || Number(a.alert) - Number(b.alert)
    || b.throughput - a.throughput);
  for (const item of ordered) {
    item.span.style.visibility = showSiteLabel ? '' : 'hidden';
    if (!showSiteLabel) continue;
    const anchor = markerBoxes.get(item.id);
    if (!anchor) { item.span.style.visibility = 'hidden'; continue; }
    let placed = false;
    for (const key of candidates) {
      item.span.style.transform = siteOffsets[key];
      const box = item.span.getBoundingClientRect();
      const overlapsMarkers = [...markerBoxes.entries()].some(([id, rect]) => id !== item.id && overlap(box, rect));
      const overlapsUi = occupied.some(rect => overlap(box, rect));
      if (!inside(box) || overlapsMarkers || overlapsUi) continue;
      occupied.push(box);
      placed = true;
      break;
    }
    if (!placed) {
      item.span.style.transform = siteOffsets.s;
      const box = item.span.getBoundingClientRect();
      if (!inside(box)) { item.span.style.visibility = 'hidden'; placed = false; }
      else occupied.push(box);
    }
  }

  const roadOrder = roadLabels.slice().sort((a, b) => a.rank - b.rank);
  for (const item of roadOrder) {
    item.span.style.visibility = '';
    item.span.style.transform = 'translate(-50%, -50%)';
    const box = item.span.getBoundingClientRect();
    const clashes = occupied.some(rect => overlap(box, rect));
    if (!inside(box) || clashes) { item.span.style.visibility = 'hidden'; continue; }
    occupied.push(box);
  }
}

/* ---------- layer toggles ---------- */
let sitesOn = true;
for (const item of siteLabels) siteLayers.addLayer(item.marker);
siteLayers.addTo(map);
const toggleFor = (testid, layer, after) => {
  const button = get(`[data-testid="${testid}"]`);
  button.addEventListener('click', () => {
    const show = !map.hasLayer(layer);
    if (show) map.addLayer(layer); else map.removeLayer(layer);
    button.setAttribute('aria-pressed', String(show));
    if (!show && layer === siteLayers) { map.closePopup(); sitesOn = false; }
    else if (layer === siteLayers) sitesOn = true;
    after?.();
    requestAnimationFrame(() => requestAnimationFrame(preventOverlap));
  });
};
toggleFor('toggle-route', routeLayers);
toggleFor('toggle-sites', siteLayers);

function preventOverlap() { placeLabels(); }

/* ---------- sheet ---------- */
const sheetToggle = get('[data-testid="sheet-toggle"]');
function setSheet(expanded) {
  document.body.classList.toggle('sheet-collapsed', !expanded);
  sheetToggle.setAttribute('aria-expanded', String(expanded));
  sheetToggle.querySelector('.toggle-label').textContent = expanded ? '收起 −' : '展开 +';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    if (mobile.matches && expanded) map.closePopup();
    else {
      const marker = markers.get(selected);
      if (marker?.marker.isPopupOpen()) marker.marker.getPopup().update();
    }
    placeLabels();
  }));
}

function selectSite(id) {
  const entry = markers.get(id);
  if (!entry) return;
  if (!map.hasLayer(siteLayers)) {
    map.addLayer(siteLayers); sitesOn = true;
    get('[data-testid="toggle-sites"]').setAttribute('aria-pressed', 'true');
  }
  selected = id;
  updateMarkers();
  if (mobile.matches) setSheet(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    entry.marker.openPopup();
    placeLabels();
  }));
}

/* ---------- site list ---------- */
const list = get('[data-testid="site-list"]');
for (const item of sites.features) {
  const p = item.properties;
  const entry = markers.get(p.site_id);
  const li = document.createElement('li');
  const button = document.createElement('button'); button.type = 'button'; button.dataset.testid = `site-${p.site_id}`;
  button.setAttribute('aria-pressed', 'false');
  const dot = document.createElement('span');
  dot.className = `site-mark${entry.kind === 'badge' ? ' route' : ''}${entry.alert ? ' alert' : ''}`;
  if (entry.order) dot.textContent = entry.order; else dot.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span'); copy.className = 'site-copy';
  const name = document.createElement('b'); name.textContent = p.name;
  const sub = document.createElement('small'); sub.textContent = p.class_name;
  copy.append(name, sub);
  const amount = document.createElement('span'); amount.className = 'site-value';
  const amountValue = document.createElement('b'); amountValue.textContent = `${p.throughput}`;
  const unit = document.createElement('em'); unit.textContent = '件';
  amount.append(amountValue, unit);
  button.append(dot, copy, amount);
  li.append(button); list.append(li);
  button.addEventListener('click', () => selectSite(p.site_id));
  buttons.set(p.site_id, button);
}
for (const node of document.querySelectorAll('[data-count="sites"]')) node.textContent = sites.features.length;
get('[data-count="route"]').textContent = routeIds.length;
const alerts = sites.features.filter(item => item.properties.status === 'alert').length;
for (const node of document.querySelectorAll('[data-count="alerts"]')) node.textContent = alerts;

sheetToggle.addEventListener('click', () => setSheet(document.body.classList.contains('sheet-collapsed')));

map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { passive: true });
map.on('moveend zoomend', placeLabels);
map.on('resize', () => {
  if (!userMoved && !selected) fit();
});
mobile.addEventListener('change', () => setSheet(!mobile.matches));

const bounds = L.latLngBounds(sites.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
const fit = () => map.fitBounds(bounds, { padding: mobile.matches ? [32, 72] : [70, 70], animate: false });
fit();
setSheet(!mobile.matches);
get('[data-testid="ready"]').dataset.state = 'ready';
get('[data-testid="ready"]').textContent = '地图已就绪';
placeLabels();

window.__streetAtlasRefined = {
  map, bounds, distanceKm, selected: () => selected,
  layerState: () => ({ route: map.hasLayer(routeLayers), sites: map.hasLayer(siteLayers) }),
  placeLabels,
  markerBox: id => markers.get(id)?.marker.getElement()?.getBoundingClientRect() ?? null,
  labelCount: () => [...document.querySelectorAll('.marker-label span, .road-label span')]
    .filter(el => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length).length,
};
