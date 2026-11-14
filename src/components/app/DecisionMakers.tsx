// Decision-makers panel for the Agency drawer.
//   • Find HR emails  → Hunter domain search (1 credit, only if it finds people)
//   • Find mobiles    → Lusha preview (≈1 credit per person found) → pick people
//                       → reveal phones (≈5 credits each, shown before you click)
// Mobiles found here are NOT used by "Send template": WhatsApp needs the
// person's opt-in, so contact them by email/phone first.

import { useEffect, useState } from 'react';
import { Loader2, Mail, Smartphone, Linkedin, UserSearch, Trash2, ShieldAlert, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

type Contact = {
  id: string;
  source: 'hunter' | 'lusha' | 'manual';
  full_name: string | null;
  position: string | null;
  department: string | null;
  seniority: string | null;
  is_decision_maker: boolean | null;
  email: string | null;
  email_status: string | null;
  email_confidence: number | null;
  phones: Array<{ number: string; type: string; doNotCall?: boolean }>;
  mobile: string | null;
  do_not_call: boolean;
  linkedin_url: string | null;
  is_eu_contact: boolean | null;
};

type Candidate = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  seniority: string | null;
  country: string | null;
  linkedin: string | null;
  phoneCredits: number | null;
  emailCredits: number | null;
};

type Config = {
  tableReady: boolean;
  hunter: { configured: boolean; account: null | { ok: boolean; available?: number | null; used?: number | null; unit?: string; error?: string } };
  lusha: { configured: boolean; usage: null | { ok: boolean; remaining?: number | null; phoneCredits?: number | null; error?: string } };
};

function errMsg(e: unknown) {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) return String((e.body as { detail: unknown }).detail);
  return e instanceof Error ? e.message : String(e);
}

