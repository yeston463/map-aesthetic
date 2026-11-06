// Vector basemap for the three-directions demo.
//
// Why this exists
// ---------------
// The case ships a raster tile set, but the raster is only a *rendering* of geometry that the
// repository already holds in vector form: `data/context.geojson` carries the arterials, the
// local streets, the river and the city blocks, and `data/labels.geojson` carries the place
// names. In the raster those features are baked into pixels, so no direction can recolour a
// road without recolouring the text beside it.
//
// Both reference repositories solve this the same way:
//   - webgis-history styles a basemap through paint properties on separate layers, so each
//     visual identity owns its own colours (js/basemap.js);
//   - mythmap ships its basemap as vectors with a recorded provenance manifest, so the styling
//     is separable from the data (data/build_geography_basemap.py and its .sources.json).
//
// This module takes the second approach: the basemap is drawn from the case's own vectors, so
// every direction owns the ground, the blocks, the water, the road hierarchy and the place
// labels independently. The tile layer stays available as a reference raster, but it is no
// longer what the design rests on.
//
// The synthetic raster remains in the repository as the case's own artefact; this module
// reads the same GeoJSON the tile generator read, so the two show the same place.

const GROUP_KEYS = ['arterial', 'local', 'water', 'block'];

// A road's geometry is a thin line, so a style that wants a road to read as a street needs a
// casing under the core. Both are drawn by the same layer pair, so a direction only has to
// state the two colours and the two widths.
function roadLayers(features, pane) {
  return features.map(feature => ({
    feature,
    casing: L.polyline(feature.geometry.coordinates.map(([lon, lat]) => L.latLng(lat, lon)), {
      pane, lineCap: 'round', lineJoin: 'round', interactive: false,
    }),
    core: null,
  }));
}

