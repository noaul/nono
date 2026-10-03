import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSecrets, sealSecrets } from '../scripts/sealed-secrets.mjs';

const ENV = 'POSTGRES_PASSWORD=pg-secret\nENCRYPTION_KEY=0123456789abcdef\n';

test('seals .env with a passphrase and opens it again', () => {
  const sealed = sealSecrets(ENV, 'correct horse battery staple');
  const text = JSON.stringify(sealed);

  assert.equal(sealed.kind, 'nono.sealed-env');
  assert.doesNotMatch(text, /pg-secret|0123456789abcdef/);
  assert.equal(openSecrets(sealed, 'correct horse battery staple'), ENV);
  assert.throws(() => openSecrets(sealed, 'wrong passphrase'), /passphrase is wrong or the file was changed/);
  assert.throws(() => openSecrets({ ...sealed, ciphertext: Buffer.from('tampered').toString('base64') }, 'correct horse battery staple'), /passphrase is wrong or the file was changed/);
});

test('refuses short passphrases', () => {
  assert.throws(() => sealSecrets(ENV, 'short'), /at least 12 characters/);
});

test('the CLI seals a .env file and opens it with the passphrase from the environment', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-sealed-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.env'), ENV);
  const env = { ...process.env, NONO_SECRETS_PASSPHRASE: 'correct horse battery staple' };
  const script = path.resolve('scripts/sealed-secrets.mjs');

  const sealed = spawnSync(process.execPath, [script, 'seal', '--dir', dir, '--out', path.join(dir, 'env.sealed.json')], { env, encoding: 'utf8' });
  assert.equal(sealed.status, 0, sealed.stderr);
  assert.equal(fs.statSync(path.join(dir, 'env.sealed.json')).mode & 0o777, 0o600);

  const opened = spawnSync(process.execPath, [script, 'open', '--in', path.join(dir, 'env.sealed.json')], { env, encoding: 'utf8' });
  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(opened.stdout, ENV);
});
