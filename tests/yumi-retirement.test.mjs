import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Yumi (VPS + domains, a second NoMoney process under /yumi) is retired: domains moved back into
// NoMoney, VPS management was dropped. Only the legacy data volume stays, as the source of
// NoMoney's one-time domain merge.

test('no longer packages or starts a Yumi process', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const env = fs.readFileSync('.env.example', 'utf8');
  const gateway = fs.readFileSync('docker/gateway.mjs', 'utf8');

  assert.doesNotMatch(dockerfile, /public-yumi|YUMI_INTERNAL_PORT/);
  assert.doesNotMatch(compose, /YUMI_INTERNAL_PORT|YUMI_ENCRYPTION_KEY/);
  assert.doesNotMatch(env, /YUMI_/);
  assert.doesNotMatch(gateway, /startService\('yumi'|YUMI_INTERNAL_PORT|PRODUCT_MODE: 'yumi'/);
  assert.match(gateway, /PRODUCT_MODE: 'nomoney'/);
});

test('keeps the legacy Yumi data mounted for the one-time NoMoney domain merge', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const gateway = fs.readFileSync('docker/gateway.mjs', 'utf8');

  assert.match(compose, /YUMI_DATA_DIR:\s*\/app\/yumi-data/);
  assert.match(compose, /- yumi_data:\/app\/yumi-data/);
  assert.match(compose, /^\s*yumi_data:\s*$/m);
  assert.match(dockerfile, /chown -R nono:nono [^;]*\/app\/yumi-data/);
  assert.match(gateway, /LEGACY_YUMI_DATA_DIR:\s*process\.env\.YUMI_DATA_DIR \|\| '\/app\/yumi-data'/);
});

test('redirects every retired Yumi URL before routing, login or internal-path checks', () => {
  const gateway = fs.readFileSync('docker/gateway.mjs', 'utf8');
  const routing = fs.readFileSync('docker/gateway-routing.mjs', 'utf8');
  const request = gateway.slice(gateway.indexOf('function proxyRequest'), gateway.indexOf('function proxyUpgrade'));
  const upgrade = gateway.slice(gateway.indexOf('function proxyUpgrade'), gateway.indexOf('function shutdown'));

  assert.match(request, /writeHead\(308, \{ location: yumiRedirect/);
  assert.ok(request.indexOf('retiredYumiRedirect(url)') < request.indexOf('isPublicInternalPath(url)'));
  assert.ok(request.indexOf('retiredYumiRedirect(url)') < request.indexOf('loginRedirectFor('));
  assert.match(upgrade, /retiredYumiRedirect\(/);
  assert.doesNotMatch(gateway, /legacyYumiRedirect/);
  assert.doesNotMatch(routing, /stripMountPath\(url, '\/yumi'\)[\s\S]*name: 'yumi'/);
  assert.doesNotMatch(routing, /'\/yumi\/api\/internal'/);
});

test('full-site archives are v3 without Yumi but v2 Yumi archives stay restorable', () => {
  const source = fs.readFileSync('packages/server/src/services/backup.service.ts', 'utf8');
  assert.match(source, /const BACKUP_VERSION = 3;/);
  assert.match(source, /const CURRENT_COMPONENTS = \['postgres', 'nodesk', 'nomoney'\] as const;/);
  assert.match(source, /SUPPORTED_BACKUP_VERSIONS: readonly number\[\] = \[1, 2, BACKUP_VERSION\]/);
  assert.match(source, /Yumi SQLite integrity check failed/);
  assert.doesNotMatch(source, /Yumi database is unavailable/);
});

test('NoNo no longer offers Yumi navigation, notifications or backup modules', () => {
  const navigation = fs.readFileSync('packages/web/src/utils/navigationEntries.ts', 'utf8');
  const modules = fs.readFileSync('packages/server/src/services/backup-center.service.ts', 'utf8');
  const notifications = fs.readFileSync('packages/server/src/routes/admin/notifications.ts', 'utf8');
  assert.doesNotMatch(navigation, /id: 'yumi'/);
  assert.match(modules, /BACKUP_MODULES = \['nono', 'nodesk', 'nostar', 'nomoney'\] as const/);
  assert.doesNotMatch(notifications, /yumi/);
});
