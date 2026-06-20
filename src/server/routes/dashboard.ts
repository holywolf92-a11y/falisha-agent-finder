import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { getDashboardStats } from '../services/dashboardService.js';
import { logger } from '../logger.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin);

dashboardRouter.get('/stats', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    return res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, `dashboard_stats_failed: ${msg}`);
    return res.status(500).json({ error: 'dashboard_stats_failed', detail: msg });
  }
});
