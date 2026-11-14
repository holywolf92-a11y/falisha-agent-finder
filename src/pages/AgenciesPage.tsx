import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AgencyDrawer } from '@/components/app/AgencyDrawer';
import { refreshQuota, useQuota } from '@/components/app/QuotaWidget';
import {
  Building2, Search, ChevronLeft, ChevronRight, Sparkles, Loader2, Filter,
  Phone as PhoneIcon, MessageSquare, Globe, Mail, CheckCircle2, Send, Smartphone, UserSearch,
  ListChecks, RefreshCw, EyeOff, Download, SlidersHorizontal,
} from 'lucide-react';
import { FindPeopleDialog } from '@/components/app/FindPeopleDialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  StepCards, BestContact, NextStep, CheckQueue, MoreMenu,
  type Step, type StepSummary, type MenuItem,
} from '@/components/app/AgencySteps';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { type AgencyPhone } from '@/lib/phone';

// Server returns this shape from GET /scrape/status — mirror of ScrapeRunState
type ScrapeRunState = {
  active: boolean;
  total: number;
  done: number;
  ok: number;
  noData: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  totals: { emails: number; phones: number; whatsapp: number; socials: number };
};

type AgencySocial = { platform: string; url: string };
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
  // Phase 1 outreach fields (populated by "Find WhatsApp" + the scorer)
  score: number | null;
  score_tier: 'high' | 'medium' | 'low' | null;
  wa_phone: string | null;
  primary_phone_type: 'mobile' | 'landline' | 'unknown' | null;
  last_template_sent_at: string | null;
  template_send_count: number | null;
  wa_undeliverable_at: string | null;
  outreach_stage: string | null;
  agency_phones?: AgencyPhone[];
  agency_emails?: { email: string }[];
  agency_socials?: AgencySocial[];
  // Decision-makers (Hunter / Lusha) — counters maintained by contactsService
  contacts_count?: number;
  mobiles_count?: number;
  relevance?: 'recruitment' | 'review' | 'not_recruitment' | null;
  relevance_reason?: string | null;
  licence_no?: string | null;
  licence_authority?: string | null;
};

