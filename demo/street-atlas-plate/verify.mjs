// Verify the plate scheme (street-atlas-plate). Run from the project root with the case server on 4174.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('output/playwright/street-atlas-plate');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
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
  const app = window.__streetAtlasPlate;
  return {
    map: rect(document.querySelector('[data-testid="map"]')),
    column: rect(document.querySelector('.plate-column')),
    marker: app.markerBox('S01')?.toJSON() ?? null,
    popup: rect(document.querySelector('.leaflet-popup')),
    close: rect(document.querySelector('.leaflet-popup-close-button')),
    chevrons: app.chevronCount(),
    badges: document.querySelectorAll('.stop-badge').length,
    labels: [...document.querySelectorAll('.marker-label span, .road-label span')]
      .filter(el => getComputedStyle(el).visibility !== 'hidden')
      .map(el => ({ ...rect(el), text: el.textContent })),
    expanded: document.querySelector('[aria-controls="plate-body"]')?.getAttribute('aria-expanded'),
    selected: app.selectedSite(),
    layers: app.layerState(),
  };
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
const settle = page => page.waitForFunction(() => {
  const map = window.__streetAtlasPlate?.map;
  return !map || (!map._panAnim?._inProgress && !map._animatingZoom);
}, null, { timeout: 5000 }).then(() => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))));
const report = { states: [], errors: [] };
try {
  for (const viewport of viewports) {
    const mobile = viewport.width <= 820;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const issues = [];
    page.on('pageerror', e => issues.push(e.message));
    page.on('console', m => { if (m.type() === 'error') issues.push(m.text()); });
    const state = { viewport: viewport.name, issues };
    report.states.push(state);
    try {
      await page.goto('http://127.0.0.1:4174/demo/street-atlas-plate/', { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const initial = await page.evaluate(metrics);
      state.chevrons = initial.chevrons;
      state.badges = initial.badges;
      if (initial.chevrons === 0) issues.push('direction chevrons missing');
      if (initial.badges === 0) issues.push('stop badges missing');
      checkLabels(initial, issues, 'initial');
      if (viewport.name === 'desktop' || viewport.name === 'mobile-390') {
        await page.screenshot({ path: resolve(output, `${viewport.name}.png`) });
      }
      for (const [testid, key] of [['toggle-route', 'routes'], ['toggle-sites', 'sites'], ['toggle-directions', 'chevrons']]) {
        await page.getByTestId(testid).click();
        const off = await page.evaluate(() => window.__streetAtlasPlate.layerState());
        if (off[key] !== false) issues.push(`${key} did not turn off`);
        await page.getByTestId(testid).click();
        const on = await page.evaluate(() => window.__streetAtlasPlate.layerState());
        if (on[key] !== true) issues.push(`${key} did not turn back on`);
      }
      if (mobile) {
        const expandedBefore = await page.evaluate(() => document.querySelector('[aria-controls="plate-body"]').getAttribute('aria-expanded'));
        if (expandedBefore !== 'false') issues.push('mobile sheet initially expanded');
        await page.evaluate(() => document.querySelector('[aria-controls="plate-body"]').click());
        if (await page.evaluate(() => document.querySelector('[aria-controls="plate-body"]').getAttribute('aria-expanded')) !== 'true') issues.push('mobile sheet did not expand');
      }
      await page.evaluate(() => document.querySelector('[data-testid="site-S01"]')?.click());
      await page.locator('.leaflet-popup-close-button').waitFor({ state: 'visible', timeout: 5000 });
      await settle(page);
      const selected = await page.evaluate(metrics);
      state.selected = selected;
      if (selected.selected !== 'S01') issues.push('site selection not retained');
      for (const key of ['marker', 'popup', 'close']) if (!inside(selected[key], selected.map)) issues.push(`${key} outside map`);
      if (mobile) {
        const expandedAfter = await page.evaluate(() => document.querySelector('[aria-controls="plate-body"]').getAttribute('aria-expanded'));
        if (expandedAfter !== 'false') issues.push('sheet did not collapse after selection');
      }
      if (viewport.name === 'mobile-390') await page.screenshot({ path: resolve(output, 'mobile-selected.png') });
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
}
report.passed = report.states.every(state => state.issues.length === 0);
await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${resolve(output, 'report.json')}`);
if (!report.passed) process.exitCode = 1;
