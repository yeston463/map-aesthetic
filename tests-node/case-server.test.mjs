import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { startCaseServer } from '../cases/serve.mjs';

test('server rejects malformed and escaping paths and remains usable', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'map-case-server-'));
  const root = join(temporary, 'site'); const sibling = join(temporary, 'site-other');
  await mkdir(root); await mkdir(sibling);
  await writeFile(join(root, 'index.html'), 'local fixture');
  await writeFile(join(sibling, 'outside.txt'), 'must not be served');
  const { server, url } = await startCaseServer(0, root);
  try {
    assert.equal((await fetch(`${url}/%ZZ`)).status, 400);
    assert.equal((await fetch(`${url}/..%2Fsite-other%2Foutside.txt`)).status, 404);
    const response = await fetch(`${url}/index.html`);
    assert.equal(response.status, 200); assert.equal(await response.text(), 'local fixture');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const cleanupTarget = relative(resolve(tmpdir()), resolve(temporary));
    if (!cleanupTarget.startsWith('map-case-server-') || /[\\/]/.test(cleanupTarget)) {
      throw Error('Refusing cleanup outside the named test directory');
    }
    await rm(temporary, { recursive: true });
  }
});
