import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = path.resolve('docker/gateway-routing.mjs');

test('routes NoMoney requests and strips the public mount path', async () => {
  assert.equal(fs.existsSync(modulePath), true);
  const { targetFor } = await import(pathToFileURL(modulePath));
  const ports = { nono: 3001, nodesk: 2025, nomoney: 2030 };

  assert.deepEqual(targetFor('/nomoney', ports), { name: 'nomoney', port: 2030, path: '/' });
  assert.deepEqual(targetFor('/nomoney/dashboard', ports), { name: 'nomoney', port: 2030, path: '/dashboard' });
  assert.deepEqual(targetFor('/nomoney/api/auth/me?fresh=1', ports), {
    name: 'nomoney',
    port: 2030,
    path: '/api/auth/me?fresh=1',
  });
});

test('redirects retired Yumi URLs into NoMoney', async () => {
  const { retiredYumiRedirect, targetFor } = await import(pathToFileURL(modulePath));

  assert.equal(retiredYumiRedirect('/yumi/domains'), '/nomoney/domains');
  assert.equal(retiredYumiRedirect('/yumi/domains?edit=3'), '/nomoney/domains?edit=3');
  assert.equal(retiredYumiRedirect('/yumi/domains/12?tab=dns'), '/nomoney/domains/12?tab=dns');
  for (const url of ['/yumi', '/yumi/', '/yumi?x=1', '/yumi/vps?edit=2', '/yumi/status', '/yumi/domainsx', '/yumi/api/internal/vps/1/renew', '/yumi/api/status/overview']) {
    assert.equal(retiredYumiRedirect(url), '/nomoney/', url);
  }
  for (const url of ['/', '/yumix', '/nomoney/domains', '/nomoney/vps', '/api/yumi']) {
    assert.equal(retiredYumiRedirect(url), null, url);
  }
  // No upstream is ever chosen for Yumi any more.
  assert.equal(targetFor('/yumi/api/internal/vps/1/renew', { nono: 3001, nodesk: 2025, nomoney: 2030 }).name, 'nono');
});

test('keeps NoMoney domain and VPS URLs inside NoMoney', async () => {
  const { targetFor } = await import(pathToFileURL(modulePath));
  const ports = { nono: 3001, nodesk: 2025, nomoney: 2030 };
  assert.deepEqual(targetFor('/nomoney/domains?edit=1', ports), { name: 'nomoney', port: 2030, path: '/domains?edit=1' });
});

test('keeps Nodesk and Nono routing behavior intact', async () => {
  assert.equal(fs.existsSync(modulePath), true);
  const { targetFor } = await import(pathToFileURL(modulePath));
  const ports = { nono: 3001, nodesk: 2025, nomoney: 2030 };

  assert.deepEqual(targetFor('/nodesk', ports), { name: 'nodesk', port: 2025, path: '/nodesk' });
  assert.deepEqual(targetFor('/images/avatar.png', ports), {
    name: 'nodesk',
    port: 2025,
    path: '/nodesk/images/avatar.png',
  });
  const versionedAvatar = `/images/avatar-${'a'.repeat(64)}.webp`;
  assert.deepEqual(targetFor(versionedAvatar, ports), {
    name: 'nono',
    port: 3001,
    path: versionedAvatar,
  });
  assert.deepEqual(targetFor('/api/navigation/admin', ports), {
    name: 'nono',
    port: 3001,
    path: '/api/navigation/admin',
  });
});

test('identifies internal NoMoney APIs that must not be routed publicly', async () => {
  const { isPublicInternalPath } = await import(pathToFileURL(modulePath));

  assert.equal(isPublicInternalPath('/nomoney/api/internal/vps/1/renew'), true);
  assert.equal(isPublicInternalPath('/nomoney/api/internal?probe=1'), true);
  assert.equal(isPublicInternalPath('/NoMoney/API/Internal/vps/1/renew'), true);
  assert.equal(isPublicInternalPath('/nomoney/api/%69nternal/vps/1/renew'), true);
  assert.equal(isPublicInternalPath('/nomoney/api/domains'), false);
  assert.equal(isPublicInternalPath('/api/internal/auth/session'), true);
  assert.equal(isPublicInternalPath('/api/internals'), false);
});

test('retires article pages, feeds and legacy URLs while keeping desktop tools', async () => {
  const { isRetiredNodeskPath } = await import(pathToFileURL(modulePath));
  for (const url of ['/blog', '/blog/old?x=1', '/blogs/old/index.md', '/nodesk/blog/post', '/nodesk/%62log/post', '/nodesk/write', '/nodesk/write/old', '/nodesk/rss.xml']) {
    assert.equal(isRetiredNodeskPath(url), true, url);
  }
  for (const url of ['/nodesk', '/nodesk/friends', '/nodesk/projects', '/nodesk/snippets', '/nodesk/images/pictures/photo.webp']) {
    assert.equal(isRetiredNodeskPath(url), false, url);
  }
});

test('sends signed-out page loads of NoNo-only apps to the login page', async () => {
  const { loginRedirectFor } = await import(pathToFileURL(modulePath));
  const page = (url, extra = {}) => ({ method: 'GET', url, headers: { accept: 'text/html,application/xhtml+xml', ...extra } });

  assert.equal(loginRedirectFor(page('/nomoney/')), '/login?next=%2Fnomoney%2F');
  assert.equal(loginRedirectFor(page('/nomoney/domains?id=2')), '/login?next=%2Fnomoney%2Fdomains%3Fid%3D2');
  assert.equal(loginRedirectFor(page('/nostar')), '/login?next=%2Fnostar');
  assert.equal(loginRedirectFor(page('/admin/links')), '/login?next=%2Fadmin%2Flinks');

  assert.equal(loginRedirectFor(page('/nomoney/', { cookie: 'a=1; nono_session=abc' })), null);
  assert.equal(loginRedirectFor(page('/nomoney/api/phones')), null);
  assert.equal(loginRedirectFor(page('/nomoney/assets/index.js')), null);
  // Retired Yumi pages are redirected by the gateway before the login check.
  assert.equal(loginRedirectFor(page('/yumi/')), null);
  assert.equal(loginRedirectFor({ method: 'GET', url: '/nomoney/', headers: { accept: 'application/json' } }), null);
  assert.equal(loginRedirectFor({ method: 'POST', url: '/admin', headers: { accept: 'text/html' } }), null);
  assert.equal(loginRedirectFor(page('/')), null);
  assert.equal(loginRedirectFor(page('/nodesk/projects')), null);
  assert.equal(loginRedirectFor(page('/login')), null);
  assert.equal(loginRedirectFor(page('/administrator')), null);
});

 test('retired article assets no longer route to NoDesk', () => {
  const ports = { nono: 3001, nodesk: 2025, nomoney: 2030 };
  return import('../docker/gateway-routing.mjs').then(({ targetFor }) => {
    assert.equal(targetFor('/blogs/example/index.md', ports).name, 'nono');
  });
});
