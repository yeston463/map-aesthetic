// Post-hoc replay of supplied outputs. This does not run agents or repair a contaminated A/B trial.
import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startCaseServer } from '../cases/serve.mjs';

const { values } = parseArgs({ options: { direct: { type: 'string' }, skill: { type: 'string' }, output: { type: 'string' } } });
if (!values.direct || !values.skill || !values.output) {
  throw Error('Usage: node scripts/replay_ab_artifacts.mjs --direct PATH_A --skill PATH_B --output NEW_EVIDENCE_DIR');
}
const output = resolve(values.output);
await mkdir(output, { recursive: false }); // Never overwrite prior replay evidence.
const center = [31.2268, 121.4388];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = {};
let browser;

async function ready(page) {
  await page.waitForFunction(() => {
    const value = window.__case;
    const tiles = [...document.querySelectorAll('.leaflet-tile')];
    return value && value.basemapLayer && !value.basemapLayer.isLoading()
      && tiles.length > 0 && tiles.every(tile => tile.complete && tile.naturalWidth > 0
        && Number(getComputedStyle(tile).opacity) >= 0.999);
  }, null, { timeout: 20_000 });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const started = performance.now(); let previous = ''; let stableFrames = 0;
    const tick = () => {
      const center = window.__case.map.getCenter();
      const popupElement = document.querySelector('.leaflet-popup');
      const popup = popupElement?.getBoundingClientRect();
      const popupOpacity = popupElement ? Number(getComputedStyle(popupElement).opacity) : 1;
      const state = JSON.stringify([center.lat, center.lng, popup?.x, popup?.y, popup?.width, popup?.height, popupOpacity]);
      stableFrames = state === previous ? stableFrames + 1 : 0; previous = state;
      if (stableFrames >= 4 && popupOpacity >= 0.999) resolve();
      else if (performance.now() - started > 5000) reject(Error('Camera and popup did not settle'));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

async function snapshot(page) {
  return page.evaluate(() => {
    const value = window.__case; const map = value.map;
    const area = map.getContainer().getBoundingClientRect();
    const rect = element => {
      const box = element?.getBoundingClientRect();
      return box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    };
    const boxes = [...document.querySelectorAll('.map-label')].map(rect).filter(box =>
      box && box.right > area.left && box.left < area.right && box.bottom > area.top && box.top < area.bottom);
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (Math.min(boxes[i].right, boxes[j].right) - Math.max(boxes[i].left, boxes[j].left) > 2
        && Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top) > 2) overlaps++;
    }
    const intersection = (a, b) => !a || !b ? null : Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const sheetElement = document.querySelector('[data-testid="sheet"]');
    const sheet = getComputedStyle(sheetElement).display === 'none' ? null : rect(sheetElement);
    const popup = rect(document.querySelector('.leaflet-popup'));
    const target = value.selected() ? value.markerBox(value.selected()) : null;
    return {
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      center: [map.getCenter().lat, map.getCenter().lng], bounds: map.getBounds().toBBoxString(), zoom: map.getZoom(),
      mapSize: [area.width, area.height], selected: value.selected(),
      visibleLabelBoxes: boxes.length, overlappingPairs: overlaps,
      sheetOverTargetBoundingBoxPx2: intersection(sheet, target), sheetOverPopupBoundingBoxPx2: intersection(sheet, popup),
      renderedData: value.renderedData?.() ?? null,
    };
  });
}

try {
  browser = await chromium.launch();
  for (const [group, input] of [['A', values.direct], ['B', values.skill]]) {
    const root = resolve(input);
    const source = join(root, 'cases/leaflet-raster/style-improved.js');
    const beforeHash = hash(await readFile(source));
    const { server, url } = await startCaseServer(0, root);
    results[group] = { initialStyleSha256: beforeHash, variants: {} };
    try {
      for (const variant of ['baseline', 'improved']) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const externalRequests = []; const errors = [];
        await context.route('**/*', async route => {
          const requestUrl = new URL(route.request().url());
          if (['http:', 'https:'].includes(requestUrl.protocol) && requestUrl.origin !== url) {
            externalRequests.push(requestUrl.origin + requestUrl.pathname); await route.abort();
          } else await route.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${url}/cases/leaflet-raster/?variant=${variant}`);
          await ready(page);
          const initial = await snapshot(page);
          await page.evaluate(point => { window.__case.clearSelection(); window.__case.map.setView(point, 15, { animate: false }); }, center);
          await ready(page);
          await settle(page);
          const desktop = await snapshot(page);
          const desktopName = `${group}-${variant}-desktop.png`;
          const desktopSha256 = hash(await page.screenshot({ path: join(output, desktopName) }));
          await page.setViewportSize({ width: 390, height: 844 });
          await page.evaluate(point => { window.__case.map.invalidateSize({ animate: false }); window.__case.map.setView(point, 15, { animate: false }); }, center);
          await ready(page);
          await page.getByTestId('site-sheet-S11').click();
          await settle(page);
          await ready(page);
          const mobile = await snapshot(page);
          const mobileName = `${group}-${variant}-mobile.png`;
          const mobileSha256 = hash(await page.screenshot({ path: join(output, mobileName) }));
          results[group].variants[variant] = { initial, desktop, mobile,
            images: { desktopName, desktopSha256, mobileName, mobileSha256 }, errors, externalRequests };
        } finally { await context.close(); }
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    results[group].finalStyleSha256 = hash(await readFile(source));
    if (beforeHash !== results[group].finalStyleSha256) throw Error(`Input ${group} changed during replay`);
  }
} finally { await browser?.close(); }

const summary = {
  kind: 'post_hoc_artifact_replay_not_valid_agent_AB',
  capture: { fixedDesktopCenterLatLng: center, fixedDesktopZoom: 15, desktopViewport: [1280, 900], mobileViewport: [390, 844] },
  improvedDesktopImagesIdentical: results.A.variants.improved.images.desktopSha256 === results.B.variants.improved.images.desktopSha256,
  improvedMobileImagesIdentical: results.A.variants.improved.images.mobileSha256 === results.B.variants.improved.images.mobileSha256,
};
await writeFile(join(output, 'replay.json'), JSON.stringify({ executedAt: new Date().toISOString(), summary, results }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
