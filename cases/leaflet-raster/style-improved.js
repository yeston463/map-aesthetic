// Improved styling: every value below comes from the packaged theme contract or from a
// stated cartographic rule, so the change is auditable rather than a taste preference.
//
// Read this file as the "after" of IMPROVEMENT.patch.

import theme from '/skills/map-aesthetic/assets/themes/quiet-analysis.json' with { type: 'json' };

export const variant = 'improved';
export const label = `Improved · ${theme.name}`;

// Explicit stacking: context below business data, business data below text, selection
// above the data it emphasises. Leaflet panes are the only reliable way to get this.
export const panes = { districts: 410, casing: 420, route: 425, selection: 435, sites: 440, labels: 450 };

export const basemap = { opacity: 1, className: undefined, note: '本地栅格瓦片：道路与注记已烘焙进像素，不能按要素单独改色' };

const { area, missing, diverging, classes, selection, states, labels: labelTokens, sequential } = theme.cartography;

export const districts = {
  // Breaks come from the data and are stated in the legend, so a restyle cannot move a
  // district between classes.
  breaks: [400, 800, 1200],
  ramp: sequential,
  missing: { fillColor: missing.color, fillOpacity: missing.fillOpacity, pattern: missing.pattern, label: missing.label },
  fillOpacity: area.fillOpacity,
  boundary: { color: area.boundaryColor, weight: area.boundaryWidthPx },
  deviation: { ramp: diverging.ramp, midpointRule: diverging.midpoint },
};

export const route = {
  color: theme.cartography.route.color,
  weight: theme.cartography.route.widthPx,
  casingColor: theme.cartography.route.casingColor,
  casingWeight: theme.cartography.route.casingWidthPx,
  opacity: 1,
};

export const site = {
  // Class carries the fill, status carries the ring: selecting or alerting a site never
  // erases which kind of site it is.
  radiusBy: throughput => (throughput >= 1200 ? 9 : throughput >= 600 ? 7 : 5),
  fillBy: feature => classes.find(item => item.id === feature.properties.class_name)?.color ?? states.disabled,
  strokeColor: theme.cartography.site.strokeColor,
  strokeWidth: theme.cartography.site.strokeWidthPx,
  statusRing: { normal: theme.cartography.site.strokeColor, alert: theme.cartography.states.alert, alertWeight: 3 },
  selected: {
    keepClassVisible: selection.keepClassVisible,
    fillColor: null,
    strokeColor: selection.color,
    strokeWidth: selection.widthPx,
    haloColor: selection.haloColor,
    haloWidth: 4,
    radiusStep: 2,
  },
  hover: { color: states.hover, weight: 3 },
};

export const labels = {
  // Tier by ground resolution, not by zoom integer: overview keeps district names,
  // working view adds the named streets, detail adds the rest.
  visible: (properties, metersPerPixel) => metersPerPixel > 8 ? properties.tier === 0
    : metersPerPixel > 3 ? properties.tier <= 1 : true,
  declutter: true,
  sizePx: labelTokens.sizePx,
  color: theme.cartography.label,
  haloWidthPx: labelTokens.haloWidthPx,
  haloColor: theme.cartography.labelHalo,
  weight: 600,
  letterSpacing: '0.01em',
  // A long name is abbreviated with a documented rule, and the full name stays reachable
  // in the popup and the accessible label. Nothing is silently cut.
  shorten: name => (name.length > 8 ? name.replace(/（.*?）/, '').slice(0, 8) : name),
  full: name => name,
};

export const popup = { autoPan: true, autoPanPadding: [24, 24], offset: [0, -10], className: 'site-popup' };

// The legend is generated from the same objects the map paints from, so a colour change
// cannot leave the legend describing the previous map.
export const legend = {
  fromStyleObject: true,
  entries: measure => {
    const ramp = measure === 'deviation' ? districts.deviation.ramp : districts.ramp;
    const classes3 = districts.breaks.length;
    return [
      { kind: 'line', color: route.color, casing: route.casingColor, text: '主配送线' },
      ...classes.map(item => ({ kind: 'dot', color: item.color, text: item.id })),
      { kind: 'ring', color: site.statusRing.alert, text: '异常状态（外圈）' },
      ...(measure === 'deviation' ? ramp : ramp.slice(0, classes3 + 1)).map((color, index) => ({
        kind: 'area', color,
        text: measure === 'deviation' ? ['低于均值 40% 以上', '低于均值 5%–40%', '均值 ±5%', '高于均值 5%–40%', '高于均值 40% 以上'][index]
          : index === 0 ? `< ${districts.breaks[0]}`
          : index === classes3 ? `≥ ${districts.breaks[classes3 - 1]}`
          : `${districts.breaks[index - 1]} – ${districts.breaks[index]}`,
      })),
      { kind: 'missing', color: districts.missing.fillColor, text: districts.missing.label },
    ];
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 168 };

export const themeId = theme.id;
