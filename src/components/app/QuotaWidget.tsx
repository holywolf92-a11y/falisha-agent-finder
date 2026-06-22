import { useEffect, useState } from 'react';
import { Sparkles, Search as SearchIcon, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Quota = {
  method: 'text_search' | 'place_details';
  period: string;
  used: number;
  cap: number;                  // hard ceiling (circuit breaker only)
  freeTier: number;             // Google's published monthly free
  safetyBuffer: number;
  freeTierThreshold: number;    // line above which we're paying per call
  pastFreeTier: boolean;
  resetsAt: string;
  percentage: number;
};

const LABEL: Record<Quota['method'], { name: string; icon: React.ReactNode; sub: string }> = {
  text_search:   { name: 'Sweeps',      icon: <SearchIcon className="h-3.5 w-3.5" />,  sub: 'Text Search' },
  place_details: { name: 'Enrichments', icon: <Sparkles className="h-3.5 w-3.5" />,    sub: 'Place Details' },
};

let cached: Quota[] | null = null;
let cachedAt = 0;
const subscribers = new Set<(q: Quota[]) => void>();

/** Trigger a fresh fetch — used after every batch enrich completes. */
export function refreshQuota() {
  cachedAt = 0;
  void load();
}

async function load(): Promise<Quota[]> {
  try {
    const data = await api.get<{ quotas: Quota[] }>('/quota');
    cached = data.quotas;
    cachedAt = Date.now();
    subscribers.forEach((fn) => fn(cached!));
    return cached;
  } catch {
    return cached ?? [];
  }
}

export function useQuota() {
  const [quotas, setQuotas] = useState<Quota[]>(cached ?? []);
  useEffect(() => {
    subscribers.add(setQuotas);
    if (!cached || Date.now() - cachedAt > 30_000) void load();
    return () => { subscribers.delete(setQuotas); };
  }, []);
  return quotas;
}

export function QuotaWidget({ compact = false }: { compact?: boolean }) {
  const quotas = useQuota();

  if (!quotas.length) return null;

  const anyPastFreeTier = quotas.some((q) => q.pastFreeTier);

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Google Maps usage</h3>
        <button
          onClick={refreshQuota}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
        {quotas.map((q) => <QuotaBar key={q.method} q={q} />)}
      </div>
      <div className="mt-2.5 pt-2 border-t border-border text-[10.5px] text-muted-foreground flex items-center justify-between">
        <span>
          {anyPastFreeTier
            ? <span className="text-warning">⚠ Past Google's free tier — billing applies per call</span>
            : <span>Within Google's free tier</span>}
        </span>
        <span>Resets {fmtReset(quotas[0]?.resetsAt)}</span>
      </div>
    </div>
  );
}

function QuotaBar({ q }: { q: Quota }) {
  const meta = LABEL[q.method];
  // In paid-tier mode, the bar % is measured against Google's free-tier line,
  // not the circuit-breaker cap (which is in the millions). Once we cross
  // the free tier the bar turns amber and shows "past free" instead.
  const tier = q.freeTierThreshold > 0 ? q.freeTierThreshold : q.cap;
  const pct = tier > 0 ? Math.min(100, Math.round((q.used / tier) * 100)) : 0;
  const colorClass =
    q.pastFreeTier ? 'bg-warning' :
    pct >= 95      ? 'bg-destructive' :
    pct >= 70      ? 'bg-warning' :
                     'bg-primary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="text-muted-foreground">{meta.icon}</span>
          <span className="font-medium">{meta.name}</span>
          <span className="text-muted-foreground">· {meta.sub}</span>
        </span>
        <span className="tabular">
          <span className={cn('font-medium', q.pastFreeTier && 'text-warning')}>{q.used.toLocaleString()}</span>
          <span className="text-muted-foreground"> / {tier.toLocaleString()}</span>
          {q.pastFreeTier && (
            <span className="text-warning"> · +{(q.used - tier).toLocaleString()} paid</span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmtReset(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}
