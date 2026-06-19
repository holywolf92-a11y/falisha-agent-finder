import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

type SessionState = {
  authenticated: boolean;
  loading: boolean;
  loginAt?: string | null;
  error?: string;
};

let cached: SessionState | null = null;
const subscribers = new Set<(s: SessionState) => void>();

function publish(next: SessionState) {
  cached = next;
  subscribers.forEach((fn) => fn(next));
}

async function fetchSession(): Promise<SessionState> {
  try {
    const data = await api.get<{ authenticated: boolean; loginAt?: string | null }>('/auth/session');
    return { authenticated: !!data.authenticated, loading: false, loginAt: data.loginAt ?? null };
  } catch {
    return { authenticated: false, loading: false };
  }
}

/**
 * Single source of truth for the admin's logged-in state across the SPA.
 * Subscribes to a module-level cache so multiple components don't refetch
 * /auth/session in parallel on first paint.
 */
export function useAuth() {
  const [state, setState] = useState<SessionState>(
    cached ?? { authenticated: false, loading: true },
  );

  useEffect(() => {
    subscribers.add(setState);
    if (!cached) {
      void fetchSession().then(publish);
    } else if (cached.loading) {
      void fetchSession().then(publish);
    }
    return () => { subscribers.delete(setState); };
  }, []);

  const login = useCallback(async (password: string) => {
    publish({ ...(cached ?? { authenticated: false, loading: false }), loading: true });
    try {
      await api.post('/auth/login', { password });
      const next = await fetchSession();
      publish(next);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      publish({ authenticated: false, loading: false, error: message });
      return { ok: false, error: message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch { /* idempotent */ }
    publish({ authenticated: false, loading: false });
  }, []);

  return { ...state, login, logout };
}
