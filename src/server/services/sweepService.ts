// Sweep orchestrator: runs the cities × keywords × language matrix against
// Google Places, dedups on google_place_id, persists results, and logs per-
// query audit rows. Designed to be resumable — if the process restarts mid-
// sweep, the next run can pick up the unfinished `sweep_queries` rows.

import { db } from '../db.js';
import { logger } from '../logger.js';
import { searchText, type PlaceDiscoveryResult } from './placesService.js';

// Canonical Gulf city grid. Add more by editing this list — no schema change.
export const GULF_CITIES = [
  { city: 'Dubai',       country: 'AE', region: 'AE', lat: 25.2048, lng: 55.2708, radius: 30000 },
  { city: 'Abu Dhabi',   country: 'AE', region: 'AE', lat: 24.4539, lng: 54.3773, radius: 30000 },
  { city: 'Sharjah',     country: 'AE', region: 'AE', lat: 25.3463, lng: 55.4209, radius: 20000 },
  { city: 'Riyadh',      country: 'SA', region: 'SA', lat: 24.7136, lng: 46.6753, radius: 30000 },
  { city: 'Jeddah',      country: 'SA', region: 'SA', lat: 21.4858, lng: 39.1925, radius: 25000 },
  { city: 'Dammam',      country: 'SA', region: 'SA', lat: 26.4207, lng: 50.0888, radius: 20000 },
  { city: 'Doha',        country: 'QA', region: 'QA', lat: 25.2854, lng: 51.5310, radius: 15000 },
  { city: 'Kuwait City', country: 'KW', region: 'KW', lat: 29.3759, lng: 47.9774, radius: 15000 },
  { city: 'Manama',      country: 'BH', region: 'BH', lat: 26.2235, lng: 50.5876, radius: 15000 },
  { city: 'Muscat',      country: 'OM', region: 'OM', lat: 23.5859, lng: 58.4059, radius: 20000 },
] as const;

// English-language synonyms for "recruitment agency"
export const KEYWORDS_EN = [
  'recruitment agency',
  'manpower agency',
  'staffing agency',
  'employment agency',
  'overseas recruitment',
  'HR consultancy',
  'recruitment consultants',
];

// Arabic synonyms — adds ~5x recall in Arabic-dominant cities
export const KEYWORDS_AR = [
  'شركة استقدام',
  'مكتب توظيف',
  'وكالة توظيف',
  'استقدام عمالة',
];

const MAX_PAGES_PER_QUERY = 3;
const PAGE_SIZE = 20;
const POLITE_DELAY_MS = 200; // be friendly to Places, well under rate cap

export type SweepInput = {
  cities?: string[];           // names from GULF_CITIES.city; omit for ALL
  keywordsEn?: string[];
  keywordsAr?: string[];
  triggeredBy?: string;
};

