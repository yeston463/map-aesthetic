// rule-fixtures.test.mjs — prove that every rule in the shipped skill can both
// fire on a real violation and stay silent on a compliant page.
//
// A checker that never reports anything looks identical to a checker that
// works. These fixtures are the difference: one shared compliant baseline, one
// single defect per page, and one clean and one violating source file per static
// rule. The run writes output/rule-coverage.json as the coverage record.
//
//   node --test tests-node/rule-fixtures.test.mjs
//
// No network access, no paid API, no browser download: Playwright is resolved
// from this repository and every fixture is served from an in-memory server.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const exec = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const BROWSER_CHECKER = resolve(ROOT, 'skills/map-aesthetic/scripts/consistency.mjs');
const STATIC_CHECKER = resolve(ROOT, 'skills/map-aesthetic/scripts/check_anti_patterns.py');
const PYTHON = process.env.PYTHON || 'python';
const OUTPUT = resolve(ROOT, 'output/rule-coverage.json');

// ------------------------------------------------------------------ browser

const PIXEL = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';

function fixture(overrides = {}) {
  const focusRule = overrides.focusRule === undefined
    ? 'button:focus-visible { outline: 2px solid #14558a; }'
    : overrides.focusRule;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { margin: 0; color: #1f2933; background: #ffffff; font: 14px/1.5 system-ui, sans-serif; }
  a { color: #1f2933; }
  h1 { font-size: 28px; } h2 { font-size: 20px; } h3 { font-size: 16px; }
  nav { display: flex; gap: 8px; }
  nav button, .card { border: 1px solid #ccd4dd; border-radius: 8px;
    background: #f7f8fa; color: #1f2933; font-size: 14px;
    height: 44px; min-width: 64px; padding: 0 12px; }
  .card { height: auto; padding: 12px; }
  output, .readout { font-variant-numeric: tabular-nums; }
  .leaflet-control-attribution { font-size: 11px; color: #3e4c59;
    background: #ffffff; padding: 4px 8px; }
  .leaflet-control-zoom { width: 44px; }
  .leaflet-control-zoom a { display: block; width: 44px; height: 44px; }
  .leaflet-interactive { cursor: pointer; }
  .leaflet-popup-content-wrapper { border-radius: 8px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, .12); padding: 8px; }
  ${focusRule}
  ${overrides.style || ''}
</style>
<script>
  window.__demo = {
    labelBoxes: () => [
      { text: '甲', left: 10, right: 60, top: 10, bottom: 30 },
      { text: '乙', left: 70, right: 120, top: 10, bottom: 30 }
    ],
    mapBox: () => ({ left: 0, right: 390, top: 0, bottom: 800 }),
    selected: () => null,
    markerBox: () => null,
    legendColors: () => [{ text: '低值', bound: '#7a9cc6' }]
  };
  ${overrides.demo || ''}
</script>
</head><body>
  <h1>站点分布总览</h1>
  <h2>城区业务量</h2>
  <p>这是一段足够长的说明文字，用来检查正文字号是否达到可读下限。</p>
  <nav><button>浅色运营</button><button>暖色导览</button></nav>
  <div class="card">数值面板</div>
  <output>1234</output>
  <div class="leaflet-container">
    ${overrides.attribution === undefined
      ? '<div class="leaflet-control-attribution">数据源：示例矢量底图 | Leaflet</div>'
      : overrides.attribution}
    ${overrides.zoom === undefined
      ? '<div class="leaflet-control-zoom"><a href="#">+</a><a href="#">-</a></div>'
      : overrides.zoom}
    <div class="leaflet-pane leaflet-districts-pane"><svg width="200" height="120">
      ${overrides.path === undefined
        ? '<path class="leaflet-interactive" fill="#7a9cc6" fill-opacity="0.35" stroke="#9db4cd" d="M0 0L100 0L100 60L0 60Z"></path>'
        : overrides.path}
    </svg></div>
    ${overrides.popup === undefined
      ? '<div class="leaflet-popup"><div class="leaflet-popup-content-wrapper">站点详情</div></div>'
      : overrides.popup}
  </div>
  ${overrides.body || ''}
</body></html>`;
}

// One defect per page. `expected` is the severity the rule must produce.
const BROWSER_CASES = {
  'text-contrast': {
    expected: 'FAIL',
    page: { body: '<div style="color:#cbd2d9;background:#ffffff">低对比说明</div>' },
  },
  'body-size': {
    expected: 'WARN',
    page: { body: '<p style="font-size:10px">这是一段足够长的说明文字，用来检查正文字号是否达到可读下限。</p>' },
  },
  'tap-target': {
    expected: 'WARN',
    page: { body: '<button style="width:30px;height:30px;min-width:0">小</button>' },
  },
  'button-styles': {
    expected: 'FAIL',
    page: { style: 'nav button:last-child { border-radius: 2px; }' },
  },
  'heading-scale': {
    expected: 'FAIL',
    page: { body: '<h1 style="font-size:16px">另一个标题</h1>' },
  },
  'radius-family': {
    expected: 'WARN',
    page: { body: '<div class="card" style="border-radius:3px">甲</div>'
      + '<div class="card" style="border-radius:12px">乙</div>'
      + '<div class="card" style="border-radius:18px">丙</div>'
      + '<div class="card" style="border-radius:24px">丁</div>' },
  },
  'focus-visible': { expected: 'FAIL', page: { focusRule: '' } },
  'raw-colour': {
    expected: 'FAIL',
    page: { body: '<div style="color:#ff0000">纯红文字</div>' },
  },
  'opaque-fill': {
    expected: 'FAIL',
    page: { path: '<path class="leaflet-interactive" fill="#7a9cc6" fill-opacity="1" stroke="#9db4cd" d="M0 0L100 0L100 60L0 60Z"></path>' },
  },
  'cursor-pointer': {
    expected: 'WARN',
    page: { style: '.leaflet-interactive { cursor: default; }' },
  },
  'default-popup': {
    expected: 'WARN',
    page: { style: '.leaflet-popup-content-wrapper { border-radius: 0; box-shadow: 0 0 8px rgba(0,0,0,0.5); }' },
  },
  'pin-density': {
    expected: 'WARN',
    page: { body: Array.from({ length: 31 }, () =>
      `<div class="leaflet-marker-icon"><img alt="pin" src="${PIXEL}"></div>`).join('') },
  },
  'attribution-legible': {
    expected: 'FAIL',
    page: { style: '.leaflet-control-attribution { display: none; }' },
  },
  'tabular-numbers': {
    expected: 'WARN',
    page: { body: '<output style="font-variant-numeric:proportional-nums">5678</output>' },
  },
  'annotation-overlap': {
    expected: 'FAIL',
    page: { demo: `window.__demo.labelBoxes = () => [
      { text: '甲', left: 10, right: 60, top: 10, bottom: 30 },
      { text: '乙', left: 30, right: 80, top: 12, bottom: 32 } ];` },
  },
  'annotation-outside': {
    expected: 'FAIL',
    page: { demo: `window.__demo.labelBoxes = () => [
      { text: '出界', left: -30, right: 20, top: 10, bottom: 30 } ];` },
  },
  'popup-covers-feature': {
    expected: 'FAIL',
    page: {
      popup: '<div class="leaflet-popup" style="position:fixed;left:0;top:0;width:120px;height:120px">'
        + '<div class="leaflet-popup-content-wrapper">站点详情</div></div>',
      demo: `window.__demo.selected = () => 's1';
        window.__demo.markerBox = () => ({ left: 0, right: 100, top: 0, bottom: 100 });`,
    },
  },
  'legend-correspondence': {
    expected: 'FAIL',
    page: { demo: `window.__demo.legendColors = () => [{ text: '孤例', bound: '#123456' }];` },
  },
  'attribution-present': {
    expected: 'FAIL',
    page: { attribution: '<div class="leaflet-control-attribution">Leaflet</div>' },
  },
  'controls-reachable': { expected: 'WARN', page: { zoom: '' } },
  'filler-words': { expected: 'WARN', page: { body: '<button>了解更多</button>' } },
  'placeholder-text': { expected: 'FAIL', page: { body: '<span>待补充内容</span>' } },
  'label-not-noun': { expected: 'WARN', page: { body: '<h2>功能一览</h2>' } },
  'scroll-reveal': {
    expected: 'FAIL',
    page: {
      style: '@keyframes fadeInX { from { opacity: 0; } to { opacity: 1; } }'
        + ' .reveal { animation: fadeInX 0.3s ease both; }',
      body: '<div class="reveal">出现</div>',
    },
  },
  'motion-duration': {
    expected: 'WARN',
    page: { body: '<button style="transition-duration:0.5s">慢动作</button>' },
  },
  'reduced-motion': {
    expected: 'WARN',
    page: {
      style: '@keyframes spinX { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
        + ' .spin { animation: spinX 10s linear infinite; }',
      body: '<div class="spin">转</div>',
    },
  },
};

// ------------------------------------------------------------------- static

const LONG_POINTS = Array.from({ length: 12 }, (_, i) =>
  `{ lat: 30.${100 + i}, lng: 114.${200 + i}, name: 'site-${i}' }`).join(', ');

const STATIC_CASES = {
  'raw-colour': {
    bad: ['raw.js', `const style = { color: '#ff0000' };`],
    good: ['raw.css', `.label { color: #b5453e; }`],
  },
  'opaque-fill': {
    bad: ['area.js', `const districts = { fillOpacity: 1, fillColor: '#7a9cc6' };`],
    good: ['area.js', `const districts = { fillOpacity: 0.35, fillColor: '#7a9cc6' };`],
  },
  'default-popup': {
    bad: ['popup.js', `marker.bindPopup(html);`],
    good: ['popup.js', `marker.bindPopup(html, { className: 'site-popup' });`],
  },
  'pin-density': {
    bad: ['pins.js', `const points = [${LONG_POINTS}]; L.marker(points[0]).addTo(map);`],
    good: ['pins.js', `const points = [${LONG_POINTS}]; const cluster = L.markerClusterGroup();`],
  },
  'attribution-hidden': {
    bad: ['attrib.css', `.leaflet-control-attribution { display: none; }`],
    good: ['attrib.css', `.leaflet-control-attribution { font-size: 11px; color: #3e4c59; }`],
  },
  'cursor-pointer': {
    bad: ['cursor.js', `document.querySelector('#site').addEventListener('click', () => select());`],
    good: ['cursor.js', `const cursorStyle = 'cursor: pointer';\n`
      + `document.querySelector('#site').addEventListener('click', () => select());`],
  },
  'tabular-numbers': {
    bad: ['figures.css', `.readout { color: #3e4c59; } /* 业务量 */`],
    good: ['figures.css', `.readout { font-variant-numeric: tabular-nums; } /* 业务量 */`],
  },
  'basemap-provider': {
    bad: ['basemap.js', `const url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';`],
    good: ['basemap.js', `L.tileLayer('https://t{s}.tianditu.gov.cn/DataServer?T=vec_w',`
      + ` { attribution: '天地图' });`],
  },
  'attribution-missing': {
    bad: ['tiles.js', `L.tileLayer('https://example.com/{z}/{x}/{y}.png');`],
    good: ['tiles.js', `L.tileLayer('https://example.com/{z}/{x}/{y}.png',`
      + ` { attribution: '示例数据' });`],
  },
};

// ------------------------------------------------------------------ helpers

async function runChecker(command, args, options = {}) {
  try {
    const result = await exec(command, args, {
      cwd: ROOT, maxBuffer: 16 * 1024 * 1024, timeout: 60000, ...options,
    });
    return { code: 0, report: JSON.parse(result.stdout) };
  } catch (error) {
    if (!error.stdout) throw error;
    return { code: error.code, report: JSON.parse(error.stdout) };
  }
}

function browserTable(report) {
  return new Map(report.table.map(row => [row.rule, row.cells[0]]));
}

// --------------------------------------------------------------------- tests

test('every browser rule fires on its own violation and stays silent on the baseline', async t => {
  const pages = new Map([['baseline', fixture()]]);
  for (const [rule, spec] of Object.entries(BROWSER_CASES)) {
    pages.set(rule, fixture(spec.page));
  }
  const server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.slice(1).split('?')[0]) || 'baseline';
    if (name === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    const body = pages.get(name);
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body || 'missing fixture');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const coverage = {};

  async function check(name) {
    const { report } = await runChecker(process.execPath,
      [BROWSER_CHECKER, `${base}/${name}`, '--widths', '390', '--json']);
    assert.equal(report.findings.filter(f => f.rule === 'page-errors').length, 0,
      `${name}: unexpected page errors`);
    return browserTable(report);
  }

  try {
    const baseline = await check('baseline');
    const bad = [...baseline.entries()].filter(([, cell]) => cell !== 'PASS');
    assert.deepEqual(bad, [], `baseline must be clean, got: ${JSON.stringify(bad)}`);
    assert.equal(baseline.size, Object.keys(BROWSER_CASES).length,
      'the checker table must contain exactly the rules under test');

    for (const [rule, spec] of Object.entries(BROWSER_CASES)) {
      await t.test(`${rule}: violation -> ${spec.expected}, baseline -> PASS`, async () => {
        const table = await check(rule);
        const cell = table.get(rule);
        assert.equal(cell, spec.expected,
          `${rule} did not fire as ${spec.expected} (got ${cell})`);
        coverage[rule] = { baseline: baseline.get(rule), violation: cell };
      });
    }
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
  globalThis.__browserCoverage = coverage;
});

test('every static rule fires on its own violation and stays silent on its clean pair', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'map-rule-fixtures-'));
  const coverage = {};
  try {
    for (const [rule, spec] of Object.entries(STATIC_CASES)) {
      await t.test(`${rule}: bad -> reported, good -> clean`, async () => {
        const badPath = join(dir, `bad-${rule}-${spec.bad[0]}`);
        const goodPath = join(dir, `good-${rule}-${spec.good[0]}`);
        await Promise.all([
          writeFile(badPath, spec.bad[1], 'utf8'),
          writeFile(goodPath, spec.good[1], 'utf8'),
        ]);
        const bad = await runChecker(PYTHON, [STATIC_CHECKER, badPath, '--json']);
        const good = await runChecker(PYTHON, [STATIC_CHECKER, goodPath, '--json']);
        const badRules = new Set(bad.report.findings.map(f => f.rule));
        assert.ok(badRules.has(rule),
          `${rule} did not fire; got ${JSON.stringify([...badRules])}`);
        assert.deepEqual(good.report.findings, [],
          `${rule} clean fixture produced findings: ${JSON.stringify(good.report.findings)}`);
        coverage[rule] = {
          badSeverity: bad.report.findings.find(f => f.rule === rule).severity,
          cleanFindings: good.report.findings.length,
        };
      });
    }
    await t.test('cursor-pointer accepts a project stylesheet, not just the same file', async () => {
      const project = await mkdtemp(join(tmpdir(), 'map-cursor-project-'));
      try {
        const js = join(project, 'bind.js');
        await writeFile(js, `document.querySelector('#site').addEventListener('click', () => select());`);
        const alone = await runChecker(PYTHON, [STATIC_CHECKER, js, '--json']);
        assert.ok(alone.report.findings.some(row => row.rule === 'cursor-pointer'),
          'a lone JS file with a click handler must still be reported');
        await writeFile(join(project, 'ui.css'), `.hud-toggle { cursor: pointer; }\n`);
        const together = await runChecker(PYTHON, [STATIC_CHECKER, project, '--json']);
        assert.equal(together.report.findings.filter(row => row.rule === 'cursor-pointer').length, 0,
          'a stylesheet in the same project must suppress the false positive');
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    });
    await t.test('the real demo and the skill itself still scan clean', async () => {
      const demo = resolve(ROOT, 'demo/three-directions');
      const skill = resolve(ROOT, 'skills/map-aesthetic');
      const { report } = await runChecker(PYTHON, [STATIC_CHECKER, demo, skill, '--json']);
      assert.equal(report.fails, 0, `static FAILs: ${JSON.stringify(report.findings)}`);
      assert.equal(report.warns, 0, `static WARNs: ${JSON.stringify(report.findings)}`);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  globalThis.__staticCoverage = coverage;
});

test('write the coverage record', async () => {
  const browser = globalThis.__browserCoverage || {};
  const staticRules = globalThis.__staticCoverage || {};
  const record = {
    note: 'A rule is covered only when a violation fixture reports it AND a compliant fixture stays silent.',
    browser_rules: browser,
    static_rules: staticRules,
    totals: {
      browser_covered: Object.keys(browser).length,
      browser_expected: Object.keys(BROWSER_CASES).length,
      static_covered: Object.keys(staticRules).length,
      static_expected: Object.keys(STATIC_CASES).length,
    },
  };
  await mkdir(resolve(ROOT, 'output'), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  assert.equal(record.totals.browser_covered, 26);
  assert.equal(record.totals.static_covered, 9);
});
