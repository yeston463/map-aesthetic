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

// The boundary line sits just above the fill; the glow sits just below the core.
export const panes = { districts: 410, boundary: 411, casing: 412, route: 420,
  glow: 435, sites: 440, labels: 450, selection: 460 };

export const basemap = {
  background: '#080c12',
  rasterReference: false,
  // The blocks sit just above the ground, so a street grid is legible without becoming a texture.
  // dE2000 5.28 from the ground; the grid reads as a surface on a near-black base.
  blocks: { fillColor: '#151d25', fillOpacity: 1, strokeColor: '#18222c', strokeWidth: 0.5 },
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

// The annotation system for a monitoring wall.
//
// A wall is read by a supervisor scanning for exceptions, so the labels are not a catalogue
// of places: they are a ranked shortlist. The biggest assets are named, the next tier is
// named only when there is room, and the smallest ones are dots without names.
//
// The consequence is that the *class* of an asset matters less than its *size*. A hub with a
// high throughput outranks a place name of any kind, because the hub is what the supervisor
// is looking for. This is the opposite of the guide, where the place names outrank the stops.

export const annotations = {
  tolerancePx: 1,
  classes: {
    // The area name is small and dim. On a wall it is chrome, not content.
    area: {
      visible: properties => properties.tier === 0,
      text: properties => properties.text,
      anchor: 'center',
      sizePx: 11,
      color: '#6d7d90',
      weight: 500,
      letterSpacing: '0.18em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(4, 8, 14, 0.95)',
      opacity: 0.9,
      className: properties => (properties.text === '江岸片区' ? 'anno-area' : ''),
    },
    // The river is named only where the reader is zoomed in enough to be reading the map.
    water: {
      visible: (properties, context) => context.metersPerPixel < 9,
      anchor: 'center',
      sizePx: 10.5,
      color: '#4f93ad',
      weight: 400,
      letterSpacing: '0.2em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(4, 8, 14, 0.95)',
    },
    // Street names are for the street-level view only. A wall is about assets, not streets.
    street: {
      visible: (properties, context) => {
        if (properties.tier === 1) return context.metersPerPixel < 4.2;
        return context.metersPerPixel < 2.2;
      },
      anchor: 'center',
      sizePx: 10,
      color: '#6b7b8d',
      weight: 400,
      letterSpacing: '0.06em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(4, 8, 14, 0.95)',
    },
    // The assets: named by how big they are.
    site: {
      visible: (properties, context) => {
        if (properties.siteId === context.selectedId) return true;
        const rank = properties.rank ?? 99;
        if (context.narrow) return rank < 4;
        // On a wide screen the top four assets are always named; the next four only when
        // the resolution is high enough that there is room between them.
        if (rank < 4) return true;
        return rank < 8 && context.metersPerPixel < 3.4;
      },
      // The wall shows the asset's short name and its throughput, because the number is what
      // the supervisor is actually reading.
      text: properties => {
        const short = properties.fullText.replace(/（.*?）/, '').replace(/配送站|集散点|驿站/g, '');
        return `${short} ${properties.throughput ?? ''}`.trim();
      },
      anchor: 'right',
      sizePx: 11,
      color: '#dce7f2',
      weight: 500,
      letterSpacing: '0.02em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(4, 8, 14, 0.95)',
      className: (properties, context) => (properties.siteId === context.selectedId
        ? 'anno-selected' : 'anno-hub'),
    },
  },
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
      { kind: 'missing', color: districts.missing.fillColor,
        hatchColor: districts.missing.hatchColor, text: districts.missing.label,
        value: `${context.missingCount} 个片区` },
    ];
  },
};

export const hud = {
  compass: { kind: 'dial', label: 'N', caption: '000° · 固定北向' },
  legend: {
    kicker: 'LEGEND // 数据口径', title: '业务量分级', unit: '件/日', midpoint: '均值',
    direction: '暗 → 亮 = 低 → 高',
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 168 };

export const ui = {
  '--hud-ground': 'rgba(12, 18, 26, 0.92)',
  '--hud-border': 'rgba(120, 150, 180, 0.24)',
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
