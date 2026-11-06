import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const CHECKER = resolve(ROOT, 'skills/map-aesthetic/scripts/consistency.mjs');

function fixture(kind) {
  const different = kind === 'different' ? ' class="different"' : '';
  const hidden = kind === 'hidden' ? '<section hidden><h2>Hidden heading</h2></section>' : '';
  const pageError = kind === 'error' ? '<script>throw new Error("fixture page crash")</script>' : '';
  const motion = kind === 'motion' ? ' motion' : '';
  return `<!doctype html><html><head><style>
    body { color: #111; background: white; font: 16px sans-serif; }
    h1 { font-size: 24px; } h2 { font-size: 30px; }
    nav { display: flex; } nav button { width: 80px; height: 44px; border-radius: 0; font-size: 14px; }
    nav button.different { border-radius: 8px; }
    button:focus-visible { outline: 2px solid blue; }
    @keyframes motion-fixture { from { transform: translateX(0); } to { transform: translateX(4px); } }
    @media (prefers-reduced-motion: reduce) {
      .reduced-fixture { opacity: .6; } .motion { animation: motion-fixture 10s infinite; }
    }
  </style></head><body><h1>Map page</h1>${hidden}
    <nav><button>One</button><button${different}>Two</button><button>Three</button></nav>
    <div class="reduced-fixture${motion}">Motion fixture</div>${pageError}</body></html>`;
}

test('checker distinguishes real findings from hidden or unavailable states', async t => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fixture(req.url.slice(1)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function run(kind) {
    try {
      const result = await exec(process.execPath, [CHECKER, `${base}/${kind}`, '--widths', '390', '--json'],
        { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
      return { code: 0, report: JSON.parse(result.stdout) };
    } catch (error) {
      if (!error.stdout) throw error;
      return { code: error.code, report: JSON.parse(error.stdout) };
    }
  }
  try {
    await t.test('matching controls are not flagged, hidden headings are ignored, and missing map checks skip', async () => {
      const { report } = await run('hidden');
      const rows = new Map(report.table.map(row => [row.rule, row.cells[0]]));
      assert.equal(rows.get('button-styles'), 'PASS');
      assert.equal(rows.get('heading-scale'), 'PASS');
      assert.equal(rows.get('annotation-overlap'), 'SKIP');
      assert.equal(rows.get('annotation-outside'), 'SKIP');
      assert.equal(rows.get('popup-covers-feature'), 'SKIP');
      assert.equal(rows.get('legend-correspondence'), 'SKIP');
      assert.equal(rows.get('reduced-motion'), 'PASS');
    });
    await t.test('reduced-motion detects an animation that is still running', async () => {
      const { report } = await run('motion');
      assert.equal(report.table.find(row => row.rule === 'reduced-motion').cells[0], 'WARN');
    });
    await t.test('inconsistent controls are reported', async () => {
      const { report } = await run('different');
      assert.equal(report.table.find(row => row.rule === 'button-styles').cells[0], 'FAIL');
    });
    await t.test('page exceptions make the run fail', async () => {
      const { code, report } = await run('error');
      assert.equal(code, 1);
      assert.ok(report.findings.some(row => row.rule === 'page-errors'
        && row.findings.some(finding => finding.error.includes('fixture page crash'))));
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
