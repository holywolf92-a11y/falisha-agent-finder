import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Radar, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type Sweep = {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
  cities: string[];
  keywords: string[];
  languages: string[];
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  total_queries: number;
  total_results: number;
  new_agencies: number;
  api_cost_cents: number;
  error_message: string | null;
  created_at: string;
};

// Keep in sync with src/server/services/sweepService.ts SEED_CITIES — both
// lists drive what the user can actually sweep. Frontend duplicate exists so
// the picker renders without a network round-trip; the backend remains the
// source of truth and silently ignores any city name it doesn't know.
const ALL_GULF_CITIES = [
  // UAE 🇦🇪
  { city: 'Dubai',          country: 'AE' },
  { city: 'Abu Dhabi',      country: 'AE' },
  { city: 'Sharjah',        country: 'AE' },
  { city: 'Ajman',          country: 'AE' },
  { city: 'Ras Al Khaimah', country: 'AE' },
  { city: 'Fujairah',       country: 'AE' },
  { city: 'Umm Al Quwain',  country: 'AE' },
  { city: 'Al Ain',         country: 'AE' },
  // Saudi Arabia 🇸🇦
  { city: 'Riyadh',         country: 'SA' },
  { city: 'Jeddah',         country: 'SA' },
  { city: 'Dammam',         country: 'SA' },
  { city: 'Mecca',          country: 'SA' },
  { city: 'Medina',         country: 'SA' },
  { city: 'Khobar',         country: 'SA' },
  { city: 'Tabuk',          country: 'SA' },
  { city: 'Abha',           country: 'SA' },
  { city: 'Buraidah',       country: 'SA' },
  { city: 'Jubail',         country: 'SA' },
  // Qatar / Kuwait / Bahrain — city-states, single seed
  { city: 'Doha',           country: 'QA' },
  { city: 'Kuwait City',    country: 'KW' },
  { city: 'Manama',         country: 'BH' },
  // Oman 🇴🇲
  { city: 'Muscat',         country: 'OM' },
  { city: 'Salalah',        country: 'OM' },
  { city: 'Sohar',          country: 'OM' },
  { city: 'Nizwa',          country: 'OM' },
  // Turkey 🇹🇷
  { city: 'Istanbul',       country: 'TR' },
  { city: 'Ankara',         country: 'TR' },
  { city: 'Izmir',          country: 'TR' },
  { city: 'Bursa',          country: 'TR' },
  // Serbia 🇷🇸
  { city: 'Belgrade',       country: 'RS' },
  { city: 'Novi Sad',       country: 'RS' },
  { city: 'Nis',            country: 'RS' },
  // Maldives 🇲🇻
  { city: 'Male',           country: 'MV' },
  { city: 'Hulhumale',      country: 'MV' },
  { city: 'Addu City',      country: 'MV' },
] as const;

const FLAG: Record<string, string> = {
  AE: '🇦🇪', SA: '🇸🇦', QA: '🇶🇦', KW: '🇰🇼', BH: '🇧🇭', OM: '🇴🇲',
  TR: '🇹🇷', RS: '🇷🇸', MV: '🇲🇻',
};

