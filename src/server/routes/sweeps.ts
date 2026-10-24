import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { startSweep, listSweeps } from '../services/sweepService.js';
import { SWEEP_COUNTRIES, citiesFor } from '../services/worldCities.js';
import { logger } from '../logger.js';

export const sweepsRouter = Router();
sweepsRouter.use(requireAdmin);

const startSchema = z.object({
  // New country/niche mode
  country:   z.string().length(2).optional(),
  niche:     z.string().optional(),
  allCities: z.boolean().optional(),
  city:      z.string().optional(),
  // Legacy SEED_CITIES mode
  cities:     z.array(z.string()).optional(),
  keywordsEn: z.array(z.string()).optional(),
  keywordsAr: z.array(z.string()).optional(),
});

// Country catalogue for the sweep dialog (code, name, flag, #cities we can tile).
sweepsRouter.get('/countries', (_req, res) => {
  res.json({ countries: SWEEP_COUNTRIES.map((c) => ({ ...c, cities: citiesFor(c.code).length })) });
});

sweepsRouter.get('/', async (_req, res) => {
  try {
    const sweeps = await listSweeps(50);
    return res.json({ sweeps });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'list_failed' });
  }
});

sweepsRouter.post('/', async (req, res) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const progress = await startSweep({ ...parsed.data, triggeredBy: 'admin' });
    return res.json(progress);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'sweep_start_failed');
    return res.status(500).json({ error: err instanceof Error ? err.message : 'start_failed' });
  }
});
