import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ExternalLink, Phone, Mail, MapPin, Star, X, MessageSquare, Linkedin, Sparkles, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from 'sonner';

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
};

type AgencyDetail = {
  agency: Agency & {
    google_categories?: string[];
    latitude?: number;
    longitude?: number;
    outreach_stage?: string | null;
    outreach_notes?: string | null;
  };
  emails: Array<{ id: string; email: string; source: string; verified: boolean; confidence: number }>;
  phones: Array<{ id: string; phone: string; phone_type: string; source: string; verified: boolean }>;
  socials: Array<{ id: string; platform: string; url: string }>;
  reviews: Array<{ id: string; author_name: string | null; rating: number; text: string | null; posted_at: string | null }>;
  outreach: Array<{ id: string; channel: string; status: string; sent_at: string | null; subject: string | null }>;
};

const FLAG: Record<string, string> = { ae: '🇦🇪', sa: '🇸🇦', qa: '🇶🇦', kw: '🇰🇼', bh: '🇧🇭', om: '🇴🇲' };

const DRAWER_STAGES = [
  { value: 'new',            label: 'New' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'replied',        label: 'Replied' },
  { value: 'interested',     label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'converted',      label: 'Converted' },
];

export function AgencyDrawer({ agencyId, onClose }: { agencyId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [scraping,  setScraping]  = useState(false);
  const [stage, setStage] = useState('new');
  const [notes, setNotes] = useState('');
  const [savingCrm, setSavingCrm] = useState(false);

  async function reload() {
    if (!agencyId) return;
    try {
      const data = await api.get<AgencyDetail>(`/agencies/${agencyId}`);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load agency');
    }
  }

  useEffect(() => {
    if (!agencyId) { setDetail(null); return; }
    setLoading(true);
    api.get<AgencyDetail>(`/agencies/${agencyId}`)
      .then(setDetail)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load agency'))
      .finally(() => setLoading(false));
  }, [agencyId]);

  useEffect(() => {
    setStage(detail?.agency.outreach_stage || 'new');
    setNotes(detail?.agency.outreach_notes || '');
  }, [detail]);

  async function savePipeline() {
    if (!agencyId) return;
    setSavingCrm(true);
    try {
      await api.patch(`/agencies/${agencyId}`, { outreach_stage: stage, outreach_notes: notes });
      toast.success('Pipeline saved');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingCrm(false);
    }
  }

  async function runEnrich() {
    if (!agencyId || enriching) return;
    setEnriching(true);
    try {
      const r = await api.post<{ ok: boolean; hadData: boolean }>(`/enrich/agency/${agencyId}`);
      toast.success(r.hadData ? 'Contact info found' : 'No contact info on Google Maps');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  }

  async function runScrape() {
    if (!agencyId || scraping) return;
    setScraping(true);
    try {
      const r = await api.post<{ ok: boolean; result: { emails: string[]; phones: string[]; whatsappNumbers: string[]; socials: Array<{ platform: string; url: string }>; status: string } }>(`/scrape/agency/${agencyId}`);
      const s = r.result;
      const total = s.emails.length + s.phones.length + s.whatsappNumbers.length + s.socials.length;
      if (total > 0) {
        toast.success(`Found ${s.emails.length} email${s.emails.length === 1 ? '' : 's'}, ${s.phones.length + s.whatsappNumbers.length} phone${(s.phones.length + s.whatsappNumbers.length) === 1 ? '' : 's'}, ${s.socials.length} social link${s.socials.length === 1 ? '' : 's'}`);
      } else if (s.status === 'no_website') {
        toast.warning('No website on file — run Google enrichment first');
      } else {
        toast.warning('Website scraped, no contact info found');
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  }

  useEffect(() => {
    if (!agencyId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [agencyId, onClose]);

  return (
    <AnimatePresence>
      {agencyId && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[560px] bg-card border-l border-border shadow-2xl overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between h-14 px-5 border-b border-border bg-card">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Agency</div>
                  <div className="text-sm font-semibold truncate">{detail?.agency.name ?? 'Loading…'}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>

            <div className="p-5 space-y-5">
              {loading || !detail ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <Header agency={detail.agency} />

                  <Section title="Pipeline">
                    <div className="space-y-2">
                      <select
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {DRAWER_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Notes about this agency…"
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={savePipeline} disabled={savingCrm}>
                          {savingCrm ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
                        </Button>
                      </div>
                    </div>
                  </Section>

                  <Section title="Contact">
                    {detail.phones.length === 0 && detail.emails.length === 0 && !detail.agency.website && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          No contact info yet. Pull phone, website &amp; hours from Google Maps.
                        </p>
                        <Button size="sm" variant="outline" onClick={runEnrich} disabled={enriching}>
                          {enriching
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enriching…</>
                            : <><Sparkles className="h-3.5 w-3.5" /> Run enrichment</>}
                        </Button>
                      </div>
                    )}
                    {(detail.phones.length > 0 || detail.emails.length > 0 || detail.agency.website) && (
                      <div className="flex justify-end gap-1.5">
                        {detail.agency.website && (
                          <Button size="sm" variant="ghost" onClick={runScrape} disabled={scraping}
                                  title="Scrape website for emails + socials">
                            {scraping
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scraping…</>
                              : <><Globe className="h-3.5 w-3.5" /> Scrape website</>}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={runEnrich} disabled={enriching}
                                title="Re-pull from Google Maps">
                          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                    {detail.phones.map((p) => (
                      <ContactRow
                        key={p.id}
                        icon={<Phone className="h-3.5 w-3.5" />}
                        label={p.phone_type}
                        value={p.phone}
                        href={`tel:${p.phone}`}
                        copyable
                      />
                    ))}
                    {detail.emails.map((e) => (
                      <ContactRow
                        key={e.id}
                        icon={<Mail className="h-3.5 w-3.5" />}
                        label={e.verified ? 'verified' : e.source}
                        value={e.email}
                        href={`mailto:${e.email}`}
                        copyable
                      />
                    ))}
                    {detail.agency.website && (
                      <ContactRow
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                        label="website"
                        value={shortDomain(detail.agency.website)}
                        href={detail.agency.website}
                      />
                    )}
                  </Section>

                  {detail.socials.length > 0 && (
                    <Section title="Social">
                      <div className="flex flex-wrap gap-2">
                        {detail.socials.map((s) => (
                          <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-muted text-[12px] hover:bg-muted/80 text-foreground">
                            {s.platform === 'linkedin' && <Linkedin className="h-3 w-3" />}
                            {s.platform === 'whatsapp' && <MessageSquare className="h-3 w-3" />}
                            <span className="capitalize">{s.platform}</span>
                          </a>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Location">
                    <p className="text-sm text-muted-foreground">{detail.agency.address || '—'}</p>
                    {detail.agency.latitude != null && detail.agency.longitude != null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${detail.agency.latitude},${detail.agency.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <MapPin className="h-3 w-3" /> Open in Google Maps
                      </a>
                    )}
                  </Section>

                  {detail.reviews.length > 0 && (
                    <Section title={`Recent reviews (${detail.reviews.length})`}>
                      <div className="space-y-2">
                        {detail.reviews.slice(0, 5).map((r) => (
                          <div key={r.id} className="rounded-md border border-border bg-muted/30 p-3">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{r.author_name || 'Anonymous'}</span>
                              <span className="flex items-center gap-0.5">
                                {Array.from({ length: r.rating }).map((_, i) => (
                                  <Star key={i} className="h-3 w-3 fill-warning text-warning" />
                                ))}
                              </span>
                            </div>
                            {r.text && <p className="mt-1 text-[13px] text-foreground/80 line-clamp-3">{r.text}</p>}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Outreach history">
                    {detail.outreach.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No outreach yet.</p>
                    ) : (
                      <ul className="text-sm space-y-1.5">
                        {detail.outreach.map((o) => (
                          <li key={o.id} className="flex items-center justify-between">
                            <span className="capitalize">{o.channel} — {o.subject || o.status}</span>
                            <span className="text-xs text-muted-foreground">{o.sent_at ? new Date(o.sent_at).toLocaleString() : '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Header({ agency }: { agency: AgencyDetail['agency'] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{agency.name}</h2>
        {agency.business_status === 'OPERATIONAL'
          ? <Badge variant="success">Operational</Badge>
          : agency.business_status
            ? <Badge variant="warning">{agency.business_status}</Badge>
            : null}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {agency.rating != null && (
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" /> {agency.rating}
            <span className="text-muted-foreground font-normal"> ({agency.review_count})</span>
          </span>
        )}
        {agency.city && <span>{FLAG[agency.country_code ?? ''] ?? ''} {agency.city}</span>}
        {agency.category && <Badge variant="secondary">{agency.category.replace(/_/g, ' ')}</Badge>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function ContactRow({
  icon, label, value, href, copyable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-7 w-7 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="font-mono text-[13px] hover:underline text-foreground truncate block" target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{value}</a>
        ) : (
          <span className="font-mono text-[13px] truncate block">{value}</span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {copyable && (
        <Button variant="ghost" size="icon" onClick={() => {
          navigator.clipboard?.writeText(value).then(() => toast.success('Copied'));
        }}><ExternalLink className="h-3.5 w-3.5" /></Button>
      )}
    </div>
  );
}

function shortDomain(url: string) {
  try { return new URL(url).host; } catch { return url; }
}
