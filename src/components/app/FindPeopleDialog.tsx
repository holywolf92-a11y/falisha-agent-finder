// Bulk "Find decision-makers" over the filtered Agencies set (Hunter only —
// Lusha is per-agency on purpose because every phone reveal costs credits).

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

type Preview = {
  matchedWithWebsite: number;
  usableDomain: number;
  alreadyChecked: number;
  willSearch: number;
  maxCredits: number;
  recheckDays: number;
};

export type HunterRunState = {
  active: boolean;
  total: number;
  done: number;
  found: number;
  people: number;
  none: number;
  noDomain: number;
  errors: number;
  creditsUsed: number;
  stoppedReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

function errMsg(e: unknown) {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) return String((e.body as { detail: unknown }).detail);
  return e instanceof Error ? e.message : String(e);
}

export function FindPeopleDialog({
  open, onOpenChange, filter, onFinished,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filter: Record<string, unknown>;
  onFinished: () => void;
}) {
  const [limit, setLimit] = useState(100);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [state, setState] = useState<HunterRunState | null>(null);
  const [starting, setStarting] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    api.get<{ hunter: { configured: boolean; account: { ok: boolean; available?: number | null; used?: number | null } | null } }>('/contacts/config')
      .then((c) => {
        setConfigured(c.hunter.configured);
        const a = c.hunter.account;
        setCredits(a?.ok && a.available != null ? Math.max(0, (a.available ?? 0) - (a.used ?? 0)) : null);
      })
      .catch(() => setConfigured(null));
    api.get<{ state: HunterRunState }>('/contacts/hunter/status').then((r) => { if (r.state.active) { setState(r.state); startPolling(); } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.post<{ preview: Preview }>('/contacts/hunter/preview', { filter, limit })
        .then((r) => setPreview(r.preview))
        .catch((e) => toast.error(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, limit, JSON.stringify(filter)]);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  function startPolling() {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const r = await api.get<{ state: HunterRunState }>('/contacts/hunter/status');
        setState(r.state);
        if (!r.state.active) {
          if (poll.current) clearInterval(poll.current);
          poll.current = null;
          const s = r.state;
          if (s.stoppedReason) toast.warning(`Stopped: ${s.stoppedReason} (${s.done}/${s.total} done)`);
          else toast.success(`Hunter done · ${s.people} people at ${s.found} agencies · ${s.none} had none`);
          onFinished();
        }
      } catch { /* keep polling */ }
    }, 2000);
  }

  async function start() {
    setStarting(true);
    try {
      const r = await api.post<{ state: HunterRunState }>('/contacts/hunter/run', { filter, limit });
      setState(r.state);
      startPolling();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setStarting(false);
    }
  }

  const running = !!state?.active;
  const overBudget = credits != null && preview != null && preview.willSearch > credits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find decision-makers (Hunter)</DialogTitle>
          <DialogDescription>
            Searches each agency's website domain for named HR, owner and management contacts with verified emails.
            Uses your current filters. Mobile numbers are found per agency with Lusha, from the agency drawer.
          </DialogDescription>
        </DialogHeader>

        {configured === false ? (
          <p className="text-sm text-warning">Add your Hunter API key in <strong>Settings → Decision-makers</strong> first.</p>
        ) : running || (state && state.finishedAt) ? (
          <div className="space-y-2 text-sm">
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${state && state.total ? Math.round((state.done / state.total) * 100) : 0}%` }} />
            </div>
            <Row label="Progress" value={`${state?.done ?? 0} / ${state?.total ?? 0}`} />
            <Row label="People found" value={`${state?.people ?? 0} at ${state?.found ?? 0} agencies`} highlight />
            <Row label="No contacts at domain" value={String(state?.none ?? 0)} />
            <Row label="Errors" value={String(state?.errors ?? 0)} />
            {state?.stoppedReason && <p className="text-[12px] text-warning">Stopped: {state.stoppedReason}</p>}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <Row label="Filtered agencies with a website" value={preview ? preview.matchedWithWebsite.toLocaleString() : '…'} />
            <Row label={`Already checked (last ${preview?.recheckDays ?? 90} days) — skipped`} value={preview ? preview.alreadyChecked.toLocaleString() : '…'} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Search up to</span>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                className="h-8 px-2 rounded-md border border-input bg-background text-sm">
                {[25, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} agencies</option>)}
              </select>
            </div>
            <Row label="Will search now" value={preview ? preview.willSearch.toLocaleString() : '…'} highlight />
            <Row label="Max Hunter credits" value={preview ? `${preview.maxCredits.toLocaleString()} (only charged when someone is found)` : '…'} />
            {credits != null && <Row label="Hunter credits left" value={credits.toLocaleString()} />}
            {overBudget && <p className="text-[12px] text-warning">More searches than credits left — the run stops when credits run out.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{running ? 'Close (keeps running)' : 'Close'}</Button>
          {!running && !(state && state.finishedAt) && (
            <Button onClick={start} disabled={starting || !preview || preview.willSearch === 0 || configured === false}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Search {preview?.willSearch ?? 0} agencies
            </Button>
          )}
          {state && state.finishedAt && !running && (
            <Button onClick={() => setState(null)}>Run another batch</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-primary tabular' : 'tabular'}>{value}</span>
    </div>
  );
}
