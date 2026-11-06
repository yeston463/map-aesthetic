// The annotation engine.
//
// A label system answers four questions, and a map that skips any of them reads as broken:
//
//   1. What is a label?        — a class of thing, not a string.
//   2. When does it appear?    — at which scale, and under what condition.
//   3. Where does it sit?      — beside its feature, and what does it avoid?
//   4. What gives way?         — when two labels want the same space.
//
// The previous round had two separate label layers with a greedy overlap pass, which meant a
// place name and a station name competed in the same space with no priority. This module
// puts every label in one system with a class, a scale rule, an anchor and a priority.
//
// Two of the reference repositories show the techniques used here:
//
//   - Zou-Migration (public/js/app.js) draws labels as inline SVG text with
//     `paint-order="stroke"`, so the white outline sits under the ink and the glyph stays
//     crisp against any background. It also gives every ancestor a small pill-shaped name
//     tag, and a numbered badge beside the chain nodes.
//   - webgis-history keeps a layer panel that switches whole groups of features.
//
// The difference from a naive implementation: a label here is not "text at a point". It is an
// object with a class, an anchor position, a priority and a bounding box, and the engine
// places them as a set.

// The label classes. The order is the priority order: when two labels collide, the one whose
// class comes first keeps its place.
export const CLASS_ORDER = ['area', 'water', 'street', 'hub', 'site'];

// Every label the engine can draw. A direction decides which classes it shows and how; the
// engine decides how they are placed relative to each other.
export function createAnnotations(map, data, siteMeta) {
  const annotations = [];

  // The names of the water features, so that a place label can be recognised as the river's
  // own name rather than as a place.
  const waterNames = new Set(
    data.context.features
      .filter(feature => feature.properties.kind === 'water' && feature.properties.water)
      .map(feature => feature.properties.water));

  const push = spec => {
    const element = document.createElement('span');
    element.className = `anno anno-${spec.cls}`;
    element.textContent = spec.text;
    element.title = spec.title ?? spec.text;
    const marker = L.marker(spec.latlng, {
      pane: 'labels', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'anno-icon', html: element, iconSize: [0, 0], iconAnchor: [0, 0] }),
    });
    marker.annotation = { ...spec, element };
    annotations.push(marker);
    return marker;
  };

  // --- 底图注记：片区、水系、街巷 -------------------------------------------
  // The place names come from the case's own label file. The three non-station kinds are the
  // area, the river and the small places; the street names are attached to the roads.
  data.labels.features
    .filter(feature => !feature.properties.site_id)
    .forEach(feature => {
      const properties = feature.properties;
      // The river is labelled from the context layer, where it is a shape, so that the name
      // follows the water. The label file's copy of the same name would be a duplicate.
      if (waterNames.has(properties.name)) return;
      const tier = properties.tier ?? 2;
      // The river appears twice in the data: once as a shape in the context layer and once as
      // a name in the label file. The name that matches a water feature is the river's own
      // label, so it belongs to the water class; the rest are places and streets.
      const isWaterName = waterNames.has(properties.name);
      const cls = isWaterName ? 'water' : tier === 0 ? 'area' : 'street';
      push({
        cls,
        tier,
        text: properties.name,
        latlng: L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
        priority: CLASS_ORDER.indexOf(cls) * 100 - tier,
        anchor: 'center',
      });
    });

  // The river carries a name of its own, taken from the context layer rather than from the
  // label file, because the river is a shape and not a point.
  data.context.features
    .filter(feature => feature.properties.kind === 'water' && feature.properties.water)
    .forEach(feature => {
      const ring = feature.geometry.coordinates[0];
      // The label sits on the middle of the shape, which is where a reader expects the name
      // of a river to be, rather than on one of its vertices.
      const mean = ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
      const centre = [mean[0] / ring.length, mean[1] / ring.length];
      push({
        cls: 'water',
        tier: 0,
        text: feature.properties.water,
        latlng: L.latLng(centre[1], centre[0]),
        priority: CLASS_ORDER.indexOf('water') * 100,
        anchor: 'center',
      });
    });

  // --- 业务注记：站点 -------------------------------------------------------
  data.sites.features.forEach(feature => {
    const properties = feature.properties;
    const meta = siteMeta.get(properties.site_id) ?? {};
    push({
      cls: 'site',
      tier: properties.tier ?? 1,
      text: properties.name,
      fullText: properties.name,
      // The throughput travels with the label because a monitoring direction puts the number
      // next to the name; a guide direction ignores it.
      throughput: properties.throughput,
      status: properties.status,
      className: properties.class_name,
      latlng: L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
      priority: CLASS_ORDER.indexOf('site') * 100 - (meta.rank ?? 99),
      anchor: 'right',
      siteId: properties.site_id,
    });
  });

  // --- 同义注记合并 ---------------------------------------------------------
  //
  // The data names some places twice: a district name such as 纺织新村 and a station name
  // such as 纺织新村驿站 are the same place, and their label points are 37 metres apart. A
  // label system that does not notice this either prints the name twice or lets the two
  // labels fight over the same few pixels.
  //
  // So the two are merged here: the place label becomes an alias of the station, and only
  // the station keeps its own annotation. The place name is not lost — it stays on the
  // station's annotation, so a direction can still choose to print it.
  const sites = data.sites.features.map(feature => feature.properties);
  const aliasOf = new Map();
  data.labels.features
    .filter(feature => !feature.properties.site_id)
    .forEach(feature => {
      const name = feature.properties.name;
      const point = feature.geometry.coordinates;
      const match = sites.find(site => {
        // The station's name starts with the place name, or the place name is inside it.
        const stationName = site.name.replace(/（.*?）/, '');
        if (!stationName.includes(name)) return false;
        const sitePoint = data.sites.features
          .find(f => f.properties.site_id === site.site_id).geometry.coordinates;
        return Math.hypot(sitePoint[0] - point[0], sitePoint[1] - point[1]) < 0.0012;
      });
      if (match) aliasOf.set(name, match.site_id);
    });

  const kept = [];
  annotations.forEach(annotation => {
    const text = annotation.annotation.text;
    const siteId = aliasOf.get(text);
    if (!siteId) { kept.push(annotation); return; }
    // The place label is dropped, and its name is attached to the station's annotation.
    annotation.remove();
    const station = kept.find(item => item.annotation.siteId === siteId);
    if (station) {
      station.annotation.aliases = [...(station.annotation.aliases ?? []), text];
    }
  });

  return { annotations: kept, push, aliasOf };
}

