-- Decision-maker contacts (Hunter.io HR emails + Lusha mobile numbers).
--
-- ADDITIVE ONLY: one new table + new nullable/defaulted columns on agencies.
-- Safe to run twice (IF NOT EXISTS everywhere). Run in the Supabase SQL editor.
--
-- Why a separate table (not agency_emails / agency_phones): those hold
-- COMPANY-level contact points (info@, the switchboard). These rows are named
-- PEOPLE (HR manager, owner) — personal data under GDPR/KVKK/PDPL — with their
-- own provenance, do-not-call and EU flags. Keeping them apart also means the
-- WhatsApp template sender (which reads agencies.wa_phone / agency_phones)
-- can never pick up a purchased mobile by accident: messaging a person on
-- WhatsApp still requires their opt-in.

CREATE TABLE IF NOT EXISTS agency_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source            text NOT NULL CHECK (source IN ('hunter', 'lusha', 'manual')),
  external_id       text,                 -- Lusha contact id (re-enrich is free once revealed)

  full_name         text,
  first_name        text,
  last_name         text,
  position          text,
  department        text,
  seniority         text,
  is_decision_maker boolean,

  email             text,
  email_normalized  text,
  email_type        text,                 -- hunter: personal|generic · lusha: work|private|unknown
  email_confidence  smallint,             -- hunter 0-100 (lusha grades map to null)
  email_status      text,                 -- hunter verification: valid|accept_all|unknown|invalid

  phones            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{number,type,doNotCall}] as returned
  mobile            text,                 -- first phone with type=mobile (E.164 as given)
  do_not_call       boolean NOT NULL DEFAULT false,

  linkedin_url      text,
  country_code      text,
  is_eu_contact     boolean,              -- lusha location.isEuContact — GDPR handling applies

  raw               jsonb,
  found_at          timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS agency_contacts_agency_idx ON agency_contacts (agency_id);
-- Plain (non-partial) unique indexes: Postgres treats NULLs as distinct, so
-- rows without an email / external id never collide, and PostgREST upserts
-- can target these (they cannot target partial indexes).
CREATE UNIQUE INDEX IF NOT EXISTS agency_contacts_email_uq
  ON agency_contacts (agency_id, email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS agency_contacts_external_uq
  ON agency_contacts (agency_id, source, external_id);

ALTER TABLE agency_contacts ENABLE ROW LEVEL SECURITY;  -- service-role only, like every other table here

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS contacts_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobiles_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hunter_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS hunter_status       text,      -- found|none|no_domain|error
  ADD COLUMN IF NOT EXISTS lusha_checked_at    timestamptz;
