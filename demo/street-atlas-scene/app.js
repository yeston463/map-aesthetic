// Street operations scene. One app.js serves both variants (scene-a / scene-b);
// the variant only changes composition and styling, never data, extent or zoom.
const all = selector => [...document.querySelectorAll(selector)];
const get = selector => document.querySelector(selector);
const variant = document.body.dataset.variant === 'b' ? 'b' : 'a';
const STATUS = { normal: '正常', alert: '告警', pending: '待处理' };
const ZOOM_BAND = { overview: '概览', mid: '中距', detail: '近距' };
const ROUTE_COLORS = { 'R-01': '#9b3f2c', 'R-02': '#267367', 'R-03': '#a36901' };
const ROUTE_NAMES = { 'R-01': '北环线', 'R-02': '南环线', 'R-03': '西环线' };
const mq = matchMedia('(max-width: 820px)');
const desktop = () => !mq.matches;

const dataFor = async name => {
  const response = await fetch(`../data/${name}`);
  if (!response.ok) throw new Error(`无法读取 ${name} 数据`);
  return response.json();
};

const [context, sites, routes, zones, labels, slots] = await Promise.all([
  'context.geojson', 'sites.geojson', 'routes.geojson', 'zones.geojson', 'labels.geojson', 'slots.json',
].map(dataFor));

let slot = 'early';
let selectedSite = null;
let selectedRoute = null;
let selectedZone = null;
let userMoved = false;

const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 贡献者</a>');
for (const [name, z] of Object.entries({
  land: 240, buildings: 260, zones: 270, roads: 285, routeCasing: 380, routes: 400, stops: 440, badges: 450, names: 500,
})) {
  const pane = map.createPane(name);
  pane.style.zIndex = z;
  pane.style.pointerEvents = ['stops', 'badges', 'zones'].includes(name) ? '' : 'none';
}

const draw = (kind, pane, style) => L.geoJSON(context, {
  pane, interactive: false, filter: item => item.properties.kind === kind, style,
}).addTo(map);
draw('water', 'land', { fillColor: '#c6dbd5', fillOpacity: .94, color: '#b5ceca', weight: .5 });
draw('park', 'land', { fillColor: '#dae3d4', fillOpacity: .9, color: '#c7d6c6', weight: .5 });
draw('building', 'buildings', {
  fillColor: '#e2e0d4', fillOpacity: variant === 'b' ? .86 : .8, color: '#d8d8cd', opacity: .62, weight: .5,
});
draw('minor-road', 'roads', {
  color: '#d3cec1', weight: variant === 'b' ? 3.6 : 3.3, opacity: .72, lineCap: 'round', lineJoin: 'round',
});
draw('minor-road', 'roads', { color: '#fbfaf3', weight: variant === 'b' ? 2.2 : 2.15, opacity: 1, lineCap: 'round', lineJoin: 'round' });
draw('major-road', 'roads', {
  color: '#cbb99b', weight: variant === 'b' ? 7.4 : 7.2, opacity: .93, lineCap: 'round', lineJoin: 'round',
});
draw('major-road', 'roads', { color: '#fffdf5', weight: variant === 'b' ? 5.2 : 5.1, opacity: 1, lineCap: 'round', lineJoin: 'round' });

