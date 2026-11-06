// Browser check and capture for the three-directions demo.
//
// For every direction it opens the real page, selects a site, and measures the popup frame,
// the close button and the selected target against the map canvas and the mobile sheet. It
// then writes one screenshot per state. The demo is served and interacted with; nothing here
// is a rendered image pretending to be a map.
//
// Usage: node capture.mjs [--base URL] [--out DIR]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueOf = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = (valueOf('--base') ?? 'http://127.0.0.1:4174/demo/three-directions/').replace(/\/$/, '');
const OUT = resolve(HERE, valueOf('--out') ?? 'shots');
const PLAYWRIGHT = 'C:\\Users\\赵航\\Desktop\\studio\\_review_map_aesthetic\\node_modules\\playwright\\index.mjs';

const STYLES = ['light-operations', 'warm-city-guide', 'dark-monitoring'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const SITE = 'S01';

mkdirSync(OUT, { recursive: true });

const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);
const browser = await chromium.launch({ headless: true });

const report = { kind: 'three_directions_capture', base: BASE, site: SITE, states: [] };

for (const viewport of VIEWPORTS) {
  for (const style of STYLES) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(String(error.message)));

    await page.goto(`${BASE}/?style=${style}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready',
      null, { timeout: 15000 });
    await page.waitForTimeout(350);

    // Select the site through the control a reader would use on this size.
    const testid = viewport.name === 'mobile' ? 'site-sheet-S01' : 'site-S01';
    await page.click(`[data-testid="${testid}"]`);
    await page.waitForFunction(() => document.querySelector('.leaflet-popup') !== null,
      null, { timeout: 8000 });
    await page.waitForTimeout(500);

    const geometry = await page.evaluate(() => {
      const box = element => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          width: rect.width, height: rect.height };
      };
      const demo = window.__demo;
      const map = box(document.querySelector('[data-testid="map"]'));
      const sheet = box(document.querySelector('[data-testid="sheet"]'));
      const sheetVisible = sheet && getComputedStyle(document.querySelector('[data-testid="sheet"]')).display !== 'none';
      const frame = box(document.querySelector('.leaflet-popup'));
      const close = box(document.querySelector('.leaflet-popup-close-button'));
      const tip = box(document.querySelector('.leaflet-popup-tip-container'));
      const marker = demo.markerBox('S01');
      const overlap = (a, b) => {
        if (!a || !b) return 0;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 0 && h > 0 ? Number((w * h).toFixed(1)) : 0;
      };
      const inside = (a, b, tol = 1) => Boolean(a && b)
        && a.left >= b.left - tol && a.right <= b.right + tol
        && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
      const tipOffset = tip && marker
        ? Math.abs((tip.left + tip.right - marker.left - marker.right) / 2) : null;
      return {
        map, sheet, sheetVisible, frame, close, tip, marker,
        frameInsideMap: inside(frame, map),
        closeInsideMap: inside(close, map),
        markerInsideMap: inside(marker, map),
        frameOverSheet: overlap(frame, sheetVisible ? sheet : null),
        closeOverSheet: overlap(close, sheetVisible ? sheet : null),
        markerOverSheet: overlap(marker, sheetVisible ? sheet : null),
        tipOffsetPx: tipOffset === null ? null : Number(tipOffset.toFixed(2)),
        legendEntries: demo.legendColors().length,
        // A digest of what is actually drawn, so the three directions can be shown to render the
        // same features rather than merely the same files.
        renderedDigest: (() => {
          const data = demo.renderedData();
          const text = JSON.stringify({
            sites: data.sites.map(s => [s.properties.site_id, s.properties.class_name,
              s.properties.status, s.properties.throughput,
              s.coordinates.map(v => Number(v.toFixed(6)))]),
            districts: data.districts.map(d => [d.properties.district_id, d.properties.value,
              d.coordinates.map(c => c.map(v => Number(v.toFixed(6))))]),
            route: data.route.map(c => c.map(v => Number(v.toFixed(6)))),
          });
          let hash = 0;
          for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
          return `${text.length}:${(hash >>> 0).toString(16)}`;
        })(),
        // The vector basemap draws the same geometry for every direction, so its own digest
        // must not change either. A direction may recolour it, but it may not move it.
        basemapDigest: (() => {
          const base = demo.vectorBasemap;
          const round = value => Number(value.toFixed(6));
          const parts = [
            ...base.blockLayers.map(layer => layer.getLatLngs()[0].map(p => [round(p.lng), round(p.lat)])),
            ...base.waterLayers.map(layer => layer.getLatLngs()[0].map(p => [round(p.lng), round(p.lat)])),
            ...base.arterials.map(entry => entry.casing.getLatLngs().map(p => [round(p.lng), round(p.lat)])),
            ...base.locals.map(entry => entry.casing.getLatLngs().map(p => [round(p.lng), round(p.lat)])),
          ];
          const text = JSON.stringify(parts);
          let hash = 0;
          for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
          return `${text.length}:${(hash >>> 0).toString(16)}`;
        })(),
        basemapCounts: demo.vectorBasemap.counts,
        visibleAnnotations: demo.visibleAnnotations(),
        basemapColors: demo.basemapColors(),
        // The annotation system has to hold up on its own terms: no label may leave the
        // canvas, and no two labels may overlap. The boxes are measured from the rendered
        // text, so this is the shape a reader actually sees.
        annotationBoxes: demo.labelBoxes(),
        annotationDropped: demo.annotationOutcome().dropped,
        dataSha: demo.dataSha,
        selected: demo.selected(),
      };
    });

    const file = `${style}-${viewport.name}.png`;
    await page.screenshot({ path: resolve(OUT, file), fullPage: false });
    report.states.push({ style, viewport: viewport.name, file, consoleErrors, geometry });
    console.log(`${style} / ${viewport.name}: errors=${consoleErrors.length} `
      + `frameInside=${geometry.frameInsideMap} closeInside=${geometry.closeInsideMap} `
      + `markerInside=${geometry.markerInsideMap} frameOverSheet=${geometry.frameOverSheet} `
      + `tipOffset=${geometry.tipOffsetPx}`);
    await context.close();
  }
}

await browser.close();

// Every direction must draw the same features. A difference here would mean a direction had
// silently changed the data rather than only its presentation.
const digests = new Set(report.states.map(state => state.geometry.renderedDigest));
// The digests are the same in every state; only the key order of the object differs, because
// the files are digested concurrently, so they are compared as sorted pairs.
const shas = new Set(report.states.map(state => JSON.stringify(
  Object.entries(state.geometry.dataSha).sort((a, b) => (a[0] < b[0] ? -1 : 1)))));
// The basemap geometry must be identical in every direction too: a direction may recolour the
// basemap, but it may not move a road or a block.
const basemapDigests = new Set(report.states.map(state => state.geometry.basemapDigest));
// The three directions must differ in the colours they give the basemap. If they did not, the
// basemap would be decoration rather than a design.
const basemapPalettes = new Set(report.states.map(state => JSON.stringify(state.geometry.basemapColors)));
// Annotation integrity. Two labels that overlap are a defect, and a label that leaves the
// canvas is a defect. Both are measured on the rendered boxes, per state.
report.integrity = {
  annotationsNeverOverlap: report.states.every(state => {
    const boxes = state.geometry.annotationBoxes ?? [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]; const b = boxes[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) return false;
      }
    }
    return true;
  }),
  annotationsStayInsideMap: report.states.every(state => {
    const map = state.geometry.map;
    return (state.geometry.annotationBoxes ?? []).every(box =>
      box.left >= map.left - 1 && box.right <= map.right + 1
      && box.top >= map.top - 1 && box.bottom <= map.bottom + 1);
  }),
  annotationCounts: Object.fromEntries(report.states.map(state =>
    [`${state.style}/${state.viewport}`, (state.geometry.annotationBoxes ?? []).length])),
  annotationClasses: Object.fromEntries(report.states.map(state => [
    `${state.style}/${state.viewport}`,
    (state.geometry.visibleAnnotations ?? []).reduce((acc, item) => {
      acc[item.cls] = (acc[item.cls] ?? 0) + 1; return acc;
    }, {})])),
  distinctRenderedDigests: [...digests],
  sameRenderedData: digests.size === 1,
  sameInputDigests: shas.size === 1,
  distinctBasemapDigests: [...basemapDigests],
  sameBasemapGeometry: basemapDigests.size === 1,
  distinctBasemapPalettes: basemapPalettes.size,
  eachDirectionHasItsOwnBasemap: basemapPalettes.size === 3,
  allStatesClean: report.states.every(state => state.consoleErrors.length === 0),
  allPopupsInsideMap: report.states.every(state => state.geometry.frameInsideMap
    && state.geometry.closeInsideMap && state.geometry.markerInsideMap),
  noSheetOcclusion: report.states.every(state => state.geometry.frameOverSheet === 0
    && state.geometry.closeOverSheet === 0 && state.geometry.markerOverSheet === 0),
  maxTipOffsetPx: Math.max(...report.states.map(state => state.geometry.tipOffsetPx ?? 0)),
};
writeFileSync(resolve(OUT, 'capture_report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\n-> ${OUT}`);
