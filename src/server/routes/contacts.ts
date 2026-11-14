import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import {
  contactsTableReady, listContacts, removeContact, hunterForAgency,
  previewHunterBatch, startHunterBatch, getHunterRunState,
  lushaPreview, lushaReveal, MigrationMissingError,
} from '../services/contactsService.js';
import { isHunterConfigured, hunterAccount, HunterError } from '../services/hunterService.js';
import { isLushaConfigured, lushaUsage, LushaError } from '../services/lushaService.js';

export const contactsRouter = Router();
contactsRouter.use(requireAdmin);

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
  stage: z.enum(['new', 'contacted', 'replied', 'interested', 'not_interested', 'converted']).optional(),
  relevance: z.enum(['visible', 'recruitment', 'review', 'not_recruitment', 'all']).optional(),
  step: z.enum(['check', 'contact', 'followup', 'partners']).optional(),
});

function fail(res: import('express').Response, err: unknown, fallback: string) {
  if (err instanceof MigrationMissingError) return res.status(409).json({ error: 'migration_missing', detail: err.message });
  if (err instanceof HunterError) {
    const status = err.status === 412 ? 409 : err.status === 401 || err.status === 429 || err.status === 403 ? err.status : 502;
    return res.status(status).json({ error: 'hunter_failed', detail: err.message });
  }
  if (err instanceof LushaError) {
    const status = err.status === 412 ? 409 : [400, 401, 402, 429].includes(err.status) ? err.status : 502;
    return res.status(status).json({ error: 'lusha_failed', detail: err.message });
  }
  return res.status(500).json({ error: fallback, detail: err instanceof Error ? err.message : String(err) });
}

// GET /api/contacts/config — which providers are configured + live balances.
contactsRouter.get('/config', async (_req, res) => {
  const [ready, hOk, lOk] = await Promise.all([
    contactsTableReady().catch(() => false), isHunterConfigured(), isLushaConfigured(),
  ]);
  const [hunter, lusha] = await Promise.all([
    hOk ? hunterAccount().then((a) => ({ ok: true as const, ...a })).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })) : null,
    lOk ? lushaUsage().then((u) => ({ ok: true as const, ...u })).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })) : null,
  ]);
  res.json({
    tableReady: ready,
    hunter: { configured: hOk, account: hunter },
    lusha: { configured: lOk, usage: lusha },
  });
});

// GET /api/contacts/agency/:id — people saved for one agency (drawer).
contactsRouter.get('/agency/:id', async (req, res) => {
  try {
    return res.json(await listContacts(String(req.params.id)));
  } catch (err) { return fail(res, err, 'list_failed'); }
});

// DELETE /api/contacts/:id — remove a person (keeps a suppression stub).
contactsRouter.delete('/:id', async (req, res) => {
  try {
    await removeContact(String(req.params.id));
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, 'remove_failed'); }
});

// POST /api/contacts/hunter/agency/:id — Hunter domain search for one agency.
contactsRouter.post('/hunter/agency/:id', async (req, res) => {
  const force = req.body?.force === true;
  try {
    return res.json({ ok: true, result: await hunterForAgency(String(req.params.id), { force }) });
  } catch (err) { return fail(res, err, 'hunter_failed'); }
});

const batchSchema = z.object({
  filter: filterSchema.optional(),
  agencyIds: z.array(z.string()).max(500).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  force: z.boolean().optional(),
});

// POST /api/contacts/hunter/preview — dry run for the confirm dialog.
contactsRouter.post('/hunter/preview', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    return res.json({ ok: true, preview: await previewHunterBatch(parsed.data) });
  } catch (err) { return fail(res, err, 'preview_failed'); }
});

// POST /api/contacts/hunter/run — background batch over the filtered set.
contactsRouter.post('/hunter/run', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  if (!(await isHunterConfigured())) return res.status(409).json({ error: 'not_configured', detail: 'Add HUNTER_API_KEY in Settings first.' });
  try {
    const state = await startHunterBatch(parsed.data);
    return res.status(202).json({ ok: true, state });
  } catch (err) { return fail(res, err, 'run_failed'); }
});

// GET /api/contacts/hunter/status — progress for the poller.
contactsRouter.get('/hunter/status', (_req, res) => {
  res.json({ ok: true, state: getHunterRunState() });
});

const lushaPreviewSchema = z.object({
  agencyId: z.string().min(1),
  allRoles: z.boolean().optional(),
  max: z.number().int().min(1).max(10).optional(),
});

// POST /api/contacts/lusha/preview — who Lusha has at this agency (costs ~1 credit per person found).
contactsRouter.post('/lusha/preview', async (req, res) => {
  const parsed = lushaPreviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const { agencyId, ...opts } = parsed.data;
    return res.json({ ok: true, ...(await lushaPreview(agencyId, opts)) });
  } catch (err) { return fail(res, err, 'lusha_preview_failed'); }
});

const lushaRevealSchema = z.object({
  agencyId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(25),
  reveal: z.array(z.enum(['phones', 'emails'])).min(1).optional(),
});

// POST /api/contacts/lusha/reveal — reveal phones (± emails) for the chosen people.
contactsRouter.post('/lusha/reveal', async (req, res) => {
  const parsed = lushaRevealSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const r = await lushaReveal(parsed.data.agencyId, parsed.data.ids, parsed.data.reveal ?? ['phones']);
    return res.json({ ok: true, result: r });
  } catch (err) { return fail(res, err, 'lusha_reveal_failed'); }
});
