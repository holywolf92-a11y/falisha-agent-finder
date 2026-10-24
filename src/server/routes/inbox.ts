import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { listAgencyInbox, getAgencyThread, sendReply } from '../services/inboxService.js';
import { isConfigured } from '../services/whatsappCloud.js';

export const inboxRouter = Router();
inboxRouter.use(requireAdmin);

// GET /api/inbox — agency conversations (those with a WhatsApp thread).
inboxRouter.get('/', async (_req, res) => {
  try {
    const conversations = await listAgencyInbox();
    return res.json({ conversations });
  } catch (err) {
    return res.status(500).json({ error: 'inbox_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/inbox/:agencyId — full thread for one agency.
inboxRouter.get('/:agencyId', async (req, res) => {
  try {
    const thread = await getAgencyThread(String(req.params.agencyId));
    return res.json(thread);
  } catch (err) {
    return res.status(500).json({ error: 'thread_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/inbox/:agencyId/reply — free-form reply inside the 24h window.
const replySchema = z.object({ text: z.string().min(1).max(4000) });
inboxRouter.post('/:agencyId/reply', async (req, res) => {
  if (!isConfigured()) return res.status(409).json({ error: 'not_configured' });
  const parsed = replySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const result = await sendReply(String(req.params.agencyId), parsed.data.text);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: 'reply_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});
