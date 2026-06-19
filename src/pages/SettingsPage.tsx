import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage API keys, sweep defaults, and appearance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> API keys</CardTitle>
          <CardDescription>Provider credentials used by sweeps and enrichment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Encrypted-at-rest settings are being wired in the next phase. For now keys live in Railway env vars.</p>
        </CardContent>
      </Card>
    </div>
  );
}
