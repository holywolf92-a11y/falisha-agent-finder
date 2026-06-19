import { Card, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

export function AgenciesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agencies</h1>
        <p className="text-sm text-muted-foreground mt-1">Recruitment agencies discovered from Google Maps.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Building2 className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-base font-medium">No agencies yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Run your first sweep to discover Gulf recruitment agencies.</p>
        </CardContent>
      </Card>
    </div>
  );
}
