import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Send, MapPin, Radar } from 'lucide-react';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of discovered agencies, sweep activity, and outreach status.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total agencies"     value="0" icon={Building2} />
        <Stat label="Cities covered"     value="0" icon={MapPin} />
        <Stat label="Outreach sent"      value="0" icon={Send} />
        <Stat label="Sweeps this month"  value="0" icon={Radar} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Add your Google Maps API key in <span className="text-foreground">Settings</span>.</p>
          <p>2. Run your first sweep from the <span className="text-foreground">Sweeps</span> page.</p>
          <p>3. Browse the discovered agencies in <span className="text-foreground">Agencies</span> and start reaching out.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Building2 }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1 tabular">{value}</div>
        </div>
        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
      </CardContent>
    </Card>
  );
}
