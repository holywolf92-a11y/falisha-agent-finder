// Shared agency filtering, applied identically by the Agencies list endpoint and
// the bulk outreach actions ("Find WhatsApp" / "Send template" on the filtered
// set), so what you see is exactly what the action runs on.

export type Contactable = 'has' | 'whatsapp' | 'mobile' | 'landline' | 'none';

export interface AgencyFilter {
  q?: string;
  country?: string;
  category?: string;
  city?: string;
  minRating?: number;
  minReviews?: number;
  minScore?: number;
  enrichmentStatus?: 'not_enriched' | 'enriched' | 'failed' | 'in_progress';
  contactable?: Contactable;
  stage?: string; // outreach_stage (Phase 4 CRM)
  /**
   * Is it really a recruitment agency? (migration 20261114000002)
   *   undefined / 'visible' → everything except hidden non-agencies (default)
   *   'recruitment' | 'review' | 'not_recruitment' → just that verdict
   *   'all' → no relevance filter
   */
  relevance?: Relevance;
  /**
   * The four working steps the Agencies page is organised around. Each step is a
   * preset over relevance + outreach_stage, so the list, the step counters and the
   * bulk actions all agree on exactly which agencies are "in" a step.
   *   check    — not sure it's a recruitment agency yet (relevance = review)
   *   contact  — confirmed agency, not contacted yet
   *   followup — contacted or replied; waiting on a next move
   *   partners — interested or converted
   */
  step?: Step;
}

export type Relevance = 'visible' | 'recruitment' | 'review' | 'not_recruitment' | 'all';
export type Step = 'check' | 'contact' | 'followup' | 'partners';

/** Turn a step into the relevance/stage filters it stands for (explicit filters win). */
export function expandStep(f: AgencyFilter): AgencyFilter {
  switch (f.step) {
    case 'check':    return { ...f, relevance: f.relevance ?? 'review' };
    case 'contact':  return { ...f, relevance: f.relevance ?? 'recruitment', stage: f.stage ?? 'new' };
    default:         return f;
  }
}

/**
 * Apply the shared filters to a Supabase query builder. Generic so the caller
 * keeps its own builder type; `any` is confined to this function body (the
 * Supabase fluent builder isn't cleanly expressible here).
 */
export function applyAgencyFilters<T>(qb: T, filter: AgencyFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = qb as any;
  const f = expandStep(filter);
  if (f.step === 'followup') q = q.in('outreach_stage', ['contacted', 'replied']);
  if (f.step === 'partners') q = q.in('outreach_stage', ['interested', 'converted']);

  // Hidden non-agencies (travel agencies, shops, ministries…) are excluded from the
  // list AND from every bulk action unless explicitly asked for.
  const rel = f.relevance ?? 'visible';
  if (rel === 'visible') q = q.or('relevance.is.null,relevance.neq.not_recruitment');
  else if (rel !== 'all') q = q.eq('relevance', rel);

  if (f.country) q = q.eq('country_code', f.country.toLowerCase());
  if (f.category) q = q.eq('category', f.category);
  if (f.city) q = q.ilike('city', f.city);
  if (f.enrichmentStatus) q = q.eq('enrichment_status', f.enrichmentStatus);
  if (f.stage) q = q.eq('outreach_stage', f.stage);
  if (f.minRating != null) q = q.gte('rating', f.minRating);
  if (f.minReviews != null) q = q.gte('review_count', f.minReviews);
  if (f.minScore != null) q = q.gte('score', f.minScore);

  if (f.contactable) {
    switch (f.contactable) {
      case 'whatsapp':
        q = q.not('wa_phone', 'is', null).is('wa_undeliverable_at', null);
        break;
      case 'mobile':
        q = q.eq('primary_phone_type', 'mobile');
        break;
      case 'landline':
        q = q.eq('primary_phone_type', 'landline');
        break;
      case 'has':
        q = q.or('wa_phone.not.is.null,primary_phone_type.not.is.null');
        break;
      case 'none':
        q = q.is('wa_phone', null);
        break;
    }
  }

  if (f.q && f.q.trim()) {
    const term = f.q.trim().replace(/[%,()]/g, ' ');
    q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%`);
  }

  return q as T;
}
