// Direction 3 — 深色监控 (dark monitoring).
//
// The job: a control room. The base is dark so the signal colours can be luminous, the data
// hierarchy is explicit, and the accent colours are rationed: one cyan for the route and the
// selection, one amber for the alert state.
//
// The basemap is vector, which is what makes a true dark basemap possible. Inverting a raster
// flips the lightness relationship between the baked-in roads and the land, so the roads read
// as dark channels. With vectors the relation is chosen: the roads are drawn *lighter* than
// the ground, which is how a dark dashboard is actually supposed to work.

export const variant = 'dark-monitoring';
export const label = '深色监控';
export const intent = '值班大屏：近黑底色、明确的数据层级、克制的强调色。路线与选中用同一支青色，异常只用一支琥珀色。';

export const panes = { districts: 410, casing: 412, route: 420, sites: 440, labels: 450, selection: 460 };

export const basemap = {
  background: '#080c12',
  rasterReference: false,
  // The blocks sit just above the ground, so a street grid is legible without becoming a texture.
  blocks: { fillColor: '#101820', fillOpacity: 1, strokeColor: '#18222c', strokeWidth: 0.5 },
  // The river is the one place where the palette goes quiet and cool.
  // The river is a slightly lighter, cooler shape than the ground, so it reads as water
  // rather than as a gap. On a dark base a "darker" river disappears into the ground.
  water: { fillColor: '#123243', fillOpacity: 1, strokeColor: '#2a5f7d', strokeWidth: 1.2 },
  roads: {
    // Roads are lighter than the ground. This is the whole reason the basemap is vector now:
    // the raster could only be inverted, which put the roads below the land in lightness.
    arterial: { casingColor: '#26313d', casingWeight: 8, coreColor: '#4a5a6b', coreWeight: 5 },
    local: { casingColor: '#1a222c', casingWeight: 5, coreColor: '#2c3742', coreWeight: 3 },
  },
  placeLabels: {
    // Place names are dimmer than the station names, because on a monitoring screen the
    // locations matter less than the assets.
    visible: properties => properties.tier <= 1,
    sizePx: 11,
    color: '#7c8b9c',
    haloWidthPx: 2.5,
    haloColor: 'rgba(4, 8, 14, 0.95)',
    weight: 400,
    letterSpacing: '0.04em',
    tierClass: properties => (properties.tier === 0 ? 'tier-0' : ''),
  },
};

export const districts = {
  breaks: [400, 800, 1200],
  // On a dark base the ramp lightens toward the high end. The direction is stated here so it
  // cannot be bound to the wrong end of the scale.
  ramp: ['#12283f', '#194a6e', '#21749e', '#33a6cb'],
  deviation: { ramp: ['#8a3b3b', '#c07a6a', '#2b3644', '#3f8f9c', '#5ad0c9'], midpoint: 'mean' },
  fillOpacity: 0.44,
  boundary: { color: '#4fd0e8', weight: 0.7 },
  missing: { fillColor: '#1c242f', fillOpacity: 0.88, pattern: 'cross-hatch', hatchColor: '#7b8c9d', label: '无数据' },
};

export const route = {
  color: '#35c9e8', weight: 4, casingColor: '#04121a', casingWeight: 9, opacity: 1,
};

const CLASS_COLORS = {
  '配送站': '#4fc3f7',
  '集散点': '#7dd3a0',
  '驿站': '#c4a7f0',
};

export const site = {
  radiusBy: throughput => (throughput >= 1200 ? 9 : throughput >= 600 ? 7 : 5),
  fillBy: feature => CLASS_COLORS[feature.properties.class_name] ?? '#8b9aad',
  fillOpacity: 1,
  // A dark outline keeps a luminous dot from bleeding into the dark ground.
  strokeColor: '#0b1118',
  strokeWidth: 1.5,
  // Status is a ring, so the class colour underneath is never erased.
  statusRing: { alert: '#ffb340', alertWeight: 3 },
  selected: {
    keepClassVisible: true,
    fillColor: null,
    strokeColor: '#ffffff',
    strokeWidth: 3,
    haloColor: 'rgba(53, 201, 232, 0.38)',
    haloWidth: 5,
    radiusStep: 2,
  },
  hover: { color: '#ffffff', weight: 3 },
};

