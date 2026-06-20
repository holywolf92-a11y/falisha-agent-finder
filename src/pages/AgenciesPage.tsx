import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AgencyDrawer } from '@/components/app/AgencyDrawer';
import { QuotaWidget, refreshQuota, useQuota } from '@/components/app/QuotaWidget';
import {
  Building2, Search, Star, ChevronLeft, ChevronRight, Sparkles, Loader2, Filter,
  Phone as PhoneIcon, MessageSquare, Globe, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { bestPhone, whatsAppHref, telHref, fmtPhone, type AgencyPhone } from '@/lib/phone';

type Agency = {
  id: string;
  name: string;
  country_code: string | null;
  city: string | null;
  address: string | null;
  category: string | null;
  website: string | null;
  rating: number | null;
  review_count: number;
  business_status: string | null;
  enrichment_status: string;
  last_sweep_at: string | null;
  agency_phones?: AgencyPhone[];
};

const COUNTRIES = [
  { code: '',   label: 'All countries' },
  { code: 'ae', label: '🇦🇪 UAE' },
  { code: 'sa', label: '🇸🇦 Saudi Arabia' },
  { code: 'qa', label: '🇶🇦 Qatar' },
  { code: 'kw', label: '🇰🇼 Kuwait' },
  { code: 'bh', label: '🇧🇭 Bahrain' },
  { code: 'om', label: '🇴🇲 Oman' },
];
const MIN_RATINGS = [
  { value: '',    label: 'Any rating' },
  { value: '3',   label: '★ 3+' },
  { value: '4',   label: '★ 4+' },
  { value: '4.5', label: '★ 4.5+' },
  { value: '5',   label: '★ 5' },
];
const MIN_REVIEWS = [
  { value: '',   label: 'Any reviews' },
  { value: '1',  label: '≥ 1 review' },
  { value: '5',  label: '≥ 5 reviews' },
  { value: '20', label: '≥ 20 reviews' },
  { value: '50', label: '≥ 50 reviews' },
];
const ENRICHMENT = [
  { value: '',             label: 'All agencies' },
  { value: 'not_enriched', label: 'Not yet enriched' },
  { value: 'enriched',     label: 'Already enriched' },
  { value: 'failed',       label: 'Enrichment failed' },
];

export function AgenciesPage() {
  const [country, setCountry] = useState('');
  const [minRating, setMinRating] = useState('');
  const [minReviews, setMinReviews] = useState('');
  const [enrichmentStatus, setEnrichmentStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeConfirmOpen, setScrapeConfirmOpen] = useState(false);
  const quotas = useQuota();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { setPage(0); }, [debounced, country, minRating, minReviews, enrichmentStatus]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), pageSize: String(pageSize),
      ...(country          ? { country }          : {}),
      ...(debounced        ? { q: debounced }     : {}),
      ...(minRating        ? { minRating }        : {}),
      ...(minReviews       ? { minReviews }       : {}),
      ...(enrichmentStatus ? { enrichmentStatus } : {}),
    });
    api.get<{ agencies: Agency[]; total: number }>(`/agencies?${params.toString()}`)
      .then((d) => { if (!cancelled) { setAgencies(d.agencies); setTotal(d.total); } })
      .catch((e) => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, country, minRating, minReviews, enrichmentStatus, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : page * pageSize + 1;
  const endRow = Math.min(total, (page + 1) * pageSize);

  const enrichQuota = quotas.find((q) => q.method === 'place_details');
  const quotaRemaining = enrichQuota ? Math.max(0, enrichQuota.cap - enrichQuota.used) : 0;
  // For preview: how many CURRENT filtered agencies don't have enrichment yet?
  // We approximate: if user filtered to not_enriched, total IS the candidate count;
  // otherwise we cap at the visible total.
  const candidateCount = enrichmentStatus === 'not_enriched' ? total : Math.min(total, 1000);
  const planned = Math.min(candidateCount, quotaRemaining);
  const willStopEarly = candidateCount > quotaRemaining;

  async function confirmAndScrape() {
    setScrapeConfirmOpen(false);
    setScraping(true);
    try {
      const body: Record<string, unknown> = {
        limit: 100,
        ...(country     ? { countryCode: country }            : {}),
        ...(minRating   ? { minRating:   Number(minRating) }  : {}),
      };
      const r = await api.post<{ summary: { attempted: number; ok: number; noData: number; failed: number; noWebsite: number; totals: { emails: number; phones: number; whatsapp: number; socials: number } } }>(
        '/scrape/batch', body
      );
      const s = r.summary;
      toast.success(
        `Scraped ${s.attempted}: ${s.ok} ok, ${s.noData} no data, ${s.failed} failed · pulled ${s.totals.emails} emails, ${s.totals.phones + s.totals.whatsapp} phones, ${s.totals.socials} socials`
      );
      setPage(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  }

  async function confirmAndEnrich() {
    setConfirmOpen(false);
    setEnriching(true);
    try {
      const body: Record<string, unknown> = {
        limit: planned,
        ...(country     ? { countryCode: country }            : {}),
        ...(minRating   ? { minRating:   Number(minRating) }  : {}),
        ...(minReviews  ? { minReviews:  Number(minReviews) } : {}),
      };
      const r = await api.post<{ summary: { attempted: number; enriched: number; noData: number; failed: number; quotaHit?: boolean } }>('/enrich/batch', body);
      const s = r.summary;
      if (s.quotaHit) {
        toast.warning(`Quota cap reached after ${s.enriched + s.noData + s.failed} agencies. Resets on the 1st.`);
      } else {
        toast.success(`Enriched ${s.enriched} · No data ${s.noData} · Failed ${s.failed} (of ${s.attempted})`);
      }
      setPage(0);
      refreshQuota();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agencies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recruitment agencies discovered from Google Maps across the Gulf.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setScrapeConfirmOpen(true)}
            disabled={scraping || total === 0}
            variant="outline"
            title="Scrape agency websites for emails, phones, WhatsApp + social links (free, no API cost)"
          >
            {scraping
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scraping…</>
              : <><Globe className="h-4 w-4" /> Scrape websites</>}
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={enriching || quotaRemaining === 0 || total === 0}
            variant="outline"
          >
            {enriching
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Enriching…</>
              : <><Sparkles className="h-4 w-4" /> Enrich filtered</>}
          </Button>
        </div>
      </div>

      {/* Quota widget */}
      <QuotaWidget />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or address…" className="pl-9" />
        </div>
        <FilterSelect value={country}          onChange={setCountry}          options={COUNTRIES} />
        <FilterSelect value={minRating}        onChange={setMinRating}        options={MIN_RATINGS} />
        <FilterSelect value={minReviews}       onChange={setMinReviews}       options={MIN_REVIEWS} />
        <FilterSelect value={enrichmentStatus} onChange={setEnrichmentStatus} options={ENRICHMENT} />
        {(country || minRating || minReviews || enrichmentStatus || q) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setCountry(''); setMinRating(''); setMinReviews(''); setEnrichmentStatus(''); setQ('');
          }}>
            <Filter className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Result count */}
      <div className="text-[12px] text-muted-foreground">
        <strong className="text-foreground tabular">{total.toLocaleString()}</strong> agencies match
        {enrichmentStatus === 'not_enriched' && quotaRemaining > 0 && total > 0 && (
          <span> · <strong className="text-primary">{Math.min(total, quotaRemaining).toLocaleString()}</strong> can be enriched this month</span>
        )}
      </div>

      {/* Table */}
      {!agencies.length && !loading ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Building2 className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-medium">{total === 0 ? 'No matches' : 'No agencies on this page'}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {country || minRating || minReviews || enrichmentStatus || q
                ? 'Adjust your filters above.'
                : 'Run a sweep from the Sweeps tab to populate this list.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border whitespace-nowrap">
                    <th className="px-3 py-2 font-medium">Agency</th>
                    <th className="px-3 py-2 font-medium">Country</th>
                    <th className="px-3 py-2 font-medium">Rating</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && agencies.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {agencies.map((a) => {
                    const phone = bestPhone(a.agency_phones);
                    const wa = phone ? whatsAppHref(phone.phone) : null;
                    const tel = phone ? telHref(phone.phone) : null;
                    return (
                      <tr key={a.id} onClick={() => setSelectedId(a.id)}
                          className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer whitespace-nowrap">
                        <td className="px-3 py-1.5 max-w-[24rem] truncate">
                          <span className="font-medium text-foreground">{a.name}</span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {a.country_code ? (COUNTRIES.find((c) => c.code === a.country_code)?.label ?? a.country_code.toUpperCase()) : '—'}
                        </td>
                        <td className="px-3 py-1.5 tabular">
                          {a.rating != null ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="h-3 w-3 fill-warning text-warning" />
                              <span className="font-medium">{a.rating}</span>
                              <span className="text-muted-foreground">({a.review_count})</span>
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <ContactCell phone={phone?.phone ?? null} website={a.website} waHref={wa} telHref={tel} />
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground capitalize max-w-[10rem] truncate">{(a.category || '').replace(/_/g, ' ') || '—'}</td>
                        <td className="px-3 py-1.5">
                          {a.enrichment_status === 'enriched'
                            ? <Badge variant="success">Enriched</Badge>
                            : a.enrichment_status === 'failed'
                              ? <Badge variant="destructive">Failed</Badge>
                              : a.enrichment_status === 'in_progress'
                                ? <Badge pulse>Running</Badge>
                                : <Badge variant="secondary">Pending</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-[12px] text-muted-foreground">
              <span>Showing <span className="text-foreground tabular">{startRow}–{endRow}</span> of <span className="text-foreground tabular">{total.toLocaleString()}</span></span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 tabular">Page {page + 1} / {totalPages}</span>
                <Button variant="ghost" size="icon" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AgencyDrawer agencyId={selectedId} onClose={() => setSelectedId(null)} />

      {/* Scrape confirmation dialog */}
      <Dialog open={scrapeConfirmOpen} onOpenChange={setScrapeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scrape agency websites</DialogTitle>
            <DialogDescription>
              Visits each agency's website (homepage + /contact + /about) and extracts emails,
              phone numbers, WhatsApp links, and social URLs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Row label="Matching agencies in current filter" value={total.toLocaleString()} />
            <Row label="Will scrape up to" value="100" highlight />
            <div className="text-[12px] text-muted-foreground space-y-1">
              <p className="flex items-center gap-1"><Globe className="h-3 w-3" /> Only agencies that have a website are scraped. Run "Enrich filtered" first for the rest.</p>
              <p className="flex items-center gap-1"><Mail className="h-3 w-3" /> Polite by design: 4 sites at a time, 12s timeout per page, max 3 pages per site.</p>
              <p className="font-medium text-foreground">Free — no API cost.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScrapeConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmAndScrape}>Start scrape</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrich confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm batch enrichment</DialogTitle>
            <DialogDescription>
              Pulls phone, website, hours &amp; rating from Google Maps for the filtered agencies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Row label="Matching agencies" value={total.toLocaleString()} />
            <Row label="Free quota remaining this month" value={quotaRemaining.toLocaleString()} />
            <Row label="Will be enriched now" value={planned.toLocaleString()} highlight />
            {willStopEarly && (
              <p className="text-[12px] text-warning bg-warning/10 border border-warning/30 rounded p-2">
                Not enough free quota for all matches — will stop after {planned.toLocaleString()}.
                Click again next month or after the 1st reset to do the rest.
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              Hard-capped to free tier. <strong>Zero charge possible.</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmAndEnrich} disabled={planned === 0}>
              {planned === 0 ? 'Quota exhausted' : `Enrich ${planned.toLocaleString()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value?: string; code?: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((o) => {
        const v = (o.value ?? o.code) ?? '';
        return <option key={v + o.label} value={v}>{o.label}</option>;
      })}
    </select>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'text-2xl font-semibold tracking-tight tabular' : 'tabular font-medium'}>{value}</span>
    </div>
  );
}

function ContactCell({
  phone, website, waHref, telHref,
}: {
  phone: string | null;
  website: string | null;
  waHref: string | null;
  telHref: string | null;
}) {
  if (!phone && !website) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {phone && (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px]">
          <span className="text-foreground">{fmtPhone(phone)}</span>
          {telHref && (
            <a href={telHref} onClick={(e) => e.stopPropagation()}
               className="h-5 w-5 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
               title="Call">
              <PhoneIcon className="h-3 w-3" />
            </a>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
               className="h-5 w-5 rounded inline-flex items-center justify-center text-success hover:bg-success/10"
               title="Open WhatsApp">
              <MessageSquare className="h-3 w-3" />
            </a>
          )}
        </span>
      )}
      {website && (
        <a href={website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
           className="h-5 w-5 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted ml-1"
           title="Open website">
          <Globe className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
