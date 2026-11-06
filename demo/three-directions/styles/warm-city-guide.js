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

// The boundary line sits just above the fill; the glow sits just below the core.
export const panes = { districts: 410, boundary: 411, casing: 412, route: 420,
  glow: 435, sites: 440, labels: 450, selection: 460 };

export const basemap = {
  background: '#f6efe1',
  rasterReference: false,
  // The blocks are barely lighter than the ground. A printed plan draws streets as rules and
  // leaves the blocks empty, so the fill stays almost at the paper colour.
  // dE2000 5.20 from the ground: the printed grid stays legible without shouting.
  blocks: { fillColor: '#e9ddc6', fillOpacity: 1, strokeColor: '#e0d2b6', strokeWidth: 0.8 },
  // The river is a pale blue-green, the one cool note on a warm page.
  water: { fillColor: '#bcd6cd', fillOpacity: 1, strokeColor: '#a2bdb2', strokeWidth: 1 },
  roads: {
    // Streets are sepia hairlines. An arterial gets a slightly heavier rule and a second,
    // finer rule beside it, which is how a printed plan marks a main road.
    arterial: { casingColor: '#c9b28c', casingWeight: 4.5, coreColor: '#fdf7ec', coreWeight: 2 },
    local: { casingColor: '#d8c6a6', casingWeight: 1.6, coreColor: '#d8c6a6', coreWeight: 0.8 },
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
  // dE2000 10.62 from the lowest ramp step and 6.49 from the block fill.
  missing: { fillColor: '#cdc2ac', fillOpacity: 0.86, pattern: 'cross-hatch', hatchColor: '#7c6748', label: '无数据' },
};

export const route = {
  // A terracotta itinerary line with a soft dark casing, so it reads over a paper base.
  color: '#b4442c', weight: 5, casingColor: '#fdf7ec', casingWeight: 10, opacity: 0.95,
};

const CLASS_COLORS = {
  '配送站': '#8c3f2b',
  // Darkened 13 steps so deuteranopia separation from the alert red clears dE2000 5.
  '集散点': '#9b632d',
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

// The annotation system for a printed guide.
//
// A guide names everything, because a reader who cannot see the name cannot go to the place.
// The consequence is that placement has to do the work of hierarchy: the area name is set
// like a heading, the street names are set like a legend, and the stations are set like the
// entries of an itinerary.
//
// The two ideas borrowed from the reference projects: Zou-Migration draws its place names as
// SVG text with `paint-order="stroke"`, so the paper-coloured outline sits under the ink and
// the glyph stays crisp; and it gives its ancestor names a small pill-shaped tag. Here the
// stations get a tag, because a guide treats them as entries rather than as dots.

const STATION_TAG = {
  // The tag is drawn as a rounded label with a hairline border, the way a guide marks a
  // stop on an itinerary.
  sizePx: 11,
  color: '#5a4632',
  weight: 400,
  letterSpacing: '0.04em',
  haloWidthPx: 0,
  haloColor: 'transparent',
};

export const annotations = {
  tolerancePx: 1,
  classes: {
    // The area name is a heading: it is set apart and it is never abbreviated.
    area: {
      visible: properties => properties.tier === 0,
      text: properties => properties.text,
      anchor: 'center',
      sizePx: 15,
      color: '#3f3327',
      weight: 600,
      letterSpacing: '0.24em',
      haloWidthPx: 3,
      haloColor: 'rgba(246, 239, 225, 0.96)',
      className: properties => (properties.text === '江岸片区' ? 'anno-area' : ''),
    },
    // The river is named in the water's own colour, so the name belongs to the shape.
    water: {
      visible: () => true,
      anchor: 'center',
      sizePx: 11,
      color: '#46756c',
      weight: 400,
      letterSpacing: '0.2em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(246, 239, 225, 0.96)',
    },
    // A guide names all the streets. The tier decides the size, not whether it appears.
    street: {
      visible: properties => properties.tier <= 1 || properties.tier === 2,
      anchor: 'center',
      sizePx: 11,
      color: '#6b5942',
      weight: 400,
      letterSpacing: '0.14em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(246, 239, 225, 0.96)',
      className: properties => (properties.tier === 1 ? 'anno-street-major' : ''),
    },
    // The stations are the entries of the itinerary, so they get the tag treatment.
    site: {
      visible: (properties, context) => {
        if (properties.siteId === context.selectedId) return true;
        // A phone cannot carry twelve tags; the guide keeps the largest stops plus the one
        // being asked about.
        if (context.narrow) return (properties.rank ?? 99) < 5;
        return true;
      },
      // A guide keeps the whole name. The parenthetical is dropped because it is a note
      // for the operator, not for the reader.
      text: properties => properties.fullText.replace(/（.*?）/, ''),
      anchor: 'right',
      ...STATION_TAG,
      className: (properties, context) => (properties.siteId === context.selectedId
        ? 'anno-tag anno-tag-selected' : 'anno-tag'),
    },
  },
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
  entries: (measure, context) => {
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
        value: measure === 'deviation' ? '' : `${context.classCounts[index] ?? 0} 个片区`,
      })),
      { kind: 'missing', color: districts.missing.fillColor,
        hatchColor: districts.missing.hatchColor, text: districts.missing.label,
        value: `${context.missingCount} 个片区` },
    ];
  },
};

export const hud = {
  compass: { kind: 'seal', label: '北', caption: '正北 · 印式罗盘' },
  legend: {
    kicker: '图例 · 行程注记', title: '片区业务量', unit: '件/日', midpoint: '均值',
    direction: '浅 → 深 = 低 → 高',
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 176 };

export const ui = {
  '--hud-ground': 'rgba(253, 248, 239, 0.94)',
  '--hud-border': 'rgba(92, 74, 56, 0.20)',
  '--surface': '#fdf8ef',
  '--surface-2': '#f8f1e3',
  '--page': '#ece2d0',
  '--ink': '#3f3327',
  // The muted tone read at 3.86:1 on the warm surface, under the 4.5:1 floor for
  // the switcher's inactive labels and the attribution. Darkened at the same hue
  // (scripts/solve_contrast.py in the skill gives 4.52:1).
  '--muted': '#7a6752',
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
