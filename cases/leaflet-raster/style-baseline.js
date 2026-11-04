// Baseline styling: what a plain front-end restyle of this application produces.
// Kept deliberately intact as the comparison point; the defects are the case.
//
// Read this file as the "before" of IMPROVEMENT.patch. Nothing here is a strawman:
// each choice below is the ordinary one an application developer makes when asked to
// "make the map look nicer" without a cartographic pass.

export const variant = 'baseline';
export const label = 'Baseline';

// No panes: everything lands in Leaflet's default overlay order, so the route,
// the site markers and the text compete for the same layer.
export const panes = { districts: null, route: null, casing: null, sites: null, labels: null };

export const basemap = { opacity: 1, className: undefined, note: '本地栅格瓦片，道路与注记已烘焙进像素' };

export const districts = {
  // Lowest class first, and a missing value falls into the same colour as the lowest
  // class, so "no data" reads as "smallest amount".
  breaks: [400, 800, 1200],
  ramp: ['#d9e7d7', '#a8cfc1', '#68ac95', '#175445'],
  missing: { fillColor: '#d9e7d7', fillOpacity: 0.85, label: '无数据' },
  fillOpacity: 0.85,
  boundary: { color: null, weight: 0 },
  deviation: { ramp: ['#175445', '#68ac95', '#d9e7d7'], midpoint: null },
};

export const route = { color: '#3388ff', weight: 3, casingColor: null, casingWeight: 0, opacity: 1 };

export const site = {
  // Status colour doubles as the only distinction, and it collides with the lowest
  // district class. Radius is constant, so a 1 840-item hub looks like a 290-item stop.
  radius: 5,
  fillBy: feature => (feature.properties.status === 'alert' ? '#c64040' : '#1c8b65'),
  strokeColor: null,
  strokeWidth: 0,
  selected: { fillColor: '#9c36c8', strokeColor: '#9c36c8', strokeWidth: 2, radius: 6 },
};

export const labels = {
  visible: () => true,
  declutter: false,
  sizePx: 12,
  color: '#333333',
  haloWidthPx: 0,
  haloColor: '#ffffff',
  weight: 400,
  letterSpacing: '0',
  shorten: name => name,
};

export const popup = { autoPan: true, autoPanPadding: [14, 14], offset: [0, -4], className: 'site-popup' };

// The baseline legend is written in CSS classes, so it can drift from what the map
// actually paints and nothing notices.
export const legend = {
  fromStyleObject: false,
  entries: () => [
    { kind: 'line', className: 'swatch-route', text: '主配送线' },
    { kind: 'dot', className: 'swatch-status-normal', text: '正常站点' },
    { kind: 'dot', className: 'swatch-status-alert', text: '异常站点' },
    { kind: 'area', className: 'swatch-class-1', text: '低业务量' },
    { kind: 'area', className: 'swatch-class-2', text: '中业务量' },
    { kind: 'area', className: 'swatch-class-3', text: '高业务量' },
  ],
};

export const sheet = { collapsible: false, reserveBottomPx: 0 };