const haversineKm = (a, b) => {
  const dp = (b[0] - a[0]) * Math.PI / 180;
  const dl = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const routeStatus = id => slots[slot]?.route_status?.[id] ?? 'normal';
const casingColor = status => status === 'alert' ? '#f0d7d3' : status === 'pending' ? '#e9e6db' : '#fffdf5';
const routeRecords = new Map();
for (const feature of routes.features) {
  const props = feature.properties;
  const path = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  const casing = L.polyline(path, {
    pane: 'routeCasing', color: casingColor(routeStatus(props.route_id)),
    weight: variant === 'b' ? 9 : 8.6, opacity: .96, lineJoin: 'round', lineCap: 'round', interactive: false,
  });
  const core = L.polyline(path, {
    pane: 'routes', color: ROUTE_COLORS[props.route_id] ?? '#a9432f',
    weight: variant === 'b' ? 3.8 : 3.6, opacity: .98, lineJoin: 'round', lineCap: 'round', interactive: false,
  });
  routeRecords.set(props.route_id, { id: props.route_id, name: ROUTE_NAMES[props.route_id], stops: props.stops,
    casing, core, lengthKm: path.reduce((sum, p, i) => sum + (i ? haversineKm(path[i - 1], p) : 0), 0) });
}

/* zone data must exist before the zone layer is built */
const zoneRecords = new Map();
for (const feature of zones.features) {
  const props = feature.properties;
  zoneRecords.set(props.zone_id, {
    id: props.zone_id, name: props.name, role: props.role, accent: props.accent, anchor: props.anchor,
  });
}
const zonesLayerGroup = L.layerGroup().addTo(map);
const routesLayerGroup = L.layerGroup().addTo(map);
const siteLayers = L.layerGroup().addTo(map);
const labelsLayerGroup = L.layerGroup().addTo(map);

const zoneLayer = L.geoJSON(zones, { pane: 'zones', style: feature => ({
  fillColor: feature.properties.accent, fillOpacity: variant === 'b' ? .42 : .3,
  color: 'none', opacity: 0, weight: 0,
}) });
const zoneStrokeLayer = L.geoJSON(zones, { pane: 'zoneStroke', interactive: false, style: feature => ({
  color: feature.properties.accent, opacity: .55, weight: variant === 'b' ? 2 : 1.4, fill: false,
}) });
zoneLayer.eachLayer(layer => {
  const props = layer.feature.properties;
  layer.on('click', () => selectZone(props.zone_id));
  layer.on('mouseover', () => {
    layer.setStyle({ fillOpacity: .54 });
    zoneStrokeLayer.getLayers().find(l => l.feature.properties.zone_id === props.zone_id)
      ?.setStyle({ opacity: 1, weight: variant === 'b' ? 3 : 2.2 });
  });
  layer.on('mouseout', () => {
    layer.setStyle({ fillOpacity: variant === 'b' ? .42 : .3 });
    zoneStrokeLayer.getLayers().find(l => l.feature.properties.zone_id === props.zone_id)
      ?.setStyle({ opacity: .55, weight: variant === 'b' ? 2 : 1.4 });
  });
  zonesLayerGroup.addLayer(layer);
});
map.createPane('zoneStroke');
map.getPane('zoneStroke').style.zIndex = 335;
map.getPane('zoneStroke').style.pointerEvents = 'none';
zoneStrokeLayer.addTo(map);

const siteRenderer = L.svg({ pane: 'stops' });
const siteRecords = new Map();
const siteMarkers = new Map();
const siteLabels = new Map();
const siteButtons = new Map();
for (const item of sites.features) {
  const props = item.properties;
  const [lon, lat] = item.geometry.coordinates;
  const nearest = zones.features.reduce((out, feature) => {
    const anchor = feature.properties.anchor;
    const d = Math.hypot((lon - anchor[0]) * .854, lat - anchor[1]);
    return !out || d < out.d ? { d, id: feature.properties.zone_id } : out;
  }, null);
  siteRecords.set(props.site_id, { id: props.site_id, name: props.name, class_name: props.class_name,
    latlng: [lat, lon], routes: props.routes, zone: nearest.id });
}

const slotRoutes = () => slots[slot]?.routes ?? [];
const isActiveRoute = id => slotRoutes().includes(id);
const siteThroughput = record => slots[slot]?.throughputs?.[record.id] ?? 0;
const siteStatus = record => slots[slot]?.site_status?.[record.id] ?? 'normal';
const routeBadgeFor = record => {
  for (const id of slotRoutes()) {
    const order = routeRecords.get(id)?.stops.indexOf(record.id);
    if (order >= 0) return { route: id, order: order + 1 };
  }
  return null;
};

function popupContent(record) {
  const container = document.createElement('div');
  container.className = 'site-popup';
  const head = document.createElement('div'); head.className = 'popup-head';
  const type = document.createElement('span'); type.className = 'popup-type'; type.textContent = record.class_name;
  const status = document.createElement('span'); status.className = `popup-status is-${siteStatus(record)}`;
  status.textContent = STATUS[siteStatus(record)];
  head.append(type, status);
  const title = document.createElement('strong'); title.className = 'popup-title'; title.textContent = record.name;
  container.append(head, title);
  const routesBlock = document.createElement('div'); routesBlock.className = 'popup-routes';
  for (const id of record.routes) {
    const chip = document.createElement('span'); chip.className = 'popup-route';
    chip.textContent = `${id} · ${ROUTE_NAMES[id] ?? ''}`;
    routesBlock.append(chip);
  }
  container.append(routesBlock);
  const facts = document.createElement('dl'); facts.className = 'popup-facts';
  const amount = document.createElement('div');
  const amountKey = document.createElement('dt'); amountKey.textContent = '业务量';
  const amountValue = document.createElement('dd');
  const value = document.createElement('span'); value.textContent = siteThroughput(record);
  const unit = document.createElement('small'); unit.textContent = '件';
  amountValue.append(value, unit); amount.append(amountKey, amountValue);
  const zone = document.createElement('div');
  const zoneKey = document.createElement('dt'); zoneKey.textContent = '片区';
  const zoneValue = document.createElement('dd'); zoneValue.textContent = zoneRecords.get(record.zone)?.name ?? '—';
  zone.append(zoneKey, zoneValue);
  facts.append(amount, zone);
  container.append(facts);
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = '虚构示例 · 不用于导航';
  container.append(note);
  return container;
}

function makeLabel(latlng, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  const marker = L.marker(latlng, { pane: 'names', interactive: false, keyboard: false,
    icon: L.divIcon({ className, html: span, iconSize: [1, 1], iconAnchor: [0, 0] }) });
  marker.addTo(labelsLayerGroup);
  return { marker, span, text };
}
const siteOffsets = {
  n: 'translate(-50%, calc(-100% - 10px))',
  s: 'translate(-50%, 10px)',
  e: 'translate(12px, -50%)',
  w: 'translate(calc(-100% - 12px), -50%)',
  ne: 'translate(10px, calc(-100% - 6px))',
  nw: 'translate(calc(-100% - 10px), calc(-100% - 6px))',
};

/* markers and labels per slot */
function renderMarkers() {
  for (const [id, entry] of siteMarkers) {
    siteLayers.removeLayer(entry.marker);
    siteMarkers.delete(id);
  }
  for (const [id, label] of siteLabels) {
    labelsLayerGroup.removeLayer(label.marker);
    siteLabels.delete(id);
  }
  for (const record of siteRecords.values()) {
    const badge = routeBadgeFor(record);
    if (!badge) continue;
    const status = siteStatus(record);
    const marker = L.marker(record.latlng, {
      pane: 'badges', keyboard: true,
      icon: L.divIcon({
        className: `stop-badge is-route-${badge.route} is-status-${status}${variant === 'b' ? ' b' : ''}`,
        html: `<span class="visually-hidden">${record.name} · ${badge.route} 第 ${badge.order} 站</span><b aria-hidden="true">${badge.order}</b>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
      title: `${record.name}（${badge.route} · ${ROUTE_NAMES[badge.route]} 第 ${badge.order} 站）`,
    });
    marker.bindPopup(popupContent(record), {
      autoPanPaddingTopLeft: [16, 86], autoPanPaddingBottomRight: [16, 26], maxWidth: 292, offset: [0, -2],
    });
    marker.on('click', () => selectSite(record.id));
    siteLayers.addLayer(marker);
    siteMarkers.set(record.id, { marker, kind: 'badge' });
    const label = makeLabel(record.latlng, record.name.replace(/（.*?）/, ''), 'marker-label site');
    label.record = record;
    label.route = badge.route;
    siteLabels.set(record.id, label);
  }
  updateMarkers();
}

const zoneLabels = new Map();
const zoneAnchorInside = () => {
  const mapBox = map.getContainer().getBoundingClientRect();
  // Clamp each zone label anchor to the visible part of its polygon so the
  // label lives on the map instead of the hull edge outside the view.
  for (const [id, record] of zoneRecords) {
    const polygonFeature = zoneLayer.getLayers().find(layer => layer.feature.properties.zone_id === id);
    const polygon = polygonFeature?.feature?.geometry?.coordinates?.[0];
    if (!polygon) { zoneLabels.set(id, null); continue; }
    const projected = polygon.map(([lon, lat]) => map.latLngToContainerPoint([lat, lon]));
    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);
    const rect = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const clipped = {
      left: Math.max(rect.left, 0), right: Math.min(rect.right, mapBox.width),
      top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, mapBox.height),
    };
    if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) { zoneLabels.set(id, null); continue; }
    const point = map.containerPointToLatLng(L.point(
      (clipped.left + clipped.right) / 2, (clipped.top + clipped.bottom) / 2,
    ));
    zoneLabels.set(id, makeLabel([point.lat, point.lng], record.name, 'zone-label'));
  }
};
const roadLabels = new Map();
for (const item of labels.features) {
  const [lon, lat] = item.geometry.coordinates;
  const key = `${item.properties.name}-${item.geometry.coordinates.join(',')}`;
  roadLabels.set(key, makeLabel([lat, lon], item.properties.name,
    `road-label${['primary', 'secondary', 'tertiary'].includes(item.properties.highway) ? ' is-major' : ''}`));
}

const plainStyle = (record, active) => {
  const status = siteStatus(record);
  return {
    radius: active ? 7.4 : 5.6,
    color: status === 'alert' ? '#a9432f' : status === 'pending' ? '#8d8b7c' : '#b0ae9e',
    weight: active ? 2.6 : 1.6,
    fillColor: status === 'alert' ? '#a9432f' : '#fffdf7',
    fillOpacity: 1,
  };
};
const updateMarkers = () => {
  for (const [id, entry] of siteMarkers) {
    const el = entry.marker.getElement();
    if (entry.kind === 'badge') el?.classList.toggle('is-active', id === selectedSite);
    else entry.marker.setStyle(plainStyle(siteRecords.get(id), id === selectedSite));
  }
};

const labelPriority = label => {
  if (label.record?.id === selectedSite) return 0;
  if (label.route === selectedRoute) return 1;
  if (label.route) return 2;
  return 3;
};

const placeLabels = () => {
  const container = map.getContainer().getBoundingClientRect();
  const insets = !desktop() ? 6 : 15;
  const bounds = { left: container.left + insets, right: container.right - insets,
    top: container.top + insets, bottom: container.bottom - insets };
  const inside = box => box.left >= bounds.left && box.right <= bounds.right
    && box.top >= bounds.top && box.bottom <= bounds.bottom;
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const uiBoxes = [];
  for (const root of ['.map-bar', '.map-legend', '.leaflet-bottom.leaflet-right']) {
    const box = document.querySelector(root);
    if (box) uiBoxes.push(box.getBoundingClientRect());
  }
  const popup = document.querySelector('.leaflet-popup');
  if (popup) uiBoxes.push(popup.getBoundingClientRect());
  const occupied = [...uiBoxes];
  const sitesVisible = map.hasLayer(siteLayers);
  const markerBoxes = new Map();
  if (sitesVisible) for (const [id, entry] of siteMarkers) {
    const el = entry.marker.getElement();
    if (el) markerBoxes.set(id, el.getBoundingClientRect());
  }
  const candidates = !desktop() ? ['n', 's', 'e', 'w'] : ['n', 's', 'e', 'w', 'ne', 'nw'];
  const band = document.body.dataset.zoomBand ?? 'detail';
  for (const label of [...siteLabels.values()].sort((a, b) => labelPriority(a) - labelPriority(b))) {
    const anchor = markerBoxes.get(label.record?.id);
    const visible = sitesVisible && band !== 'overview';
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible || !anchor) continue;
    let placed = false;
    for (const key of candidates) {
      label.span.style.transform = siteOffsets[key];
      const box = label.span.getBoundingClientRect();
      const overlapsMarkers = [...markerBoxes.entries()].some(([rid, rect]) => rid !== label.record?.id && overlap(box, rect));
      const overlapsUi = occupied.some(rect => overlap(box, rect));
      if (!inside(box) || overlapsMarkers || overlapsUi) continue;
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
  for (const [id, label] of zoneLabels) {
    if (!label) continue;
    const visible = map.hasLayer(zonesLayerGroup) && (band === 'detail' || band === 'mid');
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible) continue;
    label.span.style.transform = 'translate(-50%, -50%)';
    const box = label.span.getBoundingClientRect();
    if (!inside(box) || occupied.some(rect => overlap(box, rect))) { label.span.style.visibility = 'hidden'; continue; }
    occupied.push(box);
  }
  for (const label of roadLabels.values()) {
    const visible = band !== 'overview';
    label.span.style.visibility = visible ? '' : 'hidden';
    if (!visible) continue;
    label.span.style.transform = 'translate(-50%, -50%)';
    const box = label.span.getBoundingClientRect();
    if (!inside(box) || occupied.some(rect => overlap(box, rect))) { label.span.style.visibility = 'hidden'; continue; }
    occupied.push(box);
  }
};

const detail = value => (value instanceof Error ? value.stack : value);

const createStatusChip = status => {
  const chip = document.createElement('span');
  chip.className = `status-chip is-${status}`;
  chip.textContent = STATUS[status];
  return chip;
};

const renderSlotButtons = () => {
  for (const button of all('.slot-group [data-slot]')) {
    const active = button.dataset.slot === slot;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
};

const renderRouteRows = () => {
  const container = get('[data-testid="route-list"]');
  if (!container) return;
  const list = document.createElement('ul'); list.className = 'route-list';
  for (const id of slots[slot].routes) {
    const record = routeRecords.get(id);
    const li = document.createElement('li'); li.className = 'route-row'; li.dataset.routeId = id;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.routeId = id;
    button.setAttribute('aria-pressed', String(id === selectedRoute));
    const dot = document.createElement('span'); dot.className = 'route-dot'; dot.style.background = ROUTE_COLORS[id] ?? '#a9432f';
    const copy = document.createElement('span'); copy.className = 'route-copy';
    const name = document.createElement('b'); name.textContent = `${id} ${record.name}`;
    const meta = document.createElement('small');
    meta.textContent = `${record.stops.length} 站 · ${record.lengthKm.toFixed(1)} km`;
    copy.append(name, meta);
    button.append(dot, copy, createStatusChip(routeStatus(id)));
    li.append(button);
    list.append(li);
    button.addEventListener('click', () => toggleRouteSelection(id));
  }
  container.replaceChildren(list);
};

const renderZoneRows = () => {
  const container = get('[data-testid="zone-list"]');
  if (!container) return;
  const loads = slots[slot]?.throughputs ?? {};
  const list = document.createElement('ul'); list.className = 'zone-list';
  for (const record of zoneRecords.values()) {
    const sites = [...siteRecords.values()].filter(site => site.zone === record.id);
    const stops = sites.length;
    const throughput = sites.reduce((sum, site) => sum + (loads[site.id] ?? 0), 0);
    const li = document.createElement('li'); li.className = 'zone-row'; li.dataset.zoneId = record.id;
    const dot = document.createElement('span'); dot.className = 'zone-dot'; dot.style.background = record.accent;
    const copy = document.createElement('span'); copy.className = 'zone-copy';
    const name = document.createElement('b'); name.textContent = record.name;
    const meta = document.createElement('small'); meta.textContent = `${record.role} · ${stops} 站`;
    copy.append(name, meta);
    const amount = document.createElement('span'); amount.className = 'zone-amount';
    const value = document.createElement('b'); value.textContent = throughput;
    const unit = document.createElement('em'); unit.textContent = '件';
    amount.append(value, unit);
    li.append(dot, copy, amount);
    li.setAttribute('aria-pressed', String(record.id === selectedZone));
    li.addEventListener('click', () => selectZone(record.id));
    list.append(li);
  }
  container.replaceChildren(list);
};

const renderSiteRows = () => {
  const container = get('[data-testid="site-list"]');
  if (!container) return;
  const list = document.createElement('ul'); list.className = 'site-list';
  for (const record of siteRecords.values()) {
    const badge = routeBadgeFor(record);
    if (!badge) continue;
    const li = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button'; button.dataset.testid = `site-${record.id}`;
    button.setAttribute('aria-pressed', String(record.id === selectedSite));
    const mark = document.createElement('span');
    mark.className = 'site-mark';
    mark.style.background = ROUTE_COLORS[badge.route] ?? '#a9432f';
    mark.textContent = badge.order;
    const copy = document.createElement('span'); copy.className = 'site-copy';
    const name = document.createElement('b'); name.textContent = record.name;
    const meta = document.createElement('small'); meta.textContent = `${record.class_name} · ${zoneRecords.get(record.zone)?.name ?? ''}`;
    copy.append(name, meta);
    const chip = document.createElement('span');
    chip.className = `site-status-chip is-${siteStatus(record)}`;
    chip.textContent = STATUS[siteStatus(record)];
    const amount = document.createElement('span'); amount.className = 'site-value';
    const value = document.createElement('b'); value.textContent = siteThroughput(record);
    const unit = document.createElement('em'); unit.textContent = '件';
    amount.append(value, unit);
    button.append(mark, copy, chip, amount);
    li.append(button);
    list.append(li);
    button.addEventListener('click', () => selectSite(record.id));
  }
  container.replaceChildren(list);
};

const setSheet = expanded => {
  const toggle = get('[data-testid="sheet-toggle"]');
  if (!toggle) return;
  document.body.classList.toggle('sheet-collapsed', !expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('.toggle-label').textContent = expanded ? '收起 −' : '展开 +';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    const marker = siteMarkers.get(selectedSite);
    if (marker?.marker.isPopupOpen()) marker.marker.getPopup().update();
    placeLabels();
  }));
};

const selectSite = id => {
  const entry = siteMarkers.get(id);
  if (!entry) return;
  if (!map.hasLayer(siteLayers)) {
    map.addLayer(siteLayers);
    get('[data-testid="toggle-sites"]')?.setAttribute('aria-pressed', 'true');
  }
  selectedSite = id;
  updateMarkers();
  for (const row of all('[data-testid^="site-"]')) {
    const on = row.dataset.testid === `site-${id}`;
    row.classList.toggle('is-active', on);
    row.setAttribute('aria-pressed', String(on));
  }
  if (!desktop()) setSheet(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    entry.marker.openPopup();
    placeLabels();
  }));
};

const selectZone = zoneId => {
  selectedZone = zoneId;
  for (const row of all('.zone-row')) {
    const on = row.dataset.zoneId === zoneId;
    row.classList.toggle('is-active', on);
    row.setAttribute('aria-pressed', String(on));
  }
};

const toggleRouteSelection = id => {
  selectedRoute = selectedRoute === id ? null : id;
  for (const row of all('.route-row')) {
    const on = row.dataset.routeId === selectedRoute && selectedRoute !== null;
    row.classList.toggle('is-selected', on);
    row.querySelector('button')?.setAttribute('aria-pressed', String(on));
  }
  for (const [rid, record] of routeRecords) {
    record.core.setStyle({ opacity: selectedRoute ? (selectedRoute === rid ? .99 : .3) : .98 });
    record.casing.setStyle({ opacity: selectedRoute ? (selectedRoute === rid ? .96 : .28) : .96 });
  }
  placeLabels();
};

const renderLegend = () => {
  const container = get('[data-testid="legend"]');
  if (!container) return;
  container.replaceChildren();
  const head = document.createElement('div'); head.className = 'legend-head';
  const id = document.createElement('b'); id.textContent = '示例图层';
  const note = document.createElement('span'); note.textContent = '线路 / 片区 / 站点均为虚构示例';
  head.append(id, note);
  const keys = document.createElement('ul'); keys.className = 'legend-keys';
  // Legend reflects what is currently on the map, not a fixed dictionary.
  const keysData = [];
  for (const id of slots[slot].routes) {
    const record = routeRecords.get(id);
    if (!record) continue;
    keysData.push([`${id} 线`, ROUTE_COLORS[id] ?? '#a9432f']);
  }
  keysData.push(['片区', '#8ea395']);
  if (all('.site-status-chip.is-alert').length) keysData.push(['告警', 'var(--alert)']);
  if (all('.site-status-chip.is-pending').length) keysData.push(['待处理', 'var(--pending)']);
  for (const [name, color] of keysData) {
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.className = `key${name === '片区' ? ' z' : ''}`;
    dot.style.background = color;
    li.append(dot, document.createTextNode(name));
    keys.append(li);
  }
  container.append(head, keys);
};

const applySlot = next => {
  slot = next;
  document.body.dataset.slot = slot;
  if (selectedRoute && !isActiveRoute(selectedRoute)) selectedRoute = null;
  renderSlotButtons();
  const windowEl = get('[data-slot-window]');
  if (windowEl) windowEl.textContent = slots[slot].window;
  for (const node of all('[data-slot-label]')) node.textContent = slots[slot].label;
  for (const node of all('[data-route-count]')) node.textContent = slotRoutes().length;
  const stopsTotal = slotRoutes().reduce((sum, id) => sum + (routeRecords.get(id)?.stops.length ?? 0), 0);
  for (const node of all('[data-route-stop-count]')) node.textContent = stopsTotal;
  renderRouteRows();
  renderZoneRows();
  renderSiteRows();
  renderLegend();
  renderMarkers();
  if (selectedSite && !siteMarkers.has(selectedSite)) selectedSite = null;
  placeLabels();
};

const toggleFor = (testid, layer, after) => {
  const button = get(`[data-testid="${testid}"]`);
  button?.addEventListener('click', () => {
    const show = !map.hasLayer(layer);
    if (show) map.addLayer(layer); else map.removeLayer(layer);
    button.setAttribute('aria-pressed', String(show));
    if (!show && layer === siteLayers) map.closePopup();
    if (!show && layer === siteLayers && selectedSite) selectedSite = null;
    if (!show && layer === zonesLayerGroup) hideZonesLabels();
    else if (!show && layer === zonesLayerGroup && selectedZone) selectedZone = null;
    after?.();
    requestAnimationFrame(() => requestAnimationFrame(placeLabels));
  });
};
toggleFor('toggle-zones', zonesLayerGroup);
toggleFor('toggle-routes', routesLayerGroup);
toggleFor('toggle-sites', siteLayers);

const sheetToggle = get('[data-testid="sheet-toggle"]');
sheetToggle?.addEventListener('click', () => setSheet(document.body.classList.contains('sheet-collapsed')));
mq.addEventListener('change', () => {
  setSheet(!mq.matches);
});

const hideZonesLabels = () => { for (const label of zoneLabels.values()) label?.span.style.setProperty('visibility', 'hidden'); };

map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { passive: true });
map.on('moveend', placeLabels);
map.on('zoomend', () => { placeLabels(); updateZoomBand(); });
map.on('resize', () => { if (!userMoved && !selectedSite) fit(); });

const ZOOM_BAND_GROUP = z => z < 14.8 ? 'overview' : z < 15.8 ? 'mid' : 'detail';
const updateZoomBand = () => {
  const band = ZOOM_BAND_GROUP(map.getZoom());
  document.body.dataset.zoomBand = band;
  for (const node of all('[data-band]')) node.dataset.band = band;
  for (const node of all('[data-band-label]')) node.textContent = ZOOM_BAND[band];
};

const bounds = L.latLngBounds(sites.features.map(item => [item.geometry.coordinates[1], item.geometry.coordinates[0]]));
const fit = () => map.fitBounds(bounds, { padding: !desktop() ? [32, 72] : [70, 70], animate: false });

applySlot('early');
fit();
// Zone label anchors need the fitted view before they can be clamped on screen.
zoneAnchorInside();
if (!mq.matches) {
  document.body.classList.remove('sheet-collapsed');
  const toggle = get('[data-testid="sheet-toggle"]');
  toggle?.setAttribute('aria-expanded', 'false');
} else setSheet(false);
get('[data-testid="ready"]').dataset.state = 'ready';
get('[data-testid="ready"]').textContent = '地图已就绪';
updateZoomBand();
placeLabels();

window.__sceneApp = {
  map, fit, bounds,
  slot: () => slot,
  setSlot: applySlot,
  selectedSite: () => selectedSite,
  selectedRoute: () => selectedRoute,
  layerState: () => ({ zones: map.hasLayer(zonesLayerGroup), routes: map.hasLayer(routesLayerGroup),
    sites: map.hasLayer(siteLayers) }),
  markerBox: id => siteMarkers.get(id)?.marker.getElement()?.getBoundingClientRect() ?? null,
  markerCount: () => siteMarkers.size,
  badgeCount: () => all('.stop-badge').length,
  labelCount: () => all('.marker-label span, .zone-label span, .road-label span')
    .filter(el => getComputedStyle(el).visibility !== 'hidden').length,
  zoomBand: () => document.body.dataset.zoomBand,
};
