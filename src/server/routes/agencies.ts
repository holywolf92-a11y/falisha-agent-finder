import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { db } from '../db.js';

export const agenciesRouter = Router();
agenciesRouter.use(requireAdmin);

const querySchema = z.object({
  q:        z.string().optional(),
  country:  z.string().optional(),
  category: z.string().optional(),
  page:     z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

agenciesRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
  const { q, country, category, page, pageSize } = parsed.data;

  let qb = db()
    .from('agencies')
    .select(
      'id, name, country_code, city, address, category, website, rating, review_count, business_status, enrichment_status, last_sweep_at',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('rating', { ascending: false, nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (country)  qb = qb.eq('country_code', country.toLowerCase());
  if (category) qb = qb.eq('category', category);
  if (q && q.trim()) {
    const term = q.trim().replace(/[%,()]/g, ' ');
    qb = qb.or(`name.ilike.%${term}%,address.ilike.%${term}%`);
  }

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
