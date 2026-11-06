// Direction 1 — 浅色运营 (light operations).
//
// The job: watch a delivery network change. Status and selection are the signals; the map is
// the instrument panel. Everything that is not a signal is pushed back.
//
// The basemap is vector, drawn from the case's own geometry, so the ground, the blocks, the
// river, the road hierarchy and the place names are separate and each can be held down. The
// arterial is a white ribbon with a thin edge, the local streets are almost the colour of the
// ground, and the place names are grey and small. The route is the only loud line.

export const variant = 'light-operations';
export const label = '浅色运营';
export const intent = '值班视角：状态与选中是信号，底图与区域退到背景。矢量底图逐层压暗，路线是唯一的高对比线。';

// The boundary line sits just above the fill; the glow sits just below the core.
export const panes = { districts: 410, boundary: 411, casing: 415, route: 420,
  glow: 435, sites: 440, labels: 450, selection: 460 };

export const basemap = {
  background: '#f2f4f6',
  rasterReference: false,
  // Blocks are a shade above the ground: they give the eye a street grid to orient by without
  // ever competing with a data layer.
  // dE2000 5.26 from the ground: enough to read as a separate surface, still quiet.
  blocks: { fillColor: '#d9dcdf', fillOpacity: 1, strokeColor: '#e0e4e8', strokeWidth: 0.5 },
  // The river is the only cool element in an otherwise neutral base.
  water: { fillColor: '#d4e4ef', fillOpacity: 1, strokeColor: '#b8d2e2', strokeWidth: 0.8 },
  roads: {
    // An arterial is a white ribbon: the classic operations basemap keeps the main roads
    // brighter than the land and everything else quiet.
    arterial: { casingColor: '#c9cfd6', casingWeight: 9, coreColor: '#ffffff', coreWeight: 6 },
    // Local streets are barely separated from the ground. They are there for orientation, not
    // for reading.
    local: { casingColor: '#e2e6ea', casingWeight: 5, coreColor: '#fbfcfc', coreWeight: 3 },
  },
};

export const districts = {
  breaks: [400, 800, 1200],
  // Sequential, low-to-high, quiet enough to sit under the route and the sites.
  ramp: ['#e9f2f9', '#bfd8ec', '#84abd3', '#3b6c9f'],
  deviation: { ramp: ['#9c3b2e', '#d79a86', '#e8e6e0', '#a9c6de', '#3f6f9e'], midpoint: 'mean' },
  fillOpacity: 0.42,
  boundary: { color: '#5d84ab', weight: 0.9 },
  // dE2000 9.37 from the lowest ramp step, so "no data" cannot be read as the
  // lowest value even before the hatch is noticed.
  missing: { fillColor: '#bfc9d0', fillOpacity: 0.66, pattern: 'diagonal-hatch', hatchColor: '#6e7c8a', label: '无数据' },
};

export const route = {
  color: '#14558a', weight: 4, casingColor: '#ffffff', casingWeight: 8, opacity: 1,
};

const CLASS_COLORS = {
  '配送站': '#14558a',
  '集散点': '#2b8a6b',
  '驿站': '#7a5bb0',
};

export const site = {
  // The radius carries the throughput, so a hub reads as a hub without a label.
  radiusBy: throughput => (throughput >= 1200 ? 9 : throughput >= 600 ? 7 : 5),
  fillBy: feature => CLASS_COLORS[feature.properties.class_name] ?? '#6b7480',
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWidth: 1.2,
  // Status is a ring, so the class colour underneath is never erased.
  statusRing: { alert: '#d97706', alertWeight: 3 },
  selected: {
    keepClassVisible: true,
    fillColor: null,
    strokeColor: '#0b1f33',
    strokeWidth: 3,
    haloColor: 'rgba(20, 85, 138, 0.32)',
    haloWidth: 4,
    radiusStep: 2,
  },
  hover: { color: '#0b1f33', weight: 3 },
};

