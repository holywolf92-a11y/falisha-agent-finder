// Per-agency enrichment using Google Place Details. Pulls phone + website +
// hours + canonical city/country + business_status from the Enterprise field
// mask and persists them into agencies + agency_phones. Designed so the
// Agencies UI can fire single-row enrichment from the drawer AND so a batch
// endpoint can drain all un-enriched rows in the background.

import { db } from '../db.js';
import { logger } from '../logger.js';
import { getPlaceDetails } from './placesService.js';
import { QuotaExhaustedError, remaining } from './quotaService.js';
import { scrapeAgencyWebsite } from './websiteScraperService.js';

export type EnrichSummary = {
  attempted: number;
  enriched: number;
  noData: number;
  failed: number;
  errors: Array<{ agencyId: string; error: string }>;
};

type AgencyRow = {
  id: string;
  google_place_id: string;
  country_code: string | null;
  city: string | null;
};

const CONCURRENCY = 4;
const POLITE_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Enrich a single agency by its google_place_id. Returns true if we wrote any
 * new data, false if Place Details returned nothing useful.
 */
export async function enrichAgency(agencyId: string): Promise<boolean> {
  const sb = db();
  const { data: agency, error } = await sb
    .from('agencies')
    .select('id, google_place_id, country_code, city')
    .eq('id', agencyId)
    .maybeSingle<AgencyRow>();
  if (error || !agency) throw new Error(error?.message ?? 'agency_not_found');

  // Mark as in-progress so the UI shows a spinner
  await sb.from('agencies').update({
    enrichment_status: 'in_progress',
    enrichment_started_at: new Date().toISOString(),
  }).eq('id', agency.id);

  let details;
  try {
    details = await getPlaceDetails(agency.google_place_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from('agencies').update({
      enrichment_status: 'failed',
      enrichment_completed_at: new Date().toISOString(),
      enrichment_error: msg.slice(0, 500),
    }).eq('id', agency.id);
    throw err;
  }

  const update: Record<string, unknown> = {
    website: details.websiteUri ?? null,
    business_status: details.businessStatus ?? null,
    rating: details.rating ?? null,
    review_count: details.userRatingCount ?? 0,
    address: details.formattedAddress ?? null,
    enrichment_status: 'enriched',
    enrichment_completed_at: new Date().toISOString(),
    enrichment_error: null,
  };
  if (details.city)        update.city = details.city;
  if (details.countryCode) update.country_code = details.countryCode;
  if (details.location?.latitude  != null) update.latitude  = details.location.latitude;
  if (details.location?.longitude != null) update.longitude = details.location.longitude;

  await sb.from('agencies').update(update).eq('id', agency.id);

  // Persist the phone. Google returns the international AND the national form
  // for the same line ("+971 50 214 2696" + "050 214 2696") — only keep the
  // international so the drawer/table doesn't show the same number twice.
  // Falls back to national if international is missing (rare).
  const canonicalPhone =
    details.internationalPhoneNumber?.trim() ||
    details.nationalPhoneNumber?.trim() ||
    null;

  if (canonicalPhone) {
    const normalized = canonicalPhone.replace(/[^\d+]/g, '');
    await sb.from('agency_phones').upsert({
      agency_id: agency.id,
      phone: canonicalPhone,
      phone_normalized: normalized,
      phone_type: 'main',
      source: 'google_maps',
      verified: false,
    }, { onConflict: 'agency_id,phone_normalized,phone_type' });
  }

  // Chain a website scrape right after enrichment lands the URL. Errors don't
  // roll back the enrichment — the row is still better than before, and the
  // auto-scrape on the Agencies page will pick up any missed sites.
  if (details.websiteUri) {
    try {
      await scrapeAgencyWebsite(agency.id);
    } catch (err) {
      logger.warn(
        { agencyId: agency.id, err: err instanceof Error ? err.message : String(err) },
        'post_enrich_scrape_failed',
      );
    }
  }

  return !!canonicalPhone || !!details.websiteUri;
}

/**
 * Drain `limit` un-enriched (or stale 'failed') agencies. Used by the
 * "Enrich missing" button on the Agencies page.
 */
export type EnrichBatchArgs = {
  limit?: number;
  countryCode?: string;
  minRating?: number;
  minReviews?: number;
};

export async function enrichBatch(args: EnrichBatchArgs): Promise<EnrichSummary & { quotaHit?: boolean; remainingQuota?: number }> {
  const sb = db();
  const requested = Math.min(Math.max(args.limit ?? 50, 1), 1000);

  // Cap the planned batch at the remaining quota so we never spend a paid call.
  const remainingQuota = await remaining('place_details');
  const limit = Math.min(requested, remainingQuota);

  let q = sb.from('agencies')
    .select('id, google_place_id, country_code, city')
    .in('enrichment_status', ['not_enriched', 'failed'])
    .is('deleted_at', null)
    .order('rating',       { ascending: false, nullsFirst: false })
    .order('review_count', { ascending: false })
    .limit(limit);
  if (args.countryCode)        q = q.eq('country_code', args.countryCode.toLowerCase());
  if (args.minRating  != null) q = q.gte('rating', args.minRating);
  if (args.minReviews != null) q = q.gte('review_count', args.minReviews);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const queue = (data ?? []) as AgencyRow[];
  const summary: EnrichSummary & { quotaHit?: boolean; remainingQuota?: number } = {
    attempted: queue.length, enriched: 0, noData: 0, failed: 0, errors: [],
    remainingQuota,
  };

  // Bounded concurrency pool — keeps Places API requests under their rate cap
  // and bounds memory while we wait for slow upstreams.
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const my = idx++;
      if (my >= queue.length) return;
      const a = queue[my];
      try {
        const wrote = await enrichAgency(a.id);
        if (wrote) summary.enriched += 1; else summary.noData += 1;
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          summary.quotaHit = true;
          logger.info({ method: err.method, used: err.used, cap: err.cap }, 'enrich_quota_hit');
          idx = queue.length; // signal the other workers to stop
          break;
        }
        summary.failed += 1;
        summary.errors.push({ agencyId: a.id, error: err instanceof Error ? err.message : String(err) });
        logger.warn({ agencyId: a.id, err: err instanceof Error ? err.message : String(err) }, 'enrich_failed');
      }
      await sleep(POLITE_DELAY_MS);
    }
  });
  await Promise.all(workers);

  return summary;
}
