import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import quiet from '../skills/map-aesthetic/assets/themes/quiet-analysis.json';
import night from '../skills/map-aesthetic/assets/themes/night-operations.json';
import publicGuide from '../skills/map-aesthetic/assets/themes/public-guide.json';
import { center, views, sites, route, river, parks, roads, buildings, labels } from './fixture.js';

const themes = { [quiet.id]: quiet, [night.id]: night, [publicGuide.id]: publicGuide };
// This local illustration maps a subset of the intent schema. It does not implement
// categorical/sequential legends, automatic collision avoidance, or other SDK adapters.
const query = id => document.querySelector(`[data-testid="${id}"]`);
const baseline = {
  ...quiet.cartography, land: '#e9e9e9', water: '#99bddd', park: '#a9d78d', road: '#ffffff',
  roadCasing: '#bbbbbb', boundary: '#777777', label: '#333333', labelHalo: '#ffffff',
  route: { color: '#3388ff', casingColor: '#3388ff', widthPx: 3, casingWidthPx: 3 },
  site: { color: '#3388ff', radiusPx: 6, strokeColor: '#3388ff', strokeWidthPx: 2 },
  selection: { color: '#9c36c8', haloColor: '#ffffff', widthPx: 3 },
};
let theme = quiet;
let selectedId = null;
let synchronizing = false;

function makeMap(id, after) {
  const map = L.map(`map-${id}`, {
    crs: L.CRS.Simple, minZoom: -6, maxZoom: -1, zoomSnap: 0.5, zoomDelta: 0.5,
    attributionControl: false, scrollWheelZoom: false, zoomAnimation: false,
    // ResizeObserver owns both maps together; independent window handlers can race.
    fadeAnimation: false, markerZoomAnimation: false, trackResize: false,
  }).setView(center, views.working);
  L.control.attribution({ prefix: '<a href="https://leafletjs.com/">Leaflet</a>' }).addAttribution('Synthetic local data').addTo(map);
  const paneOrder = { areas: 400, roads: 410, route: 420, selection: 430, sites: 440, labels: 450 };
  Object.entries(paneOrder).forEach(([name, zIndex]) => {
    map.createPane(name).style.zIndex = zIndex;
    if (name === 'labels') map.getPane(name).style.pointerEvents = 'none';
  });
  const polygon = points => L.polygon(points, { pane: 'areas', interactive: false }).addTo(map);
  const buildingLayers = buildings.map(polygon);
  const parkLayers = parks.map(polygon);
  const riverLayer = polygon(river);
  const roadLayers = roads.map(road => ({
    ...road,
    casing: L.polyline(road.points, { pane: 'roads', interactive: false }).addTo(map),
    line: L.polyline(road.points, { pane: 'roads', interactive: false }).addTo(map),
  }));
  const routeCasing = L.polyline(route, { pane: 'route', interactive: false }).addTo(map);
  const routeLine = L.polyline(route, { pane: 'route', interactive: false }).addTo(map);
  const halo = L.circleMarker(center, { pane: 'selection', interactive: false });
  const siteLayers = sites.map(site => {
    const popup = document.createElement('div');
    popup.className = 'site-popup';
    const heading = document.createElement('strong');
    heading.textContent = site.name;
    const description = document.createElement('p');
    description.textContent = `${site.kind} · ${site.note}`;
    const tag = document.createElement('small');
    tag.textContent = 'Synthetic site';
    popup.append(heading, description, tag);
    const marker = L.circleMarker(site.point, { pane: 'sites' })
      .bindPopup(popup, { autoPan: false, className: 'study-popup', closeButton: true })
      .on('click', () => selectSite(site.id)).addTo(map);
    return { site, marker };
  });
  const labelLayers = labels.map(label => {
    const text = document.createElement('span');
    text.textContent = label.name;
    const marker = L.marker(label.point, {
      pane: 'labels', interactive: false, keyboard: false,
      icon: L.divIcon({ className: `map-label ${label.district ? 'district-label' : ''}`, html: text, iconSize: [160, 20], iconAnchor: [80, 10] }),
    });
    return { label, marker };
  });
  const result = { id, after, map, buildingLayers, parkLayers, riverLayer, roadLayers, routeCasing, routeLine, halo, siteLayers, labelLayers };
  map.on('move zoom', () => {
    if (!synchronizing) {
      synchronizing = true;
      maps.forEach(other => { if (other !== result) other.map.setView(map.getCenter(), map.getZoom(), { animate: false }); });
      synchronizing = false;
    }
    updateScale();
  });
  return result;
}

