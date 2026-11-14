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

type CountryMeta = {
  code: string; name: string; flag: string; cities: number;
  districts?: number;                                   // big-city districts searched separately
  terms?: Array<{ keyword: string; language: string }>; // local-language search-term pack
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
            Discover agencies anywhere via Google Maps — by niche + country, tiled across major cities.
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
              Click <strong>Run sweep</strong> above to discover agencies by niche and country.
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
                    <th className="px-4 py-2 font-medium">Scope</th>
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
  const niche = sweep.keywords[0] ?? '—';
  const scope = sweep.cities.length === 1 ? sweep.cities[0] : `${sweep.cities.length} cities`;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3"><StatusBadge status={sweep.status} /></td>
      <td className="px-4 py-3 text-muted-foreground">{fmtRel(sweep.started_at || sweep.created_at)}</td>
      <td className="px-4 py-3 text-muted-foreground max-w-[18rem] truncate" title={`${niche} · ${sweep.cities.join(', ')}`}>
        <span className="text-foreground">{niche}</span> · {scope}
      </td>
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
  const [countries, setCountries] = useState<CountryMeta[]>([]);
  const [niche, setNiche] = useState('recruitment agency');
  const [country, setCountry] = useState('AE');
  const [allCities, setAllCities] = useState(true);
  const [localTerms, setLocalTerms] = useState(true);
  const [districts, setDistricts] = useState(true);
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ countries: CountryMeta[] }>('/sweeps/countries')
      .then((d) => setCountries(d.countries))
      .catch(() => { /* non-fatal — dialog still works with a typed city */ });
  }, []);

  const selected = countries.find((c) => c.code === country);
  const tiling = !city.trim() && allCities;
  const districtCount = tiling && districts ? (selected?.districts ?? 0) : 0;
  const cityCount = city.trim() ? 1 : tiling ? Math.max(1, (selected?.cities ?? 1) + districtCount) : 1;
  const packTerms = localTerms ? (selected?.terms ?? []) : [];
  const termList = [...packTerms.map((t) => t.keyword), ...(packTerms.some((t) => t.keyword.toLowerCase() === niche.trim().toLowerCase()) || !niche.trim() ? [] : [niche.trim()])];
  const termCount = Math.max(1, termList.length);
  const queryEstimate = cityCount * termCount;
  // Google returns up to 3 pages per search; small cities usually need 1. Billed per page
  // (Text Search Enterprise: first 1,000/month free, then ~$35 per 1,000).
  const requestEstimate = Math.round(queryEstimate * 1.4);
  const costEstimate = Math.max(0, Math.round(((requestEstimate - 1000) * 35) / 1000));
  const minutesEstimate = Math.max(1, Math.round((requestEstimate * 0.6) / 60));

  async function start() {
    if (!niche.trim() || !country) return;
    setBusy(true);
    try {
      await api.post('/sweeps', {
        country,
        niche: niche.trim(),
        allCities: tiling,
        localTerms,
        districts,
        ...(city.trim() ? { city: city.trim() } : {}),
      });
      toast.success(`Sweep started: ${niche.trim()} · ${selected?.name || country}`);
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start sweep');
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-9 w-full px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Run a new sweep</DialogTitle>
        <DialogDescription>
          Discover businesses anywhere via Google Maps — pick a niche and country, and we tile across its major cities.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Niche / search term</label>
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="recruitment agency" className={field} />
          <p className="text-[11px] text-muted-foreground">e.g. “recruitment agency”, “manpower agency”, “overseas employment”, “construction company”.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              {countries.length === 0 && <option value={country}>{country}</option>}
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}{c.cities ? ` (${c.cities})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Specific city (optional)</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={tiling ? 'All major cities' : 'e.g. Dubai'} className={field} />
          </div>
        </div>

        {!city.trim() && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allCities} onChange={(e) => setAllCities(e.target.checked)} className="h-4 w-4" />
            Tile across all {selected?.cities ?? 0} major {selected?.name ? `${selected.name} ` : ''}cities
          </label>
        )}
        {tiling && (selected?.districts ?? 0) > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={districts} onChange={(e) => setDistricts(e.target.checked)} className="h-4 w-4" />
            Also search {selected?.districts} districts of the biggest cities (Google shows max 60 per search)
          </label>
        )}
        {(selected?.terms?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={localTerms} onChange={(e) => setLocalTerms(e.target.checked)} className="h-4 w-4" />
              Use local-language search terms (recommended)
            </label>
            {localTerms && (
              <p className="text-[11px] text-muted-foreground pl-6">{termList.join(' · ')}</p>
            )}
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/40 p-3 text-[12px] text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
          <div>
            About <strong className="text-foreground">{queryEstimate.toLocaleString()}</strong> search{queryEstimate === 1 ? '' : 'es'}
            {' '}({cityCount} places × {termCount} term{termCount === 1 ? '' : 's'}, ~{minutesEstimate} min).{' '}
            {costEstimate > 0
              ? <>Roughly <strong className="text-foreground">${costEstimate}</strong> of Google Places usage beyond the 1,000 free monthly searches.</>
              : <>Fits in the 1,000 free monthly Places searches.</>}
            {' '}Non-agencies are filtered out automatically; results appear in the <strong className="text-foreground">Agencies</strong> tab.
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onStarted} disabled={busy}>Cancel</Button>
        <Button onClick={start} disabled={busy || !niche.trim() || !country}>
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
