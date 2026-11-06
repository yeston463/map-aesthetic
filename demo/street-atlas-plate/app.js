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
const alerts = sites.features.filter(feature => feature.properties.status === 'alert').map(f => f.properties.site_id);
const routeLengthKm = (() => {
  const path = route.features[0].geometry.coordinates;
  const toRad = d => d * Math.PI / 180;
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dp = toRad(b[1] - a[1]);
    const dl = toRad(b[0] - a[0]);
    const h = Math.sin(dp / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dl / 2) ** 2;
    sum += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return sum;
})();

/* ---------- map + panes ---------- */
let userMoved = false;
const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomleft' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({
  land: 240, buildings: 260, roads: 285, routes: 400, routeCasing: 380, chevrons: 410, stops: 440, badges: 450, names: 500,
})) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  pane.style.pointerEvents = name === 'stops' || name === 'badges' ? '' : 'none';
}
const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);
draw('water', 'land', { fillColor: '#c5d9d2', fillOpacity: .94, color: '#b8cec9', weight: .5 });
draw('park', 'land', { fillColor: '#d9e3d2', fillOpacity: .9, color: '#c9d6c6', weight: .5 });
draw('building', 'buildings', { fillColor: '#e3e1d5', fillOpacity: .86, color: '#d8d8cd', opacity: .62, weight: .5 });