const maps = [makeMap('before', false), makeMap('after', true)];

function setThemeVariables() {
  const panel = query('after-panel');
  Object.entries(theme.ui).forEach(([key, value]) => {
    const cssName = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    panel.style.setProperty(`--${cssName}`, typeof value === 'number' ? `${value}px` : value);
  });
  const c = theme.cartography;
  panel.style.setProperty('--route', c.route.color);
  panel.style.setProperty('--site', c.site.color);
  panel.style.setProperty('--selection', c.selection.color);
  panel.style.setProperty('--map-label', c.label);
  panel.style.setProperty('--map-halo', c.labelHalo);
  panel.style.setProperty('--map-label-size', `${c.labels.sizePx}px`);
  panel.style.setProperty('--map-halo-width', `${c.labels.haloWidthPx}px`);
  panel.dataset.theme = theme.id;
  query('theme-name').textContent = theme.name;
}

function styleMap(model) {
  const c = model.after ? theme.cartography : baseline;
  model.map.getContainer().style.backgroundColor = c.land;
  model.buildingLayers.forEach(layer => layer.setStyle({ stroke: false, fillColor: c.roadCasing, fillOpacity: model.after ? 0.32 : 0.6 }));
  model.parkLayers.forEach(layer => layer.setStyle({ color: c.boundary, weight: model.after ? 0.7 : 1, fillColor: c.park, fillOpacity: 1 }));
  model.riverLayer.setStyle({ color: c.water, weight: 1, fillColor: c.water, fillOpacity: 1 });
  model.roadLayers.forEach(road => {
    road.casing.setStyle({ color: c.roadCasing, weight: road.major ? 10 : 6, opacity: 1 });
    road.line.setStyle({ color: c.road, weight: road.major ? 7 : 4, opacity: 1 });
  });
  model.routeCasing.setStyle({ color: c.route.casingColor, weight: c.route.casingWidthPx, opacity: 1 });
  model.routeLine.setStyle({ color: c.route.color, weight: c.route.widthPx, opacity: 1 });
  styleSelection(model);
}

function styleSelection(model) {
  const c = model.after ? theme.cartography : baseline;
  model.siteLayers.forEach(({ site, marker }) => {
    const selected = site.id === selectedId;
    marker.setRadius(c.site.radiusPx + (selected ? 2 : 0)).setStyle({
      color: selected ? c.selection.color : c.site.strokeColor, weight: selected ? c.selection.widthPx : c.site.strokeWidthPx,
      fillColor: selected ? c.selection.color : c.site.color, fillOpacity: 1,
    });
    if (selected) {
      model.halo.setLatLng(site.point).setRadius(c.site.radiusPx + 7)
        .setStyle({ color: c.selection.haloColor, weight: 4, fillColor: c.selection.color, fillOpacity: 0.12 }).addTo(model.map);
    }
  });
  if (!selectedId) model.halo.remove();
}