export function createVectorBasemap(map, context, labels) {
  // The basemap gets panes of its own, below the business layers: the street grid is context,
  // and context belongs under the data. The order is fixed — ground, then streets, then the
  // place names — because it is the reading order of a map, not a stylistic choice.
  const panes = { blocks: 330, roads: 360, places: 430 };
  Object.entries(panes).forEach(([name, zIndex]) => {
    let pane = map.getPane(name);
    if (!pane) pane = map.createPane(name);
    pane.style.zIndex = zIndex;
    pane.style.pointerEvents = 'none';
  });

  const groups = Object.fromEntries(GROUP_KEYS.map(key => [key, []]));
  context.features.forEach(feature => {
    const kind = feature.properties.kind;
    if (groups[kind]) groups[kind].push(feature);
  });

  // Blocks and water are polygons; roads are lines with a casing.
  const blockLayers = groups.block.map(feature => L.polygon(
    feature.geometry.coordinates[0].map(([lon, lat]) => L.latLng(lat, lon)),
    { pane: 'blocks', interactive: false, fill: true, stroke: true }));
  const waterLayers = groups.water.map(feature => L.polygon(
    feature.geometry.coordinates[0].map(([lon, lat]) => L.latLng(lat, lon)),
    { pane: 'blocks', interactive: false, fill: true, stroke: true }));

  const arterials = roadLayers(groups.arterial, 'roads');
  const locals = roadLayers(groups.local, 'roads');

  // Place names that belong to the basemap rather than to a station: the area and the river
  // names, plus the street names that the raster used to bake in. The station labels are left
  // to the business label layer, so a direction can decide separately what to name a place and
  // what to name a hub.
  const placeFeatures = labels.features.filter(feature => !feature.properties.site_id);
  const placeLayers = placeFeatures.map(feature => {
    const name = feature.properties.name;
    const span = document.createElement('span');
    span.textContent = name;
    span.title = name;
    const marker = L.marker(L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]), {
      pane: 'places', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'map-label map-place-label', html: span }),
    });
    marker.properties = feature.properties;
    marker.name = name;
    return marker;
  });

  const all = [
    ...blockLayers.map(layer => ({ kind: 'block', layer })),
    ...waterLayers.map(layer => ({ kind: 'water', layer })),
    ...arterials.map(entry => ({ kind: 'arterial', layer: entry.casing, entry })),
    ...locals.map(entry => ({ kind: 'local', layer: entry.casing, entry })),
  ];

  const group = L.layerGroup(all.map(item => item.layer)).addTo(map);
  placeLayers.forEach(marker => marker.addTo(map));

  // The road cores live above the casings of the same road but below the casings of the other
  // class, so a district's minor streets do not run over its avenue.
  const cores = { arterial: [], local: [] };
  arterials.forEach(entry => {
    const core = L.polyline(entry.casing.getLatLngs(), {
      pane: 'roads', lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    entry.core = core; cores.arterial.push(core);
  });
  locals.forEach(entry => {
    const core = L.polyline(entry.casing.getLatLngs(), {
      pane: 'roads', lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    entry.core = core; cores.local.push(core);
  });
  cores.arterial.forEach(core => core.addTo(map));
  cores.local.forEach(core => core.addTo(map));

  return {
    group,
    blockLayers,
    waterLayers,
    arterials,
    locals,
    cores,
    placeLayers,
    counts: {
      blocks: blockLayers.length, water: waterLayers.length,
      arterials: arterials.length, locals: locals.length,
      places: placeLayers.length,
    },
  };
}

// Applying a direction's basemap style. Each direction states the ground colour, the block
// fill, the water fill, the road hierarchy (casing plus core, per class) and the place-label
// treatment. Nothing is inherited from the raster.
export function applyVectorBasemap(basemap, style, context) {
  const theme = style.basemap;
  basemap.blockLayers.forEach(layer => {
    layer.setStyle({
      fillColor: theme.blocks.fillColor,
      fillOpacity: theme.blocks.fillOpacity ?? 1,
      color: theme.blocks.strokeColor ?? theme.blocks.fillColor,
      weight: theme.blocks.strokeWidth ?? 0,
      opacity: theme.blocks.strokeOpacity ?? 1,
    });
  });

  basemap.waterLayers.forEach(layer => {
    layer.setStyle({
      fillColor: theme.water.fillColor,
      fillOpacity: theme.water.fillOpacity ?? 1,
      color: theme.water.strokeColor ?? theme.water.fillColor,
      weight: theme.water.strokeWidth ?? 0,
      opacity: theme.water.strokeOpacity ?? 1,
    });
  });

  const roads = { arterial: basemap.arterials, local: basemap.locals };
  Object.entries(roads).forEach(([kind, entries]) => {
    const road = theme.roads[kind];
    entries.forEach(entry => {
      entry.casing.setStyle({
        color: road.casingColor, weight: road.casingWeight, opacity: road.casingOpacity ?? 1,
        dashArray: road.casingDashArray || null,
      });
      entry.core.setStyle({
        color: road.coreColor, weight: road.coreWeight, opacity: road.coreOpacity ?? 1,
        dashArray: road.coreDashArray || null,
      });
    });
  });

  // The place names are the basemap's own labels: a direction decides whether a place is named
  // at all, and how.
  const labels = theme.placeLabels;
  basemap.placeLayers.forEach(marker => {
    const element = marker.getElement()?.querySelector('span');
    if (!element) return;
    const properties = marker.properties;
    const visible = labels.visible(properties, context.metersPerPixel);
    element.style.display = visible ? '' : 'none';
    if (!visible) return;
    element.style.fontSize = `${labels.sizePx}px`;
    element.style.color = labels.color;
    element.style.fontWeight = String(labels.weight);
    element.style.letterSpacing = labels.letterSpacing;
    element.style.fontFamily = labels.fontFamily || '';
    element.style.opacity = String(labels.opacity ?? 1);
    const halo = labels.haloWidthPx;
    element.style.textShadow = halo > 0
      ? [[0, halo], [0, -halo], [halo, 0], [-halo, 0]]
        .map(([x, y]) => `${x}px ${y}px 0 ${labels.haloColor}`).join(', ')
      : 'none';
    element.className = labels.tierClass
      ? `map-label-text ${labels.tierClass(properties)}` : 'map-label-text';
  });
}
