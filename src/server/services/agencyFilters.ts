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
}

export type Relevance = 'visible' | 'recruitment' | 'review' | 'not_recruitment' | 'all';

/**
 * Apply the shared filters to a Supabase query builder. Generic so the caller
 * keeps its own builder type; `any` is confined to this function body (the
 * Supabase fluent builder isn't cleanly expressible here).
 */
export function applyAgencyFilters<T>(qb: T, f: AgencyFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = qb as any;

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
