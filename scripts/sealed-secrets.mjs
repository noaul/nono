// Seals the deployment .env with a passphrase so it can be kept off the host next to the
// WebDAV backups. Without these keys the backups cannot be decrypted after a disk loss.
// Only Node's built-in crypto is used, so `open` works on any fresh machine with Node.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const KIND = 'nono.sealed-env';
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const MIN_PASSPHRASE = 12;

function deriveKey(passphrase, salt, params) {
  return scryptSync(passphrase, salt, 32, params);
}

export function sealSecrets(text, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE} characters`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt, SCRYPT), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    kind: KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function openSecrets(sealed, passphrase) {
  if (sealed?.kind !== KIND || sealed.version !== 1 || sealed.kdf?.name !== 'scrypt') throw new Error('Not a sealed NoNo .env file');
  const { N, r, p } = sealed.kdf;
  try {
    const key = deriveKey(passphrase, Buffer.from(sealed.salt, 'base64'), { N, r, p, maxmem: SCRYPT.maxmem });
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Cannot open: the passphrase is wrong or the file was changed');
  }
}

function parseArgs(argv) {
  const command = argv[0];
  if (!['seal', 'open'].includes(command)) {
    throw new Error('Usage: sealed-secrets seal [--dir PATH] [--out FILE] | open --in FILE');
  }
  const options = { command, dir: process.cwd(), out: '', input: '' };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.dir = argv[++index];
    else if (argument === '--out') options.out = argv[++index];
    else if (argument === '--in') options.input = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (command === 'open' && !options.input) throw new Error('--in is required');
  return options;
}

function passphrase() {
  const value = process.env.NONO_SECRETS_PASSPHRASE;
  if (!value) throw new Error('Set NONO_SECRETS_PASSPHRASE (for example: read -rs NONO_SECRETS_PASSPHRASE; export NONO_SECRETS_PASSPHRASE)');
  return value;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'seal') {
    const sealed = sealSecrets(fs.readFileSync(path.join(options.dir, '.env'), 'utf8'), passphrase());
    const out = options.out || path.join(options.dir, `nono-env-${sealed.createdAt.slice(0, 10)}.sealed.json`);
    fs.writeFileSync(out, `${JSON.stringify(sealed, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(out, 0o600);
    console.error(`sealed ${path.join(options.dir, '.env')} -> ${out}`);
    return;
  }
  process.stdout.write(openSecrets(JSON.parse(fs.readFileSync(options.input, 'utf8')), passphrase()));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
