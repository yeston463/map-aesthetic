const get = selector => document.querySelector(selector);
const dataFor = async name => {
  const response = await fetch(`./data/${name}.geojson`);
  if (!response.ok) throw new Error(`无法读取 ${name} 数据`);
  return response.json();
};
const [context, sites, route, labels] = await Promise.all(['context', 'sites', 'route', 'labels'].map(dataFor));
const routeIds = ['S01', 'S10', 'S02', 'S03', 'S04', 'S05', 'S09'];
const mobile = matchMedia('(max-width: 820px)');
let selected = null;
let userMoved = false;

const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({ land: 240, buildings: 260, roads: 280, route: 410, sites: 430, names: 450 })) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  if (name !== 'sites') pane.style.pointerEvents = 'none';
}
const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);
draw('water', 'land', { fillColor: '#c8dcd8', fillOpacity: .92, color: '#b8ceca', weight: .5 });
draw('park', 'land', { fillColor: '#dce5d7', fillOpacity: .85, color: '#cbd9c9', weight: .5 });
draw('building', 'buildings', { fillColor: '#dfded4', fillOpacity: .8, color: '#d7d7cc', opacity: .7, weight: .5 });
draw('minor-road', 'roads', { color: '#d6d2c6', weight: 3.5, opacity: .72, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#faf9f3', weight: 2.3, opacity: .98, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#d0c7b6', weight: 7.2, opacity: .92, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#fffdf5', weight: 5.1, opacity: 1, lineCap: 'round', lineJoin: 'round' });

const routeCoordinates = route.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
const routeLayers = L.layerGroup([
  L.polyline(routeCoordinates, { pane: 'route', color: '#fffdf8', opacity: .98, weight: 7, lineJoin: 'round', lineCap: 'round', interactive: false }),
  L.polyline(routeCoordinates, { pane: 'route', color: '#aa4737', opacity: .94, weight: 3.5, lineJoin: 'round', lineCap: 'round', interactive: false }),
]).addTo(map);

function nameMarker(coordinates, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  const marker = L.marker([coordinates[1], coordinates[0]], { pane: 'names', interactive: false, keyboard: false,
    icon: L.divIcon({ className, html: span, iconSize: [1, 1], iconAnchor: [0, 0] }) });
  marker.addTo(map);
  return marker;
}
const roadNames = labels.features.map(item => nameMarker(item.geometry.coordinates, item.properties.name, 'road-label'));
const siteNames = [];
const markers = new Map();
const siteLayers = L.layerGroup().addTo(map);
const siteRenderer = L.svg({ pane: 'sites' });
const buttons = new Map();

function popupContent(properties) {
  const container = document.createElement('div');
  const type = document.createElement('div'); type.className = 'popup-type'; type.textContent = properties.class_name;
  const title = document.createElement('strong'); title.className = 'popup-title'; title.textContent = properties.name;
  const facts = document.createElement('div'); facts.className = 'popup-meta';
  const status = document.createElement('span'); status.textContent = `状态 ${properties.status === 'alert' ? '异常' : '正常'}`;
  const count = document.createElement('span'); count.textContent = `业务量 ${properties.throughput} 件`;
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 不用于导航';
  facts.append(status, count); container.append(type, title, facts, note);
  return container;
}

function updateMarkers() {
  markers.forEach((marker, id) => {
    const active = id === selected;
    const alert = marker.feature.properties.status === 'alert';
    marker.setStyle({ radius: active ? 8 : 5.5, color: active ? '#792e23' : '#a74434',
      weight: active ? 3 : 2, fillColor: alert ? '#b64b37' : '#fffdf8', fillOpacity: 1 });
    buttons.get(id)?.setAttribute('aria-pressed', String(active));
  });
}

function preventOverlap() {
  const mapBox = map.getContainer().getBoundingClientRect();
  const occupied = [];
  const candidates = [
    ...siteNames.slice().sort((a, b) => Number(b.id === selected) - Number(a.id === selected)
      || b.throughput - a.throughput),
    ...roadNames.map(marker => ({ marker })),
  ];
  for (const item of candidates) {
    const span = item.marker.getElement()?.querySelector('span');
    if (!span) continue;
    span.style.visibility = '';
    const rect = span.getBoundingClientRect();
    const outside = rect.left < mapBox.left + 6 || rect.right > mapBox.right - 6
      || rect.top < mapBox.top + 6 || rect.bottom > mapBox.bottom - 6;
    const collision = occupied.some(box => rect.left < box.right + 4 && rect.right + 4 > box.left
      && rect.top < box.bottom + 4 && rect.bottom + 4 > box.top);
    const hidden = (item.id && !map.hasLayer(siteLayers)) || outside || collision;
    span.style.visibility = hidden ? 'hidden' : '';
    if (!hidden) occupied.push(rect);
  }
}

const sheetToggle = get('[data-testid="sheet-toggle"]');
function setSheet(expanded) {
  document.body.classList.toggle('sheet-collapsed', !expanded);
  sheetToggle.setAttribute('aria-expanded', String(expanded));
  sheetToggle.querySelector('.toggle-label').textContent = expanded ? '收起 −' : '展开 +';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    const marker = markers.get(selected);
    if (marker?.isPopupOpen()) marker.getPopup().update();
    preventOverlap();
  }));
}

