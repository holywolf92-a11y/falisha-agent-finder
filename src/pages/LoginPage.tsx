import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Radar, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true); setErr(null);
    const { ok, error } = await login(password);
    setBusy(false);
    if (!ok) {
      setErr(error ?? 'Incorrect password');
      setShake((n) => n + 1);
      setPassword('');
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle radial accent behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.08)_0%,transparent_70%)]"
      />

      <motion.div
        key={shake}
        animate={err ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm relative"
      >
        <Card className="border-border/60 backdrop-blur-sm shadow-2xl shadow-primary/5">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center">
                <Radar className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Falisha</div>
                <div className="text-sm font-semibold leading-none">Agent Finder</div>
              </div>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Internal tool, single-admin access.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  className="h-10 font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                {err && (
                  <p className="text-xs font-medium text-destructive flex items-center gap-1.5 pt-0.5">
                    <span className="h-1 w-1 rounded-full bg-destructive" />
                    {err}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={busy || !password} className="w-full h-10">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Secured with rate-limited login &amp; per-session HMAC cookies.
        </p>
      </motion.div>
    </div>
  );
}
