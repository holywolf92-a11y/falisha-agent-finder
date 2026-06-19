import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { listSettingsMeta, revealSetting, setSetting } from '../services/settingsService.js';
import { logger } from '../logger.js';

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

// The list of secret keys the Settings UI exposes. Add new providers here.
const SETTING_KEYS = [
  'GOOGLE_PLACES_API_KEY',
  'SNOV_CLIENT_ID',
  'SNOV_CLIENT_SECRET',
  'RAPIDAPI_KEY',
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
] as const;

const setSchema = z.object({ value: z.string().min(1).max(2048) });

// GET /api/settings — list, with masked values
settingsRouter.get('/', async (_req, res) => {
  try {
    const items = await listSettingsMeta([...SETTING_KEYS]);
    return res.json({ settings: items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the real error both in pino's msg field AND in stderr so Railway's
    // log API (which sometimes drops structured fields) catches at least one.
    logger.error({ stack: err instanceof Error ? err.stack : undefined }, `settings_list_failed: ${msg}`);
    console.error('[settings_list_failed]', msg, err instanceof Error ? err.stack : '');
    return res.status(500).json({ error: 'settings_list_failed', detail: msg });
  }
});

// POST /api/settings/:key/reveal — return plaintext for admin (audited)
settingsRouter.post('/:key/reveal', async (req: Request, res) => {
  if (!SETTING_KEYS.includes(String(req.params.key) as (typeof SETTING_KEYS)[number])) {
    return res.status(404).json({ error: 'unknown_key' });
  }
  try {
    const value = await revealSetting(String(req.params.key));
    return res.json({ value: value ?? '' });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'reveal_failed' });
  }
});

// PUT /api/settings/:key — set (encrypted) value
settingsRouter.put('/:key', async (req: Request, res) => {
  if (!SETTING_KEYS.includes(String(req.params.key) as (typeof SETTING_KEYS)[number])) {
    return res.status(404).json({ error: 'unknown_key' });
  }
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

  try {
    await setSetting({
      key: String(req.params.key),
      value: parsed.data.value,
      isSecret: true,
      actorEmail: 'admin',
      ip: req.ip,
      userAgent: req.headers['user-agent']?.toString(),
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'save_failed' });
  }
});
