import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env, isProduction } from '../env.js';
import { clearSession, setSession, verifySession } from '../session.js';
import { logger } from '../logger.js';

export const authRouter = Router();

// ─── rate limit ────────────────────────────────────────────────────────────
// 5 attempts per IP per 15 min, then 401 with retry-after. Absolute lockout
// to defeat residential proxy rotation is enforced server-wide in v2 once we
// have Redis.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

// CSRF belt-and-braces: SameSite=Lax stops most cross-site POSTs anyway, but
// we additionally reject any /auth/login that doesn't carry a matching Origin
// header (browsers always send Origin on POST). Same-origin same-domain calls
// have no Origin header in some clients — allow those through.
authRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'POST') return next();
  const origin = req.headers.origin;
  const allowed = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.length > 0 && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'bad_origin' });
  }
  return next();
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

  const ok = await bcrypt.compare(parsed.data.password, env.ADMIN_PASSWORD_HASH);
  logger.info({
    event: 'login_attempt',
    success: ok,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
  }, ok ? 'login_ok' : 'login_failed');

  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  await setSession(res);
  return res.json({ ok: true });
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearSession(res);
  return res.json({ ok: true });
});

// ─── GET  /api/auth/session — bootstrap check for the SPA ──────────────────
authRouter.get('/session', async (req: Request, res: Response) => {
  const claims = await verifySession(req);
  if (!claims) return res.json({ authenticated: false });

  // Rolling refresh: if cookie was issued >24h ago, mint a fresh one preserving
  // auth_time (so the absolute 30d cap still bites at the right moment).
  const now = Math.floor(Date.now() / 1000);
  if (now - claims.iat > 24 * 60 * 60) {
    await setSession(res, { authTime: claims.auth_time });
  }
  return res.json({
    authenticated: true,
    loginAt: new Date(claims.auth_time * 1000).toISOString(),
  });
});

// ─── requireAdmin middleware (exported for routes added in later phases) ───
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const claims = await verifySession(req);
  if (!claims) return res.status(401).json({ error: 'unauthorized' });

  const now = Math.floor(Date.now() / 1000);
  if (now - claims.iat > 24 * 60 * 60) {
    await setSession(res, { authTime: claims.auth_time });
  }
  // Tiny shim so route handlers can access auth context if needed
  (req as Request & { admin?: { authTime: number } }).admin = { authTime: claims.auth_time };
  return next();
}

// Suppress unused import warning in non-prod codepaths
void isProduction;
