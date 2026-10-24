// Partner-fit score (0-100) for prioritising outreach. Pure + side-effect free
// so the server persists it and the client labels it without disagreement.
// Ported from the summit Lead Finder (score.ts), adapted to the agent-finder's
// normalized contact tables (agency_emails / agency_phones / agency_socials).

export type ScoreTier = 'high' | 'medium' | 'low';

export interface ScoreInputs {
  rating: number | null;
  reviews: number | null;
  website: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWhatsApp: boolean;
  linkedin: string | null; // the linkedin URL, if any (company page scores higher)
  hasFacebook: boolean;
  hasInstagram: boolean;
}

const has = (v: string | null | undefined): boolean => Boolean(v && v.trim());

export function computeScore(p: ScoreInputs): number {
  let s = 0;

  // Reachable contact channels — the core of outreach value.
  if (p.linkedin) s += /\/company\//i.test(p.linkedin) ? 22 : 10;
  if (p.hasEmail) s += 18;
  if (p.hasWhatsApp) s += 10;
  if (p.hasPhone) s += 8;
  if (has(p.website)) s += 5;

  // Credibility — established businesses make better partners.
  const rating = p.rating ?? 0;
  s += rating >= 4.5 ? 12 : rating >= 4 ? 8 : rating >= 3 ? 4 : 0;
  const reviews = p.reviews ?? 0;
  s += reviews >= 200 ? 18 : reviews >= 50 ? 12 : reviews >= 10 ? 6 : reviews > 0 ? 2 : 0;

  // Secondary social presence.
  if (p.hasFacebook) s += 4;
  if (p.hasInstagram) s += 4;

  return Math.min(100, Math.round(s));
}

export function scoreTier(score: number): ScoreTier {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}