/* three-tone road hierarchy: 3 casings + cores in different tones */
draw('major-road', 'roads', { color: '#c3b391', weight: 8.4, opacity: .95, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#fffdf5', weight: 5.6, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#d2ccb9', weight: 4.6, opacity: .9, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf4', weight: 2.7, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#dcd8cb', weight: 2, opacity: .68, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf4', weight: 1.4, opacity: .94, lineCap: 'round', lineJoin: 'round' });

/* ---------- route casing + core + chevrons ---------- */
const path = route.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
const casing = L.polyline(path, {
  pane: 'routeCasing', color: '#fffbf4', opacity: 1, weight: 8.6, lineJoin: 'round', lineCap: 'round', interactive: false,
});
const core = L.polyline(path, {
  pane: 'routes', color: '#a14230', opacity: .98, weight: 3.6, lineJoin: 'round', lineCap: 'round', interactive: false,
});
const routeLayers = L.layerGroup().addTo(map);
routeLayers.addLayer(casing); routeLayers.addLayer(core);

/* direction chevrons along the route, hideable via the third tool */
const chevronLayer = L.layerGroup().addTo(map);
const chevrons = [];
const haversineKm = (a, b) => {
  const dp = (b[0] - a[0]) * Math.PI / 180;
  const dl = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
let traveled = 0;
const SPACING_KM = .42;
let lastPlacedKm = -1;
for (let i = 1; i < path.length; i++) {
  const segment = haversineKm(path[i - 1], path[i]);
  traveled += segment;
  if (traveled - lastPlacedKm >= SPACING_KM) {
    const dLat = Math.abs(path[i][0] - path[i - 1][0]);
    const dLon = Math.abs(path[i][1] - path[i - 1][1]);
    const bearing = Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]) * 180 / Math.PI;    const marker = L.marker(path[i], {
      pane: 'chevrons', interactive: false,
      icon: L.divIcon({
        className: 'direction-chevron',
        html: `<svg viewBox="0 0 13 13" width="12" height="12" style="transform: rotate(${Math.round(bearing)}deg)">
          <path d="M1 10.4 L12 10.4 L6.5 2.2 Z" fill="#a14230" stroke="#fffcf5" stroke-width="1.7"/>
        </svg>`,
        iconSize: [13, 13], iconAnchor: [6.5, 6.5],
      }),
    });
    marker.getElement()?.classList.add('direction-chevron');
    chevronLayer.addLayer(marker);
    chevrons.push({ marker, bearing });
    lastPlacedKm = traveled;
  }
}
document.documentElement.style.setProperty('--route-length', `${routeLengthKm.toFixed(1)} km`);
for (const node of setOf('[data-count="route-length"]')) node.textContent = routeLengthKm.toFixed(1);

/* ---------- road labels ---------- */
function makeLabel(latlng, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  const marker = L.marker(latlng, { pane: 'names', interactive: false, keyboard: false,
    icon: L.divIcon({ className, html: span, iconSize: [1, 1], iconAnchor: [0, 0] }) });
  marker.addTo(labelsLayerGroup);
  return { marker, span, text };
}
const labelsLayerGroup = L.layerGroup().addTo(map);

const siteOffsets = {
  n: 'translate(-50%, calc(-100% - 10px))',
  s: 'translate(-50%, 10px)',
  e: 'translate(12px, -50%)',
  w: 'translate(calc(-100% - 12px), -50%)',
  ne: 'translate(10px, calc(-100% - 6px))',
  nw: 'translate(calc(-100% - 10px), calc(-100% - 6px))',
};

/* ---------- sites ---------- */
const siteRenderer = L.svg({ pane: 'stops' });
const siteRecords = new Map();
const siteMarkers = new Map();
const siteLabels = new Map();
const siteButtons = new Map();
const selected = { id: null };
let openPopup = null;

function popupContent(record) {
  const container = document.createElement('div');
  container.className = 'site-popup';
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
  const code = document.createElement('div');
  const codeKey = document.createElement('dt'); codeKey.textContent = '编号';
  const codeValue = document.createElement('dd'); codeValue.textContent = record.id;
  code.append(codeKey, codeValue);
  facts.append(amount, code);
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 不用于导航';
  container.append(head, title, facts, note);
  return container;
}

/* ---------- site markers, labels and badges ---------- */
const siteVisible = () => map.hasLayer(siteLayerGroup);
const siteLayerGroup = L.layerGroup().addTo(map);

function renderMarkers() {
  for (const [, entry] of siteMarkers) {
    siteLayerGroup.removeLayer(entry.marker);
    siteMarkers.delete(entry.id);
  }
  for (const [id, label] of siteLabels) {
    labelsLayerGroup.removeLayer(label.marker);
    siteLabels.delete(id);
  }
  for (const item of sites.features) {
    const p = item.properties;
    const record = { id: p.site_id, name: p.name.replace(/（.*?）/, ''), class_name: p.class_name,
      throughput: p.throughput, alert: p.status === 'alert', order: orderOf[p.site_id],
      latlng: [item.geometry.coordinates[1], item.geometry.coordinates[0]] };
    siteRecords.set(p.site_id, record);
    const orderText = orderOf[p.site_id] ? String(orderOf[p.site_id]) : '';
    const marker = L.marker(record.latlng, {
      pane: 'badges', keyboard: true, title: `${p.name}（${orderText ? `站点 ${orderText}` : '不在主线'}）`,
      icon: L.divIcon({
        className: `stop-badge${record.alert ? ' alert' : ''}`, html: `<span class="visually-hidden">${p.name}</span><b aria-hidden="true">${orderText ?? '·'}</b>`,
        iconSize: [21, 21], iconAnchor: [10.5, 10.5],
      }),
    });
    marker.bindPopup(popupContent(record), { className: 'site-popup', offset: [0, -2],
      autoPanPaddingTopLeft: [16, 92], autoPanPaddingBottomRight: [16, 30], maxWidth: 288 });
    marker.on('click', () => selectSite(p.site_id));
    siteLayerGroup.addLayer(marker);
    siteMarkers.set(p.site_id, { marker, record });
    const label = makeLabel(record.latlng, record.name, 'marker-label site');
    siteLabels.set(p.site_id, label);
  }
  updateMarkers();
}
renderMarkers();

function updateMarkers() {
  for (const [id, entry] of siteMarkers) {
    const el = entry.marker.getElement();
    el?.classList.toggle('is-active', id === selected.id);
    for (const button of setOf(`[data-testid="site-${id}"]`)) {
      button.setAttribute('aria-pressed', String(id === selected.id));
      button.classList.toggle('is-active', id === selected.id);
    }
  }
}

const placeLabels = () => {
  const container = map.getContainer().getBoundingClientRect();
  const insets = 4;
  const bounds = { left: container.left + insets, right: container.right - insets,
    top: container.top + insets, bottom: container.bottom - insets };
  const inside = box => box.left >= bounds.left && box.right <= bounds.right
    && box.top >= bounds.top && box.bottom <= bounds.bottom;
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const uiBoxes = [];
  for (const root of ['.route-banner', '.map-tools', '.map-key', '.plate-column', '.leaflet-bottom.leaflet-left']) {
    const box = document.querySelector(root);
    if (box) uiBoxes.push(box.getBoundingClientRect());
  }
  const popup = document.querySelector('.leaflet-popup');
  if (popup) uiBoxes.push(popup.getBoundingClientRect());
  const occupied = [...uiBoxes];
  const candidates = TRUE_MOBILE.matches ? ['n', 's', 'e', 'w'] : ['n', 's', 'e', 'w', 'ne', 'nw'];
  const labelNodes = [];
  for (const label of siteLabels.values()) {
    if (labelsLayerGroup.hasLayer(label.marker)) labelNodes.push({ label, road: false });
  }
  for (const label of roadLabels.values()) labelNodes.push({ label, road: true });
  for (const { label, road } of labelNodes) {
    const visible = siteLayerVisible() && (!road || roadLabelsVisible());
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible) continue;
    let placed = false;
    for (const key of candidates) {
      label.span.style.transform = siteOffsets[key];
      const box = label.span.getBoundingClientRect();
      const overlapsUi = occupied.some(rect => overlap(box, rect));
      if (!inside(box) || overlapsUi) continue;
      occupied.push(box);
      placed = true;
      break;
    }
    if (!placed) {
      for (const key of candidates) {   // second pass: allow UI overlap rather than dropping the label
        label.span.style.transform = siteOffsets[key];
        if (!inside(label.span.getBoundingClientRect())) continue;
        occupied.push(label.span.getBoundingClientRect());
        placed = true;
        break;
      }
    }
    if (!placed) label.span.style.visibility = 'hidden';
  }
};

