import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QuotaWidget } from '@/components/app/QuotaWidget';
import {
  Building2, Send, MapPin, Radar, Sparkles, Globe, Phone as PhoneIcon, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

type Stats = {
  agencies: {
    total: number; enriched: number; notEnriched: number; failed: number;
    withPhones: number; withWebsite: number; enrichedPercent: number;
  };
  coverage: {
    countriesCovered: number; citiesCovered: number;
    byCountry: Array<{ country_code: string; count: number }>;
  };
  sweeps: {
    total: number; thisMonth: number; running: number; lastFinishedAt: string | null;
    recent: Array<{ id: string; status: string; cities: string[]; total_results: number; new_agencies: number; created_at: string }>;
  };
  outreach: { total: number; thisWeek: number; byChannel: Array<{ channel: string; count: number }> };
};

const COUNTRY_LABEL: Record<string, string> = {
  ae: '🇦🇪 UAE', sa: '🇸🇦 Saudi', qa: '🇶🇦 Qatar', kw: '🇰🇼 Kuwait',
  bh: '🇧🇭 Bahrain', om: '🇴🇲 Oman',
};

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Stats>('/dashboard/stats')
      .then((d) => { if (!cancelled) { setStats(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of discovered agencies, sweep activity, enrichment progress, and outreach.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Total agencies"
          value={loading ? '—' : stats?.agencies.total.toLocaleString() ?? '0'}
          icon={Building2}
          sub={stats ? `${stats.agencies.enrichedPercent}% enriched` : ''}
        />
        <Kpi
          label="Countries covered"
          value={loading ? '—' : `${stats?.coverage.countriesCovered ?? 0}`}
          icon={Globe}
          sub={stats ? `${stats.coverage.citiesCovered} cities` : ''}
        />
        <Kpi
          label="Sweeps this month"
          value={loading ? '—' : `${stats?.sweeps.thisMonth ?? 0}`}
          icon={Radar}
          sub={stats?.sweeps.running ? `${stats.sweeps.running} running` : (stats ? `${stats.sweeps.total} all-time` : '')}
          highlight={!!stats?.sweeps.running}
        />
        <Kpi
          label="Outreach sent"
          value={loading ? '—' : `${stats?.outreach.total ?? 0}`}
          icon={Send}
          sub={stats?.outreach.thisWeek ? `${stats.outreach.thisWeek} this week` : (stats ? 'none yet' : '')}
        />
      </div>

      {/* Enrichment progress + Country breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Enrichment progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {stats && (
              <>
                <ProgressRow label="Enriched"        value={stats.agencies.enriched}    total={stats.agencies.total} variant="success" />
                <ProgressRow label="Has phone"       value={stats.agencies.withPhones}  total={stats.agencies.total} variant="primary" />
                <ProgressRow label="Has website"    value={stats.agencies.withWebsite} total={stats.agencies.total} variant="primary" />
                {stats.agencies.failed > 0 && (
                  <ProgressRow label="Failed"        value={stats.agencies.failed}      total={stats.agencies.total} variant="destructive" />
                )}
                <ProgressRow label="Awaiting"        value={stats.agencies.notEnriched} total={stats.agencies.total} variant="muted" />
              </>
            )}
            <Link to="/agencies" className="inline-flex items-center text-[12px] text-primary hover:underline mt-1">
              View agencies <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> By country
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {stats?.coverage.byCountry.length ? (
              stats.coverage.byCountry.slice(0, 8).map((c) => (
                <CountryBar
                  key={c.country_code}
                  label={COUNTRY_LABEL[c.country_code] ?? c.country_code.toUpperCase()}
                  count={c.count}
                  max={stats.coverage.byCountry[0].count}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No agencies discovered yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quota + Recent sweeps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <QuotaWidget />
        </div>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" /> Recent sweeps
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {stats?.sweeps.recent.length ? (
              <div className="space-y-1.5">
                {stats.sweeps.recent.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-[12px] py-1 border-b border-border last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <SweepStatus status={s.status} />
                      <span className="text-muted-foreground truncate">{s.cities.length} cities</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                      <span className="tabular">+<span className="text-primary font-medium">{s.new_agencies}</span> new</span>
                      <span className="text-[10.5px]">{fmtRel(s.created_at)}</span>
                    </div>
                  </div>
                ))}
                <Link to="/sweeps" className="inline-flex items-center text-[12px] text-primary hover:underline mt-1">
                  View sweep history <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sweeps yet — head to the Sweeps tab to run one.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Empty-state nudge for outreach */}
      {stats && stats.outreach.total === 0 && stats.agencies.withPhones > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">Ready to outreach</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {stats.agencies.withPhones.toLocaleString()} agencies have phone numbers — click the
                <PhoneIcon className="inline h-3 w-3 mx-1" /> or
                <Send className="inline h-3 w-3 mx-1" /> icons in the Agencies tab to WhatsApp them.
              </div>
            </div>
            <Link to="/agencies" className="text-sm font-medium text-primary hover:underline">Open agencies →</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, highlight }: { label: string; value: string; sub?: string; icon: typeof Building2; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`h-7 w-7 rounded-md flex items-center justify-center ${highlight ? 'bg-primary text-primary-foreground animate-pulse' : 'bg-primary/10 text-primary'}`}>
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </div>
        </div>
        <div className="text-2xl font-semibold tabular leading-tight">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ProgressRow({
  label, value, total, variant,
}: {
  label: string; value: number; total: number;
  variant: 'success' | 'primary' | 'destructive' | 'muted';
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const colorClass =
    variant === 'success'     ? 'bg-success'     :
    variant === 'destructive' ? 'bg-destructive' :
    variant === 'muted'       ? 'bg-muted-foreground/40' :
                                'bg-primary';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular">
          <span className="text-foreground font-medium">{value.toLocaleString()}</span> / {total.toLocaleString()} <span className="text-[10.5px]">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full transition-all duration-300 ${colorClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function CountryBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span>{label}</span>
        <span className="tabular text-muted-foreground"><span className="text-foreground font-medium">{count.toLocaleString()}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

function SweepStatus({ status }: { status: string }) {
  switch (status) {
    case 'complete': return <Badge variant="success">Done</Badge>;
    case 'running':  return <Badge pulse>Running</Badge>;
    case 'failed':   return <Badge variant="destructive">Failed</Badge>;
    case 'pending':  return <Badge variant="secondary">Queued</Badge>;
    default:         return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtRel(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.round(s/60)}m ago`;
  if (s < 86400) return `${Math.round(s/3600)}h ago`;
  return `${Math.round(s/86400)}d ago`;
}
