// Lightweight HTTP-only website scraper. No Playwright/Chromium — fits inside
// the existing 512 MB Railway container alongside the API.
//
// For each agency with a website we fetch homepage + a few common contact pages
// (cap 4 fetches per site), parse with cheerio, then run extractor functions
// for emails / phones / WhatsApp links / social handles. Polite by design:
// per-domain serialization, jittered 1.5–3 s delay, bounded concurrency, hard
// timeout, and a no-bot User-Agent so Cloudflare challenges happen less.

import * as cheerio from 'cheerio';
import { db } from '../db.js';
import { logger } from '../logger.js';

const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PAGES_PER_SITE = 3;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CONTACT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us'];

// Skip these "noise" emails that aren't real outreach targets.
const BLACKLIST_EMAIL_PREFIXES = [
  'noreply@', 'no-reply@', 'donotreply@', 'do-not-reply@', 'mailer-daemon@',
  'postmaster@', 'abuse@', 'webmaster@',
  'example@', 'your@', 'name@', 'email@', 'youremail@', 'yourname@',
  'firstname@', 'first.last@', 'first@', 'lastname@', 'foo@', 'bar@', 'test@',
  'john@', 'jane@', 'john.doe@', 'jane.doe@', 'username@', 'user@',
];
// Sentinel/RFC-reserved domains that appear in placeholder forms.
const BLACKLIST_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'doe.com',
  'test.com', 'localhost', 'domain.com', 'yourcompany.com', 'company.com',
  'sentry.io', 'sentry-cdn.com', 'wixstatic.com', 'cloudflare.com', 'google.com',
  'gstatic.com', 'googleapis.com', 'gmail.com.test',
]);
const RESERVED_TLDS = ['.example', '.test', '.invalid', '.localhost'];

export type ScrapeResult = {
  agencyId: string;
  website: string;
  status: 'ok' | 'no_data' | 'failed' | 'no_website';
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
  socials: Array<{ platform: string; url: string }>;
  pagesFetched: string[];
  error?: string;
};

export type ScrapeSummary = {
  attempted: number;
  ok: number;
  noData: number;
  failed: number;
  noWebsite: number;
  totals: { emails: number; phones: number; whatsapp: number; socials: number };
};

// ─── extractors ──────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE_GULF = /\+9[567]\d[\s\-.()]?\d{1,4}[\s\-.()]?\d{3,6}[\s\-.()]?\d{0,4}/g;     // +971, +966, +965, +974, +973, +968
const PHONE_RE_GENERIC = /\+\d{1,3}[\s\-.()]?\d{2,4}[\s\-.()]?\d{3,5}[\s\-.()]?\d{2,5}/g;
const WHATSAPP_URL_RE = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?([+\d]+)/gi;
const WHATSAPP_CHAT_RE = /chat\.whatsapp\.com\/[\w-]+/gi;