function selectSite(id) {
  selectedId = id;
  const site = sites.find(item => item.id === id);
  if (site && !maps[1].map.getBounds().pad(-0.1).contains(site.point)) {
    maps[1].map.setView(site.point, maps[1].map.getZoom(), { animate: false });
  }
  maps.forEach(model => {
    styleSelection(model);
    model.siteLayers.forEach(item => {
      if (item.site.id === id) item.marker.openPopup();
      else item.marker.closePopup();
    });
  });
  document.querySelectorAll('.site-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.site === id)));
  const state = query('selected-state');
  state.dataset.selected = id || 'none';
  state.textContent = site ? `${site.name} selected` : 'No site selected';
  query('clear-selection').disabled = !id;
  updateScale();
}

function updateScale() {
  const map = maps[1].map;
  const metersPerPixel = map.distance(map.containerPointToLatLng([0, 100]), map.containerPointToLatLng([100, 100])) / 100;
  const thresholds = theme.cartography.scale;
  const scale = metersPerPixel > thresholds.overviewAboveMpp ? 'overview' : metersPerPixel < thresholds.detailBelowMpp ? 'detail' : 'working';
  let afterCount = 0;
  maps.forEach(model => {
    model.labelLayers.forEach(({ label, marker }, index) => {
      const maximum = scale === 'overview' ? 0 : scale === 'working' ? 1 : 2;
      const sparse = theme.cartography.labels.density === 'sparse' && label.priority === 2 && index % 2 === 0;
      const visible = !model.after || label.siteId === selectedId || (label.priority <= maximum && !sparse);
      if (visible) { marker.addTo(model.map); if (model.after) afterCount++; }
      else marker.remove();
    });
    const view = query(`view-${model.id}`);
    view.dataset.zoom = String(model.map.getZoom());
    view.dataset.center = `${model.map.getCenter().lat.toFixed(4)},${model.map.getCenter().lng.toFixed(4)}`;
    view.textContent = `${model.id}: ${view.dataset.center}; zoom ${view.dataset.zoom}`;
  });
  const output = query('scale-state');
  output.dataset.scale = scale;
  output.dataset.mpp = metersPerPixel.toFixed(2);
  output.textContent = `${scale[0].toUpperCase() + scale.slice(1)} · ${metersPerPixel.toFixed(1)} m/px`;
  query('label-count').textContent = `${afterCount} labels enabled`;
  query('label-count').dataset.count = String(afterCount);
  document.querySelectorAll('.scale-controls button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scale === scale)));
}

sites.forEach(site => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-button';
  button.dataset.site = site.id;
  button.dataset.testid = `site-${site.id}`;
  button.setAttribute('aria-pressed', 'false');
  const name = document.createElement('strong');
  name.textContent = site.name;
  const kind = document.createElement('span');
  kind.textContent = site.kind;
  button.append(name, kind);
  button.addEventListener('click', () => selectSite(site.id));
  query('site-list').append(button);
});
query('theme-select').addEventListener('change', event => {
  theme = themes[event.target.value];
  setThemeVariables();
  styleMap(maps[1]);
  updateScale();
});
document.querySelectorAll('.scale-controls button').forEach(button => button.addEventListener('click', () => {
  maps[1].map.setView(center, views[button.dataset.scale], { animate: false });
}));
query('reset-view').addEventListener('click', () => maps[1].map.setView(center, views.working, { animate: false }));
query('clear-selection').addEventListener('click', () => selectSite(null));

setThemeVariables();
maps.forEach(styleMap);
updateScale();
new ResizeObserver(() => {
  const activeCenter = maps[1].map.getCenter();
  const activeZoom = maps[1].map.getZoom();
  synchronizing = true;
  maps.forEach(model => {
    model.map.invalidateSize({ animate: false });
    model.map.setView(activeCenter, activeZoom, { animate: false });
  });
  const selectedSite = sites.find(site => site.id === selectedId);
  const clippedPopup = selectedSite && maps.some(model => {
    const popup = model.siteLayers.find(item => item.site.id === selectedId).marker.getPopup();
    if (!popup.isOpen()) return false;
    popup.update();
    const box = popup.getElement().getBoundingClientRect();
    const viewport = model.map.getContainer().getBoundingClientRect();
    return box.left < viewport.left || box.right > viewport.right || box.top < viewport.top || box.bottom > viewport.bottom;
  });
  if (clippedPopup) maps.forEach(model => model.map.setView(selectedSite.point, activeZoom, { animate: false }));
  synchronizing = false;
  updateScale();
}).observe(document.querySelector('.map-grid'));
query('demo-ready').dataset.state = 'ready';
query('demo-ready').textContent = 'Ready · local vectors';
