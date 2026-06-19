import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let _client: SupabaseClient | null = null;

/**
 * Lazy-init the Supabase admin client. We do this lazily (vs at import time)
 * so a missing SUPABASE_URL during phase-1 deploys doesn't crash the boot —
 * routes that need DB access throw a clear "Supabase not configured" error
 * instead, and the Settings page becomes the place to fix it.
 */
export function db(): SupabaseClient {
  if (_client) return _client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase credentials missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'falisha-agent-finder' } },
  });
  return _client;
}

export function isDbConfigured(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
