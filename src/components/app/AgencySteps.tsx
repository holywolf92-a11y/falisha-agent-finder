// Building blocks for the simplified Agencies page:
//   StepCards    — the four working steps (Check → Contact → Follow up → Partners)
//   BestContact  — the single best way to reach an agency
//   NextStep     — the one action that moves an agency forward, right in the row
//   CheckQueue   — "Is this a recruitment agency?" one at a time, Y / N / S keys
//   MoreMenu     — the manual tools, out of the way
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, X, SkipForward, MessageSquare, Mail, Phone, Globe, Loader2, MoreHorizontal,
  ListChecks, Send, Handshake, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { bestPhone, whatsAppHref, telHref, fmtPhone, type AgencyPhone } from '@/lib/phone';
import { toast } from 'sonner';

export type Step = 'check' | 'contact' | 'followup' | 'partners' | 'all';
export type StepSummary = { check: number; contact: number; followup: number; partners: number; hidden: number; all: number };

export type StepAgency = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  country_code: string | null;
  category: string | null;
  website: string | null;
  rating: number | null;
  review_count: number;
  wa_phone: string | null;
  outreach_stage: string | null;
  relevance?: 'recruitment' | 'review' | 'not_recruitment' | null;
  relevance_reason?: string | null;
  licence_no?: string | null;
  licence_authority?: string | null;
  contacts_count?: number;
  agency_phones?: AgencyPhone[];
  agency_emails?: { email: string }[];
};

export const STEPS: Array<{ key: Exclude<Step, 'all'>; n: string; title: string; hint: string; icon: typeof ListChecks }> = [
  { key: 'check',    n: '1', title: 'Check',     hint: 'Is it really an agency?',   icon: ListChecks },
  { key: 'contact',  n: '2', title: 'Contact',   hint: 'Confirmed, not contacted',  icon: Send },
  { key: 'followup', n: '3', title: 'Follow up', hint: 'Contacted or replied',      icon: MessageSquare },
  { key: 'partners', n: '4', title: 'Partners',  hint: 'Interested or signed',      icon: Handshake },
];

