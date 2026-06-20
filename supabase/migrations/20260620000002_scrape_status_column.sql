-- ============================================================================
-- Scrape state machine on agencies
-- Replaces the brief "marker row in agency_socials" pattern with a proper
-- column. The marker approach (a) capped silently at Supabase's 1000-row
-- default for SELECT, breaking the pending-detector beyond ~1000 scraped
-- sites; (b) showed up as a duplicate "Website" pill in the agency drawer;
-- (c) accumulated stale rows when an agency's canonical URL changed.
--
-- One column on agencies fixes all three with a single indexed lookup.
-- Backfills existing data so nothing is re-scraped after deploy.
-- ============================================================================

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS scrape_status text NOT NULL DEFAULT 'not_scraped'
    CHECK (scrape_status IN ('not_scraped','in_progress','scraped','no_data','failed','no_website')),
  ADD COLUMN IF NOT EXISTS scrape_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS scrape_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scrape_error text;

-- Partial index — small (only "not_scraped" rows), powers the auto-scrape's
-- "what's pending" hot path.
CREATE INDEX IF NOT EXISTS agencies_pending_scrape_idx
  ON agencies (rating DESC NULLS LAST, review_count DESC)
  WHERE scrape_status = 'not_scraped'
    AND website IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agencies_scrape_status_idx
  ON agencies (scrape_status);

-- ── Backfill 1: agencies with no website at all → no_website
UPDATE agencies SET scrape_status = 'no_website'
WHERE scrape_status = 'not_scraped' AND website IS NULL;

-- ── Backfill 2: anything that already has website_scrape artefacts → scraped
UPDATE agencies SET
  scrape_status = 'scraped',
  scrape_attempted_at = COALESCE(scrape_attempted_at, now()),
  scrape_completed_at = COALESCE(scrape_completed_at, now())
WHERE scrape_status = 'not_scraped'
  AND id IN (
    SELECT DISTINCT agency_id FROM agency_emails  WHERE source = 'website_scrape'
    UNION
    SELECT DISTINCT agency_id FROM agency_socials WHERE source = 'website_scrape'
    UNION
    SELECT DISTINCT agency_id FROM agency_phones  WHERE source = 'website_scrape'
  );

-- ── Cleanup: drop the short-lived "website-platform marker" rows from
-- agency_socials. They were never meant to be user-visible and the drawer
-- was rendering them as duplicate "Website" chips.
DELETE FROM agency_socials
WHERE platform = 'website' AND source = 'website_scrape';

COMMENT ON COLUMN agencies.scrape_status        IS 'Website-scrape state machine: not_scraped|in_progress|scraped|no_data|failed|no_website.';
COMMENT ON COLUMN agencies.scrape_attempted_at  IS 'When the most recent scrape ATTEMPT started.';
COMMENT ON COLUMN agencies.scrape_completed_at  IS 'When the most recent scrape attempt finished (any outcome).';
COMMENT ON COLUMN agencies.scrape_error         IS 'Short error string from the most recent failed scrape, if any.';
