// Restoration for a style that can be replaced at runtime.
//
// setStyle() drops sources and layers added after the initial load, so anything the
// application owns has to come back on every style.load. This module is written against
// the parts of the API that MapLibre GL JS and Mapbox GL JS share, and it is the piece
// the vector-style case actually exercises.
//
// It is deliberately defensive about ordering and duplicates: a repeated style event
// must not add a layer twice, and a layer must not be added before its source exists.

export function attachRestoration(map, definitions) {
  let disposed = false;
  const counters = { styleLoads: 0, sourcesAdded: 0, layersAdded: 0, skippedExisting: 0, restyles: 0 };

  function addSources() {
    definitions.sources.forEach(definition => {
      if (map.getSource(definition.id)) {
        counters.skippedExisting += 1;
        return;
      }
      map.addSource(definition.id, definition.value);
      counters.sourcesAdded += 1;
    });
  }

  function addLayers() {
    definitions.layers.forEach(definition => {
      if (map.getLayer(definition.id)) {
        counters.skippedExisting += 1;
        return;
      }
      // A layer whose source is missing would throw and abort the rest of the restore.
      if (!map.getSource(definition.value.source)) {
        counters.skippedExisting += 1;
        return;
      }
      const before = typeof definition.before === 'function' ? definition.before(map) : definition.before;
      if (before && !map.getLayer(before)) throw new Error(`Insertion layer ${before} does not exist`);
      map.addLayer(definition.value, before);
      counters.layersAdded += 1;
    });
  }

  function restore() {
    if (disposed) return;
    counters.styleLoads += 1;
    addSources();
    addLayers();
    definitions.onRestore?.(map, counters);
  }

  map.on('style.load', restore);
  // The first style fires style.load on its own; call restore() only for a style that is
  // already finished loading before this handler is attached.
  if (map.isStyleLoaded()) queueMicrotask(() => { if (!disposed && map.isStyleLoaded()) restore(); });

  return {
    counters,
    applyPaint(paints) {
      paints.forEach(({ id, target, values }) => {
        if (!map.getLayer(id)) return;
        counters.restyles += 1;
        Object.entries(values).forEach(([property, value]) => {
          if (target === 'layout') map.setLayoutProperty(id, property, value);
          else map.setPaintProperty(id, property, value);
        });
      });
    },
    dispose() {
      disposed = true;
      map.off('style.load', restore);
    },
    restore,
  };
}
