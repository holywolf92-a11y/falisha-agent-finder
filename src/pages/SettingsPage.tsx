import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

type Setting = {
  key: string;
  isSecret: boolean;
  hasValue: boolean;
  maskedValue: string;
  source: 'db' | 'env' | 'empty';
  description: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

const KEY_LABELS: Record<string, { label: string; placeholder: string; group: string }> = {
  GOOGLE_PLACES_API_KEY: {
    label: 'Google Maps Places API',
    placeholder: 'AIzaSy…',
    group: 'Google Maps',
  },
  SNOV_CLIENT_ID:        { label: 'Snov.io — Client ID',        placeholder: '00c0db…', group: 'Email enrichment' },
  SNOV_CLIENT_SECRET:    { label: 'Snov.io — Client Secret',    placeholder: '670ee4…', group: 'Email enrichment' },
  RAPIDAPI_KEY:          { label: 'RapidAPI / JSearch key',     placeholder: '9859f3…', group: 'Job boards' },
  ADZUNA_APP_ID:         { label: 'Adzuna — App ID',            placeholder: '6154b3…', group: 'Job boards' },
  ADZUNA_APP_KEY:        { label: 'Adzuna — App Key',           placeholder: 'ad817b…', group: 'Job boards' },
};

export function SettingsPage() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setLoading(true);
      const data = await api.get<{ settings: Setting[] }>('/settings');
      setItems(data.settings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const grouped: Record<string, Setting[]> = {};
  for (const it of items) {
    const group = KEY_LABELS[it.key]?.group ?? 'Other';
    (grouped[group] ??= []).push(it);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          API keys are encrypted (AES-256-GCM) at rest. Update anytime — no redeploy needed.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([group, settings]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> {group}
              </CardTitle>
              <CardDescription>
                {group === 'Google Maps' && 'Powers the agency discovery sweep across Gulf cities.'}
                {group === 'Email enrichment' && 'Verifies and discovers contact emails for discovered agencies.'}
                {group === 'Job boards' && 'Optional — feeds the parallel job-board sweep in your main portal.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.map((s) => <SettingRow key={s.key} setting={s} onSaved={reload} />)}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function SettingRow({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const cfg = KEY_LABELS[setting.key] ?? { label: setting.key, placeholder: '', group: 'Other' };
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function onReveal() {
    if (revealed !== null) { setRevealed(null); return; }
    try {
      const r = await api.post<{ value: string }>(`/settings/${setting.key}/reveal`);
      setRevealed(r.value || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reveal');
    }
  }

  async function onSave() {
    if (!value) return;
    setBusy(true);
    try {
      await api.post(`/settings/${setting.key}`, undefined); // ensure routed via PUT below
    } catch { /* fall through to real save */ }
    try {
      // PUT via the api helper
      const res = await fetch(`/api/settings/${encodeURIComponent(setting.key)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const err = j && typeof j === 'object' && 'error' in j ? String((j as { error: string }).error) : `HTTP ${res.status}`;
        throw new Error(err);
      }
      toast.success(`${cfg.label} saved`);
      setEditing(false); setValue(''); setRevealed(null);
      onSaved();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[13px]">{cfg.label}</Label>
        <SourceBadge source={setting.source} hasValue={setting.hasValue} />
      </div>

      {editing ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={cfg.placeholder}
            className="font-mono h-9"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => setShow((s) => !s)} className="shrink-0">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button type="button" onClick={onSave} disabled={busy || !value} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setEditing(false); setValue(''); }} disabled={busy} className="shrink-0">
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex-1 h-9 px-3 rounded-md border border-input bg-muted/30 flex items-center font-mono text-[13px] text-muted-foreground">
            {setting.hasValue
              ? (revealed !== null ? revealed : setting.maskedValue || '••••')
              : <span className="italic">not set</span>}
          </div>
          {setting.hasValue && (
            <Button type="button" variant="ghost" size="icon" onClick={onReveal} title={revealed !== null ? 'Hide' : 'Reveal'}>
              {revealed !== null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {setting.hasValue ? 'Edit' : 'Add'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source, hasValue }: { source: Setting['source']; hasValue: boolean }) {
  if (!hasValue) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] text-muted-foreground border border-border">
        <X className="h-2.5 w-2.5" /> empty
      </span>
    );
  }
  if (source === 'db') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] text-primary bg-primary/10 border border-primary/30">
        <Check className="h-2.5 w-2.5" /> stored
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] text-warning bg-warning/10 border border-warning/30">
      <AlertTriangle className="h-2.5 w-2.5" /> env fallback
    </span>
  );
}
