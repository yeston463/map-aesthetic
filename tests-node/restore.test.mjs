import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRestoration } from '../cases/mapbox-style/restore.js';
import { FakeMap } from './fake-map.mjs';

const definitions = () => ({ sources: [{ id: 'data', value: { type: 'geojson' } }],
  layers: [{ id: 'point', value: { id: 'point', source: 'data', type: 'circle' } }] });

test('already-loaded initialization lets the caller receive the controller first', async () => {
  const map = new FakeMap(); map.loaded = true;
  const own = definitions(); let controller;
  own.onRestore = () => assert.ok(controller);
  controller = attachRestoration(map, own);
  await Promise.resolve();
  assert.equal(map.layers.size, 1);
});

test('repeated restore and style replacement retain exactly the owned objects', () => {
  const map = new FakeMap(); const controller = attachRestoration(map, definitions());
  controller.restore(); controller.restore();
  assert.equal(map.sources.size, 1); assert.equal(map.layers.size, 1);
  map.sources.clear(); map.layers.clear(); map.fire('style.load');
  assert.equal(map.sources.size, 1); assert.equal(map.layers.size, 1);
  assert.equal(map.handlers.get('style.load').size, 1);
});

test('missing declared insertion layer fails instead of silently changing order', () => {
  const map = new FakeMap(); const own = definitions(); own.layers[0].before = 'missing-label';
  const controller = attachRestoration(map, own);
  assert.throws(() => controller.restore(), /Insertion layer/);
});

test('disposed controller cancels queued and subsequent restoration', async () => {
  const map = new FakeMap(); map.loaded = true;
  const controller = attachRestoration(map, definitions()); controller.dispose();
  await Promise.resolve(); controller.restore(); map.fire('style.load');
  assert.equal(map.layers.size, 0); assert.equal(map.handlers.get('style.load').size, 0);
});
