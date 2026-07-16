import http from 'node:http';
import { spawn } from 'node:child_process';

const gatewayPort = numberFromEnv('PORT', 3000);
const nonoPort = numberFromEnv('NONO_INTERNAL_PORT', 3001);
const blogPort = numberFromEnv('BLOG_INTERNAL_PORT', 2025);
const children = new Set();
const blogPublicPrefixes = ['/blogs/', '/images/', '/live2d/', '/music/'];
const blogPublicFiles = new Set(['/favicon.png', '/manifest.json']);
let shuttingDown = false;
let server;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function startService(name, cwd, entrypoint, port) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '0.0.0.0',
      HOSTNAME: '0.0.0.0',
    },
    stdio: 'inherit',
  });

  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${name} exited unexpectedly (${signal || code || 0})`);
      shutdown(code || 1);
    }
  });
}

function targetFor(url = '/') {
  if (url === '/nodesk' || url.startsWith('/nodesk/') || url.startsWith('/nodesk?')) {
    return { name: 'blog', port: blogPort, path: url };
  }

  const pathname = url.split('?', 1)[0];
  if (blogPublicFiles.has(pathname) || blogPublicPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return { name: 'blog', port: blogPort, path: `/nodesk${url}` };
  }

  return { name: 'nono', port: nonoPort, path: url };
}

function proxyRequest(request, response) {
  const url = request.url || '/';
  if (url === '/blog' || url.startsWith('/blog/') || url.startsWith('/blog?')) {
    response.writeHead(308, { location: url.replace('/blog', '/nodesk') });
    response.end();
    return;
  }

  const target = targetFor(request.url);
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: target.port,
    method: request.method,
    path: target.path,
    headers: {
      ...request.headers,
      host: request.headers.host,
      'x-forwarded-host': request.headers.host || '',
      'x-forwarded-proto': request.headers['x-forwarded-proto'] || 'http',
    },
  }, upstream => {
    response.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(response);
  });

  proxy.on('error', error => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    }
    response.end(JSON.stringify({
      error: 'service_unavailable',
      service: target.name,
      message: error.message,
    }));
  });

  request.pipe(proxy);
}

function proxyUpgrade(request, socket, head) {
  const target = targetFor(request.url);
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: target.port,
    method: request.method,
    path: target.path,
    headers: request.headers,
  });

  proxy.on('upgrade', (upstream, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 ${upstream.statusCode || 101} ${upstream.statusMessage || 'Switching Protocols'}\r\n` +
      Object.entries(upstream.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n') +
      '\r\n\r\n',
    );
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  proxy.on('error', () => socket.destroy());
  proxy.end();
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  server?.close();
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

startService('nono', '/app/nono', 'packages/server/dist/server.js', nonoPort);
startService('blog', '/app/blog', 'server.js', blogPort);

server = http.createServer(proxyRequest);
server.on('upgrade', proxyUpgrade);
server.listen(gatewayPort, '0.0.0.0', () => {
  console.log(`Combined gateway listening on http://0.0.0.0:${gatewayPort}`);
});

process.once('SIGTERM', () => shutdown(0));
process.once('SIGINT', () => shutdown(0));
