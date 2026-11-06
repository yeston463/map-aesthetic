// Build side-by-side comparison sheets from the captured states.
//
// One sheet per viewport, three directions left to right, each with its name. These are
// design samples, not a blind comparison, so the directions are labelled.
//
// Usage: node compare.mjs [--shots DIR] [--out DIR]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueOf = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SHOTS = resolve(HERE, valueOf('--shots') ?? 'shots');
const OUT = resolve(HERE, valueOf('--out') ?? 'shots');
const PLAYWRIGHT = 'C:/Users/赵航/Desktop/studio/_review_map_aesthetic/node_modules/playwright/index.mjs';

const COLUMNS = [
  { style: 'light-operations', name: '浅色运营', note: '监控视角' },
  { style: 'warm-city-guide', name: '暖色城市导览', note: '面向读者' },
  { style: 'dark-monitoring', name: '深色监控', note: '值班大屏' },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, sheet: [1680, 470] },
  { name: 'mobile', width: 390, height: 844, sheet: [1120, 700] },
];

mkdirSync(OUT, { recursive: true });
const dataUri = path => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);
const browser = await chromium.launch({ headless: true });

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: viewport.sheet[0], height: viewport.sheet[1] },
    deviceScaleFactor: 1 });
  const figures = COLUMNS.map(column => {
    const file = resolve(SHOTS, `${column.style}-${viewport.name}.png`);
    const data = dataUri(file);
    return `<figure><figcaption><b>${column.name}</b><span>${column.note}</span></figcaption>
      <img src="${data}"></figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f2f3f5;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}
    .sheet{display:flex;gap:14px;padding:14px;align-items:flex-start}
    figure{margin:0;flex:1;background:#fff;border:1px solid #d8dce0;border-radius:6px;overflow:hidden}
    figcaption{display:flex;align-items:baseline;gap:8px;padding:9px 12px;border-bottom:1px solid #e4e7ea}
    figcaption b{font-size:15px;color:#14181c}
    figcaption span{font-size:11px;color:#6b7480}
    img{width:100%;height:auto;display:block}
    .sheet.mobile figure{flex:0 0 auto}
    .sheet.mobile img{max-height:600px;width:auto}
    .sheet.mobile{display:flex;justify-content:center}
  </style></head><body><div class="sheet ${viewport.name}">${figures}</div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  const target = resolve(OUT, `compare-${viewport.name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  console.log(`-> ${target}`);
  await page.close();
}
await browser.close();
