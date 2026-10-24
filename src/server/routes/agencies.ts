import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { db } from '../db.js';
import { applyAgencyFilters } from '../services/agencyFilters.js';

export const agenciesRouter = Router();
agenciesRouter.use(requireAdmin);

const querySchema = z.object({
  q:                z.string().optional(),
  country:          z.string().optional(),
  category:         z.string().optional(),
  city:             z.string().optional(),
  minRating:        z.coerce.number().min(0).max(5).optional(),
  minReviews:       z.coerce.number().int().min(0).optional(),
  minScore:         z.coerce.number().int().min(0).max(100).optional(),
  enrichmentStatus: z.enum(['not_enriched', 'enriched', 'failed', 'in_progress']).optional(),
  contactable:      z.enum(['has', 'whatsapp', 'mobile', 'landline', 'none']).optional(),
  stage:            z.enum(['new', 'contacted', 'replied', 'interested', 'not_interested', 'converted']).optional(),
  sort:             z.enum(['rating', 'score', 'recent']).default('rating'),
  page:             z.coerce.number().int().min(0).default(0),
  pageSize:         z.coerce.number().int().min(1).max(200).default(50),
});

agenciesRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
  const { sort, page, pageSize, ...filter } = parsed.data;

  // Embed phones + socials inline so the Agencies table can show contact info
  // without one extra round-trip per row. Supabase resource embedding does the
  // JOIN server-side; the response shape is `{ ..., agency_phones: [...],
  // agency_socials: [...] }`. The outreach fields (score, wa_phone, …) drive the
  // partner-fit column, the contactable filter and the Send-template targeting.
  let qb = db()
    .from('agencies')
    .select(
      `id, name, country_code, city, address, category, website,
       rating, review_count, business_status, enrichment_status, last_sweep_at,
       score, score_tier, wa_phone, primary_phone_type, outreach_stage,
       last_template_sent_at, template_send_count, wa_undeliverable_at,
       agency_phones (phone, phone_type),
       agency_emails (email),
       agency_socials (platform, url)`,
      { count: 'exact' },
    )
    .is('deleted_at', null);

  qb = applyAgencyFilters(qb, filter);

  if (sort === 'score') {
    qb = qb.order('score', { ascending: false, nullsFirst: false });
  } else if (sort === 'recent') {
    qb = qb.order('last_sweep_at', { ascending: false, nullsFirst: false });
  } else {
    // Rating then review_count so a 4.5★ × 200-review agency outranks a 5★ × 1.
    qb = qb.order('rating', { ascending: false, nullsFirst: false }).order('review_count', { ascending: false });
  }

  qb = qb.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await qb;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ agencies: data ?? [], total: count ?? 0, page, pageSize });
});

agenciesRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const sb = db();
  const [
    agency,
    emails,
    phones,
    socials,
    reviews,
    outreach,
  ] = await Promise.all([
    sb.from('agencies').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    sb.from('agency_emails').select('*').eq('agency_id', id),
    sb.from('agency_phones').select('*').eq('agency_id', id),
    sb.from('agency_socials').select('*').eq('agency_id', id),
    sb.from('agency_reviews').select('*').eq('agency_id', id).order('posted_at', { ascending: false }).limit(20),
    sb.from('agency_outreach').select('*').eq('agency_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (agency.error) return res.status(500).json({ error: agency.error.message });
  if (!agency.data) return res.status(404).json({ error: 'not_found' });
  return res.json({
    agency: agency.data,
    emails: emails.data ?? [],
    phones: phones.data ?? [],
    socials: socials.data ?? [],
    reviews: reviews.data ?? [],
    outreach: outreach.data ?? [],
  });
});

// PATCH /api/agencies/:id — update the CRM pipeline stage / notes.
const patchSchema = z.object({
  outreach_stage: z.enum(['new', 'contacted', 'replied', 'interested', 'not_interested', 'converted']).optional(),
  outreach_notes: z.string().max(5000).optional(),
});
agenciesRouter.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.outreach_stage) updates.outreach_stage_at = new Date().toISOString();
  if (Object.keys(updates).length === 0) return res.json({ ok: true });
  const { error } = await db().from('agencies').update(updates).eq('id', String(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});
