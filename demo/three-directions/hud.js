// Floating map HUD: a personalised legend and a north indicator.
//
// The legend is built from the same style object the map paints from (app.js
// passes the entries in), so a colour change cannot leave it describing a
// previous map. The compass is deliberately decorative: this demo is north-up
// and never rotates, so it states 000 degrees rather than pretending to be a
// bearing instrument.

const NS = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
};

function radialTicks(root, count, inner, outer, cls, width = 1) {
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 360 / count) * Math.PI / 180;
    root.append(svg('line', {
      x1: 32 + Math.sin(angle) * inner, y1: 32 - Math.cos(angle) * inner,
      x2: 32 + Math.sin(angle) * outer, y2: 32 - Math.cos(angle) * outer,
      class: cls, 'stroke-width': width, 'stroke-linecap': 'round',
    }));
  }
}

function needle(root, upClass, downClass) {
  root.append(svg('path', { d: 'M32 10 L37 32 L27 32 Z', class: upClass }));
  root.append(svg('path', { d: 'M32 54 L37 32 L27 32 Z', class: downClass }));
}

function compassSvg(kind) {
  const root = svg('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
  if (kind === 'seal') {
    root.append(svg('circle', { cx: 32, cy: 32, r: 28, class: 'compass-seal-outer' }));
    root.append(svg('circle', { cx: 32, cy: 32, r: 23, class: 'compass-ring' }));
    radialTicks(root, 8, 20, 24, 'compass-tick', 1.2);
    root.append(svg('path', { d: 'M32 12 L36.5 33 L32 29 L27.5 33 Z', class: 'compass-needle-n' }));
    root.append(svg('circle', { cx: 32, cy: 32, r: 2, class: 'compass-center' }));
  } else if (kind === 'dial') {
    root.append(svg('circle', { cx: 32, cy: 32, r: 28, class: 'compass-ring' }));
    radialTicks(root, 24, 23, 27, 'compass-tick', 0.8);
    root.append(svg('line', { x1: 32, y1: 6, x2: 32, y2: 58, class: 'compass-cross' }));
    root.append(svg('line', { x1: 6, y1: 32, x2: 58, y2: 32, class: 'compass-cross' }));
    needle(root, 'compass-needle-n', 'compass-needle-s');
    root.append(svg('circle', { cx: 32, cy: 32, r: 2.4, class: 'compass-center' }));
  } else {
    root.append(svg('circle', { cx: 32, cy: 32, r: 27, class: 'compass-ring' }));
    radialTicks(root, 4, 23, 27, 'compass-tick', 1.4);
    needle(root, 'compass-needle-n', 'compass-needle-s');
    root.append(svg('circle', { cx: 32, cy: 32, r: 1.8, class: 'compass-center' }));
  }
  return root;
}

const GROUPS = [
  { title: '线路与站点', kinds: ['line', 'dot', 'ring'] },
  { title: '业务量分级', kinds: ['area'] },
  { title: '无数据', kinds: ['missing'] },
];

function swatch(entry) {
  const mark = document.createElement('i');
  mark.classList.add(`swatch-${entry.kind}`);
  if (entry.kind === 'ring') {
    mark.style.border = `3px solid ${entry.color}`;
  } else if (entry.kind === 'missing') {
    // The no-data swatch is the same hatch the map paints, driven by the
    // direction's tokens rather than a generic grey gradient.
    mark.classList.add('missing-swatch');
    mark.style.setProperty('--swatch-ground', entry.color || '#e9e9e9');
    mark.style.setProperty('--swatch-hatch', entry.hatchColor || '#9aa3ac');
  } else if (entry.color) {
    mark.style.background = entry.color;
  }
  if (entry.kind === 'line' && entry.casing) mark.style.boxShadow = `0 0 0 1px ${entry.casing}`;
  return mark;
}

export function createHud() {
  const root = document.querySelector('[data-testid="map-hud"]');
  const compass = document.querySelector('[data-testid="compass"]');
  const disc = compass.querySelector('.compass-disc');
  const letter = compass.querySelector('.compass-n');
  const caption = compass.querySelector('.compass-caption');
  const list = document.querySelector('[data-testid="legend"]');
  const kicker = document.querySelector('[data-testid="hud-kicker"]');
  const title = document.querySelector('[data-testid="hud-title"]');
  const scale = document.querySelector('[data-testid="hud-scale"]');
  const foot = document.querySelector('[data-testid="hud-foot"]');
  const toggle = document.querySelector('[data-testid="hud-toggle"]');

  // The HUD now lives inside the map container. Without this, a click on the
  // legend or its toggle would also start a map drag / close a popup.
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);

  function setCollapsed(collapsed) {
    root.classList.toggle('hud-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? '展开图例' : '收起图例';
  }
  toggle.addEventListener('click', () => setCollapsed(!root.classList.contains('hud-collapsed')));

  function update(style, entries, context, measure) {
    const config = style.hud;
    root.dataset.variant = style.variant;
    compass.dataset.kind = config.compass.kind;
    disc.replaceChildren(compassSvg(config.compass.kind));
    letter.textContent = config.compass.label;
    caption.textContent = config.compass.caption;

    kicker.textContent = config.legend.kicker;
    title.textContent = config.legend.title;
    scale.textContent = measure === 'deviation'
      ? `发散色带 · 中心 ${config.legend.midpoint} · ${config.legend.unit}`
      : `${config.legend.direction} · ${config.legend.unit}`;
    foot.textContent = `断点 ${style.districts.breaks.join(' / ')} · ${context.missingCount} 个片区无数据`;

    list.replaceChildren();
    GROUPS.forEach(group => {
      const members = entries.filter(entry => group.kinds.includes(entry.kind));
      if (!members.length) return;
      const heading = document.createElement('li');
      heading.className = 'legend-group';
      // Every <li> owns an <i>: the legend-correspondence checker reads one on
      // each row, and a group header without one would break that measurement.
      heading.append(Object.assign(document.createElement('i'), { className: 'group-mark' }));
      const label = document.createElement('span');
      label.textContent = group.title;
      heading.append(label);
      list.append(heading);
      members.forEach(entry => {
        const item = document.createElement('li');
        if (entry.className) item.className = entry.className;
        item.append(swatch(entry), document.createTextNode(entry.text));
        if (entry.value !== undefined) {
          const value = document.createElement('span');
          value.className = 'legend-value';
          value.textContent = entry.value;
          item.append(value);
        }
        item.dataset.color = entry.color ?? '';
        list.append(item);
      });
    });
  }

  // A phone gives the map very little height: start collapsed there, expanded
  // on a desktop. The reader can always open it with the 44px control.
  setCollapsed(window.matchMedia('(max-width: 760px)').matches);
  return { update, setCollapsed,
    isCollapsed: () => root.classList.contains('hud-collapsed'),
    defaultCollapsed: () => window.matchMedia('(max-width: 760px)').matches };
}
