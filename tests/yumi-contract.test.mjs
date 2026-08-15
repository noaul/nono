import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('packages and routes Yumi as a separate persisted product', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const gateway = fs.readFileSync('docker/gateway.mjs', 'utf8');
  const routing = fs.readFileSync('docker/gateway-routing.mjs', 'utf8');

  assert.match(dockerfile, /public-yumi/);
  assert.match(compose, /YUMI_DATA_DIR:\s*\/app\/yumi-data/);
  assert.match(compose, /yumi_data:\/app\/yumi-data/);
  assert.match(compose, /^\s*yumi_data:\s*$/m);
  assert.match(compose, /YUMI_JWT_SECRET:/);
  assert.match(compose, /YUMI_ENCRYPTION_KEY:/);
  assert.match(gateway, /NOMONEY_INTERNAL_TOKEN:\s*process\.env\.NOMONEY_INTERNAL_TOKEN/);
  assert.match(gateway, /NONO_PUBLIC_URL:\s*process\.env\.NONO_PUBLIC_URL/);
  assert.match(gateway, /startService\('yumi'/);
  assert.match(routing, /stripMountPath\(url, '\/yumi'\)/);
});

test('full backups include and verify the independent Yumi database', () => {
  const source = fs.readFileSync('packages/server/src/services/backup.service.ts', 'utf8');
  assert.match(source, /yumiDataDir/);
  assert.match(source, /yumi\.db/);
  assert.match(source, /Yumi SQLite integrity check failed/);
  assert.match(source, /components: \['postgres', 'nodesk', 'nomoney', 'yumi'\]/);
});

test('homepage default service navigation includes Yumi beside NoMoney', () => {
  const source = fs.readFileSync('packages/web/src/utils/navigationEntries.ts', 'utf8');
  assert.match(source, /id: 'yumi'/);
  assert.match(source, /label: 'Yumi'/);
  assert.match(source, /url: '\/yumi'/);
  assert.match(source, /navigationEntriesVersion = 4/);
});
