// Static server for the case projects. No bundler, no build step: a case is started,
// edited, and verified straight from these files, which keeps the before/after diff
// reviewable as plain source.
//
//   node cases/serve.mjs            -> http://127.0.0.1:4174/cases/leaflet-raster/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.CASE_PORT || 4174);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json',
};

export function createCaseServer(root = ROOT) {
  return createServer(async (request, response) => {
    try {
      let path;
      try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
      catch { response.writeHead(400).end('invalid request path'); return; }
      let target = resolve(root, `.${path === '/' ? '/cases/index.html' : path}`);
      const within = relative(root, target);
      if (within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(within)) {
        response.writeHead(404).end('not found'); return;
      }
      if (await isDirectory(target)) target = join(target, 'index.html');
      if (!await isFile(target)) { response.writeHead(404).end('not found'); return; }
      const body = await readFile(target);
      response.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream',
                                'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(500).end('could not read requested file');
    }
  });
}

export async function startCaseServer(port = 0, root = ROOT) {
  const server = createCaseServer(root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}
async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { url } = await startCaseServer(PORT);
  console.log(`Cases on ${url}/cases/`);
}
