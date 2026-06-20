import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import {
  scrapeAgencyWebsite, scrapeBatch,
  startAutoScrape, getScrapeRunState, countPending,
} from '../services/websiteScraperService.js';

export const scrapeRouter = Router();
scrapeRouter.use(requireAdmin);

// GET /api/scrape/status — non-blocking peek used by the Agencies page poller
scrapeRouter.get('/status', async (req, res) => {
  try {
    const state = getScrapeRunState();
    // Only count pending when there's no active run — the count query is a
    // little heavy (joins three tables) and isn't useful mid-run.
    const pending = state.active ? null : await countPending();
    return res.json({ ok: true, state, pending });
  } catch (err) {
    return res.status(500).json({ error: 'status_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

const autoSchema = z.object({
  countryCode: z.string().length(2).optional(),
  limit:       z.number().int().min(1).max(1000).optional(),
});

// POST /api/scrape/auto — kick off a background scrape over agencies that
// have a website but no website_scrape artefacts yet. Idempotent: returns
// the current run state instead of starting a second one.
scrapeRouter.post('/auto', async (req, res) => {
  const parsed = autoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const state = await startAutoScrape(parsed.data);
    return res.status(state.active ? 202 : 200).json({ ok: true, state });
  } catch (err) {
    return res.status(500).json({ error: 'auto_scrape_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scrape/agency/:id — scrape a single agency's website (drawer button)
scrapeRouter.post('/agency/:id', async (req, res) => {
  try {
    const r = await scrapeAgencyWebsite(String(req.params.id));
    return res.json({ ok: true, result: r });
  } catch (err) {
    return res.status(500).json({ error: 'scrape_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

const batchSchema = z.object({
  limit:       z.number().int().min(1).max(500).optional(),
  countryCode: z.string().length(2).optional(),
  minRating:   z.number().min(0).max(5).optional(),
});

// POST /api/scrape/batch — scrape websites for many agencies. Refuses to run
// while an auto-scrape is active so two worker pools don't fight over the same
// sites (and so the in-memory runState counters stay coherent).
scrapeRouter.post('/batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  if (getScrapeRunState().active) {
    return res.status(409).json({ error: 'auto_scrape_in_progress', state: getScrapeRunState() });
  }
  try {
    const summary = await scrapeBatch(parsed.data);
    return res.json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ error: 'scrape_batch_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});
