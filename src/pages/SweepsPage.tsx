import { Card, CardContent } from '@/components/ui/card';
import { Radar } from 'lucide-react';

export function SweepsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sweeps</h1>
        <p className="text-sm text-muted-foreground mt-1">Discovery runs across Gulf cities × recruitment-agency keywords.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Radar className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-base font-medium">No sweeps run yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Configure the Google Maps API key in Settings, then start a sweep.</p>
        </CardContent>
      </Card>
    </div>
  );
}