// Apply a direction's annotation policy. The policy decides, per class:
//   - whether the class appears at all;
//   - at which scales it appears;
//   - how the text is styled;
//   - how it is placed relative to its feature.
//
// The engine then places the survivors against each other.
export function applyAnnotationPolicy(engine, policy, context) {
  const { metersPerPixel, narrow, selectedId, siteRank } = context;
  const annotations = engine.annotations;

  annotations.forEach(annotation => {
    const rule = policy.classes[annotation.annotation.cls];
    const element = annotation.annotation.element;

    if (!rule) {
      // A class the direction does not show is removed from the map. The element keeps its
      // box: an element with `display: none` measures as zero, and a label that measured as
      // zero could never be placed again.
      annotation.remove();
      annotation.annotation.suppressed = 'CLASS_NOT_SHOWN';
      return;
    }

    const properties = { ...annotation.annotation, rank: siteRank.get(annotation.annotation.siteId) };
    const visible = rule.visible(properties, { metersPerPixel, narrow, selectedId });
    if (!visible) {
      annotation.remove();
      annotation.annotation.suppressed = 'RULE_REJECTED';
      return;
    }

    const text = rule.text
      ? rule.text(properties, { metersPerPixel, narrow, selectedId }) : annotation.annotation.text;
    element.textContent = text;
    element.title = annotation.annotation.fullText ?? text;

    element.className = `anno anno-${annotation.annotation.cls}${rule.className ? ' ' + rule.className(properties, context) : ''}`;
    element.style.fontSize = `${rule.sizePx}px`;
    element.style.color = rule.color;
    element.style.fontWeight = String(rule.weight ?? 400);
    element.style.letterSpacing = rule.letterSpacing ?? '0em';
    element.style.fontFamily = rule.fontFamily || '';
    element.style.opacity = String(rule.opacity ?? 1);

    // The halo is the difference between a label that reads and a label that disappears into
    // the map. A direction states the halo in its own surface colour, so the outline always
    // separates the text from whatever is underneath it.
    const halo = rule.haloWidthPx ?? 0;
    element.style.textShadow = halo > 0
      ? [[0, halo], [0, -halo], [halo, 0], [-halo, 0], [halo, halo], [-halo, -halo]]
        .map(([x, y]) => `${x}px ${y}px 0 ${rule.haloColor}`).join(', ')
      : 'none';

    // The anchor decides where the text sits relative to its feature: centred on it, or
    // pushed to one side. A side anchor is offset by the transform below.
    //
    // A station name is offset by the radius of its own marker, so the text starts at the
    // edge of the dot instead of on top of it.
    const ownRadius = obstaclesRadius(annotation, context);
    element.style.transform = anchorTransform(rule.anchor ?? 'center', ownRadius);
    if (!map_has(engine, annotation)) annotation.addTo(engine.map);
    annotation.annotation.suppressed = null;
  });
}