export function SweepsPage() {
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);

  async function reload() {
    try {
      setLoading(true);
      const data = await api.get<{ sweeps: Sweep[] }>('/sweeps');
      setSweeps(data.sweeps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load sweeps');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  // Auto-poll while any sweep is still running
  useEffect(() => {
    if (!sweeps.some((s) => s.status === 'running' || s.status === 'pending')) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [sweeps]);

  // Deep-link from command palette: /sweeps?new=1 opens the dialog
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') setOpenNew(true);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sweeps</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discovery runs across Gulf cities × recruitment-agency keywords.
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Run sweep
            </Button>
          </DialogTrigger>
          <NewSweepDialog onStarted={() => { setOpenNew(false); void reload(); }} />
        </Dialog>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : sweeps.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Radar className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-medium">No sweeps yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click <strong>Run sweep</strong> above to discover Gulf recruitment agencies.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Started</th>
                    <th className="px-4 py-2 font-medium">Cities</th>
                    <th className="px-4 py-2 font-medium">Queries</th>
                    <th className="px-4 py-2 font-medium tabular">Results</th>
                    <th className="px-4 py-2 font-medium tabular">New agencies</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {sweeps.map((s) => <SweepRow key={s.id} sweep={s} />)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SweepRow({ sweep }: { sweep: Sweep }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3"><StatusBadge status={sweep.status} /></td>
      <td className="px-4 py-3 text-muted-foreground">{fmtRel(sweep.started_at || sweep.created_at)}</td>
      <td className="px-4 py-3 text-muted-foreground">{sweep.cities.length} cities</td>
      <td className="px-4 py-3 tabular">{sweep.total_queries}</td>
      <td className="px-4 py-3 tabular font-medium">{sweep.total_results}</td>
      <td className="px-4 py-3 tabular font-medium text-primary">+{sweep.new_agencies}</td>
      <td className="px-4 py-3 text-muted-foreground">{fmtDuration(sweep.duration_ms)}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: Sweep['status'] }) {
  switch (status) {
    case 'running': return <Badge variant="default" pulse>Running</Badge>;
    case 'pending': return <Badge variant="secondary" pulse>Queued</Badge>;
    case 'complete':return <Badge variant="success">Complete</Badge>;
    case 'failed':  return <Badge variant="destructive">Failed</Badge>;
    case 'cancelled':return <Badge variant="outline">Cancelled</Badge>;
  }
}

function NewSweepDialog({ onStarted }: { onStarted: () => void }) {
  const [selected, setSelected] = useState<string[]>(ALL_GULF_CITIES.map((c) => c.city));
  const [busy, setBusy] = useState(false);

  function toggle(city: string) {
    setSelected((s) => s.includes(city) ? s.filter((c) => c !== city) : [...s, city]);
  }
  function selectAll()  { setSelected(ALL_GULF_CITIES.map((c) => c.city)); }
  function selectNone() { setSelected([]); }

  // Rough plan size estimate. 7 English + 4 Arabic = 11 keywords per city.
  const queryEstimate = selected.length * 11;
  const minutesEstimate = Math.max(1, Math.round(queryEstimate / 30));

  async function start() {
    if (!selected.length) return;
    setBusy(true);
    try {
      await api.post<{ sweepId: string }>('/sweeps', { cities: selected });
      toast.success(`Sweep started across ${selected.length} cities`);
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start sweep');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Run a new sweep</DialogTitle>
        <DialogDescription>
          Discovers Gulf recruitment agencies across the selected cities using Google Maps Places API (New).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Cities</span>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAll}  className="text-primary hover:underline">All</button>
            <span className="text-muted-foreground">·</span>
            <button type="button" onClick={selectNone} className="text-muted-foreground hover:text-foreground">None</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_GULF_CITIES.map((c) => {
            const on = selected.includes(c.city);
            return (
              <button
                key={c.city}
                type="button"
                onClick={() => toggle(c.city)}
                className={
                  'h-9 px-3 rounded-md border text-[13px] flex items-center gap-2 transition-colors ' +
                  (on
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted')
                }
              >
                <span>{FLAG[c.country]}</span>
                <span className="flex-1 text-left">{c.city}</span>
                {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-[12px] text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
          <div>
            About <strong className="text-foreground">{queryEstimate}</strong> Google Maps queries
            (~{minutesEstimate} min). Stays inside the free monthly Places tier.
            Results will appear in the <strong className="text-foreground">Agencies</strong> tab as they're discovered.
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onStarted} disabled={busy}>Cancel</Button>
        <Button onClick={start} disabled={busy || selected.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start sweep'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function fmtRel(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso); const now = Date.now();
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s/60)}m ago`;
  if (s < 86400) return `${Math.round(s/3600)}h ago`;
  return d.toLocaleDateString();
}
function fmtDuration(ms: number | null) {
  if (!ms || ms <= 0) return '—';
  if (ms < 60000) return `${Math.round(ms/1000)}s`;
  return `${Math.round(ms/60000)}m`;
}
