import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { forwardedHeaders } from '../docker/gateway-headers.mjs';

test('ignores client supplied forwarding headers unless proxy trust is enabled', () => {
  const headers = forwardedHeaders({
    headers: {
      host: 'noaul.com',
      'x-forwarded-for': '10.0.0.1',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'http',
    },
    remoteAddress: '198.51.100.20',
    trustForwardedHeaders: false,
  });

  assert.equal(headers['x-forwarded-for'], '198.51.100.20');
  assert.equal(headers['x-forwarded-host'], 'noaul.com');
  assert.equal(headers['x-forwarded-proto'], 'http');
});

test('uses only the first valid forwarded address when proxy trust is enabled', () => {
  const headers = forwardedHeaders({
    headers: {
      host: 'noaul.com',
      'x-forwarded-for': '203.0.113.8, 172.18.0.1',
      'x-forwarded-proto': 'https, http',
    },
    remoteAddress: '172.18.0.1',
    trustForwardedHeaders: true,
  });

  assert.equal(headers['x-forwarded-for'], '203.0.113.8');
  assert.equal(headers['x-forwarded-host'], 'noaul.com');
  assert.equal(headers['x-forwarded-proto'], 'https');
});

test('falls back to the socket address for malformed forwarded values', () => {
  const headers = forwardedHeaders({
    headers: {
      host: 'noaul.com',
      'x-forwarded-for': 'not-an-ip',
      'x-forwarded-proto': 'javascript',
    },
    remoteAddress: '::ffff:192.0.2.9',
    trustForwardedHeaders: true,
  });

  assert.equal(headers['x-forwarded-for'], '192.0.2.9');
  assert.equal(headers['x-forwarded-proto'], 'http');
});

test('packages the trusted forwarding helper in the runtime image', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /COPY docker\/gateway-headers\.mjs \.\/gateway-headers\.mjs/);
});

test('bounds upstream requests and reports gateway timeouts separately', () => {
  const gateway = fs.readFileSync('docker/gateway.mjs', 'utf8');
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');

  assert.match(gateway, /GATEWAY_UPSTREAM_TIMEOUT_MS/);
  assert.match(gateway, /proxy\.setTimeout\(upstreamTimeoutMs/);
  assert.match(gateway, /504/);
  assert.match(gateway, /gateway_timeout/);
  assert.match(compose, /GATEWAY_UPSTREAM_TIMEOUT_MS: \$\{GATEWAY_UPSTREAM_TIMEOUT_MS:-30000\}/);
  assert.match(envExample, /GATEWAY_UPSTREAM_TIMEOUT_MS=30000/);
  assert.match(readme, /`GATEWAY_UPSTREAM_TIMEOUT_MS` \| `30000`/);
});
