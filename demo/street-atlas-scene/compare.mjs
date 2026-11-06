// Capture paired desktop/mobile screenshots of the two street operations variants
// at the same map center/zoom/interaction state, randomly place them on the left/right,
// then compose two side-by-side comparison images with compose.py.
// Run from the project root with the case server started: node cases/serve.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { chromium } from 'playwright';

const variants = ['a', 'b'];
const outRoot = resolve('output/street-atlas-scene');
const sourceDir = resolve(outRoot, 'stills');
await mkdir(sourceDir, { recursive: true });

const viewports = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile', width: 390, height: 844 },
];
const reference = {
  desktop: { center: [31.22622262627436, 121.43815599999999], zoom: 16.25 },
  mobile: { center: [31.22622262627436, 121.43815599999999], zoom: 15 },
};

const browser = await chromium.launch({ headless: true });
const stills = {};
for (const key of variants) {
  stills[`scene-${key}`] = {};
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const issues = [];
    page.on('pageerror', e => issues.push(String(e.message || e)));
    page.on('console', m => { if (m.type() === 'error') issues.push(m.text()); });
    await page.goto(`http://127.0.0.1:4174/demo/street-atlas-scene/scene-${key}/`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(view => window.__sceneApp.map.setView(view.center, view.zoom, { animate: false }), reference[vp.key]);
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({
      layers: window.__sceneApp.layerState(),
      slot: window.__sceneApp.slot(),
      selectedSite: window.__sceneApp.selectedSite(),
      sheetCollapsed: document.body.classList.contains('sheet-collapsed'),
    }));
    if (state.layers?.routes !== true || state.layers?.sites !== true || state.layers?.zones !== true
      || state.slot !== 'early' || state.selectedSite || state.sheetCollapsed === false) {
      issues.push(`unexpected state: ${JSON.stringify(state)}`);
    }
    await page.screenshot({ path: resolve(sourceDir, `scene-${key}-${vp.key}.png`) });
    stills[`scene-${key}`][vp.key] = resolve(sourceDir, `scene-${key}-${vp.key}.png`);
    stills[`scene-${key}`][`${vp.key}-state`] = { ...state, url: `http://127.0.0.1:4174/demo/street-atlas-scene/scene-${key}/` };
    if (issues.length) console.log(`scene-${key}-${vp.key}`, 'issues:', issues);
    await context.close();
  }
}
await browser.close();

const leftKey = `scene-${variants[randomInt(0, 2)]}`;
const rightKey = leftKey === 'scene-a' ? 'scene-b' : 'scene-a';
const assignment = {
  pair: 'street-operations-p1',
  left: leftKey, right: rightKey,
  stills,
  created_at: new Date().toISOString(),
  method: 'node:crypto randomInt(0,2)',
};
await writeFile(resolve(outRoot, 'assignment-scene.json'), `${JSON.stringify(assignment, null, 2)}\n`);
console.log('assignment recorded (sealed until scoring).');
await new Promise((ok, err) => execFile('python', ['demo/street-atlas-scene/compose.py'], (e, stdout, stderr) => {
  if (e) err(stderr || e.message); else ok(stdout);
}));
console.log(`compare images written to ${outRoot}`);
