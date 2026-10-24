// Outreach orchestration for Phase 1:
//   • findWhatsApp  — classify each agency's numbers (mobile/landline), resolve
//     the best WhatsApp-reachable number, and compute the partner-fit score.
//     Pure DB work (no external API) — cheap and safe to run on a filtered set.
//   • sendTemplate  — send an approved WhatsApp template to one agency or the
//     filtered set via the Meta Cloud API, logging every send to agency_outreach,
//     with dedup (skip recently-contacted), dead-number memory (skip + remember
//     numbers Meta says aren't on WhatsApp), and an auto-stop on rate/quality
//     limits. Supports dryRun so the UI can preview counts without sending.

import { db } from '../db.js';
import { logger } from '../logger.js';
import { applyAgencyFilters, type AgencyFilter } from './agencyFilters.js';
import { classifyPhone, toWhatsAppAddress, type PhoneType } from './phoneType.js';
import { computeScore, scoreTier } from './scoreService.js';
import {
  sendTemplate as cloudSendTemplate,
  WhatsAppSendError,
  META_NOT_ON_WHATSAPP,
  META_RATE_LIMITS,
  isConfigured,
} from './whatsappCloud.js';
import { markConversationHuman } from './inboxService.js';

const FIND_CAP = 1000;       // max agencies processed by one Find WhatsApp run
const SEND_CAP = 250;        // max sends in one bulk call (safety ceiling)
const DEDUP_DAYS = 14;       // don't re-template the same agency within N days
const FIND_CONCURRENCY = 6;
const SEND_DELAY_MS = 150;   // polite gap between sends

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PhoneRow { phone: string; phone_type: string; phone_normalized?: string }
interface SocialRow { platform: string; url: string }
interface AgencyContacts {
  id: string;
  country_code: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  name?: string | null;
  wa_phone?: string | null;
  wa_undeliverable_at?: string | null;
  last_template_sent_at?: string | null;
  agency_phones?: PhoneRow[];
  agency_emails?: Array<{ id: string }>;
  agency_socials?: SocialRow[];
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/** Pick the best WhatsApp-reachable number + the primary line type for an agency. */
function resolveWhatsApp(a: AgencyContacts): { waPhone: string | null; primaryType: PhoneType } {
  const phones = a.agency_phones ?? [];
  const cc = a.country_code;

  // 1) A number the scraper already tagged as WhatsApp wins.
  const tagged = phones.find((p) => p.phone_type === 'whatsapp');
  let waPhone = tagged ? toWhatsAppAddress(tagged.phone, cc) : null;

  // 2) Otherwise the first mobile-classified number.
  if (!waPhone) {
    for (const p of phones) {
      if (classifyPhone(p.phone, cc) === 'mobile') {
        waPhone = toWhatsAppAddress(p.phone, cc);
        if (waPhone) break;
      }
    }
  }

  // Primary line type = the 'main' phone's type, else the first phone's.
  const primary = phones.find((p) => p.phone_type === 'main') ?? phones[0];
  const primaryType: PhoneType = primary ? classifyPhone(primary.phone, cc) : 'unknown';

  return { waPhone, primaryType };
}

function scoreFor(a: AgencyContacts, waPhone: string | null): { score: number; tier: string } {
  const socials = a.agency_socials ?? [];
  const linkedin = socials.find((s) => s.platform === 'linkedin')?.url ?? null;
  const score = computeScore({
    rating: a.rating,
    reviews: a.review_count,
    website: a.website,
    hasPhone: (a.agency_phones?.length ?? 0) > 0,
    hasEmail: (a.agency_emails?.length ?? 0) > 0,
    hasWhatsApp: Boolean(waPhone),
    linkedin,
    hasFacebook: socials.some((s) => s.platform === 'facebook'),
    hasInstagram: socials.some((s) => s.platform === 'instagram'),
  });
  return { score, tier: scoreTier(score) };
}

export interface FindWhatsAppSummary {
  processed: number;
  withWhatsApp: number;
  mobile: number;
  landline: number;
}

/** Classify + score agencies (by explicit ids or a filter). No external calls. */
export async function findWhatsApp(opts: { agencyIds?: string[]; filter?: AgencyFilter }): Promise<FindWhatsAppSummary> {
  const sb = db();
  const select =
    'id, country_code, website, rating, review_count,' +
    ' agency_phones(phone, phone_type, phone_normalized),' +
    ' agency_emails(id),' +
    ' agency_socials(platform, url)';

  let qb = sb.from('agencies').select(select).is('deleted_at', null).limit(FIND_CAP);
  if (opts.agencyIds?.length) {
    qb = qb.in('id', opts.agencyIds);
  } else {
    qb = applyAgencyFilters(qb, opts.filter ?? {});
  }
  const { data, error } = await qb;
  if (error) throw new Error(`find_whatsapp query failed: ${error.message}`);

  const rows = (data ?? []) as unknown as AgencyContacts[];
  const summary: FindWhatsAppSummary = { processed: 0, withWhatsApp: 0, mobile: 0, landline: 0 };

  await mapLimit(rows, FIND_CONCURRENCY, async (a) => {
    const { waPhone, primaryType } = resolveWhatsApp(a);
    const { score, tier } = scoreFor(a, waPhone);
    const { error: upErr } = await sb
      .from('agencies')
      .update({
        wa_phone: waPhone,
        primary_phone_type: primaryType,
        score,
        score_tier: tier,
        wa_checked_at: new Date().toISOString(),
      })
      .eq('id', a.id);
    if (upErr) {
      logger.warn({ agencyId: a.id, err: upErr.message }, 'find_whatsapp update failed');
      return;
    }
    summary.processed += 1;
    if (waPhone) summary.withWhatsApp += 1;
    if (primaryType === 'mobile') summary.mobile += 1;
    else if (primaryType === 'landline') summary.landline += 1;
  });

  logger.info(summary, 'find_whatsapp done');
  return summary;
}

export interface SendSummary {
  dryRun: boolean;
  targeted: number;
  sent: number;
  failed: number;
  stoppedEarly: boolean;
  skipped: { no_whatsapp: number; known_dead: number; recently_contacted: number };
  wouldSend: number; // populated on dryRun
}

function recentlyContacted(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const last = new Date(ts).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last < DEDUP_DAYS * 24 * 3600 * 1000;
}

/** Send an approved template to one agency or the filtered set. */
export async function sendTemplate(opts: {
  agencyId?: string;
  filter?: AgencyFilter;
  templateName: string;
  language: string;
  dryRun?: boolean;
  triggeredBy?: string;
}): Promise<SendSummary> {
  if (!isConfigured()) throw new WhatsAppSendError('WhatsApp Cloud API not configured');
  const sb = db();
  const dryRun = Boolean(opts.dryRun);

  const select =
    'id, name, country_code, wa_phone, wa_undeliverable_at, last_template_sent_at,' +
    ' agency_phones(phone, phone_type)';

  let qb = sb.from('agencies').select(select).is('deleted_at', null).limit(SEND_CAP);
  if (opts.agencyId) qb = qb.eq('id', opts.agencyId);
  else qb = applyAgencyFilters(qb, opts.filter ?? {});

  const { data, error } = await qb;
  if (error) throw new Error(`send_template query failed: ${error.message}`);
  const rows = (data ?? []) as unknown as AgencyContacts[];

  const summary: SendSummary = {
    dryRun,
    targeted: rows.length,
    sent: 0,
    failed: 0,
    stoppedEarly: false,
    skipped: { no_whatsapp: 0, known_dead: 0, recently_contacted: 0 },
    wouldSend: 0,
  };

  for (const a of rows) {
    // Resolve destination (prefer the stored wa_phone, else derive on the fly).
    const to = a.wa_phone || resolveWhatsApp(a).waPhone;
    if (!to) { summary.skipped.no_whatsapp += 1; continue; }
    if (a.wa_undeliverable_at) { summary.skipped.known_dead += 1; continue; }
    if (recentlyContacted(a.last_template_sent_at)) { summary.skipped.recently_contacted += 1; continue; }

    if (dryRun) { summary.wouldSend += 1; continue; }

    try {
      const { messageId } = await cloudSendTemplate(to, { name: opts.templateName, language: opts.language });
      await sb.from('agency_outreach').insert({
        agency_id: a.id,
        channel: 'whatsapp',
        direction: 'outbound',
        template_id: opts.templateName,
        to_phone: to,
        provider: 'meta_cloud_api',
        provider_message_id: messageId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
        triggered_by: opts.triggeredBy ?? 'admin',
      });
      await sb
        .from('agencies')
        .update({
          last_template_sent_at: new Date().toISOString(),
          template_send_count: (await currentSendCount(a.id)) + 1,
        })
        .eq('id', a.id);
      // Flag the conversation human-only so the portal's candidate AI bot won't
      // auto-reply when this agency responds to our cold template.
      await markConversationHuman(to);
      summary.sent += 1;
    } catch (err) {
      const e = err as WhatsAppSendError;
      await sb.from('agency_outreach').insert({
        agency_id: a.id,
        channel: 'whatsapp',
        direction: 'outbound',
        template_id: opts.templateName,
        to_phone: to,
        provider: 'meta_cloud_api',
        status: 'failed',
        status_reason: e.message?.slice(0, 500),
        failed_at: new Date().toISOString(),
        triggered_by: opts.triggeredBy ?? 'admin',
      });
      summary.failed += 1;

      if (e.code === META_NOT_ON_WHATSAPP) {
        await sb.from('agencies').update({ wa_undeliverable_at: new Date().toISOString() }).eq('id', a.id);
      } else if (e.code && META_RATE_LIMITS.has(e.code)) {
        logger.warn({ code: e.code }, 'send_template hit a rate/quality limit — stopping bulk');
        summary.stoppedEarly = true;
        break;
      }
    }

    await sleep(SEND_DELAY_MS);
  }

  logger.info(summary, 'send_template done');
  return summary;
}

/** Read the current template_send_count so the increment never clobbers it. */
async function currentSendCount(agencyId: string): Promise<number> {
  const { data } = await db().from('agencies').select('template_send_count').eq('id', agencyId).maybeSingle();
  return (data as { template_send_count?: number } | null)?.template_send_count ?? 0;
}
