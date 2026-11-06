// Verify actual browser interaction and capture representative screenshots for the
// cultural-facilities case. Starts its own case server, so no pre-running service needed.
// Run: node demo/cultural-atlas/verify.mjs   (from the project root)
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { startCaseServer } from '../../cases/serve.mjs';

const output = resolve('output/playwright/cultural-atlas');
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
  const atlas = window.__culturalAtlas;
  return { map: rect(document.querySelector('[data-testid="map"]')),
    marker: atlas.markerBox('F01')?.toJSON() ?? null,
    popup: rect(document.querySelector('.leaflet-popup')),
    close: rect(document.querySelector('.leaflet-popup-close-button')),
    sheet: rect(document.querySelector('.side')),
    labels: [...document.querySelectorAll('.road-label span, .site-label span')]
      .filter(el => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length)
      .map(el => ({ ...rect(el), text: el.textContent })),
    expanded: document.querySelector('[data-testid="sheet-toggle"]').getAttribute('aria-expanded'),
    selected: atlas.selected(), categories: atlas.categoryState(), layerCount: atlas.layerCount() };
};
const inside = (box, map) => Boolean(box && map) && box.width > 0 && box.height > 0
  && box.left >= map.left - 1 && box.right <= map.right + 1
  && box.top >= map.top - 1 && box.bottom <= map.bottom + 1;
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
  await page.waitForFunction(() => !window.__culturalAtlas.map._panAnim?._inProgress
    && !window.__culturalAtlas.map._animatingZoom, null, { timeout: 5000 });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const { server, url } = await startCaseServer(0);
const base = `${url}/demo/cultural-atlas/`;
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
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const initial = await page.evaluate(metrics);
      state.initialLabelCount = initial.labels.length;
      state.initialLayerCount = initial.layerCount;
      checkLabels(initial, issues, 'initial');
      if (viewport.name === 'desktop' || viewport.name === 'mobile-390') {
        await page.screenshot({ path: resolve(output, `${viewport.name}.png`) });
      }
      // Category filter: turning off 博物馆 must reduce active categories and layer count.
      if (viewport.name === 'desktop') {
        const before = await page.evaluate(() => window.__culturalAtlas.categoryState());
        await page.getByTestId('cat-博物馆').uncheck();
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => window.__culturalAtlas.categoryState());
        if (after.active.length !== before.active.length - 1) issues.push('category filter did not drop a category');
        if (after.active.includes('博物馆')) issues.push('museum still active after uncheck');
        const lay = await page.evaluate(() => window.__culturalAtlas.layerCount());
        if (lay >= before.total) issues.push('layer count did not drop after filter');
        await page.screenshot({ path: resolve(output, 'desktop-filtered.png') });
        await page.getByTestId('cat-博物馆').check();
        await page.waitForTimeout(150);
        if ((await page.evaluate(() => window.__culturalAtlas.layerCount())) !== initial.layerCount)
          issues.push('layer count did not restore after re-check');
      }
      // Road-label toggle.
      if (viewport.name === 'desktop') {
        await page.getByTestId('toggle-labels').click();
        await page.waitForTimeout(120);
        const hidden = await page.evaluate(() =>
          [...document.querySelectorAll('.road-label')].every(el => el.style.display === 'none'));
        if (!hidden) issues.push('road labels not hidden after toggle off');
        await page.getByTestId('toggle-labels').click();
      }
      if (mobile) {
        if (await page.getByTestId('sheet-toggle').getAttribute('aria-expanded') !== 'false') issues.push('sheet initially open');
        await page.getByTestId('sheet-toggle').click();
      }
      await page.getByTestId('site-F01').click();
      await page.locator('.leaflet-popup-close-button').waitFor({ state: 'visible' });
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.leaflet-popup')).opacity) >= .99);
      await settle(page);
      const selected = await page.evaluate(metrics);
      state.selected = selected;
      checkLabels(selected, issues, 'selected');
      if (selected.selected !== 'F01') issues.push('facility selection not retained');
      for (const key of ['marker', 'popup', 'close']) if (!inside(selected[key], selected.map)) issues.push(`${key} outside map`);
      if (mobile && selected.expanded !== 'false') issues.push('sheet not collapsed after selection');
      if (selected.close && (selected.close.width < (mobile ? 44 : 32)
        || selected.close.height < (mobile ? 44 : 32))) issues.push('close target too small');
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
        for (const key of ['popup', 'close']) if (!inside(expanded[key], expanded.map)) issues.push(`expanded ${key} outside map`);
      }
      await page.locator('.leaflet-popup-close-button').click();
      await page.locator('.leaflet-popup').waitFor({ state: 'hidden', timeout: 3000 });
    } catch (error) {
      issues.push(String(error.message || error));
    } finally {
      console.log(`${viewport.name}: ${issues.length ? issues.join('; ') : 'ok'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(d => server.close(d));
}
report.passed = report.states.every(state => state.issues.length === 0);
await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${resolve(output, 'report.json')}`);
if (!report.passed) process.exitCode = 1;