function anchorTransform(anchor, radius = 0) {
  // A side anchor starts clear of the marker it belongs to.
  const gap = radius + 5;
  if (anchor === 'right') return `translate(${gap}px, -50%)`;
  if (anchor === 'left') return `translate(-100%, -50%) translateX(-${gap}px)`;
  if (anchor === 'above') return 'translate(-50%, -100%) translateY(-7px)';
  if (anchor === 'below') return 'translate(-50%, 0) translateY(7px)';
  return 'translate(-50%, -50%)';
}

// The radius of the marker a label belongs to, if it belongs to one.
function obstaclesRadius(annotation, context) {
  if (!annotation.annotation.siteId) return 0;
  const own = (context.markerBoxes ?? []).find(box => box.siteId === annotation.annotation.siteId);
  return own?.radius ?? 0;
}

function map_has(engine, annotation) {
  return engine.map.hasLayer(annotation);
}

// Place the surviving labels.
//
// Leaflet has no label collision engine, so this is an application-side approximation: the
// labels are ordered by priority and each one takes the space it needs, and a label that
// would overlap one already placed is dropped. This is the same greedy approach the case
// already used, but it now runs over one ordered set instead of a single class.
//
// The bounding box is measured from the rendered element, so the shape of the text is what
// counts, not an estimate.
export function placeAnnotations(engine, policy, context) {
  const { map } = engine;
  const visible = engine.annotations.filter(annotation => map.hasLayer(annotation));

  // Before anything is placed, every label is checked against the edges of the canvas. A
  // label whose preferred anchor would push it out of view is given the opposite anchor, and
  // one that still does not fit is dropped rather than clipped. This is what a label engine
  // has to know about and a plain overlay does not.
  const canvas = map.getContainer().getBoundingClientRect();
  visible.forEach(annotation => {
    const element = annotation.annotation.element;
    const rule = policy.classes[annotation.annotation.cls];
    const preferred = annotation.annotation.anchor ?? rule?.anchor ?? 'center';
    const opposite = { right: 'left', left: 'right', above: 'below', below: 'above' }[preferred];

    element.style.transform = anchorTransform(preferred, obstaclesRadius(annotation, context));
    const box = element.getBoundingClientRect();
    const overflowsRight = box.right > canvas.right - 2;
    const overflowsLeft = box.left < canvas.left + 2;
    const overflowsTop = box.top < canvas.top + 2;
    const overflowsBottom = box.bottom > canvas.bottom - 2;

    if ((overflowsRight || overflowsLeft) && opposite && opposite !== preferred) {
      element.style.transform = anchorTransform(opposite, obstaclesRadius(annotation, context));
      const moved = element.getBoundingClientRect();
      const nowOverflows = opposite === 'left'
        ? moved.left < canvas.left + 2 : moved.right > canvas.right - 2;
      if (!nowOverflows) {
        annotation.annotation.anchor = opposite;
        annotation.annotation.anchorShifted = true;
        return;
      }
    }
    // A label that sits on a marker may move to another side of it instead of being dropped.
    // The side anchors are tried in turn, and the label is given up on only when none of
    // them works. A place name that shifts a few pixels is better than a place name that is
    // missing.
    if (context.markerBoxes?.length && annotation.annotation.cls !== 'site') {
      const alternatives = { center: ['below', 'above', 'right', 'left'],
        below: ['above', 'right', 'left'], above: ['below', 'right', 'left'],
        right: ['left', 'above', 'below'], left: ['right', 'above', 'below'] }[preferred] ?? [];
      for (const alternative of alternatives) {
        element.style.transform = anchorTransform(alternative, obstaclesRadius(annotation, context));
        const moved = element.getBoundingClientRect();
        const covers = context.markerBoxes.some(obstacle => {
          if (annotation.annotation.siteId && annotation.annotation.siteId === obstacle.siteId) return false;
          const centreX = obstacle.centreX ?? (obstacle.left + obstacle.right) / 2;
          const centreY = obstacle.centreY ?? (obstacle.top + obstacle.bottom) / 2;
          const radius = obstacle.radius
            ?? Math.max(obstacle.right - obstacle.left, obstacle.bottom - obstacle.top) * 0.5;
          return centreX + radius > moved.left && centreX - radius < moved.right
            && centreY + radius > moved.top && centreY - radius < moved.bottom;
        });
        const leaves = moved.right <= canvas.right - 2 && moved.left >= canvas.left + 2
          && moved.bottom <= canvas.bottom - 2 && moved.top >= canvas.top + 2;
        if (!covers && leaves) {
          annotation.annotation.anchor = alternative;
          annotation.annotation.anchorShifted = true;
          return;
        }
      }
    }
    // A label that cannot fit in any direction is dropped by the placement pass below, which
    // removes it because its measured box lies outside the canvas.
    annotation.annotation.anchor = preferred;
    annotation.annotation.anchorShifted = false;
  });

  // A selected site keeps its name whatever the policy says: the reader asked for it.
  visible.sort((a, b) => {
    const aSelected = a.annotation.siteId && a.annotation.siteId === context.selectedId;
    const bSelected = b.annotation.siteId && b.annotation.siteId === context.selectedId;
    if (aSelected !== bSelected) return aSelected ? -1 : 1;
    if (a.annotation.priority !== b.annotation.priority) return a.annotation.priority - b.annotation.priority;
    const aText = a.annotation.element.textContent ?? '';
    const bText = b.annotation.element.textContent ?? '';
    return aText > bText ? 1 : -1;
  });

  const placed = [];
  const dropped = [];

  // The site markers are data, not text, but they still occupy space: a place name that lands
  // on top of a marker hides the thing the reader is looking at. The markers are collected as
  // obstacles, and a label that would cover one is moved or dropped.
  const obstacles = context.markerBoxes ?? [];

  visible.forEach(annotation => {
    const element = annotation.annotation.element;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      annotation.remove();
      return;
    }
    const box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };

    // A label that covers a marker gives way, unless the label belongs to that marker: a
    // station's own name is anchored beside its own dot and is allowed to touch it.
    //
    // The obstacle is the marker's *centre*, not its whole box. A circle marker's bounding
    // box is much larger than the dot, and treating the whole box as occupied would push
    // every nearby place name away from a station that is nowhere near it.
    const covering = obstacles.find(obstacle => {
      if (annotation.annotation.siteId && annotation.annotation.siteId === obstacle.siteId) return false;
      const centreX = obstacle.centreX ?? (obstacle.left + obstacle.right) / 2;
      const centreY = obstacle.centreY ?? (obstacle.top + obstacle.bottom) / 2;
      const radius = obstacle.radius
        ?? Math.max(obstacle.right - obstacle.left, obstacle.bottom - obstacle.top) * 0.5;
      return centreX + radius > box.left && centreX - radius < box.right
        && centreY + radius > box.top && centreY - radius < box.bottom;
    });
    if (covering) {
      annotation.remove();
      dropped.push({ text: annotation.annotation.element.textContent,
        cls: annotation.annotation.cls,
        reason: 'COVERS_A_SITE_MARKER' });
      return;
    }

    // A label is allowed to sit on its own feature. What it may not do is cover another
    // label, or cover the feature of a label that outranks it.
    const blocker = policy.avoid?.(annotation, placed);
    const collides = placed.some(other => overlaps(box, other.box, policy.tolerancePx ?? 1));
    // A label that leaves the canvas is a defect, not a style: it is clipped by the frame.
    const outside = box.left < canvas.left - 1 || box.right > canvas.right + 1
      || box.top < canvas.top - 1 || box.bottom > canvas.bottom + 1;

    if (collides || outside || (blocker && blocker.blocked)) {
      annotation.remove();
      dropped.push({ text: annotation.annotation.element.textContent,
        cls: annotation.annotation.cls,
        reason: outside ? 'OUTSIDE_CANVAS' : blocker?.reason ?? 'OVERLAPS_HIGHER_PRIORITY' });
      return;
    }
    placed.push({ box, annotation });
  });

  return { placed, dropped };
}

function overlaps(a, b, tolerance) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
}

// The engine needs the map, so it is attached after creation rather than passed in.
export function attachMap(engine, map) {
  engine.map = map;
  return engine;
}