const roadLabels = new Map();
let roadHidden = false;
const roadLabelsVisible = () => !roadHidden;
for (const item of labels.features) {
  const label = makeLabel([item.geometry.coordinates[1], item.geometry.coordinates[0]], item.properties.name,
    `road-label${['primary', 'secondary', 'tertiary'].includes(item.properties.highway) ? ' is-major' : ''}`);
  roadLabels.set(item.properties.name + item.geometry.coordinates.join(','), label);
}
const siteLayerVisible = () => map.hasLayer(siteLayerGroup);

/* ---------- interactions ---------- */
const setSheet = expanded => {
  document.body.classList.toggle('sheet-collapsed', !expanded);
  const mobileHandle = document.querySelector('[aria-controls="plate-body"]');
  if (mobileHandle) {
    mobileHandle.setAttribute('aria-expanded', String(expanded));
    mobileHandle.setAttribute('aria-label', expanded ? '收起站点面板' : '展开站点面板');
    mobileHandle.querySelector('.toggle-icon').textContent = expanded ? '收起 ↓' : '展开 ↑';
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    setSheet.after?.();
    setSheet.after = null;
    const marker = siteMarkers.get(selected.id);
    if (marker?.marker.isPopupOpen()) marker.marker.getPopup().update();
    placeLabels();
  }));
};
setSheet.after = null;

const selectSite = id => {
  const entry = siteMarkers.get(id);
  if (!entry) return;
  if (!map.hasLayer(siteLayerGroup)) {
    map.addLayer(siteLayerGroup);
    document.querySelector('[data-testid="toggle-sites"]').setAttribute('aria-pressed', 'true');
  }
  selected.id = id;
  updateMarkers();
  if (TRUE_MOBILE.matches) {
    setSheet(false);
    setSheet.after = () => entry.marker.openPopup();
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      entry.marker.openPopup();
      placeLabels();
    }));
  }
};

