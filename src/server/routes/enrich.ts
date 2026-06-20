import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { enrichAgency, enrichBatch } from '../services/enrichmentService.js';

export const enrichRouter = Router();
enrichRouter.use(requireAdmin);

// POST /api/enrich/agency/:id — enrich a single agency (drawer button)
enrichRouter.post('/agency/:id', async (req, res) => {
  try {
    const wrote = await enrichAgency(String(req.params.id));
    return res.json({ ok: true, hadData: wrote });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'enrich_failed', detail: msg });
  }
});

const batchSchema = z.object({
  limit:       z.number().int().min(1).max(1000).optional(),
  countryCode: z.string().length(2).optional(),
  minRating:   z.number().min(0).max(5).optional(),
  minReviews:  z.number().int().min(0).optional(),
});

// POST /api/enrich/batch — drain N un-enriched agencies
enrichRouter.post('/batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const summary = await enrichBatch(parsed.data);
    return res.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'enrich_batch_failed', detail: msg });
  }
});