export function DecisionMakers({ agencyId, hasWebsite }: { agencyId: string; hasWebsite: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [huntering, setHuntering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [alsoEmails, setAlsoEmails] = useState(false);

  async function load() {
    try {
      const r = await api.get<{ ready: boolean; contacts: Contact[] }>(`/contacts/agency/${agencyId}`);
      setContacts(r.contacts);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    setCandidates(null); setPicked(new Set());
    load();
    api.get<Config>('/contacts/config').then(setConfig).catch(() => setConfig(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  async function runHunter(force = false) {
    setHuntering(true);
    try {
      const r = await api.post<{ result: { status: string; found: number; domain: string | null } }>(`/contacts/hunter/agency/${agencyId}`, { force });
      const s = r.result;
      if (s.status === 'found') toast.success(`Hunter found ${s.found} ${s.found === 1 ? 'person' : 'people'} at ${s.domain}`);
      else if (s.status === 'none') toast.warning(`Hunter has no HR / owner contacts for ${s.domain}`);
      else if (s.status === 'no_domain') toast.warning('No company website on file — Hunter searches by domain.');
      else if (s.status === 'skipped_recent') toast.info('Already checked in the last 90 days — use "Search again" to spend another credit.');
      else toast.error('Hunter search failed');
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setHuntering(false);
    }
  }

  async function runLushaPreview(allRoles = false) {
    setPreviewing(true);
    try {
      const r = await api.post<{ candidates: Candidate[]; creditsCharged: number | null; domain: string }>('/contacts/lusha/preview', { agencyId, allRoles, max: 3 });
      setCandidates(r.candidates);
      setPicked(new Set(r.candidates.filter((c) => c.phoneCredits != null).map((c) => c.id)));
      if (r.candidates.length === 0) toast.warning(`Lusha has no ${allRoles ? '' : 'decision-maker '}contacts at ${r.domain}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function runLushaReveal() {
    const ids = [...picked];
    if (!ids.length) return;
    setRevealing(true);
    try {
      const r = await api.post<{ result: { saved: number; mobiles: number; creditsCharged: number | null } }>('/contacts/lusha/reveal', {
        agencyId, ids, reveal: alsoEmails ? ['phones', 'emails'] : ['phones'],
      });
      toast.success(`Saved ${r.result.saved} · ${r.result.mobiles} mobile${r.result.mobiles === 1 ? '' : 's'}${r.result.creditsCharged != null ? ` · ${r.result.creditsCharged} credits` : ''}`);
      setCandidates(null);
      setPicked(new Set());
      await load();
      api.get<Config>('/contacts/config').then(setConfig).catch(() => {});
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRevealing(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this person? Their details are deleted and they will not be re-added by future searches.')) return;
    try {
      await api.delete(`/contacts/${id}`);
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  }

  const estCost = (candidates ?? [])
    .filter((c) => picked.has(c.id))
    .reduce((s, c) => s + (c.phoneCredits ?? 0) + (alsoEmails ? (c.emailCredits ?? 0) : 0), 0);

  if (config && !config.tableReady) {
    return <p className="text-[12px] text-warning">Database update pending — run migration <code>20261114000001_decision_maker_contacts.sql</code> in Supabase.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => runHunter(false)}
          disabled={huntering || !hasWebsite || !config?.hunter.configured}
          title={!config?.hunter.configured ? 'Add your Hunter API key in Settings' : !hasWebsite ? 'Needs a company website' : 'Hunter domain search — HR, owners, management (1 credit if found)'}>
          {huntering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Find HR emails
        </Button>
        <Button size="sm" variant="outline" onClick={() => runLushaPreview(false)}
          disabled={previewing || !hasWebsite || !config?.lusha.configured}
          title={!config?.lusha.configured ? 'Add your Lusha API key in Settings' : !hasWebsite ? 'Needs a company website' : 'Lusha — list decision-makers (≈1 credit per person found)'}>
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />} Find mobiles
        </Button>
        {contacts.some((c) => c.source === 'hunter') && (
          <Button size="sm" variant="ghost" onClick={() => runHunter(true)} disabled={huntering} title="Spend another Hunter credit on this domain">
            Search again
          </Button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {config?.hunter.account?.ok && config.hunter.account.available != null && <>Hunter {Math.max(0, (config.hunter.account.available ?? 0) - (config.hunter.account.used ?? 0))} left</>}
          {config?.hunter.account?.ok && config?.lusha.usage?.ok && ' · '}
          {config?.lusha.usage?.ok && config.lusha.usage.remaining != null && <>Lusha {config.lusha.usage.remaining} left</>}
        </span>
      </div>

      {candidates && (
        <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
          <div className="text-[12px] font-medium">Lusha found {candidates.length} — pick who to reveal</div>
          {candidates.length === 0 && (
            <Button size="sm" variant="ghost" onClick={() => runLushaPreview(true)} disabled={previewing}>
              <UserSearch className="h-3.5 w-3.5" /> Try all roles
            </Button>
          )}
          {candidates.map((c) => (
            <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1" disabled={c.phoneCredits == null}
                checked={picked.has(c.id)}
                onChange={(e) => setPicked((p) => { const n = new Set(p); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed'}</span>
                <span className="text-muted-foreground"> · {c.title || '—'}{c.country ? ` · ${c.country}` : ''}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {c.phoneCredits == null ? 'no phone on file' : `phone: ${c.phoneCredits} credit${c.phoneCredits === 1 ? '' : 's'}${c.phoneCredits === 0 ? ' (already revealed)' : ''}`}
                </span>
              </span>
            </label>
          ))}
          {candidates.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={alsoEmails} onChange={(e) => setAlsoEmails(e.target.checked)} /> also reveal emails
              </label>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setCandidates(null)}>Cancel</Button>
                <Button size="sm" onClick={runLushaReveal} disabled={revealing || picked.size === 0}>
                  {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Reveal {picked.size} · ~{estCost} credits
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {contacts.length === 0 && !candidates && (
        <p className="text-sm text-muted-foreground">No named people yet.</p>
      )}

      {contacts.map((c) => (
        <div key={c.id} className="rounded-md border border-border p-2.5 text-sm space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{c.full_name || 'Unnamed'}</div>
              <div className="text-[12px] text-muted-foreground truncate">{c.position || c.department || '—'}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {c.is_decision_maker && <Badge variant="success">Decision-maker</Badge>}
              {c.is_eu_contact && <Badge variant="warning" title="EU resident — GDPR notice + opt-out required">EU</Badge>}
              <Badge variant="secondary">{c.source}</Badge>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)} title="Remove person"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {c.email && (
            <Line icon={<Mail className="h-3 w-3" />} value={c.email} href={`mailto:${c.email}`}
              note={c.email_status ? `${c.email_status}${c.email_confidence != null ? ` · ${c.email_confidence}%` : ''}` : undefined} />
          )}
          {c.phones.map((p) => (
            <Line key={p.number} icon={<Smartphone className="h-3 w-3" />} value={p.number} href={`tel:${p.number}`}
              note={`${p.type}${p.doNotCall ? ' · DO NOT CALL' : ''}`} warn={!!p.doNotCall} />
          ))}
          {c.linkedin_url && (
            <a href={c.linkedin_url.startsWith('http') ? c.linkedin_url : `https://${c.linkedin_url}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><Linkedin className="h-3 w-3" /> LinkedIn</a>
          )}
        </div>
      ))}

      {contacts.some((c) => c.mobile) && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
          Mobiles here are not used by "Send template". Contact the person by email or phone first and ask them to message you on WhatsApp (opt-in).
        </p>
      )}
    </div>
  );
}

function Line({ icon, value, href, note, warn }: { icon: React.ReactNode; value: string; href: string; note?: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <a href={href} className="font-mono text-[12.5px] hover:underline truncate">{value}</a>
      {note && <span className={`text-[10px] uppercase tracking-wider ${warn ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{note}</span>}
      <button className="ml-auto text-muted-foreground hover:text-foreground" title="Copy"
        onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Copied'))}>
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}
