// Lusha v3 client — decision-makers' mobile numbers.
//
// Docs (verified 2026-11-14): https://docs.lusha.com
//   POST /v3/contacts/prospecting  — find people by company domain + titles.
//                                    BILLED per successful result (api_search),
//                                    so keep maxContactsPerCompany small.
//   POST /v3/contacts/enrich       — reveal emails/phones for contact ids.
//                                    BILLED per revealed field (phone ≈ 5 credits,
//                                    see GET /v3/account/usage → pricing).
//                                    Re-revealing an already revealed field is free.
//   GET  /v3/account/usage         — credits + per-datapoint pricing (5 req/min).
// Auth: `api_key` header. Errors: 401 bad key · 402 out of credits · 429 limits.
// phones[].type ∈ mobile | direct | work | unknown; phones[].doNotCall;
// location.isEuContact.

import { getSetting } from './settingsService.js';

const BASE = 'https://api.lusha.com/v3';

/** Titles that make a person worth a phone reveal at a recruitment/manpower agency. */
export const DECISION_TITLES = [
  'Owner', 'Founder', 'Co-Founder', 'CEO', 'Managing Director', 'General Manager', 'Partner',
  'Director', 'HR Manager', 'Human Resources', 'Recruitment Manager', 'Recruiter',
  'Talent Acquisition', 'Operations Manager', 'Business Development Manager',
];

export class LushaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'LushaError';
  }
}

async function apiKey(): Promise<string> {
  const { value } = await getSetting('LUSHA_API_KEY');
  if (!value) throw new LushaError(412, 'LUSHA_API_KEY is not set — add it in Settings → Decision-makers.');
  return value;
}

export async function isLushaConfigured(): Promise<boolean> {
  const { value } = await getSetting('LUSHA_API_KEY');
  return !!value;
}

async function lusha(method: 'GET' | 'POST', path: string, key: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { api_key: key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = json?.message || json?.error || `Lusha HTTP ${res.status}`;
    const friendly =
      res.status === 401 ? 'Lusha rejected the API key (401).'
      : res.status === 402 ? 'Lusha: not enough credits (402).'
      : res.status === 429 ? 'Lusha rate/usage limit reached (429) — try again later.'
      : String(msg);
    throw new LushaError(res.status, friendly);
  }
  return json;
}

export type LushaCandidate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  departments: string[];
  seniority: string | null;
  companyName: string | null;
  companyDomain: string | null;
  country: string | null;
  linkedin: string | null;
  has: string[];
  phoneCredits: number | null;   // null = no phone available to reveal
  emailCredits: number | null;
};

export type LushaProspectResult = {
  candidates: LushaCandidate[];
  creditsCharged: number | null;
  total: number | null;
};

/** People at `domain` (optionally limited to decision-maker titles). Costs credits per result. */
export async function prospectByDomain(domain: string, opts: { allRoles?: boolean; max?: number } = {}): Promise<LushaProspectResult> {
  const key = await apiKey();
  const max = Math.min(Math.max(opts.max ?? 3, 1), 10);
  const json = await lusha('POST', '/contacts/prospecting', key, {
    pagination: { page: 0, size: 10 },
    filters: {
      companies: { include: { domains: [domain] } },
      ...(opts.allRoles ? {} : { contacts: { include: { jobTitles: DECISION_TITLES } } }),
    },
    options: { includePartialProfiles: false, excludeDnc: true, maxContactsPerCompany: max },
  });
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const candidates = results
    .filter((r) => r && r.id && !r.error)
    .map((r): LushaCandidate => {
      const reveal: any[] = Array.isArray(r.canReveal) ? r.canReveal : [];
      const phone = reveal.find((x) => x?.field === 'phones');
      const email = reveal.find((x) => x?.field === 'emails');
      return {
        id: String(r.id),
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        title: r.jobTitle?.title ?? null,
        departments: Array.isArray(r.jobTitle?.departments) ? r.jobTitle.departments : [],
        seniority: r.jobTitle?.seniority ?? null,
        companyName: r.company?.name ?? null,
        companyDomain: r.company?.domain ?? null,
        country: r.location?.country ?? null,
        linkedin: r.socialLinks?.linkedin ?? null,
        has: Array.isArray(r.has) ? r.has : [],
        phoneCredits: phone ? Number(phone.credits ?? 0) : null,
        emailCredits: email ? Number(email.credits ?? 0) : null,
      };
    });
  return {
    candidates,
    creditsCharged: json?.billing?.creditsCharged ?? null,
    total: json?.pagination?.total ?? null,
  };
}

