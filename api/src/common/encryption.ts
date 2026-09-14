import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Symmetric encryption for secrets we must store at rest but need back in plaintext (e.g. a
 * restaurant's Moniepoint clientSecret, needed on every OAuth call) — unlike a password hash,
 * this must be reversible. Key is hashed with sha256 so any length passphrase from env becomes
 * a valid 32-byte AES-256 key. Output packs iv/authTag/ciphertext into one base64 string so it
 * fits in a single db column.
 */
export function encryptSecret(plaintext: string, key: string): string {
  const derivedKey = createHash('sha256').update(key).digest();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(payload: string, key: string): string {
  const derivedKey = createHash('sha256').update(key).digest();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
