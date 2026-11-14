// Decision-maker contacts: Hunter (HR / owner emails, bulk) + Lusha (mobile
// numbers, targeted). Writes named PEOPLE to agency_contacts — kept apart from
// agency_emails / agency_phones (company contact points), so the WhatsApp
// template sender never targets a purchased mobile: WhatsApp needs opt-in.
//
// Cost control:
//   • Hunter: one domain-search per agency (credit only when it finds someone);
//     agencies checked in the last RECHECK_DAYS are skipped unless force=true.
//   • Lusha: never bulk. Preview (prospecting, ~1 credit per person found) →
//     admin picks people → reveal phones (~5 credits each).

import { db } from '../db.js';
import { logger } from '../logger.js';
import { applyAgencyFilters, type AgencyFilter } from './agencyFilters.js';
import { domainSearch, HunterError, type HunterEmail } from './hunterService.js';
import { prospectByDomain, revealContacts, type LushaRevealed, type LushaProspectResult } from './lushaService.js';

const RECHECK_DAYS = 90;
const HUNTER_CONCURRENCY = 3;
const BATCH_MAX = 500;

// Hosts that are not the agency's own domain — searching them returns the
// platform's staff (or nothing) and wastes a credit.
const NON_COMPANY_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com',
  'tiktok.com', 'wa.me', 'whatsapp.com', 'linktr.ee', 'google.com', 'goo.gl', 'g.page', 'business.site',
  'sites.google.com', 'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'yolasite.com',
  'bayt.com', 'naukrigulf.com', 'gulftalent.com', 'indeed.com', 'dubizzle.com', 'yellowpages.ae',
  't.me', 'telegram.me', 'bit.ly', 'tinyurl.com',
];

/** Registrable-ish domain from an agency website, or null if it isn't the agency's own site. */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\d?\./, '').replace(/\.$/, '');
  if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  if (NON_COMPANY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return host;
}

// ─── table readiness (migration 20261114000001) ───────────────────────────────

let tableReadyCache: { at: number; ok: boolean } | null = null;
export async function contactsTableReady(): Promise<boolean> {
  if (tableReadyCache && Date.now() - tableReadyCache.at < 60_000) return tableReadyCache.ok;
  const { error } = await db().from('agency_contacts').select('id', { head: true, count: 'exact' }).limit(1);
  const ok = !error;
  if (error) logger.warn({ err: error.message }, 'agency_contacts not ready (run migration 20261114000001)');
  tableReadyCache = { at: Date.now(), ok };
  return ok;
}

export class MigrationMissingError extends Error {
  constructor() {
    super('Database migration 20261114000001_decision_maker_contacts.sql has not been run yet.');
    this.name = 'MigrationMissingError';
  }
}

async function requireTable() {
  if (!(await contactsTableReady())) throw new MigrationMissingError();
}

// ─── shared helpers ───────────────────────────────────────────────────────────

type ContactRow = Record<string, unknown>;

function clean(s: unknown, max = 300): string | null {
  if (s == null) return null;
  const v = String(s).trim();
  return v ? v.slice(0, max) : null;
}

/** Recompute the per-agency counters the Agencies table shows. */
async function refreshCounters(agencyId: string) {
  const sb = db();
  const [all, mobiles] = await Promise.all([
    sb.from('agency_contacts').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).is('deleted_at', null),
    sb.from('agency_contacts').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).is('deleted_at', null).not('mobile', 'is', null),
  ]);
  await sb.from('agencies').update({ contacts_count: all.count ?? 0, mobiles_count: mobiles.count ?? 0 }).eq('id', agencyId);
}

export async function listContacts(agencyId: string) {
  if (!(await contactsTableReady())) return { ready: false, contacts: [] as ContactRow[] };
  const { data, error } = await db()
    .from('agency_contacts')
    .select('id, source, full_name, first_name, last_name, position, department, seniority, is_decision_maker, email, email_type, email_confidence, email_status, phones, mobile, do_not_call, linkedin_url, country_code, is_eu_contact, found_at')
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .order('is_decision_maker', { ascending: false, nullsFirst: false })
    .order('found_at', { ascending: true });
  if (error) throw new Error(error.message);
  return { ready: true, contacts: data ?? [] };
}

/**
 * Remove one person (erasure / "remove me" request, or wrong person). Clears
 * their data but keeps a suppression stub — agency + normalized email + Lusha
 * id — so a later Hunter/Lusha run can't silently re-add them.
 */
