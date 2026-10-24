import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { findWhatsApp, sendTemplate } from '../services/outreachService.js';
import {
  listTemplates,
  isConfigured,
  templatesConfigured,
  defaultTemplateLanguage,
  WhatsAppSendError,
} from '../services/whatsappCloud.js';

export const outreachRouter = Router();
outreachRouter.use(requireAdmin);

// The filter shape shared with the Agencies list (so bulk actions hit the same set).
const filterSchema = z.object({
  q: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  city: z.string().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  enrichmentStatus: z.enum(['not_enriched', 'enriched', 'failed', 'in_progress']).optional(),
  contactable: z.enum(['has', 'whatsapp', 'mobile', 'landline', 'none']).optional(),
});

// GET /api/outreach/config — is WhatsApp wired up? drives the UI's enabled state.
outreachRouter.get('/config', (_req, res) => {
  res.json({
    configured: isConfigured(),
    templatesConfigured: templatesConfigured(),
    defaultLanguage: defaultTemplateLanguage(),
  });
});

// GET /api/outreach/templates — approved templates from the WABA.
outreachRouter.get('/templates', async (_req, res) => {
  try {
    const all = await listTemplates();
    // Surface approved templates first; keep others so the UI can explain why.
    const templates = all.sort((a, b) => (a.status === 'APPROVED' ? -1 : 0) - (b.status === 'APPROVED' ? -1 : 0));
    res.json({ templates, configured: templatesConfigured() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'templates_failed', detail: msg });
  }
});

// POST /api/outreach/find-whatsapp — classify + score (by ids or by filter).
const findSchema = z.object({
  agencyIds: z.array(z.string()).optional(),
  filter: filterSchema.optional(),
});
outreachRouter.post('/find-whatsapp', async (req, res) => {
  const parsed = findSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const summary = await findWhatsApp(parsed.data);
    return res.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'find_whatsapp_failed', detail: msg });
  }
});

// POST /api/outreach/send-template — send to one agency or the filtered set.
const sendSchema = z
  .object({
    agencyId: z.string().optional(),
    filter: filterSchema.optional(),
    templateName: z.string().min(1),
    language: z.string().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((v) => v.agencyId || v.filter, { message: 'agencyId or filter required' });

outreachRouter.post('/send-template', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload', detail: parsed.error.message });
  if (!isConfigured()) return res.status(409).json({ error: 'not_configured', detail: 'WhatsApp Cloud API credentials are not set.' });

  try {
    const summary = await sendTemplate({
      agencyId: parsed.data.agencyId,
      filter: parsed.data.filter,
      templateName: parsed.data.templateName,
      language: parsed.data.language || defaultTemplateLanguage(),
      dryRun: parsed.data.dryRun,
      triggeredBy: 'admin',
    });
    return res.json({ ok: true, summary });
  } catch (err) {
    if (err instanceof WhatsAppSendError) {
      return res.status(502).json({ error: 'send_failed', detail: err.message, code: err.code });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'send_failed', detail: msg });
  }
});