// The annotation system for a duty console.
//
// A console map names very little by default. The area name is always there because the
// reader has to know where they are; the river is there because it bounds the district; the
// street names arrive only when the reader zooms in far enough to be reading streets; and a
// station is named only when it is the one being asked about.
//
// The rule that matters: a label's class decides its priority. The area name outranks the
// river, the river outranks a street, and a street outranks a station that nobody asked
// about. When two of them want the same space, the higher-ranked one keeps it.
export const annotations = {
  tolerancePx: 1,
  classes: {
    // The area name: one, always, and set apart from the data. It is the one label a console
    // map cannot do without, on a phone as much as on a desktop.
    area: {
      visible: properties => properties.tier === 0,
      text: properties => properties.text,
      anchor: 'below',
      sizePx: 13,
      color: '#2c3a48',
      weight: 600,
      letterSpacing: '0.08em',
      haloWidthPx: 2.5,
      haloColor: 'rgba(242, 244, 246, 0.94)',
      className: properties => (properties.text === '江岸片区' ? 'anno-area' : ''),
    },
    // The river. A name written along the water would need a curved text path, so it sits
    // beside the shape instead, in the water's own cool colour.
    water: {
      visible: () => true,
      anchor: 'above',
      sizePx: 11,
      color: '#437591',
      weight: 400,
      letterSpacing: '0.16em',
      haloWidthPx: 2,
      haloColor: 'rgba(242, 244, 246, 0.92)',
    },
    // Street names: only at street scale, and only the first-tier ones before that.
    street: {
      visible: (properties, context) => {
        if (properties.tier === 1) return context.metersPerPixel < 5.5;
        return context.metersPerPixel < 2.6;
      },
      anchor: 'center',
      sizePx: 10.5,
      // 4.5:1 against the ground. The earlier grey read at 3.54:1, which is
      // under the floor for text this size (scripts/solve_contrast.py).
      color: '#67717b',
      weight: 400,
      letterSpacing: '0.04em',
      haloWidthPx: 2,
      haloColor: 'rgba(242, 244, 246, 0.94)',
    },
    // A station: named on demand, or when it is a hub and the map is wide enough.
    site: {
      visible: (properties, context) => {
        if (properties.siteId === context.selectedId) return true;
        if (context.narrow) return false;
        return (properties.rank ?? 99) < 3;
      },
      // The full name is long; the parenthesis is the part a console does not need, and the
      // rule is documented here rather than hidden in a helper.
      text: properties => (properties.fullText.length > 9
        ? properties.fullText.replace(/（.*?）/, '').slice(0, 9) : properties.fullText),
      anchor: 'right',
      sizePx: 11.5,
      color: '#24303c',
      weight: 500,
      letterSpacing: '0.01em',
      haloWidthPx: 2,
      haloColor: 'rgba(255, 255, 255, 0.94)',
      className: (properties, context) => (properties.siteId === context.selectedId ? 'anno-selected' : ''),
    },
  },
};

export const popup = {
  autoPan: true, autoPanPadding: [24, 24], offset: [0, -8], className: 'popup-ops',
  render(properties) {
    const element = document.createElement('div');
    element.className = 'site-popup-body';
    const title = document.createElement('strong');
    title.textContent = properties.name;
    const meta = document.createElement('p');
    meta.textContent = `${properties.class_name} · ${properties.status === 'alert' ? '异常' : '正常'} · ${properties.throughput} 件`;
    const id = document.createElement('small');
    id.textContent = `站点编号 ${properties.site_id}`;
    element.append(title, meta, id);
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
      ...Object.entries(CLASS_COLORS).map(([name, color]) => ({ kind: 'dot', color, text: name })),
      { kind: 'ring', color: site.statusRing.alert, text: '异常状态（外圈）' },
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

// The HUD is an instrument on the canvas, not a page beside it. Each direction
// owns the compass drawing, the legend wording and the unit line.
export const hud = {
  compass: { kind: 'rose', label: 'N', caption: '正北 000°' },
  legend: {
    kicker: 'LEGEND / 图例', title: '业务量分级', unit: '件/日', midpoint: '均值',
    direction: '浅 → 深 = 低 → 高',
  },
};

export const sheet = { collapsible: true, reserveBottomPx: 168 };

export const ui = {
  '--hud-ground': 'rgba(255, 255, 255, 0.92)',
  '--hud-border': 'rgba(27, 36, 48, 0.10)',
  '--surface': '#ffffff',
  '--surface-2': '#f7f9fa',
  '--page': '#e9edf1',
  '--ink': '#1b2430',
  '--muted': '#5f6b7a',
  '--line': '#d9e0e6',
  '--accent': '#14558a',
  '--accent-ink': '#ffffff',
  '--focus': '#0b5cad',
  '--radius': '4px',
  '--radius-sm': '3px',
  '--shadow': '0 1px 2px rgba(20, 32, 44, .10)',
  '--font-display': 'var(--font-ui)',
  '--font-num': '"SFMono-Regular", "Cascadia Mono", Consolas, monospace',
};
