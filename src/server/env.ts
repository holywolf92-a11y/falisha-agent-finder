import 'dotenv/config';
import { z } from 'zod';

// Boot-time env validation. Fail loud and early if anything required is missing
// so a misconfigured Railway service never silently runs with stale defaults.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Auth — bcrypt hash of the admin password + HMAC secret for session cookies
  ADMIN_PASSWORD_HASH: z.string().min(20, 'ADMIN_PASSWORD_HASH must be a bcrypt hash (use `npm run hash-password`)'),
  ADMIN_SESSION_SECRET: z.string().min(32, 'ADMIN_SESSION_SECRET must be at least 32 chars of entropy (openssl rand -hex 32)'),
  SESSION_COOKIE_NAME: z.string().default('faf_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60),

  // Supabase (server-side only)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Master encryption key for settings table (AES-256-GCM)
  APP_SETTINGS_MASTER_KEY: z.string().optional(),

  // CORS: comma-separated list of allowed origins; leave empty to allow same-origin only
  CORS_ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
