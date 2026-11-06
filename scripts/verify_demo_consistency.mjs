// Run the shipped browser checker over the three-direction demo, at every
// supported width, and write the per-direction reports under output/.
//
//   node scripts/verify_demo_consistency.mjs
//
// This is the regression gate for the checker itself: after a rule is edited,
// the real demo must still come back clean. It serves the demo locally, so no
// network access or paid service is involved.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCaseServer } from '../cases/serve.mjs';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = resolve(ROOT, 'skills/map-aesthetic/scripts/consistency.mjs');
const OUT = resolve(ROOT, 'output/consistency');
const STYLES = ['light-operations', 'warm-city-guide', 'dark-monitoring'];
const WIDTHS = '1440,1024,768,390';
// The second pass opens a popup via ?site=, so the popup geometry rule is
// actually evaluated instead of being SKIP on a fresh page load.
const MODES = [
  { suffix: '', query: style => `?style=${style}` },
  { suffix: '-selected', query: style => `?style=${style}&site=S01` },
];

mkdirSync(OUT, { recursive: true });
const { server, url } = await startCaseServer(0);
const results = [];

try {
  for (const style of STYLES) for (const mode of MODES) {
    const name = `${style}${mode.suffix}`;
    const target = `${url}/demo/three-directions/${mode.query(style)}`;
    let stdout = '';
    let code = 0;
    try {
      const run = await exec(process.execPath,
        [CHECKER, target, '--widths', WIDTHS, '--json'],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
      stdout = run.stdout;
    } catch (error) {
      stdout = error.stdout || '';
      code = error.code ?? 2;
    }
    if (!stdout.trim()) {
      results.push({ style: name, error: `checker produced no JSON (exit ${code})`, fails: -1, warns: -1 });
      continue;
    }
    const report = JSON.parse(stdout);
    writeFileSync(resolve(OUT, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const nonPass = report.table
      .flatMap(row => row.cells.map((cell, i) => ({ rule: row.rule, width: report.states[i]?.width, cell })))
      .filter(row => row.cell !== 'PASS');
    const popupCells = report.table.find(row => row.rule === 'popup-covers-feature')?.cells ?? [];
    const popupSkipped = popupCells.filter(cell => cell === 'SKIP').length;
    results.push({ style: name, fails: report.fails, warns: report.warns,
      nonPass, states: report.states.length, popupSkipped,
      selected: mode.suffix === '-selected' });
  }
} finally {
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}

const summary = { widths: WIDTHS.split(',').map(Number), results };
writeFileSync(resolve(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
for (const row of results) {
  if (row.error) { console.log(`${row.style}: ${row.error}`); continue; }
  console.log(`${row.style}: ${row.states} states, ${row.fails} FAIL, ${row.warns} WARN, `
    + `${row.nonPass.length} non-PASS cells, popup SKIP ${row.popupSkipped}`);
  row.nonPass.forEach(cell => console.log(`  ${cell.width}px ${cell.rule}: ${cell.cell}`));
}
const bad = results.filter(row => row.error || row.fails !== 0 || row.warns !== 0
  || (row.selected && row.popupSkipped > 0));
console.log(`\n${bad.length ? 'REGRESSION' : 'CLEAN'}: ${bad.length} of ${results.length} directions not clean`);
process.exit(bad.length ? 1 : 0);