export async function removeContact(contactId: string) {
  await requireTable();
  const sb = db();
  const { data, error } = await sb
    .from('agency_contacts')
    .update({
      deleted_at: new Date().toISOString(),
      full_name: null, first_name: null, last_name: null, position: null, email: null,
      phones: [], mobile: null, linkedin_url: null, raw: null,
    })
    .eq('id', contactId)
    .select('agency_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.agency_id) await refreshCounters(String(data.agency_id));
}

// ─── Hunter: one agency ───────────────────────────────────────────────────────

export type HunterAgencyResult = {
  agencyId: string;
  status: 'found' | 'none' | 'no_domain' | 'skipped_recent' | 'error';
  domain: string | null;
  found: number;
  creditsUsed: number | null;
  error?: string;
};

function hunterRow(agencyId: string, countryCode: string | null, e: HunterEmail): ContactRow {
  const first = clean(e.first_name, 120);
  const last = clean(e.last_name, 120);
  const email = clean(e.value, 320);
  return {
    agency_id: agencyId,
    source: 'hunter',
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(' ') || null,
    position: clean(e.position, 200),
    department: clean(e.department, 60),
    seniority: clean(e.seniority, 60),
    is_decision_maker: typeof e.decision_maker === 'boolean' ? e.decision_maker : null,
    email,
    email_normalized: email ? email.toLowerCase() : null,
    email_type: clean(e.type, 20),
    email_confidence: typeof e.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(e.confidence))) : null,
    email_status: clean(e.verification?.status, 30),
    phones: e.phone_number ? [{ number: e.phone_number, type: 'unknown', doNotCall: false }] : [],
    linkedin_url: clean(e.linkedin, 300),
    country_code: countryCode,
    raw: e,
    updated_at: new Date().toISOString(),
  };
}