export const labels = {
  // The basemap already names the streets and the districts; only the twelve stations are added
  // here. A monitoring screen shows them all at the working scale, because they are the points
  // a supervisor scans for.
  visible: (properties, metersPerPixel, selectedId, context) => Boolean(properties.site_id)
    && metersPerPixel < 9
    && (context.narrow ? (selectedId ? properties.site_id === selectedId : context.rank < 4) : true),
  declutter: true,
  sizePx: 12,
  color: '#dce7f2',
  haloWidthPx: 2.5,
  haloColor: 'rgba(4, 8, 14, 0.95)',
  weight: 500,
  letterSpacing: '0.02em',
  shorten: name => (name.length > 9 ? name.replace(/（.*?）/, '').slice(0, 9) : name),
  tierClass: properties => (properties.tier === 0 ? 'tier-0' : ''),
};

export const popup = {
  autoPan: true, autoPanPadding: [24, 24], offset: [0, -8], className: 'popup-monitor',
  render(properties) {
    const element = document.createElement('div');
    element.className = 'site-popup-body';
    const badge = document.createElement('span');
    badge.className = `popup-badge ${properties.status === 'alert' ? 'alert' : 'normal'}`;
    badge.textContent = properties.status === 'alert' ? '异常' : '正常';
    const title = document.createElement('strong');
    title.textContent = properties.name;
    const facts = document.createElement('div');
    facts.className = 'popup-facts';
    const rows = [
      ['编号', properties.site_id],
      ['类型', properties.class_name],
      ['业务量', `${properties.throughput} 件`],
    ];
    rows.forEach(([key, value]) => {
      const row = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = key;
      const figure = document.createElement('b');
      figure.textContent = value;
      row.append(name, figure);
      facts.append(row);
    });
    element.append(badge, title, facts);
    return element;
  },
};

export const legend = {
  fromStyleObject: true,
  entries: (measure, context) => {
    const ramp = measure === 'deviation' ? districts.deviation.ramp : districts.ramp;
    const classCount = districts.breaks.length;
    const rangeText = index => (measure === 'deviation'
      ? ['低于均值 40% 以上', '低于均值 5%–40%', '均值 ±5%', '高于均值 5%–40%', '高于均值 40% 以上'][index]
      : index === 0 ? `< ${districts.breaks[0]}`
        : index === classCount ? `≥ ${districts.breaks[classCount - 1]}`
          : `${districts.breaks[index - 1]} – ${districts.breaks[index]}`);
    return [
      { kind: 'line', color: route.color, casing: route.casingColor, text: '主配送线' },
      ...Object.entries(CLASS_COLORS).map(([name, color]) => ({ kind: 'dot', color, text: name })),
      { kind: 'ring', color: site.statusRing.alert, text: '异常状态（外圈）' },
      ...(measure === 'deviation' ? ramp : ramp.slice(0, classCount + 1)).map((color, index) => ({
        kind: 'area', color, text: rangeText(index),
        value: measure === 'deviation' ? '' : `${context.classCounts[index] ?? 0} 个片区`,
      })),
      { kind: 'missing', color: districts.missing.fillColor, text: districts.missing.label,
        value: `${context.missingCount} 个片区` },
    ];
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 168 };

export const ui = {
  '--surface': '#0f151d',
  '--surface-2': '#131b24',
  '--page': '#070b11',
  '--ink': '#e6edf5',
  '--muted': '#8b9aad',
  '--line': '#1f2b38',
  '--accent': '#35c9e8',
  '--accent-ink': '#04121a',
  '--focus': '#56d8f0',
  '--alert': '#ffb340',
  '--radius': '6px',
  '--radius-sm': '4px',
  '--shadow': '0 2px 14px rgba(0, 0, 0, .55)',
  '--font-display': 'var(--font-ui)',
  '--font-num': '"SFMono-Regular", "Cascadia Mono", Consolas, monospace',
  '--sheet-height': '40vh',
};
