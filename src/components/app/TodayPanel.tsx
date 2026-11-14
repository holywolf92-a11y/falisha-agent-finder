// Home → "What to do today": the four working steps as plain to-dos, each linking
// straight into that step on the Partner agencies page.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Send, MessageSquare, Handshake, ChevronRight, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { StepSummary } from '@/components/app/AgencySteps';

type AutomationStatus = {
  running: { startedAt: string } | null;
  last: { finishedAt: string | null; reviewDecided: { recruitment: number; not_recruitment: number }; whatsappChecked: number; scrapeStarted: number } | null;
};

function ago(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

export function TodayPanel() {
  const [s, setS] = useState<StepSummary | null>(null);
  const [auto, setAuto] = useState<AutomationStatus | null>(null);
  useEffect(() => {
    api.get<StepSummary>('/agencies/summary').then(setS).catch(() => setS(null));
    api.get<AutomationStatus>('/agencies/automation').then(setAuto).catch(() => setAuto(null));
  }, []);

  const todo = [
    { step: 'check',    icon: ListChecks,    n: s?.check,    text: 'agencies to check', sub: 'Confirm the real recruitment agencies, hide the rest', cta: 'Start checking' },
    { step: 'contact',  icon: Send,          n: s?.contact,  text: 'agencies ready to contact', sub: "Confirmed agencies you haven't contacted yet", cta: 'Contact them' },
    { step: 'followup', icon: MessageSquare, n: s?.followup, text: 'conversations to follow up', sub: 'Contacted or replied — waiting on a next move', cta: 'Follow up' },
    { step: 'partners', icon: Handshake,     n: s?.partners, text: 'partners', sub: 'Interested or signed', cta: 'View partners' },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-base font-semibold">What to do today</div>
            <div className="text-[12.5px] text-muted-foreground">Find agencies → check them → contact them → follow up until they become partners.</div>
          </div>
          {auto && (
            <div className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${auto.running ? 'animate-spin' : ''}`} />
              {auto.running
                ? 'Background tasks running now'
                : auto.last?.finishedAt ? `Background tasks last ran ${ago(auto.last.finishedAt)}` : 'Background tasks run automatically every day'}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {todo.map((t) => (
            <Link key={t.step} to={`/agencies?step=${t.step}`}
              className="group flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 hover:bg-muted/50 transition-colors">
              <t.icon className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm"><span className="text-lg font-semibold tabular">{t.n == null ? '…' : t.n.toLocaleString()}</span> {t.text}</div>
                <div className="text-[12px] text-muted-foreground truncate">{t.sub}</div>
              </div>
              <span className="text-[12px] text-primary inline-flex items-center gap-0.5 shrink-0">{t.cta} <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
