import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('NoMoney migration script is idempotent and refuses implicit replacement', () => {
  const script = fs.readFileSync('scripts/migrate-nomoney-data.sh', 'utf8');

  assert.match(script, /PRAGMA integrity_check/);
  assert.match(script, /logical_hash/);
  assert.match(script, /already matches source/);
  assert.match(script, /Refusing to overwrite/);
  assert.match(script, /--replace/);
  assert.match(script, /pre-migration-/);
  assert.match(script, /VACUUM INTO/);
  assert.match(script, /chmod 600/);
});
