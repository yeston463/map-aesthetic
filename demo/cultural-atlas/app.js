// Cultural-facilities atlas — a second validation case for the map-aesthetic skill.
//
// The method is carried over from demo/street-atlas (real-road basemap, road casing,
// label screening, mobile bottom sheet) but the scenario is different: cultural
// facilities are categorical (not a delivery route) and use a graduated symbol by
// annual visits. The palette is deliberately NOT the paper/ink style of street-atlas,
// to show the method transfers without copying a look.
//
// Basemap data is the same real OSM snapshot as street-atlas; facilities are fictional
// (see data/facilities-provenance.json).

const get = selector => document.querySelector(selector);
const dataFor = async name => {
  const response = await fetch(`./data/${name}.geojson`);
  if (!response.ok) throw new Error(`无法读取 ${name} 数据`);
  return response.json();
};
const [context, facilities, labels] = await Promise.all(['context', 'facilities', 'labels'].map(dataFor));
const mobile = matchMedia('(max-width: 820px)');
let selected = null;
let userMoved = false;
const activeCategories = new Set(facilities.features.map(f => f.properties.category));

const radiusFor = visits => 6 + Math.sqrt(visits / 10000) * 0.55;

const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({ land: 240, buildings: 260, roads: 280, sites: 430, names: 450 })) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  if (name !== 'sites') pane.style.pointerEvents = 'none';
}
const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);
// Roads carry the geography but the facilities are the subject, so the basemap is kept
// a touch lighter than the delivery sample — enough hierarchy to read, not so loud it
// competes with the categorical fills.
draw('water', 'land', { fillColor: '#d2e2de', fillOpacity: .9, color: '#c2d4d0', weight: .5 });
draw('park', 'land', { fillColor: '#e0e8d6', fillOpacity: .8, color: '#cfd9c6', weight: .5 });
draw('building', 'buildings', { fillColor: '#e7e6df', fillOpacity: .7, color: '#deded4', opacity: .6, weight: .4 });
draw('minor-road', 'roads', { color: '#dcd8cd', weight: 3, opacity: .7, lineCap: 'round', lineJoin: 'round' });
draw('minor-road', 'roads', { color: '#fbfaf4', weight: 2, opacity: .95, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#cfc7b6', weight: 6.5, opacity: .9, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', { color: '#fdfcf6', weight: 4.6, opacity: 1, lineCap: 'round', lineJoin: 'round' });

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

function popupContent(p) {
  const container = document.createElement('div');
  const type = document.createElement('div'); type.className = 'popup-type'; type.textContent = p.category;
  const title = document.createElement('strong'); title.className = 'popup-title'; title.textContent = p.name;
  const facts = document.createElement('div'); facts.className = 'popup-meta';
  const visits = document.createElement('span'); visits.textContent = `年访问量 ${Math.round(p.annual_visits / 10000)} 万`;
  const year = document.createElement('span'); year.textContent = `开放于 ${p.year_opened}`;
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 未吸附真实地址';
  facts.append(visits, year); container.append(type, title, facts, note);
  return container;
}

function updateMarkers() {
  markers.forEach((marker, id) => {
    const p = marker.feature.properties;
    const active = id === selected;
    const visible = activeCategories.has(p.category);
    marker.setStyle({
      radius: radiusFor(p.annual_visits) + (active ? 2.5 : 0),
      color: active ? '#2b2f33' : '#fbfaf4', weight: active ? 3 : 2,
      fillColor: p.color, fillOpacity: 1,
    });
    if (!visible) marker.remove();
    else if (!map.hasLayer(marker)) marker.addTo(siteLayers);
    buttons.get(id)?.setAttribute('aria-pressed', String(active));
  });
}

function preventOverlap() {
  const mapBox = map.getContainer().getBoundingClientRect();
  const occupied = [];
  const candidates = [
    ...siteNames.slice().sort((a, b) => Number(b.id === selected) - Number(a.id === selected)
      || b.visits - a.visits),
    ...roadNames.map(marker => ({ marker })),
  ];
  for (const item of candidates) {
    const span = item.marker.getElement()?.querySelector('span');
    if (!span) continue;
    span.style.visibility = '';
    const rect = span.getBoundingClientRect();
    const outside = rect.left < mapBox.left + 6 || rect.right > mapBox.right - 6
      || rect.top < mapBox.top + 6 || rect.bottom > mapBox.bottom - 6;
    const collision = occupied.some(box => rect.left < box.right + 6 && rect.right + 6 > box.left
      && rect.top < box.bottom + 6 && rect.bottom + 6 > box.top);
    const hidden = (item.id && !activeCategories.has(item.category)) || outside || collision;
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
  if (!map.hasLayer(siteLayers)) map.addLayer(siteLayers);
  selected = id;
  updateMarkers();
  if (mobile.matches) setSheet(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    marker.openPopup();
    preventOverlap();
  }));
}

// Category color legend + size note. The map itself must state the encoding it uses,
// otherwise the reader has to cross-reference the side panel (a legend / map mismatch).
const key = get('.map-key');
key.innerHTML = '';
const cats = {};
facilities.features.forEach(f => { cats[f.properties.category] = f.properties.color; });
const sizeNote = document.createElement('span');
sizeNote.className = 'key-row';
sizeNote.innerHTML = '<i class="size-note"></i>圈越大，年访问量越高';
key.append(sizeNote);
const colorWrap = document.createElement('span');
colorWrap.className = 'key-colors';
for (const [cat, color] of Object.entries(cats)) {
  const row = document.createElement('span');
  row.className = 'key-cat';
  row.innerHTML = `<i class="cat-swatch" style="background:${color}"></i>${cat}`;
  colorWrap.append(row);
}
key.append(colorWrap);

// Side panel: category filter + facility list.
const catFilter = get('[data-testid="cat-filter"]');
const catCounts = {};
facilities.features.forEach(f => { catCounts[f.properties.category] = (catCounts[f.properties.category] || 0) + 1; });
for (const [cat, color] of Object.entries(catCounts)) {
  const li = document.createElement('li');
  const label = document.createElement('label');
  const box = document.createElement('input'); box.type = 'checkbox'; box.checked = true;
  box.dataset.category = cat; box.setAttribute('data-testid', `cat-${cat}`);
  const swatch = document.createElement('i'); swatch.className = 'cat-swatch'; swatch.style.background = color;
  const text = document.createElement('span'); text.textContent = `${cat} · ${catCounts[cat]}`;
  label.append(box, swatch, text); li.append(label); catFilter.append(li);
  box.addEventListener('change', () => {
    if (box.checked) activeCategories.add(cat); else activeCategories.delete(cat);
    updateMarkers(); preventOverlap();
  });
}

const list = get('[data-testid="site-list"]');
for (const item of facilities.features) {
  const p = item.properties;
  const marker = L.circleMarker([item.geometry.coordinates[1], item.geometry.coordinates[0]], {
    pane: 'sites', renderer: siteRenderer, radius: radiusFor(p.annual_visits),
    color: '#fbfaf4', weight: 2, fillColor: p.color, fillOpacity: 1,
  }).bindPopup(popupContent(p), { autoPanPadding: [16, 16], maxWidth: 300, className: 'facility-popup' });
  marker.feature = item;
  marker.on('click', () => selectSite(p.facility_id));
  siteLayers.addLayer(marker);
  markers.set(p.facility_id, marker);
  siteNames.push({ marker: nameMarker(item.geometry.coordinates, p.name, 'site-label'),
    id: p.facility_id, category: p.category, visits: p.annual_visits });

  const li = document.createElement('li');
  const button = document.createElement('button'); button.type = 'button'; button.dataset.testid = `site-${p.facility_id}`;
  button.setAttribute('aria-pressed', 'false');
  const dot = document.createElement('span'); dot.className = 'site-dot'; dot.style.background = p.color;
  const copy = document.createElement('span'); copy.className = 'site-copy';
  const name = document.createElement('b'); name.textContent = p.name;
  const sub = document.createElement('small'); sub.textContent = `${p.category} · ${Math.round(p.annual_visits / 10000)} 万`;
  const count = document.createElement('span'); count.className = 'site-value'; count.textContent = `${p.year_opened}`;
  copy.append(name, sub); button.append(dot, copy, count); li.append(button); list.append(li);
  button.addEventListener('click', () => selectSite(p.facility_id));
  buttons.set(p.facility_id, button);
}
updateMarkers();

for (const el of document.querySelectorAll('[data-count="sites"]')) el.textContent = facilities.features.length;
get('[data-count="cats"]').textContent = Object.keys(catCounts).length;
get('[data-count="visits"]').textContent = Math.round(facilities.features.reduce((s, f) => s + f.properties.annual_visits, 0) / 10000);
sheetToggle.addEventListener('click', () => setSheet(document.body.classList.contains('sheet-collapsed')));

// Road-label toggle (the one map-layer switch for this scenario).
const labelToggle = get('[data-testid="toggle-labels"]');
let labelsOn = true;
labelToggle.addEventListener('click', () => {
  labelsOn = !labelsOn;
  labelToggle.setAttribute('aria-pressed', String(labelsOn));
  roadNames.forEach(m => { const el = m.getElement(); if (el) el.style.display = labelsOn ? '' : 'none'; });
  preventOverlap();
});

const bounds = L.latLngBounds(facilities.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
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
window.__culturalAtlas = {
  map, bounds, selected: () => selected,
  categoryState: () => ({ active: [...activeCategories], total: facilities.features.length }),
  markerBox: id => markers.get(id)?.getElement()?.getBoundingClientRect() ?? null,
  layerCount: () => [...markers.values()].filter(m => map.hasLayer(m)).length,
};
