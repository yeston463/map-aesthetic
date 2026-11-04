// A narrow API-contract double, not a renderer or an SDK compatibility assertion.
export class FakeMap {
  constructor() {
    this.sources = new Map(); this.layers = new Map(); this.handlers = new Map();
    this.paint = new Map(); this.config = []; this.loaded = false;
  }
  on(type, ...args) { const handler = args.at(-1); const values = this.handlers.get(type) || new Set(); values.add(handler); this.handlers.set(type, values); return this; }
  off(type, handler) { this.handlers.get(type)?.delete(handler); }
  fire(type) { for (const handler of this.handlers.get(type) || []) handler(); }
  isStyleLoaded() { return this.loaded; }
  getSource(id) { return this.sources.get(id); }
  addSource(id, value) { if (this.sources.has(id)) throw Error('duplicate source'); this.sources.set(id, value); }
  getLayer(id) { return this.layers.get(id); }
  addLayer(value, before) { if (before && !this.layers.has(before)) throw Error('missing before'); if (this.layers.has(value.id)) throw Error('duplicate layer'); this.layers.set(value.id, value); }
  setPaintProperty(id, key, value) { this.paint.set(`${id}:${key}`, value); }
  setLayoutProperty() {}
  setConfigProperty(...args) { if (!this.loaded) throw Error('style not ready'); this.config.push(args); }
  addControl() {}
  setFeatureState() {}
  removeFeatureState() {}
  setStyle() { this.loaded = false; }
  remove() { this.removed = true; }
}
