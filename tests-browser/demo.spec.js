import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.getByTestId('demo-ready')).toHaveAttribute('data-state', 'ready');
}

async function expectLinkedViews(page) {
  await expect.poll(async () => {
    const views = await page.locator('[data-testid^="view-"]').evaluateAll(nodes =>
      nodes.map(node => ({ center: node.dataset.center, zoom: node.dataset.zoom })));
    return views.length === 2 && views[0].center === views[1].center && views[0].zoom === views[1].zoom;
  }).toBe(true);
}

test('renders two genuine vector maps without external requests or script errors', async ({ page }) => {
  const external = [];
  const errors = [];
  page.on('request', request => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.getByText('Synthetic local data', { exact: true }).first()).toBeVisible();
  for (const id of ['map-before', 'map-after']) {
    expect(await page.getByTestId(id).locator('svg path').count()).toBeGreaterThan(10);
    await expect(page.getByTestId(id).getByText('Leaflet', { exact: true })).toBeVisible();
    await expect(page.getByTestId(id).locator('.leaflet-control-attribution')).toContainText('Synthetic local data');
  }
  await expectLinkedViews(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('theme changes preserve selection and both popups without duplicate objects', async ({ page }) => {
  await ready(page);
  const after = page.getByTestId('map-after');
  const originalPaths = await after.locator('svg path').count();
  await page.getByTestId('site-river-depot').click();
  await expect(page.getByTestId('selected-state')).toHaveAttribute('data-selected', 'river-depot');
  await expect(page.locator('.leaflet-popup')).toHaveCount(2);
  const selectedPaths = await after.locator('svg path').count();
  expect(selectedPaths).toBe(originalPaths + 1);
  for (const theme of ['night-operations', 'public-guide', 'quiet-analysis', 'night-operations']) {
    await page.getByTestId('theme-select').selectOption(theme);
    await expect(page.getByTestId('after-panel')).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('selected-state')).toHaveAttribute('data-selected', 'river-depot');
    await expect(page.locator('.leaflet-popup')).toHaveCount(2);
    expect(await after.locator('svg path').count()).toBe(selectedPaths);
  }
  const backgrounds = await page.locator('[data-testid^="map-"]').evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
  await page.getByTestId('clear-selection').click();
  await expect(page.getByTestId('selected-state')).toHaveAttribute('data-selected', 'none');
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  expect(await after.locator('svg path').count()).toBe(originalPaths);
  await expect(page.getByTestId('clear-selection')).toBeDisabled();
});

test('scale changes alter label density and synchronize the comparison views', async ({ page }) => {
  await ready(page);
  const counts = [];
  const resolutions = [];
  for (const scale of ['overview', 'working', 'detail']) {
    await page.getByTestId(`scale-${scale}`).click();
    await expect(page.getByTestId('scale-state')).toHaveAttribute('data-scale', scale);
    counts.push(Number(await page.getByTestId('label-count').getAttribute('data-count')));
    resolutions.push(Number(await page.getByTestId('scale-state').getAttribute('data-mpp')));
    await expectLinkedViews(page);
  }
  expect(counts[0]).toBeLessThan(counts[1]);
  expect(counts[1]).toBeLessThan(counts[2]);
  expect(resolutions[0]).toBeGreaterThan(resolutions[1]);
  expect(resolutions[1]).toBeGreaterThan(resolutions[2]);
  const beforeCenter = await page.getByTestId('view-before').getAttribute('data-center');
  await page.getByTestId('map-before').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('view-before')).not.toHaveAttribute('data-center', beforeCenter);
  await expectLinkedViews(page);
});

test('mobile layout supports keyboard selection and survives viewport resizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const before = await page.getByTestId('map-before').boundingBox();
  const after = await page.getByTestId('map-after').boundingBox();
  expect(after.y).toBeGreaterThan(before.y + before.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const site = page.getByTestId('site-west-hub');
  await site.focus();
  await page.keyboard.press('Enter');
  await expect(site).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-state')).toHaveAttribute('data-selected', 'west-hub');
  await page.getByTestId('theme-select').selectOption('night-operations');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectLinkedViews(page);
  await expect(page.getByTestId('selected-state')).toHaveAttribute('data-selected', 'west-hub');
  await expect(page.getByTestId('map-after').locator('.leaflet-popup')).toBeVisible();
});
