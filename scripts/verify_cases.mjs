// Executable verification for the two case projects.
//
// Two layers, deliberately separate:
//   FUNCTIONAL  deterministic facts: the data was not mutated, the layers exist, the
//               interactions work, and repeated switching does not accumulate objects.
//   AESTHETIC   measurements taken from the rendered page and its pixels: label
//               collisions, popup occlusion of the target, legend-to-map agreement,
//               and colour distance between business features and their background.
//
// Aesthetic numbers describe what changed; they are not a beauty score and a passing
// number does not mean the map looks good. Human inspection of the screenshots is
// recorded separately.
//
//   node cases/serve.mjs        (or npm run case:serve)
//   node scripts/verify_cases.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startCaseServer } from '../cases/serve.mjs';

const ROOT = resolve(import.meta.dirname, '..');
let BASE = process.env.CASE_BASE;
const EVIDENCE = resolve(ROOT, 'cases/evidence');
mkdirSync(EVIDENCE, { recursive: true });

const results = [];
let failures = 0;

function check(layer, name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push({ layer, name, ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${layer}] ${name}${detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  return ok;
}

// The baseline is the defect being demonstrated, and the two attempt variants are the
// rejected approaches. Requirements are asserted only on the shipped improvement; on
// the others the same quantity is recorded so the comparison is measurable rather than
// a red suite that means "the before state is still before".
function record(name, detail) {
  results.push({ layer: 'observation', name, recorded: true, detail: JSON.stringify(detail) });
  console.log(`  · ${name}  ${JSON.stringify(detail)}`);
}

async function leafletReady(page) {
  await page.waitForFunction(() => {
    const layer = window.__case?.basemapLayer;
    const images = [...document.querySelectorAll('.leaflet-tile')];
    return layer && !layer.isLoading() && images.length > 0
      && images.every(image => image.complete && image.naturalWidth > 0);
  }, null, { timeout: 20_000 });
}

async function vectorReady(page) {
  await page.waitForFunction(() => {
    const value = window.__case;
    return value && !value.switching() && value.map.isStyleLoaded()
      && value.map.areTilesLoaded() && !value.map.isMoving()
      && document.querySelector('[data-testid="ready"]').dataset.state === 'ready';
  }, null, { timeout: 20_000 });
}

function measure(page) {
  return page.evaluate(async () => {
    const box = await document.querySelector('[data-testid="map"]').getBoundingClientRect();
    const map = window.__case?.map;
    const pointOf = (latlng) => {
      const p = map.latLngToContainerPoint(latlng);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };
    const features = {
      route: window.__case.style.route.color,
      siteFill: window.__case.siteStyleAt('S06')?.fill,
      siteStroke: window.__case.siteStyleAt('S01')?.stroke,
      alertStroke: window.__case.siteStyleAt('S03')?.stroke,
      districtValue: window.__case.districtStyleAt('D1')?.fillColor,
      districtMissing: window.__case.districtStyleAt('D4')?.fillColor,
      label: window.__case.style.labels.color,
    };
    const samplePoints = {};
    if (map) {
      samplePoints.route = window.__case.routeMidpoint ? pointOf(window.__case.routeMidpoint()) : null;
      samplePoints.site = (() => {
        const latlng = window.__case.siteLatLng?.('S06');
        return latlng ? pointOf(latlng) : null;
      })();
      samplePoints.district = (() => {
        const latlng = window.__case.districtCentroid?.('D1');
        return latlng ? pointOf(latlng) : null;
      })();
      samplePoints.districtMissing = (() => {
        const latlng = window.__case.districtCentroid?.('D4');
        return latlng ? pointOf(latlng) : null;
      })();
      samplePoints.rasterGround = (() => {
        const bounds = map.getBounds();
        const lat = bounds.getNorth() - (bounds.getNorth() - bounds.getSouth()) * 0.22;
        const lng = bounds.getWest() + (bounds.getEast() - bounds.getWest()) * 0.12;
        return pointOf({ lat, lng });
      })();
      // The centre of a district name's glyph box, converted into map-container pixels.
      samplePoints.label = (() => {
        const rect = window.__case.labelBoxes().find(item => item.tier === 0);
        return rect ? { x: Math.round(rect.left - box.left + (rect.right - rect.left) / 2),
                        y: Math.round(rect.top - box.top + (rect.bottom - rect.top) / 2) } : null;
      })();
    }
    const overlaps = (() => {
      const boxes = window.__case.labelBoxes();
      const pairs = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i], b = boxes[j];
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (width > 2 && height > 2) pairs.push([a.tier, b.tier]);
        }
      }
      // R1 of the case: the three district names are the orientation anchors, so they
      // must not collide with anything. Street-level (tier 2) collisions are disclosed
      // as residual, because core Leaflet has no collision engine and none is claimed.
      const critical = pairs.filter(([left, right]) => left === 0 || right === 0);
      return { visible: boxes.length, overlappingPairs: pairs.length, criticalOverlaps: critical.length, pairs };
    })();
    const popup = window.__case.popupBox();
    const sheetElement = document.querySelector('[data-testid="sheet"]');
    const sheet = sheetElement ? sheetElement.getBoundingClientRect() : null;
    const sheetRect = sheet ? { left: sheet.left, right: sheet.right, top: sheet.top, bottom: sheet.bottom } : null;
    const selected = window.__case.selected();
    const marker = selected ? window.__case.markerBox(selected) : null;
    const mapRect = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    const intersect = (a, b) => {
      if (!a || !b) return null;
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 0 && height > 0 ? Math.round(width * height) : 0;
    };
    const sheetVisible = Boolean(sheetRect) && sheetRect.bottom > mapRect.top + 1
      && sheetElement && getComputedStyle(sheetElement).display !== 'none';
    const popupRect = popup ? { left: popup.left, right: popup.right, top: popup.top, bottom: popup.bottom } : null;
    const markerRect = marker ? { left: marker.left, right: marker.right, top: marker.top, bottom: marker.bottom } : null;
    return {
      variant: window.__case.variant,
      counts: window.__case.counts,
      tally: { ...window.__case.tally },
      dataSha: window.__case.dataSha,
      features,
      samplePoints,
      probe: window.__case.probeGeometry(),
      labels: overlaps,
      selected,
      popupInsideMap: popup ? popup.left >= mapRect.left - 1 && popup.right <= mapRect.right + 1
        && popup.top >= mapRect.top - 1 && popup.bottom <= mapRect.bottom + 1 : null,
      popupOverTarget: intersect(popupRect, markerRect),
      sheetOverTarget: sheetVisible ? intersect(sheetRect, markerRect) : 0,
      sheetOverPopup: sheetVisible ? intersect(sheetRect, popupRect) : 0,
      sheetVisible: Boolean(sheetVisible),
      legend: window.__case.legendColors(),
      attribution: document.querySelector('[data-testid="attribution-readout"]').textContent,
      deviceScaleFactor: window.devicePixelRatio,
      mapBox: { width: Math.round(box.width), height: Math.round(box.height) },
    };
  });
}

