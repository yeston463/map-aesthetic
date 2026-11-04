// Unverified Mapbox GL JS v3 integration example. The runnable fixture uses MapLibre.
// Shared API patterns do not establish Mapbox compatibility or production readiness.
// Inject the actual SDK and project-specific insertion IDs; validate with its resources.

import { attachRestoration } from './restore.js';
import dayTheme from '../../skills/map-aesthetic/assets/themes/quiet-analysis.json' with { type: 'json' };
import nightTheme from '../../skills/map-aesthetic/assets/themes/night-operations.json' with { type: 'json' };

/**
 * 初始化 Mapbox GL JS 实例并绑定恢复机制
 *
 * @param {Object} options
 * @param {string} options.container - DOM 容器 ID
 * @param {string} options.accessToken - 真实有效且限制域名的 Mapbox Access Token
 * @param {'classic' | 'standard'} [options.styleFamily='classic'] - 样式家族类型
 * @param {Object} options.data - GeoJSON 业务数据源对象
 */
export function initMapboxMap({ sdk: mapboxgl = globalThis.mapboxgl, container, accessToken, styleFamily = 'classic', data, classicBefore }) {
  if (!mapboxgl?.Map) throw new Error('Provide the installed Mapbox GL JS SDK as sdk');
  if (!['classic', 'standard'].includes(styleFamily)) throw new Error('Unknown style family');
  if (styleFamily === 'classic' && !['day', 'night'].every(theme =>
    classicBefore?.[theme]?.zones && classicBefore?.[theme]?.route)) {
    throw new Error('Provide verified classicBefore day/night zones and route layer IDs from the actual styles');
  }
  if (!accessToken || accessToken === 'YOUR_MAPBOX_ACCESS_TOKEN') {
    throw new Error('Provide the target project access token through its existing configuration');
  }

  // 1. 设置 Access Token
  mapboxgl.accessToken = accessToken;

  // 2. 区分样式家族配置
  const CLASSIC_STYLES = {
    day: 'mapbox://styles/mapbox/light-v11',
    night: 'mapbox://styles/mapbox/dark-v11',
  };

  let currentTheme = 'day';
  const themes = { day: dayTheme, night: nightTheme };

  // 3. 构建业务要素集合
  const features = data.features.map((feature, index) => ({
    ...feature,
    properties: { ...feature.properties, uid: feature.id ?? feature.properties.uid ?? `u${index}` },
  }));

  const split = kind => ({
    type: 'FeatureCollection',
    features: features.filter(feature =>
      kind === 'zones' ? feature.geometry.type === 'Polygon'
      : kind === 'route' ? feature.geometry.type === 'LineString'
      : feature.geometry.type === 'Point'
    ),
  });

  const BREAKS = [400, 800, 1200];
  const CENTER = [121.4385, 31.2265];

  const initialStyle = styleFamily === 'standard'
    ? 'mapbox://styles/mapbox/standard'
    : CLASSIC_STYLES[currentTheme];

  const map = new mapboxgl.Map({
    container,
    style: initialStyle,
    center: CENTER,
    zoom: 14,
    attributionControl: false,
  });

  map.addControl(new mapboxgl.AttributionControl({
    customAttribution: '业务配送数据 · Mapbox 样式适配',
    compact: false,
  }));

  let selectedUid = null;
  let styleReady = false;

  // 4. 定义由业务应用拥有的数据源与图层
  // 在 Standard 样式家族中，使用 slot 属性（'bottom' / 'middle' / 'top'）；
  // 在 Classic 样式家族中，使用 before 指定图层顺序。
  const owned = {
    sources: [
      { id: 'zones', value: { type: 'geojson', data: split('zones'), promoteId: 'uid' } },
      { id: 'delivery-route', value: { type: 'geojson', data: split('route'), promoteId: 'uid' } },
      { id: 'stations', value: { type: 'geojson', data: split('stations'), promoteId: 'uid' } },
    ],
    layers: [
      {
        id: 'zone-fill',
        before: styleFamily === 'classic' ? () => classicBefore[currentTheme].zones : undefined,
        value: {
          id: 'zone-fill',
          type: 'fill',
          source: 'zones',
          ...(styleFamily === 'standard' ? { slot: 'bottom' } : {}),
          paint: { 'fill-color': '#888888', 'fill-opacity': 0.4 },
        },
      },
      {
        id: 'zone-boundary',
        before: styleFamily === 'classic' ? () => classicBefore[currentTheme].zones : undefined,
        value: {
          id: 'zone-boundary',
          type: 'line',
          source: 'zones',
          ...(styleFamily === 'standard' ? { slot: 'bottom' } : {}),
          paint: { 'line-color': '#888888', 'line-width': 1 },
        },
      },
      {
        id: 'route-casing',
        before: styleFamily === 'classic' ? () => classicBefore[currentTheme].route : undefined,
        value: {
          id: 'route-casing',
          type: 'line',
          source: 'delivery-route',
          ...(styleFamily === 'standard' ? { slot: 'middle' } : {}),
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7 },
        },
      },
      {
        id: 'route-line',
        before: styleFamily === 'classic' ? () => classicBefore[currentTheme].route : undefined,
        value: {
          id: 'route-line',
          type: 'line',
          source: 'delivery-route',
          ...(styleFamily === 'standard' ? { slot: 'middle' } : {}),
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#137c6c', 'line-width': 4 },
        },
      },
      {
        id: 'station-point',
        value: {
          id: 'station-point',
          type: 'circle',
          source: 'stations',
          ...(styleFamily === 'standard' ? { slot: 'top' } : {}),
          paint: {
            'circle-color': '#888888',
            'circle-radius': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        },
      },
      {
        id: 'station-selected',
        value: {
          id: 'station-selected',
          type: 'circle',
          source: 'stations',
          ...(styleFamily === 'standard' ? { slot: 'top' } : {}),
          paint: {
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3,
            'circle-radius': 0,
          },
        },
      },
    ],
  };

  const zoneColour = theme => {
    const ramp = theme.cartography.sequential.slice(0, 4);
    return ['case', ['==', ['get', 'value'], null], theme.cartography.missing.color,
      ['step', ['get', 'value'], ramp[0], BREAKS[0], ramp[1], BREAKS[1], ramp[2], BREAKS[2], ramp[3]]];
  };

  function applyTheme() {
    const theme = themes[currentTheme];
    const cartography = theme.cartography;
    restoration.applyPaint([
      { id: 'zone-fill', target: 'paint', values: { 'fill-color': zoneColour(theme), 'fill-opacity': cartography.area.fillOpacity } },
      { id: 'zone-boundary', target: 'paint', values: { 'line-color': cartography.area.boundaryColor, 'line-width': cartography.area.boundaryWidthPx } },
      { id: 'route-casing', target: 'paint', values: { 'line-color': cartography.route.casingColor, 'line-width': cartography.route.casingWidthPx } },
      { id: 'route-line', target: 'paint', values: { 'line-color': cartography.route.color, 'line-width': cartography.route.widthPx } },
      {
        id: 'station-point',
        target: 'paint',
        values: {
          'circle-color': ['match', ['get', 'class_name'], ...cartography.classes.flatMap(item => [item.id, item.color]), '#888888'],
          'circle-radius': ['step', ['get', 'throughput'], 5, 600, 7, 1200, 9],
          'circle-stroke-color': cartography.site.strokeColor,
          'circle-stroke-width': cartography.site.strokeWidthPx,
        },
      },
      {
        id: 'station-selected',
        target: 'paint',
        values: {
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], cartography.selection.color, 'rgba(0,0,0,0)'],
          'circle-stroke-width': cartography.selection.widthPx,
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 12, 0],
        },
      },
    ]);
  }

  function reapplySelection() {
    if (!selectedUid) return;
    map.setFeatureState({ source: 'stations', id: selectedUid }, { selected: true });
  }

  owned.onRestore = () => {
    styleReady = true;
    if (styleFamily === 'standard') map.setConfigProperty('basemap', 'lightPreset', currentTheme === 'night' ? 'night' : 'day');
    applyTheme();
    reapplySelection();
  };

  // 5. 绑定 style.load 恢复机制
  const restoration = attachRestoration(map, owned);

  map.on('click', 'station-point', event => {
    const feature = event.features?.[0];
    if (!feature) return;
    const uid = feature.properties.uid;
    if (selectedUid) map.removeFeatureState({ source: 'stations', id: selectedUid }, 'selected');
    selectedUid = uid;
    map.setFeatureState({ source: 'stations', id: uid }, { selected: true });
  });

  return {
    map,
    setTheme(newTheme) {
      if (!themes[newTheme]) return;
      currentTheme = newTheme;
      if (styleFamily === 'standard') {
        // Standard 样式家族支持直接配置 lightPreset，无需重新加载整个样式 JSON
        if (styleReady) {
          map.setConfigProperty('basemap', 'lightPreset', newTheme === 'night' ? 'night' : 'day');
          applyTheme();
        }
      } else {
        // Classic 样式家族调用 setStyle 会清空运行时图层，依赖 attachRestoration 恢复
        map.setStyle(CLASSIC_STYLES[newTheme]);
      }
    },
    destroy() {
      restoration.dispose();
      map.remove();
    },
  };
}
