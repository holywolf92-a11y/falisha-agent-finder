// Hunter.io client — named decision-maker emails by company domain.
//
// Docs: https://hunter.io/api-documentation/v2 (verified 2026-11-14)
//   GET /v2/domain-search  — people at a domain; a credit is only used when the
//                            search returns ≥1 result, and repeating the same
//                            search in the same billing period is free.
//   GET /v2/account        — plan + remaining credits.
// Auth: X-API-KEY header. Limits: 15 req/s, 500 req/min on domain-search.
// The key lives in Settings (HUNTER_API_KEY, encrypted) with env fallback.
// `test-api-key` returns dummy data and is handy for wiring checks.

import { getSetting } from './settingsService.js';

const BASE = 'https://api.hunter.io/v2';

/** HR + owners/leadership — at a manpower agency the decision-maker is usually the owner or GM. */
export const HUNTER_DEPARTMENTS = ['hr', 'executive', 'management'] as const;

export class HunterError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'HunterError';
  }
  /** 401 bad key · 429 out of credits/usage limit · 403 rate limited (Hunter uses 403 for that). */
  get isFatalForBatch() { return this.status === 401 || this.status === 429; }
}

export type HunterEmail = {
  value: string;
  type: 'personal' | 'generic' | string;
  confidence: number | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  decision_maker?: boolean | null;
  linkedin: string | null;
  phone_number: string | null;
  verification?: { date: string | null; status: string | null } | null;
};

export type HunterDomainResult = {
  domain: string;
  organization: string | null;
  pattern: string | null;
  acceptAll: boolean | null;
  emails: HunterEmail[];
  creditsUsed: number | null;
};

async function apiKey(): Promise<string> {
  const { value } = await getSetting('HUNTER_API_KEY');
  if (!value) throw new HunterError(412, 'HUNTER_API_KEY is not set — add it in Settings → Decision-makers.');
  return value;
}

export async function isHunterConfigured(): Promise<boolean> {
  const { value } = await getSetting('HUNTER_API_KEY');
  return !!value;
}

async function hunterGet(path: string, params: Record<string, string>, key: string) {
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: { 'X-API-KEY': key, Accept: 'application/json' } });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const first = body?.errors?.[0];
    throw new HunterError(res.status, first?.details || first?.id || `Hunter HTTP ${res.status}`, first?.id);
  }
  return { body, headers: res.headers };
}

/**
 * Named people at `domain` in HR / executive / management. One call per
 * agency; `limit` caps the rows (and Hunter's credit unit for the call).
 */
export async function domainSearch(domain: string, opts: { limit?: number } = {}): Promise<HunterDomainResult> {
  const key = await apiKey();
  const { body, headers } = await hunterGet('/domain-search', {
    domain,
    type: 'personal',
    department: HUNTER_DEPARTMENTS.join(','),
    limit: String(Math.min(Math.max(opts.limit ?? 10, 1), 100)),
  }, key);
  const d = body?.data ?? {};
  const used = headers.get('x-credits-used');
  return {
    domain,
    organization: d.organization ?? null,
    pattern: d.pattern ?? null,
    acceptAll: typeof d.accept_all === 'boolean' ? d.accept_all : null,
    emails: Array.isArray(d.emails) ? d.emails : [],
    creditsUsed: used != null && used !== '' ? Number(used) : null,
  };
}

export type HunterAccount = {
  plan: string | null;
  resetDate: string | null;
  used: number | null;
  available: number | null;
  unit: string;
};

/** Remaining credits. Hunter has reported this as `credits` (new plans) or `searches` (legacy). */
export async function hunterAccount(): Promise<HunterAccount> {
  const key = await apiKey();
  const { body } = await hunterGet('/account', {}, key);
  const d = body?.data ?? {};
  const req = d.requests ?? {};
  const bucket = req.credits ?? req.searches ?? null;
  return {
    plan: d.plan_name ?? null,
    resetDate: d.reset_date ?? null,
    used: bucket?.used ?? null,
    available: bucket?.available ?? null,
    unit: req.credits ? 'credits' : 'searches',
  };
}
