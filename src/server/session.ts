import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response } from 'express';
import { env, isProduction } from './env.js';

const secret = new TextEncoder().encode(env.ADMIN_SESSION_SECRET);

type SessionClaims = {
  sub: 'admin';
  auth_time: number;  // unix seconds — when the user actually proved password
  iat: number;
  exp: number;
};

const ISS = 'falisha-agent-finder';
const AUD = 'admin';
const ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60; // hard cap regardless of activity

/**
 * Issue a fresh session JWT and set it as an httpOnly cookie. Called on
 * successful login AND on rolling re-issue inside requireAdmin.
 */
export async function setSession(res: Response, opts: { authTime?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const authTime = opts.authTime ?? now;

  const token = await new SignJWT({ auth_time: authTime })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setSubject('admin')
    .setIssuedAt(now)
    .setExpirationTime(now + env.SESSION_TTL_SECONDS)
    .sign(secret);

  res.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: env.SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export async function verifySession(req: Request): Promise<SessionClaims | null> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISS, audience: AUD });
    if (payload.sub !== 'admin') return null;

    const claims = payload as unknown as SessionClaims;
    // Reject if the original authentication happened too long ago, regardless
    // of how recently we rolled the cookie.
    const now = Math.floor(Date.now() / 1000);
    if (claims.auth_time && now - claims.auth_time > ABSOLUTE_TTL_SECONDS) return null;
    return claims;
  } catch {
    return null;
  }
}