toggleFor('toggle-route', routeLayers);
toggleFor('toggle-sites', siteLayerGroup);
toggleFor('toggle-directions', chevronLayer);
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
const bounds = L.latLngBounds(sites.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
const fit = () => {
  // keep the east route loop visible beside the plate column instead of under it
  const padding = TRUE_MOBILE.matches ? { topLeft: [86, 20], bottomRight: [20, 20] }
    : { topLeft: [64, 64], bottomRight: [64, 336] };
  map.fitBounds(bounds, { ...padding, animate: false });
};
fit();
get('[data-count="sites"]').textContent = sites.features.length;
get('[data-count="route"]').textContent = routeOrder.length;
get('[data-count="alerts"]').textContent = alerts.length;
setOf('[data-panel-count]').forEach(n => n.textContent = sites.features.length);

const sitePanel = get('.plate-column');
const mobileHandle = document.createElement('button');
mobileHandle.setAttribute('aria-expanded', String(!TRUE_MOBILE.matches));
mobileHandle.setAttribute('aria-controls', 'plate-body');
mobileHandle.className = 'sheet-toggle';
mobileHandle.dataset.testid = 'sheet-toggle';
mobileHandle.innerHTML = '<span><b>站点面板</b><small><span data-panel-count>12</span> 个站点</small></span><span class="toggle-icon">收起 ↓</span>';
sitePanel.prepend(mobileHandle);
mobileHandle.addEventListener('click', () => setSheet(document.body.classList.contains('sheet-collapsed')));
if (TRUE_MOBILE.matches) setSheet(false);

map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { passive: true });
map.on('moveend', placeLabels);
map.on('resize', () => { if (!userMoved && !selected.id) fit(); });
TRUE_MOBILE.addEventListener('change', () => setSheet(!TRUE_MOBILE.matches));

const statusEl = get('[data-testid="ready"]');

/* ---------- site index inside the plate column ---------- */
function buildSiteIndex() {
  const list = get('[data-testid="site-list"]');
  if (!list) return;
  const ordered = sites.features.map(item => siteRecords.get(item.properties.site_id));
  for (const record of ordered) {
    const li = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.testid = `site-${record.id}`;
    button.setAttribute('aria-pressed', 'false');
    const mark = document.createElement('span');
    mark.className = `site-mark${record.alert ? ' alert' : ''}`;
    mark.textContent = record.order ? String(record.order) : '·';
    const copy = document.createElement('span'); copy.className = 'site-copy';
    const name = document.createElement('b'); name.textContent = record.name;
    const meta = document.createElement('small');
    meta.textContent = `${record.class_name}${record.alert ? ' · 异常' : ''}${record.order ? ` · 线路第 ${record.order} 站` : ' · 非线路站点'}`;
    copy.append(name, meta);
    const value = document.createElement('span'); value.className = 'site-value';
    value.textContent = `${record.throughput} 件`;
    button.append(mark, copy, value);
    li.append(button); list.append(li);
    button.addEventListener('click', () => selectSite(record.id));
  }
}
buildSiteIndex();
updateMarkers();

const statusEl2 = get('[data-testid="ready"]');
statusEl2.dataset.state = 'ready';
statusEl2.textContent = '地图已就绪';
placeLabels();

window.__streetAtlasPlate = {
  map, fit, bounds,
  selectedSite: () => selected.id,
  layerState: () => ({ routes: map.hasLayer(routeLayers), sites: map.hasLayer(siteLayerGroup), chevrons: map.hasLayer(chevronLayer) }),
  markerBox: id => siteMarkers.get(id)?.marker.getElement()?.getBoundingClientRect() ?? null,
  chevronCount: () => chevrons.length,
  labelCount: () => setOf('.marker-label span, .road-label span').filter(el => getComputedStyle(el).visibility !== 'hidden').length,
};
