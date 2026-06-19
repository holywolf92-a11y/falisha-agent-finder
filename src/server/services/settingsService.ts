// Single source of truth for runtime settings (API keys, sweep defaults).
// - Reads go through an in-process cache (TTL 60s) plus a Postgres LISTEN
//   channel so cross-process invalidation is < 1s, not 5min.
// - Encrypted secrets via AES-256-GCM with master key from env.
// - Falls through to process.env[KEY] only when the DB row is NULL — never
//   when decryption fails (decrypt-failure is a hard alert, not a silent stale).

import { EventEmitter } from 'node:events';
import { db, isDbConfigured } from '../db.js';
import { decrypt, encrypt, hmacValue, maskSecret, type Cipher } from './settingsCrypto.js';
import { logger } from '../logger.js';

type Source = 'db' | 'env' | 'empty';
type CacheEntry = { value: string | null; source: Source; expiresAt: number };

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
const bus = new EventEmitter();

let listenStarted = false;

/**
 * Start a Postgres LISTEN on `app_settings_changed` so any process that runs
 * settingsService sees admin edits within ~1s. Supabase pooler at 6543 does
 * NOT support LISTEN/NOTIFY — we use the direct connection via REST realtime
 * channel here for portability (Supabase JS realtime over WebSocket).
 */
export async function startSettingsListener(): Promise<void> {
  if (listenStarted || !isDbConfigured()) return;
  listenStarted = true;

  try {
    const sb = db();
    const channel = sb.channel('settings-invalidate');
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      (payload) => {
        const key = (payload?.new as { key?: string })?.key ?? (payload?.old as { key?: string })?.key;
        if (key) {
          cache.delete(key);
          bus.emit('change', key);
          logger.info({ key }, 'settings_invalidated');
        }
      },
    );
    await channel.subscribe();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'settings_listener_failed_to_start');
  }
}

export function onSettingChanged(handler: (key: string) => void) {
  bus.on('change', handler);
  return () => bus.off('change', handler);
}

type Row = {
  key: string;
  value_ciphertext: string | null;
  value_plaintext: unknown | null;
  iv: string | null;
  auth_tag: string | null;
  key_version: number;
  is_secret: boolean;
  value_type: 'string' | 'int' | 'bool' | 'json';
  description: string | null;
  last_validated_at: string | null;
  last_validation_status: string | null;
  updated_by: string | null;
  updated_at: string;
};

/** Read a setting. Returns null if neither DB nor env supplies it. */
export async function getSetting(key: string): Promise<{ value: string | null; source: Source }> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { value: cached.value, source: cached.source };

  let value: string | null = null;
  let source: Source = 'empty';

  if (isDbConfigured()) {
    const { data, error } = await db()
      .from('app_settings')
      .select('*')
      .eq('key', key)
      .maybeSingle<Row>();
    if (error) {
      logger.error({ err: error.message, key }, 'settings_read_error');
    } else if (data) {
      if (data.is_secret && data.value_ciphertext && data.iv && data.auth_tag) {
        try {
          const c: Cipher = {
            ciphertext: Buffer.from(data.value_ciphertext, 'base64'),
            iv:         Buffer.from(data.iv, 'base64'),
            authTag:    Buffer.from(data.auth_tag, 'base64'),
            keyVersion: data.key_version,
          };
          value = decrypt(c, key);
          source = 'db';
        } catch (err) {
          // Hard alert path: do NOT silently fall through to env when decrypt
          // breaks (corrupted row, wrong master key after botched rotation).
          logger.error({ err: err instanceof Error ? err.message : String(err), key },
            'settings_decrypt_failed');
          throw new Error(`Failed to decrypt setting "${key}". Check APP_SETTINGS_MASTER_KEY.`);
        }
      } else if (!data.is_secret && data.value_plaintext !== null) {
        value = typeof data.value_plaintext === 'string'
          ? data.value_plaintext
          : JSON.stringify(data.value_plaintext);
        source = 'db';
      }
    }
  }

  // Env fallback ONLY when the row was absent (NULL) — not on decrypt error.
  if (value === null) {
    const envValue = process.env[key];
    if (envValue) { value = envValue; source = 'env'; }
  }

  cache.set(key, { value, source, expiresAt: Date.now() + TTL_MS });
  return { value, source };
}

