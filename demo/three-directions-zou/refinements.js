// Independent palettes for the existing synthetic map. The page takes inspiration from
// the reference site's editorial hierarchy; no reference code, imagery or data is used.
const themes = {
  'light-operations': {
    label: '清简运营',
    intent: '一条线路串起片区内的配送站点。选择站点，查看状态与业务量。',
    ui: { '--page': '#edf1ec', '--surface': '#f8f9f5', '--surface-2': '#e8eee9',
      '--ink': '#202c2b', '--muted': '#586b62', '--line': '#cbd6cc', '--accent': '#345f59',
      '--accent-ink': '#ffffff', '--focus': '#345f59', '--font-display': '"Noto Serif SC", "Songti SC", "SimSun", serif' },
    basemap: { background: '#e8eee8', blocks: { fillColor: '#dfe8df', fillOpacity: 1, strokeColor: '#d3dfd5', strokeWidth: .5 },
      water: { fillColor: '#c7dfd9', fillOpacity: 1, strokeColor: '#b6d1cb', strokeWidth: .8 },
      roads: { arterial: { casingColor: '#c4d2c8', casingWeight: 8, coreColor: '#f8faf6', coreWeight: 5.5 },
        local: { casingColor: '#d1ddd4', casingWeight: 4.5, coreColor: '#f0f5ef', coreWeight: 2.6 } },
      placeLabels: { color: '#54695e', haloColor: 'rgba(236,242,235,.95)', sizePx: 11.5 } },
    districts: { ramp: ['#e9f0e9', '#c9dfd2', '#91bdab', '#5d907d'], fillOpacity: .28,
      boundary: { color: '#77998a', weight: .65 },
      missing: { fillColor: '#e7ece5', fillOpacity: .45, hatchColor: '#b7c5b9', pattern: 'diagonal-hatch' } },
    labels: { visible: (properties, resolution, selectedId, context) => Boolean(properties.site_id)
      && (properties.site_id === selectedId || context.rank < (context.narrow ? 3 : 6)),
      color: '#334a40', haloColor: 'rgba(240,246,238,.96)', sizePx: 11.5 },
    route: { color: '#275d62', weight: 4, casingColor: '#f9fbf5', casingWeight: 7 },
  },
  'warm-city-guide': {
    label: '纸墨街区',
    intent: '从江岸出发，沿配送线路认识街区与站点。',
    ui: { '--page': '#f1efe9', '--surface': '#fbfaf6', '--surface-2': '#e9e6dd',
      '--ink': '#24221d', '--muted': '#645f55', '--line': '#d6d1c4', '--accent': '#9d2f22',
      '--accent-ink': '#ffffff', '--focus': '#9d2f22', '--font-display': '"Noto Serif SC", "Songti SC", "SimSun", serif' },
    basemap: { background: '#eae5d9', blocks: { fillColor: '#e2dccc', fillOpacity: 1, strokeColor: '#d5cebd', strokeWidth: .5 },
      water: { fillColor: '#c7d8d2', fillOpacity: 1, strokeColor: '#afc5bd', strokeWidth: .8 },
      roads: { arterial: { casingColor: '#c9bda9', casingWeight: 7.5, coreColor: '#f7f3e9', coreWeight: 5 },
        local: { casingColor: '#d2c8b7', casingWeight: 4, coreColor: '#f2eee4', coreWeight: 2.5 } },
      placeLabels: { color: '#6c6255', haloColor: 'rgba(244,240,230,.96)', sizePx: 11.5, letterSpacing: '.04em' } },
    districts: { ramp: ['#f0ede6', '#e3d8c6', '#cfbda5', '#b69e80'], fillOpacity: .28,
      boundary: { color: '#aa9982', weight: .65 },
      missing: { fillColor: '#ebe7dd', fillOpacity: .4, hatchColor: '#b8b1a0', pattern: 'diagonal-hatch' } },
    route: { color: '#a73a2d', weight: 4.2, casingColor: '#f8f3e8', casingWeight: 7.5 },
  },
  'dark-monitoring': {
    label: '墨金夜图',
    intent: '关注站点状态与配送线路，异常通过外圈标记。',
    ui: { '--page': '#101a1d', '--surface': '#192629', '--surface-2': '#213033',
      '--ink': '#edf0e8', '--muted': '#adbdb5', '--line': '#3a504c', '--accent': '#e1bd7c',
      '--accent-ink': '#17201f', '--focus': '#ffe0a7', '--alert': '#ffb87b',
      '--font-display': '"Noto Serif SC", "Songti SC", "SimSun", serif' },
    basemap: { background: '#111b1c', blocks: { fillColor: '#1b2a29', fillOpacity: 1, strokeColor: '#273c38', strokeWidth: .5 },
      water: { fillColor: '#243d40', fillOpacity: 1, strokeColor: '#3a5a5b', strokeWidth: .8 },
      roads: { arterial: { casingColor: '#344b46', casingWeight: 8, coreColor: '#70847a', coreWeight: 4.5 },
        local: { casingColor: '#263a36', casingWeight: 5, coreColor: '#465b53', coreWeight: 2.7 } },
      placeLabels: { color: '#a8b9ad', haloColor: 'rgba(17,27,28,.96)', sizePx: 11.5 } },
    districts: { ramp: ['#263d37', '#35594d', '#4c7662', '#719a7d'], fillOpacity: .25,
      boundary: { color: '#6b8a79', weight: .6 },
      missing: { fillColor: '#263632', fillOpacity: .42, hatchColor: '#71857a', pattern: 'diagonal-hatch' } },
    route: { color: '#dfb972', weight: 4, casingColor: '#101b1b', casingWeight: 8 },
  },
};

export function refine(original, id) {
  const next = themes[id];
  Object.assign(original.ui, next.ui);
  const base = original.basemap;
  Object.assign(base, { background: next.basemap.background });
  for (const key of ['blocks', 'water', 'placeLabels']) Object.assign(base[key], next.basemap[key]);
  for (const key of ['arterial', 'local']) Object.assign(base.roads[key], next.basemap.roads[key]);
  Object.assign(original.districts, { ramp: next.districts.ramp, fillOpacity: next.districts.fillOpacity,
    boundary: next.districts.boundary });
  Object.assign(original.districts.missing, next.districts.missing);
  if (next.labels) Object.assign(original.labels, next.labels);
  Object.assign(original.route, next.route);
  return { ...original, label: next.label, intent: next.intent };
}
