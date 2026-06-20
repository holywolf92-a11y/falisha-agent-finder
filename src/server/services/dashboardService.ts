// Dashboard aggregate stats. Designed to be one round-trip from the UI — we
// fire several Supabase count queries in parallel and join them into a single
// shape on the way out so the Dashboard page only needs one fetch.

import { db } from '../db.js';

export type DashboardStats = {
  agencies: {
    total: number;
    enriched: number;
    notEnriched: number;
    failed: number;
    withPhones: number;
    withWebsite: number;
    enrichedPercent: number;     // 0–100
  };
  coverage: {
    countriesCovered: number;
    citiesCovered: number;
    byCountry: Array<{ country_code: string; count: number }>;
  };
  sweeps: {
    total: number;
    thisMonth: number;
    running: number;
    lastFinishedAt: string | null;
    recent: Array<{
      id: string;
      status: string;
      cities: string[];
      total_results: number;
      new_agencies: number;
      created_at: string;
    }>;
  };
  outreach: {
    total: number;
    thisWeek: number;
    byChannel: Array<{ channel: string; count: number }>;
  };
};

// Helper: pull a count from a Supabase query without retrieving rows.
async function countWhere(
  table: string,
  patch: (qb: ReturnType<ReturnType<typeof db>['from']>) => unknown,
): Promise<number> {
  const sb = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb: any = sb.from(table).select('*', { count: 'exact', head: true });
  qb = patch(qb);
  const { count, error } = await qb;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

function currentMonthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sb = db();

  // Run the counts in parallel — Supabase is happy with a fan-out at this scale.
  const [
    total,
    enriched,
    notEnriched,
    failed,
    withWebsite,
    sweepsTotal,
    sweepsThisMonth,
    sweepsRunning,
    outreachTotal,
    outreachThisWeek,
  ] = await Promise.all([
    countWhere('agencies',         (q) => (q as any).is('deleted_at', null)),
    countWhere('agencies',         (q) => (q as any).is('deleted_at', null).eq('enrichment_status', 'enriched')),
    countWhere('agencies',         (q) => (q as any).is('deleted_at', null).eq('enrichment_status', 'not_enriched')),
    countWhere('agencies',         (q) => (q as any).is('deleted_at', null).eq('enrichment_status', 'failed')),
    countWhere('agencies',         (q) => (q as any).is('deleted_at', null).not('website', 'is', null)),
    countWhere('sweeps',           (q) => q),
    countWhere('sweeps',           (q) => (q as any).gte('created_at', currentMonthStartIso())),
    countWhere('sweeps',           (q) => (q as any).eq('status', 'running')),
    countWhere('agency_outreach',  (q) => (q as any).eq('direction', 'outbound')),
    countWhere('agency_outreach',  (q) => (q as any).eq('direction', 'outbound').gte('sent_at', daysAgoIso(7))),
  ]);

  // Distinct phones-owning agencies: count distinct agency_id from agency_phones.
  // Supabase JS doesn't have a clean COUNT(DISTINCT) helper, so fetch the IDs.
  const { data: phoneOwnerIds } = await sb
    .from('agency_phones')
    .select('agency_id');
  const withPhones = new Set((phoneOwnerIds ?? []).map((r: { agency_id: string }) => r.agency_id)).size;

  // Country breakdown — pull all (small set) and aggregate client-side.
  const { data: countryRows } = await sb
    .from('agencies')
    .select('country_code')
    .is('deleted_at', null)
    .not('country_code', 'is', null);
  const countryMap = new Map<string, number>();
  for (const r of (countryRows ?? []) as Array<{ country_code: string }>) {
    countryMap.set(r.country_code, (countryMap.get(r.country_code) ?? 0) + 1);
  }
  const byCountry = Array.from(countryMap.entries())
    .map(([country_code, count]) => ({ country_code, count }))
    .sort((a, b) => b.count - a.count);

  // Cities covered: distinct (country, city) pairs where city is set.
  const { data: cityRows } = await sb
    .from('agencies')
    .select('country_code, city')
    .is('deleted_at', null)
    .not('city', 'is', null);
  const cityKey = new Set<string>();
  for (const r of (cityRows ?? []) as Array<{ country_code: string | null; city: string | null }>) {
    if (r.country_code && r.city) cityKey.add(`${r.country_code}|${r.city.toLowerCase()}`);
  }

  // Recent sweeps (5 latest)
  const { data: recentSweepsRows } = await sb
    .from('sweeps')
    .select('id, status, cities, total_results, new_agencies, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  // Last finished sweep timestamp (for "last sweep ran 2h ago")
  const { data: lastFinishedRows } = await sb
    .from('sweeps')
    .select('finished_at')
    .eq('status', 'complete')
    .order('finished_at', { ascending: false, nullsFirst: false })
    .limit(1);
  const lastFinishedAt = (lastFinishedRows?.[0] as { finished_at: string | null } | undefined)?.finished_at ?? null;

  // Outreach by channel breakdown
  const { data: outreachRows } = await sb
    .from('agency_outreach')
    .select('channel')
    .eq('direction', 'outbound');
  const channelMap = new Map<string, number>();
  for (const r of (outreachRows ?? []) as Array<{ channel: string }>) {
    channelMap.set(r.channel, (channelMap.get(r.channel) ?? 0) + 1);
  }
  const byChannel = Array.from(channelMap.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  return {
    agencies: {
      total,
      enriched,
      notEnriched,
      failed,
      withPhones,
      withWebsite,
      enrichedPercent: total > 0 ? Math.round((enriched / total) * 100) : 0,
    },
    coverage: {
      countriesCovered: countryMap.size,
      citiesCovered: cityKey.size,
      byCountry,
    },
    sweeps: {
      total: sweepsTotal,
      thisMonth: sweepsThisMonth,
      running: sweepsRunning,
      lastFinishedAt,
      recent: (recentSweepsRows ?? []) as DashboardStats['sweeps']['recent'],
    },
    outreach: {
      total: outreachTotal,
      thisWeek: outreachThisWeek,
      byChannel,
    },
  };
}
