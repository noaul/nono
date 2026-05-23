import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNavigationByUsername } from './navigation.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function sendStatic(response, pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(decodeURIComponent(normalizedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      'cache-control': 'public, max-age=60',
    });
    response.end(body);
  } catch {
    const fallback = await readFile(join(publicDir, 'index.html'));
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(fallback);
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true });
    return;
  }

  const navigationMatch = url.pathname.match(/^\/api\/v1\/allsiteandlinks\/([^/]+)$/);
  if (request.method === 'GET' && navigationMatch) {
    const username = decodeURIComponent(navigationMatch[1]);
    const data = getNavigationByUsername(username);

    if (!data) {
      sendJson(response, 404, { code: 404, data: null, msg: `user ${username} not found` });
      return;
    }

    sendJson(response, 200, { code: 0, data, msg: '' });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { code: 404, data: null, msg: 'api route not found' });
    return;
  }

  await sendStatic(response, url.pathname);
}

export function createServer() {
  return createHttpServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { code: 500, data: null, msg: error.message });
    });
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Nono listening on http://0.0.0.0:${port}`);
  });
}
