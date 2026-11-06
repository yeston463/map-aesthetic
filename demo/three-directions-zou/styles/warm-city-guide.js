// Direction 2 — 暖色城市导览 (warm city guide).
//
// The job: a reader who does not know this district. The map is a printed guide that happens
// to be pannable: warm paper, a route that reads like an itinerary, place names given room,
// and stations drawn as printed marks rather than status dots.
//
// The raster basemap is washed warm in one whole-raster filter. The baked-in labels go warm
// with it; the business layers below are in another pane and keep their own colours.
//
// The basemap is vector instead, so the paper is an actual ground colour rather than a filter
// over pixels: the blocks are warm off-white on cream, the river is a soft blue-green, and the
// streets are sepia hairlines that read as printed rules rather than as roads.

export const variant = 'warm-city-guide';
export const label = '暖色城市导览';
export const intent = '面向不熟悉片区的读者：暖白纸感、街区式注记、路线像一条行程。站点用形状而非状态色区分。';

export const panes = { districts: 410, casing: 412, route: 420, sites: 440, labels: 450, selection: 460 };

export const basemap = {
  background: '#f6efe1',
  rasterReference: false,
  // The blocks are barely lighter than the ground. A printed plan draws streets as rules and
  // leaves the blocks empty, so the fill stays almost at the paper colour.
  blocks: { fillColor: '#eee2cb', fillOpacity: 1, strokeColor: '#e0d2b6', strokeWidth: 0.8 },
  // The river is a pale blue-green, the one cool note on a warm page.
  water: { fillColor: '#bcd6cd', fillOpacity: 1, strokeColor: '#a2bdb2', strokeWidth: 1 },
  roads: {
    // Streets are sepia hairlines. An arterial gets a slightly heavier rule and a second,
    // finer rule beside it, which is how a printed plan marks a main road.
    arterial: { casingColor: '#c9b28c', casingWeight: 4.5, coreColor: '#fdf7ec', coreWeight: 2 },
    local: { casingColor: '#d8c6a6', casingWeight: 1.6, coreColor: '#d8c6a6', coreWeight: 0.8 },
  },
  placeLabels: {
    // A guide names things generously: the area name is a heading, the river is named, and the
    // smaller places are named too, because a reader looking for a place needs the names.
    visible: () => true,
    sizePx: 11.5,
    color: '#6b5942',
    haloWidthPx: 2,
    haloColor: 'rgba(246, 239, 225, 0.95)',
    weight: 400,
    // Letterspaced Chinese reads as set type rather than as an overlay.
    letterSpacing: '0.12em',
    tierClass: properties => (properties.tier === 0 ? 'tier-0' : ''),
  },
};

export const districts = {
  breaks: [400, 800, 1200],
  // A warm sequential ramp, like a printed thematic plate.
  ramp: ['#faf0dd', '#f2dfb6', '#e7c58e', '#d5a663'],
  deviation: { ramp: ['#9c4a2c', '#d99a72', '#f3ece0', '#bcc9b2', '#4f6b52'], midpoint: 'mean' },
  fillOpacity: 0.44,
  // A dashed, sepia-toned outline reads as a printed boundary rather than a data stroke.
  boundary: { color: '#9a6a3c', weight: 1, dashArray: '5 4' },
  missing: { fillColor: '#f2ead9', fillOpacity: 0.86, pattern: 'cross-hatch', hatchColor: '#c2ab88', label: '无数据' },
};

export const route = {
  // A terracotta itinerary line with a soft dark casing, so it reads over a paper base.
  color: '#b4442c', weight: 5, casingColor: '#fdf7ec', casingWeight: 10, opacity: 0.95,
};

const CLASS_COLORS = {
  '配送站': '#8c3f2b',
  '集散点': '#a8703a',
  '驿站': '#6f6a3c',
};

export const site = {
  radiusBy: throughput => (throughput >= 1200 ? 10 : throughput >= 600 ? 8 : 6),
  // A printed mark: hollow circles for ordinary stations, so the alert state can be a filled
  // dot in the same shape instead of a second colour code.
  fillBy: feature => (feature.properties.status === 'alert' ? '#b4442c' : '#fdf7ec'),
  fillOpacity: 1,
  // The class lives in the ring, the status lives in the fill: hollow means ordinary, solid
  // means alert, and the ring colour says which kind of station it is.
  strokeBy: feature => CLASS_COLORS[feature.properties.class_name] ?? '#8a7a63',
  strokeWeightBy: feature => (feature.properties.status === 'alert' ? 3 : 2.2),
  statusRing: { alert: '#b4442c', alertWeight: 3 },
  selected: {
    keepClassVisible: true,
    fillColor: null,
    strokeColor: '#6d2f1e',
    strokeWidth: 3,
    haloColor: 'rgba(180, 68, 44, 0.22)',
    haloWidth: 5,
    radiusStep: 2,
  },
  hover: { color: '#6d2f1e', weight: 3 },
  dotColor: feature => CLASS_COLORS[feature.properties.class_name] ?? '#8a7a63',
};