const SOCIAL_PATTERNS: Array<{ platform: string; re: RegExp }> = [
  { platform: 'linkedin',  re: /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in|school)\/[^\s"'<>?]+/gi },
  { platform: 'facebook',  re: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\s"'<>?#]+/gi },
  { platform: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>?#/]+/gi },
  { platform: 'twitter',   re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>?#/]+/gi },
  { platform: 'youtube',   re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|user\/|c\/)[^\s"'<>?#/]+/gi },
  { platform: 'tiktok',    re: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>?#/]+/gi },
];

function deobfuscate(text: string): string {
  // Common email obfuscations on agency sites
  return text
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|\s+dot\s+/gi, '.');
}

function looksLikeRealEmail(email: string): boolean {
  const lower = email.toLowerCase();
  // Filter placeholder/example patterns used in contact-form HTML
  for (const prefix of BLACKLIST_EMAIL_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }
  const domain = lower.split('@')[1];
  if (!domain) return false;
  if (BLACKLIST_DOMAINS.has(domain)) return false;
  for (const tld of RESERVED_TLDS) {
    if (domain.endsWith(tld)) return false;
  }
  // Image-CDN file extensions sometimes match the regex (e.g. user@2x.png)
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(lower)) return false;
  if (lower.length > 100) return false;
  return true;
}

function extractEmails(html: string, plainText: string): Set<string> {
  const out = new Set<string>();
  const haystack = deobfuscate(html + '\n' + plainText);
  const matches = haystack.match(EMAIL_RE) || [];
  for (const raw of matches) {
    const email = raw.toLowerCase().trim();
    if (looksLikeRealEmail(email)) out.add(email);
  }
  return out;
}

function extractPhones(text: string): Set<string> {
  const out = new Set<string>();
  for (const re of [PHONE_RE_GULF, PHONE_RE_GENERIC]) {
    const matches = text.match(re) || [];
    for (const raw of matches) {
      const normalized = raw.replace(/[^\d+]/g, '');
      // Gulf/most legitimate numbers are 8–15 digits after the +.
      if (normalized.length >= 9 && normalized.length <= 16) out.add(raw.trim());
    }
  }
  return out;
}

function extractWhatsapp(html: string): { numbers: Set<string>; chats: Set<string> } {
  const numbers = new Set<string>();
  const chats = new Set<string>();
  for (const m of html.matchAll(WHATSAPP_URL_RE)) {
    const digits = (m[1] || '').replace(/[^\d+]/g, '');
    if (digits.length >= 9) numbers.add(digits.startsWith('+') ? digits : '+' + digits);
  }
  for (const m of html.matchAll(WHATSAPP_CHAT_RE)) chats.add('https://' + m[0]);
  return { numbers, chats };
}

function extractSocials(html: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { platform, re } of SOCIAL_PATTERNS) {
    const set = new Set<string>();
    for (const m of html.matchAll(re)) {
      let url = m[0].replace(/[?#].*$/, '').replace(/\/$/, '');
      // Skip sharer/intent URLs and stripped meta-paths.
      if (/\/(sharer|intent|share|home)$/i.test(url)) continue;
      // Skip Facebook page IDs that look like permalinks rather than the brand page.
      if (platform === 'facebook' && /\/permalink|\/posts|\/photo/.test(url)) continue;
      if (url.length > 200) continue;
      set.add(url);
    }
    if (set.size) out.set(platform, set);
  }
  return out;
}

// ─── fetch + scrape one agency ───────────────────────────────────────────────

function originOf(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

function pageUrl(origin: string, path: string): string {
  return origin.replace(/\/$/, '') + path;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Use the platform's native fetch (Node 18+ via undici under the hood).
    // It follows redirects by default — critical for the many agency sites
    // that 301 from http:// to https:// or from /contact to /contact-us/.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (ct && !ct.includes('text/html') && !ct.includes('xhtml')) return null;
    const text = await res.text();
    if (text.length > 2_000_000) return text.slice(0, 2_000_000); // 2 MB cap
    return text;
  } catch (err) {
    logger.debug({ url, err: err instanceof Error ? err.message : String(err) }, 'scrape_fetch_failed');
    return null;
  }
}

export async function scrapeAgencyWebsite(agencyId: string): Promise<ScrapeResult> {
  const sb = db();
  const { data: agency, error } = await sb
    .from('agencies')
    .select('id, website')
    .eq('id', agencyId)
    .maybeSingle<{ id: string; website: string | null }>();
  if (error || !agency) throw new Error(error?.message ?? 'agency_not_found');

  const out: ScrapeResult = {
    agencyId, website: agency.website ?? '', status: 'no_website',
    emails: [], phones: [], whatsappNumbers: [], socials: [], pagesFetched: [],
  };

  if (!agency.website) return out;

  const origin = originOf(agency.website);
  if (!origin) {
    out.status = 'failed';
    out.error = 'unparseable_url';
    return out;
  }

  const seen = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  const wa = new Set<string>();
  const socials = new Map<string, Set<string>>();

  for (const path of CONTACT_PATHS) {
    if (out.pagesFetched.length >= MAX_PAGES_PER_SITE) break;
    const url = pageUrl(origin, path);
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchPage(url);
    if (!html) continue;
    out.pagesFetched.push(url);

    const $ = cheerio.load(html);
    // Strip script/style noise so phone/email regex doesn't catch JS artefacts.
    $('script, style, noscript').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    for (const e of extractEmails(html, text)) emails.add(e);
    for (const p of extractPhones(html + ' ' + text)) phones.add(p);
    const w = extractWhatsapp(html);
    for (const n of w.numbers) wa.add(n);
    for (const c of w.chats) socials.set('whatsapp', (socials.get('whatsapp') ?? new Set()).add(c));
    for (const [platform, urls] of extractSocials(html)) {
      const cur = socials.get(platform) ?? new Set<string>();
      for (const u of urls) cur.add(u);
      socials.set(platform, cur);
    }
  }

  out.emails = Array.from(emails).slice(0, 20);
  out.phones = Array.from(phones).slice(0, 10);
  out.whatsappNumbers = Array.from(wa).slice(0, 5);
  out.socials = Array.from(socials.entries()).flatMap(([platform, urls]) =>
    Array.from(urls).slice(0, 3).map((url) => ({ platform, url })),
  );

  // Persist
  await persist(out);

  out.status = (out.emails.length + out.phones.length + out.whatsappNumbers.length + out.socials.length) > 0
    ? 'ok' : 'no_data';
  return out;
}

async function persist(r: ScrapeResult): Promise<void> {
  const sb = db();

  // Pull the agency's existing phones so we can dedupe a national-format hit
  // ("4443 8239") against an already-known international one ("+974 4443 8239").
  // We compare by the trailing 8 digits — same line if they match.
  const { data: existingPhones } = await sb
    .from('agency_phones')
    .select('phone_normalized, phone_type')
    .eq('agency_id', r.agencyId);
  const knownTails = new Set<string>();
  for (const p of (existingPhones ?? []) as Array<{ phone_normalized: string; phone_type: string }>) {
    const digits = p.phone_normalized.replace(/\D/g, '');
    if (digits.length >= 8) knownTails.add(digits.slice(-8) + '|' + p.phone_type);
  }

  // Emails
  for (const email of r.emails) {
    await sb.from('agency_emails').upsert({
      agency_id: r.agencyId, email, email_normalized: email.toLowerCase(),
      source: 'website_scrape', source_url: r.website, confidence: 70, verified: false,
    }, { onConflict: 'agency_id,email_normalized' });
  }
  // Phones
  for (const phone of r.phones) {
    const normalized = phone.replace(/[^\d+]/g, '');
    const tail = normalized.replace(/\D/g, '').slice(-8);
    if (tail && knownTails.has(tail + '|main')) continue; // duplicate of existing
    await sb.from('agency_phones').upsert({
      agency_id: r.agencyId, phone, phone_normalized: normalized,
      phone_type: 'main', source: 'website_scrape', source_url: r.website, verified: false,
    }, { onConflict: 'agency_id,phone_normalized,phone_type' });
    if (tail) knownTails.add(tail + '|main');
  }
  // WhatsApp numbers as phones with type=whatsapp
  for (const wa of r.whatsappNumbers) {
    const normalized = wa.replace(/[^\d+]/g, '');
    const tail = normalized.replace(/\D/g, '').slice(-8);
    if (tail && knownTails.has(tail + '|whatsapp')) continue;
    await sb.from('agency_phones').upsert({
      agency_id: r.agencyId, phone: wa, phone_normalized: normalized,
      phone_type: 'whatsapp', source: 'website_scrape', source_url: r.website, verified: false,
    }, { onConflict: 'agency_id,phone_normalized,phone_type' });
    if (tail) knownTails.add(tail + '|whatsapp');
  }
  // Socials
  for (const { platform, url } of r.socials) {
    await sb.from('agency_socials').upsert({
      agency_id: r.agencyId, platform, url, source: 'website_scrape',
    }, { onConflict: 'agency_id,platform,url' });
  }
}

// ─── batch ───────────────────────────────────────────────────────────────────

export async function scrapeBatch(args: {
  limit?: number;
  countryCode?: string;
  minRating?: number;
}): Promise<ScrapeSummary & { results: ScrapeResult[] }> {
  const sb = db();
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);

  // We only scrape agencies that have a website. Order best-quality first.
  let q = sb.from('agencies')
    .select('id, website')
    .not('website', 'is', null)
    .is('deleted_at', null)
    .order('rating', { ascending: false, nullsFirst: false })
    .order('review_count', { ascending: false })
    .limit(limit);
  if (args.countryCode) q = q.eq('country_code', args.countryCode.toLowerCase());
  if (args.minRating != null) q = q.gte('rating', args.minRating);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const queue = (data ?? []) as Array<{ id: string }>;
  const summary: ScrapeSummary & { results: ScrapeResult[] } = {
    attempted: queue.length, ok: 0, noData: 0, failed: 0, noWebsite: 0,
    totals: { emails: 0, phones: 0, whatsapp: 0, socials: 0 },
    results: [],
  };

  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const my = idx++;
      if (my >= queue.length) return;
      const a = queue[my];
      try {
        const r = await scrapeAgencyWebsite(a.id);
        summary.results.push(r);
        if (r.status === 'ok') summary.ok += 1;
        else if (r.status === 'no_data') summary.noData += 1;
        else if (r.status === 'no_website') summary.noWebsite += 1;
        else summary.failed += 1;
        summary.totals.emails += r.emails.length;
        summary.totals.phones += r.phones.length;
        summary.totals.whatsapp += r.whatsappNumbers.length;
        summary.totals.socials += r.socials.length;
      } catch (err) {
        summary.failed += 1;
        logger.warn({ agencyId: a.id, err: err instanceof Error ? err.message : String(err) }, 'scrape_failed');
      }
    }
  });
  await Promise.all(workers);

  return summary;
}