export async function hunterForAgency(agencyId: string, opts: { force?: boolean } = {}): Promise<HunterAgencyResult> {
  await requireTable();
  const sb = db();
  const { data: a, error } = await sb
    .from('agencies')
    .select('id, website, country_code, hunter_checked_at')
    .eq('id', agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!a) throw new Error('agency_not_found');

  const recentCutoff = Date.now() - RECHECK_DAYS * 864e5;
  if (!opts.force && a.hunter_checked_at && new Date(a.hunter_checked_at).getTime() > recentCutoff) {
    return { agencyId, status: 'skipped_recent', domain: domainFromWebsite(a.website), found: 0, creditsUsed: 0 };
  }

  const domain = domainFromWebsite(a.website);
  if (!domain) {
    await sb.from('agencies').update({ hunter_checked_at: new Date().toISOString(), hunter_status: 'no_domain' }).eq('id', agencyId);
    return { agencyId, status: 'no_domain', domain: null, found: 0, creditsUsed: 0 };
  }

  try {
    const r = await domainSearch(domain, { limit: 10 });
    // Respect removals: never re-save a person whose row was removed (suppression stub).
    const { data: removed } = await sb
      .from('agency_contacts').select('email_normalized')
      .eq('agency_id', agencyId).not('deleted_at', 'is', null).not('email_normalized', 'is', null);
    const suppressed = new Set((removed ?? []).map((x) => String(x.email_normalized)));
    const rows = r.emails
      .filter((e) => e?.value && e.type !== 'generic' && !suppressed.has(String(e.value).toLowerCase().trim()))
      .map((e) => hunterRow(agencyId, a.country_code ?? null, e));
    if (rows.length) {
      // New people → insert. People already on file (e.g. revealed via Lusha) →
      // refresh only Hunter's own fields so their phones/source are kept.
      const { data: onFile } = await sb
        .from('agency_contacts').select('id, email_normalized')
        .eq('agency_id', agencyId).is('deleted_at', null)
        .in('email_normalized', rows.map((x) => String(x.email_normalized)));
      const byEmail = new Map((onFile ?? []).map((x) => [String(x.email_normalized), String(x.id)]));
      const fresh = rows.filter((x) => !byEmail.has(String(x.email_normalized)));
      if (fresh.length) {
        const { error: insErr } = await sb.from('agency_contacts').insert(fresh);
        if (insErr) throw new Error(`save failed: ${insErr.message}`);
      }
      for (const x of rows.filter((y) => byEmail.has(String(y.email_normalized)))) {
        await sb.from('agency_contacts').update({
          email_status: x.email_status, email_confidence: x.email_confidence,
          is_decision_maker: x.is_decision_maker, department: x.department, seniority: x.seniority,
          updated_at: x.updated_at,
        }).eq('id', byEmail.get(String(x.email_normalized))!);
      }
    }
    const status = rows.length ? 'found' : 'none';
    await sb.from('agencies').update({ hunter_checked_at: new Date().toISOString(), hunter_status: status }).eq('id', agencyId);
    await refreshCounters(agencyId);
    return { agencyId, status, domain, found: rows.length, creditsUsed: r.creditsUsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Key / credit / rate-limit / Hunter-side outages are transient: do NOT stamp
    // hunter_checked_at (or the agency would be skipped for RECHECK_DAYS) — rethrow
    // so the batch can stop (401/429/412) or back off (403/5xx).
    const transient = err instanceof HunterError && ([401, 403, 412, 429].includes(err.status) || err.status >= 500);
    if (transient) throw err;
    // Domain-specific failures (bad/blocked domain, 4xx) are recorded so we don't retry them nightly.
    await sb.from('agencies').update({ hunter_checked_at: new Date().toISOString(), hunter_status: 'error' }).eq('id', agencyId);
    return { agencyId, status: 'error', domain, found: 0, creditsUsed: null, error: msg };
  }
}

// ─── Hunter: batch over the filtered Agencies set (background) ────────────────

export type HunterRunState = {
  active: boolean;
  total: number;
  done: number;
  found: number;        // agencies where ≥1 person was found
  people: number;       // people saved
  none: number;
  noDomain: number;
  errors: number;
  creditsUsed: number;
  stoppedReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const runState: HunterRunState = {
  active: false, total: 0, done: 0, found: 0, people: 0, none: 0, noDomain: 0, errors: 0,
  creditsUsed: 0, stoppedReason: null, startedAt: null, finishedAt: null,
};

export function getHunterRunState(): HunterRunState {
  return { ...runState };
}

type BatchArgs = { filter?: AgencyFilter; agencyIds?: string[]; limit?: number; force?: boolean };

async function selectBatch(args: BatchArgs) {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), BATCH_MAX);
  let qb = db()
    .from('agencies')
    .select('id, website, hunter_checked_at')
    .is('deleted_at', null)
    .not('website', 'is', null)
    .order('score', { ascending: false, nullsFirst: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(2000);
  if (args.agencyIds?.length) qb = qb.in('id', args.agencyIds);
  else qb = applyAgencyFilters(qb, args.filter ?? {});
  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const cutoff = Date.now() - RECHECK_DAYS * 864e5;
  const withDomain = rows.filter((r) => domainFromWebsite(r.website));
  const fresh = withDomain.filter((r) => args.force || !r.hunter_checked_at || new Date(r.hunter_checked_at).getTime() <= cutoff);
  return {
    matchedWithWebsite: rows.length,
    usableDomain: withDomain.length,
    alreadyChecked: withDomain.length - fresh.length,
    planned: fresh.slice(0, limit).map((r) => r.id as string),
    limit,
  };
}

/** Dry run for the confirm dialog: how many agencies would be searched (≈ max credits). */
export async function previewHunterBatch(args: BatchArgs) {
  await requireTable();
  const s = await selectBatch(args);
  return {
    matchedWithWebsite: s.matchedWithWebsite,
    usableDomain: s.usableDomain,
    alreadyChecked: s.alreadyChecked,
    willSearch: s.planned.length,
    maxCredits: s.planned.length,   // Hunter charges only when a search finds someone
    recheckDays: RECHECK_DAYS,
  };
}

export async function startHunterBatch(args: BatchArgs): Promise<HunterRunState> {
  await requireTable();
  if (runState.active) return getHunterRunState();
  const { planned } = await selectBatch(args);

  Object.assign(runState, {
    active: true, total: planned.length, done: 0, found: 0, people: 0, none: 0, noDomain: 0, errors: 0,
    creditsUsed: 0, stoppedReason: null, startedAt: new Date().toISOString(), finishedAt: null,
  });

  void (async () => {
    let i = 0;
    let stop = false;
    const worker = async () => {
      while (!stop && i < planned.length) {
        const id = planned[i++];
        try {
          const r = await hunterForAgency(id, { force: args.force });
          if (r.status === 'found') { runState.found += 1; runState.people += r.found; }
          else if (r.status === 'none') runState.none += 1;
          else if (r.status === 'no_domain') runState.noDomain += 1;
          else if (r.status === 'error') runState.errors += 1;
          if (r.creditsUsed) runState.creditsUsed += r.creditsUsed;
        } catch (err) {
          runState.errors += 1;
          if (err instanceof HunterError && (err.isFatalForBatch || err.status === 412)) {
            stop = true;
            runState.stoppedReason = err.status === 429
              ? 'Hunter credits / usage limit reached'
              : err.status === 401 ? 'Hunter rejected the API key' : err.message;
          } else if (err instanceof HunterError && (err.status === 403 || err.status >= 500)) {
            await new Promise((r) => setTimeout(r, 2000)); // rate-limited / Hunter hiccup — back off, agency stays unchecked
          } else {
            logger.warn({ agencyId: id, err: err instanceof Error ? err.message : String(err) }, 'hunter agency failed');
          }
        } finally {
          runState.done += 1;
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(HUNTER_CONCURRENCY, planned.length) }, worker));
    } finally {
      runState.active = false;
      runState.finishedAt = new Date().toISOString();
      logger.info(getHunterRunState(), 'hunter batch done');
    }
  })();

  return getHunterRunState();
}

// ─── Lusha: preview (prospecting) → reveal (enrich) for one agency ────────────

export async function lushaPreview(agencyId: string, opts: { allRoles?: boolean; max?: number } = {}): Promise<LushaProspectResult & { domain: string }> {
  await requireTable();
  const sb = db();
  const { data: a, error } = await sb.from('agencies').select('id, website').eq('id', agencyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!a) throw new Error('agency_not_found');
  const domain = domainFromWebsite(a.website);
  if (!domain) throw new Error('This agency has no company website domain — Lusha searches by domain.');
  const r = await prospectByDomain(domain, opts);
  await sb.from('agencies').update({ lusha_checked_at: new Date().toISOString() }).eq('id', agencyId);
  return { ...r, domain };
}

function lushaRow(agencyId: string, c: LushaRevealed): ContactRow {
  const work = c.emails.find((e) => e.type === 'work') ?? c.emails[0] ?? null;
  const email = work ? clean(work.email, 320) : null;
  const mobile = c.phones.find((p) => p.type === 'mobile')?.number ?? null;
  return {
    agency_id: agencyId,
    source: 'lusha',
    external_id: c.id,
    first_name: clean(c.firstName, 120),
    last_name: clean(c.lastName, 120),
    full_name: clean(c.fullName, 250) || [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
    position: clean(c.title, 200),
    department: clean(c.departments[0], 60),
    seniority: clean(c.seniority, 60),
    email,
    email_normalized: email ? email.toLowerCase() : null,
    email_type: work ? clean(work.type, 20) : null,
    phones: c.phones,
    mobile: clean(mobile, 40),
    do_not_call: c.phones.some((p) => p.doNotCall),
    linkedin_url: clean(c.linkedin, 300),
    country_code: c.countryIso2 ? c.countryIso2.toLowerCase() : null,
    is_eu_contact: c.isEuContact,
    raw: c.raw,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Reveal the chosen Lusha contacts and save them. If Hunter already found the
 * same person (same email), merge the phones into that row instead of
 * creating a duplicate.
 */
export async function lushaReveal(agencyId: string, ids: string[], reveal: Array<'phones' | 'emails'>) {
  await requireTable();
  const sb = db();
  const { contacts, creditsCharged } = await revealContacts(ids, reveal);
  let saved = 0;
  let mobiles = 0;
  for (const c of contacts) {
    const row = lushaRow(agencyId, c);
    if (row.mobile) mobiles += 1;

    // Existing row for this person? (same Lusha id, or same email from Hunter)
    const ors = [`external_id.eq.${c.id}`];
    if (row.email_normalized) ors.push(`email_normalized.eq.${String(row.email_normalized).replace(/[,()]/g, '')}`);
    const { data: matches } = await sb
      .from('agency_contacts')
      .select('id, source, email, email_normalized, position, linkedin_url, deleted_at')
      .eq('agency_id', agencyId)
      .or(ors.join(','));
    if ((matches ?? []).some((m) => m.deleted_at)) continue;   // removed person — suppressed
    const existing = (matches ?? [])[0] ?? null;

    if (existing) {
      const merged: ContactRow = {
        phones: row.phones,
        mobile: row.mobile,
        do_not_call: row.do_not_call,
        is_eu_contact: row.is_eu_contact,
        external_id: existing.source === 'lusha' ? c.id : undefined,
        linkedin_url: existing.linkedin_url || row.linkedin_url,
        position: existing.position || row.position,
        // keep Hunter's verified email if it had one
        ...(existing.email ? {} : { email: row.email, email_normalized: row.email_normalized, email_type: row.email_type }),
        updated_at: new Date().toISOString(),
      };
      Object.keys(merged).forEach((k) => merged[k] === undefined && delete merged[k]);
      const { error } = await sb.from('agency_contacts').update(merged).eq('id', existing.id);
      if (error) throw new Error(`save failed: ${error.message}`);
    } else {
      const { error } = await sb.from('agency_contacts').insert(row);
      if (error) throw new Error(`save failed: ${error.message}`);
    }
    saved += 1;
  }
  await refreshCounters(agencyId);
  return { requested: ids.length, saved, mobiles, creditsCharged };
}