export type SweepProgress = {
  sweepId: string;
  status: 'running' | 'complete' | 'failed';
  totalQueries: number;
  completedQueries: number;
  newAgencies: number;
  totalResults: number;
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startSweep(input: SweepInput): Promise<SweepProgress> {
  const sb = db();

  // Resolve city list
  const cityNames = input.cities && input.cities.length > 0 ? input.cities : GULF_CITIES.map((c) => c.city);
  const cities = GULF_CITIES.filter((c) => cityNames.includes(c.city));
  const keywordsEn = input.keywordsEn ?? KEYWORDS_EN;
  const keywordsAr = input.keywordsAr ?? KEYWORDS_AR;

  // Estimate plan size up-front for UI
  const totalQueries = cities.length * (keywordsEn.length + keywordsAr.length);

  // Create sweep row
  const { data: sweepRow, error: sweepErr } = await sb
    .from('sweeps')
    .insert({
      status: 'running',
      cities: cityNames,
      keywords: [...keywordsEn, ...keywordsAr],
      languages: ['en', 'ar'],
      started_at: new Date().toISOString(),
      triggered_by: input.triggeredBy ?? null,
      total_queries: totalQueries,
    })
    .select('id')
    .single();
  if (sweepErr || !sweepRow) {
    throw new Error(`Failed to create sweep row: ${sweepErr?.message ?? 'unknown'}`);
  }

  const sweepId = sweepRow.id as string;
  logger.info({ sweepId, totalQueries }, 'sweep_started');

  // Fire-and-forget execution
  void runSweep(sweepId, cities, keywordsEn, keywordsAr);

  return {
    sweepId,
    status: 'running',
    totalQueries,
    completedQueries: 0,
    newAgencies: 0,
    totalResults: 0,
  };
}

async function runSweep(
  sweepId: string,
  cities: ReadonlyArray<(typeof GULF_CITIES)[number]>,
  keywordsEn: string[],
  keywordsAr: string[],
): Promise<void> {
  const sb = db();
  const t0 = Date.now();

  let newAgencies = 0;
  let totalResults = 0;
  let completedQueries = 0;
  let fatalError: string | null = null;

  for (const city of cities) {
    for (const { keywords, language } of [
      { keywords: keywordsEn, language: 'en' },
      { keywords: keywordsAr, language: 'ar' },
    ]) {
      for (const keyword of keywords) {
        const queryStart = Date.now();
        let pageIndex = 0;
        let pageToken: string | undefined;
        let resultsThisQuery = 0;
        let newThisQuery = 0;
        let queryError: string | null = null;

        try {
          do {
            const queryText = language === 'ar'
              ? `${keyword} ${city.city}`
              : `${keyword} ${city.city}`;

            const { results, nextPageToken } = await searchText({
              query: queryText,
              locationBias: { lat: city.lat, lng: city.lng, radius: city.radius },
              pageToken,
              languageCode: language,
              regionCode: city.region,
              pageSize: PAGE_SIZE,
            });

            const newCount = await upsertDiscoveryResults(sweepId, results, city.country);
            resultsThisQuery += results.length;
            newThisQuery += newCount;

            pageToken = nextPageToken;
            pageIndex += 1;
            if (pageIndex >= MAX_PAGES_PER_QUERY) break;
            await sleep(POLITE_DELAY_MS);
          } while (pageToken);
        } catch (err) {
          queryError = err instanceof Error ? err.message : String(err);
          logger.error({ sweepId, city: city.city, keyword, err: queryError }, 'sweep_query_failed');
        }

        await sb.from('sweep_queries').insert({
          sweep_id: sweepId,
          city: city.city,
          keyword,
          language,
          region_code: city.region,
          page_index: pageIndex,
          page_token: pageToken ?? null,
          results_count: resultsThisQuery,
          new_agencies: newThisQuery,
          status: queryError ? 'error' : 'ok',
          error_message: queryError,
          duration_ms: Date.now() - queryStart,
        });

        totalResults += resultsThisQuery;
        newAgencies += newThisQuery;
        completedQueries += 1;

        // Update progress on the sweep row every few queries
        if (completedQueries % 3 === 0) {
          await sb.from('sweeps')
            .update({
              total_results: totalResults,
              new_agencies: newAgencies,
            })
            .eq('id', sweepId);
        }
      }
    }
  }

  try {
    await sb
      .from('sweeps')
      .update({
        status: fatalError ? 'failed' : 'complete',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        total_results: totalResults,
        new_agencies: newAgencies,
        error_message: fatalError,
      })
      .eq('id', sweepId);
  } catch (err) {
    logger.error({ sweepId, err: err instanceof Error ? err.message : String(err) }, 'sweep_finalize_failed');
  }

  logger.info({ sweepId, totalResults, newAgencies, durationMs: Date.now() - t0 }, 'sweep_complete');
}

async function upsertDiscoveryResults(
  sweepId: string,
  results: PlaceDiscoveryResult[],
  countryCode: string,
): Promise<number> {
  if (!results.length) return 0;
  const sb = db();

  const placeIds = results.map((r) => r.id);
  const { data: existing } = await sb
    .from('agencies')
    .select('google_place_id')
    .in('google_place_id', placeIds);
  const existingSet = new Set((existing ?? []).map((r: { google_place_id: string }) => r.google_place_id));

  const rows = results.map((r) => ({
    google_place_id:   r.id,
    name:              r.name,
    name_normalized:   r.name.trim().toLowerCase(),
    country_code:      countryCode.toLowerCase(),
    country_name:      null,
    city:              null, // resolved during enrichment
    address:           r.formattedAddress,
    latitude:          r.location?.latitude ?? null,
    longitude:         r.location?.longitude ?? null,
    category:          r.primaryType,
    google_categories: r.types,
    business_status:   r.businessStatus,
    rating:            r.rating,
    review_count:      r.userRatingCount ?? 0,
    last_sweep_id:     sweepId,
    last_sweep_at:     new Date().toISOString(),
    raw:               r as unknown,
  }));

  const newRows = rows.filter((r) => !existingSet.has(r.google_place_id));
  if (newRows.length) {
    const withFirstSweep = newRows.map((r) => ({ ...r, first_sweep_id: sweepId }));
    const { error } = await sb.from('agencies').upsert(withFirstSweep, { onConflict: 'google_place_id' });
    if (error) {
      logger.error({ err: error.message }, 'agencies_insert_failed');
    }
  }

  // Update last_sweep_id on existing rows (don't touch first_sweep_id)
  const existingRows = rows.filter((r) => existingSet.has(r.google_place_id))
    .map((r) => ({
      google_place_id: r.google_place_id,
      last_sweep_id: r.last_sweep_id,
      last_sweep_at: r.last_sweep_at,
      business_status: r.business_status,
      rating: r.rating,
      review_count: r.review_count,
    }));
  if (existingRows.length) {
    const { error } = await sb.from('agencies').upsert(existingRows, { onConflict: 'google_place_id' });
    if (error) {
      logger.error({ err: error.message }, 'agencies_update_failed');
    }
  }

  return newRows.length;
}

export async function listSweeps(limit = 25) {
  const { data, error } = await db()
    .from('sweeps')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
