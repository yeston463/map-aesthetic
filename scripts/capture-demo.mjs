// Capture real browser renderings for documentation. Start the preview server first.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173');
  await page.getByTestId('demo-ready').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-testid="demo-ready"]').dataset.state === 'ready');
  await page.screenshot({ path: `${destination}/demo-desktop.png`, fullPage: true });
  await page.getByTestId('site-river-depot').click();
  await page.getByTestId('theme-select').selectOption('night-operations');
  await page.screenshot({ path: `${destination}/demo-night.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('theme-select').selectOption('quiet-analysis');
  // Wait for Leaflet's resize observer to finish updating map container sizes.
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-testid="map-after"]');
    const pane = map.querySelector('.leaflet-map-pane');
    return map.clientWidth > 0 && Boolean(pane);
  });
  await page.screenshot({ path: `${destination}/demo-mobile.png`, fullPage: true });
  console.log(`Captured desktop, night, and mobile views in ${destination}`);
} finally {
  await browser.close();
}
