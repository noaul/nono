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
