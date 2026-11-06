// Capture the real local map and check the selected-site interaction at several sizes.
// Start the case server first: node cases/serve.mjs
// Run from the project root: node demo/three-directions-zou/capture.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4174/demo/three-directions-zou/';
const output = resolve('output/playwright/zou');
const styles = ['light-operations', 'warm-city-guide', 'dark-monitoring'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile-320', width: 320, height: 740 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
];
const report = { base, site: 'S01', states: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

const readGeometry = () => {
  const demo = window.__demo;
  const serial = rect => rect && ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    width: rect.width, height: rect.height });
  return {
    map: serial(demo.mapBox()), sheet: serial(demo.sheetBox()), frame: serial(demo.popupFrameBox()),
    close: serial(demo.closeButtonBox()), marker: serial(demo.markerBox('S01')), tip: serial(demo.tipBox()),
    labels: demo.labelBoxes(), selected: demo.selected(), style: demo.style,
    expanded: document.querySelector('[data-testid="sheet-toggle"]').getAttribute('aria-expanded'),
    data: JSON.stringify(demo.renderedData()),
  };
};
const inside = (box, bounds) => Boolean(box && bounds) && box.right > box.left && box.bottom > box.top
  && box.left >= bounds.left - 1 && box.right <= bounds.right + 1
  && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
const overlaps = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
function validate(geometry, isMobile, stage) {
  const problems = [];
  for (const key of ['frame', 'close', 'marker', 'tip']) {
    if (!inside(geometry[key], geometry.map)) problems.push(`${stage}: ${key} outside map or missing`);
    if (isMobile && overlaps(geometry[key], geometry.sheet)) problems.push(`${stage}: ${key} overlaps sheet`);
  }
  if (geometry.close && (geometry.close.width < (isMobile ? 44 : 32)
    || geometry.close.height < (isMobile ? 44 : 32))) problems.push(`${stage}: close target too small`);
  if (geometry.tip && geometry.marker) {
    const delta = Math.abs((geometry.tip.left + geometry.tip.right - geometry.marker.left - geometry.marker.right) / 2);
    if (delta > 2) problems.push(`${stage}: tip offset ${delta.toFixed(1)}px`);
  }
  if (geometry.selected !== 'S01') problems.push(`${stage}: selected site changed`);
  for (let i = 0; i < geometry.labels.length; i++) {
    if (!inside(geometry.labels[i], geometry.map)) problems.push(`${stage}: annotation outside map`);
    for (let j = i + 1; j < geometry.labels.length; j++) {
      if (overlaps(geometry.labels[i], geometry.labels[j])) problems.push(`${stage}: overlapping annotations`);
    }
  }
  return problems;
}

try {
  for (const viewport of viewports) {
    for (const [index, style] of styles.entries()) {
      const mobile = viewport.width <= 760;
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      const state = { style, viewport: viewport.name, problems: errors };
      report.states.push(state);
      try {
        await page.goto(`${base}?style=${style}`, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready');
        await page.evaluate(() => document.fonts.ready);
        if (viewport.name === 'desktop' || viewport.name === 'mobile-390') {
          await page.screenshot({ path: resolve(output, `${style}-${viewport.name}.png`) });
        }
        if (mobile) {
          if (await page.getByTestId('sheet-toggle').getAttribute('aria-expanded') !== 'false') errors.push('sheet initially open');
          await page.getByTestId('sheet-toggle').click();
        }
        await page.getByTestId(mobile ? 'site-sheet-S01' : 'site-S01').click();
        await page.locator('.leaflet-popup-close-button').waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const popup = document.querySelector('.leaflet-popup');
          return popup && Number(getComputedStyle(popup).opacity) >= 0.99;
        });
        await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
        const selected = await page.evaluate(readGeometry);
        state.dataSha256 = createHash('sha256').update(selected.data).digest('hex');
        delete selected.data;
        state.selected = selected;
        errors.push(...validate(selected, mobile, 'selected'));
        if (mobile && selected.expanded !== 'false') errors.push('sheet did not collapse after selection');
        if (viewport.name === 'desktop' || viewport.name === 'mobile-390') {
          await page.screenshot({ path: resolve(output, `${style}-${viewport.name}-selected.png`) });
        }
        if (mobile) {
          await page.getByTestId('sheet-toggle').click();
          await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
          const expanded = await page.evaluate(readGeometry);
          delete expanded.data;
          state.expanded = expanded;
          errors.push(...validate(expanded, true, 'expanded'));
          if (expanded.expanded !== 'true') errors.push('sheet did not expand');
        }
        const nextStyle = styles[(index + 1) % styles.length];
        await page.locator(`.switcher button[data-style="${nextStyle}"]`).click();
        await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
        const switched = await page.evaluate(readGeometry);
        delete switched.data;
        state.switched = switched;
        errors.push(...validate(switched, mobile, 'switched'));
        if (switched.style !== nextStyle) errors.push('style did not change');
        await page.locator('.leaflet-popup-close-button').click();
        await page.locator('.leaflet-popup').waitFor({ state: 'hidden', timeout: 3000 });
        if (await page.locator('.leaflet-popup').count()) errors.push('popup did not close');
      } catch (error) {
        errors.push(String(error.message || error));
      } finally {
        console.log(`${style} / ${viewport.name}: ${errors.length ? errors.join('; ') : 'ok'}`);
        await context.close();
      }
    }
  }
  const flowContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const flowPage = await flowContext.newPage();
  try {
    await flowPage.goto(`${base}?style=light-operations`, { waitUntil: 'load' });
    await flowPage.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready');
    await flowPage.locator('.layer-section summary').click();
    await flowPage.getByTestId('layer-route').click();
    const off = await flowPage.evaluate(() => window.__demo.layerState().route === false);
    await flowPage.locator('.switcher button[data-style="warm-city-guide"]').click();
    const retained = await flowPage.evaluate(() => window.__demo.layerState().route === false);
    await flowPage.getByTestId('layer-route').click();
    const on = await flowPage.evaluate(() => window.__demo.layerState().route === true);
    await flowPage.getByTestId('measure-select').selectOption('deviation');
    const measure = await flowPage.evaluate(() => window.__demo.measure());
    report.flow = { routeTurnsOff: off, routeStateSurvivesStyleSwitch: retained,
      routeTurnsOn: on, selectedMeasure: measure };
    if (!off || !retained || !on || measure !== 'deviation') report.errors.push('layer or measure flow failed');
  } catch (error) {
    report.errors.push(`interaction flow: ${error.message || error}`);
  } finally {
    await flowContext.close();
  }
} finally {
  await browser.close();
}
const digests = new Set(report.states.map(state => state.dataSha256).filter(Boolean));
report.sameRenderedData = digests.size === 1 && report.states.every(state => state.dataSha256);
if (!report.sameRenderedData) report.errors.push('rendered data differs or is missing');
report.passed = report.errors.length === 0 && report.states.every(state => state.problems.length === 0);
await writeFile(resolve(output, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${resolve(output, 'capture-report.json')}`);
if (!report.passed) process.exitCode = 1;
