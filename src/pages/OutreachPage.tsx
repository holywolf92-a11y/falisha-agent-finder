import { Card, CardContent } from '@/components/ui/card';
import { Send } from 'lucide-react';

export function OutreachPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
        <p className="text-sm text-muted-foreground mt-1">WhatsApp, email and LinkedIn touchpoints across discovered agencies.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Send className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-base font-medium">No outreach yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Run a sweep first, then send your first intro from an agency drawer.</p>
        </CardContent>
      </Card>
    </div>
  );
}
