const get = selector => document.querySelector(selector);
const setOf = selector => [...document.querySelectorAll(selector)];
const TRUE_MOBILE = matchMedia('(max-width: 820px)');

const dataFor = async name => {
  const response = await fetch(`./data/${name}`);
  if (!response.ok) throw new Error(`无法读取 ${name} 数据`);
  return response.json();
};

const [context, sites, route, labels] = await Promise.all([
  'context.geojson', 'sites.geojson', 'route.geojson', 'labels.geojson',
].map(dataFor));

const routeOrder = ['S01', 'S10', 'S02', 'S03', 'S04', 'S05', 'S09'];
const orderOf = Object.fromEntries(routeOrder.map((id, i) => [id, i + 1]));
let userMoved = false;
const selected = { id: null };

const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({ land: 240, buildings: 260, roads: 285, routes: 400, routeCasing: 380, stops: 440, names: 500 })) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  pane.style.pointerEvents = name === 'stops' ? '' : 'none';
}
const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);
draw('water', 'land', { fillColor: '#c6d9d4', fillOpacity: .94, color: '#b7cec9', weight: .5 });
draw('park', 'land', { fillColor: '#dfe6d8', fillOpacity: .9, color: '#cdd7cd', weight: .5 });
draw('building', 'buildings', { fillColor: '#e4e2d6', fillOpacity: .84, color: '#dbdad0', opacity: .6, weight: .5 });

