import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = path.resolve('docker/gateway-routing.mjs');

test('routes NoMoney requests and strips the public mount path', async () => {
  assert.equal(fs.existsSync(modulePath), true);
  const { targetFor } = await import(pathToFileURL(modulePath));
  const ports = { nono: 3001, blog: 2025, nomoney: 2030 };

  assert.deepEqual(targetFor('/nomoney', ports), { name: 'nomoney', port: 2030, path: '/' });
  assert.deepEqual(targetFor('/nomoney/dashboard', ports), { name: 'nomoney', port: 2030, path: '/dashboard' });
  assert.deepEqual(targetFor('/nomoney/api/auth/me?fresh=1', ports), {
    name: 'nomoney',
    port: 2030,
    path: '/api/auth/me?fresh=1',
  });
});

test('keeps Nodesk and Nono routing behavior intact', async () => {
  assert.equal(fs.existsSync(modulePath), true);
  const { targetFor } = await import(pathToFileURL(modulePath));
  const ports = { nono: 3001, blog: 2025, nomoney: 2030 };

  assert.deepEqual(targetFor('/nodesk', ports), { name: 'blog', port: 2025, path: '/nodesk' });
  assert.deepEqual(targetFor('/images/avatar.png', ports), {
    name: 'blog',
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
