import test from 'node:test';
import assert from 'node:assert/strict';
import { initMapboxMap } from '../cases/mapbox-style/mapbox-gl-variant.js';
import { FakeMap } from './fake-map.mjs';

const sdk = { Map: FakeMap, AttributionControl: class {} };
const data = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'site-42',
  properties: { class_name: '配送站', throughput: 700 }, geometry: { type: 'Point', coordinates: [121.4, 31.2] } }] };

test('Mapbox example requires the real SDK and verified classic ordering', () => {
  assert.throws(() => initMapboxMap({ sdk: {}, accessToken: 'configured', data }), /installed Mapbox/);
  assert.throws(() => initMapboxMap({ sdk, accessToken: 'configured', data }), /classicBefore/);
});

test('early Standard theme choice waits for style readiness and preserves stable IDs', () => {
  const result = initMapboxMap({ sdk, accessToken: 'configured', data, styleFamily: 'standard' });
  result.setTheme('night'); assert.equal(result.map.config.length, 0);
  result.map.loaded = true; result.map.fire('style.load');
  assert.deepEqual(result.map.config.at(-1), ['basemap', 'lightPreset', 'night']);
  assert.equal(result.map.sources.get('stations').data.features[0].properties.uid, 'site-42');
  assert.equal(data.features[0].properties.uid, undefined);
  result.destroy(); assert.equal(result.map.removed, true);
});