const COUNTRIES = [
  { code: '',   label: 'All countries' },
  // Gulf
  { code: 'ae', label: '🇦🇪 UAE' },
  { code: 'sa', label: '🇸🇦 Saudi Arabia' },
  { code: 'qa', label: '🇶🇦 Qatar' },
  { code: 'kw', label: '🇰🇼 Kuwait' },
  { code: 'bh', label: '🇧🇭 Bahrain' },
  { code: 'om', label: '🇴🇲 Oman' },
  // Expanded coverage
  { code: 'tr', label: '🇹🇷 Turkey' },
  { code: 'rs', label: '🇷🇸 Serbia' },
  { code: 'mv', label: '🇲🇻 Maldives' },
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
const CONTACTABLE = [
  { value: '',         label: 'Any contactability' },
  { value: 'whatsapp', label: '💬 WhatsApp-reachable' },
  { value: 'mobile',   label: '📱 Mobile number' },
  { value: 'landline', label: '☎️ Landline only' },
  { value: 'none',     label: 'No WhatsApp found' },
];
const SORT = [
  { value: 'rating', label: 'Sort: Rating' },
  { value: 'score',  label: 'Sort: Partner-fit' },
  { value: 'recent', label: 'Sort: Newest' },
];
const RELEVANCE = [
  { value: '',                label: 'Show: agencies + to review' },
  { value: 'recruitment',     label: 'Show: confirmed agencies' },
  { value: 'review',          label: 'Show: needs review' },
  { value: 'not_recruitment', label: 'Show: hidden (not agencies)' },
  { value: 'all',             label: 'Show: everything' },
];
const STAGES = [
  { value: '',               label: 'Any stage' },
  { value: 'new',            label: 'New' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'replied',        label: 'Replied' },
  { value: 'interested',     label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'converted',      label: 'Converted' },
];

type SendSummary = {
  dryRun: boolean;
  targeted: number;
  sent: number;
  failed: number;
  stoppedEarly: boolean;
  skipped: { no_whatsapp: number; known_dead: number; recently_contacted: number };
  wouldSend: number;
};
type WaTemplate = { name: string; language: string; status: string; category: string };
type EmailSummary = {
  dryRun: boolean;
  targeted: number;
  sent: number;
  failed: number;
  skipped: { no_email: number; recently_contacted: number };
  wouldSend: number;
};

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
  const [scrapeState, setScrapeState] = useState<ScrapeRunState | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const scrapeStateRef = useRef<ScrapeRunState | null>(null);
  const quotas = useQuota();

  // ── Phase 1 outreach state ──────────────────────────────────────────────────
  const [contactable, setContactable] = useState('');
  const [stage, setStage] = useState('');
  const [relevance, setRelevance] = useState('');
  const [sort, setSort] = useState('rating');
  const [findingWa, setFindingWa] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  // ── Simplified page: the four working steps ─────────────────────────────────
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStepState] = useState<Step>(() => {
    const fromUrl = searchParams.get('step');
    if (fromUrl && ['check', 'contact', 'followup', 'partners', 'all'].includes(fromUrl)) return fromUrl as Step;
    try { return (localStorage.getItem('faf:agencies-step') as Step) || 'contact'; } catch { return 'contact'; }
  });
  const setStep = (s: Step) => { setStepState(s); try { localStorage.setItem('faf:agencies-step', s); } catch { /* private mode */ } };
  const [summary, setSummary] = useState<StepSummary | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [waConfig, setWaConfig] = useState<{ configured: boolean; templatesConfigured: boolean; defaultLanguage: string; emailConfigured: boolean; emailFrom: string | null } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLang, setTemplateLang] = useState('en');
  const [sendPreview, setSendPreview] = useState<SendSummary | null>(null);
  const [sending, setSending] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailPreview, setEmailPreview] = useState<EmailSummary | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { setPage(0); }, [debounced, country, minRating, minReviews, enrichmentStatus, contactable, stage, relevance, sort, step]);

  // Step counters follow the same country + search as the list.
  useEffect(() => {
    const p = new URLSearchParams({ ...(country ? { country } : {}), ...(debounced ? { q: debounced } : {}) });
    api.get<StepSummary>(`/agencies/summary?${p.toString()}`).then(setSummary).catch(() => setSummary(null));
  }, [country, debounced, refreshNonce]);

  // Is WhatsApp outreach wired up? Drives the Send-template button's enabled state.
  useEffect(() => {
    api.get<{ configured: boolean; templatesConfigured: boolean; defaultLanguage: string; emailConfigured: boolean; emailFrom: string | null }>('/outreach/config')
      .then(setWaConfig)
      .catch(() => setWaConfig({ configured: false, templatesConfigured: false, defaultLanguage: 'en', emailConfigured: false, emailFrom: null }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), pageSize: String(pageSize), sort,
      ...(country          ? { country }          : {}),
      ...(debounced        ? { q: debounced }     : {}),
      ...(minRating        ? { minRating }        : {}),
      ...(minReviews       ? { minReviews }       : {}),
      ...(enrichmentStatus ? { enrichmentStatus } : {}),
      ...(contactable      ? { contactable }      : {}),
      ...(step !== 'all'   ? { step }             : {}),
      ...(step === 'all' && stage     ? { stage }     : {}),
      ...(step === 'all' && relevance ? { relevance } : {}),
    });
    api.get<{ agencies: Agency[]; total: number }>(`/agencies?${params.toString()}`)
      .then((d) => { if (!cancelled) { setAgencies(d.agencies); setTotal(d.total); } })
      .catch((e) => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, country, minRating, minReviews, enrichmentStatus, contactable, stage, relevance, sort, page, refreshNonce, step]);

  // ─── Auto-scrape orchestration ─────────────────────────────────────────────
  // On mount, peek scrape status. If a run is active, poll its progress and
  // refresh the table when it ends. If nothing is running but there ARE
  // un-scraped agencies with websites, kick off a background run. Idempotency
  // is enforced by the server's atomic guard — no client-side sessionStorage
  // flag (which would block resuming after a server crash mid-run).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastTriggerAt = 0; // throttle re-trigger so a transient failure can't loop

    async function tick() {
      if (cancelled) return;
      try {
        const r = await api.get<{ state: ScrapeRunState; pending: number | null }>('/scrape/status');
        if (cancelled) return;
        const prev = scrapeStateRef.current;
        let effectiveState = r.state;

        // Auto-trigger when idle + something pending. Server-side startAutoScrape
        // is atomic-idempotent so we don't need a client guard against re-entry.
        const shouldTrigger =
          !r.state.active && (r.pending ?? 0) > 0 && Date.now() - lastTriggerAt > 10_000;
        if (shouldTrigger) {
          lastTriggerAt = Date.now();
          try {
            const started = await api.post<{ state: ScrapeRunState }>('/scrape/auto', {});
            if (cancelled) return;
            effectiveState = started.state;
            if (started.state.total > 0) {
              toast.info(`Auto-scraping ${started.state.total} agency websites in the background.`);
            }
          } catch (e) {
            toast.error(`Auto-scrape failed: ${e instanceof Error ? e.message : 'unknown error'}`);
          }
        }

        scrapeStateRef.current = effectiveState;
        setScrapeState(effectiveState);
        setPendingCount(r.pending);

        // Run just finished — refresh the visible table + summary toast.
        if (prev?.active && !effectiveState.active) {
          setRefreshNonce((n) => n + 1);
          toast.success(
            `Scrape complete · ${effectiveState.ok} ok · ${effectiveState.noData} no-data · ${effectiveState.failed} failed · pulled ${effectiveState.totals.emails} emails, ${effectiveState.totals.socials} socials, ${effectiveState.totals.phones + effectiveState.totals.whatsapp} phones`,
          );
        }

        // Continue polling — fast while active (or freshly-started), slow when idle.
        timer = setTimeout(tick, effectiveState.active ? 6000 : 30_000);
      } catch {
        // Network blip — try again less aggressively. Don't toast (poll noise).
        if (!cancelled) timer = setTimeout(tick, 20_000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

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
      setRefreshNonce((n) => n + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scrape failed';
      // Server returns 409 when an auto-scrape is already in flight
      if (msg.includes('auto_scrape_in_progress')) {
        toast.info('Auto-scrape is already running — wait for it to finish, then try again.');
      } else {
        toast.error(msg);
      }
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

  // ── Phase 1 outreach handlers ───────────────────────────────────────────────
  // The exact filter the user sees — so Find WhatsApp / Send template act on the
  // same set the table shows.
  function currentFilter() {
    return {
      ...(debounced        ? { q: debounced }                   : {}),
      ...(country          ? { country }                        : {}),
      ...(minRating        ? { minRating: Number(minRating) }   : {}),
      ...(minReviews       ? { minReviews: Number(minReviews) } : {}),
      ...(enrichmentStatus ? { enrichmentStatus }               : {}),
      ...(contactable      ? { contactable }                    : {}),
      ...(step !== 'all'   ? { step }                           : {}),
      ...(step === 'all' && stage     ? { stage }               : {}),
      ...(step === 'all' && relevance ? { relevance }           : {}),
    };
  }

  async function runFindWhatsApp() {
    setFindingWa(true);
    try {
      const r = await api.post<{ summary: { processed: number; withWhatsApp: number; mobile: number; landline: number } }>(
        '/outreach/find-whatsapp', { filter: currentFilter() },
      );
      const s = r.summary;
      toast.success(`Checked ${s.processed} · ${s.withWhatsApp} WhatsApp-reachable · ${s.mobile} mobile · ${s.landline} landline`);
      setRefreshNonce((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Find WhatsApp failed');
    } finally {
      setFindingWa(false);
    }
  }

  async function openSendModal() {
    setSendOpen(true);
    setSendPreview(null);
    setTemplateName('');
    setTemplateLang(waConfig?.defaultLanguage || 'en');
    setTemplatesLoading(true);
    try {
      const [t, preview] = await Promise.all([
        api.get<{ templates: WaTemplate[] }>('/outreach/templates').catch(() => ({ templates: [] as WaTemplate[] })),
        api.post<{ summary: SendSummary }>('/outreach/send-template', {
          filter: currentFilter(), templateName: '__preview__', dryRun: true,
        }).catch(() => null),
      ]);
      const approved = (t.templates || []).filter((x) => x.status === 'APPROVED');
      const list = approved.length ? approved : (t.templates || []);
      setTemplates(list);
      if (list.length === 1) setTemplateName(list[0].name);
      if (preview) setSendPreview(preview.summary);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function confirmSend() {
    if (!templateName) { toast.error('Pick a template first'); return; }
    const tmpl = templates.find((t) => t.name === templateName);
    setSending(true);
    try {
      const r = await api.post<{ summary: SendSummary }>('/outreach/send-template', {
        filter: currentFilter(),
        templateName,
        language: tmpl?.language || templateLang || waConfig?.defaultLanguage || 'en',
        dryRun: false,
      });
      const s = r.summary;
      const skipped = s.skipped.no_whatsapp + s.skipped.known_dead + s.skipped.recently_contacted;
      toast.success(
        `Sent ${s.sent}${s.failed ? ` · ${s.failed} failed` : ''}${s.stoppedEarly ? ' · stopped early (rate limit)' : ''}${skipped ? ` · skipped ${skipped}` : ''}`,
      );
      setSendOpen(false);
      setRefreshNonce((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function openEmailModal() {
    setEmailOpen(true);
    setEmailPreview(null);
    // Dry-run preview of who would receive (subject/body are placeholders here).
    try {
      const preview = await api.post<{ summary: EmailSummary }>('/outreach/send-email', {
        filter: currentFilter(), subject: 'preview', body: 'preview', dryRun: true,
      });
      setEmailPreview(preview.summary);
    } catch { /* non-fatal */ }
  }

  async function confirmSendEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) { toast.error('Add a subject and body'); return; }
    setSendingEmail(true);
    try {
      const r = await api.post<{ summary: EmailSummary }>('/outreach/send-email', {
        filter: currentFilter(), subject: emailSubject.trim(), body: emailBody, dryRun: false,
      });
      const s = r.summary;
      const skipped = s.skipped.no_email + s.skipped.recently_contacted;
      toast.success(`Emailed ${s.sent}${s.failed ? ` · ${s.failed} failed` : ''}${skipped ? ` · skipped ${skipped}` : ''}`);
      setEmailOpen(false);
      setRefreshNonce((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Email failed');
    } finally {
      setSendingEmail(false);
    }
  }

  const activeExtraFilters = [minRating, minReviews, contactable, enrichmentStatus, step === 'all' ? stage : '', step === 'all' ? relevance : ''].filter(Boolean).length;

  async function runBackgroundNow() {
    try {
      await api.post('/agencies/automation/run', {});
      toast.success('Background tasks started — new emails, WhatsApp numbers and checks will appear over the next minutes.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not start background tasks'); }
  }

  async function exportPartners() {
    try {
      const rows: Agency[] = [];
      for (let p = 0; p < 20; p++) {
        const params = new URLSearchParams({ step: 'partners', page: String(p), pageSize: '200', sort: 'recent', ...(country ? { country } : {}) });
        const r = await api.get<{ agencies: Agency[]; total: number }>(`/agencies?${params.toString()}`);
        rows.push(...r.agencies);
        if (rows.length >= r.total || r.agencies.length === 0) break;
      }
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Agency', 'Country', 'City', 'Stage', 'WhatsApp', 'Phone', 'Email', 'Website', 'Licence'].map(esc).join(',')];
      for (const a of rows) {
        lines.push([a.name, a.country_code?.toUpperCase(), a.city, a.outreach_stage, a.wa_phone, a.agency_phones?.[0]?.phone,
          a.agency_emails?.[0]?.email, a.website, a.licence_no ? `${a.licence_authority} ${a.licence_no}` : ''].map(esc).join(','));
      }
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `partners${country ? '-' + country : ''}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); }
  }

  const moreItems: MenuItem[] = [
    { label: 'Find agencies in a new country', hint: 'Search Google Maps', icon: Search, onClick: () => navigate('/sweeps') },
    { label: 'Check agencies one by one', hint: `${(summary?.check ?? 0).toLocaleString()} waiting`, icon: ListChecks, onClick: () => setCheckOpen(true) },
    'divider',
    { label: 'Find HR managers and owners', hint: 'Named decision-makers with emails (Hunter)', icon: UserSearch, onClick: () => setPeopleOpen(true), disabled: total === 0 },
    { label: 'Run background tasks now', hint: 'Emails from websites, WhatsApp numbers, unclear agencies — normally automatic', icon: RefreshCw, onClick: runBackgroundNow },
    'divider',
    { label: 'Get phone and website from Google', hint: 'For this list · uses Google quota', icon: Sparkles, onClick: () => setConfirmOpen(true), disabled: enriching || quotaRemaining === 0 || total === 0 },
    { label: 'Find emails on websites', hint: 'For this list · free', icon: Globe, onClick: () => setScrapeConfirmOpen(true), disabled: scraping || total === 0 || !!scrapeState?.active },
    { label: 'Check WhatsApp numbers', hint: 'For this list · free', icon: Smartphone, onClick: () => { void runFindWhatsApp(); }, disabled: findingWa || total === 0 },
    'divider',
    { label: 'Show hidden businesses', hint: `${(summary?.hidden ?? 0).toLocaleString()} marked as not agencies`, icon: EyeOff, onClick: () => { setStep('all'); setRelevance('not_recruitment'); setFiltersOpen(true); } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partner agencies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recruitment and manpower agencies you could send workers through. Work left to right: check, contact, follow up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {step === 'check' && (
            <Button onClick={() => setCheckOpen(true)} disabled={(summary?.check ?? 0) === 0}>
              <ListChecks className="h-4 w-4" /> Start checking
            </Button>
          )}
          {step === 'contact' && (
            <MoreMenu label="Message these agencies" icon={Send} primary items={[
              { label: 'Send a WhatsApp message', hint: waConfig?.configured ? 'Approved template to every agency in this list that has WhatsApp' : 'WhatsApp is not set up on this service yet',
                icon: MessageSquare, onClick: openSendModal, disabled: !waConfig?.configured || total === 0 },
              { label: 'Send an email', hint: waConfig?.emailConfigured ? `From ${waConfig.emailFrom ?? 'your Workspace address'} to every agency in this list with an email` : 'Email is not set up on this service yet',
                icon: Mail, onClick: openEmailModal, disabled: !waConfig?.emailConfigured || total === 0 },
            ]} />
          )}
          {step === 'followup' && (
            <Button onClick={() => navigate('/outreach')}><MessageSquare className="h-4 w-4" /> Open inbox</Button>
          )}
          {step === 'partners' && (
            <Button onClick={exportPartners} disabled={(summary?.partners ?? 0) === 0}><Download className="h-4 w-4" /> Download list</Button>
          )}
          <MoreMenu items={moreItems} />
        </div>
      </div>

      {/* Auto-scrape progress banner */}
      <AutoScrapeBanner state={scrapeState} pending={pendingCount} />

      {/* The four working steps */}
      <StepCards summary={summary} step={step} onChange={setStep} />

      {/* Country + search; everything else under More filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
        <FilterSelect value={country} onChange={setCountry} options={COUNTRIES} />
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agency name or city" className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          <SlidersHorizontal className="h-4 w-4" /> More filters{activeExtraFilters > 0 ? ` (${activeExtraFilters})` : ''}
        </Button>
        {step !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setStep('all')}>View all agencies</Button>
        )}
      </div>
      {filtersOpen && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <FilterSelect value={minRating}        onChange={setMinRating}        options={MIN_RATINGS} />
          <FilterSelect value={minReviews}       onChange={setMinReviews}       options={MIN_REVIEWS} />
          <FilterSelect value={contactable}      onChange={setContactable}      options={CONTACTABLE} />
          <FilterSelect value={enrichmentStatus} onChange={setEnrichmentStatus} options={ENRICHMENT} />
          {step === 'all' && <FilterSelect value={stage}     onChange={setStage}     options={STAGES} />}
          {step === 'all' && <FilterSelect value={relevance} onChange={setRelevance} options={RELEVANCE} />}
          <FilterSelect value={sort}             onChange={setSort}             options={SORT} />
          {activeExtraFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={() => {
              setMinRating(''); setMinReviews(''); setEnrichmentStatus(''); setContactable(''); setStage(''); setRelevance('');
            }}>
              <Filter className="h-3 w-3" /> Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Result count */}
      <div className="text-[12.5px] text-muted-foreground">
        <strong className="text-foreground tabular">{total.toLocaleString()}</strong>{' '}
        {step === 'check' ? 'agencies to check — confirm the real ones, hide the rest'
          : step === 'contact' ? 'confirmed agencies you have not contacted yet'
          : step === 'followup' ? 'agencies waiting on a reply or your next move'
          : step === 'partners' ? 'partners — interested or signed'
          : relevance === 'not_recruitment' ? 'hidden businesses (not recruitment agencies)'
          : 'agencies'}
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
                : step === 'check' ? 'Nothing to check — every agency has been confirmed or hidden.'
                : step === 'followup' ? 'No conversations yet. Contact agencies from the Contact step.'
                : step === 'partners' ? 'No partners yet. Agencies you mark as interested appear here.'
                : 'Search a country from Find agencies to fill this list.'}
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
                    <th className="px-3 py-2 font-medium">Best contact</th>
                    <th className="px-3 py-2 font-medium">{step === 'check' ? 'Is it an agency?' : 'Next step'}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && agencies.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {agencies.map((a) => (
                    <tr key={a.id} onClick={() => setSelectedId(a.id)}
                        className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer">
                      <td className="px-3 py-2 max-w-[26rem]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-foreground truncate">{a.name}</span>
                          {a.licence_no && (
                            <span className="shrink-0 rounded border border-success/40 bg-success/10 px-1.5 py-px text-[10.5px] text-success"
                                  title={`Licence ${a.licence_no} (${a.licence_authority ?? 'official registry'})`}>Licensed</span>
                          )}
                          {(a.contacts_count ?? 0) > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-px text-[10.5px] text-primary"
                                  title={`${a.contacts_count} named decision-maker${a.contacts_count === 1 ? '' : 's'}`}>
                              <UserSearch className="h-3 w-3" />{a.contacts_count}
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground truncate">
                          {[a.city, a.rating != null ? `★ ${a.rating} (${a.review_count})` : null].filter(Boolean).join(' · ') || (a.address ?? '')}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {a.country_code ? (COUNTRIES.find((c) => c.code === a.country_code)?.label ?? a.country_code.toUpperCase()) : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[16rem]"><BestContact a={a} /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><NextStep a={a} onChanged={() => setRefreshNonce((n) => n + 1)} /></td>
                    </tr>
                  ))}
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

      <AgencyDrawer agencyId={selectedId} onClose={() => { setSelectedId(null); setRefreshNonce((n) => n + 1); }} />

      <CheckQueue open={checkOpen} onOpenChange={(v) => { setCheckOpen(v); if (!v) setRefreshNonce((n) => n + 1); }}
        country={country} onChanged={() => { /* counters refresh when the queue closes */ }} />

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

      {/* Find decision-makers (Hunter) — bulk over the current filter */}
      <FindPeopleDialog
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        filter={currentFilter()}
        onFinished={() => setRefreshNonce((n) => n + 1)}
      />

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

      {/* Send template dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send WhatsApp template</DialogTitle>
            <DialogDescription>
              Sends an approved WhatsApp template to the agencies matching your current filters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground">Template</label>
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
              ) : templates.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground">
                    Couldn't list templates (set <code>WHATSAPP_WABA_ID</code> to get a dropdown). Type an approved
                    template's exact name + language code to send:
                  </p>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="template_name (e.g. agency_intro)"
                    className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    value={templateLang}
                    onChange={(e) => setTemplateLang(e.target.value)}
                    placeholder="language code (e.g. en, en_US, ar)"
                    className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : (
                <select
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.name + t.language} value={t.name}>
                      {t.name} · {t.language} · {t.category}{t.status !== 'APPROVED' ? ` (${t.status})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <Row label="Matching agencies" value={total.toLocaleString()} />
            {sendPreview && (
              <>
                <Row label="Will receive the template" value={sendPreview.wouldSend.toLocaleString()} highlight />
                <div className="text-[12px] text-muted-foreground space-y-0.5">
                  <p>Skipped: {sendPreview.skipped.no_whatsapp} no WhatsApp · {sendPreview.skipped.known_dead} known-dead · {sendPreview.skipped.recently_contacted} messaged recently.</p>
                  <p className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Run "Find WhatsApp" first to resolve more reachable numbers.</p>
                </div>
              </>
            )}
            <p className="text-[12px] text-warning bg-warning/10 border border-warning/30 rounded p-2">
              This sends real WhatsApp messages to businesses. Dead numbers are remembered and skipped, and each
              agency is only re-messaged after 14 days. Capped at 250 per run.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSend}
              disabled={sending || !templateName || (sendPreview?.wouldSend ?? 0) === 0}
            >
              {sending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send to {(sendPreview?.wouldSend ?? 0).toLocaleString()}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send email</DialogTitle>
            <DialogDescription>
              Emails the agencies matching your current filters{waConfig?.emailFrom ? `, from ${waConfig.emailFrom}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={8}
              placeholder="Write your message…"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
            <Row label="Matching agencies" value={total.toLocaleString()} />
            {emailPreview && (
              <>
                <Row label="Will receive the email" value={emailPreview.wouldSend.toLocaleString()} highlight />
                <div className="text-[12px] text-muted-foreground">
                  Skipped: {emailPreview.skipped.no_email} no email · {emailPreview.skipped.recently_contacted} emailed recently.
                </div>
              </>
            )}
            <p className="text-[12px] text-warning bg-warning/10 border border-warning/30 rounded p-2">
              Sends real emails from your Workspace account. Gmail has daily send limits and bulk cold email can hurt
              deliverability — keep batches modest. Agencies emailed in the last 14 days are skipped.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSendEmail}
              disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || (emailPreview?.wouldSend ?? 0) === 0}
            >
              {sendingEmail
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Mail className="h-4 w-4" /> Send to {(emailPreview?.wouldSend ?? 0).toLocaleString()}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AutoScrapeBanner({ state, pending }: { state: ScrapeRunState | null; pending: number | null }) {
  if (!state) return null;

  // Active run — show progress bar + counters
  if (state.active) {
    const pct = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0;
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-[12.5px]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-medium text-foreground">Auto-scraping websites</span>
            <span className="text-muted-foreground tabular">
              · {state.done.toLocaleString()} / {state.total.toLocaleString()} done ({pct}%)
            </span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground tabular">
            <span><Mail className="h-3 w-3 inline -mt-px" /> {state.totals.emails}</span>
            <span><PhoneIcon className="h-3 w-3 inline -mt-px" /> {state.totals.phones + state.totals.whatsapp}</span>
            <span><Globe className="h-3 w-3 inline -mt-px" /> {state.totals.socials}</span>
            <span className="text-success">✓ {state.ok}</span>
            {state.failed > 0 && <span className="text-destructive">✗ {state.failed}</span>}
          </div>
        </div>
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  // Idle but something is pending — first poll caught it before auto-trigger fired.
  if ((pending ?? 0) > 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-[12.5px] text-muted-foreground flex items-center gap-2">
        <Globe className="h-3.5 w-3.5" />
        <span><strong className="text-foreground tabular">{pending}</strong> agencies with websites haven't been scraped yet — kicking off shortly…</span>
      </div>
    );
  }

  // Idle, nothing pending, but we recently finished — show a brief success line.
  if (state.finishedAt && (state.ok + state.noData + state.failed) > 0) {
    const ageMs = Date.now() - new Date(state.finishedAt).getTime();
    if (ageMs < 60_000) {
      return (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-2 text-[12.5px] text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span>
            Scraped <strong className="tabular">{state.ok + state.noData + state.failed}</strong> sites
            · <strong className="tabular">{state.totals.emails}</strong> emails
            · <strong className="tabular">{state.totals.socials}</strong> socials
            · <strong className="tabular">{state.totals.phones + state.totals.whatsapp}</strong> phones
          </span>
        </div>
      );
    }
  }

  return null;
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