// The list marker always shows the class, so a hollow station is still identifiable in a list.
export function classColor(className) { return CLASS_COLORS[className] ?? '#8a7a63'; }

export const labels = {
  // The basemap already names the streets and the districts, so this layer adds only what the
  // basemap cannot say: the twelve stations. A guide names them all, because a reader looking
  // for a place needs to see what the places are called.
  visible: (properties, metersPerPixel, selectedId, context) => Boolean(properties.site_id)
    && (context.narrow ? (selectedId ? properties.site_id === selectedId : context.rank < 6) : true),
  declutter: true,
  sizePx: 12.5,
  color: '#4b3a29',
  haloWidthPx: 2.5,
  haloColor: 'rgba(253, 247, 236, 0.95)',
  weight: 400,
  letterSpacing: '0.06em',
  // Names are given room in a guide; only the parenthetical is dropped, never the identifier.
  shorten: name => name.replace(/（.*?）/, ''),
  tierClass: properties => (properties.tier === 0 ? 'tier-0' : ''),
};

export const popup = {
  autoPan: true, autoPanPadding: [28, 28], offset: [0, -12], className: 'popup-guide',
  render(properties) {
    const element = document.createElement('div');
    element.className = 'site-popup-body';
    const kicker = document.createElement('span');
    kicker.className = 'popup-kicker';
    kicker.textContent = properties.class_name;
    const title = document.createElement('strong');
    title.textContent = properties.name;
    const rule = document.createElement('div');
    rule.className = 'popup-rule';
    const facts = document.createElement('div');
    facts.className = 'popup-facts';
    const status = document.createElement('span');
    status.innerHTML = `状态 <b>${properties.status === 'alert' ? '异常' : '正常'}</b>`;
    const throughput = document.createElement('span');
    throughput.innerHTML = `业务量 <b>${properties.throughput}</b> 件`;
    const code = document.createElement('span');
    code.innerHTML = `编号 <b>${properties.site_id}</b>`;
    facts.append(status, throughput, code);
    element.append(kicker, title, rule, facts);
    return element;
  },
};

export const legend = {
  fromStyleObject: true,
  entries: measure => {
    const ramp = measure === 'deviation' ? districts.deviation.ramp : districts.ramp;
    const classCount = districts.breaks.length;
    return [
      { kind: 'line', color: route.color, casing: route.casingColor, text: '主配送线' },
      ...Object.entries(CLASS_COLORS).map(([name, color]) => ({
        kind: 'ring', color, text: `${name}（外圈）` })),
      { kind: 'dot', color: '#b4442c', text: '异常站点（实心）' },
      ...(measure === 'deviation' ? ramp : ramp.slice(0, classCount + 1)).map((color, index) => ({
        kind: 'area', color,
        text: measure === 'deviation'
          ? ['低于均值 40% 以上', '低于均值 5%–40%', '均值 ±5%', '高于均值 5%–40%', '高于均值 40% 以上'][index]
          : index === 0 ? `< ${districts.breaks[0]}`
            : index === classCount ? `≥ ${districts.breaks[classCount - 1]}`
              : `${districts.breaks[index - 1]} – ${districts.breaks[index]}`,
      })),
      { kind: 'missing', color: districts.missing.fillColor, text: districts.missing.label },
    ];
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 176 };

export const ui = {
  '--surface': '#fdf8ef',
  '--surface-2': '#f8f1e3',
  '--page': '#ece2d0',
  '--ink': '#3f3327',
  '--muted': '#8a7660',
  '--line': '#e0d3bd',
  '--accent': '#b4442c',
  '--accent-ink': '#fdf8ef',
  '--focus': '#8c3f2b',
  '--radius': '10px',
  '--radius-sm': '7px',
  '--shadow': '0 2px 10px rgba(92, 74, 56, .16)',
  '--font-display': '"Songti SC", "SimSun", Georgia, serif',
  '--font-num': '"SFMono-Regular", "Cascadia Mono", Consolas, monospace',
  '--sheet-height': '44vh',
};
