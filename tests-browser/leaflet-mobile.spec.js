import { test, expect } from '@playwright/test';
import { startCaseServer } from '../cases/serve.mjs';

let server;
let url;

test.beforeAll(async () => {
  ({ server, url } = await startCaseServer());
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

async function geometry(page, siteId) {
  return page.evaluate(id => {
    const box = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    let popup = null;
    window.__case.map.eachLayer(layer => {
      if (layer instanceof window.L.Popup && layer.isOpen()) popup = layer.getElement();
    });
    return {
      selected: window.__case.selected(),
      map: box(document.querySelector('[data-testid="map"]')),
      sheet: box(document.querySelector('[data-testid="sheet"]')),
      marker: window.__case.markerBox(id)?.toJSON() ?? null,
      popup: box(popup),
      tip: box(popup?.querySelector('.leaflet-popup-tip-container')),
    };
  }, siteId);
}

function expectVisible(actual, siteId) {
  const { map, sheet, marker, popup, tip } = actual;
  const detail = JSON.stringify(actual);
  expect(actual.selected).toBe(siteId);
  expect(marker).not.toBeNull();
  expect(popup).not.toBeNull();
  expect(tip).not.toBeNull();
  expect(marker.bottom, detail).toBeLessThanOrEqual(sheet.top + 1);
  expect(popup.bottom, detail).toBeLessThanOrEqual(sheet.top + 1);
  expect(popup.left, detail).toBeGreaterThanOrEqual(map.left - 1);
  expect(popup.right, detail).toBeLessThanOrEqual(map.right + 1);
  expect(popup.top, detail).toBeGreaterThanOrEqual(map.top - 1);
  expect(popup.bottom, detail).toBeLessThanOrEqual(map.bottom + 1);
  expect(Math.abs((tip.left + tip.right - marker.left - marker.right) / 2), detail).toBeLessThanOrEqual(2);
}

for (const autoPan of [true, false]) {
  for (const siteId of ['S01', 'S11']) {
    test(`mobile ${siteId} keeps the whole popup and target visible with autoPan ${autoPan}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${url}/cases/leaflet-raster/?variant=improved`);
      await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready');
      await page.evaluate(value => {
        window.__case.style.popup.autoPan = value;
        window.__case.map.eachLayer(layer => {
          if (layer.getPopup?.()) layer.getPopup().options.autoPan = value;
        });
      }, autoPan);
      await page.getByTestId(`site-sheet-${siteId}`).click();
      await page.waitForFunction(id => window.__case.selected() === id && document.querySelector('.leaflet-popup'), siteId);
      // Leaflet's default auto-pan animates asynchronously after the click.
      await page.waitForTimeout(500);
      expectVisible(await geometry(page, siteId), siteId);
    });
  }
}

for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`each site stays visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${url}/cases/leaflet-raster/?variant=improved`);
    await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready');
    const siteIds = await page.evaluate(() => window.__case.renderedData().sites.map(site => site.properties.site_id));
    expect(siteIds).toHaveLength(12);
    for (const siteId of siteIds) {
      await page.getByTestId(`site-sheet-${siteId}`).click();
      await page.waitForFunction(id => window.__case.selected() === id && document.querySelector('.leaflet-popup'), siteId);
      expectVisible(await geometry(page, siteId), siteId);
    }
  });
}

test('the selection remains visible when the sheet is collapsed and reopened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}/cases/leaflet-raster/?variant=improved`);
  await page.waitForFunction(() => document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready');
  await page.getByTestId('site-sheet-S01').click();
  await page.getByTestId('sheet-toggle').click();
  await expect(page.getByTestId('sheet-toggle')).toHaveAttribute('aria-expanded', 'false');
  expectVisible(await geometry(page, 'S01'), 'S01');
  await page.getByTestId('sheet-toggle').click();
  await expect(page.getByTestId('sheet-toggle')).toHaveAttribute('aria-expanded', 'true');
  expectVisible(await geometry(page, 'S01'), 'S01');
});
