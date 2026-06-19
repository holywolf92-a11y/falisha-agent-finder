import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'falisha-agent-finder',
    ts: new Date().toISOString(),
  });
});
