// Verify actual browser interaction for the refined street-atlas and capture screenshots.
// Start the server with `node cases/serve.mjs`, then run this file from the project root.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('output/playwright/street-atlas-refined');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { states: [], errors: [] };
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile-320', width: 320, height: 740 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
];
const metrics = () => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const atlas = window.__streetAtlasRefined;
  return {
    map: rect(document.querySelector('[data-testid="map"]')),
    marker: atlas.markerBox('S01')?.toJSON() ?? null,
    popup: rect(document.querySelector('.leaflet-popup')),
    popupCenter: atlas.map.getContainer().getBoundingClientRect(),
    close: rect(document.querySelector('.leaflet-popup-close-button')),
    sheet: rect(document.querySelector('.side')),
    attribution: rect(document.querySelector('.leaflet-control-attribution')),
    legend: rect(document.querySelector('[data-testid="legend"]')),
    bar: rect(document.querySelector('.map-bar')),
    labels: [...document.querySelectorAll('.road-label span, .marker-label span')]
      .filter(el => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length)
      .map(el => ({ ...rect(el), text: el.textContent })),
    badges: [...document.querySelectorAll('.stop-badge')].length,
    expanded: document.querySelector('[data-testid="sheet-toggle"]').getAttribute('aria-expanded'),
    selected: atlas.selected(), layers: atlas.layerState(),
  };
};
const inside = (box, map) => Boolean(box && map) && box.width > 0 && box.height > 0
  && box.left >= map.left - 1 && box.right <= map.right + 1
  && box.top >= map.top - 1 && box.bottom <= map.bottom + 1;
const coversPoint = (box, map) => Boolean(box && map) && box.left <= map.center.x && box.right >= map.center.x
  && box.top <= map.center.y && box.bottom >= map.center.y;
function centerOf(box) { return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; }
function checkLabels(state, issues, name) {
  for (let i = 0; i < state.labels.length; i++) {
    const a = state.labels[i];
    if (!inside(a, state.map)) issues.push(`${name}: label outside map: ${a.text}`);
    for (let j = i + 1; j < state.labels.length; j++) {
      const b = state.labels[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
        issues.push(`${name}: labels overlap: ${a.text} / ${b.text}`);
    }
  }
}
async function settle(page) {
  await page.waitForFunction(() => !window.__streetAtlasRefined.map._panAnim?._inProgress
    && !window.__streetAtlasRefined.map._animatingZoom, null, { timeout: 5000 });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

try {
  for (const viewport of viewports) {
    const mobile = viewport.width <= 820;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const issues = [];
    page.on('pageerror', error => issues.push(error.message));
    page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
    const state = { viewport: viewport.name, issues };
    report.states.push(state);
    try {
      await page.goto('http://127.0.0.1:4174/demo/street-atlas-refined/', { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const initial = await page.evaluate(metrics);
      state.initialLabelCount = initial.labels.length;
      state.initialBadges = initial.badges;
      checkLabels(initial, issues, 'initial');
      if (initial.badges === 0) issues.push('route stop badges missing initially');
      if (!inside(initial.legend, initial.map)) issues.push('legend outside map');
      if (!inside(initial.bar, initial.map)) issues.push('map bar outside map');
      if (!inside(initial.attribution, initial.map)) issues.push('attribution outside map');
      if (viewport.name === 'desktop' || viewport.name === 'mobile-390') {
        await page.screenshot({ path: resolve(output, `${viewport.name}.png`) });
      }
      for (const [testid, key] of [['toggle-route', 'route'], ['toggle-sites', 'sites']]) {
        await page.getByTestId(testid).click();
        const offState = await page.evaluate(() => window.__streetAtlasRefined.layerState());
        if (offState[key]) issues.push(`${key} did not turn off`);
        if (key === 'sites' && offState.sites === false) {
          const badgeCount = await page.evaluate(() => document.querySelectorAll('.stop-badge').length);
          if (badgeCount > 0) issues.push('badges remained after hiding sites');
        }
        await page.getByTestId(testid).click();
        const onState = await page.evaluate(() => window.__streetAtlasRefined.layerState());
        if (!onState[key]) issues.push(`${key} did not turn back on`);
      }
      if (mobile) {
        if (await page.getByTestId('sheet-toggle').getAttribute('aria-expanded') !== 'false') issues.push('sheet initially open');
        await page.getByTestId('sheet-toggle').click();
      }
      await page.getByTestId('site-S01').click();
      await page.locator('.leaflet-popup-close-button').waitFor({ state: 'visible' });
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.leaflet-popup')).opacity) >= .99);
      await settle(page);
      const selected = await page.evaluate(metrics);
      state.selected = selected;
      checkLabels(selected, issues, 'selected');
      if (selected.selected !== 'S01') issues.push('site selection not retained');
      for (const key of ['marker', 'popup', 'close']) if (!inside(selected[key], selected.map)) issues.push(`${key} outside map`);
      if (coversPoint(selected.popup, { ...selected.marker, center: centerOf(selected.marker) })) issues.push('popup covers its own site');
      if (selected.close && (selected.close.width < (mobile ? 44 : 32)
        || selected.close.height < (mobile ? 44 : 32))) issues.push('close target too small');
      if (mobile && selected.expanded !== 'false') issues.push('sheet not collapsed after selection');
      if (viewport.name === 'mobile-390') await page.screenshot({ path: resolve(output, 'mobile-selected.png') });
      if (mobile) {
        await page.getByTestId('sheet-toggle').click();
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.waitForTimeout(250);
        await settle(page);
        const expanded = await page.evaluate(metrics);
        state.expanded = expanded;
        checkLabels(expanded, issues, 'expanded');
        if (expanded.expanded !== 'true') issues.push('sheet did not expand');
        if (expanded.popup || expanded.close) issues.push('popup stayed open after expanding sheet');
      }
      if (!mobile) {
        // Close popup via close button.
        await page.locator('.leaflet-popup-close-button').click().catch(() => {});
      } else {
        await page.getByTestId('sheet-toggle').click();
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.waitForTimeout(200);
        await settle(page);
        const after = await page.evaluate(metrics);
        if (after.popup) {
          await page.locator('.leaflet-popup-close-button').click().catch(() => {});
          await page.waitForTimeout(200);
        }
      }
    } catch (error) {
      issues.push(String(error.message || error));
    } finally {
      console.log(`${viewport.name}: ${issues.length ? issues.join('; ') : 'ok'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
report.passed = report.states.every(state => state.issues.length === 0);
await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${resolve(output, 'report.json')}`);
if (!report.passed) process.exitCode = 1;
