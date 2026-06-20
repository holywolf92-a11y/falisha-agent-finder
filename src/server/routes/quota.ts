import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { getAllQuotas } from '../services/quotaService.js';

export const quotaRouter = Router();
quotaRouter.use(requireAdmin);

quotaRouter.get('/', async (_req, res) => {
  try {
    const quotas = await getAllQuotas();
    return res.json({ quotas });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'quota_failed' });
  }
});