async function runLeaflet(browser, manifest) {
  console.log('\n=== Leaflet raster case ===');
  const captured = {};
  for (const variant of ['baseline', 'improved', 'attempt-filter', 'attempt-opacity']) {
    // Tall enough that the whole map element fits in the viewport: a clipped
    // screenshot that runs past the viewport is silently shortened by Chrome.
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(String(error.message || error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('request', request => {
      const host = new URL(request.url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') external.push(request.url());
    });
    await page.goto(`${BASE}/cases/leaflet-raster/?variant=${variant}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', { timeout: 20000 });
    await leafletReady(page);

    const name = `[leaflet:${variant}]`;
    check('functional', `${name} no page errors`, errors.length === 0, errors.slice(0, 3));
    check('functional', `${name} no external requests`, external.length === 0, external.slice(0, 3));

    await page.getByTestId('site-S01').click();
    await page.waitForTimeout(250);
    const opened = await page.evaluate(() => Boolean(document.querySelector('.leaflet-popup')));
    check('functional', `${name} site list click opens a popup`, opened);

    const before = await measure(page);
    check('functional', `${name} loaded input bytes match the manifest`,
      Object.entries(before.dataSha).every(([file, hash]) => manifest.files[`cases/leaflet-raster/data/${file}`] === hash),
      Object.entries(before.dataSha).filter(([file, hash]) => manifest.files[`cases/leaflet-raster/data/${file}`] !== hash).map(([file]) => file));
    check('functional', `${name} layer counts match the source`,
      before.counts.sites === 12 && before.counts.districts === 6 && before.counts.labels === 24 && before.counts.routePoints === 7,
      before.counts);
    check('functional', `${name} basemap attribution retained`, /合成栅格底图/.test(before.attribution), before.attribution);

    // Eight measure toggles plus six zoom changes must not add a single layer or popup.
    for (let index = 0; index < 8; index += 1) {
      await page.getByTestId('measure-select').selectOption(index % 2 ? 'deviation' : 'absolute');
    }
    for (const zoom of [14, 16, 15, 17, 14, 16]) {
      await page.evaluate(level => window.__case.map.setZoom(level, { animate: false }), zoom);
      await leafletReady(page);
    }
    await page.getByTestId('measure-select').selectOption('absolute');
    await page.evaluate(() => window.__case.map.setZoom(15, { animate: false }));
    await page.waitForTimeout(200);
    const after = await measure(page);
    check('functional', `${name} repeated switching accumulates nothing`,
      after.counts.sites === before.counts.sites && after.tally.popupsBound === before.tally.popupsBound
      && after.tally.layersAdded === before.tally.layersAdded,
      { layers: [before.tally.layersAdded, after.tally.layersAdded], popups: [before.tally.popupsBound, after.tally.popupsBound] });

    const geometry = await page.evaluate(() => window.__case.renderedData());
    const readData = name => JSON.parse(readFileSync(resolve(ROOT, `cases/leaflet-raster/data/${name}.geojson`), 'utf8'));
    const inputSites = readData('sites').features;
    const inputAreas = readData('districts').features;
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    check('functional', `${name} rendered site coordinates and properties preserved`,
      equal(geometry.sites, inputSites.map(feature => ({ properties: feature.properties, coordinates: feature.geometry.coordinates }))));
    check('functional', `${name} rendered route geometry preserved`, equal(geometry.route, readData('route').features[0].geometry.coordinates));
    check('functional', `${name} thematic properties preserved`, equal(geometry.districts.map(item => item.properties), inputAreas.map(feature => feature.properties)));
    const areaCoordinates = inputAreas.map(feature => {
      const ring = feature.geometry.coordinates[0];
      return equal(ring[0], ring.at(-1)) ? ring.slice(0, -1) : ring;
    });
    check('functional', `${name} rendered thematic boundaries preserve source coordinates`,
      equal(geometry.districts.map(item => item.coordinates), areaCoordinates));

    if (variant === 'improved') {
      await page.getByTestId('measure-select').selectOption('deviation');
      check('functional', `${name} five diverging classes have five legend entries`,
        await page.getByTestId('legend').locator('.swatch-area').count() === 5);
      await page.getByTestId('measure-select').selectOption('absolute');
      check('functional', `${name} missing area uses a real fill hatch`, await page.evaluate(() =>
        window.__case.districtElementAt('D4')?.getAttribute('fill')?.startsWith('url(#')
        && Boolean(document.querySelector('pattern path'))));
      const unknownClass = await page.evaluate(() => window.__case.style.site.fillBy({ properties: { class_name: 'unknown' } }));
      const expectedDisabled = JSON.parse(readFileSync(resolve(ROOT, 'skills/map-aesthetic/assets/themes/quiet-analysis.json'), 'utf8')).cartography.states.disabled;
      check('functional', `${name} unknown class has the declared disabled fallback`, unknownClass === expectedDisabled);
    }

    const fixed = await page.evaluate(() => {
      const map = window.__case.map;
      map.setView([31.2268, 121.4388], 15, { animate: false });
      return { center: map.getCenter().wrap(), zoom: map.getZoom(),
               metersPerPixel: 156543.03392 * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom() };
    });
    await page.waitForTimeout(400);
    await leafletReady(page);
    const shot = await measure(page);
    await page.screenshot({ path: `${EVIDENCE}/leaflet-${variant}-page.png`, fullPage: true });

    // The pixel sample is taken with no popup and no selection, so a site is measured
    // as its class colour rather than as an emphasis colour.
    await page.evaluate(() => { window.__case.map.closePopup(); window.__case.clearSelection(); });
    await page.waitForTimeout(200);
    const pixels = await measure(page);
    // The screenshot must be the same size as the coordinate space the probe points are
    // in, or every sample lands somewhere else. An element screenshot of a taller-than-
    // viewport element stitches scrolled content and silently breaks that assumption.
    await page.evaluate(() => window.scrollTo(0, 0));
    const clip = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="map"]').getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    await page.screenshot({ path: `${EVIDENCE}/leaflet-${variant}-map.png`, clip });
    const imageSha256 = createHash('sha256').update(readFileSync(`${EVIDENCE}/leaflet-${variant}-map.png`)).digest('hex');
    captured[variant] = { shot, pixels, fixed, clip, prefix: 'leaflet', imageSha256 };

    const labelDetail = { overlappingPairs: shot.labels.overlappingPairs,
                          criticalOverlaps: shot.labels.criticalOverlaps, visible: shot.labels.visible };
    if (variant === 'improved') {
      check('aesthetic', `${name} R1 district labels never collide`, shot.labels.criticalOverlaps === 0, labelDetail);
      check('aesthetic', `${name} R2 no label pair collides`, shot.labels.overlappingPairs === 0, labelDetail);
      check('aesthetic', `${name} popup does not cover its own site`, shot.popupOverTarget === 0,
        { popupOverTarget: shot.popupOverTarget, insideMap: shot.popupInsideMap });
    } else {
      record(`${name} label collisions (recorded, not asserted)`, labelDetail);
      record(`${name} popup over its own site (recorded)`, { popupOverTarget: shot.popupOverTarget, insideMap: shot.popupInsideMap });
    }
    console.log(`   · ${variant}: ${shot.labels.visible} labels, ${shot.labels.overlappingPairs} overlapping pairs `
      + `(${shot.labels.criticalOverlaps} involving a district name), ${fixed.metersPerPixel.toFixed(1)} m/px at zoom ${fixed.zoom}`);

    // Mobile: the open sheet is the occluder, and only the improved variant reserves
    // space for it. Baseline is measured, not asserted, because the occlusion is the
    // defect being demonstrated.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    // On a narrow viewport the side panel is hidden and the sheet list is the control.
    await page.getByTestId('site-sheet-S11').click();
    await page.waitForTimeout(400);
    const mobile = await measure(page);
    await page.screenshot({ path: `${EVIDENCE}/leaflet-${variant}-mobile.png`, fullPage: true });
    // S11 sits at the southern edge, which is where a bottom sheet does its damage.
    const occlusion = { sheetOverTarget: mobile.sheetOverTarget, sheetOverPopup: mobile.sheetOverPopup,
                        popupInsideMap: mobile.popupInsideMap };
    if (variant === 'improved') {
      check('aesthetic', `${name} R3 mobile sheet does not cover the selected site`,
        mobile.sheetOverTarget === 0, occlusion);
      check('aesthetic', `${name} R3 mobile popup stays inside the map`, mobile.popupInsideMap === true, occlusion);
      check('aesthetic', `${name} R3 mobile sheet does not cover the popup`, mobile.sheetOverPopup === 0, occlusion);
      check('functional', `${name} mobile sheet handle stays visible and receives input`, await page.evaluate(() => {
        const element = document.querySelector('[data-testid="sheet-toggle"]');
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }));
    } else {
      record(`${name} mobile occlusion (recorded)`, occlusion);
    }
    check('functional', `${name} no late errors or failed local resources`, errors.length === 0, errors);
    check('functional', `${name} no late external requests`, external.length === 0, external);
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.close();
  }

  const base = captured.baseline.shot, improved = captured.improved.shot;
  check('functional', '[leaflet] comparison viewport and camera match',
    JSON.stringify(captured.baseline.clip) === JSON.stringify(captured.improved.clip)
    && JSON.stringify(captured.baseline.fixed) === JSON.stringify(captured.improved.fixed),
    { baseline: captured.baseline.clip, improved: captured.improved.clip });
  check('aesthetic', '[leaflet] refinement reduces label collisions',
    improved.labels.overlappingPairs < base.labels.overlappingPairs,
    { baseline: base.labels.overlappingPairs, improved: improved.labels.overlappingPairs });
  const duplicates = legend => {
    const seen = new Map();
    legend.forEach(item => seen.set(item.color, [...(seen.get(item.color) || []), item.text]));
    return [...seen.values()].filter(texts => texts.length > 1);
  };
  check('aesthetic', '[leaflet] improved legend entries are bound to the style object',
    improved.legend.every(item => item.bound), improved.legend.map(item => item.bound));
  check('aesthetic', '[leaflet] improved legend gives no colour two meanings',
    duplicates(improved.legend).length === 0, duplicates(improved.legend));
  check('aesthetic', '[leaflet] baseline legend is not bound to the style object',
    base.legend.every(item => !item.bound), base.legend.map(item => item.bound));
  record('[leaflet] baseline legend colours reused across meanings (observed defect)',
    duplicates(base.legend));
  return captured;
}

async function runMapbox(browser) {
  console.log('\n=== MapLibre local vector-style case (not Mapbox runtime) ===');
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(String(error.message || error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', request => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(request.url());
  });

  await page.goto(`${BASE}/cases/mapbox-style/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', { timeout: 20000 });
  await vectorReady(page);
  const engine = await page.evaluate(() => ({ name: window.__case.engine, version: window.__case.engineVersion }));
  const expectedVersion = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/maplibre-gl/package.json'), 'utf8')).version;
  check('functional', '[vector] actual engine and version are recorded as MapLibre', engine.name === 'maplibre-gl' && engine.version === expectedVersion, engine);

  check('functional', '[mapbox] no page errors', errors.length === 0, errors.slice(0, 3));
  check('functional', '[mapbox] no external requests', external.length === 0, external.slice(0, 3));

  const initialCounts = await page.evaluate(() => window.__case.counts());
  check('functional', '[mapbox] layers and sources match expected counts',
    initialCounts.owned === 6 && initialCounts.duplicates === 0 && initialCounts.sources >= 5,
    initialCounts);

  const attribution = await page.evaluate(() => document.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent || '');
  check('functional', '[mapbox] basemap attribution retained',
    /合成本地数据/.test(attribution), attribution);

  // Take day screenshot
  const cameraState = () => page.evaluate(() => ({
    center: window.__case.map.getCenter().toArray(), bounds: window.__case.map.getBounds().toArray(),
    zoom: window.__case.map.getZoom(), bearing: window.__case.map.getBearing(), pitch: window.__case.map.getPitch(),
    viewport: [innerWidth, innerHeight], deviceScaleFactor: devicePixelRatio, selected: window.__case.selected(),
  }));
  const dayCamera = await cameraState();
  await page.screenshot({ path: `${EVIDENCE}/mapbox-day-page.png`, fullPage: true });
  const clip = await page.evaluate(() => {
    const rect = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  await page.screenshot({ path: `${EVIDENCE}/mapbox-day-map.png`, clip });

  // Select a station point (u0)
  const stationPoint = await page.evaluate(() => window.__case.screenPoint('u0'));
  await page.getByTestId('map').click({ position: stationPoint });
  await page.waitForTimeout(300);

  const selectionInfo = await page.evaluate(() => {
    const selected = window.__case.selected();
    const hasPopup = Boolean(document.querySelector('.ml-pop'));
    const readout = document.querySelector('[data-testid="selection-readout"]')?.textContent;
    const state = window.__case.map.getFeatureState({ source: 'stations', id: 'u0' });
    return { selected, hasPopup, readout, state };
  });
  check('functional', '[mapbox] clicking station opens popup and sets selection',
    selectionInfo.selected === 'u0' && selectionInfo.hasPopup && selectionInfo.state?.selected === true,
    selectionInfo);

  await page.screenshot({ path: `${EVIDENCE}/mapbox-day-selection.png`, clip });

  // Switch to night theme
  await page.selectOption('[data-testid="theme-select"]', 'night');
  await vectorReady(page);

  const nightCounts = await page.evaluate(() => window.__case.counts());
  check('functional', '[mapbox] night style loaded and restored owned layers',
    nightCounts.owned === 6 && nightCounts.duplicates === 0,
    nightCounts);

  // Check selection survived theme switch
  const nightSelection = await page.evaluate(() => {
    const selected = window.__case.selected();
    const state = window.__case.map.getFeatureState({ source: 'stations', id: 'u0' });
    return { selected, state };
  });
  check('functional', '[mapbox] selection state preserved across theme switch',
    nightSelection.selected === 'u0' && nightSelection.state?.selected === true,
    nightSelection);
  const nightCamera = await cameraState();

  await page.screenshot({ path: `${EVIDENCE}/mapbox-night-page.png`, fullPage: true });
  await page.screenshot({ path: `${EVIDENCE}/mapbox-night-map.png`, clip });
  await page.screenshot({ path: `${EVIDENCE}/mapbox-night-selection.png`, clip });

  // Rapid switching 8 times test
  const loadsBefore = await page.evaluate(() => window.__case.restoration.counters.styleLoads);
  await page.click('[data-testid="switch-x8"]');
  await vectorReady(page);

  const finalCounts = await page.evaluate(() => ({
    counts: window.__case.counts(),
    counters: window.__case.restoration.counters,
    listeners: window.__case.tally.listenersBound,
  }));
  check('functional', '[mapbox] repeated 8x switching accumulates no duplicate layers or sources',
    finalCounts.counts.owned === 6 && finalCounts.counts.duplicates === 0
      && finalCounts.counts.sources === initialCounts.sources
      && finalCounts.counts.layers === initialCounts.layers
      && finalCounts.counters.styleLoads === loadsBefore + 8,
    finalCounts);

  // Aesthetic checks
  const styleChecks = await page.evaluate(() => {
    const map = window.__case.map;
    const layers = map.getStyle().layers;
    const casingIdx = layers.findIndex(l => l.id === 'route-casing');
    const lineIdx = layers.findIndex(l => l.id === 'route-line');
    const roadIdx = layers.findIndex(l => l.id === 'road');
    const labelIdx = layers.findIndex(l => l.id === 'place-name');
    const routeCasing = map.getPaintProperty('route-casing', 'line-width');
    const routeLine = map.getPaintProperty('route-line', 'line-width');
    const selectionRadius = map.getPaintProperty('station-selected', 'circle-radius');
    const legendItems = Array.from(document.querySelectorAll('[data-testid="legend"] li')).map(li => ({
      text: li.textContent.trim(), token: li.dataset.color,
      kind: li.dataset.kind,
      borderWidth: parseFloat(getComputedStyle(li.querySelector('i')).borderTopWidth),
      painted: li.dataset.kind === 'ring' ? getComputedStyle(li.querySelector('i')).borderTopColor : getComputedStyle(li.querySelector('i')).backgroundColor,
    }));
    const theme = window.__case.theme().cartography;
    const toRgb = hex => `rgb(${[1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(', ')})`;
    const expectedLegend = [...theme.classes.map(item => item.color), theme.route.color,
      theme.selection.color, ...theme.sequential.slice(0, 4)];
    const selectionLegend = legendItems[theme.classes.length + 1];
    const legendMatches = legendItems.length === expectedLegend.length && legendItems.every((item, index) =>
      item.token.toLowerCase() === expectedLegend[index].toLowerCase() && item.painted === toRgb(expectedLegend[index]))
      && selectionLegend.kind === 'ring' && selectionLegend.borderWidth >= 2;
    const expectedFill = ['match', ['get', 'class_name'], ...theme.classes.flatMap(item => [item.id, item.color]), '#888888'];
    const expectedSelection = ['case', ['boolean', ['feature-state', 'selected'], false], 12, 0];
    const fillUnchanged = JSON.stringify(map.getPaintProperty('station-point', 'circle-color')) === JSON.stringify(expectedFill);
    const selectionValid = JSON.stringify(selectionRadius) === JSON.stringify(expectedSelection);
    return { casingIdx, lineIdx, roadIdx, labelIdx, routeCasing, routeLine, selectionRadius, legendItems, legendMatches, fillUnchanged, selectionValid };
  });

  check('aesthetic', '[mapbox] route casing is rendered beneath route line and above road context',
    styleChecks.roadIdx >= 0 && styleChecks.roadIdx < styleChecks.casingIdx
      && styleChecks.casingIdx < styleChecks.lineIdx && styleChecks.lineIdx < styleChecks.labelIdx,
    { casingIdx: styleChecks.casingIdx, lineIdx: styleChecks.lineIdx });

  check('aesthetic', '[mapbox] route casing width exceeds route line width',
    styleChecks.routeCasing > styleChecks.routeLine,
    { casing: styleChecks.routeCasing, line: styleChecks.routeLine });

  check('aesthetic', '[mapbox] selection ring uses added radius without replacing station fill',
    styleChecks.selectionValid && styleChecks.fillUnchanged,
    styleChecks);

  check('aesthetic', '[mapbox] legend reflects active theme tokens',
    styleChecks.legendMatches,
    styleChecks.legendItems);
  check('aesthetic', '[vector] legend is fully inside the map viewport', await page.evaluate(() => {
    const map = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    const legend = document.querySelector('[data-testid="legend"]').getBoundingClientRect();
    return legend.left >= map.left && legend.right <= map.right && legend.top >= map.top && legend.bottom <= map.bottom;
  }));

  const input = JSON.parse(readFileSync(resolve(ROOT, 'cases/mapbox-style/data/business.geojson'), 'utf8'));
  const original = input.features.map((feature, index) => ({ ...feature,
    properties: { ...feature.properties, uid: feature.id ?? feature.properties.uid ?? `u${index}` } }));
  const sourceData = await page.evaluate(() => ['zones', 'delivery-route', 'stations'].flatMap(id => window.__case.map.getStyle().sources[id].data.features));
  const byUid = list => [...list].sort((a, b) => String(a.properties.uid).localeCompare(String(b.properties.uid)));
  check('functional', '[vector] rendered source geometry and properties preserved',
    JSON.stringify(byUid(sourceData)) === JSON.stringify(byUid(original)));
  const openings = await page.evaluate(() => window.__case.tally.popupsOpened);
  await page.getByTestId('map').click({ position: await page.evaluate(() => window.__case.screenPoint('u0')) });
  check('functional', '[vector] one click produces one popup after repeated switching',
    await page.locator('.ml-pop').count() === 1
      && await page.evaluate(() => window.__case.tally.popupsOpened) === openings + 1);
  check('functional', '[vector] no late page or console errors', errors.length === 0, errors);
  check('functional', '[vector] no late external requests', external.length === 0, external);
  await page.close();
  const images = Object.fromEntries(['day-map', 'day-selection', 'night-map', 'night-selection'].map(name => {
    const filename = `mapbox-${name}.png`;
    return [filename, createHash('sha256').update(readFileSync(resolve(EVIDENCE, filename))).digest('hex')];
  }));
  return { engine, finalCounts, styleChecks, captures: { dayCamera, nightCamera, clip, images } };
}

async function main() {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'cases/leaflet-raster/data-manifest.json'), 'utf-8'));
  const local = BASE ? null : await startCaseServer();
  BASE ||= local.url;
  let browser;
  let captured;
  try {
    browser = await chromium.launch();
    captured = { leaflet: await runLeaflet(browser, manifest), maplibre: await runMapbox(browser) };
  } catch (error) {
    check('execution', 'case execution completed', false, error.message);
    captured ||= { leaflet: {} };
  } finally {
    await browser?.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
  const assertions = results.filter(row => !row.recorded);
  const summary = { assertions: assertions.length, passed: assertions.filter(row => row.ok).length,
    failed: assertions.filter(row => !row.ok).length, observations: results.filter(row => row.recorded).length };
  writeFileSync(resolve(EVIDENCE, 'verification-report.json'), JSON.stringify({ executedAt: new Date().toISOString(), summary, results, captured }, null, 2));
  writeFileSync(resolve(EVIDENCE, 'leaflet-report.json'), JSON.stringify({ results: results.filter(r => r.name.includes('leaflet')), captured: { leaflet: captured.leaflet } }, null, 2));
  console.log(`\n${summary.passed}/${summary.assertions} assertions passed; ${summary.observations} observations recorded separately.`);
  console.log(`Evidence written to ${EVIDENCE}`);
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
