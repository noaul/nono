import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('migrates existing API tokens to hashes without invalidating them', () => {
  const migrationPath = path.resolve('packages/server/prisma/migrations/20260717000000_hash_api_tokens/migration.sql');
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /pgcrypto/i);
  assert.match(sql, /"tokenPrefix"/);
  assert.match(sql, /encode\(sha256\(convert_to\("token", 'UTF8'\)\), 'hex'\)/i);
  assert.match(sql, /SET NOT NULL/i);
});