/** Write a setting (encrypts if is_secret). Logs to audit. */
export async function setSetting(args: {
  key: string;
  value: string;
  isSecret?: boolean;
  actorEmail?: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  if (!isDbConfigured()) {
    throw new Error('Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY first.');
  }
  const isSecret = args.isSecret ?? true;
  const supabase = db();

  // Pull existing for the audit log (old HMAC)
  const { data: existing } = await supabase.from('app_settings').select('*').eq('key', args.key).maybeSingle<Row>();

  let oldHmac: string | null = null;
  if (existing && existing.is_secret && existing.value_ciphertext && existing.iv && existing.auth_tag) {
    try {
      const c: Cipher = {
        ciphertext: Buffer.from(existing.value_ciphertext, 'base64'),
        iv:         Buffer.from(existing.iv, 'base64'),
        authTag:    Buffer.from(existing.auth_tag, 'base64'),
        keyVersion: existing.key_version,
      };
      oldHmac = hmacValue(decrypt(c, args.key));
    } catch { /* corrupted row — leave oldHmac null */ }
  }

  let row: Partial<Row>;
  if (isSecret) {
    const c = encrypt(args.value, args.key);
    row = {
      key: args.key,
      value_ciphertext: c.ciphertext.toString('base64'),
      iv:               c.iv.toString('base64'),
      auth_tag:         c.authTag.toString('base64'),
      key_version:      c.keyVersion,
      is_secret:        true,
      value_plaintext:  null,
      updated_by:       args.actorEmail ?? null,
    };
  } else {
    row = {
      key: args.key,
      value_plaintext: args.value as unknown,
      value_ciphertext: null,
      iv: null,
      auth_tag: null,
      is_secret: false,
      updated_by: args.actorEmail ?? null,
    };
  }

  const { error } = await supabase.from('app_settings').upsert(row);
  if (error) throw new Error(`Failed to save setting: ${error.message}`);

  await supabase.from('app_settings_audit').insert({
    key: args.key,
    action: existing ? 'update' : 'create',
    old_value_hmac: oldHmac,
    new_value_hmac: hmacValue(args.value),
    actor_email: args.actorEmail ?? null,
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
  });

  cache.delete(args.key);
}

/** Public list of settings the UI needs (masked for secrets). */
export type SettingMeta = {
  key: string;
  isSecret: boolean;
  hasValue: boolean;
  maskedValue: string;
  source: Source;
  description: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export async function listSettingsMeta(keys: string[]): Promise<SettingMeta[]> {
  const out: SettingMeta[] = [];
  for (const key of keys) {
    // Per-key try/catch so one bad row (e.g. corrupted ciphertext) doesn't
    // blow up the whole Settings page. The UI shows the failure as 'env fallback'
    // or 'empty' and admin can re-save the affected key in isolation.
    try {
      const { value, source } = await getSetting(key);
      out.push({
        key,
        isSecret: true,
        hasValue: value !== null && value.length > 0,
        maskedValue: value ? maskSecret(value) : '',
        source,
        description: null,
        lastValidatedAt: null,
        lastValidationStatus: null,
        updatedBy: null,
        updatedAt: null,
      });
    } catch (err) {
      logger.error({ key, err: err instanceof Error ? err.message : String(err) }, 'settings_per_key_failed');
      out.push({
        key,
        isSecret: true,
        hasValue: false,
        maskedValue: '',
        source: 'empty',
        description: err instanceof Error ? err.message : 'read failed',
        lastValidatedAt: null,
        lastValidationStatus: 'error',
        updatedBy: null,
        updatedAt: null,
      });
    }
  }
  return out;
}

export async function revealSetting(key: string): Promise<string | null> {
  const { value } = await getSetting(key);
  return value;
}