export type LushaPhone = { number: string; type: string; doNotCall: boolean };
export type LushaRevealed = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  departments: string[];
  seniority: string | null;
  countryIso2: string | null;
  isEuContact: boolean | null;
  linkedin: string | null;
  emails: Array<{ email: string; type: string; confidence: string | null }>;
  phones: LushaPhone[];
  raw: unknown;
};

/** Reveal phones (and optionally emails) for contact ids from prospectByDomain. */
export async function revealContacts(ids: string[], reveal: Array<'phones' | 'emails'> = ['phones']): Promise<{ contacts: LushaRevealed[]; creditsCharged: number | null }> {
  const key = await apiKey();
  if (ids.length === 0) return { contacts: [], creditsCharged: 0 };
  const json = await lusha('POST', '/contacts/enrich', key, { ids: ids.slice(0, 100), reveal });
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const contacts = results
    .filter((r) => r && r.id && !r.error)
    .map((r): LushaRevealed => ({
      id: String(r.id),
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      fullName: r.fullName ?? null,
      title: r.jobTitle?.title ?? null,
      departments: Array.isArray(r.jobTitle?.departments) ? r.jobTitle.departments : [],
      seniority: r.jobTitle?.seniority ?? null,
      countryIso2: r.location?.countryIso2 ?? null,
      isEuContact: typeof r.location?.isEuContact === 'boolean' ? r.location.isEuContact : null,
      linkedin: r.socialLinks?.linkedin ?? null,
      emails: (Array.isArray(r.emails) ? r.emails : [])
        .filter((e: any) => e?.email)
        .map((e: any) => ({ email: String(e.email), type: String(e.type ?? 'unknown'), confidence: e.confidence ?? null })),
      phones: (Array.isArray(r.phones) ? r.phones : [])
        .filter((p: any) => p?.number)
        .map((p: any) => ({ number: String(p.number), type: String(p.type ?? 'unknown'), doNotCall: !!p.doNotCall })),
      raw: r,
    }));
  return { contacts, creditsCharged: json?.billing?.creditsCharged ?? null };
}

export type LushaUsage = {
  remaining: number | null;
  used: number | null;
  total: number | null;
  phoneCredits: number | null;
  emailCredits: number | null;
  searchCredits: number | null;
};

let usageCache: { at: number; value: LushaUsage } | null = null;

/** Credit balance + per-datapoint pricing. Cached 60s (endpoint allows 5/min). */
export async function lushaUsage(): Promise<LushaUsage> {
  if (usageCache && Date.now() - usageCache.at < 60_000) return usageCache.value;
  const key = await apiKey();
  const json = await lusha('GET', '/account/usage', key);
  const price = (k: string) => {
    const p = json?.pricing?.[k];
    return p && p.credits != null ? Number(p.credits) / Number(p.perQuantity || 1) : null;
  };
  const value: LushaUsage = {
    remaining: json?.credits?.remaining ?? null,
    used: json?.credits?.used ?? null,
    total: json?.credits?.total ?? null,
    phoneCredits: price('phone'),
    emailCredits: price('email'),
    searchCredits: price('api_search'),
  };
  usageCache = { at: Date.now(), value };
  return value;
}
