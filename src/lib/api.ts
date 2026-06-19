// Tiny typed fetch helper. Includes credentials so the HMAC session cookie
// (set by /api/auth/login) is sent automatically with every API call. Throws
// a structured Error on non-2xx so React Query can categorize failures.

const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api';

class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string')
        ? (parsed as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, parsed, message);
  }
  return parsed as T;
}

export const api = {
  get:    <T = unknown>(path: string)                => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown) => request<T>('POST',   path, body),
  patch:  <T = unknown>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string)                => request<T>('DELETE', path),
};

export { ApiError };
