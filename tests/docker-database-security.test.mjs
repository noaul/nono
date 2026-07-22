import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('requires environment-managed PostgreSQL credentials', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');

  assert.match(compose, /POSTGRES_DB:\s*\$\{POSTGRES_DB:-nono\}/);
  assert.match(compose, /POSTGRES_USER:\s*\$\{POSTGRES_USER:-nono\}/);
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?POSTGRES_PASSWORD is required\}/);
  assert.match(compose, /DATABASE_URL:\s*postgresql:\/\/\$\{POSTGRES_USER:-nono\}:\$\{POSTGRES_PASSWORD:\?POSTGRES_PASSWORD is required\}@postgres:5432\/\$\{POSTGRES_DB:-nono\}\?schema=public/);
  assert.doesNotMatch(compose, /POSTGRES_PASSWORD:\s*nono(?:\s|$)/);
  assert.doesNotMatch(compose, /postgresql:\/\/nono:nono@/);
});

test('binds PostgreSQL locally by default and documents required variables', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const exampleEnv = fs.readFileSync('.env.example', 'utf8');

  assert.match(compose, /\$\{POSTGRES_BIND_ADDRESS:-127\.0\.0\.1\}:\$\{POSTGRES_PORT:-5433\}:5432/);
  assert.match(exampleEnv, /^POSTGRES_DB=nono$/m);
  assert.match(exampleEnv, /^POSTGRES_USER=nono$/m);
  assert.match(exampleEnv, /^POSTGRES_PASSWORD=replace-with-a-random-hex-password$/m);
  assert.match(exampleEnv, /^POSTGRES_BIND_ADDRESS=127\.0\.0\.1$/m);
  assert.match(exampleEnv, /^POSTGRES_PORT=5433$/m);
});

test('persists link health fields and schedules checks through Compose', () => {
  const schema = fs.readFileSync('packages/server/prisma/schema.prisma', 'utf8');
  const migration = fs.readFileSync('packages/server/prisma/migrations/20260718002000_add_link_health/migration.sql', 'utf8');
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const exampleEnv = fs.readFileSync('.env.example', 'utf8');

  for (const field of ['healthStatus', 'healthStatusCode', 'healthReason', 'healthFinalUrl', 'healthCheckedAt']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(migration, new RegExp(`"${field}"`));
  }
  assert.match(migration, /CREATE INDEX "Link_healthCheckedAt_idx"/);
  assert.match(compose, /LINK_HEALTH_CHECK_ENABLED:\s*\$\{LINK_HEALTH_CHECK_ENABLED:-true\}/);
  assert.match(exampleEnv, /^LINK_HEALTH_CHECK_INTERVAL_HOURS=24$/m);
});

test('drops root privileges before migrations and application services start', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

  assert.match(dockerfile, /adduser[^\n]*nono/);
  assert.match(dockerfile, /chown -R nono:nono \/app\/nodesk-content \/app\/nomoney-data \/app\/backups/);
  assert.match(dockerfile, /su-exec nono:nono \.\/nono\/node_modules\/\.bin\/prisma migrate deploy/);
  assert.match(dockerfile, /exec su-exec nono:nono node \.\/gateway\.mjs/);
});
