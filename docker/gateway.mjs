import http from 'node:http';
import { spawn } from 'node:child_process';
import { isPublicInternalPath, targetFor } from './gateway-routing.mjs';
import { forwardedHeaders } from './gateway-headers.mjs';

const gatewayPort = numberFromEnv('PORT', 3000);
const nonoPort = numberFromEnv('NONO_INTERNAL_PORT', 3001);
const blogPort = numberFromEnv('BLOG_INTERNAL_PORT', 2025);
const nomoneyPort = numberFromEnv('NOMONEY_INTERNAL_PORT', 2030);
const yumiPort = numberFromEnv('YUMI_INTERNAL_PORT', 2040);
const upstreamTimeoutMs = numberFromEnv('GATEWAY_UPSTREAM_TIMEOUT_MS', 30_000);
const children = new Set();
const servicePorts = { nono: nonoPort, blog: blogPort, nomoney: nomoneyPort, yumi: yumiPort };
const trustForwardedHeaders = process.env.GATEWAY_TRUST_FORWARDED_HEADERS === 'true';
let shuttingDown = false;
let server;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function startService(name, cwd, entrypoint, port, extraEnv = {}) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '0.0.0.0',
      HOSTNAME: '0.0.0.0',
      ...extraEnv,
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

function proxyRequest(request, response) {
  const url = request.url || '/';
  if (isPublicInternalPath(url)) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const legacyYumiPath = legacyYumiRedirect(url);
  if (legacyYumiPath) {
    response.writeHead(308, { location: legacyYumiPath });
    response.end();
    return;
  }
  if (url === '/blog' || url.startsWith('/blog/') || url.startsWith('/blog?')) {
    response.writeHead(308, { location: url.replace('/blog', '/nodesk') });
    response.end();
    return;
  }

  const target = targetFor(request.url, servicePorts);
  const headers = forwardedHeaders({
    headers: request.headers,
    remoteAddress: request.socket.remoteAddress,
    trustForwardedHeaders,
  });
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: target.port,
    method: request.method,
    path: target.path,
    headers,
  }, upstream => {
    response.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(response);
  });

  let timedOut = false;
  proxy.setTimeout(upstreamTimeoutMs, () => {
    timedOut = true;
    proxy.destroy(new Error(`Upstream ${target.name} timed out`));
  });
  proxy.on('error', () => {
    if (response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(timedOut ? 504 : 502, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      error: timedOut ? 'gateway_timeout' : 'service_unavailable',
      service: target.name,
    }));
  });

  request.pipe(proxy);
}

function proxyUpgrade(request, socket, head) {
  if (isPublicInternalPath(request.url || '/')) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  const target = targetFor(request.url, servicePorts);
  const headers = forwardedHeaders({
    headers: request.headers,
    remoteAddress: request.socket.remoteAddress,
    trustForwardedHeaders,
  });
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: target.port,
    method: request.method,
    path: target.path,
    headers,
  });
  let timedOut = false;

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

  proxy.setTimeout(upstreamTimeoutMs, () => {
    timedOut = true;
    proxy.destroy();
    if (!socket.destroyed) socket.end('HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\n\r\n');
  });
  proxy.on('error', () => {
    if (!timedOut) socket.destroy();
  });
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
startService('nomoney', '/app/nomoney', 'backend/dist/index.js', nomoneyPort, {
  PRODUCT_MODE: 'nomoney',
  APP_DATA_DIR: process.env.NOMONEY_DATA_DIR || '/app/nomoney-data',
  JWT_SECRET: process.env.NOMONEY_JWT_SECRET || '',
  NOMONEY_INTERNAL_TOKEN: process.env.NOMONEY_INTERNAL_TOKEN || '',
  NONO_PUBLIC_URL: process.env.NONO_PUBLIC_URL || '',
  COOKIE_SECURE: process.env.NOMONEY_COOKIE_SECURE || 'true',
  COOKIE_PATH: '/nomoney',
  SMTP_HOST: process.env.NOMONEY_SMTP_HOST || process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.NOMONEY_SMTP_PORT || process.env.SMTP_PORT || '587',
  SMTP_USER: process.env.NOMONEY_SMTP_USER || process.env.SMTP_USER || '',
  SMTP_PASS: process.env.NOMONEY_SMTP_PASS || process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.NOMONEY_SMTP_FROM || process.env.SMTP_FROM || '',
  SMTP_TO: process.env.NOMONEY_SMTP_TO || process.env.SMTP_TO || '',
});
startService('yumi', '/app/nomoney', 'backend/dist/index.js', yumiPort, {
  PRODUCT_MODE: 'yumi',
  APP_DATA_DIR: process.env.YUMI_DATA_DIR || '/app/yumi-data',
  NOMONEY_DATA_DIR: process.env.NOMONEY_DATA_DIR || '/app/nomoney-data',
  JWT_SECRET: process.env.YUMI_JWT_SECRET || '',
  NOMONEY_INTERNAL_TOKEN: process.env.NOMONEY_INTERNAL_TOKEN || '',
  NONO_PUBLIC_URL: process.env.NONO_PUBLIC_URL || '',
  COOKIE_SECURE: process.env.YUMI_COOKIE_SECURE || process.env.NOMONEY_COOKIE_SECURE || 'true',
  COOKIE_PATH: '/yumi',
  YUMI_ENCRYPTION_KEY: process.env.YUMI_ENCRYPTION_KEY || '',
  NOMONEY_ENCRYPTION_KEY: process.env.NOMONEY_ENCRYPTION_KEY || '',
  SMTP_HOST: process.env.YUMI_SMTP_HOST || process.env.NOMONEY_SMTP_HOST || process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.YUMI_SMTP_PORT || process.env.NOMONEY_SMTP_PORT || process.env.SMTP_PORT || '587',
  SMTP_USER: process.env.YUMI_SMTP_USER || process.env.NOMONEY_SMTP_USER || process.env.SMTP_USER || '',
  SMTP_PASS: process.env.YUMI_SMTP_PASS || process.env.NOMONEY_SMTP_PASS || process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.YUMI_SMTP_FROM || process.env.NOMONEY_SMTP_FROM || process.env.SMTP_FROM || '',
  SMTP_TO: process.env.YUMI_SMTP_TO || process.env.NOMONEY_SMTP_TO || process.env.SMTP_TO || '',
});

function legacyYumiRedirect(url) {
  for (const route of ['vps', 'domains']) {
    const prefix = `/nomoney/${route}`;
    if (url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)) {
      return `/yumi/${route}${url.slice(prefix.length)}`;
    }
  }
  return null;
}

server = http.createServer(proxyRequest);
server.on('upgrade', proxyUpgrade);
server.listen(gatewayPort, '0.0.0.0', () => {
  console.log(`Combined gateway listening on http://0.0.0.0:${gatewayPort}`);
});

process.once('SIGTERM', () => shutdown(0));
process.once('SIGINT', () => shutdown(0));