export function StepCards({ summary, step, onChange }: { summary: StepSummary | null; step: Step; onChange: (s: Step) => void }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {STEPS.map((s) => {
        const active = step === s.key;
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/50'}`}
          >
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {s.n} · {s.title}
            </div>
            <div className="text-2xl font-semibold tabular mt-0.5">{summary ? summary[s.key].toLocaleString() : '…'}</div>
            <div className="text-[11.5px] text-muted-foreground">{s.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

/** The single best way to reach an agency: WhatsApp → phone → email → website. */
export function BestContact({ a }: { a: StepAgency }) {
  const phone = bestPhone(a.agency_phones);
  const email = a.agency_emails?.[0]?.email;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (a.wa_phone) {
    return (
      <a href={whatsAppHref(a.wa_phone) ?? undefined} target="_blank" rel="noopener noreferrer" onClick={stop}
         className="inline-flex items-center gap-1.5 text-success hover:underline" title="Open a WhatsApp chat">
        <MessageSquare className="h-3.5 w-3.5" /> <span className="font-mono text-[12px]">{fmtPhone(a.wa_phone)}</span>
      </a>
    );
  }
  if (phone) {
    return (
      <a href={telHref(phone.phone) ?? undefined} onClick={stop} className="inline-flex items-center gap-1.5 hover:underline" title="Call">
        <Phone className="h-3.5 w-3.5 text-muted-foreground" /> <span className="font-mono text-[12px]">{fmtPhone(phone.phone)}</span>
      </a>
    );
  }
  if (email) {
    return (
      <a href={`mailto:${email}`} onClick={stop} className="inline-flex items-center gap-1.5 hover:underline truncate max-w-full" title={email}>
        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{email}</span>
      </a>
    );
  }
  if (a.website) {
    return (
      <a href={a.website} target="_blank" rel="noopener noreferrer" onClick={stop} className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline">
        <Globe className="h-3.5 w-3.5" /> website
      </a>
    );
  }
  return <span className="text-muted-foreground text-[12px]">No contact yet</span>;
}

async function patchAgency(id: string, body: Record<string, unknown>) {
  await api.patch(`/agencies/${id}`, body);
}

/** The one action that moves this agency to the next step. */
export function NextStep({ a, onChanged }: { a: StepAgency; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (e: React.MouseEvent, body: Record<string, unknown>, msg: string) => {
    e.stopPropagation();
    setBusy(true);
    try { await patchAgency(a.id, body); toast.success(msg); onChanged(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Save failed'); }
    finally { setBusy(false); }
  };
  const small = 'h-7 px-2.5 text-[12px]';

  if (a.relevance === 'review') {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className={small} disabled={busy}
          onClick={(e) => act(e, { relevance: 'recruitment' }, 'Confirmed as an agency')}><Check className="h-3.5 w-3.5" /> Agency</Button>
        <Button size="sm" variant="ghost" className={small} disabled={busy}
          onClick={(e) => act(e, { relevance: 'not_recruitment' }, 'Hidden — not an agency')}><X className="h-3.5 w-3.5" /> Not one</Button>
      </div>
    );
  }
  const stage = a.outreach_stage || 'new';
  if (a.relevance === 'not_recruitment') return <span className="text-[12px] text-muted-foreground">Hidden — not an agency</span>;
  if (stage === 'new') {
    return (
      <Button size="sm" variant="outline" className={small} disabled={busy}
        onClick={(e) => act(e, { outreach_stage: 'contacted' }, 'Moved to Follow up')}>Mark as contacted</Button>
    );
  }
  if (stage === 'contacted') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-muted-foreground">Waiting for reply</span>
        <Button size="sm" variant="outline" className={small} disabled={busy}
          onClick={(e) => act(e, { outreach_stage: 'replied' }, 'Marked as replied')}>They replied</Button>
      </div>
    );
  }
  if (stage === 'replied') {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className={small} disabled={busy}
          onClick={(e) => act(e, { outreach_stage: 'interested' }, 'Moved to Partners')}>Interested</Button>
        <Button size="sm" variant="ghost" className={small} disabled={busy}
          onClick={(e) => act(e, { outreach_stage: 'not_interested' }, 'Marked not interested')}>Not interested</Button>
      </div>
    );
  }
  if (stage === 'interested') {
    return (
      <Button size="sm" variant="outline" className={small} disabled={busy}
        onClick={(e) => act(e, { outreach_stage: 'converted' }, 'Signed as a partner')}><Handshake className="h-3.5 w-3.5" /> Signed</Button>
    );
  }
  if (stage === 'converted') return <span className="text-[12px] font-medium text-success">Partner</span>;
  return <span className="text-[12px] text-muted-foreground capitalize">{stage.replace(/_/g, ' ')}</span>;
}

/** Turn the classifier's terse reason into a plain sentence. */
export function explainReason(reason: string | null | undefined): string {
  if (!reason) return 'Not checked yet.';
  const parts = reason.split(/ · | → /).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p === 'no signal') out.push('Nothing in the name or Google category says recruitment.');
    else if (p.startsWith('name says:')) out.push(`The name suggests another kind of business (${p.slice(10).trim()}).`);
    else if (p.startsWith('name:')) out.push(`The name mentions ${p.slice(5).trim()}.`);
    else if (p.startsWith('google:')) out.push(`Google lists it as “${p.slice(7).trim().replace(/_/g, ' ')}”.`);
    else if (p.startsWith('domain:')) out.push(`Its website address looks recruitment-related (${p.slice(7).trim()}).`);
    else if (p.startsWith('homepage:')) out.push('We read its homepage but it was not conclusive.');
    else if (p.includes('homepage unreadable')) out.push("Its website couldn't be read.");
    else if (p === 'no website found') out.push('No website found.');
  }
  return out.join(' ') || reason;
}

/** One agency at a time: is it a recruitment agency? Y = yes, N = no, S = skip. */
export function CheckQueue({ open, onOpenChange, country, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; country: string; onChanged: () => void;
}) {
  const [items, setItems] = useState<StepAgency[]>([]);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState({ yes: 0, no: 0, skip: 0 });
  const [loading, setLoading] = useState(false);
  const pageRef = useRef(0);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ step: 'check', sort: 'score', pageSize: '50', page: String(page), ...(country ? { country } : {}) });
      const r = await api.get<{ agencies: StepAgency[]; total: number }>(`/agencies?${p.toString()}`);
      setTotal(r.total);
      return r.agencies;
    } finally { setLoading(false); }
  }, [country]);

  useEffect(() => {
    if (!open) return;
    pageRef.current = 0; setIdx(0); setDone({ yes: 0, no: 0, skip: 0 });
    load(0).then(setItems).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'));
  }, [open, load]);

  const current = items[idx];

  const advance = useCallback(async () => {
    const next = idx + 1;
    if (next >= items.length - 5 && items.length > 0) {
      // Decided rows leave the "check" list, so re-reading page 0 serves fresh ones;
      // skipped rows stay, so page past them.
      const more = await load(pageRef.current).catch(() => [] as StepAgency[]);
      const seen = new Set(items.map((x) => x.id));
      const fresh = more.filter((x) => !seen.has(x.id));
      if (fresh.length === 0 && more.length > 0) pageRef.current += 1;
      setItems((prev) => [...prev, ...fresh]);
    }
    setIdx(next);
  }, [idx, items, load]);

  const decide = useCallback(async (verdict: 'recruitment' | 'not_recruitment' | 'skip') => {
    if (!current) return;
    if (verdict === 'skip') { setDone((d) => ({ ...d, skip: d.skip + 1 })); void advance(); return; }
    try {
      await patchAgency(current.id, { relevance: verdict });
      setDone((d) => verdict === 'recruitment' ? { ...d, yes: d.yes + 1 } : { ...d, no: d.no + 1 });
      onChanged();
      void advance();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
  }, [current, advance, onChanged]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'y') { e.preventDefault(); void decide('recruitment'); }
      else if (k === 'n') { e.preventDefault(); void decide('not_recruitment'); }
      else if (k === 's' || k === 'arrowright') { e.preventDefault(); void decide('skip'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, decide]);

  const phone = current ? bestPhone(current.agency_phones) : null;
  const googleSearch = current ? `https://www.google.com/search?q=${encodeURIComponent(`${current.name} ${current.city ?? ''}`)}` : '#';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Is this a recruitment agency?</DialogTitle>
          <DialogDescription>
            Confirm real agencies so they move to Contact; hide everything else. Keys: <strong>Y</strong> yes · <strong>N</strong> no · <strong>S</strong> skip.
          </DialogDescription>
        </DialogHeader>

        {loading && !current ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /> Loading…</div>
        ) : !current ? (
          <div className="py-10 text-center space-y-1">
            <div className="text-base font-medium">All checked</div>
            <p className="text-sm text-muted-foreground">Nothing left to check{country ? ' in this country' : ''}. Confirmed agencies are in Contact.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[12px] text-muted-foreground tabular">
              {idx + 1} of {Math.max(total + done.yes + done.no, items.length).toLocaleString()} · confirmed {done.yes} · hidden {done.no} · skipped {done.skip}
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="text-lg font-semibold leading-snug">{current.name}</div>
              <div className="text-sm text-muted-foreground">
                {[current.city, current.country_code?.toUpperCase()].filter(Boolean).join(', ')}
                {current.category ? ` · Google: ${current.category.replace(/_/g, ' ')}` : ''}
                {current.rating != null ? ` · ★ ${current.rating} (${current.review_count})` : ''}
              </div>
              {current.address && <div className="text-[12.5px] text-muted-foreground">{current.address}</div>}
              <div className="rounded-md bg-muted/50 px-3 py-2 text-[12.5px]">
                <span className="font-medium">Why we're not sure: </span>{explainReason(current.relevance_reason)}
              </div>
              <div className="flex flex-wrap gap-3 text-[12.5px] pt-1">
                {current.website && <a href={current.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Globe className="h-3.5 w-3.5" /> Open website</a>}
                <a href={googleSearch} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Search className="h-3.5 w-3.5" /> Search Google</a>
                {phone && <span className="inline-flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {fmtPhone(phone.phone)}</span>}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
          {current && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => void decide('skip')}><SkipForward className="h-4 w-4" /> Skip</Button>
              <Button variant="outline" onClick={() => void decide('not_recruitment')}><X className="h-4 w-4" /> Not an agency</Button>
              <Button onClick={() => void decide('recruitment')}><Check className="h-4 w-4" /> Yes, agency</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type MenuItem = { label: string; hint?: string; icon?: typeof Globe; onClick: () => void; disabled?: boolean } | 'divider';

/** A small dropdown for secondary tools. */
export function MoreMenu({ items, label = 'More', icon: Icon = MoreHorizontal, primary = false }: {
  items: MenuItem[]; label?: string; icon?: typeof Globe; primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button variant={primary ? 'default' : 'outline'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-border bg-card p-1 shadow-lg">
          {items.map((it, i) => it === 'divider'
            ? <div key={`d${i}`} className="my-1 h-px bg-border" />
            : (
              <button key={it.label} disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full text-left rounded-md px-2.5 py-2 hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent flex gap-2.5">
                {it.icon && <it.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                <span>
                  <span className="block text-sm">{it.label}</span>
                  {it.hint && <span className="block text-[11.5px] text-muted-foreground">{it.hint}</span>}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

