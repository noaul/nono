import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const encryptedSecretPrefix = 'enc:v1:';

export function assertEncryptionKey(value: string, name = 'NOMONEY_ENCRYPTION_KEY'): string {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be 64 hexadecimal characters`);
  }
  return value;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(encryptedSecretPrefix);
}

export function encryptSecret(value: string, encryptionKey: string): string {
  if (!value || isEncryptedSecret(value)) {
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptedSecretPrefix}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string, encryptionKey: string): string {
  if (!value || !isEncryptedSecret(value)) {
    return value;
  }
  const parts = value.slice(encryptedSecretPrefix.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted secret has an invalid format');
  }
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(encryptionKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function keyBuffer(encryptionKey: string): Buffer {
  return Buffer.from(assertEncryptionKey(encryptionKey), 'hex');
}