function selectSite(id) {
  const marker = markers.get(id);
  if (!marker) return;
  if (!map.hasLayer(siteLayers)) {
    map.addLayer(siteLayers);
    get('[data-testid="toggle-sites"]').setAttribute('aria-pressed', 'true');
  }
  selected = id;
  updateMarkers();
  if (mobile.matches) setSheet(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    marker.openPopup();
    preventOverlap();
  }));
}

const list = get('[data-testid="site-list"]');
for (const item of sites.features) {
  const p = item.properties;
  const marker = L.circleMarker([item.geometry.coordinates[1], item.geometry.coordinates[0]], {
    pane: 'sites', renderer: siteRenderer, radius: 5.5, color: '#a74434', weight: 2, fillColor: '#fffdf8', fillOpacity: 1,
  }).bindPopup(popupContent(p), { autoPanPadding: [16, 16], maxWidth: 300 });
  marker.feature = item;
  marker.on('click', () => selectSite(p.site_id));
  siteLayers.addLayer(marker);
  markers.set(p.site_id, marker);
  siteNames.push({ marker: nameMarker(item.geometry.coordinates, p.name.replace(/（.*?）/, ''), 'site-label'),
    id: p.site_id, throughput: p.throughput });

  const li = document.createElement('li');
  const button = document.createElement('button'); button.type = 'button'; button.dataset.testid = `site-${p.site_id}`;
  button.setAttribute('aria-pressed', 'false');
  const dot = document.createElement('span'); dot.className = `site-dot${p.status === 'alert' ? ' alert' : ''}`;
  const copy = document.createElement('span'); copy.className = 'site-copy';
  const name = document.createElement('b'); name.textContent = p.name;
  const sub = document.createElement('small'); sub.textContent = `${p.class_name} · ${p.status === 'alert' ? '异常' : '正常'}`;
  const count = document.createElement('span'); count.className = 'site-value'; count.textContent = `${p.throughput} 件`;
  copy.append(name, sub); button.append(dot, copy, count); li.append(button); list.append(li);
  button.addEventListener('click', () => selectSite(p.site_id));
  buttons.set(p.site_id, button);
}
updateMarkers();

for (const element of document.querySelectorAll('[data-count="sites"]')) element.textContent = sites.features.length;
get('[data-count="route"]').textContent = routeIds.length;
get('[data-count="alerts"]').textContent = sites.features.filter(item => item.properties.status === 'alert').length;
sheetToggle.addEventListener('click', () => setSheet(document.body.classList.contains('sheet-collapsed')));
for (const [testid, layers] of [['toggle-route', routeLayers], ['toggle-sites', siteLayers]]) {
  const button = get(`[data-testid="${testid}"]`);
  button.addEventListener('click', () => {
    const show = !map.hasLayer(layers);
    if (show) map.addLayer(layers); else map.removeLayer(layers);
    button.setAttribute('aria-pressed', String(show));
    if (!show && layers === siteLayers) map.closePopup();
    preventOverlap();
  });
}

const bounds = L.latLngBounds(sites.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
const fit = () => map.fitBounds(bounds, { padding: mobile.matches ? [32, 72] : [70, 70], animate: false });
map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { passive: true });
map.on('moveend zoomend', preventOverlap);
map.on('resize', () => { if (!userMoved && !selected) fit(); });
mobile.addEventListener('change', () => setSheet(!mobile.matches));
fit();
setSheet(!mobile.matches);
get('[data-testid="ready"]').dataset.state = 'ready';
get('[data-testid="ready"]').textContent = '地图已就绪';
window.__streetAtlas = {
  map, bounds, selected: () => selected,
  layerState: () => ({ route: map.hasLayer(routeLayers), sites: map.hasLayer(siteLayers) }),
  markerBox: id => markers.get(id)?.getElement()?.getBoundingClientRect() ?? null,
};
