-- Licensed-agency registries (İŞKUR first; KRAZ / AÜG / LMRA later).
--
-- ADDITIVE ONLY. Safe to run twice. Run in the Supabase SQL editor.
--   • agencies: licence number + issuing authority + permit validity, so the app
--     can show "Licensed by İŞKUR" and filter to licensed agencies.
--   • agency_emails / agency_phones: allow source = 'registry' (contact details
--     published by the licensing authority). Existing rows are untouched — only
--     the allowed-values list grows.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS licence_no          text,
  ADD COLUMN IF NOT EXISTS licence_authority   text,     -- e.g. 'İŞKUR'
  ADD COLUMN IF NOT EXISTS licence_valid_until date,
  ADD COLUMN IF NOT EXISTS licence_checked_at  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS agencies_licence_uq ON agencies (licence_authority, licence_no);
CREATE INDEX IF NOT EXISTS agencies_licence_authority_idx ON agencies (licence_authority);

ALTER TABLE agency_emails DROP CONSTRAINT IF EXISTS agency_emails_source_check;
ALTER TABLE agency_emails ADD CONSTRAINT agency_emails_source_check
  CHECK (source IN ('website_scrape', 'snov', 'hunter', 'manual', 'google_maps', 'pattern_guess', 'registry'));

ALTER TABLE agency_phones DROP CONSTRAINT IF EXISTS agency_phones_source_check;
ALTER TABLE agency_phones ADD CONSTRAINT agency_phones_source_check
  CHECK (source IN ('google_maps', 'website_scrape', 'manual', 'registry'));