/* road hierarchy: 越主干道越粗（三条 casing 三级宽度），我配合 assign 三档次干道 */
draw('major-road', 'roads', { color: '#c3b191', weight: 8.0, opacity: .95, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#fffdf4', weight: 5.4, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#d0cab8', weight: 4.2, opacity: .88, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf4', weight: 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#dcd8cb', weight: 1.9, opacity: .7, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf4', weight: 1.3, opacity: .94, lineCap: 'round', lineJoin: 'round' });

/* ---------- route split into per-segment polylines (one per adjacent pair) ---------- */
const rawPath = route.features[0].geometry.coordinates;
const stopsAlongRoute = routeOrder.map(id => siteById(id).geometry.coordinates);
const routeLayer = L.layerGroup().addTo(map);
const segmentTargets = stopsAlongRoute.slice(1);
let cursor = 0;
const routePaths = [];
const haversineKm = (a, b) => {
  const dp = (b[0] - a[0]) * Math.PI / 180;
  const dl = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
function siteById(id) {
  return sites.features.find(item => item.properties.site_id === id);
}
function polylineTo(target) {
  const indices = [];
  let bestDistance = Infinity;
  let lastTarget = Infinity;
  rawPath.forEach((point, index) => {
    const distance = haversineKm(point, target);
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  });
  return best;
}
function splitRoute() {
  let anchor = 0;
  for (const target of segmentTargets) {
    let bestIndex = anchor;
    let bestDistance = Infinity;
    for (let i = anchor; i < rawPath.length; i++) {
      const distance = haversineKm(rawPath[i], target);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
    }
    routePaths.push(rawPath.slice(anchor, bestIndex + 1));
    anchor = bestIndex;
  }
  return routePaths;
}
const segments = splitRoute();

/* 线上分段：两个站点之间的 path 都是一段折线；降下末段稍细（表示为支线 class） */
for (const [index, slice] of segments.entries()) {
  const path = slice.map(([lon, lat]) => [lat, lon]);
  const casing = L.polyline(path, { pane: 'routeCasing', color: '#fffdf3', opacity: 1, weight: 9, lineJoin: 'round', lineCap: 'round', interactive: false });
  const core = L.polyline(path, { pane: 'routes', color: index === segments.length - 1 ? '#8d3a28' : '#a14230', opacity: .97, weight: 3.4, lineJoin: 'round', lineCap: 'round', interactive: false });
  routeLayer.addLayer(casing); routeLayer.addLayer(core);
}

/* ---------- sites: ring markers with a route-order tab ---------- */
const siteRenderer = L.svg({ pane: 'stops' });
const siteRecordMap = new Map();
const siteMarkers = new Map();
const siteLabels = new Map();
const siteLayerGroup = L.layerGroup().addTo(map);
const labelsGroup = L.layerGroup().addTo(map);
let showLabels = true;

function popupContent(record) {
  const container = document.createElement('div');
  container.className = 'site-popup';
  container.dataset.testid = 'site-popup';
  const head = document.createElement('div'); head.className = 'popup-head';
  const type = document.createElement('span'); type.className = 'popup-type'; type.textContent = record.class_name;
  const status = document.createElement('span'); status.className = `popup-status${record.alert ? ' is-alert' : ''}`;
  status.textContent = record.alert ? '告警' : '正常';
  head.append(type, status);
  const title = document.createElement('strong'); title.className = 'popup-title'; title.textContent = record.name;
  const facts = document.createElement('dl'); facts.className = 'popup-facts';
  const amount = document.createElement('div');
  const amountKey = document.createElement('dt'); amountKey.textContent = '业务量';
  const amountValue = document.createElement('dd');
  const value = document.createElement('span'); value.textContent = record.throughput;
  const unit = document.createElement('small'); unit.textContent = '件';
  amountValue.append(value, unit);
  amount.append(amountKey, amountValue);
  const order = document.createElement('div');
  const orderKey = document.createElement('dt'); orderKey.textContent = '线路';
  const orderValue = document.createElement('dd');
  orderValue.textContent = record.order ? `第 ${record.order} 站` : '不在线路';
  order.append(orderKey, orderValue);
  facts.append(amount, order);
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 不用于导航';
  container.append(head, title, facts, note);
  return container;
}
const siteOffsets = {
  n: 'translate(-50%, calc(-100% - 9px))',
  s: 'translate(-50%, 10px)',
  e: 'translate(12px, -50%)',
  w: 'translate(calc(-100% - 12px), -50%)',
  ne: 'translate(9px, calc(-100% - 6px))',
  nw: 'translate(calc(-100% - 9px), calc(-100% - 6px))',
};

function makeLabel(latlng, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  const marker = L.marker(latlng, { pane: 'names', interactive: false, keyboard: false,
    icon: L.divIcon({ className, html: span, iconSize: [1, 1], iconAnchor: [0, 0] }) });
  marker.addTo(labelsGroup);
  return { marker, span, text, hidden: false };
}
const roadLabels = new Map();
for (const item of labels.features) {
  const label = makeLabel([item.geometry.coordinates[1], item.geometry.coordinates[0]], item.properties.name,
    `road-label${['primary', 'secondary', 'tertiary'].includes(item.properties.highway) ? ' is-major' : ''}`);
  roadLabels.set(item.properties.name + item.geometry.coordinates.join(','), label);
}

function renderSites() {
  for (const item of sites.features) {
    const p = item.properties;
    const [lon, lat] = item.geometry.coordinates;
    const record = { id: p.site_id, name: p.name.replace(/（.*?）/, ''), class_name: p.class_name,
      throughput: p.throughput, alert: p.status === 'alert', routes: p.routes,
      order: orderOf[p.site_id], latlng: [lat, lon] };
    siteRecordMap.set(p.site_id, record);
    const onRoute = Boolean(record.order);
    const cls = `site-marker${record.alert ? ' is-alert' : ''}${onRoute ? ' is-route' : ''}`;
    const marker = L.marker(record.latlng, {
      pane: 'stops', keyboard: true, interactive: true,
      icon: L.divIcon({
        className: cls,
        html: `<span class="visually-hidden">${p.name}　${record.order ? '路线第 ' + record.order + ' 站' : ''}</span>
          <span class="ring${record.order ? ' route' : ' plain'}${record.alert ? ' alert' : ''}"${record.order ? ` data-order="${String(record.order)}"` : ''}></span><span class="order-tag">${record.order ? String(record.order) : ''}</span>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      }),
      title: `${p.name}${record.order ? `（路线第 ${record.order} 站）` : ''}`,
    });
    marker.bindPopup(popupContent(record), { className: 'site-popup', offset: [0, -2],
      autoPanPaddingTopLeft: [20, 24], autoPanPaddingBottomRight: [20, 26], maxWidth: 268 });
    marker.on('click', () => selectSite(p.site_id));
    siteLayerGroup.addLayer(marker);
    siteMarkers.set(p.site_id, { marker, record });
    const label = makeLabel(record.latlng, record.name, 'marker-label site');
    label.record = record;
    siteLabels.set(p.site_id, label);
  }
}
renderSites();

const placeLabels = () => {
  const container = map.getContainer().getBoundingClientRect();
  const insets = TRUE_MOBILE.matches ? 6 : 15;
  const bounds = { left: container.left + insets, right: container.right - insets,
    top: container.top + insets, bottom: container.bottom - insets };
  const inside = box => box.left >= bounds.left && box.right <= bounds.right
    && box.top >= bounds.top && box.bottom <= bounds.bottom;
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const uiBoxes = [];
  for (const root of ['.route-banner', '.map-tools', '.scale-band', '.leaflet-bottom.leaflet-right']) {
    const box = document.querySelector(root);
    if (box) uiBoxes.push(box.getBoundingClientRect());
  }
  const popup = document.querySelector('.leaflet-popup');
  if (popup) uiBoxes.push(popup.getBoundingClientRect());
  const occupied = [...uiBoxes];
  const candidates = TRUE_MOBILE.matches ? ['n', 's', 'e', 'w'] : ['n', 's', 'e', 'w', 'ne', 'nw'];
  for (const label of siteLabels.values()) {
    const visible = showLabels && labelsGroup.hasLayer(label.marker);
    label.span.style.transform = siteOffsets.n;
    label.span.style.transition = 'none';
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible) continue;
    let placed = false;
    for (const key of candidates) {
      label.span.style.transform = siteOffsets[key];
      const box = label.span.getBoundingClientRect();
      if (!inside(box) || occupied.some(rect => overlap(box, rect))) continue;
      occupied.push(box);
      placed = true;
      break;
    }
    if (!placed) {
      label.span.style.transform = siteOffsets.s;
      if (!inside(label.span.getBoundingClientRect())) label.span.style.visibility = 'hidden';
      else occupied.push(label.span.getBoundingClientRect());
    }
  }
  for (const label of roadLabels.values()) {
    const visible = showLabels;
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible) continue;
    label.span.style.transform = 'translate(-50%, -50%)';
    const box = label.span.getBoundingClientRect();
    if (!inside(box) || occupied.some(rect => overlap(box, rect))) { label.span.style.visibility = 'hidden'; continue; }
    occupied.push(box);
  }
};

function updateMarkers() {
  for (const [id, entry] of siteMarkers) {
    const el = entry.marker.getElement();
    el?.classList.toggle('is-active', id === selected.id);
  }
  for (const article of setOf('[data-testid^="site-row-"]')) {
    const isOn = article.dataset.siteId === selected.id;
    article.classList.toggle('is-active', isOn);
    article.setAttribute('aria-pressed', String(isOn));
  }
  const activeCard = get('[data-testid^="site-row-"].is-active');
  if (activeCard) activeCard.scrollIntoView({ block: 'nearest' });
}

const setSheet = expanded => {
  document.body.classList.toggle('panel-collapsed', !expanded);
  const handle = get('[data-testid="sheet-toggle"]');
  if (!handle) return;
  handle.setAttribute('aria-expanded', String(expanded));
  handle.querySelector('.toggle-label').textContent = expanded ? '收起 −' : '展开 +';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    const marker = siteMarkers.get(selected.id);
    if (marker?.marker.isPopupOpen()) marker.marker.getPopup().update();
    placeLabels();
  }));
};

const selectSite = id => {
  const entry = siteMarkers.get(id);
  if (!entry) return;
  if (!map.hasLayer(siteLayerGroup)) map.addLayer(siteLayerGroup);
  selected.id = id;
  updateMarkers();
  if (TRUE_MOBILE.matches) setSheet(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    entry.marker.openPopup();
    placeLabels();
  }));
};

/* ---------- interactions ---------- */
function toggleFor(testid, layer, after) {
  const button = get(`[data-testid="${testid}"]`);
  button?.addEventListener('click', () => {
    const show = !map.hasLayer(layer);
    if (show) map.addLayer(layer); else map.removeLayer(layer);
    button.setAttribute('aria-pressed', String(show));
    if (!show && layer === siteLayerGroup) map.closePopup();
    after?.();
    requestAnimationFrame(() => requestAnimationFrame(placeLabels));
  });
}
toggleFor('toggle-route', routeLayer);
toggleFor('toggle-sites', siteLayerGroup);
get('[data-testid="toggle-names"]').addEventListener('click', event => {
  const button = event.currentTarget;
  showLabels = !showLabels;
  button.setAttribute('aria-pressed', String(showLabels));
  document.body.classList.toggle('no-labels', !showLabels);
  placeLabels();
});

function buildIndex() {
  const rail = get('[data-testid="site-list"]');
  if (!rail) return;
  const minThroughput = Math.min(...sites.features.map(item => item.properties.throughput));
  const maxThroughput = Math.max(...sites.features.map(item => item.properties.throughput));
  for (const item of sites.features) {
    const p = item.properties;
    const record = siteRecordMap.get(p.site_id);
    const article = document.createElement('article');
    article.dataset.testid = `site-row-${p.site_id}`;
    article.dataset.siteId = p.site_id;
    article.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('span');
    dot.className = `ring${record.order ? ' route' : ' plain'}${record.alert ? ' alert' : ''}`;
    if (record.alert) dot.classList.add('alert');
    const copy = document.createElement('span'); copy.className = 'site-copy';
    const name = document.createElement('b'); name.textContent = record.name;
    const meta = document.createElement('small');
    meta.textContent = `${p.class_name} · ${record.order ? `路线第 ${record.order} 站` : '不在线路'}`;
    copy.append(name, meta);
    const magnitude = document.createElement('span'); magnitude.className = 'site-value';
    magnitude.textContent = `${record.throughput} 件`;
    article.append(dot, copy, magnitude);
    rail.append(article);
    article.addEventListener('click', () => selectSite(p.site_id));
  }
}
buildIndex();

const bounds = L.latLngBounds(sites.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
const fit = () => {
  const padding = TRUE_MOBILE.matches ? { topLeft: [24, 24], bottomRight: [22, 200] } : { topLeft: [30, 30], bottomRight: [30, 30] };
  map.fitBounds(bounds, { ...padding, animate: false });
};
fit();
get('[data-panel-count]').textContent = sites.features.length;
get('[data-route-count]').textContent = routeOrder.length;
if (TRUE_MOBILE.matches) setSheet(false);
for (const node of setOf('[data-panel-count]')) node.textContent = sites.features.length;

map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { passive: true });
map.on('moveend', placeLabels);
map.on('resize', () => { if (!userMoved && !selected.id) fit(); });
TRUE_MOBILE.addEventListener('change', () => setSheet(!TRUE_MOBILE.matches));
const sheetToggle = get('[data-testid="sheet-toggle"]');
sheetToggle?.addEventListener('click', () => setSheet(document.body.classList.contains('panel-collapsed')));

const statusEl = get('[data-testid="ready"]');
statusEl.dataset.state = 'ready';
statusEl.textContent = '地图已就绪';
placeLabels();

window.__streetAtlasSplit = {
  map, fit, bounds,
  selectedSite: () => selected.id,
  layerState: () => ({ routes: map.hasLayer(routeLayer), sites: map.hasLayer(siteLayerGroup), names: showLabels }),
  markerBox: id => siteMarkers.get(id)?.marker.getElement()?.getBoundingClientRect() ?? null,
  labelCount: () => setOf('.marker-label span, .road-label span').filter(el => getComputedStyle(el).visibility !== 'hidden').length,
  markerCount: () => siteMarkers.size,
};
