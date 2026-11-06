// Scenario verify for the street operations scene variants a and b.
// Start the server with `node cases/serve.mjs`, then run this file from the project root.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('output/playwright/street-atlas-scene');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const report = { variants: [] };

const metrics = () => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const app = window.__sceneApp;
  return {
    map: rect(document.querySelector('[data-testid="map"]')),
    close: rect(document.querySelector('.leaflet-popup-close-button')),
    popup: rect(document.querySelector('.leaflet-popup')),
    sheet: rect(document.querySelector('.side')),
    labels: [...document.querySelectorAll('.marker-label span, .zone-label span, .road-label span')]
      .filter(el => getComputedStyle(el).visibility !== 'hidden')
      .map(el => ({ ...rect(el), text: el.textContent })),
    markerCount: app?.markerCount?.(),
    badgeCount: app?.badgeCount?.(),
    zoomBand: app?.zoomBand?.(),
    slot: app?.slot?.(),
    layers: app?.layerState?.(),
  };
};
const inside = (box, map) => Boolean(box && map) && box.width > 0 && box.height > 0
  && box.left >= map.left - 1 && box.right <= map.right + 1
  && box.top >= map.top - 1 && box.bottom <= map.bottom + 1;
const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

for (const variant of ['a', 'b']) {
  for (const vp of viewports) {
    const mobile = vp.width <= 820;
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const issues = [];
    page.on('pageerror', error => issues.push(error.message));
    page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
    const state = { variant, viewport: vp.name, issues };
    report.variants.push(state);
    try {
      await page.goto(`http://127.0.0.1:4174/demo/street-atlas-scene/scene-${variant}/`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const snapshot = await page.evaluate(metrics);
      state.zoomBand = snapshot.zoomBand;
      state.layers = snapshot.layers;
      if (snapshot.layers.routes !== true || snapshot.layers.zones !== true || snapshot.layers.sites !== true) {
        issues.push('layers did not all start on');
      }
      if (!snapshot.markerCount) issues.push('no site markers visible initially');
      const initialRoutes = await page.evaluate(() =>
        [...document.querySelectorAll('.route-row')].map(r => r.dataset.routeId));
      if (initialRoutes.length === 0) issues.push('no route rows rendered');
      for (const slotName of ['mid', 'late', 'early']) {
        await page.evaluate(name => window.__sceneApp.setSlot(name), slotName);
        await page.waitForTimeout(150);
        const after = await page.evaluate(metrics);
        if (after.slot !== slotName) issues.push(`slot switch to ${slotName} failed`);
        if (!after.markerCount) issues.push(`no markers in slot ${slotName}`);
      }
      await page.evaluate(() => window.__sceneApp.setSlot('early'));
      await page.waitForTimeout(200);
      for (const testid of ['toggle-zones', 'toggle-routes', 'toggle-sites']) {
        await page.getByTestId(testid).click();
        const off = await page.evaluate(() => window.__sceneApp.layerState());
        await page.getByTestId(testid).click();
        const on = await page.evaluate(() => window.__sceneApp.layerState());
        const key = testid.replace('toggle-', '');
        if (off[key] !== false || on[key] !== true) issues.push(`${key} layer toggle failed`);
      }
      const siteIds = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="site-"]')].map(b => b.dataset.testid));
      if (!siteIds.length) issues.push('no site rows rendered');
      if (mobile) {
    await page.getByTestId('sheet-toggle').click();
    await page.waitForTimeout(250);
  }
  await page.getByTestId(siteIds[0]).click();
      await page.locator('.leaflet-popup-close-button').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => issues.push('popup did not open'));
      await page.waitForTimeout(250);
      const selected = await page.evaluate(metrics);
      state.selected = selected;
      if (!inside(selected.popup, selected.map)) issues.push('popup outside map');
      if (selected.close && !inside(selected.close, selected.map)) issues.push('close button outside map');
      if ((selected.close?.width ?? 0) < (mobile ? 44 : 32)) issues.push('close target too small');
      for (let i = 0; i < selected.labels.length; i++) {
        for (let j = i + 1; j < selected.labels.length; j++) {
          if (overlap(selected.labels[i], selected.labels[j])) issues.push(`labels overlap: ${selected.labels[i].text} / ${selected.labels[j].text}`);
        }
      }
      for (let i = 0; i < selected.labels.length; i++) {
        if (!inside(selected.labels[i], selected.map)) issues.push(`label outside map: ${selected.labels[i].text}`);
      }
      if (selected.markerCount === 0) issues.push('no markers after selection');
      if (vp.name === 'desktop') await page.screenshot({ path: resolve(output, `${variant}-desktop-selected.png`) });
      if (vp.name === 'mobile-390') {
        await page.screenshot({ path: resolve(output, `${variant}-mobile-selected.png`) });
        const afterSelect = await page.evaluate(metrics);
        if (afterSelect.sheet && afterSelect.sheet.height > 60) issues.push('sheet still expanded after select');
      }
      await page.locator('.leaflet-popup-close-button').click();
      await page.locator('.leaflet-popup').waitFor({ state: 'hidden', timeout: 3000 });
    } catch (error) {
      issues.push(String(error.message || error));
    } finally {
      console.log(`${variant}/${vp.name}: ${issues.length ? issues.join('; ') : 'ok'}`);
      await context.close();
    }
  }
}
report.passed = report.variants.every(state => state.issues.length === 0);
await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${resolve(output, 'report.json')}`);
if (!report.passed) process.exitCode = 1;
