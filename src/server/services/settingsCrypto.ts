// AES-256-GCM encrypt/decrypt for settings values stored in Supabase.
// Master key lives in env (APP_SETTINGS_MASTER_KEY, base64). Each row gets a
// fresh random 12-byte IV. The row's `key` column is bound as AAD so an
// attacker with DB-write access cannot swap ciphertext between rows.

import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { env } from '../env.js';

const ALG = 'aes-256-gcm' as const;
const IV_BYTES = 12;
const KEY_VERSION = 1;

function masterKey(): Buffer {
  const b64 = env.APP_SETTINGS_MASTER_KEY;
  if (!b64) throw new Error('APP_SETTINGS_MASTER_KEY missing — cannot decrypt settings');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) {
    throw new Error(`APP_SETTINGS_MASTER_KEY must be 32 raw bytes (base64). Got ${buf.length}.`);
  }
  return buf;
}

export type Cipher = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export function encrypt(plaintext: string, rowKey: string): Cipher {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, masterKey(), iv);
  cipher.setAAD(Buffer.from(`${rowKey}|v${KEY_VERSION}`));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, keyVersion: KEY_VERSION };
}

export function decrypt(c: Cipher, rowKey: string): string {
  const decipher = createDecipheriv(ALG, masterKey(), c.iv);
  decipher.setAAD(Buffer.from(`${rowKey}|v${c.keyVersion}`));
  decipher.setAuthTag(c.authTag);
  const plain = Buffer.concat([decipher.update(c.ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * HMAC-SHA256 of a value, keyed by the master key. Used in app_settings_audit
 * so we can answer "did the value actually change?" without storing a raw
 * value an attacker could exfiltrate.
 */
export function hmacValue(value: string): string {
  return createHmac('sha256', masterKey()).update(value, 'utf8').digest('hex');
}

/** Mask a secret for UI display: keeps last 4 chars, prefix with bullets. */
export function maskSecret(value: string | null): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return '••••' + value.slice(-4);
}
