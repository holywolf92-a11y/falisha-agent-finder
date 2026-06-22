// Per-month usage tracking for the Google Places API. Wraps every Place
// Details and Text Search call with a check + increment so the in-app
// counter stays accurate against the GCP billing dashboard.
//
// Paid tier active — billing is enabled on the GCP project. The "cap" below
// is deliberately set well above realistic monthly volume so the in-app gate
// never blocks enrichment, but stays low enough that a runaway loop bug
// would eventually trip the circuit breaker instead of running up unbounded
// GCP charges. To return to free-tier mode, set these to 5000 / 1000.

import { db, isDbConfigured } from '../db.js';

export type ApiMethod = 'text_search' | 'place_details';

// Effective hard cap per method (used by recordOrThrow). 1M/month is ~33k/day
// — far above any realistic real-world burn rate, but a finite ceiling so
// nothing runs unbounded.
export const FREE_TIER_QUOTAS: Record<ApiMethod, number> = {
  text_search:   1_000_000,
  place_details: 1_000_000,
};

// Buffer is zero in paid mode — every approved call should be allowed.
export const SAFETY_BUFFER: Record<ApiMethod, number> = {
  text_search:   0,
  place_details: 0,
};

// Where Google's actual free tier ends. The widget shows the bar in amber
// once we cross this so the user has cost visibility without a hard gate.
// (Updating these to match Google's published 2026 tiers — verify quarterly.)
export const FREE_TIER_THRESHOLD: Record<ApiMethod, number> = {
  text_search:   5_000,   // Pro tier monthly free
  place_details: 1_000,   // Enterprise tier monthly free
};

export class QuotaExhaustedError extends Error {
  constructor(public method: ApiMethod, public used: number, public cap: number) {
    super(`Quota exhausted for ${method}: ${used} / ${cap}`);
    this.name = 'QuotaExhaustedError';
  }
}

function currentPeriodKey(): string {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/** Compute next-month-1st UTC midnight as ISO. Used by the UI for "Resets …". */
function nextResetIso(): string {
  const d = new Date();
  const reset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  return reset.toISOString();
}

export type QuotaSnapshot = {
  method: ApiMethod;
  period: string;
  used: number;
  cap: number;                 // effective hard ceiling — circuit breaker only
  freeTier: number;            // Google's actual monthly free (cost-visibility line)
  safetyBuffer: number;
  freeTierThreshold: number;   // alias of freeTier kept for the UI's amber-bar logic
  pastFreeTier: boolean;       // true once `used` crosses the free-tier line (now paying per call)
  resetsAt: string;
  percentage: number;
};

export async function getQuota(method: ApiMethod): Promise<QuotaSnapshot> {
  const freeTier = FREE_TIER_QUOTAS[method];
  const buffer = SAFETY_BUFFER[method];
  const cap = freeTier - buffer;
  const freeTierThreshold = FREE_TIER_THRESHOLD[method];
  const period = currentPeriodKey();
  let used = 0;

  if (isDbConfigured()) {
    const { data } = await db()
      .from('places_api_usage_counter')
      .select('count')
      .eq('api_method', method)
      .eq('period_key', period)
      .maybeSingle<{ count: number }>();
    used = data?.count ?? 0;
  }

  return {
    method,
    period,
    used,
    cap,
    freeTier: freeTierThreshold, // expose the realistic free-tier number to the UI, not the 1M ceiling
    safetyBuffer: buffer,
    freeTierThreshold,
    pastFreeTier: used > freeTierThreshold,
    resetsAt: nextResetIso(),
    percentage: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
  };
}

export async function getAllQuotas(): Promise<QuotaSnapshot[]> {
  return Promise.all((['text_search', 'place_details'] as ApiMethod[]).map(getQuota));
}

/**
 * Atomic check-and-record. Throws QuotaExhaustedError BEFORE the API call
 * if the cap would be exceeded. Otherwise records the call (count + 1) and
 * returns the new count. Single-shot — call this exactly once per API call.
 */
export async function recordOrThrow(method: ApiMethod): Promise<number> {
  if (!isDbConfigured()) {
    // Without a DB we cannot enforce — fail safe and refuse to spend API quota.
    throw new Error(`quota check unavailable (Supabase not configured)`);
  }
  const snap = await getQuota(method);
  if (snap.used >= snap.cap) {
    throw new QuotaExhaustedError(method, snap.used, snap.cap);
  }
  const { data, error } = await db().rpc('places_api_usage_increment', {
    p_method: method,
    p_period: snap.period,
  });

  if (error) {
    // PostgREST's schema cache can lag for ~minutes after a migration that
    // adds a function. Don't fail the enrichment — fall back to a
    // read-modify-write upsert that uses only the table (which DOES exist if
    // we got this far, since getQuota succeeded above).
    const sb = db();
    const { data: existing } = await sb
      .from('places_api_usage_counter')
      .select('count')
      .eq('api_method', method)
      .eq('period_key', snap.period)
      .maybeSingle<{ count: number }>();
    const newCount = (existing?.count ?? snap.used) + 1;
    const { error: upErr } = await sb.from('places_api_usage_counter').upsert(
      { api_method: method, period_key: snap.period, count: newCount, updated_at: new Date().toISOString() },
      { onConflict: 'api_method,period_key' },
    );
    if (upErr) {
      // Both paths failed — give up but include both errors for diagnosis.
      throw new Error(`quota increment failed: ${error.message} (fallback also failed: ${upErr.message})`);
    }
    return newCount;
  }
  return (data as number | null) ?? snap.used + 1;
}

/** Quick "do I have room for N more calls?" helper used by the batch preview. */
export async function remaining(method: ApiMethod): Promise<number> {
  const snap = await getQuota(method);
  return Math.max(0, snap.cap - snap.used);
}
