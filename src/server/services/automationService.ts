// Background automation — the jobs that used to be buttons on the Agencies page
// (Scrape websites, Find WhatsApp, re-check "review" agencies, Enrich) now run on
// their own: a few minutes after the server starts, every AUTOMATION_INTERVAL_HOURS
// (default 24), and right after every Google Maps search finishes.
//
// Cost rule: everything here is free EXCEPT Place Details enrichment, which only
// runs inside Google's free monthly allowance (FREE_TIER_THRESHOLD) — it can never
// push the bill up on its own.

import { db } from '../db.js';
import { logger } from '../logger.js';
import { startAutoScrape } from './websiteScraperService.js';
import { findWhatsApp } from './outreachService.js';
import { classifyAgency, classifyByHomepage } from './relevanceService.js';
import { enrichAgency } from './enrichmentService.js';
import { getQuota, FREE_TIER_THRESHOLD } from './quotaService.js';

export type AutomationRun = {
  reason: string;
  startedAt: string;
  finishedAt: string | null;
  scrapeStarted: number;
  whatsappChecked: number;
  reviewDecided: { recruitment: number; not_recruitment: number; stillReview: number };
  enriched: number;
  error: string | null;
};

let running: AutomationRun | null = null;
let last: AutomationRun | null = null;

export function getAutomationStatus() {
  return { running, last };
}

const HOMEPAGE_BATCH = 300;
const ENRICH_BATCH_MAX = 200;

async function decideReviewFromHomepages(run: AutomationRun) {
  const sb = db();
  const { data, error } = await sb
    .from('agencies')
    .select('id, name, category, google_categories, website, relevance_reason, relevance_source, contacts_count, template_send_count, outreach_stage')
    .eq('relevance', 'review')
    .is('deleted_at', null)
    .not('website', 'is', null)
    .or('relevance_source.is.null,relevance_source.eq.auto')
    .not('relevance_reason', 'ilike', '%homepage%')
    .limit(HOMEPAGE_BATCH);
  if (error) throw new Error(`review select: ${error.message}`);
  const rows = data ?? [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => {
    while (i < rows.length) {
      const a = rows[i++];
      const hasHistory = (a.contacts_count || 0) > 0 || (a.template_send_count || 0) > 0 || (a.outreach_stage && a.outreach_stage !== 'new');
      const rule = classifyAgency(a);
      let verdict = rule.verdict;
      let reason = rule.reason;
      if (verdict === 'review') {
        const h = await classifyByHomepage(a.website as string, rule.pos);
        if (h) { verdict = h.verdict; reason = `${rule.reason} → ${h.reason}`; }
        else reason = `${rule.reason} → homepage unreadable`;
      }
      if (verdict === 'not_recruitment' && hasHistory) verdict = 'review';
      if (verdict === 'recruitment') run.reviewDecided.recruitment++;
      else if (verdict === 'not_recruitment') run.reviewDecided.not_recruitment++;
      else run.reviewDecided.stillReview++;
      await sb.from('agencies')
        .update({ relevance: verdict, relevance_reason: reason.slice(0, 500), relevance_source: 'auto', relevance_checked_at: new Date().toISOString() })
        .eq('id', a.id)
        .or('relevance_source.is.null,relevance_source.eq.auto');   // never override a manual verdict
    }
  }));
}

async function enrichWithinFreeTier(run: AutomationRun) {
  const q = await getQuota('place_details');
  const freeLeft = Math.max(0, FREE_TIER_THRESHOLD.place_details - q.used);
  if (freeLeft === 0) return;
  // Confirmed agencies we still can't reach: no website on file and not yet enriched.
  const { data, error } = await db()
    .from('agencies')
    .select('id, google_place_id')
    .eq('relevance', 'recruitment')
    .in('enrichment_status', ['not_enriched', 'failed'])
    .is('website', null)
    .is('deleted_at', null)
    .not('google_place_id', 'like', '%:%')                   // registry imports aren't Google places
    .order('score', { ascending: false, nullsFirst: false })
    .limit(Math.min(freeLeft, ENRICH_BATCH_MAX));
  if (error) throw new Error(`enrich select: ${error.message}`);
  for (const a of data ?? []) {
    try { await enrichAgency(a.id); run.enriched++; } catch { /* per-agency failure is recorded by enrichAgency */ }
  }
}

/** Run every background job once. Idempotent while a run is in progress. */
export async function runAutomation(reason: string): Promise<AutomationRun> {
  if (running) return running;
  const run: AutomationRun = {
    reason, startedAt: new Date().toISOString(), finishedAt: null, scrapeStarted: 0, whatsappChecked: 0,
    reviewDecided: { recruitment: 0, not_recruitment: 0, stillReview: 0 }, enriched: 0, error: null,
  };
  running = run;
  try {
    // 1. Websites → emails, phones, WhatsApp links (runs on in the background).
    const scrape = await startAutoScrape({ limit: 1000 });
    run.scrapeStarted = scrape.total;

    // 2. Classify phone numbers + pick each agency's best WhatsApp number (free, local).
    const { data: unchecked } = await db()
      .from('agencies').select('id')
      .is('wa_checked_at', null).is('deleted_at', null)
      .or('relevance.is.null,relevance.neq.not_recruitment')
      .limit(1000);
    if (unchecked?.length) {
      const s = await findWhatsApp({ agencyIds: unchecked.map((r) => r.id as string) });
      run.whatsappChecked = s.processed;
    }

    // 3. Settle "review" agencies that have a website by reading their homepage (free).
    await decideReviewFromHomepages(run);

    // 4. Fetch phone + website for confirmed agencies without one — free allowance only.
    await enrichWithinFreeTier(run);
  } catch (err) {
    run.error = err instanceof Error ? err.message : String(err);
    logger.error({ err: run.error, reason }, 'automation_failed');
  } finally {
    run.finishedAt = new Date().toISOString();
    last = run;
    running = null;
    logger.info(run, 'automation_done');
  }
  return run;
}

/** Start the schedule: once shortly after boot, then every N hours. */
export function startAutomationScheduler() {
  if (process.env.AUTOMATION_ENABLED === 'false') {
    logger.info('automation disabled (AUTOMATION_ENABLED=false)');
    return;
  }
  const hours = Math.max(1, Number(process.env.AUTOMATION_INTERVAL_HOURS || 24));
  setTimeout(() => { void runAutomation('startup'); }, 3 * 60_000).unref?.();
  setInterval(() => { void runAutomation('scheduled'); }, hours * 3_600_000).unref?.();
  logger.info({ hours }, 'automation scheduler started');
}
