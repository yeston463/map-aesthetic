// Capture paired desktop/mobile screenshots of the two street-atlas designs at the
// same map center/zoom/interaction state, randomly place them on the left/right,
// then compose two side-by-side comparison images with compose.py.
// Run from the project root with the case server started: node cases/serve.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
import { chromium } from 'playwright';

const beams = ['street-atlas', 'street-atlas-refined'];
const outRoot = resolve('output/street-atlas-study');
const sourceDir = resolve(outRoot, 'stills');
await mkdir(sourceDir, { recursive: true });

const viewports = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile', width: 390, height: 844 },
];
// Reference frames collected from the baseline sheet so the two designs face the
// same section of the map at the same zoom.
const reference = {
  desktop: { center: [31.226215523267516, 121.4381618994485], zoom: 16.25 },
  mobile: { center: [31.22621555684753, 121.4381504058838], zoom: 15 },
};

const browser = await chromium.launch({ headless: true });
const stills = {};
for (const dir of beams) {
  stills[dir] = {};
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const issues = [];
    page.on('pageerror', e => issues.push(String(e.message || e)));
    page.on('console', m => { if (m.type() === 'error') issues.push(m.text()); });
    await page.goto(`http://127.0.0.1:4174/demo/${dir}/`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="ready"]')?.dataset.state === 'ready', null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(view => {
      const atlas = window.__streetAtlas ?? window.__streetAtlasRefined;
      atlas.map.setView(view.center, view.zoom, { animate: false });
    }, reference[vp.key]);
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({
      layers: window.__streetAtlasRefined?.layerState() ?? window.__streetAtlas?.layerState(),
      selected: window.__streetAtlasRefined?.selected?.() ?? window.__streetAtlas?.selected?.(),
      sheetCollapsed: document.body.classList.contains('sheet-collapsed'),
      zoom: window.__streetAtlasRefined?.map.getZoom() ?? window.__streetAtlas?.map.getZoom(),
      labels: [...document.querySelectorAll('.road-label span, .marker-label span, .road-label, .site-label')]
        .filter(el => getComputedStyle(el).visibility !== 'hidden').length,
    }));
    if (state.layers?.route !== true || state.layers?.sites !== true || state.selected) issues.push(`unexpected state: ${JSON.stringify(state)}`);
    await page.screenshot({ path: resolve(sourceDir, `${dir}-${vp.key}.png`) });
    stills[dir][vp.key] = resolve(sourceDir, `${dir}-${vp.key}.png`);
    stills[dir][`${vp.key}-state`] = { ...state, url: `http://127.0.0.1:4174/demo/${dir}/` };
    if (issues.length) console.log(`${dir}-${vp.key}`, 'issues:', issues);
    await context.close();
  }
}
await browser.close();

// Random left/right assignment. Stored separately; not revealed before scoring.
const left = beams[randomInt(0, 2)];
const right = beams.find(b => b !== left);
const assignment = {
  pair: 'street-atlas-p1',
  left, right,
  stills,
  created_at: new Date().toISOString(),
  method: 'node:crypto randomInt(0,2)',
};
await writeFile(resolve(outRoot, 'assignment-beta.json'), `${JSON.stringify(assignment, null, 2)}\n`);
console.log('assignment recorded (sealed until scoring).');

await new Promise((ok, err) => execFile('python', ['demo/street-atlas-refined/compose.py'], (e, stdout, stderr) => {
  if (e) err(stderr || e.message); else ok(stdout);
}));
console.log(`compare images written to ${outRoot}`);
